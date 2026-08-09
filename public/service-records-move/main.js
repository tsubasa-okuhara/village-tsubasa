const BASE_URL = "/api";

// 未記入一覧の下限日（表示用ラベル）。実際の絞り込みはサーバー側が行う。
// 変更するときは functions/src/lib/recordCutoff.ts と必ずセットで直す。
const RECORD_LIST_CUTOFF_LABEL = "2026年8月1日";

const MOVE_UNWRITTEN_ENDPOINT = `${BASE_URL}/service-records-move/unwritten`;
const MOVE_SUMMARY_ENDPOINT = `${BASE_URL}/service-records-move/summary`;
const MOVE_SAVE_ENDPOINT = `${BASE_URL}/service-records-move/save`;

// 構造化ログ（/service-records-structured/*）への参照はすべて削除した（2026-08-03）。
// 保存先3テーブルが旧DB にしか無く、8月以降の記録には保存先が存在しないため。
// 詳細は index.html の同名コメントを参照。

const HELPER_EMAIL_STORAGE_KEY = "helper_email";

function getSavedHelperEmail() {
  try {
    const saved = window.localStorage.getItem(HELPER_EMAIL_STORAGE_KEY);
    return saved ? saved.trim() : "";
  } catch (_error) {
    return "";
  }
}

function saveHelperEmailToStorage(helperEmail) {
  const normalized = String(helperEmail || "").trim();
  if (!normalized) return;
  try {
    window.localStorage.setItem(HELPER_EMAIL_STORAGE_KEY, normalized);
  } catch (_error) {
    // localStorage unavailable — silently ignore
  }
}

const state = {
  helperEmail: "",
  items: [],
  selectedTask: null,
};

