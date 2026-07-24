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
//   - POST /api/service-records-home/summary  （AI 整形・居宅 / OpenAI gpt-4o-mini）
//   - POST /api/service-records-home/save
//   - GET /api/service-records-move/unwritten?helper_email=...
//   - POST /api/service-records-move/summary  （AI 整形・移動 / OpenAI gpt-4o-mini）
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
const scopeAll = document.getElementById("scope-all");
const userFilterEl = document.getElementById("user-filter");

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
const referenceStatus = document.getElementById("reference-status");
const referenceListEl = document.getElementById("reference-list");

// ─── 状態 ───────────────────────────────────────────────
const state = {
  email: null,
  currentCategory: "home", // 'home' | 'move'
  showAll: false, // false=自分だけ / true=全員の未記入
  userFilter: "", // ""=すべての利用者 / 利用者名で絞り込み
  homeTasks: [],
  moveTasks: [],
  selectedTask: null,
  selectedCategoryValue: null, // 区分（居宅のみ）
  isSaving: false,
  samples: [], // openForm 時に取得する参考記録（最大10件）
  selectedRefs: [], // チェックした参考記録の note（最大 MAX_REFS 件）
};

// 参考記録として AI に渡す上限（バックエンドは最大5件受けるが、UI では絞って3件まで）
const MAX_REFS = 3;

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
if (scopeAll) {
  scopeAll.addEventListener("change", () => {
    state.showAll = scopeAll.checked;
    loadAll();
  });
}
if (userFilterEl) {
  userFilterEl.addEventListener("change", () => {
    state.userFilter = userFilterEl.value;
    renderList();
  });
}

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
  const url = state.showAll
    ? `${API_BASE}${path}`
    : `${API_BASE}${path}?helper_email=${encodeURIComponent(state.email)}`;
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

// ─── 利用者フィルタ ───────────────────────────────────
// 居宅は user_name(snake) / 移動は userName(camel) で返るため両対応
function getTaskUserName(task) {
  return task.user_name || task.userName || "";
}

// 現在のタブの一覧から利用者の選択肢を作り直す。
// 選択中の利用者が一覧から消えた場合は「すべて」に戻す。
function refreshUserFilterOptions(tasks) {
  if (!userFilterEl) return;

  const counts = new Map();
  for (const task of tasks) {
    const name = getTaskUserName(task);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  if (state.userFilter && !counts.has(state.userFilter)) {
    state.userFilter = "";
  }

  const names = Array.from(counts.keys()).sort(function (a, b) {
    return a.localeCompare(b, "ja");
  });

  userFilterEl.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = `すべての利用者（${tasks.length}件）`;
  userFilterEl.appendChild(allOption);

  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${name}（${counts.get(name)}件）`;
    userFilterEl.appendChild(option);
  }

  userFilterEl.value = state.userFilter;
}

// ─── 一覧レンダリング ─────────────────────────────────
function renderList() {
  const tasks =
    state.currentCategory === "home" ? state.homeTasks : state.moveTasks;

  // 選択肢はフィルタ適用前の一覧から作る（絞り込み後だと他の利用者を選べなくなる）
  refreshUserFilterOptions(tasks);

  // 並び順は変えず、絞り込みだけをかける
  const visibleTasks = state.userFilter
    ? tasks.filter(function (task) {
        return getTaskUserName(task) === state.userFilter;
      })
    : tasks;

  taskListEl.innerHTML = "";
  if (visibleTasks.length === 0) {
    emptyStateEl.hidden = false;
    return;
  }
  emptyStateEl.hidden = true;
  for (const task of visibleTasks) {
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
    <div class="task-card__user">${escapeHtml(task.user_name || task.userName || "（利用者未設定）")}</div>
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
  formUser.textContent = task.user_name || task.userName || "（利用者未設定）";
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

  // 参考記録（過去の記入済み記録）を自動取得して一覧表示する
  loadSamples(task);

  formModal.hidden = false;
  setTimeout(() => formMemo.focus(), 100);
}

function closeForm() {
  formModal.hidden = true;
  state.selectedTask = null;
  state.samples = [];
  state.selectedRefs = [];
}

// ─── 参考記録（samples） ──────────────────────────────────
async function fetchSamples(task) {
  const userName = task.user_name || task.userName || "";
  if (!userName) return [];

  const params = new URLSearchParams({ user_name: userName });
  // 居宅は user_name + task（統一済み3種別）、移動は user_name のみ
  if (state.currentCategory === "home") {
    const taskValue = state.selectedCategoryValue || task.task || "";
    if (taskValue) params.set("task", taskValue);
  }
  const base =
    state.currentCategory === "home"
      ? "/service-records-home/samples"
      : "/service-records-move/samples";

  const res = await fetch(`${API_BASE}${base}?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.message || "fetch failed");
  return Array.isArray(data.samples) ? data.samples : [];
}

