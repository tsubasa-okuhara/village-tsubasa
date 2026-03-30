const BASE_URL = "/api";

const MOVE_UNWRITTEN_ENDPOINT = `${BASE_URL}/service-records-move/unwritten`;
const MOVE_SUMMARY_ENDPOINT = `${BASE_URL}/service-records-move/summary`;
const MOVE_SAVE_ENDPOINT = `${BASE_URL}/service-records-move/save`;
const STRUCTURED_OPTIONS_ENDPOINT = `${BASE_URL}/service-records-structured/options`;
const STRUCTURED_SAVE_ENDPOINT = `${BASE_URL}/service-records-structured/save`;

const FALLBACK_STRUCTURED_OPTIONS = {
  sourceTypes: ["move"],
  physicalStates: ["良好", "不安定", "疲労", "その他"],
  mentalStates: ["落ち着き", "不穏", "拒否", "無反応"],
  riskFlags: [
    "転倒リスク",
    "ふらつき",
    "交通量多い",
    "段差注意",
    "混雑あり",
    "待機長い",
    "体調不安",
  ],
  actionTypes: [
    "移動",
    "乗車",
    "降車",
    "歩行見守り",
    "買い物同行",
    "声かけ",
    "安全確認",
  ],
  actionDetailsByType: {
    移動: ["徒歩移動", "バス利用", "電車利用", "タクシー利用", "施設間移動"],
    乗車: ["車両乗り込み支援", "シート着席支援", "手すり利用確認"],
    降車: ["車両降り支援", "足元確認", "周囲安全確認"],
    歩行見守り: ["屋外歩行見守り", "横断歩道見守り", "段差通過支援"],
    買い物同行: ["店舗内同行", "商品確認支援", "会計同行"],
    声かけ: ["移動促し", "不安軽減", "順番案内"],
    安全確認: ["周囲確認", "体調確認", "持ち物確認"],
  },
  actors: ["helper", "user"],
  targets: ["利用者"],
  actionResults: ["成功", "失敗"],
  difficulties: ["楽", "普通", "大変"],
  assistLevels: ["全介助", "半介助", "見守り"],
  eventTypes: ["転倒未遂", "拒否", "体調変化", "遅延", "その他"],
  locations: ["indoor", "outdoor", "transit", "facility", "home"],
  timeOfDay: ["朝", "昼", "夕"],
};