function getRequiredElement(id) {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`missing element: ${id}`);
  }

  return element;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getDisplayValue(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatTimeRange(item) {
  const startTime = getDisplayValue(item.startTime, "");
  const endTime = getDisplayValue(item.endTime, "");

  if (startTime && endTime) {
    return `${startTime}〜${endTime}`;
  }

  return startTime || endTime || "時間未設定";
}

function setStatus(element, message, type) {
  element.textContent = message;
  element.classList.remove("is-error", "is-success", "is-warning");

  if (type) {
    element.classList.add(type);
  }
}

const filterFormElement = getRequiredElement("move-records-filter-form");
const helperEmailElement = getRequiredElement("move-helper-email");
const listStatusElement = getRequiredElement("move-records-list-status");
const listElement = getRequiredElement("move-records-list");
const selectedSummaryElement = getRequiredElement(
  "move-records-selected-summary",
);
const entryFormElement = getRequiredElement("move-records-entry-form");
const notesElement = getRequiredElement("move-support-notes");
const summaryTextElement = getRequiredElement("move-summary-text");
const generateSummaryButtonElement = getRequiredElement(
  "move-generate-summary-button",
);
const saveStatusElement = getRequiredElement("move-records-save-status");
const saveRetryAreaElement = getRequiredElement("move-save-retry-area");
const retrySaveButtonElement = getRequiredElement("move-retry-save-button");

function renderTaskList() {
  if (!Array.isArray(state.items) || state.items.length === 0) {
    listElement.innerHTML = "";
    return;
  }

  listElement.innerHTML = state.items
    .map(function (item) {
      const isSelected =
        state.selectedTask && state.selectedTask.taskId === item.taskId;

      return `
        <button
          type="button"
          class="move-records-task-card ${isSelected ? "is-selected" : ""}"
          data-task-id="${escapeHtml(item.taskId)}"
        >
          <div class="move-records-task-card__title">
            ${escapeHtml(getDisplayValue(item.userName, "利用者未設定"))}
          </div>
          <div class="move-records-task-card__meta">
            <div>担当: ${escapeHtml(getDisplayValue(item.helperName, "担当未設定"))}</div>
            <div>日付: ${escapeHtml(getDisplayValue(item.serviceDate, "日付未設定"))}</div>
            <div>時間: ${escapeHtml(formatTimeRange(item))}</div>
            <div>内容: ${escapeHtml(getDisplayValue(item.task, "移動支援"))}</div>
          </div>
        </button>
      `;
    })
    .join("");

  listElement
    .querySelectorAll("[data-task-id]")
    .forEach(function (buttonElement) {
      buttonElement.addEventListener("click", function () {
        const taskId = buttonElement.getAttribute("data-task-id");
        const selectedTask =
          state.items.find(function (item) {
            return item.taskId === taskId;
          }) || null;

        state.selectedTask = selectedTask;
        renderTaskList();
        renderSelectedTask();
      });
    });
}

function renderSelectedTask() {
  if (!state.selectedTask) {
    selectedSummaryElement.innerHTML = "予定を選択すると詳細が表示されます。";
    return;
  }

  const item = state.selectedTask;

  selectedSummaryElement.innerHTML = `
    <div class="move-records-selected-card__title">
      ${escapeHtml(getDisplayValue(item.userName, "利用者未設定"))}
    </div>
    <div class="move-records-selected-card__meta">
      <div>担当: ${escapeHtml(getDisplayValue(item.helperName, "担当未設定"))}</div>
      <div>helper_email: ${escapeHtml(getDisplayValue(item.helperEmail, "未設定"))}</div>
      <div>日付: ${escapeHtml(getDisplayValue(item.serviceDate, "日付未設定"))}</div>
      <div>時間: ${escapeHtml(formatTimeRange(item))}</div>
      <div>配車: ${escapeHtml(getDisplayValue(item.haisha, "—"))}</div>
      <div>内容: ${escapeHtml(getDisplayValue(item.task, "移動支援"))}</div>
    </div>
    <div class="move-records-selected-card__summary">
      予定概要: ${escapeHtml(getDisplayValue(item.summary, "概要なし"))}
    </div>
  `;

  setStatus(
    saveStatusElement,
    "記録本文を入力して AI 記録案を作成してください。",
  );
}

async function fetchUnwrittenTasks(helperEmail) {
  const url = `${MOVE_UNWRITTEN_ENDPOINT}?helper_email=${encodeURIComponent(helperEmail)}`;
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.message || "failed to fetch move tasks");
  }

  return data.items || [];
}

async function generateSummary() {
  if (!state.selectedTask) {
    setStatus(saveStatusElement, "先に予定を1件選択してください。", "is-error");
    return;
  }

  const notes = String(notesElement.value || "").trim();

  if (!notes) {
    setStatus(
      saveStatusElement,
      "支援内容メモを入力してください。",
      "is-error",
    );
    return;
  }

  setStatus(saveStatusElement, "AI 記録案を作成しています...");

  const payload = {
    helperName: state.selectedTask.helperName,
    userName: state.selectedTask.userName,
    serviceDate: state.selectedTask.serviceDate,
    startTime: state.selectedTask.startTime,
    endTime: state.selectedTask.endTime,
    task: state.selectedTask.task,
    notes,
  };

  try {
    const response = await fetch(MOVE_SUMMARY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "failed to generate summary");
    }

    summaryTextElement.value = data.summaryText || "";
    if (data.source === "fallback") {
      setStatus(
        saveStatusElement,
        "AI 要約の生成に失敗しました。テンプレートを表示しています。内容を確認して保存してください。",
        "is-warning",
      );
    } else {
      setStatus(
        saveStatusElement,
        "AI 記録案を表示しました。内容を確認して保存してください。",
        "is-success",
      );
    }
  } catch (error) {
    console.error("[service-records-move] summary error:", error);
    setStatus(saveStatusElement, "AI 記録案の作成に失敗しました。", "is-error");
  }
}

