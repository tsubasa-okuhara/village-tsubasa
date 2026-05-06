const HOME_UNWRITTEN_API = "/api/service-records-home/unwritten";
const HOME_SUMMARY_API = "/api/service-records-home/summary";
const HOME_SAVE_API = "/api/service-records-home/save";

const HOME_BODY_CARE_PRIMARY_ITEMS = [
  { label: "排泄介助", children: ["トイレ", "おむつ", "ポータブルトイレ利用"] },
  {
    label: "食事介助",
    children: ["全介", "一部介助", "見守り"],
    amountGroup: { label: "食事量", options: ["全量", "少量", "拒否"] },
  },
  { label: "清拭", children: ["全清拭", "上半身", "下半身", "陰部清浄"] },
  {
    label: "入浴介助",
    children: [
      "全介助",
      "半介助",
      "シャワー浴",
      "全身浴",
      "部分浴",
      "手浴",
      "足浴",
      "洗髪",
    ],
  },
  { label: "洗面等", children: ["洗面", "歯磨き"] },
  {
    label: "身体整容",
    children: ["爪切", "耳掃除", "髭の手入れ", "身だしなみ"],
  },
  { label: "更衣介助", children: [] },
  { label: "移乗介助", children: [] },
  { label: "移動介助", children: [] },
  { label: "起床介助", children: [] },
  { label: "就寝介助", children: [] },
  { label: "服薬介助", children: [] },
  { label: "利用者とともに行う家事", children: ["掃除", "洗濯", "調理"] },
  { label: "その他", children: [] },
];

const HOME_SIMPLE_CATEGORY_ITEMS = {
  家事援助: [
    "調理",
    "配膳・片付け",
    "洗濯",
    "掃除",
    "買い物",
    "薬の受け取り",
    "生活必需品の整理",
    "ゴミ出し",
  ],
  "通院等介助・通院等乗降介助": [
    "通院同行",
    "病院内介助",
    "受付・受診補助",
    "移動介助",
    "乗車介助",
    "降車介助",
    "薬受け取り",
    "帰宅支援",
  ],
};

function normalizeOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
}