async function loadSamples(task) {
  state.samples = [];
  state.selectedRefs = [];
  referenceListEl.innerHTML = "";
  referenceStatus.hidden = false;
  referenceStatus.textContent = "参考記録を読み込み中…";
  referenceStatus.className = "status";

  try {
    const samples = await fetchSamples(task);
    // 取得中に別のタスクを開いた場合は、この結果を破棄する
    if (state.selectedTask !== task) return;

    state.samples = samples;
    if (samples.length === 0) {
      referenceStatus.textContent = "参考にできる過去記録がありません。";
      referenceStatus.className = "status";
      return;
    }
    referenceStatus.hidden = true;
    renderReferenceList();
  } catch (err) {
    console.error("[owner-record] samples error:", err);
    if (state.selectedTask !== task) return;
    referenceStatus.textContent =
      "参考記録の取得に失敗しました（記録は通常どおり入力できます）。";
    referenceStatus.className = "status is-error";
  }
}

function renderReferenceList() {
  referenceListEl.innerHTML = "";
  const limitReached = state.selectedRefs.length >= MAX_REFS;

  state.samples.forEach((sample, index) => {
    const note = sample.note || "";
    const checked = state.selectedRefs.includes(note);
    const disabled = !checked && limitReached;

    const label = document.createElement("label");
    label.className =
      "reference-item" +
      (checked ? " is-checked" : "") +
      (disabled ? " is-disabled" : "");

    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = checked;
    box.disabled = disabled;
    box.addEventListener("change", () => toggleReference(note, box.checked));

    const text = document.createElement("span");
    text.className = "reference-item__text";
    const dateLabel = sample.service_date ? `【${sample.service_date}】` : "";
    text.textContent = `${index + 1}. ${dateLabel}${note}`;

    label.appendChild(box);
    label.appendChild(text);
    referenceListEl.appendChild(label);
  });
}