async function doSaveRecord() {
  if (!state.selectedTask) {
    setStatus(
      saveStatusElement,
      "保存する予定を1件選択してください。",
      "is-error",
    );
    return;
  }

  const notes = String(notesElement.value || "").trim();
  const summaryText = String(summaryTextElement.value || "").trim();

  if (!notes || !summaryText) {
    setStatus(
      saveStatusElement,
      "支援内容メモと AI 記録案の両方が必要です。",
      "is-error",
    );
    return;
  }

  saveRetryAreaElement.hidden = true;
  setStatus(saveStatusElement, "保存しています...");

  const payload = {
    taskId: state.selectedTask.taskId,
    helperEmail: state.selectedTask.helperEmail,
    helperName: state.selectedTask.helperName,
    userName: state.selectedTask.userName,
    serviceDate: state.selectedTask.serviceDate,
    startTime: state.selectedTask.startTime,
    endTime: state.selectedTask.endTime,
    task: state.selectedTask.task,
    haisha: state.selectedTask.haisha,
    notes,
    summaryText,
  };

  try {
    const response = await fetch(MOVE_SAVE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "failed to save move record");
    }

    notesElement.value = "";
    summaryTextElement.value = "";
    state.selectedTask = null;
    setStatus(saveStatusElement, "保存しました。未記入予定一覧を再読み込みします。", "is-success");

    state.items = await fetchUnwrittenTasks(state.helperEmail);
    renderTaskList();
    renderSelectedTask();
    setStatus(
      listStatusElement,
      `${state.items.length}件の未記入予定を表示しています。helper_email: ${state.helperEmail}`,
      "is-success",
    );
  } catch (error) {
    console.error("[service-records-move] save error:", error);
    // サーバは「すでに保存済み」「予定が見つからない」等を日本語の message で返す。
    // 固定文言に潰すと、再試行しても直らない理由がヘルパーに伝わらない。
    const message =
      error instanceof Error && error.message
        ? error.message
        : "保存に失敗しました。時間をおいて再試行してください。";
    setStatus(saveStatusElement, message, "is-error");
    saveRetryAreaElement.hidden = false;
  }
}

filterFormElement.addEventListener("submit", async function (event) {
  event.preventDefault();

  const helperEmail = String(helperEmailElement.value || "").trim();

  if (!helperEmail) {
    setStatus(
      listStatusElement,
      "helper_email を入力してください。",
      "is-error",
    );
    return;
  }

  saveHelperEmailToStorage(helperEmail);
  state.helperEmail = helperEmail;
  state.selectedTask = null;
  setStatus(listStatusElement, "未記入予定を取得しています...");

  try {
    state.items = await fetchUnwrittenTasks(helperEmail);
    renderTaskList();
    renderSelectedTask();

    if (state.items.length === 0) {
      // 0件でも「壊れた」と誤解されないよう、表示範囲の下限を必ず添える
      setStatus(
        listStatusElement,
        `${RECORD_LIST_CUTOFF_LABEL}以降の未記入予定はありません。（7月以前の記録は事業所側で確認します）`,
      );
      return;
    }

    setStatus(
      listStatusElement,
      `${state.items.length}件の未記入予定を表示しています。helper_email: ${helperEmail}`,
      "is-success",
    );
  } catch (error) {
    console.error("[service-records-move] list error:", error);
    state.items = [];
    renderTaskList();
    renderSelectedTask();
    setStatus(
      listStatusElement,
      "未記入予定の取得に失敗しました。",
      "is-error",
    );
  }
});

generateSummaryButtonElement.addEventListener("click", generateSummary);
entryFormElement.addEventListener("submit", function (event) {
  event.preventDefault();
  doSaveRecord();
});
retrySaveButtonElement.addEventListener("click", doSaveRecord);

// Restore saved helper email from localStorage on page load
(function restoreHelperEmail() {
  const urlParams = new URLSearchParams(window.location.search);
  const fromUrl = urlParams.get("helper_email");
  const email = fromUrl ? fromUrl.trim() : getSavedHelperEmail();
  if (email) {
    helperEmailElement.value = email;
  }
})();
