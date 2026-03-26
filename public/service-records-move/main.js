const BASE_URL = "http://127.0.0.1:5001/village-tsubasa/asia-northeast1/api";

const state = {
  helperEmail: "",
  items: [],
  selectedId: null,
  isLoading: false,
  isSaving: false,
};

const macroGroupMap = {
  move: "group-move",
  condition: "group-condition",
  toilet: "group-toilet",
  weather: "group-weather",
  mealHydration: "group-meal-hydration",
  medication: "group-medication",
  communication: "group-communication",
};

const helperEmailInput = document.getElementById("helper-email");
const loadButton = document.getElementById("load-button");
const loadingText = document.getElementById("loading-text");
const errorMessage = document.getElementById("error-message");
const successMessage = document.getElementById("success-message");
const listCount = document.getElementById("list-count");
const emptyState = document.getElementById("empty-state");
const recordsList = document.getElementById("records-list");
const selectedStatus = document.getElementById("selected-status");
const scheduleOverview = document.getElementById("schedule-overview");
const destinationInput = document.getElementById("destination-input");
const supportInput = document.getElementById("support-input");
const memoText = document.getElementById("memo-text");
const draftText = document.getElementById("draft-text");
const draftButton = document.getElementById("draft-button");
const recordText = document.getElementById("record-text");
const saveButton = document.getElementById("save-button");
const macroInputs = {
  move: document.getElementById("macro-move"),
  condition: document.getElementById("macro-condition"),
  toilet: document.getElementById("macro-toilet"),
  weather: document.getElementById("macro-weather"),
  mealHydration: document.getElementById("macro-meal-hydration"),
  medication: document.getElementById("macro-medication"),
  communication: document.getElementById("macro-communication"),
};

function formatDate(value) {
  return value || "-";
}

function formatTimeRange(item) {
  const start = item.startTime || "--:--";
  const end = item.endTime || "--:--";
  return `${start} - ${end}`;
}