function normalizeRequiredText(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} is required`);
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error(`${fieldName} is required`);
  }

  return trimmedValue;
}

async function fetchHomeUnwritten(helperEmail) {
  const normalizedHelperEmail = normalizeOptionalText(helperEmail);

  if (!normalizedHelperEmail) {
    return {
      ok: true,
      items: [],
    };
  }

  const url = new URL(HOME_UNWRITTEN_API, window.location.origin);
  url.searchParams.set("helper_email", normalizedHelperEmail);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "failed to fetch home unwritten tasks");
  }

  return data;
}

function buildHomeSavePayload(values) {
  return {
    scheduleTaskId: normalizeRequiredText(
      values.scheduleTaskId,
      "scheduleTaskId",
    ),
    serviceDate: normalizeRequiredText(values.serviceDate, "serviceDate"),
    helperName: normalizeRequiredText(values.helperName, "helperName"),
    helperEmail: normalizeOptionalText(values.helperEmail),
    userName: normalizeRequiredText(values.userName, "userName"),
    task: normalizeOptionalText(values.task),
    memo: normalizeOptionalText(values.memo),
    aiSummary: normalizeOptionalText(values.aiSummary),
    finalNote: normalizeRequiredText(values.finalNote, "finalNote"),
    structuredLog: values.structuredLog ?? undefined,
  };
}

async function saveHomeRecord(values) {
  const payload = buildHomeSavePayload(values);
  const response = await fetch(HOME_SAVE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "failed to save home service record");
  }

  return data;
}

async function generateHomeSummary(values) {
  const response = await fetch(HOME_SUMMARY_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(values),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || "failed to generate home summary");
  }

  return data;
}

window.homeServiceRecordsApi = {
  fetchHomeUnwritten,
  generateHomeSummary,
  buildHomeSavePayload,
  saveHomeRecord,
};

const state = {
  items: [],
  selectedTask: null,
  selectedCategory: "身体介護",
  finalNoteTouched: false,
  summaryReady: false,
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
  const startTime = getDisplayValue(item?.start_time, "");
  const endTime = getDisplayValue(item?.end_time, "");

  if (startTime && endTime) {
    return `${startTime}〜${endTime}`;
  }

  return startTime || endTime || "時間未設定";
}

function setStatus(element, message, type) {
  element.textContent = message || "";
  element.classList.remove("is-error", "is-success", "is-warning");

  if (type) {
    element.classList.add(type);
  }
}

function setSaveEnabled(saveButtonElement, enabled) {
  saveButtonElement.disabled = !enabled;
}

const HELPER_EMAIL_STORAGE_KEY = "helper_email";

function getSavedHelperEmail() {
  try {
    return normalizeOptionalText(window.localStorage.getItem(HELPER_EMAIL_STORAGE_KEY) ?? "");
  } catch (_error) {
    return "";
  }
}

function saveHelperEmailToStorage(helperEmail) {
  const normalized = normalizeOptionalText(helperEmail);
  if (!normalized) return;
  try {
    window.localStorage.setItem(HELPER_EMAIL_STORAGE_KEY, normalized);
  } catch (_error) {
    // localStorage unavailable — silently ignore
  }
}

function getInitialHelperEmail() {
  const searchParams = new URLSearchParams(window.location.search);
  const fromUrl = normalizeOptionalText(searchParams.get("helper_email"));
  if (fromUrl) return fromUrl;
  return getSavedHelperEmail();
}

function inferCategory(taskName) {
  const text = String(taskName ?? "").trim();

  if (text === "家事援助") {
    return "家事援助";
  }

  if (text === "通院等介助・通院等乗降介助") {
    return "通院等介助・通院等乗降介助";
  }

  return "身体介護";
}

function isBodyCareCategory(category) {
  return category === "身体介護";
}

function getSimpleCheckedItems(checklistElement) {
  return Array.from(
    checklistElement.querySelectorAll('input[data-level="simple"]:checked'),
  )
    .map(function (inputElement) {
      return String(inputElement.value || "").trim();
    })
    .filter(Boolean);
}

function getBodyCarePrimaryItems(checklistElement) {
  return Array.from(
    checklistElement.querySelectorAll('input[data-level="primary"]:checked'),
  )
    .map(function (inputElement) {
      return String(inputElement.value || "").trim();
    })
    .filter(Boolean);
}

function getBodyCareSubItems(checklistElement) {
  const result = {};

  Array.from(
    checklistElement.querySelectorAll('input[data-level="child"]:checked'),
  ).forEach(function (inputElement) {
    const parentLabel = String(
      inputElement.getAttribute("data-parent") || "",
    ).trim();
    const childLabel = String(inputElement.value || "").trim();

    if (!parentLabel || !childLabel) {
      return;
    }

    if (!Array.isArray(result[parentLabel])) {
      result[parentLabel] = [];
    }

    result[parentLabel].push(childLabel);
  });

  return result;
}

// 食事介助 など amountGroup を持つ主項目で選択された値を { 主項目: 値 } で返す
function getBodyCareAmounts(checklistElement) {
  const result = {};

  Array.from(
    checklistElement.querySelectorAll('input[data-level="amount"]:checked'),
  ).forEach(function (inputElement) {
    const parentLabel = String(
      inputElement.getAttribute("data-parent") || "",
    ).trim();
    const value = String(inputElement.value || "").trim();

    if (parentLabel && value) {
      result[parentLabel] = value;
    }
  });

  return result;
}

function getSelectedItems(checklistElement) {
  if (isBodyCareCategory(state.selectedCategory)) {
    return getBodyCarePrimaryItems(checklistElement);
  }

  return getSimpleCheckedItems(checklistElement);
}

function getBodyCareItemsForSummary(
  primaryItems,
  subItems,
  otherDetail,
  amounts,
) {
  const safeAmounts = amounts && typeof amounts === "object" ? amounts : {};
  const itemTexts = primaryItems.map(function (primaryLabel) {
    const childItems = Array.isArray(subItems[primaryLabel])
      ? subItems[primaryLabel]
      : [];
    const segments = childItems.slice();
    const amountValue =
      typeof safeAmounts[primaryLabel] === "string"
        ? safeAmounts[primaryLabel].trim()
        : "";

    if (amountValue) {
      segments.push(`量:${amountValue}`);
    }

    if (segments.length === 0) {
      return primaryLabel;
    }

    return `${primaryLabel}(${segments.join("、")})`;
  });

  const normalizedOtherDetail = normalizeOptionalText(otherDetail);

  if (normalizedOtherDetail) {
    itemTexts.push(`その他(${normalizedOtherDetail})`);
  }

  return itemTexts;
}

function deriveAssistLevel(primaryItems, subItems) {
  const detailTexts = getBodyCareItemsForSummary(
    primaryItems,
    subItems,
    null,
    null,
  ).join(" ");

  // 「全介助」は入浴介助、「全介」は食事介助の語。両方とも全介助レベルとして扱う
  if (detailTexts.includes("全介助") || detailTexts.includes("全介")) {
    return "全介助";
  }

  if (detailTexts.includes("半介助") || detailTexts.includes("一部介助")) {
    return "一部介助";
  }

  if (detailTexts.includes("見守り")) {
    return "見守り";
  }

  return null;
}

function deriveRiskFlag(freeMemo) {
  const text = String(freeMemo || "");
  const flags = [];

  if (text.includes("転倒")) {
    flags.push("転倒");
  }

  if (text.includes("ふらつき")) {
    flags.push("ふらつき");
  }

  if (text.includes("誤嚥") || text.includes("むせ")) {
    flags.push("誤嚥");
  }

  if (text.includes("拒否")) {
    flags.push("拒否");
  }

  if (text.includes("不穏") || text.includes("興奮")) {
    flags.push("不穏");
  }

  if (text.includes("疼痛") || text.includes("痛み")) {
    flags.push("疼痛");
  }

  return flags.length > 0 ? Array.from(new Set(flags)).join(", ") : null;
}

function deriveDifficulty(freeMemo) {
  const text = String(freeMemo || "");

  if (
    text.includes("困難") ||
    text.includes("拒否") ||
    text.includes("時間がかかった") ||
    text.includes("時間を要した") ||
    text.includes("介助量多い") ||
    text.includes("手間取った") ||
    text.includes("苦戦")
  ) {
    return "あり";
  }

  return null;
}

function derivePhysicalState(freeMemo) {
  const text = String(freeMemo || "");

  if (text.includes("ふらつきあり")) {
    return "ふらつきあり";
  }

  if (text.includes("ふらつき")) {
    return "ふらつきあり";
  }

  if (
    text.includes("疲れ気味") ||
    text.includes("倦怠") ||
    text.includes("だるい") ||
    text.includes("だるそう")
  ) {
    return "倦怠感あり";
  }

  if (text.includes("しんどい") || text.includes("しんどそう")) {
    return "倦怠感あり";
  }

  if (text.includes("発熱")) {
    return "発熱";
  }

  if (text.includes("微熱")) {
    return "微熱";
  }

  if (text.includes("疼痛") || text.includes("痛み")) {
    return "疼痛あり";
  }

  if (text.includes("むせ") || text.includes("誤嚥")) {
    return "嚥下注意";
  }

  if (text.includes("食欲低下")) {
    return "食欲低下";
  }

  if (text.includes("安定")) {
    return "安定";
  }

  return null;
}

function deriveMentalState(freeMemo) {
  const text = String(freeMemo || "");

  if (text.includes("不穏")) {
    return "不穏";
  }

  if (text.includes("興奮")) {
    return "不穏";
  }

  if (text.includes("拒否")) {
    return "拒否あり";
  }

  if (text.includes("無反応")) {
    return "無反応";
  }

  if (text.includes("不安")) {
    return "不安あり";
  }

  if (text.includes("落ち着")) {
    return "落ち着いている";
  }

  if (text.includes("穏やか")) {
    return "穏やか";
  }

  return null;
}

function deriveActionResult(freeMemo) {
  const text = String(freeMemo || "");

  if (
    text.includes("中止") ||
    text.includes("見送り") ||
    text.includes("未実施") ||
    text.includes("できず")
  ) {
    return "中止";
  }

  return "実施";
}

function buildStructuredLog(
  category,
  primaryItems,
  subItems,
  otherDetail,
  freeMemo,
  amounts,
) {
  if (!isBodyCareCategory(category) || primaryItems.length === 0) {
    return undefined;
  }

  const actionItems = getBodyCareItemsForSummary(
    primaryItems,
    subItems,
    otherDetail,
    amounts,
  );
  const actionDetail = actionItems.join(", ");

  return {
    actionType: primaryItems.length === 1 ? primaryItems[0] : "複合身体介護",
    actionDetail: actionDetail || null,
    assistLevel: deriveAssistLevel(primaryItems, subItems),
    physicalState: derivePhysicalState(freeMemo),
    mentalState: deriveMentalState(freeMemo),
    riskFlag: deriveRiskFlag(freeMemo),
    actionResult: deriveActionResult(freeMemo),
    difficulty: deriveDifficulty(freeMemo),
  };
}

function buildMemoText(
  category,
  checkedItems,
  otherDetail,
  freeMemo,
  primaryItems,
  subItems,
  amounts,
) {
  if (isBodyCareCategory(category)) {
    const normalizedOtherDetail = normalizeOptionalText(otherDetail);
    const normalizedFreeMemo = normalizeOptionalText(freeMemo);
    const safeAmounts = amounts && typeof amounts === "object" ? amounts : {};
    const lines = [
      `区分: ${category}`,
      `主チェック: ${primaryItems.length > 0 ? primaryItems.join(", ") : "選択なし"}`,
    ];

    const childLines = primaryItems
      .filter(function (primaryLabel) {
        return (
          Array.isArray(subItems[primaryLabel]) &&
          subItems[primaryLabel].length > 0
        );
      })
      .map(function (primaryLabel) {
        return `- ${primaryLabel}: ${subItems[primaryLabel].join(", ")}`;
      });

    if (childLines.length > 0) {
      lines.push("子チェック:");
      lines.push(...childLines);
    }

    // 食事介助の食事量など、主項目に紐づく独立属性を別 prefix で記録
    const amountLines = primaryItems
      .filter(function (primaryLabel) {
        return (
          typeof safeAmounts[primaryLabel] === "string" &&
          safeAmounts[primaryLabel].trim() !== ""
        );
      })
      .map(function (primaryLabel) {
        if (primaryLabel === "食事介助") {
          return `食事量: ${safeAmounts[primaryLabel].trim()}`;
        }
        return `${primaryLabel}量: ${safeAmounts[primaryLabel].trim()}`;
      });

    if (amountLines.length > 0) {
      lines.push(...amountLines);
    }

    if (normalizedOtherDetail) {
      lines.push("その他:");
      lines.push(`- その他詳細: ${normalizedOtherDetail}`);
    }

    if (normalizedFreeMemo) {
      lines.push("補足:");
      lines.push(`- ${normalizedFreeMemo}`);
    }

    return lines.join("\n");
  }

  const lines = [];
  const itemTexts = checkedItems.slice();
  const normalizedOtherDetail = normalizeOptionalText(otherDetail);
  const normalizedFreeMemo = normalizeOptionalText(freeMemo);

  if (normalizedOtherDetail) {
    itemTexts.push(`その他(${normalizedOtherDetail})`);
  }

  lines.push(`区分: ${category}`);
  lines.push(
    `実施項目: ${itemTexts.length > 0 ? itemTexts.join("、") : "選択なし"}`,
  );

  if (normalizedFreeMemo) {
    lines.push(`補足: ${normalizedFreeMemo}`);
  }

  return lines.join("\n");
}

function buildFinalNoteText(
  task,
  category,
  checkedItems,
  otherDetail,
  freeMemo,
  primaryItems,
  subItems,
  amounts,
) {
  const userName = getDisplayValue(task?.user_name, "利用者");
  const serviceDate = getDisplayValue(task?.service_date, "本日");
  const timeRange = formatTimeRange(task);
  const normalizedOtherDetail = normalizeOptionalText(otherDetail);
  const normalizedFreeMemo = normalizeOptionalText(freeMemo);
  const detailTexts = isBodyCareCategory(category)
    ? getBodyCareItemsForSummary(primaryItems, subItems, otherDetail, amounts)
    : checkedItems.slice();

  if (normalizedOtherDetail && !isBodyCareCategory(category)) {
    detailTexts.push(normalizedOtherDetail);
  }

  const detailText =
    detailTexts.length > 0 ? detailTexts.join("、") : "必要な支援";
  const sentences = [
    `${serviceDate} ${timeRange}、${userName}様へ${category}を実施しました。`,
    `実施内容: ${detailText}。`,
  ];

  if (normalizedFreeMemo) {
    sentences.push(`特記事項: ${normalizedFreeMemo}。`);
  }

  return sentences.join("");
}

function renderChecklist(
  checklistElement,
  checklistHintElement,
  otherDetailFieldElement,
) {
  if (isBodyCareCategory(state.selectedCategory)) {
    checklistElement.className = "nested-checklist";
    checklistElement.innerHTML = HOME_BODY_CARE_PRIMARY_ITEMS.map(
      function (item, index) {
        const primaryId = `home-body-primary-${index}`;
        const childrenHtml = item.children
          .map(function (childLabel, childIndex) {
            const childId = `home-body-child-${index}-${childIndex}`;

            return `
            <label class="nested-checklist__child" for="${escapeHtml(childId)}">
              <input
                id="${escapeHtml(childId)}"
                type="checkbox"
                value="${escapeHtml(childLabel)}"
                data-level="child"
                data-parent="${escapeHtml(item.label)}"
              />
              <span>${escapeHtml(childLabel)}</span>
            </label>
          `;
          })
          .join("");

        const amountGroupHtml = item.amountGroup
          ? `<div class="nested-checklist__amount-group" data-amount-group-for="${escapeHtml(item.label)}">
              <div class="nested-checklist__amount-label">${escapeHtml(item.amountGroup.label)}</div>
              <div class="nested-checklist__amount-options">
                ${item.amountGroup.options
                  .map(function (optionLabel, optionIndex) {
                    const amountId = `home-body-amount-${index}-${optionIndex}`;
                    return `
                  <label class="nested-checklist__amount-option" for="${escapeHtml(amountId)}">
                    <input
                      id="${escapeHtml(amountId)}"
                      type="radio"
                      name="home-body-amount-${index}"
                      value="${escapeHtml(optionLabel)}"
                      data-level="amount"
                      data-parent="${escapeHtml(item.label)}"
                    />
                    <span>${escapeHtml(optionLabel)}</span>
                  </label>
                `;
                  })
                  .join("")}
              </div>
            </div>`
          : "";

        return `
        <div class="nested-checklist__group">
          <label class="checkbox-item" for="${escapeHtml(primaryId)}">
            <input
              id="${escapeHtml(primaryId)}"
              type="checkbox"
              value="${escapeHtml(item.label)}"
              data-level="primary"
            />
            <span>${escapeHtml(item.label)}</span>
          </label>
          ${
            item.children.length > 0
              ? `<div class="nested-checklist__children" data-subgroup-for="${escapeHtml(item.label)}">${childrenHtml}</div>`
              : ""
          }
          ${amountGroupHtml}
        </div>
      `;
      },
    ).join("");

    checklistHintElement.textContent =
      "主チェックを選ぶと必要な子チェックだけ表示します。";
    otherDetailFieldElement.classList.add("is-hidden");
    return;
  }

  const items = HOME_SIMPLE_CATEGORY_ITEMS[state.selectedCategory] || [];

  checklistElement.className = "checkbox-grid";
  checklistElement.innerHTML = items
    .map(function (item, index) {
      const itemId = `home-check-item-${index}`;

      return `
        <label class="checkbox-item" for="${escapeHtml(itemId)}">
          <input
            id="${escapeHtml(itemId)}"
            type="checkbox"
            value="${escapeHtml(item)}"
            data-level="simple"
          />
          <span>${escapeHtml(item)}</span>
        </label>
      `;
    })
    .join("");

  checklistHintElement.textContent = "区分に応じた実施項目を選択します。";
  otherDetailFieldElement.classList.remove("is-hidden");
}

function updateBodyCareChecklistVisibility(
  checklistElement,
  otherDetailFieldElement,
) {
  if (!isBodyCareCategory(state.selectedCategory)) {
    otherDetailFieldElement.classList.remove("is-hidden");
    return;
  }

  const primaryItems = getBodyCarePrimaryItems(checklistElement);

  checklistElement
    .querySelectorAll("[data-subgroup-for]")
    .forEach(function (groupElement) {
      const groupName = String(
        groupElement.getAttribute("data-subgroup-for") || "",
      );
      const isVisible = primaryItems.includes(groupName);
      groupElement.classList.toggle("is-visible", isVisible);

      if (!isVisible) {
        groupElement
          .querySelectorAll('input[type="checkbox"]')
          .forEach(function (inputElement) {
            inputElement.checked = false;
          });
      }
    });

  // 食事介助の食事量など amountGroup の表示/非表示も同様に同期
  checklistElement
    .querySelectorAll("[data-amount-group-for]")
    .forEach(function (groupElement) {
      const groupName = String(
        groupElement.getAttribute("data-amount-group-for") || "",
      );
      const isVisible = primaryItems.includes(groupName);
      groupElement.classList.toggle("is-visible", isVisible);

      if (!isVisible) {
        groupElement
          .querySelectorAll('input[type="radio"]')
          .forEach(function (inputElement) {
            inputElement.checked = false;
          });
      }
    });

  if (primaryItems.includes("その他")) {
    otherDetailFieldElement.classList.remove("is-hidden");
  } else {
    otherDetailFieldElement.classList.add("is-hidden");
  }
}

function renderTaskList(
  listElement,
  selectedSummaryElement,
  saveStatusElement,
) {
  if (!Array.isArray(state.items) || state.items.length === 0) {
    listElement.innerHTML = "";
    return;
  }

  listElement.innerHTML = state.items
    .map(function (item) {
      const isSelected =
        state.selectedTask && state.selectedTask.id === item.id;

      return `
        <button
          type="button"
          class="task-card ${isSelected ? "is-selected" : ""}"
          data-task-id="${escapeHtml(item.id)}"
        >
          <div class="task-card__title">
            ${escapeHtml(getDisplayValue(item.user_name, "利用者未設定"))}
          </div>
          <div class="task-card__meta">
            <div>担当: ${escapeHtml(getDisplayValue(item.helper_name, "担当未設定"))}</div>
            <div>日付: ${escapeHtml(getDisplayValue(item.service_date, "日付未設定"))}</div>
            <div>時間: ${escapeHtml(formatTimeRange(item))}</div>
            <div>内容: ${escapeHtml(getDisplayValue(item.task, "内容未設定"))}</div>
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
        state.selectedTask =
          state.items.find(function (item) {
            return item.id === taskId;
          }) || null;

        renderTaskList(listElement, selectedSummaryElement, saveStatusElement);
        renderSelectedTask(selectedSummaryElement, saveStatusElement);
      });
    });
}

