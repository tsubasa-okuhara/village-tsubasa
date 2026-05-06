// オーナー専用クイック記録 main.js
//
// 設計:
//   - ALLOWED_EMAILS のいずれかに限定（localStorage で記憶）
//   - 居宅 / 移動 タブで未記録一覧を切り替え
//   - タップでモーダルを開いて入力 → 保存
//   - 構造化項目は省略（バックエンドは structuredLog null でも保存可）
//
// 既存 API を流用:
//   - GET /api/service-records-home/unwritten?helper_email=...
//   - POST /api/service-records-home/save
//   - GET /api/service-records-move/unwritten?helper_email=...
//   - POST /api/service-records-move/save

// 入力許可メールアドレス（複数可）
// 入力したメール = helper_email として未記録一覧の絞り込みに使われる
// 奥原翼さんは:
//   - admin@village-support.jp = 管理者ログイン用（helper_master 未登録なので 0 件）
//   - village.tsubasa_4499@icloud.com = 現場ヘルパー用（実タスクあり、普段はこっち）
const ALLOWED_EMAILS = [
  "admin@village-support.jp",
  "village.tsubasa_4499@icloud.com",
];
const STORAGE_KEY = "owner_record_email";

function isEmailAllowed(email) {
  if (!email) return false;
  const lc = email.toLowerCase();
  return ALLOWED_EMAILS.some((e) => e.toLowerCase() === lc);
}

const API_BASE = "/api";

// ─── DOM 参照 ───────────────────────────────────────────
const gateSection = document.getElementById("gate");
const mainSection = document.getElementById("main");
const gateEmailInput = document.getElementById("gate-email");
const gateSubmit = document.getElementById("gate-submit");
const gateError = document.getElementById("gate-error");
const currentEmailLabel = document.getElementById("current-email");
const logoutButton = document.getElementById("logout-button");

const tabHome = document.getElementById("tab-home");
const tabMove = document.getElementById("tab-move");
const badgeHome = document.getElementById("badge-home");
const badgeMove = document.getElementById("badge-move");

const listStatus = document.getElementById("list-status");
const taskListEl = document.getElementById("task-list");
const emptyStateEl = document.getElementById("empty-state");

const formModal = document.getElementById("form-modal");
const formTitle = document.getElementById("form-title");
const formClose = document.getElementById("form-close");
const formDatetime = document.getElementById("form-datetime");
const formUser = document.getElementById("form-user");
const formTask = document.getElementById("form-task");
const formCategoryRow = document.getElementById("form-category-row");
const categoryButtons = document.getElementById("category-buttons");
const formMemo = document.getElementById("form-memo");
const formFinalNote = document.getElementById("form-final-note");
const formRegenButton = document.getElementById("form-regen-note");
const formStatus = document.getElementById("form-status");
const formSaveNext = document.getElementById("form-save-next");
const formSaveClose = document.getElementById("form-save-close");

// ─── 状態 ───────────────────────────────────────────────
const state = {
  email: null,
  currentCategory: "home", // 'home' | 'move'
  homeTasks: [],
  moveTasks: [],
  selectedTask: null,
  selectedCategoryValue: null, // 区分（居宅のみ）
  isSaving: false,
};

// ─── ゲート（メールアドレス確認） ────────────────────
function showGate() {
  gateSection.hidden = false;
  mainSection.hidden = true;
}

function showMain() {
  gateSection.hidden = true;
  mainSection.hidden = false;
  currentEmailLabel.textContent = state.email;
}

function tryEmailFromStorage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && isEmailAllowed(stored)) {
    state.email = stored;
    showMain();
    loadAll();
    return true;
  }
  // 保存済みメールが許可リスト外なら削除（許可リスト変更時の自動クリア）
  if (stored) {
    localStorage.removeItem(STORAGE_KEY);
  }
  return false;
}

