// =============================================================
// /schedule-editor/ Phase D: 論理削除 + ゴミ箱 + 復元
// =============================================================
//
// 機能:
//   - メールアドレスで認証（admin_users.can_edit_schedule = true のみ通る）
//   - 月単位でスケジュールを AG Grid に表示
//   - クイックフィルタ（ヘルパー名 / 利用者名）
//   - **セル直接編集** + 自動保存（楽観ロック付き、Phase C）
//   - **行ごとの 🗑 削除ボタン**（Phase D）
//   - **ゴミ箱モード切替**（Phase D）→ 削除済み行を表示・復元可能
//
// モード切替:
//   - 通常モード: schedule_web_v ベース、月単位、編集 + 削除可
//   - ゴミ箱モード: 過去 90 日に削除された行、編集不可、復元可
//
// 行追加: Phase D2 で対応予定（初期値の方針が要相談）

const AUTH_ENDPOINT = "/api/schedule-editor/auth";
const SCHEDULE_LIST_ENDPOINT = "/api/schedule-list";
const UPDATE_ENDPOINT = "/api/schedule-editor/update";
const DELETE_ENDPOINT = "/api/schedule-editor/delete";
const RESTORE_ENDPOINT = "/api/schedule-editor/restore";
const TRASH_ENDPOINT = "/api/schedule-editor/trash";
const CREATE_ENDPOINT = "/api/schedule-editor/create";
const STORAGE_KEY = "schedule-editor.email";

const VIEW_MODE_NORMAL = "normal";
const VIEW_MODE_TRASH = "trash";

const state = {
  email: "",
  currentYear: 0,
  currentMonth: 0,
  rawItems: [],
  isLoading: false,
  viewMode: VIEW_MODE_NORMAL,
};

let gridApi = null;

// ─── DOM 要素 ───────────────────────────────────────────────

function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error("missing element: " + id);
  return node;
}

const authScreen = el("auth-screen");
const mainScreen = el("main-screen");
const authForm = el("auth-form");
const authEmailInput = el("auth-email");
const authSubmitButton = el("auth-submit");
const authErrorEl = el("auth-error");
const userEmailEl = el("user-email");
const logoutButton = el("logout-button");
const monthControl = el("month-control");
const prevMonthBtn = el("prev-month");
const nextMonthBtn = el("next-month");
const monthLabel = el("month-label");
const quickFilterInput = el("quick-filter");
const reloadButton = el("reload-button");
const hardResetButton = el("hard-reset-button");
const trashToggleBtn = el("trash-toggle");
const createButton = el("create-button");
const gridContainer = el("grid-container");
const statusLine = el("status-line");

// モーダル要素
const createModal = el("create-modal");
const createForm = el("create-form");
const createDateInput = el("create-date");
const createClientInput = el("create-client");
const createHelperInput = el("create-helper");
const createStartInput = el("create-start");
const createEndInput = el("create-end");
const createHaishaInput = el("create-haisha");
const createTaskInput = el("create-task");
const createSummaryInput = el("create-summary");
const createBeneficiaryInput = el("create-beneficiary");
const createErrorEl = el("create-error");
const createSubmitBtn = el("create-submit");
const createCancelBtn = el("create-cancel");
const createCancelXBtn = el("create-cancel-x");

// ─── ユーティリティ ─────────────────────────────────────────

function setStatus(text, kind) {
  statusLine.textContent = text || "";
  statusLine.classList.remove("is-error", "is-success", "is-saving");
  if (kind === "error") statusLine.classList.add("is-error");
  else if (kind === "success") statusLine.classList.add("is-success");
  else if (kind === "saving") statusLine.classList.add("is-saving");
}