function renderSelectedTask(selectedSummaryElement, saveStatusElement) {
  if (!state.selectedTask) {
    selectedSummaryElement.innerHTML =
      '<div class="empty-text">予定を選択すると詳細が表示されます。</div>';
    return;
  }

  const item = state.selectedTask;

  selectedSummaryElement.innerHTML = `
    <div class="selected-card__title">
      ${escapeHtml(getDisplayValue(item.user_name, "利用者未設定"))}
    </div>
    <div>担当: ${escapeHtml(getDisplayValue(item.helper_name, "担当未設定"))}</div>
    <div>helper_email: ${escapeHtml(getDisplayValue(item.helper_email, "未設定"))}</div>
    <div>日付: ${escapeHtml(getDisplayValue(item.service_date, "日付未設定"))}</div>
    <div>時間: ${escapeHtml(formatTimeRange(item))}</div>
    <div>内容: ${escapeHtml(getDisplayValue(item.task, "内容未設定"))}</div>
    <div>予定概要: ${escapeHtml(getDisplayValue(item.summary, "概要なし"))}</div>
  `;

  setStatus(saveStatusElement, "メモと記録本文を入力して保存してください。");
}

function fillFormFromSelectedTask(
  serviceDateElement,
  helperNameElement,
  userNameElement,
  taskElement,
) {
  const item = state.selectedTask;

  serviceDateElement.value = item ? item.service_date || "" : "";
  helperNameElement.value = item ? item.helper_name || "" : "";
  userNameElement.value = item ? item.user_name || "" : "";
  taskElement.value = item ? state.selectedCategory : "";
}