gateSubmit.addEventListener("click", () => {
  const value = gateEmailInput.value.trim();
  if (!value) {
    gateError.textContent = "メールアドレスを入力してください";
    gateError.hidden = false;
    return;
  }
  if (!isEmailAllowed(value)) {
    gateError.textContent =
      "このページはオーナー専用です。アクセス権限がありません。";
    gateError.hidden = false;
    return;
  }
  // 認証成功
  state.email = value;
  localStorage.setItem(STORAGE_KEY, value);
  gateError.hidden = true;
  showMain();
  loadAll();
});

gateEmailInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    gateSubmit.click();
  }
});

logoutButton.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state.email = null;
  gateEmailInput.value = "";
  showGate();
});

// ─── タブ切替 ─────────────────────────────────────────
tabHome.addEventListener("click", () => switchTab("home"));
tabMove.addEventListener("click", () => switchTab("move"));

function switchTab(category) {
  state.currentCategory = category;
  if (category === "home") {
    tabHome.classList.add("is-active");
    tabMove.classList.remove("is-active");
  } else {
    tabMove.classList.add("is-active");
    tabHome.classList.remove("is-active");
  }
  renderList();
}

// ─── 一覧取得 ─────────────────────────────────────────
async function loadAll() {
  listStatus.textContent = "読み込み中…";
  listStatus.className = "status";
  taskListEl.innerHTML = "";
  emptyStateEl.hidden = true;

  try {
    const [homeData, moveData] = await Promise.all([
      fetchUnwritten("home"),
      fetchUnwritten("move"),
    ]);
    state.homeTasks = homeData;
    state.moveTasks = moveData;
    updateBadges();
    renderList();
    listStatus.textContent = "";
  } catch (err) {
    console.error("[owner-record] load error:", err);
    listStatus.textContent = "データの取得に失敗しました。再読み込みしてください。";
    listStatus.className = "status is-error";
  }
}