function getTodayParts() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function setMonth(year, month) {
  let y = year;
  let m = month;
  if (m <= 0) {
    y -= 1;
    m = 12;
  }
  if (m >= 13) {
    y += 1;
    m = 1;
  }
  state.currentYear = y;
  state.currentMonth = m;
  monthLabel.textContent = `${y}年${m}月`;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateForDisplay(value) {
  if (!value) return "";
  const parts = String(value).split("-");
  if (parts.length !== 3) return String(value);
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return String(value);
  const d = new Date(year, month - 1, day);
  const wd = WEEKDAYS[d.getDay()];
  return `${month}/${day}(${wd})`;
}

function formatDeletedAtForDisplay(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${m}/${day} ${hh}:${mm}`;
  } catch {
    return String(value);
  }
}

// ─── 認証 ───────────────────────────────────────────────────

async function checkAuth(email) {
  const url = `${AUTH_ENDPOINT}?email=${encodeURIComponent(email)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  if (!data) {
    throw new Error("認証サーバーから応答がありません");
  }
  return data;
}

function showAuthError(message) {
  authErrorEl.textContent = message;
  authErrorEl.hidden = false;
}

function clearAuthError() {
  authErrorEl.textContent = "";
  authErrorEl.hidden = true;
}

async function tryLogin(email) {
  authSubmitButton.disabled = true;
  authSubmitButton.textContent = "確認中…";
  clearAuthError();

  try {
    const result = await checkAuth(email);
    if (result.ok && result.canEdit) {
      onLoginSuccess(result.email || email);
    } else {
      showAuthError(result.message || "ログインできませんでした");
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    showAuthError("通信エラーが発生しました。少し待ってから再度お試しください");
    console.error("[scheduleEditor] auth fetch error:", err);
  } finally {
    authSubmitButton.disabled = false;
    authSubmitButton.textContent = "確認";
  }
}

function onLoginSuccess(email) {
  state.email = email;
  localStorage.setItem(STORAGE_KEY, email);
  authScreen.hidden = true;
  mainScreen.hidden = false;
  userEmailEl.textContent = email;

  initializeGridIfNeeded();
  refreshSchedule();
}

function logout() {
  localStorage.removeItem(STORAGE_KEY);
  state.email = "";
  authScreen.hidden = false;
  mainScreen.hidden = true;
  authEmailInput.value = "";
  clearAuthError();
}

// 動かなくなった時の最後の手段: ブラウザキャッシュ・SW・sessionStorage を全消去して再読み込み
async function hardReset() {
  const ok = window.confirm(
    "強制リセットを実行します。\n\n・ブラウザのキャッシュを全て削除\n・Service Worker を解除\n・ページを再読み込み\n\n（ログイン情報は残るので再入力は不要です）\n\nよろしいですか？"
  );
  if (!ok) return;

  setStatus("リセット中...", "info");
  try {
    if (typeof caches !== "undefined" && caches && caches.keys) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    try {
      sessionStorage.clear();
    } catch (e) {}
  } catch (err) {
    console.warn("hard reset cleanup failed:", err);
  }
  // URL に時刻を付けてキャッシュバスト → location.replace で履歴に残さない
  const url = new URL(window.location.href);
  url.searchParams.set("_t", String(Date.now()));
  window.location.replace(url.pathname + url.search + url.hash);
}

// ─── データ取得 ─────────────────────────────────────────────

async function fetchSchedule(year, month) {
  const url = `${SCHEDULE_LIST_ENDPOINT}?year=${year}&month=${month}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`schedule-list API: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data || !data.ok) {
    throw new Error("schedule-list: 不正なレスポンス");
  }
  return Array.isArray(data.items) ? data.items : [];
}

async function fetchTrash() {
  const url = `${TRASH_ENDPOINT}?email=${encodeURIComponent(state.email)}&days=90`;
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  if (!data || !data.ok) {
    throw new Error(
      data && data.message ? data.message : "ゴミ箱の取得に失敗しました",
    );
  }
  return Array.isArray(data.items) ? data.items : [];
}

async function refreshSchedule() {
  if (state.isLoading) return;
  state.isLoading = true;
  setStatus("読み込み中…");
  try {
    let items;
    if (state.viewMode === VIEW_MODE_TRASH) {
      items = await fetchTrash();
    } else {
      items = await fetchSchedule(state.currentYear, state.currentMonth);
    }
    state.rawItems = items;
    if (gridApi) {
      gridApi.setGridOption("rowData", items);
    }
    if (state.viewMode === VIEW_MODE_TRASH) {
      setStatus(`ゴミ箱（過去90日）: ${items.length}件`);
    } else {
      setStatus(
        `${state.currentYear}年${state.currentMonth}月: ${items.length}件`,
      );
    }
  } catch (err) {
    console.error("[scheduleEditor] fetch error:", err);
    state.rawItems = [];
    if (gridApi) {
      gridApi.setGridOption("rowData", []);
    }
    setStatus(
      "読み込みに失敗しました: " + (err.message || "原因不明"),
      "error",
    );
  } finally {
    state.isLoading = false;
  }
}

// ─── セル編集 → 保存 ────────────────────────────────────────

async function saveCellEdit(event) {
  // ゴミ箱モードでは編集不可（safety net）
  if (state.viewMode === VIEW_MODE_TRASH) return;

  const node = event.node;
  const data = event.data;
  const colId = event.column.getColId();
  const oldValue = event.oldValue == null ? null : String(event.oldValue);
  const newValueRaw = event.newValue;
  const newValue =
    newValueRaw == null || String(newValueRaw).trim() === ""
      ? null
      : String(newValueRaw).trim();

  if (oldValue === newValue) return;

  const expectedUpdatedAt = data.updatedAt;
  if (!expectedUpdatedAt) {
    setStatus(
      "内部エラー: updatedAt が取得できません。再読み込みしてください",
      "error",
    );
    node.setDataValue(colId, oldValue);
    return;
  }

  setStatus("保存中…", "saving");

  try {
    const res = await fetch(UPDATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: data.id,
        email: state.email,
        field: colId,
        value: newValue,
        expectedUpdatedAt: expectedUpdatedAt,
      }),
    });
    const json = await res.json().catch(() => null);

    if (!json) throw new Error("不正なレスポンス");

    if (json.ok) {
      data.updatedAt = json.updatedAt;
      if (json.value !== newValue) {
        node.setDataValue(colId, json.value);
      }
      setStatus("保存しました", "success");
      setTimeout(function () {
        if (statusLine.classList.contains("is-success")) {
          setStatus(
            `${state.currentYear}年${state.currentMonth}月: ${state.rawItems.length}件`,
          );
        }
      }, 1500);
    } else {
      node.setDataValue(colId, oldValue);
      if (json.reason === "conflict") {
        setStatus(
          "他の人が同じ予定を変更しました。再読み込みします…",
          "error",
        );
        setTimeout(refreshSchedule, 1200);
      } else {
        setStatus(json.message || "保存に失敗しました", "error");
      }
    }
  } catch (err) {
    console.error("[scheduleEditor] update error:", err);
    node.setDataValue(colId, oldValue);
    setStatus("通信エラー: 保存できませんでした", "error");
  }
}

