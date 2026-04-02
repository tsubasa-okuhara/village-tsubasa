const SCHEDULE_LIST_ENDPOINT = "/api/schedule-list";
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const state = {
  currentYear: 0,
  currentMonth: 0,
  activeWeekIndex: -1,
  searchKeyword: "",
  selectedHelper: "",
  rawData: null,
  filteredData: null,
};

function getRequiredElement(id) {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`missing element: ${id}`);
  }

  return element;
}

const pageTitleElement = getRequiredElement("page-title");
const monthLabelElement = getRequiredElement("month-label");
const weekSummaryElement = getRequiredElement("week-summary");
const searchInputElement = getRequiredElement("search-helper");
const helperSelectElement = getRequiredElement("helper-select");
const prevMonthButton = getRequiredElement("prev-month");
const nextMonthButton = getRequiredElement("next-month");
const reloadButtonElement = getRequiredElement("reload-button");
const scheduleCalendarElement = getRequiredElement("schedule-calendar");
const scheduleColumnsElement = getRequiredElement("schedule-columns");
const weekButtonsElement = getRequiredElement("week-buttons");
const dayModalOverlayElement = getRequiredElement("day-modal-overlay");
const dayModalCloseElement = getRequiredElement("day-modal-close");
const dayModalTitleElement = getRequiredElement("day-modal-title");
const dayModalMetaElement = getRequiredElement("day-modal-meta");
const dayModalBodyElement = getRequiredElement("day-modal-body");
const fetchErrorBannerElement = getRequiredElement("fetch-error-banner");

function getCurrentViewState() {
  return {
    year: state.currentYear,
    month: state.currentMonth,
    activeWeekIndex: state.activeWeekIndex,
    searchKeyword: state.searchKeyword,
    selectedHelper: state.selectedHelper,
  };
}