async function fetchUnwritten(category) {
  const path =
    category === "home"
      ? "/service-records-home/unwritten"
      : "/service-records-move/unwritten";
  const url = `${API_BASE}${path}?helper_email=${encodeURIComponent(state.email)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.message || "fetch failed");
  return Array.isArray(data.items) ? data.items : [];
}

function updateBadges() {
  const homeCount = state.homeTasks.length;
  const moveCount = state.moveTasks.length;
  if (homeCount > 0) {
    badgeHome.textContent = String(homeCount);
    badgeHome.hidden = false;
  } else {
    badgeHome.hidden = true;
  }
  if (moveCount > 0) {
    badgeMove.textContent = String(moveCount);
    badgeMove.hidden = false;
  } else {
    badgeMove.hidden = true;
  }
}

// ─── 一覧レンダリング ─────────────────────────────────
function renderList() {
  const tasks =
    state.currentCategory === "home" ? state.homeTasks : state.moveTasks;
  taskListEl.innerHTML = "";
  if (tasks.length === 0) {
    emptyStateEl.hidden = false;
    return;
  }
  emptyStateEl.hidden = true;
  for (const task of tasks) {
    taskListEl.appendChild(renderTaskCard(task));
  }
}

function renderTaskCard(task) {
  const card = document.createElement("div");
  card.className = "task-card";
  const dateLabel = formatServiceDate(task.service_date);
  const timeLabel = formatTimeRange(task.start_time, task.end_time);
  card.innerHTML = `
    <div class="task-card__time">${escapeHtml(dateLabel)} ${escapeHtml(timeLabel)}</div>
    <div class="task-card__user">${escapeHtml(task.user_name || "（利用者未設定）")}</div>
    <div class="task-card__task">${escapeHtml(task.task || "—")}${task.summary ? " / " + escapeHtml(task.summary) : ""}</div>
    <div class="task-card__cta">✏️ タップして記録</div>
  `;
  card.addEventListener("click", () => openForm(task));
  return card;
}

// ─── 入力モーダル ─────────────────────────────────────
function openForm(task) {
  state.selectedTask = task;
  state.selectedCategoryValue = null;

  const dateLabel = formatServiceDate(task.service_date);
  const timeLabel = formatTimeRange(task.start_time, task.end_time);
  formTitle.textContent =
    state.currentCategory === "home" ? "居宅介護 記録入力" : "移動支援 記録入力";
  formDatetime.textContent = `${dateLabel} ${timeLabel}`;
  formUser.textContent = task.user_name || "（利用者未設定）";
  formTask.textContent = task.task || "—";

  // 居宅のみ区分ボタン表示
  if (state.currentCategory === "home") {
    formCategoryRow.hidden = false;
    // 区分の初期選択: task の値から推測
    const initialCategory = inferCategoryFromTask(task.task);
    selectCategory(initialCategory);
  } else {
    formCategoryRow.hidden = true;
  }

  formMemo.value = "";
  formFinalNote.value = generateFinalNote(task, "");
  formStatus.textContent = "";
  formStatus.className = "status";

  formModal.hidden = false;
  setTimeout(() => formMemo.focus(), 100);
}

function closeForm() {
  formModal.hidden = true;
  state.selectedTask = null;
}

formClose.addEventListener("click", closeForm);
formModal.addEventListener("click", (e) => {
  if (e.target === formModal) closeForm();
});

// 区分ボタン
categoryButtons.addEventListener("click", (e) => {
  const btn = e.target.closest(".category-button");
  if (!btn) return;
  const value = btn.dataset.categoryValue;
  selectCategory(value);
  // メモ・本文を再生成
  if (state.selectedTask) {
    formFinalNote.value = generateFinalNote(state.selectedTask, formMemo.value);
  }
});

function selectCategory(value) {
  state.selectedCategoryValue = value;
  const buttons = categoryButtons.querySelectorAll(".category-button");
  buttons.forEach((b) => {
    if (b.dataset.categoryValue === value) {
      b.classList.add("is-active");
    } else {
      b.classList.remove("is-active");
    }
  });
}

function inferCategoryFromTask(taskText) {
  if (!taskText) return "身体介護";
  const t = String(taskText);
  if (t.includes("家事")) return "家事援助";
  if (t.includes("通院")) return "通院等介助";
  return "身体介護";
}

// メモ → 記録本文 自動生成
formRegenButton.addEventListener("click", () => {
  if (!state.selectedTask) return;
  formFinalNote.value = generateFinalNote(state.selectedTask, formMemo.value);
});

formMemo.addEventListener("blur", () => {
  // メモから本文を再生成（既に手動編集済みでなければ）
  if (!state.selectedTask) return;
  // 既存本文が「自動生成版」のままなら更新
  const auto = generateFinalNote(state.selectedTask, "");
  if (formFinalNote.value === auto || formFinalNote.value.trim() === "") {
    formFinalNote.value = generateFinalNote(state.selectedTask, formMemo.value);
  }
});

function generateFinalNote(task, memo) {
  const dateLabel = task.service_date || "";
  const timeRange = formatTimeRange(task.start_time, task.end_time);
  const userName = task.user_name || "";
  const taskName = state.selectedCategoryValue || task.task || "";
  const memoSegment = memo && memo.trim() ? `\n${memo.trim()}` : "";

  if (state.currentCategory === "home") {
    return `${dateLabel} ${timeRange}、${userName}様へ${taskName}を実施しました。${memoSegment ? "実施内容: " + memo.trim() : "実施内容: 必要な支援を行いました。"}`;
  } else {
    return `${dateLabel} ${timeRange}、${userName}様の${taskName || "移動支援"}を実施しました。${memoSegment ? memo.trim() : "予定通りに支援しました。"}`;
  }
}

// ─── 保存処理 ─────────────────────────────────────────
formSaveNext.addEventListener("click", () => save({ next: true }));
formSaveClose.addEventListener("click", () => save({ next: false }));

async function save({ next }) {
  if (state.isSaving || !state.selectedTask) return;

  const memo = formMemo.value.trim();
  const finalNote = formFinalNote.value.trim();

  if (!memo) {
    formStatus.textContent = "メモを入力してください。";
    formStatus.className = "status is-error";
    formMemo.focus();
    return;
  }
  if (!finalNote) {
    formStatus.textContent = "記録本文が空です。";
    formStatus.className = "status is-error";
    return;
  }

  state.isSaving = true;
  formSaveNext.disabled = true;
  formSaveClose.disabled = true;
  formStatus.textContent = "保存中…";
  formStatus.className = "status";

  try {
    if (state.currentCategory === "home") {
      await saveHome(state.selectedTask, memo, finalNote);
    } else {
      await saveMove(state.selectedTask, memo, finalNote);
    }

    // 一覧から削除
    if (state.currentCategory === "home") {
      state.homeTasks = state.homeTasks.filter(
        (t) => t.id !== state.selectedTask.id
      );
    } else {
      state.moveTasks = state.moveTasks.filter(
        (t) => t.id !== state.selectedTask.id
      );
    }
    updateBadges();

    formStatus.textContent = "✅ 保存しました";
    formStatus.className = "status is-success";

    if (next) {
      // 次の予定に進む
      const remaining =
        state.currentCategory === "home" ? state.homeTasks : state.moveTasks;
      if (remaining.length > 0) {
        setTimeout(() => {
          openForm(remaining[0]);
        }, 400);
      } else {
        setTimeout(() => {
          closeForm();
          renderList();
        }, 600);
      }
    } else {
      setTimeout(() => {
        closeForm();
        renderList();
      }, 400);
    }
  } catch (err) {
    console.error("[owner-record] save error:", err);
    formStatus.textContent = "保存に失敗しました: " + (err.message || "不明エラー");
    formStatus.className = "status is-error";
  } finally {
    state.isSaving = false;
    formSaveNext.disabled = false;
    formSaveClose.disabled = false;
  }
}

async function saveHome(task, memo, finalNote) {
  const body = {
    scheduleTaskId: task.id,
    serviceDate: task.service_date,
    helperName: task.helper_name,
    helperEmail: task.helper_email || state.email,
    userName: task.user_name,
    task: state.selectedCategoryValue || task.task,
    memo,
    aiSummary: null,
    finalNote,
    structuredLog: null,
  };
  const res = await fetch(`${API_BASE}/service-records-home/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
}