function toggleReference(note, isChecked) {
  if (isChecked) {
    if (state.selectedRefs.length >= MAX_REFS) return;
    if (!state.selectedRefs.includes(note)) state.selectedRefs.push(note);
  } else {
    state.selectedRefs = state.selectedRefs.filter((n) => n !== note);
  }
  // 上限到達で他をグレーアウトする等、チェック状態を反映するため再描画
  renderReferenceList();
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
  // 区分が変わったら本文を再生成（メモがあれば AI、無ければテンプレ）
  if (state.selectedTask) {
    regenerateNote();
    // 居宅は区分ごとに参考記録が変わるので取り直す（チェックもリセットされる）
    loadSamples(state.selectedTask);
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

// メモ → 記録本文 自動生成（AI 整形）
formRegenButton.addEventListener("click", () => {
  regenerateNote();
});

formMemo.addEventListener("blur", () => {
  // メモ入力を終えたら本文を再生成（手動編集・AI生成済みは上書きしない）
  if (!state.selectedTask) return;
  const auto = generateFinalNote(state.selectedTask, "");
  if (formFinalNote.value === auto || formFinalNote.value.trim() === "") {
    regenerateNote();
  }
});

function generateFinalNote(task, memo) {
  const dateLabel = task.service_date || "";
  const timeRange = formatTimeRange(task.start_time, task.end_time);
  const userName = task.user_name || task.userName || "";
  const taskName = state.selectedCategoryValue || task.task || "";
  const memoSegment = memo && memo.trim() ? `\n${memo.trim()}` : "";

  if (state.currentCategory === "home") {
    return `${dateLabel} ${timeRange}、${userName}様へ${taskName}を実施しました。${memoSegment ? "実施内容: " + memo.trim() : "実施内容: 必要な支援を行いました。"}`;
  } else {
    return `${dateLabel} ${timeRange}、${userName}様の${taskName || "移動支援"}を実施しました。${memoSegment ? memo.trim() : "予定通りに支援しました。"}`;
  }
}

// ─── AI 整形（既存 generateSummary エンドポイント流用） ─────
//   - メモの有無に関わらず AI を呼ぶ。メモが空でも区分・参考記録の書きぶりから
//     一般的な支援内容の下書きを生成する（保存前に必ず人間が確認する前提）。
//   - 居宅 → /service-records-home/summary / 移動 → /service-records-move/summary（gpt-4o-mini）
//   - API 失敗・空応答時はローカルテンプレにフォールバックして画面を固めない
const HOME_SUMMARY_ENDPOINT = `${API_BASE}/service-records-home/summary`;
const MOVE_SUMMARY_ENDPOINT = `${API_BASE}/service-records-move/summary`;

let isGenerating = false;

async function regenerateNote() {
  if (!state.selectedTask) return;

  const task = state.selectedTask;
  const memo = formMemo.value.trim();

  if (isGenerating) return;
  isGenerating = true;
  formRegenButton.disabled = true;
  formStatus.textContent = "🤖 生成中…";
  formStatus.className = "status";

  try {
    const result =
      state.currentCategory === "home"
        ? await fetchAiSummaryHome(task, memo)
        : await fetchAiSummaryMove(task, memo);

    const summaryText = (result.summaryText || "").trim();

    if (summaryText) {
      formFinalNote.value = summaryText;
      if (result.source === "fallback") {
        // サーバー側が AI 生成に失敗し簡易テンプレを返したケース
        formStatus.textContent =
          "⚠️ AI 生成に失敗し簡易テンプレを表示中。内容を確認してください。";
        formStatus.className = "status is-error";
      } else {
        formStatus.textContent = "✨ AI 整形完了";
        formStatus.className = "status is-success";
      }
    } else {
      formFinalNote.value = generateFinalNote(task, memo);
      formStatus.textContent = "AI が空を返したためテンプレを表示しました。";
      formStatus.className = "status is-error";
    }
  } catch (err) {
    console.error("[owner-record] ai summary error:", err);
    // フォールバック: ローカルテンプレで画面を固めない
    formFinalNote.value = generateFinalNote(task, memo);
    formStatus.textContent =
      "AI 整形に失敗したためテンプレを表示しました: " +
      (err.message || "不明エラー");
    formStatus.className = "status is-error";
  } finally {
    isGenerating = false;
    formRegenButton.disabled = false;
  }
}

async function fetchAiSummaryHome(task, memo) {
  const body = {
    helperName: task.helper_name || "",
    userName: task.user_name || task.userName || "",
    serviceDate: task.service_date || "",
    startTime: task.start_time || "",
    endTime: task.end_time || "",
    category: state.selectedCategoryValue || task.task || "",
    items: [], // 構造化項目（実施項目）は qrec では省略
    otherDetail: "",
    memo,
    // チェックした参考記録がある場合のみ渡す（0件なら従来どおりの生成）
    ...(state.selectedRefs.length > 0
      ? { referenceNotes: state.selectedRefs }
      : {}),
  };
  const res = await fetch(HOME_SUMMARY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return { summaryText: data.summaryText, source: data.source };
}

async function fetchAiSummaryMove(task, memo) {
  const body = {
    helperName: task.helper_name || "",
    userName: task.user_name || task.userName || "",
    serviceDate: task.service_date || "",
    startTime: task.start_time || "",
    endTime: task.end_time || "",
    task: task.task || "",
    notes: memo,
    // チェックした参考記録がある場合のみ渡す（0件なら従来どおりの生成）
    ...(state.selectedRefs.length > 0
      ? { referenceNotes: state.selectedRefs }
      : {}),
  };
  const res = await fetch(MOVE_SUMMARY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return { summaryText: data.summaryText, source: data.source };
}

// ─── 保存処理 ─────────────────────────────────────────
// タスクの一意キー。移動は taskId、居宅は id を持つため両対応する。
function taskKey(t) {
  return t.taskId || t.id;
}

formSaveNext.addEventListener("click", () => save({ next: true }));
formSaveClose.addEventListener("click", () => save({ next: false }));

async function save({ next }) {
  if (state.isSaving || !state.selectedTask) return;

  const memo = formMemo.value.trim();
  const finalNote = formFinalNote.value.trim();

  // メモは任意（空メモでもAI生成した記録本文があれば保存できる）。
  // 保存を止めるのは記録本文が空のときだけ。
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

    // 一覧から削除（移動=taskId / 居宅=id の両対応キーで照合）
    const savedKey = taskKey(state.selectedTask);
    if (state.currentCategory === "home") {
      state.homeTasks = state.homeTasks.filter((t) => taskKey(t) !== savedKey);
    } else {
      state.moveTasks = state.moveTasks.filter((t) => taskKey(t) !== savedKey);
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
    userName: task.user_name || task.userName,
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
  // 移動の unwritten は camelCase 変換済み(taskId/serviceDate/helperName…)を返す。
  // 居宅は snake_case 生データ。両対応のため camelCase 優先 + snake_case フォールバック。
  const body = {
    taskId: task.taskId || task.id || (task.raw && task.raw.id),
    helperEmail: task.helperEmail || task.helper_email || state.email,
    helperName: task.helperName || task.helper_name,
    userName: task.user_name || task.userName,
    serviceDate: task.serviceDate || task.service_date,
    startTime: task.startTime || task.start_time || "",
    endTime: task.endTime || task.end_time || "",
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
