import { getSavedHelperEmail } from "../lib/helperEmail.js";

const TOMORROW_SCHEDULE_ENDPOINT = "/api/tomorrow-schedule";
const CAL_STORAGE_KEY = "village_cal_added";

function getCalAdded() {
  try {
    return JSON.parse(localStorage.getItem(CAL_STORAGE_KEY) || "{}");
  } catch { return {}; }
}

function markCalAdded(dateStr, index, type) {
  const data = getCalAdded();
  const key = `${dateStr}_${index}_${type}`;
  data[key] = Date.now();
  localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify(data));
}

function isCalAdded(dateStr, index, type) {
  const data = getCalAdded();
  return !!data[`${dateStr}_${index}_${type}`];
}

function markBulkAdded(dateStr) {
  const data = getCalAdded();
  data[`${dateStr}_bulk`] = Date.now();
  localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify(data));
}

function isBulkAdded(dateStr) {
  const data = getCalAdded();
  return !!data[`${dateStr}_bulk`];
}

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
  const url = new URL(TOMORROW_SCHEDULE_ENDPOINT, window.location.origin);
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
  const shouldShowEmpty = state.status === "empty";
  emptyCardElement.textContent = state.message || "明日の予定はありません";
  emptyCardElement.classList.toggle("is-visible", shouldShowEmpty);
}

function padTwo(n) {
  return String(n).padStart(2, "0");
}

function toIcsDatetime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const d = dateStr.replace(/-/g, "");
  const t = timeStr.replace(/:/g, "").slice(0, 4) + "00";
  return d + "T" + t;
}

function generateIcs(item, dateStr) {
  const start = toIcsDatetime(dateStr, item.startTime);
  const end = toIcsDatetime(dateStr, item.endTime);
  if (!start) return null;

  const summary = [
    getDisplayValue(item.task, "予定"),
    getDisplayValue(item.userName, ""),
  ].filter(Boolean).join(" - ");

  const description = [
    item.userName ? `利用者: ${item.userName}` : "",
    item.helperName ? `担当: ${item.helperName}` : "",
    item.haisha ? `配車: ${item.haisha}` : "",
    item.task ? `内容: ${item.task}` : "",
  ].filter(Boolean).join("\\n");

  const uid = `${start}-${(item.id || Math.random().toString(36).slice(2))}@village-tsubasa`;
  const now = new Date();
  const stamp = `${now.getFullYear()}${padTwo(now.getMonth() + 1)}${padTwo(now.getDate())}T${padTwo(now.getHours())}${padTwo(now.getMinutes())}${padTwo(now.getSeconds())}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Village Tsubasa//Hiroba//JA",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Asia/Tokyo:${start}`,
  ];

  if (end) {
    lines.push(`DTEND;TZID=Asia/Tokyo:${end}`);
  }

  lines.push(
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT60M",
    "ACTION:DISPLAY",
    "DESCRIPTION:1時間後に予定があります",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  );

  return lines.join("\r\n");
}

function downloadIcs(item, dateStr) {
  const ics = generateIcs(item, dateStr);
  if (!ics) {
    alert("時間情報がないためカレンダーに追加できません");
    return;
  }
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `schedule-${dateStr}-${(item.startTime || "").replace(/:/g, "")}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openGoogleCalendar(item, dateStr) {
  const start = toIcsDatetime(dateStr, item.startTime);
  const end = toIcsDatetime(dateStr, item.endTime);
  if (!start) {
    alert("時間情報がないためカレンダーに追加できません");
    return;
  }

  const title = [
    getDisplayValue(item.task, "予定"),
    getDisplayValue(item.userName, ""),
  ].filter(Boolean).join(" - ");

  const details = [
    item.userName ? `利用者: ${item.userName}` : "",
    item.helperName ? `担当: ${item.helperName}` : "",
    item.haisha ? `配車: ${item.haisha}` : "",
    item.task ? `内容: ${item.task}` : "",
  ].filter(Boolean).join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end || start}`,
    details: details,
    ctz: "Asia/Tokyo",
  });

  window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank");
}