const state = {
  helperEmail: "",
  items: [],
  selectedTask: null,
  structuredOptions: FALLBACK_STRUCTURED_OPTIONS,
  pendingStructuredSourceNoteId: null,
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
  element.classList.remove("is-error", "is-success");

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
const structuredRetryAreaElement = getRequiredElement("move-structured-retry-area");
const retryStructuredButtonElement = getRequiredElement("move-retry-structured-button");
const physicalStateElement = getRequiredElement("structured-physical-state");
const mentalStateElement = getRequiredElement("structured-mental-state");
const riskFlagsElement = getRequiredElement("structured-risk-flags");
const assistLevelElement = getRequiredElement("structured-assist-level");
const actionResultElement = getRequiredElement("structured-action-result");
const difficultyElement = getRequiredElement("structured-difficulty");
const timeOfDayElement = getRequiredElement("structured-time-of-day");
const actionTypeElement = getRequiredElement("structured-action-type");
const actionDetailElement = getRequiredElement("structured-action-detail");
const actionDetailOtherElement = getRequiredElement("structured-action-detail-other");
const actorElement = getRequiredElement("structured-actor");
const targetElement = getRequiredElement("structured-target");
const actionStartTimeElement = getRequiredElement("structured-action-start-time");
const actionEndTimeElement = getRequiredElement("structured-action-end-time");
const durationElement = getRequiredElement("structured-duration");
const locationElement = getRequiredElement("structured-location");
const temperatureElement = getRequiredElement("structured-temperature");
const locationNoteElement = getRequiredElement("structured-location-note");
const eventTypeElement = getRequiredElement("structured-event-type");
const beforeStateElement = getRequiredElement("structured-before-state");
const afterActionElement = getRequiredElement("structured-after-action");

function fillSelectOptions(selectElement, values, placeholder) {
  const currentValue = String(selectElement.value || "");
  const optionsHtml = [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(
      values.map(function (value) {
        return `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`;
      }),
    )
    .join("");

  selectElement.innerHTML = optionsHtml;
  selectElement.value = values.includes(currentValue) ? currentValue : "";
}

function renderRiskFlagOptions() {
  riskFlagsElement.innerHTML = state.structuredOptions.riskFlags
    .map(function (value, index) {
      const id = `structured-risk-flag-${index}`;
      return `
        <label class="move-records-check" for="${escapeHtml(id)}">
          <input id="${escapeHtml(id)}" type="checkbox" name="structuredRiskFlags" value="${escapeHtml(value)}" />
          <span>${escapeHtml(value)}</span>
        </label>
      `;
    })
    .join("");
}

function renderActionDetailOptions() {
  const actionType = String(actionTypeElement.value || "");
  const actionDetails =
    state.structuredOptions.actionDetailsByType[actionType] || [];
  fillSelectOptions(actionDetailElement, actionDetails, "選択してください");
}

function renderStructuredOptions() {
  fillSelectOptions(physicalStateElement, state.structuredOptions.physicalStates, "選択してください");
  fillSelectOptions(mentalStateElement, state.structuredOptions.mentalStates, "選択してください");
  fillSelectOptions(assistLevelElement, state.structuredOptions.assistLevels, "選択してください");
  fillSelectOptions(actionResultElement, state.structuredOptions.actionResults, "選択してください");
  fillSelectOptions(difficultyElement, state.structuredOptions.difficulties, "選択してください");
  fillSelectOptions(timeOfDayElement, state.structuredOptions.timeOfDay, "選択してください");
  fillSelectOptions(actionTypeElement, state.structuredOptions.actionTypes, "選択してください");
  fillSelectOptions(actorElement, state.structuredOptions.actors, "選択してください");
  fillSelectOptions(targetElement, state.structuredOptions.targets, "選択してください");
  fillSelectOptions(locationElement, state.structuredOptions.locations, "選択してください");
  fillSelectOptions(eventTypeElement, state.structuredOptions.eventTypes, "なし");
  renderRiskFlagOptions();
  renderActionDetailOptions();
}

async function loadStructuredOptions() {
  try {
    const response = await fetch(STRUCTURED_OPTIONS_ENDPOINT);
    const data = await response.json();

    if (response.ok && data.ok && data.options) {
      state.structuredOptions = data.options;
    }
  } catch (error) {
    console.error("[service-records-move] structured options error:", error);
  }

  renderStructuredOptions();
}

function getCheckedValues(containerElement) {
  return Array.from(
    containerElement.querySelectorAll('input[type="checkbox"]:checked'),
  ).map(function (inputElement) {
    return String(inputElement.value || "").trim();
  });
}

function normalizeOptionalNumber(value) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function normalizeOptionalText(value) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue || null;
}

function resetStructuredForm() {
  physicalStateElement.value = "";
  mentalStateElement.value = "";
  assistLevelElement.value = "";
  actionResultElement.value = "";
  difficultyElement.value = "";
  timeOfDayElement.value = "";
  actionTypeElement.value = "";
  actionDetailElement.value = "";
  actionDetailOtherElement.value = "";
  actorElement.value = "helper";
  targetElement.value = "利用者";
  actionStartTimeElement.value = "";
  actionEndTimeElement.value = "";
  durationElement.value = "";
  locationElement.value = "";
  temperatureElement.value = "";
  locationNoteElement.value = "";
  eventTypeElement.value = "";
  beforeStateElement.value = "";
  afterActionElement.value = "";

  riskFlagsElement
    .querySelectorAll('input[type="checkbox"]')
    .forEach(function (inputElement) {
      inputElement.checked = false;
    });

  renderActionDetailOptions();
}

function buildStructuredPayload(sourceNoteId) {
  const actionType = normalizeOptionalText(actionTypeElement.value);
  const eventType = normalizeOptionalText(eventTypeElement.value);
  const riskFlags = getCheckedValues(riskFlagsElement);

  const payload = {
    sourceType: "move",
    sourceNoteId,
    scheduleTaskId: state.selectedTask ? state.selectedTask.taskId : null,
    helperEmail: state.selectedTask ? state.selectedTask.helperEmail : null,
    helperName: state.selectedTask ? state.selectedTask.helperName : null,
    userName: state.selectedTask ? state.selectedTask.userName : null,
    serviceDate: state.selectedTask ? state.selectedTask.serviceDate : null,
    startTime: state.selectedTask ? state.selectedTask.startTime : null,
    endTime: state.selectedTask ? state.selectedTask.endTime : null,
    location: normalizeOptionalText(locationElement.value),
    locationNote: normalizeOptionalText(locationNoteElement.value),
    timeOfDay: normalizeOptionalText(timeOfDayElement.value),
    temperature: normalizeOptionalNumber(temperatureElement.value),
    physicalState: normalizeOptionalText(physicalStateElement.value),
    mentalState: normalizeOptionalText(mentalStateElement.value),
    riskFlags,
    actionResult: normalizeOptionalText(actionResultElement.value),
    difficulty: normalizeOptionalText(difficultyElement.value),
    assistLevel: normalizeOptionalText(assistLevelElement.value),
    actions: [],
    irregularEvents: [],
  };

  if (actionType) {
    payload.actions.push({
      actionType,
      actionDetail: normalizeOptionalText(actionDetailElement.value),
      actionDetailOther: normalizeOptionalText(actionDetailOtherElement.value),
      actor: normalizeOptionalText(actorElement.value) || "helper",
      target: normalizeOptionalText(targetElement.value) || "利用者",
      startTime: normalizeOptionalText(actionStartTimeElement.value),
      endTime: normalizeOptionalText(actionEndTimeElement.value),
      duration: normalizeOptionalNumber(durationElement.value),
      actionResult: payload.actionResult,
      difficulty: payload.difficulty,
      assistLevel: payload.assistLevel,
    });
  }

  if (eventType) {
    payload.irregularEvents.push({
      eventType,
      beforeState: normalizeOptionalText(beforeStateElement.value),
      afterAction: normalizeOptionalText(afterActionElement.value),
    });
  }

  return payload;
}

function hasStructuredInput() {
  const actionStartTime = normalizeOptionalText(actionStartTimeElement.value);
  const actionEndTime = normalizeOptionalText(actionEndTimeElement.value);
  const duration = normalizeOptionalNumber(durationElement.value);
  const checkedRiskFlags = getCheckedValues(riskFlagsElement);

  return Boolean(
    normalizeOptionalText(physicalStateElement.value) ||
      normalizeOptionalText(mentalStateElement.value) ||
      normalizeOptionalText(assistLevelElement.value) ||
      normalizeOptionalText(actionResultElement.value) ||
      normalizeOptionalText(difficultyElement.value) ||
      normalizeOptionalText(timeOfDayElement.value) ||
      normalizeOptionalText(actionTypeElement.value) ||
      normalizeOptionalText(actionDetailElement.value) ||
      normalizeOptionalText(actionDetailOtherElement.value) ||
      normalizeOptionalText(locationElement.value) ||
      normalizeOptionalText(locationNoteElement.value) ||
      normalizeOptionalNumber(temperatureElement.value) !== null ||
      normalizeOptionalText(eventTypeElement.value) ||
      normalizeOptionalText(beforeStateElement.value) ||
      normalizeOptionalText(afterActionElement.value) ||
      actionStartTime ||
      actionEndTime ||
      duration !== null ||
      String(actorElement.value || "").trim() === "user" ||
      checkedRiskFlags.length > 0
  );
}

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
    setStatus(
      saveStatusElement,
      data.source === "fallback"
        ? "フォールバックの記録案を表示しました。内容を確認して保存してください。"
        : "AI 記録案を表示しました。内容を確認して保存してください。",
      "is-success",
    );
  } catch (error) {
    console.error("[service-records-move] summary error:", error);
    setStatus(saveStatusElement, "AI 記録案の作成に失敗しました。", "is-error");
  }
}

