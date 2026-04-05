import { getSavedHelperEmail } from "../lib/helperEmail.js";

const TODAY_SCHEDULE_ENDPOINT = "/api/today-schedule";

const state = {
  helperEmail: "",
  date: "",
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
const helperEmailElement = getRequiredElement("helper-email");
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

function getHelperEmailFromQuery() {
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get("helper_email")?.trim() ?? "";
}

function buildApiUrl(helperEmail) {
  const url = new URL(TODAY_SCHEDULE_ENDPOINT, window.location.origin);
  url.searchParams.set("helper_email", helperEmail);
  return url.toString();
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
  helperEmailElement.textContent = state.helperEmail || "-";
}

function renderEmpty() {
  const shouldShowEmpty = state.status === "success" && state.items.length === 0;
  emptyCardElement.classList.toggle("is-visible", shouldShowEmpty);
}

function renderItems() {
  if (state.status !== "success" || state.items.length === 0) {
    scheduleListElement.innerHTML = "";
    return;
  }

  scheduleListElement.innerHTML = state.items.map(function (item) {
    return `
      <article class="schedule-card">
        <div class="schedule-time">${escapeHtml(formatTimeRange(item))}</div>
        <div class="schedule-helper">${escapeHtml(getDisplayValue(item.helperName))}</div>
        <div class="schedule-details">
          <div class="schedule-row">
            <div class="schedule-label">👤 利用者</div>
            <div class="schedule-value">${escapeHtml(getDisplayValue(item.userName))}</div>
          </div>
          <div class="schedule-row">
            <div class="schedule-label">🚗 配車</div>
            <div class="schedule-value">${escapeHtml(getDisplayValue(item.haisha))}</div>
          </div>
          <div class="schedule-row">
            <div class="schedule-label">📝 内容</div>
            <div class="schedule-value">${escapeHtml(getDisplayValue(item.task))}</div>
          </div>
          <div class="schedule-row">
            <div class="schedule-label">⚠️ 概要</div>
            <div class="schedule-value is-danger">${escapeHtml(getDisplayValue(item.summary))}</div>
          </div>
        </div>
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

async function fetchTodaySchedule(helperEmail) {
  const response = await fetch(buildApiUrl(helperEmail), {
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
  state.helperEmail = getHelperEmailFromQuery();

  if (!state.helperEmail) {
    state.helperEmail = getSavedHelperEmail();
  }

  render();

  if (!state.helperEmail) {
    setStatus("error", "helper_email が指定されていません");
    render();
    return;
  }

  helperEmailElement.textContent = state.helperEmail;

  try {
    setStatus("loading", "読み込み中...");
    render();

    const result = await fetchTodaySchedule(state.helperEmail);
    state.date = result.date || "";
    state.helperEmail = result.helperEmail || state.helperEmail;
    state.items = Array.isArray(result.items) ? result.items : [];
    setStatus("success", "");
    render();
  } catch (error) {
    console.error("[today-schedule] fetch error:", error);
    state.items = [];
    setStatus("error", "予定の取得に失敗しました");
    render();
  }
}

initializePage();