function renderItems() {
  if (state.status !== "success" || state.items.length === 0) {
    scheduleListElement.innerHTML = "";
    return;
  }

  scheduleListElement.innerHTML = state.items.map(function (item, index) {
    const googleAdded = isCalAdded(state.date, index, "google");
    const appleAdded = isCalAdded(state.date, index, "apple");

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
        </div>
        <div class="cal-buttons">
          <button class="cal-btn ${googleAdded ? "cal-btn--added" : "cal-btn--google"}" data-index="${index}" data-cal="google">${googleAdded ? "Google追加済み" : "Googleカレンダーに追加"}</button>
          <button class="cal-btn ${appleAdded ? "cal-btn--added" : "cal-btn--apple"}" data-index="${index}" data-cal="apple">${appleAdded ? "iPhone追加済み" : "iPhoneカレンダー"}</button>
        </div>
      </article>
    `;
  }).join("");

  scheduleListElement.querySelectorAll(".cal-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const idx = parseInt(btn.dataset.index, 10);
      const calType = btn.dataset.cal;
      const item = state.items[idx];
      if (!item) return;

      const alreadyAdded = isCalAdded(state.date, idx, calType);
      if (alreadyAdded) {
        if (!confirm("この予定はすでにカレンダーに追加済みです。もう一度追加しますか？")) {
          return;
        }
      }

      if (calType === "google") {
        openGoogleCalendar(item, state.date);
      } else {
        downloadIcs(item, state.date);
      }

      markCalAdded(state.date, idx, calType);
      btn.textContent = calType === "google" ? "Google追加済み" : "iPhone追加済み";
      btn.classList.remove("cal-btn--google", "cal-btn--apple");
      btn.classList.add("cal-btn--added");
    });
  });
}

function generateBulkIcs(items, dateStr) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${padTwo(now.getMonth() + 1)}${padTwo(now.getDate())}T${padTwo(now.getHours())}${padTwo(now.getMinutes())}${padTwo(now.getSeconds())}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Village Tsubasa//Hiroba//JA",
    "CALSCALE:GREGORIAN",
  ];

  items.forEach(function (item) {
    const start = toIcsDatetime(dateStr, item.startTime);
    const end = toIcsDatetime(dateStr, item.endTime);
    if (!start) return;

    const summary = [
      getDisplayValue(item.task, "予定"),
      getDisplayValue(item.userName, ""),
    ].filter(Boolean).join(" - ");

    const description = [
      item.userName ? `利用者: ${item.userName}` : "",
      item.helperName ? `担当: ${item.helperName}` : "",
      item.haisha ? `配車: ${item.haisha}` : "",
      item.task ? `内容: ${item.task}` : "",
    ].filter(Boolean).join("\\n");

    const uid = `${start}-${(item.id || Math.random().toString(36).slice(2))}@village-tsubasa`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Tokyo:${start}`,
    );
    if (end) lines.push(`DTEND;TZID=Asia/Tokyo:${end}`);
    lines.push(
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT60M",
      "ACTION:DISPLAY",
      "DESCRIPTION:1時間後に予定があります",
      "END:VALARM",
      "END:VEVENT"
    );
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadBulkIcs(items, dateStr) {
  if (!items || items.length === 0) return;
  const ics = generateBulkIcs(items, dateStr);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `schedule-${dateStr}-all.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const calBulkBtn = document.getElementById("cal-bulk-btn");
calBulkBtn.addEventListener("click", function () {
  const alreadyBulk = isBulkAdded(state.date);
  if (alreadyBulk) {
    if (!confirm("この日の予定はすでに一括追加済みです。もう一度追加しますか？")) {
      return;
    }
  }
  downloadBulkIcs(state.items, state.date);
  markBulkAdded(state.date);
  calBulkBtn.textContent = "全件追加済み";
  calBulkBtn.classList.add("is-added");
});

function renderBulkButton() {
  const show = state.status === "success" && state.items.length > 1;
  calBulkBtn.classList.toggle("is-visible", show);
  if (show && isBulkAdded(state.date)) {
    calBulkBtn.textContent = "全件追加済み";
    calBulkBtn.classList.add("is-added");
  }
}

function render() {
  renderMeta();
  renderStatus();
  renderEmpty();
  renderBulkButton();
  renderItems();
}

async function fetchTomorrowSchedule(helperEmail) {
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

    const result = await fetchTomorrowSchedule(state.helperEmail);
    state.date = result.date || "";
    state.helperEmail = result.helperEmail || state.helperEmail;
    state.items = Array.isArray(result.items) ? result.items : [];

    if ((Number(result.count) || 0) === 0 || state.items.length === 0) {
      state.items = [];
      setStatus("empty", "明日の予定はありません");
      render();
      return;
    }

    setStatus("success", "");
    render();
  } catch (error) {
    console.error("[tomorrow-schedule] fetch error:", error);
    state.items = [];
    setStatus("error", "予定の取得に失敗しました");
    render();
  }
}

initializePage();