function formatDateTime(item) {
  return `${formatDate(item.serviceDate)} ${formatTimeRange(item)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSelectedItem() {
  return state.items.find((item) => item.id === state.selectedId) || null;
}

function getCheckedValues(name) {
  return Array.from(
    document.querySelectorAll(`input[name="${name}"]:checked`),
  ).map((input) => input.value);
}

function getSelectedRadioValue(name) {
  const input = document.querySelector(`input[name="${name}"]:checked`);
  return input ? input.value : "";
}

function setError(message) {
  errorMessage.textContent = message || "";
}

function setSuccess(message) {
  successMessage.textContent = message || "";
}

function getSummaryText(item) {
  if (!item) {
    return "";
  }

  if (item.summaryText && item.summaryText.trim()) {
    return item.summaryText.trim();
  }

  if (item.summary_text && item.summary_text.trim()) {
    return item.summary_text.trim();
  }

  return "";
}

function inferDestination(item) {
  const summaryText = getSummaryText(item);

  if (summaryText) {
    return summaryText;
  }

  if (item.summary && item.summary.trim()) {
    return item.summary.trim();
  }

  if (item.task && item.task.trim()) {
    return item.task.trim();
  }

  return "行先未設定";
}

function inferSupport(item) {
  const summaryText = getSummaryText(item);

  if (item.task && item.task.trim()) {
    return item.task.trim();
  }

  if (summaryText) {
    return summaryText;
  }

  if (item.summary && item.summary.trim()) {
    return item.summary.trim();
  }

  return "移動支援";
}

function clearOptionInputs() {
  document
    .querySelectorAll(
      '.detail-group input[type="checkbox"], .detail-group input[type="radio"]',
    )
    .forEach((input) => {
      input.checked = false;
    });
}

function resetFormForSelection() {
  const selectedItem = getSelectedItem();

  clearOptionInputs();
  Object.values(macroInputs).forEach((input) => {
    input.checked = false;
  });

  destinationInput.value = selectedItem ? inferDestination(selectedItem) : "";
  supportInput.value = selectedItem ? inferSupport(selectedItem) : "";
  memoText.value = "";
  draftText.value = "";
  recordText.value = "";

  updateConditionalSections();
  renderWorkspace();
}

function updateConditionalSections() {
  Object.entries(macroGroupMap).forEach(([key, groupId]) => {
    const group = document.getElementById(groupId);
    const isChecked = macroInputs[key].checked;
    group.hidden = !isChecked;
  });
}

function collectFormData() {
  const selectedItem = getSelectedItem();
  const memo = memoText.value.trim();
  const recordBody = recordText.value.trim();

  return {
    helperEmail: helperEmailInput.value.trim(),
    selectedItem,
    schedule: selectedItem
      ? {
          id: selectedItem.id,
          userName: selectedItem.userName || "",
          serviceDate: selectedItem.serviceDate || "",
          timeRange: formatTimeRange(selectedItem),
          helperName: selectedItem.helperName || "",
          helperEmail: selectedItem.helperEmail || "",
          destination: destinationInput.value.trim(),
          support: supportInput.value.trim(),
          summaryText: getSummaryText(selectedItem),
        }
      : null,
    macro: {
      move: macroInputs.move.checked,
      condition: macroInputs.condition.checked,
      toilet: macroInputs.toilet.checked,
      weather: macroInputs.weather.checked,
      mealHydration: macroInputs.mealHydration.checked,
      medication: macroInputs.medication.checked,
      communication: macroInputs.communication.checked,
    },
    options: {
      move: getCheckedValues("moveOptions"),
      condition: getCheckedValues("conditionOptions"),
      toilet: getCheckedValues("toiletOptions"),
      weather: getSelectedRadioValue("weatherOption"),
      meal: getSelectedRadioValue("mealOption"),
      hydration: getSelectedRadioValue("hydrationOption"),
      medication: getSelectedRadioValue("medicationOption"),
      communication: getSelectedRadioValue("communicationOption"),
    },
    memo,
    aiDraft: draftText.value.trim(),
    recordBody,
  };
}

function joinValues(values) {
  if (!values || values.length === 0) {
    return "";
  }

  return values.join(" / ");
}

function getDetailLines(formData) {
  return [
    `移動: ${joinValues(formData.options.move) || "-"}`,
    `状態: ${joinValues(formData.options.condition) || "-"}`,
    `トイレ: ${joinValues(formData.options.toilet) || "-"}`,
    `天候: ${formData.options.weather || "-"}`,
    `食事: ${formData.options.meal || "-"}`,
    `水分: ${formData.options.hydration || "-"}`,
    `服薬: ${formData.options.medication || "-"}`,
    `交流: ${formData.options.communication || "-"}`,
  ];
}

function toSentence(value) {
  const trimmed = String(value || "").trim();

  if (!trimmed) {
    return "";
  }

  return /[。.!！?？]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function hasParkTerms(value) {
  return /(公園|遊具|ブランコ|すべり台|ジャングルジム|鉄棒|シーソー)/.test(
    String(value || ""),
  );
}

function buildMoveDraftSentence(moveValues) {
  const values = Array.isArray(moveValues) ? moveValues : [];
  const hasCar = values.includes("車");
  const hasPublicTransport =
    values.includes("バス") || values.includes("電車");
  const hasWalk = values.includes("徒歩");

  if (hasPublicTransport && hasWalk) {
    return "公共交通機関を利用し、必要に応じて徒歩で移動した。";
  }

  if (hasPublicTransport) {
    return "公共交通機関を利用して移動した。";
  }

  if (hasCar && hasWalk) {
    return "移動支援を実施し、必要に応じて徒歩で移動した。";
  }

  if (hasCar) {
    return "移動支援を実施した。";
  }

  if (hasWalk) {
    return "徒歩で移動した。";
  }

  return "";
}

function buildNoteText(formData) {
  if (formData.recordBody) {
    return formData.recordBody;
  }

  if (formData.aiDraft) {
    return formData.aiDraft;
  }

  const lines = [];
  const schedule = formData.schedule;

  if (schedule) {
    lines.push(`行先: ${schedule.destination || "-"}`);
    lines.push(`主な援助内容: ${schedule.support || "-"}`);
  } else {
    lines.push("行先: -");
    lines.push("主な援助内容: -");
  }

  lines.push(...getDetailLines(formData));
  lines.push("");
  lines.push("利用者メモ:");
  lines.push(formData.memo || "-");

  return lines.join("\n").trim();
}

function buildDraftText(formData) {
  const selectedItem = formData.selectedItem;

  if (!selectedItem || !formData.schedule) {
    return "";
  }

  const userName = selectedItem.userName || "利用者";
  const destination = formData.schedule.destination;
  const support = formData.schedule.support;
  const moveText = buildMoveDraftSentence(formData.options.move);
  const conditionText = joinValues(formData.options.condition);
  const toiletText = joinValues(formData.options.toilet);
  const weatherText = formData.options.weather;
  const mealText = formData.options.meal;
  const hydrationText = formData.options.hydration;
  const medicationText = formData.options.medication;
  const communicationText = formData.options.communication;
  const detailSentences = [];
  const hasWalkSupportContext =
    hasParkTerms(destination) || hasParkTerms(support) || hasParkTerms(formData.memo);

  if (hasWalkSupportContext) {
    detailSentences.push(
      "屋外で散歩を取り入れながら、安全に移動支援を行った。",
    );
  } else if (destination && support) {
    detailSentences.push(
      `${destination}への移動に同行し、${support}を行った。`,
    );
  } else if (destination) {
    detailSentences.push(`${destination}までの移動に同行した。`);
  } else if (support) {
    detailSentences.push(`${support}を中心に移動支援を行った。`);
  }

  if (moveText) {
    detailSentences.push(moveText);
  }

  if (conditionText) {
    detailSentences.push(`移動中の様子は${conditionText}。`);
  }

  if (toiletText) {
    detailSentences.push(`トイレ面では${toiletText}。`);
  }

  if (weatherText) {
    detailSentences.push(`天候は${weatherText}。`);
  }

  if (mealText || hydrationText) {
    const intakeParts = [];

    if (mealText) {
      intakeParts.push(`食事は${mealText}`);
    }

    if (hydrationText) {
      intakeParts.push(`水分は${hydrationText}`);
    }

    detailSentences.push(`${intakeParts.join("、")}。`);
  }

  if (medicationText) {
    detailSentences.push(`服薬は${medicationText}。`);
  }

  if (communicationText) {
    detailSentences.push(`周囲との関わりは${communicationText}。`);
  }

  if (formData.memo) {
    if (hasParkTerms(formData.memo)) {
      detailSentences.push(
        "散歩を取り入れながら、無理のない範囲で活動できるよう支援した。",
      );
    } else {
      detailSentences.push(toSentence(formData.memo));
    }
  }

  if (detailSentences.length === 0) {
    detailSentences.push("移動支援を実施し、大きな問題なく経過した。");
  }

  return [
    `${userName}様の移動支援を実施した。`,
    `実施日は${formatDate(selectedItem.serviceDate)}、時間は${formatTimeRange(selectedItem)}。`,
    detailSentences.join(""),
    "今後も安全に配慮しながら支援を継続する。",
  ].join("\n");
}

function renderList() {
  listCount.textContent = `${state.items.length} 件`;

  if (state.items.length === 0) {
    recordsList.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent = state.helperEmail
      ? "未記入予定はありません。"
      : "helper email を入力して一覧を取得してください。";
    return;
  }

  emptyState.hidden = true;
  recordsList.innerHTML = state.items
    .map((item) => {
      const isSelected = item.id === state.selectedId;
      const title = item.userName || item.helperName || "名称未設定";
      const detail = getSummaryText(item) || item.summary || item.task || "内容未設定";
      return `
        <button
          type="button"
          class="record-card${isSelected ? " selected" : ""}"
          data-record-id="${escapeHtml(item.id)}"
        >
          <span class="record-top">
            <strong>${escapeHtml(title)}</strong>
            <span class="record-date">${escapeHtml(formatDateTime(item))}</span>
          </span>
          <span class="record-meta">
            <span>${escapeHtml(item.helperName || "-")}</span>
            <span>${escapeHtml(item.helperEmail || "-")}</span>
          </span>
          <span class="record-detail">${escapeHtml(detail)}</span>
        </button>
      `;
    })
    .join("");
}

function renderWorkspace() {
  const selectedItem = getSelectedItem();
  const formData = collectFormData();
  const hasDraft = formData.aiDraft.length > 0;
  const hasRecordBody = formData.recordBody.length > 0;
  const canSave = Boolean(selectedItem) && (hasDraft || hasRecordBody) && !state.isSaving;

  if (!selectedItem) {
    selectedStatus.textContent = "未選択";
    scheduleOverview.classList.add("empty");
    scheduleOverview.innerHTML = "保存対象を一覧から1件選択してください。";
  } else {
    selectedStatus.textContent = selectedItem.id;
    scheduleOverview.classList.remove("empty");
    scheduleOverview.innerHTML = `
      <div class="overview-grid">
        <div><dt>利用者名</dt><dd>${escapeHtml(selectedItem.userName || "-")}</dd></div>
        <div><dt>日付</dt><dd>${escapeHtml(formatDate(selectedItem.serviceDate))}</dd></div>
        <div><dt>時間</dt><dd>${escapeHtml(formatTimeRange(selectedItem))}</dd></div>
        <div><dt>ヘルパー名</dt><dd>${escapeHtml(selectedItem.helperName || "-")}</dd></div>
      </div>
    `;
  }

  saveButton.disabled = !canSave;
}

function syncLoadingState() {
  helperEmailInput.disabled = state.isLoading || state.isSaving;
  loadButton.disabled = state.isLoading || state.isSaving;
  destinationInput.disabled = false;
  supportInput.disabled = false;
  memoText.disabled = false;
  draftText.disabled = false;
  draftButton.disabled = false;
  recordText.disabled = false;

  document
    .querySelectorAll(".macro-card input, .detail-group input")
    .forEach((input) => {
      input.disabled = false;
    });

  loadingText.textContent = state.isLoading
    ? "一覧を取得中..."
    : state.isSaving
      ? "保存中..."
      : "";

  renderList();
  renderWorkspace();
}

async function fetchUnwritten() {
  const helperEmail = helperEmailInput.value.trim();
  state.helperEmail = helperEmail;
  state.isLoading = true;
  state.selectedId = null;
  setError("");
  setSuccess("");
  syncLoadingState();

  try {
    const query = new URLSearchParams();
    if (helperEmail) {
      query.set("helper_email", helperEmail);
    }

    const response = await fetch(
      `${BASE_URL}/service-records-move/unwritten${query.toString() ? `?${query.toString()}` : ""}`,
      { method: "GET" },
    );
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || "一覧の取得に失敗しました");
    }

    state.items = Array.isArray(result.items) ? result.items : [];
    resetFormForSelection();
    renderList();
  } catch (error) {
    state.items = [];
    resetFormForSelection();
    setError(
      error instanceof Error ? error.message : "一覧の取得に失敗しました",
    );
  } finally {
    state.isLoading = false;
    syncLoadingState();
  }
}

async function saveRecord() {
  const formData = collectFormData();
  const noteText = buildNoteText(formData);

  if (!formData.selectedItem) {
    setError("保存対象を選択してください。");
    return;
  }

  if (!noteText) {
    setError("記録本文または入力内容を確認してください。");
    renderWorkspace();
    return;
  }

  state.isSaving = true;
  setError("");
  setSuccess("");
  syncLoadingState();

  try {
    const response = await fetch(`${BASE_URL}/service-records-move/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskId: formData.selectedItem.id,
        helperEmail:
          formData.helperEmail || formData.selectedItem.helperEmail || null,
        note: noteText,
      }),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || "保存に失敗しました");
    }

    setSuccess("保存しました。");
    await fetchUnwritten();
  } catch (error) {
    setError(error instanceof Error ? error.message : "保存に失敗しました");
  } finally {
    state.isSaving = false;
    syncLoadingState();
  }
}