function resetEntryFields(
  memoElement,
  finalNoteElement,
  otherDetailElement,
  checklistElement,
) {
  memoElement.value = "";
  finalNoteElement.value = "";
  otherDetailElement.value = "";
  checklistElement
    .querySelectorAll('input[type="checkbox"], input[type="radio"]')
    .forEach(function (inputElement) {
      inputElement.checked = false;
  });
  state.finalNoteTouched = false;
  state.summaryReady = false;
}

function syncDerivedFields(
  taskElement,
  memoElement,
  finalNoteElement,
  otherDetailElement,
  checklistElement,
) {
  taskElement.value = state.selectedTask ? state.selectedCategory : "";

  const checkedItems = getSimpleCheckedItems(checklistElement);
  const primaryItems = isBodyCareCategory(state.selectedCategory)
    ? getBodyCarePrimaryItems(checklistElement)
    : checkedItems;
  const subItems = isBodyCareCategory(state.selectedCategory)
    ? getBodyCareSubItems(checklistElement)
    : {};
  const amounts = isBodyCareCategory(state.selectedCategory)
    ? getBodyCareAmounts(checklistElement)
    : {};
  const composedMemo = buildMemoText(
    state.selectedCategory,
    checkedItems,
    otherDetailElement.value,
    memoElement.value,
    primaryItems,
    subItems,
    amounts,
  );

  if (!state.finalNoteTouched) {
    finalNoteElement.value = buildFinalNoteText(
      state.selectedTask,
      state.selectedCategory,
      checkedItems,
      otherDetailElement.value,
      memoElement.value,
      primaryItems,
      subItems,
      amounts,
    );
  }

  return {
    composedMemo,
    checkedItems,
    primaryItems,
    subItems,
    amounts,
  };
}