// ─── 削除 / 復元 ────────────────────────────────────────────

async function deleteRow(rowData) {
  const summary = formatRowForConfirm(rowData);
  if (!window.confirm(`以下の予定を削除します（ゴミ箱に移動）。\n\n${summary}\n\nよろしいですか？`)) {
    return;
  }

  setStatus("削除中…", "saving");
  try {
    const res = await fetch(DELETE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: rowData.id,
        email: state.email,
        expectedUpdatedAt: rowData.updatedAt,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!json) throw new Error("不正なレスポンス");

    if (json.ok) {
      setStatus("削除しました（ゴミ箱から復元できます）", "success");
      // 該当行を grid から取り除く（再取得より早い）
      if (gridApi) {
        const txn = { remove: [rowData] };
        gridApi.applyTransaction(txn);
      }
      state.rawItems = state.rawItems.filter((r) => r.id !== rowData.id);
    } else if (json.reason === "conflict") {
      setStatus(
        "他の人が同じ予定を変更しました。再読み込みします…",
        "error",
      );
      setTimeout(refreshSchedule, 1200);
    } else {
      setStatus(json.message || "削除に失敗しました", "error");
    }
  } catch (err) {
    console.error("[scheduleEditor] delete error:", err);
    setStatus("通信エラー: 削除できませんでした", "error");
  }
}

async function restoreRow(rowData) {
  const summary = formatRowForConfirm(rowData);
  if (!window.confirm(`以下の予定を復元します（ゴミ箱から戻す）。\n\n${summary}\n\nよろしいですか？`)) {
    return;
  }

  setStatus("復元中…", "saving");
  try {
    const res = await fetch(RESTORE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: rowData.id,
        email: state.email,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!json) throw new Error("不正なレスポンス");

    if (json.ok) {
      setStatus("復元しました", "success");
      if (gridApi) {
        const txn = { remove: [rowData] };
        gridApi.applyTransaction(txn);
      }
      state.rawItems = state.rawItems.filter((r) => r.id !== rowData.id);
    } else {
      setStatus(json.message || "復元に失敗しました", "error");
    }
  } catch (err) {
    console.error("[scheduleEditor] restore error:", err);
    setStatus("通信エラー: 復元できませんでした", "error");
  }
}

function formatRowForConfirm(row) {
  const date = formatDateForDisplay(row.date);
  const helper = row.helperName || "（担当未設定）";
  const user = row.userName || "（利用者未設定）";
  const time =
    row.startTime && row.endTime
      ? `${row.startTime}〜${row.endTime}`
      : row.startTime
      ? `${row.startTime}〜`
      : "(時間未設定)";
  return `${date}  ${time}\n${helper} → ${user}\n${row.task || ""} / ${row.summary || ""}`;
}