async function saveStructuredRecord(sourceNoteId) {
  const structuredResponse = await fetch(STRUCTURED_SAVE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildStructuredPayload(sourceNoteId)),
  });

  const structuredData = await structuredResponse.json();

  if (!structuredResponse.ok || !structuredData.ok) {
    throw new Error(structuredData.message || "failed to save structured record");
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

    const sourceNoteId = String(data.recordId || "").trim();
    let structuredSaveFailed = false;

    if (hasStructuredInput()) {
      try {
        if (!sourceNoteId) {
          throw new Error("missing move record id");
        }

        await saveStructuredRecord(sourceNoteId);
      } catch (error) {
        structuredSaveFailed = true;
        console.error("[service-records-move] structured save error:", error);
      }
    }

    notesElement.value = "";
    summaryTextElement.value = "";

    if (structuredSaveFailed) {
      state.pendingStructuredSourceNoteId = sourceNoteId;
      structuredRetryAreaElement.hidden = false;
      setStatus(
        saveStatusElement,
        "記録本文は保存しました。構造化ログの保存に失敗しました。内容を確認して再保存してください。",
        "is-error",
      );
    } else {
      structuredRetryAreaElement.hidden = true;
      state.pendingStructuredSourceNoteId = null;
      resetStructuredForm();
      state.selectedTask = null;
      setStatus(saveStatusElement, "保存しました。未記入予定一覧を再読み込みします。", "is-success");
    }

    state.items = await fetchUnwrittenTasks(state.helperEmail);
    renderTaskList();
    if (!structuredSaveFailed) {
      renderSelectedTask();
    }
    setStatus(
      listStatusElement,
      `${state.items.length}件の未記入予定を表示しています。helper_email: ${state.helperEmail}`,
      "is-success",
    );
  } catch (error) {
    console.error("[service-records-move] save error:", error);
    setStatus(saveStatusElement, "保存に失敗しました。時間をおいて再試行してください。", "is-error");
    saveRetryAreaElement.hidden = false;
  }
}