function getTodayParts() {
  const now = new Date();

  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function toDateKey(year, month, day) {
  return `${year}-${padNumber(month)}-${padNumber(day)}`;
}

function parseDateParts(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return { year, month, day };
}

function formatMonthLabel(year, month) {
  return `${year}年${month}月`;
}

function formatTimeRange(item) {
  const start = item.startTime || "";
  const end = item.endTime || "";

  if (start && end) {
    return `${start}〜${end}`;
  }

  if (start) {
    return start;
  }

  return "";
}

function getDisplayValue(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function getHelperLabel(item) {
  const helperNames = Array.isArray(item.helperNames)
    ? item.helperNames
    : String(item.helperName || "").trim()
        ? [String(item.helperName || "").trim()]
        : [];

  if (helperNames.length === 0) {
    return "担当未設定";
  }

  return `担当：${helperNames.join("・")}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setCurrentMonth(year, month) {
  let nextYear = year;
  let nextMonth = month;

  if (nextMonth <= 0) {
    nextYear -= 1;
    nextMonth = 12;
  }

  if (nextMonth >= 13) {
    nextYear += 1;
    nextMonth = 1;
  }

  state.currentYear = nextYear;
  state.currentMonth = nextMonth;
}

function getMockScheduleData(year, month) {
  return {
    ok: true,
    isMock: true,
    year: year,
    month: month,
    items: [
      {
        date: toDateKey(year, month, 2),
        helperName: "田中 花子",
        userName: "利用者A",
        startTime: "09:00",
        endTime: "10:00",
        haisha: "1号車",
        task: "移動支援",
        summary: "病院付き添い",
      },
      {
        date: toDateKey(year, month, 2),
        helperName: "佐藤 次郎",
        userName: "利用者B",
        startTime: "13:30",
        endTime: "14:30",
        haisha: "2号車",
        task: "居宅介護",
        summary: "買い物同行",
      },
      {
        date: toDateKey(year, month, 5),
        helperName: "松本 由美",
        userName: "利用者C",
        startTime: "10:00",
        endTime: "11:30",
        haisha: "3号車",
        task: "移動支援",
        summary: "通所送り",
      },
      {
        date: toDateKey(year, month, 7),
        helperName: "中村 亮",
        userName: "利用者D",
        startTime: "15:00",
        endTime: "16:00",
        haisha: "なし",
        task: "居宅介護",
        summary: "家事援助",
      },
      {
        date: toDateKey(year, month, 11),
        helperName: "石井 真由",
        userName: "利用者E",
        startTime: "08:30",
        endTime: "09:30",
        haisha: "1号車",
        task: "移動支援",
        summary: "通院同行",
      },
      {
        date: toDateKey(year, month, 13),
        helperName: "田中 花子",
        userName: "利用者F",
        startTime: "12:00",
        endTime: "13:00",
        haisha: "2号車",
        task: "居宅介護",
        summary: "昼食介助",
      },
      {
        date: toDateKey(year, month, 17),
        helperName: "佐々木 守",
        userName: "利用者G",
        startTime: "11:00",
        endTime: "12:30",
        haisha: "4号車",
        task: "移動支援",
        summary: "外出支援",
      },
      {
        date: toDateKey(year, month, 19),
        helperName: "山口 美咲",
        userName: "利用者H",
        startTime: "14:00",
        endTime: "15:00",
        haisha: "なし",
        task: "居宅介護",
        summary: "掃除支援",
      },
      {
        date: toDateKey(year, month, 23),
        helperName: "中村 亮",
        userName: "利用者I",
        startTime: "09:30",
        endTime: "10:30",
        haisha: "5号車",
        task: "移動支援",
        summary: "送迎",
      },
      {
        date: toDateKey(year, month, 23),
        helperName: "石井 真由",
        userName: "利用者J",
        startTime: "16:00",
        endTime: "17:00",
        haisha: "1号車",
        task: "居宅介護",
        summary: "夕方介助",
      },
      {
        date: toDateKey(year, month, 27),
        helperName: "松本 由美",
        userName: "利用者K",
        startTime: "10:00",
        endTime: "11:00",
        haisha: "2号車",
        task: "移動支援",
        summary: "買い物外出",
      },
      {
        date: toDateKey(year, month, 30),
        helperName: "山口 美咲",
        userName: "利用者L",
        startTime: "13:00",
        endTime: "14:00",
        haisha: "なし",
        task: "居宅介護",
        summary: "生活援助",
      },
    ],
  };
}

function getMonthMatrix(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const weeks = [];
  let dayCounter = 1 - firstDay;

  while (dayCounter <= daysInMonth) {
    const week = [];

    for (let weekday = 0; weekday < 7; weekday += 1) {
      const currentDate = new Date(year, month - 1, dayCounter);

      week.push({
        year: currentDate.getFullYear(),
        month: currentDate.getMonth() + 1,
        day: currentDate.getDate(),
        weekday: weekday,
        date: toDateKey(
          currentDate.getFullYear(),
          currentDate.getMonth() + 1,
          currentDate.getDate()
        ),
        isCurrentMonth: currentDate.getMonth() === month - 1,
      });

      dayCounter += 1;
    }

    weeks.push(week);
  }

  return weeks;
}

function groupSchedulesByDate(items) {
  return items.reduce(function (accumulator, item) {
    if (!accumulator[item.date]) {
      accumulator[item.date] = [];
    }

    accumulator[item.date].push(item);
    return accumulator;
  }, {});
}

function getGroupKeyPart(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function buildScheduleGroupKey(item) {
  return [
    getGroupKeyPart(item.date),
    getGroupKeyPart(item.userName),
    getGroupKeyPart(item.startTime),
  ].join("\u0001");
}

function groupScheduleItems(items) {
  const groupedItems = [];
  const groupedMap = new Map();

  (Array.isArray(items) ? items : []).forEach(function (item) {
    const key = buildScheduleGroupKey(item);
    const helperName = String(item.helperName || "").trim();
    const existing = groupedMap.get(key);

    if (!existing) {
      const nextItem = {
        ...item,
        helperNames: helperName ? [helperName] : [],
      };

      groupedMap.set(key, nextItem);
      groupedItems.push(nextItem);
      return;
    }

    if (helperName && !existing.helperNames.includes(helperName)) {
      existing.helperNames.push(helperName);
    }

    if (!existing.task && item.task) {
      existing.task = item.task;
    }

    if (!existing.endTime && item.endTime) {
      existing.endTime = item.endTime;
    }

    if (!existing.haisha && item.haisha) {
      existing.haisha = item.haisha;
    }
  });

  return groupedItems.map(function (item) {
    return {
      ...item,
      helperName: item.helperNames.join("・"),
    };
  });
}

function applyFilters(data) {
  const keyword = state.searchKeyword.trim();
  const selectedHelper = state.selectedHelper.trim();
  const items = groupScheduleItems(data.items);

  return {
    year: data.year,
    month: data.month,
    items: items.filter(function (item) {
      const helperNames = Array.isArray(item.helperNames) ? item.helperNames : [];
      const matchesSelect =
        !selectedHelper || helperNames.includes(selectedHelper);
      const matchesSearch =
        !keyword ||
        helperNames.some(function (helperName) {
          return helperName.includes(keyword);
        });
      return matchesSelect && matchesSearch;
    }),
  };
}

function getHelperOptions(items) {
  const names = [];
  (Array.isArray(items) ? items : []).forEach(function (item) {
    const raw = String(item.helperName || "").trim();
    // 全角・半角スペースで分割して個別名を抽出
    raw.split(/[\s\u3000]+/).forEach(function (name) {
      const n = name.trim();
      if (n) names.push(n);
    });
  });
  return Array.from(new Set(names)).sort(function (a, b) {
    return a.localeCompare(b, "ja");
  });
}

function renderHelperOptions() {
  const options = getHelperOptions(state.rawData?.items);
  const currentValue = state.selectedHelper;

  helperSelectElement.innerHTML = [
    '<option value="">すべてのヘルパー</option>',
  ]
    .concat(options.map(function (helperName) {
      const selected = helperName === currentValue ? ' selected' : "";
      return `<option value="${escapeHtml(helperName)}"${selected}>${escapeHtml(helperName)}</option>`;
    }))
    .join("");
}

function getItemsByDate(date) {
  if (!state.filteredData || !Array.isArray(state.filteredData.items)) {
    return [];
  }

  return state.filteredData.items.filter(function (item) {
    return item.date === date;
  });
}

function renderDayModal(date, items) {
  const { year, month, day } = parseDateParts(date);
  dayModalTitleElement.textContent = `${year}年${month}月${day}日`;
  dayModalMetaElement.textContent = `${items.length}件の予定`;

  if (items.length === 0) {
    dayModalBodyElement.innerHTML = '<div class="modal-empty">予定はありません。</div>';
    return;
  }

  dayModalBodyElement.innerHTML = items
    .map(function (item) {
      return `
        <article class="schedule-card schedule-card--modal">
          <div class="schedule-card__headline">${escapeHtml(getHelperLabel(item))}</div>
          <div class="schedule-card__line">
            <span class="schedule-card__icon" aria-hidden="true">👤</span>
            <span class="schedule-card__value is-strong">: ${escapeHtml(getDisplayValue(item.userName, "利用者未設定"))}</span>
          </div>
          <div class="schedule-card__line">
            <span class="schedule-card__icon" aria-hidden="true">🕒</span>
            <span class="schedule-card__value">: ${escapeHtml(getDisplayValue(formatTimeRange(item), "時間未設定"))}</span>
          </div>
          <div class="schedule-card__line">
            <span class="schedule-card__icon" aria-hidden="true">🚗</span>
            <span class="schedule-card__value">: ${escapeHtml(getDisplayValue(item.haisha, "—"))}</span>
          </div>
          <div class="schedule-card__line">
            <span class="schedule-card__icon" aria-hidden="true">📝</span>
            <span class="schedule-card__value">: ${escapeHtml(getDisplayValue(item.task, "—"))}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function openDayModal(date) {
  renderDayModal(date, getItemsByDate(date));
  dayModalOverlayElement.classList.add("is-open");
  dayModalOverlayElement.setAttribute("aria-hidden", "false");
}

function closeDayModal() {
  dayModalOverlayElement.classList.remove("is-open");
  dayModalOverlayElement.setAttribute("aria-hidden", "true");
}

function bindCalendarDayEvents() {
  scheduleCalendarElement.querySelectorAll("[data-date]").forEach(function (element) {
    element.addEventListener("click", function () {
      const date = element.getAttribute("data-date");

      if (date) {
        openDayModal(date);
      }
    });
  });
}

async function fetchSchedule(year, month) {
  const url = `${SCHEDULE_LIST_ENDPOINT}?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error("schedule-list API error:", response.status);
      return getMockScheduleData(year, month);
    }

    const data = await response.json();

    if (!data || !data.ok) {
      console.error("invalid response:", data);
      return getMockScheduleData(year, month);
    }

    return data;
  } catch (error) {
    console.error("schedule-list fetch failed:", error);
    return getMockScheduleData(year, month);
  }
}

function renderWeekButtons(weeks) {
  const currentIndex = state.activeWeekIndex;

  weekButtonsElement.innerHTML = [
    `<button class="week-button ${currentIndex === -1 ? "is-active" : ""}" type="button" data-week-index="-1">全週</button>`,
  ]
    .concat(
      weeks.map(function (_week, index) {
        return `<button class="week-button ${currentIndex === index ? "is-active" : ""}" type="button" data-week-index="${index}">${index + 1}週目</button>`;
      })
    )
    .join("");
}

function renderCalendar(data) {
  const weeks = getMonthMatrix(data.year, data.month);
  const grouped = groupSchedulesByDate(data.items || []);
  const today = getTodayParts();
  const maxPreviewItems = 2;
  const weekdayHeader = WEEKDAY_LABELS.map(function (label) {
    return `<div class="calendar-weekday">${label}</div>`;
  }).join("");

  const cells = weeks
    .flatMap(function (week, weekIndex) {
      return week.map(function (day) {
        const dayItems = grouped[day.date] || [];
        const previewItems = dayItems.slice(0, maxPreviewItems);
        const remainingCount = Math.max(dayItems.length - maxPreviewItems, 0);
        const classNames = [
          "calendar-cell",
          day.isCurrentMonth ? "" : "is-empty",
          state.activeWeekIndex === weekIndex ? "is-active-week" : "",
          day.year === today.year && day.month === today.month && day.day === today.day
            ? "is-today"
            : "",
        ]
          .filter(Boolean)
          .join(" ");

        return `
          <div class="${classNames}" ${day.isCurrentMonth ? `data-date="${day.date}"` : ""}>
            <div class="calendar-date">
              <span>${day.day}</span>
              <span class="calendar-count">${dayItems.length}</span>
            </div>
            <div class="calendar-preview">
              ${previewItems
                .map(function (item) {
                  return `
                    <div class="calendar-preview-item">
                      <div class="calendar-preview-helper">${escapeHtml(getHelperLabel(item))}</div>
                      <div class="calendar-preview-user">👤 : ${escapeHtml(getDisplayValue(item.userName, "利用者未設定"))}</div>
                      <div class="calendar-preview-line">🕒 : ${escapeHtml(getDisplayValue(formatTimeRange(item), "時間未設定"))}</div>
                      <div class="calendar-preview-line">🚗 : ${escapeHtml(getDisplayValue(item.haisha, "—"))}</div>
                      <div class="calendar-preview-line">📝 : ${escapeHtml(getDisplayValue(item.task, "—"))}</div>
                    </div>
                  `;
                })
                .join("")}
              ${
                remainingCount > 0
                  ? `<div class="calendar-preview-more">他${remainingCount}件</div>`
                  : ""
              }
            </div>
          </div>
        `;
      });
    })
    .join("");

  scheduleCalendarElement.innerHTML = `
    <div class="month-scroll-wrap">
      <div class="calendar-grid">
        ${weekdayHeader}
        ${cells}
      </div>
    </div>
  `;

  bindCalendarDayEvents();
}

function renderScheduleColumns(data) {
  const weeks = getMonthMatrix(data.year, data.month);
  const visibleWeeks = state.activeWeekIndex === -1 ? weeks : [weeks[state.activeWeekIndex] || weeks[0]];
  const grouped = groupSchedulesByDate(data.items || []);

  weekSummaryElement.textContent =
    state.activeWeekIndex === -1 ? "全週表示" : `${state.activeWeekIndex + 1}週目`;

  scheduleColumnsElement.innerHTML = visibleWeeks
    .map(function (week) {
      const columns = week
        .map(function (day) {
          const items = grouped[day.date] || [];

          return `
            <section class="day-column ${day.isCurrentMonth ? "" : "is-muted"}">
              <div class="day-column-head">
                <div class="day-column-label">${WEEKDAY_LABELS[day.weekday]}</div>
                <div class="day-column-date">${day.month}/${day.day}</div>
              </div>
              <div class="day-column-body">
                ${
                  items.length === 0
                    ? '<div class="empty-card">予定はありません。</div>'
                    : items
                        .map(function (item) {
                          return `
                            <article class="schedule-card">
                              <div class="schedule-card__date">${escapeHtml(item.date || "")}</div>
                              <div class="schedule-card__time">${escapeHtml(formatTimeRange(item))}</div>
                              <div class="schedule-card__user">利用者: ${escapeHtml(item.userName || "利用者未設定")}</div>
                              <div class="schedule-card__helper">${escapeHtml(getHelperLabel(item))}</div>
                              <div class="schedule-card__meta">配車: ${escapeHtml(item.haisha || "-")}</div>
                              <div class="schedule-card__meta">内容: ${escapeHtml(item.task || "-")}</div>
                            </article>
                          `;
                        })
                        .join("")
                }
              </div>
            </section>
          `;
        })
        .join("");

      return `<div class="week-scroll-wrap"><div class="columns-grid">${columns}</div></div>`;
    })
    .join('<div style="height: 12px;"></div>');
}

function updateMonthLabels(year, month) {
  const label = formatMonthLabel(year, month);
  pageTitleElement.textContent = `${label} ビレッジスケジュール`;
  monthLabelElement.textContent = label;
}

function renderScheduleView() {
  if (!state.rawData) {
    return;
  }

  fetchErrorBannerElement.hidden = !state.rawData.isMock;
  updateMonthLabels(state.currentYear, state.currentMonth);
  renderHelperOptions();

  const filteredData = applyFilters(state.rawData);
  state.filteredData = filteredData;
  const weeks = getMonthMatrix(filteredData.year, filteredData.month);

  renderWeekButtons(weeks);
  renderCalendar(filteredData);
  renderScheduleColumns(filteredData);
}

async function refreshScheduleView() {
  const viewState = getCurrentViewState();
  state.rawData = await fetchSchedule(viewState.year, viewState.month);
  renderScheduleView();
}

function bindEvents() {
  prevMonthButton.addEventListener("click", function () {
    setCurrentMonth(state.currentYear, state.currentMonth - 1);
    state.activeWeekIndex = -1;
    refreshScheduleView();
  });

  nextMonthButton.addEventListener("click", function () {
    setCurrentMonth(state.currentYear, state.currentMonth + 1);
    state.activeWeekIndex = -1;
    refreshScheduleView();
  });

  searchInputElement.addEventListener("input", function (event) {
    state.searchKeyword = event.target.value;
    renderScheduleView();
  });

  helperSelectElement.addEventListener("change", function (event) {
    state.selectedHelper = event.target.value;
    renderScheduleView();
  });

  reloadButtonElement.addEventListener("click", function () {
    refreshScheduleView();
  });

  weekButtonsElement.addEventListener("click", function (event) {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const { weekIndex } = target.dataset;

    if (weekIndex === undefined) {
      return;
    }

    state.activeWeekIndex = Number(weekIndex);
    renderScheduleView();
  });

  dayModalCloseElement.addEventListener("click", closeDayModal);

  dayModalOverlayElement.addEventListener("click", function (event) {
    if (event.target === dayModalOverlayElement) {
      closeDayModal();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeDayModal();
    }
  });
}

function initializeScheduleSyncPage() {
  const today = getTodayParts();

  setCurrentMonth(today.year, today.month);
  updateMonthLabels(state.currentYear, state.currentMonth);
  bindEvents();
  refreshScheduleView();
}

initializeScheduleSyncPage();