// ─── 新規追加モーダル ──────────────────────────────────────

function openCreateModal() {
  // ゴミ箱モード中は無効
  if (state.viewMode === VIEW_MODE_TRASH) return;

  // 入力をクリア
  createForm.reset();
  createErrorEl.textContent = "";
  createErrorEl.hidden = true;

  // 日付の初期値: 今表示している月の 1 日（操作中の月に追加することが多い想定）
  const ymStr = `${state.currentYear}-${String(state.currentMonth).padStart(2, "0")}-01`;
  createDateInput.value = ymStr;

  createModal.hidden = false;
  setTimeout(function () {
    createDateInput.focus();
  }, 50);
}

function closeCreateModal() {
  createModal.hidden = true;
}

function showCreateError(message) {
  createErrorEl.textContent = message;
  createErrorEl.hidden = false;
}

async function submitCreate(event) {
  event.preventDefault();
  createErrorEl.hidden = true;

  const date = createDateInput.value.trim();
  const client = createClientInput.value.trim();

  if (!date) {
    showCreateError("日付は必須です");
    return;
  }
  if (!client) {
    showCreateError("利用者は必須です");
    return;
  }

  const payload = {
    email: state.email,
    date,
    client,
    name: createHelperInput.value.trim() || null,
    startTime: createStartInput.value.trim() || null,
    endTime: createEndInput.value.trim() || null,
    haisha: createHaishaInput.value.trim() || null,
    task: createTaskInput.value.trim() || null,
    summary: createSummaryInput.value.trim() || null,
    beneficiaryNumber: createBeneficiaryInput.value.trim() || null,
  };

  createSubmitBtn.disabled = true;
  createSubmitBtn.textContent = "追加中…";
  setStatus("追加中…", "saving");

  try {
    const res = await fetch(CREATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!json) throw new Error("不正なレスポンス");

    if (json.ok) {
      // 表示中の月と一致すれば AG Grid に追加
      const itemMonth = (json.item.date || "").slice(0, 7); // "YYYY-MM"
      const currentYm = `${state.currentYear}-${String(state.currentMonth).padStart(2, "0")}`;
      if (itemMonth === currentYm && gridApi && state.viewMode === VIEW_MODE_NORMAL) {
        gridApi.applyTransaction({ add: [json.item] });
        state.rawItems.push(json.item);
      }
      setStatus("追加しました", "success");
      closeCreateModal();
      setTimeout(function () {
        if (statusLine.classList.contains("is-success")) {
          if (state.viewMode === VIEW_MODE_NORMAL) {
            setStatus(
              `${state.currentYear}年${state.currentMonth}月: ${state.rawItems.length}件`,
            );
          }
        }
      }, 1500);
    } else {
      showCreateError(json.message || "追加に失敗しました");
      setStatus("追加に失敗しました", "error");
    }
  } catch (err) {
    console.error("[scheduleEditor] create error:", err);
    showCreateError("通信エラー: 追加できませんでした");
    setStatus("通信エラー", "error");
  } finally {
    createSubmitBtn.disabled = false;
    createSubmitBtn.textContent = "追加する";
  }
}

// ─── ゴミ箱モード切替 ───────────────────────────────────────

function toggleTrashMode() {
  state.viewMode =
    state.viewMode === VIEW_MODE_NORMAL ? VIEW_MODE_TRASH : VIEW_MODE_NORMAL;

  // UI 切替
  if (state.viewMode === VIEW_MODE_TRASH) {
    mainScreen.classList.add("is-trash-mode");
    trashToggleBtn.classList.add("is-active");
    trashToggleBtn.textContent = "📋 通常表示に戻る";
    monthControl.style.opacity = "0.4";
    monthControl.style.pointerEvents = "none";
  } else {
    mainScreen.classList.remove("is-trash-mode");
    trashToggleBtn.classList.remove("is-active");
    trashToggleBtn.textContent = "🗑 ゴミ箱を表示";
    monthControl.style.opacity = "";
    monthControl.style.pointerEvents = "";
  }

  // カラム定義を切替（編集可否や操作ボタンが変わる）
  if (gridApi) {
    gridApi.setGridOption("columnDefs", buildColumnDefs(state.viewMode));
  }
  refreshSchedule();
}

// ─── AG Grid ───────────────────────────────────────────────