async function retryStructuredRecord() {
  const sourceNoteId = state.pendingStructuredSourceNoteId;

  if (!sourceNoteId) {
    setStatus(saveStatusElement, "再保存に必要な情報がありません。", "is-error");
    return;
  }

  retryStructuredButtonElement.disabled = true;
  setStatus(saveStatusElement, "構造化ログを再保存しています...");

  try {
    await saveStructuredRecord(sourceNoteId);

    structuredRetryAreaElement.hidden = true;
    state.pendingStructuredSourceNoteId = null;
    resetStructuredForm();
    state.selectedTask = null;
    renderSelectedTask();
    setStatus(saveStatusElement, "構造化ログを保存しました。", "is-success");
  } catch (error) {
    console.error("[service-records-move] structured retry error:", error);
    setStatus(saveStatusElement, "構造化ログの再保存に失敗しました。再度お試しください。", "is-error");
  } finally {
    retryStructuredButtonElement.disabled = false;
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

  state.helperEmail = helperEmail;
  state.selectedTask = null;
  setStatus(listStatusElement, "未記入予定を取得しています...");

  try {
    state.items = await fetchUnwrittenTasks(helperEmail);
    renderTaskList();
    renderSelectedTask();
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

actionTypeElement.addEventListener("change", renderActionDetailOptions);
generateSummaryButtonElement.addEventListener("click", generateSummary);
entryFormElement.addEventListener("submit", function (event) {
  event.preventDefault();
  doSaveRecord();
});
retrySaveButtonElement.addEventListener("click", doSaveRecord);
retryStructuredButtonElement.addEventListener("click", retryStructuredRecord);
loadStructuredOptions();
resetStructuredForm();