loadButton.addEventListener("click", () => {
  fetchUnwritten();
});

helperEmailInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    fetchUnwritten();
  }
});

recordsList.addEventListener("click", (event) => {
  const target = event.target.closest("[data-record-id]");
  if (!target) {
    return;
  }

  state.selectedId = target.getAttribute("data-record-id");
  setError("");
  setSuccess("");
  resetFormForSelection();
  syncLoadingState();
});

Object.values(macroInputs).forEach((input) => {
  input.addEventListener("change", () => {
    updateConditionalSections();
    renderWorkspace();
  });
});

document
  .querySelectorAll(
    "#destination-input, #support-input, #memo-text, #draft-text, #record-text, .detail-group input",
  )
  .forEach((element) => {
    element.addEventListener("input", () => {
      renderWorkspace();
    });
    element.addEventListener("change", () => {
      renderWorkspace();
    });
  });

draftButton.addEventListener("click", () => {
  const formData = collectFormData();

  if (!formData.selectedItem) {
    setError("AI記録案を作成する予定を選択してください。");
    setSuccess("");
    return;
  }

  const draft = buildDraftText(formData);

  if (!draft) {
    setError("AI記録案を作成できませんでした。入力内容を確認してください。");
    setSuccess("");
    return;
  }

  draftText.value = draft;
  recordText.value = draft;
  setError("");
  setSuccess("AI記録案を作成しました。");
  renderWorkspace();
  draftText.focus();
});

saveButton.addEventListener("click", () => {
  saveRecord();
});

updateConditionalSections();
syncLoadingState();