async function loadHomeTasks(helperEmail, options) {
  const {
    listStatusElement,
    saveStatusElement,
    checklistElement,
    checklistHintElement,
    otherDetailFieldElement,
    selectedSummaryElement,
    listElement,
    serviceDateElement,
    helperNameElement,
    userNameElement,
    taskElement,
    memoElement,
    finalNoteElement,
    otherDetailElement,
    saveButtonElement,
  } = options;

  setStatus(listStatusElement, "一覧を取得しています...");
  setStatus(saveStatusElement, "");
  state.selectedTask = null;
  state.items = [];
  state.selectedCategory = inferCategory("");
  renderChecklist(
    checklistElement,
    checklistHintElement,
    otherDetailFieldElement,
  );
  updateBodyCareChecklistVisibility(checklistElement, otherDetailFieldElement);
  fillFormFromSelectedTask(
    serviceDateElement,
    helperNameElement,
    userNameElement,
    taskElement,
  );
  resetEntryFields(
    memoElement,
    finalNoteElement,
    otherDetailElement,
    checklistElement,
  );
  renderSelectedTask(selectedSummaryElement, saveStatusElement);
  renderTaskList(listElement, selectedSummaryElement, saveStatusElement);
  setSaveEnabled(saveButtonElement, false);

  try {
    const data = await fetchHomeUnwritten(helperEmail);
    state.items = Array.isArray(data.items) ? data.items : [];

    if (state.items.length === 0) {
      setStatus(listStatusElement, "未記入の予定はありません。");
      renderTaskList(listElement, selectedSummaryElement, saveStatusElement);
      return;
    }

    setStatus(
      listStatusElement,
      `${state.items.length} 件の未記入予定を取得しました。`,
      "is-success",
    );
    renderTaskList(listElement, selectedSummaryElement, saveStatusElement);
  } catch (error) {
    console.error("[service-records-home] list error:", error);
    setStatus(
      listStatusElement,
      "未記入一覧の取得に失敗しました。",
      "is-error",
    );
  }
}