async function saveMove(task, memo, finalNote) {
  const body = {
    taskId: task.id,
    helperEmail: task.helper_email || state.email,
    helperName: task.helper_name,
    userName: task.user_name,
    serviceDate: task.service_date,
    startTime: task.start_time || "",
    endTime: task.end_time || "",
    task: task.task || "",
    haisha: task.haisha || "",
    notes: memo,
    summaryText: finalNote,
  };
  const res = await fetch(`${API_BASE}/service-records-move/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
}

// ─── ユーティリティ ───────────────────────────────────
function formatServiceDate(dateStr) {
  if (!dateStr) return "";
  // YYYY-MM-DD → M/D(曜)
  try {
    const d = new Date(dateStr + "T00:00:00+09:00");
    if (isNaN(d.getTime())) return dateStr;
    const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
    return `${d.getMonth() + 1}/${d.getDate()}(${wd})`;
  } catch {
    return dateStr;
  }
}

function formatTimeRange(start, end) {
  const fmt = (s) => {
    if (!s) return "";
    // "HH:MM:SS" or "HH:MM"
    return String(s).slice(0, 5);
  };
  const a = fmt(start);
  const b = fmt(end);
  if (a && b) return `${a}〜${b}`;
  return a || b || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ─── 起動 ─────────────────────────────────────────────
if (!tryEmailFromStorage()) {
  showGate();
  setTimeout(() => gateEmailInput.focus(), 100);
}
