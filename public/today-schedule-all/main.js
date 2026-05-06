const TODAY_SCHEDULE_ALL_ENDPOINT = "/api/today-schedule-all";

const state = {
  date: "",
  count: 0,
  items: [],
  status: "loading",
  message: "読み込み中...",
};

function getRequiredElement(id) {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`missing element: ${id}`);
  }

  return element;
}

const scheduleDateElement = getRequiredElement("schedule-date");
const scheduleCountElement = getRequiredElement("schedule-count");
const statusCardElement = getRequiredElement("status-card");
const emptyCardElement = getRequiredElement("empty-card");
const scheduleListElement = getRequiredElement("schedule-list");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getDisplayValue(value, fallback = "—") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function formatTimeRange(item) {
  const startTime = getDisplayValue(item.startTime, "");
  const endTime = getDisplayValue(item.endTime, "");

  if (startTime && endTime) {
    return `${startTime}〜${endTime}`;
  }

  if (startTime) {
    return `${startTime}〜`;
  }

  return "時間未設定";
}

function setStatus(status, message) {
  state.status = status;
  state.message = message;
}

function renderStatus() {
  const shouldShowStatus = state.status === "loading" || state.status === "error";
  statusCardElement.classList.toggle("is-visible", shouldShowStatus);
  statusCardElement.classList.toggle("is-error", state.status === "error");
  statusCardElement.textContent = state.message;
}

function renderMeta() {
  scheduleDateElement.textContent = state.date || "-";
  scheduleCountElement.textContent = String(state.count || 0);
}

function renderEmpty() {
  const shouldShowEmpty = state.status === "success" && state.items.length === 0;
  emptyCardElement.classList.toggle("is-visible", shouldShowEmpty);
}

function groupScheduleItems(items) {
  const groups = [];
  const map = new Map();

  (Array.isArray(items) ? items : []).forEach(function (item) {
    const userName = String(item.userName || "").trim();
    const startTime = String(item.startTime || "").trim();
    const key = `${userName}${startTime}`;
    const existing = map.get(key);
    const entry = {
      helperName: String(item.helperName || "").trim(),
      startTime: item.startTime,
      endTime: item.endTime,
      haisha: item.haisha,
      task: item.task,
      summary: item.summary,
    };

    if (!existing) {
      const group = {
        userName: item.userName,
        startTime: item.startTime,
        endTime: item.endTime,
        helperEntries: [entry],
      };
      map.set(key, group);
      groups.push(group);
      return;
    }

    existing.helperEntries.push(entry);
  });

  return groups;
}

function renderHelperBlock(entry) {
  return `
    <div class="schedule-helper-block">
      <div class="schedule-helper">${escapeHtml(getDisplayValue(entry.helperName))}</div>
      <div class="schedule-details">
        <div class="schedule-row">
          <div class="schedule-label">🕒 時間</div>
          <div class="schedule-value">${escapeHtml(formatTimeRange(entry))}</div>
        </div>
        <div class="schedule-row">
          <div class="schedule-label">🚗 配車</div>
          <div class="schedule-value">${escapeHtml(getDisplayValue(entry.haisha))}</div>
        </div>
        <div class="schedule-row">
          <div class="schedule-label">📝 内容</div>
          <div class="schedule-value">${escapeHtml(getDisplayValue(entry.task))}</div>
        </div>
      </div>
    </div>
  `;
}

function renderItems() {
  if (state.status !== "success" || state.items.length === 0) {
    scheduleListElement.innerHTML = "";
    return;
  }

  const groups = groupScheduleItems(state.items);

  scheduleListElement.innerHTML = groups.map(function (group) {
    const entries = group.helperEntries;

    if (entries.length <= 1) {
      const entry = entries[0] || {};
      return `
        <article class="schedule-card">
          <div class="schedule-time">${escapeHtml(formatTimeRange(entry))}</div>
          <div class="schedule-helper">${escapeHtml(getDisplayValue(entry.helperName))}</div>
          <div class="schedule-details">
            <div class="schedule-row">
              <div class="schedule-label">👤 利用者</div>
              <div class="schedule-value">${escapeHtml(getDisplayValue(group.userName))}</div>
            </div>
            <div class="schedule-row">
              <div class="schedule-label">🚗 配車</div>
              <div class="schedule-value">${escapeHtml(getDisplayValue(entry.haisha))}</div>
            </div>
            <div class="schedule-row">
              <div class="schedule-label">📝 内容</div>
              <div class="schedule-value">${escapeHtml(getDisplayValue(entry.task))}</div>
            </div>
          </div>
        </article>
      `;
    }

    const blocks = entries.map(renderHelperBlock).join("");

    return `
      <article class="schedule-card schedule-card--multi">
        <div class="schedule-row schedule-card__user">
          <div class="schedule-label">👤 利用者</div>
          <div class="schedule-value schedule-value--user">${escapeHtml(getDisplayValue(group.userName))}</div>
        </div>
        <div class="schedule-helpers">${blocks}</div>
      </article>
    `;
  }).join("");
}

function render() {
  renderMeta();
  renderStatus();
  renderEmpty();
  renderItems();
}

async function fetchTodayScheduleAll() {
  const response = await fetch(TODAY_SCHEDULE_ALL_ENDPOINT, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(function () {
    return null;
  });

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || "予定の取得に失敗しました");
  }

  return data;
}

async function initializePage() {
  try {
    setStatus("loading", "読み込み中...");
    render();

    const result = await fetchTodayScheduleAll();
    state.date = result.date || "";
    state.items = Array.isArray(result.items) ? result.items : [];
    state.count = Number(result.count) || state.items.length;
    setStatus("success", "");
    render();
  } catch (error) {
    console.error("[today-schedule-all] fetch error:", error);
    state.items = [];
    state.count = 0;
    setStatus("error", "予定の取得に失敗しました");
    render();
  }
}

initializePage();