function initializeHomeUi() {
  const filterFormElement = document.getElementById("home-records-filter-form");

  if (!filterFormElement) {
    return;
  }

  const helperEmailElement = getRequiredElement("home-helper-email");
  const listStatusElement = getRequiredElement("home-records-list-status");
  const listElement = getRequiredElement("home-records-list");
  const selectedSummaryElement = getRequiredElement(
    "home-records-selected-summary",
  );
  const entryFormElement = getRequiredElement("home-records-entry-form");
  const serviceDateElement = getRequiredElement("home-service-date");
  const helperNameElement = getRequiredElement("home-helper-name");
  const userNameElement = getRequiredElement("home-user-name");
  const taskElement = getRequiredElement("home-task");
  const categoryGroupElement = getRequiredElement("home-category-group");
  const checklistElement = getRequiredElement("home-checklist");
  const checklistHintElement = getRequiredElement("home-checklist-hint");
  const otherDetailFieldElement = getRequiredElement("home-other-detail-field");
  const otherDetailElement = getRequiredElement("home-other-detail");
  const memoElement = getRequiredElement("home-memo");
  const finalNoteElement = getRequiredElement("home-final-note");
  const generateSummaryButtonElement = getRequiredElement(
    "home-generate-summary-button",
  );
  const saveButtonElement = getRequiredElement("home-save-button");
  const clearButtonElement = getRequiredElement("home-clear-button");
  const saveStatusElement = getRequiredElement("home-records-save-status");

  renderChecklist(
    checklistElement,
    checklistHintElement,
    otherDetailFieldElement,
  );
  updateBodyCareChecklistVisibility(checklistElement, otherDetailFieldElement);
  setSaveEnabled(saveButtonElement, false);

  filterFormElement.addEventListener("submit", async function (event) {
    event.preventDefault();
    saveHelperEmailToStorage(helperEmailElement.value);
    await loadHomeTasks(helperEmailElement.value, {
      listStatusElement,
      saveStatusElement,
      checklistElement,
      checklistHintElement,
      otherDetailFieldElement,
      selectedSummaryElement,
      listElement,
      serviceDateElement,
      helperNameElement,
      userNameElement,
      taskElement,
      memoElement,
      finalNoteElement,
      otherDetailElement,
      saveButtonElement,
    });
  });

  listElement.addEventListener("click", function () {
    state.selectedCategory = inferCategory(state.selectedTask?.task);
    categoryGroupElement
      .querySelectorAll('input[name="homeCategory"]')
      .forEach(function (inputElement) {
        inputElement.checked = inputElement.value === state.selectedCategory;
      });
    renderChecklist(
      checklistElement,
      checklistHintElement,
      otherDetailFieldElement,
    );
    updateBodyCareChecklistVisibility(
      checklistElement,
      otherDetailFieldElement,
    );
    fillFormFromSelectedTask(
      serviceDateElement,
      helperNameElement,
      userNameElement,
      taskElement,
    );
    resetEntryFields(
      memoElement,
      finalNoteElement,
      otherDetailElement,
      checklistElement,
    );
    syncDerivedFields(
      taskElement,
      memoElement,
      finalNoteElement,
      otherDetailElement,
      checklistElement,
    );
    setSaveEnabled(saveButtonElement, false);
  });

  clearButtonElement.addEventListener("click", function () {
    resetEntryFields(
      memoElement,
      finalNoteElement,
      otherDetailElement,
      checklistElement,
    );
    updateBodyCareChecklistVisibility(
      checklistElement,
      otherDetailFieldElement,
    );
    syncDerivedFields(
      taskElement,
      memoElement,
      finalNoteElement,
      otherDetailElement,
      checklistElement,
    );
    setStatus(saveStatusElement, "");
    setSaveEnabled(saveButtonElement, false);
  });

  categoryGroupElement
    .querySelectorAll('input[name="homeCategory"]')
    .forEach(function (inputElement) {
      inputElement.addEventListener("change", function () {
        state.selectedCategory = inputElement.value;
        renderChecklist(
          checklistElement,
          checklistHintElement,
          otherDetailFieldElement,
        );
        updateBodyCareChecklistVisibility(
          checklistElement,
          otherDetailFieldElement,
        );
        otherDetailElement.value = "";
        state.finalNoteTouched = false;
        state.summaryReady = false;
        syncDerivedFields(
          taskElement,
          memoElement,
          finalNoteElement,
          otherDetailElement,
          checklistElement,
        );
        setSaveEnabled(saveButtonElement, false);
      });
    });

  checklistElement.addEventListener("change", function () {
    updateBodyCareChecklistVisibility(
      checklistElement,
      otherDetailFieldElement,
    );
    state.summaryReady = false;
    syncDerivedFields(
      taskElement,
      memoElement,
      finalNoteElement,
      otherDetailElement,
      checklistElement,
    );
    setSaveEnabled(saveButtonElement, false);
  });

  otherDetailElement.addEventListener("input", function () {
    state.summaryReady = false;
    syncDerivedFields(
      taskElement,
      memoElement,
      finalNoteElement,
      otherDetailElement,
      checklistElement,
    );
    setSaveEnabled(saveButtonElement, false);
  });

  memoElement.addEventListener("input", function () {
    state.summaryReady = false;
    syncDerivedFields(
      taskElement,
      memoElement,
      finalNoteElement,
      otherDetailElement,
      checklistElement,
    );
    setSaveEnabled(saveButtonElement, false);
  });

  finalNoteElement.addEventListener("input", function () {
    state.finalNoteTouched = true;
    setSaveEnabled(saveButtonElement, state.summaryReady);
  });

  generateSummaryButtonElement.addEventListener("click", async function () {
    if (!state.selectedTask) {
      setStatus(
        saveStatusElement,
        "先に保存する予定を1件選択してください。",
        "is-error",
      );
      return;
    }

    if (!state.selectedCategory) {
      setStatus(saveStatusElement, "区分を選択してください。", "is-error");
      return;
    }

    const derived = syncDerivedFields(
      taskElement,
      memoElement,
      finalNoteElement,
      otherDetailElement,
      checklistElement,
    );

    if (derived.primaryItems.length === 0) {
      setStatus(
        saveStatusElement,
        "実施項目を1件以上選択してください。",
        "is-error",
      );
      return;
    }

    if (state.finalNoteTouched) {
      setStatus(
        saveStatusElement,
        "記録本文を手編集済みのため、AI要約では上書きしません。",
        "is-error",
      );
      return;
    }

    try {
      setStatus(saveStatusElement, "AI要約を作成しています...");

      const data = await generateHomeSummary({
        helperName: state.selectedTask.helper_name,
        userName: state.selectedTask.user_name,
        serviceDate: state.selectedTask.service_date,
        startTime: state.selectedTask.start_time,
        endTime: state.selectedTask.end_time,
        category: state.selectedCategory,
        items: isBodyCareCategory(state.selectedCategory)
          ? getBodyCareItemsForSummary(
              derived.primaryItems,
              derived.subItems,
              otherDetailElement.value,
              derived.amounts,
            )
          : derived.checkedItems,
        primaryItems: derived.primaryItems,
        subItems: derived.subItems,
        amounts: derived.amounts,
        otherDetail: otherDetailElement.value,
        memo: memoElement.value,
      });

      finalNoteElement.value = data.summaryText || "";
      state.finalNoteTouched = false;
      state.summaryReady = true;
      setSaveEnabled(saveButtonElement, true);
      if (data.source === "fallback") {
        setStatus(
          saveStatusElement,
          "AI 要約の生成に失敗しました。テンプレートを表示しています。内容を確認して保存してください。",
          "is-warning",
        );
      } else {
        setStatus(
          saveStatusElement,
          "AI要約を記録本文に反映しました。内容を確認して保存してください。",
          "is-success",
        );
      }
    } catch (error) {
      console.error("[service-records-home] summary error:", error);
      state.summaryReady = false;
      setSaveEnabled(saveButtonElement, false);
      setStatus(
        saveStatusElement,
        error instanceof Error ? error.message : "AI要約の作成に失敗しました。",
        "is-error",
      );
    }
  });

  entryFormElement.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!state.selectedTask) {
      setStatus(
        saveStatusElement,
        "保存する予定を1件選択してください。",
        "is-error",
      );
      return;
    }

    const derived = syncDerivedFields(
      taskElement,
      memoElement,
      finalNoteElement,
      otherDetailElement,
      checklistElement,
    );
    const finalNote = String(finalNoteElement.value || "").trim();

    if (!state.selectedCategory) {
      setStatus(saveStatusElement, "区分を選択してください。", "is-error");
      return;
    }

    if (derived.primaryItems.length === 0) {
      setStatus(
        saveStatusElement,
        "実施項目を1件以上選択してください。",
        "is-error",
      );
      return;
    }

    if (!finalNote) {
      setStatus(saveStatusElement, "記録本文を入力してください。", "is-error");
      return;
    }

    try {
      setStatus(saveStatusElement, "保存しています...");

      const structuredLog = buildStructuredLog(
        state.selectedCategory,
        derived.primaryItems,
        derived.subItems,
        otherDetailElement.value,
        memoElement.value,
        derived.amounts,
      );

      await saveHomeRecord({
        scheduleTaskId: state.selectedTask.id,
        serviceDate: state.selectedTask.service_date,
        helperName: state.selectedTask.helper_name,
        helperEmail: state.selectedTask.helper_email,
        userName: state.selectedTask.user_name,
        task: state.selectedCategory,
        memo: derived.composedMemo,
        aiSummary: null,
        finalNote,
        structuredLog,
      });

      setStatus(saveStatusElement, "保存しました。", "is-success");

      state.items = state.items.filter(function (item) {
        return item.id !== state.selectedTask.id;
      });
      state.selectedTask = null;
      fillFormFromSelectedTask(
        serviceDateElement,
        helperNameElement,
        userNameElement,
        taskElement,
      );
      resetEntryFields(
        memoElement,
        finalNoteElement,
        otherDetailElement,
        checklistElement,
      );
      updateBodyCareChecklistVisibility(
        checklistElement,
        otherDetailFieldElement,
      );
      renderSelectedTask(selectedSummaryElement, saveStatusElement);
      renderTaskList(listElement, selectedSummaryElement, saveStatusElement);
      setStatus(
        listStatusElement,
        `${state.items.length} 件の未記入予定があります。`,
        "is-success",
      );
      setSaveEnabled(saveButtonElement, false);
    } catch (error) {
      console.error("[service-records-home] save error:", error);
      setStatus(
        saveStatusElement,
        error instanceof Error ? error.message : "保存に失敗しました。",
        "is-error",
      );
    }
  });

  const initialHelperEmail = getInitialHelperEmail();

  if (initialHelperEmail) {
    helperEmailElement.value = initialHelperEmail;
    loadHomeTasks(initialHelperEmail, {
      listStatusElement,
      saveStatusElement,
      checklistElement,
      checklistHintElement,
      otherDetailFieldElement,
      selectedSummaryElement,
      listElement,
      serviceDateElement,
      helperNameElement,
      userNameElement,
      taskElement,
      memoElement,
      finalNoteElement,
      otherDetailElement,
      saveButtonElement,
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeHomeUi);
} else {
  initializeHomeUi();
}