function buildColumnDefs(mode) {
  const isTrash = mode === VIEW_MODE_TRASH;
  const editable = !isTrash;

  const cols = [
    {
      headerName: "日付",
      field: "date",
      width: 110,
      pinned: "left",
      sort: "asc",
      editable: false,
      valueFormatter: function (params) {
        return formatDateForDisplay(params.value);
      },
    },
    {
      headerName: "ヘルパー",
      field: "helperName",
      width: 140,
      editable,
    },
    {
      headerName: "利用者",
      field: "userName",
      width: 140,
      editable,
    },
    {
      headerName: "開始",
      field: "startTime",
      width: 90,
      editable,
    },
    {
      headerName: "終了",
      field: "endTime",
      width: 90,
      editable,
    },
    {
      headerName: "配車",
      field: "haisha",
      width: 120,
      editable,
    },
    {
      headerName: "内容",
      field: "task",
      width: 140,
      editable,
    },
    {
      headerName: "概要",
      field: "summary",
      flex: 1,
      minWidth: 200,
      tooltipField: "summary",
      editable,
    },
  ];

  if (isTrash) {
    cols.push({
      headerName: "削除日時",
      field: "deletedAt",
      width: 120,
      editable: false,
      sortable: true,
      valueFormatter: function (params) {
        return formatDeletedAtForDisplay(params.value);
      },
    });
  }

  cols.push({
    headerName: "",
    width: 90,
    pinned: "right",
    editable: false,
    sortable: false,
    filter: false,
    resizable: false,
    cellRenderer: createActionCellRenderer,
  });

  return cols;
}

function createActionCellRenderer(params) {
  const wrapper = document.createElement("div");
  wrapper.className = "action-cell";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "action-btn";
  if (state.viewMode === VIEW_MODE_TRASH) {
    button.classList.add("action-btn--restore");
    button.textContent = "↩ 復元";
    button.addEventListener("click", function () {
      restoreRow(params.data);
    });
  } else {
    button.classList.add("action-btn--delete");
    button.textContent = "🗑 削除";
    button.addEventListener("click", function () {
      deleteRow(params.data);
    });
  }
  wrapper.appendChild(button);
  return wrapper;
}

function initializeGridIfNeeded() {
  if (gridApi) return;

  const gridOptions = {
    columnDefs: buildColumnDefs(state.viewMode),
    rowData: [],
    defaultColDef: {
      sortable: true,
      filter: true,
      resizable: true,
    },
    rowHeight: 36,
    headerHeight: 38,
    suppressRowClickSelection: true,
    animateRows: false,
    singleClickEdit: false,
    stopEditingWhenCellsLoseFocus: true,
    onCellValueChanged: saveCellEdit,
    localeText: {
      noRowsToShow: "予定はありません",
      loadingOoo: "読み込み中…",
    },
  };

  gridApi = window.agGrid.createGrid(gridContainer, gridOptions);
}

// ─── イベントバインド ──────────────────────────────────────

function bindEvents() {
  authForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const email = authEmailInput.value.trim();
    if (!email) {
      showAuthError("メールアドレスを入力してください");
      return;
    }
    tryLogin(email);
  });

  logoutButton.addEventListener("click", logout);

  prevMonthBtn.addEventListener("click", function () {
    if (state.viewMode === VIEW_MODE_TRASH) return;
    setMonth(state.currentYear, state.currentMonth - 1);
    refreshSchedule();
  });

  nextMonthBtn.addEventListener("click", function () {
    if (state.viewMode === VIEW_MODE_TRASH) return;
    setMonth(state.currentYear, state.currentMonth + 1);
    refreshSchedule();
  });

  reloadButton.addEventListener("click", function () {
    refreshSchedule();
  });

  hardResetButton.addEventListener("click", hardReset);

  trashToggleBtn.addEventListener("click", toggleTrashMode);

  createButton.addEventListener("click", openCreateModal);
  createCancelBtn.addEventListener("click", closeCreateModal);
  createCancelXBtn.addEventListener("click", closeCreateModal);
  createForm.addEventListener("submit", submitCreate);

  // 背景クリックで閉じる
  createModal.addEventListener("click", function (event) {
    if (event.target === createModal) closeCreateModal();
  });

  // ESC で閉じる
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !createModal.hidden) {
      closeCreateModal();
    }
  });

  quickFilterInput.addEventListener("input", function (event) {
    if (gridApi) {
      gridApi.setGridOption("quickFilterText", event.target.value);
    }
  });
}

// ─── 起動 ───────────────────────────────────────────────────

function initialize() {
  const today = getTodayParts();
  setMonth(today.year, today.month);
  bindEvents();

  const savedEmail = localStorage.getItem(STORAGE_KEY);
  if (savedEmail) {
    authEmailInput.value = savedEmail;
    tryLogin(savedEmail);
  }
}

initialize();
