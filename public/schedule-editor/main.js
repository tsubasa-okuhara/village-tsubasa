// =============================================================
// /schedule-editor/ Phase C: セル編集 + 楽観ロック保存
// =============================================================
//
// 機能:
//   - メールアドレスで認証（admin_users.can_edit_schedule = true のみ通る）
//   - 月単位でスケジュールを AG Grid に表示
//   - クイックフィルタ（ヘルパー名 / 利用者名）
//   - **セル直接編集** + 自動保存（楽観ロック付き）
//
// 楽観ロック:
//   - 各行の updatedAt を保持
//   - 保存時に expectedUpdatedAt を送信 → サーバ側で一致確認
//   - 不一致なら 409 Conflict → 該当月をリロード
//
// 編集不可: date（同期影響大、Phase D 以降）
// 削除・行追加: Phase D 以降

const AUTH_ENDPOINT = "/api/schedule-editor/auth";
const SCHEDULE_LIST_ENDPOINT = "/api/schedule-list";
const UPDATE_ENDPOINT = "/api/schedule-editor/update";
const STORAGE_KEY = "schedule-editor.email";

const state = {
  email: "",
  currentYear: 0,
  currentMonth: 0,
  rawItems: [],
  isLoading: false,
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
const prevMonthBtn = el("prev-month");
const nextMonthBtn = el("next-month");
const monthLabel = el("month-label");
const quickFilterInput = el("quick-filter");
const reloadButton = el("reload-button");
const gridContainer = el("grid-container");
const statusLine = el("status-line");

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

async function refreshSchedule() {
  if (state.isLoading) return;
  state.isLoading = true;
  setStatus("読み込み中…");
  try {
    const items = await fetchSchedule(state.currentYear, state.currentMonth);
    state.rawItems = items;
    if (gridApi) {
      gridApi.setGridOption("rowData", items);
    }
    setStatus(`${state.currentYear}年${state.currentMonth}月: ${items.length}件`);
  } catch (err) {
    console.error("[scheduleEditor] fetch error:", err);
    state.rawItems = [];
    if (gridApi) {
      gridApi.setGridOption("rowData", []);
    }
    setStatus("読み込みに失敗しました。「再読み込み」を押してください", "error");
  } finally {
    state.isLoading = false;
  }
}

// ─── セル編集 → 保存 ────────────────────────────────────────

async function saveCellEdit(event) {
  const node = event.node;
  const data = event.data;
  const colId = event.column.getColId();
  const oldValue = event.oldValue == null ? null : String(event.oldValue);
  const newValueRaw = event.newValue;
  const newValue =
    newValueRaw == null || String(newValueRaw).trim() === ""
      ? null
      : String(newValueRaw).trim();

  // 変化なし → スキップ
  if (oldValue === newValue) return;

  // 楽観ロック用の updatedAt を取得
  const expectedUpdatedAt = data.updatedAt;
  if (!expectedUpdatedAt) {
    setStatus("内部エラー: updatedAt が取得できません。再読み込みしてください", "error");
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

    if (!json) {
      throw new Error("不正なレスポンス");
    }

    if (json.ok) {
      // 楽観ロック用の updatedAt を更新
      data.updatedAt = json.updatedAt;
      // 保存後の値を再描画（normalize 結果が来るため）
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
      // サーバ側エラー
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

// ─── AG Grid ───────────────────────────────────────────────

function initializeGridIfNeeded() {
  if (gridApi) return;

  const columnDefs = [
    {
      headerName: "日付",
      field: "date",
      width: 110,
      pinned: "left",
      sort: "asc",
      editable: false,
    },
    {
      headerName: "ヘルパー",
      field: "helperName",
      width: 140,
      editable: true,
    },
    {
      headerName: "利用者",
      field: "userName",
      width: 140,
      editable: true,
    },
    {
      headerName: "開始",
      field: "startTime",
      width: 90,
      editable: true,
    },
    {
      headerName: "終了",
      field: "endTime",
      width: 90,
      editable: true,
    },
    {
      headerName: "配車",
      field: "haisha",
      width: 120,
      editable: true,
    },
    {
      headerName: "内容",
      field: "task",
      width: 140,
      editable: true,
    },
    {
      headerName: "概要",
      field: "summary",
      flex: 1,
      minWidth: 200,
      tooltipField: "summary",
      editable: true,
    },
  ];

  const gridOptions = {
    columnDefs,
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
    singleClickEdit: false, // ダブルクリックで編集に入る
    stopEditingWhenCellsLoseFocus: true,
    onCellValueChanged: saveCellEdit,
    localeText: {
      noRowsToShow: "予定はありません",
      loadingOoo: "読み込み中…",
    },
  };

  // AG Grid v31 API
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
    setMonth(state.currentYear, state.currentMonth - 1);
    refreshSchedule();
  });

  nextMonthBtn.addEventListener("click", function () {
    setMonth(state.currentYear, state.currentMonth + 1);
    refreshSchedule();
  });

  reloadButton.addEventListener("click", function () {
    refreshSchedule();
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
