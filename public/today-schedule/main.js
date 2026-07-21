import { getSavedHelperEmail } from "../lib/helperEmail.js";

const TODAY_SCHEDULE_ENDPOINT = "/api/today-schedule";
const DELAY_NOTIFY_ENDPOINT = "/api/delay-notify";
const CAL_STORAGE_KEY = "village_cal_added";
const DELAY_STORAGE_KEY = "village_delay_sent";
const DELAY_FETCH_TIMEOUT_MS = 15000;

// localStorage は「このカードは連絡済み」というバッジ表示のためだけに持つ。
// 送信の真実は Supabase の delay_notices テーブル側にあり、二重送信は
// サーバー /api/delay-notify の 409（status='sent' 済み判定）が防ぐ。
// なので端末をまたいだり localStorage が消えても安全側に倒れる
// （最悪もう一度タップしてもサーバーが 409 で弾く）。ここは表示専用と割り切る。
function getDelaySent() {
  try {
    return JSON.parse(localStorage.getItem(DELAY_STORAGE_KEY) || "{}");
  } catch { return {}; }
}

function markDelaySent(dateStr, scheduleId, minutes) {
  const data = getDelaySent();
  data[`${dateStr}_${scheduleId}`] = { minutes, at: Date.now() };
  localStorage.setItem(DELAY_STORAGE_KEY, JSON.stringify(data));
}

function getDelayRecord(dateStr, scheduleId) {
  const data = getDelaySent();
  return data[`${dateStr}_${scheduleId}`] || null;
}

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

// ========== 遅延連絡（📢 遅れる連絡）==========

function formatClock(ts) {
  const d = new Date(ts);
  return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}`;
}

// 分数選択肢。ラベルは画面表示、minutes はサーバーへ送る値
const DELAY_OPTIONS = [
  { minutes: 10, label: "10分ほど遅れます" },
  { minutes: 20, label: "20分ほど遅れます" },
  { minutes: 30, label: "30分以上遅れます" },
];

const delaySheet = {
  active: null,   // { item } 送信対象
  sending: false, // 送信中は外側タップで閉じない
};

function ensureDelaySheet() {
  if (document.getElementById("delay-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "delay-overlay";
  overlay.className = "delay-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="delay-sheet" role="dialog" aria-modal="true" aria-labelledby="delay-title">
      <div class="delay-title" id="delay-title"></div>
      <div class="delay-body" id="delay-body"></div>
    </div>`;

  // シート外（暗い部分）タップで閉じる。ただし送信中は閉じない
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay && !delaySheet.sending) {
      closeDelaySheet();
    }
  });

  document.body.appendChild(overlay);
}

function setDelayTitle(text) {
  document.getElementById("delay-title").textContent = text;
}

function openDelaySheet(item) {
  ensureDelaySheet();
  delaySheet.active = { item };
  delaySheet.sending = false;
  document.getElementById("delay-overlay").hidden = false;
  document.body.style.overflow = "hidden";
  renderDelayChoose();
}

function closeDelaySheet() {
  const overlay = document.getElementById("delay-overlay");
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = "";
  delaySheet.active = null;
  delaySheet.sending = false;
}

// ステップ1: 分数を選ぶ
function renderDelayChoose() {
  const item = delaySheet.active.item;
  const name = getDisplayValue(item.userName, "利用者様");
  setDelayTitle(`${name} に遅延の連絡をします`);

  const body = document.getElementById("delay-body");
  body.innerHTML = "";

  DELAY_OPTIONS.forEach(function (opt) {
    const btn = document.createElement("button");
    btn.className = "delay-opt";
    btn.textContent = opt.label;
    btn.addEventListener("click", function () {
      renderDelayConfirm(opt.minutes);
    });
    body.appendChild(btn);
  });

  const cancel = document.createElement("button");
  cancel.className = "delay-cancel";
  cancel.textContent = "キャンセル";
  cancel.addEventListener("click", closeDelaySheet);
  body.appendChild(cancel);
}

// ステップ2: 確認
function renderDelayConfirm(minutes) {
  const item = delaySheet.active.item;
  const name = getDisplayValue(item.userName, "利用者様");
  setDelayTitle(`${name} に遅延の連絡をします`);

  const body = document.getElementById("delay-body");
  body.innerHTML = "";

  const text = document.createElement("p");
  text.className = "delay-confirm-text";
  text.textContent = `${name} に『${minutes}分ほど遅れます』と送信します。よろしいですか？`;
  body.appendChild(text);

  const send = document.createElement("button");
  send.className = "delay-opt delay-opt--send";
  send.textContent = "送信する";

  const back = document.createElement("button");
  back.className = "delay-cancel";
  back.textContent = "戻る";
  back.addEventListener("click", renderDelayChoose);

  // 二重タップ防止: 送信開始で両ボタンを disabled
  send.addEventListener("click", function () {
    send.disabled = true;
    back.disabled = true;
    send.textContent = "送信中...";
    submitDelay(item, minutes);
  });

  body.appendChild(send);
  body.appendChild(back);
}

async function submitDelay(item, minutes) {
  delaySheet.sending = true;
  const result = await postDelayNotify(item, minutes);
  delaySheet.sending = false;

  // 送信中は閉じられないので active は生きているが、念のため確認
  if (!delaySheet.active) return;

  if (result.kind === "sent") {
    // バッジは localStorage から復元する方式なので、保存 → 再描画で反映
    markDelaySent(state.date, item.id, minutes);
    closeDelaySheet();
    render();
    return;
  }

  // 以下はシートを閉じずにメッセージを見せる
  let text;
  let danger = false;

  if (result.kind === "timeout") {
    // タイムアウト＝未送信とは限らない。再送を促さず、電話確認へ倒す
    text = "送信状況を確認できませんでした。LINEが届いているか分からないため、事業所へお電話ください。";
    danger = true;
  } else if (result.kind === "phone") {
    text = result.message || "送信できませんでした。事業所へご連絡ください。";
    danger = true;
  } else if (result.kind === "conflict") {
    text = result.message || "この予定はすでに連絡済みです。";
    if (result.previous && result.previous.minutes != null) {
      text += `（${result.previous.minutes}分遅れで連絡済み）`;
    }
  } else {
    text = result.message || "送信できませんでした。事業所へご連絡ください。";
  }

  showDelayMessage(text, danger);
}

function showDelayMessage(text, danger) {
  const body = document.getElementById("delay-body");
  body.innerHTML = "";

  const p = document.createElement("p");
  p.className = "delay-result" + (danger ? " delay-result--danger" : "");
  p.textContent = text; // サーバー文言をそのまま表示（textContent で XSS 回避）
  body.appendChild(p);

  const close = document.createElement("button");
  close.className = "delay-cancel";
  close.textContent = "閉じる";
  close.addEventListener("click", closeDelaySheet);
  body.appendChild(close);
}

/**
 * /api/delay-notify を叩く。戻り値は
 *   { kind: "sent",     message, minutes }
 *   { kind: "phone",    message }            … needsPhoneCall
 *   { kind: "conflict", message, previous }  … 409 連絡済み
 *   { kind: "error",    message }            … その他
 *   { kind: "timeout" }                      … 15秒超過 / 通信失敗 / JSON パース失敗
 * のいずれか。timeout は「確認できなかった」を意味し、未送信とは限らない。
 */
async function postDelayNotify(item, minutes) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, DELAY_FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(DELAY_NOTIFY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        scheduleId: item.id,
        minutes,
        helperName: item.helperName ?? "",
      }),
      signal: controller.signal,
    });
  } catch (error) {
    // abort（タイムアウト）も通信エラーも「確認できなかった」に倒す
    console.error("[delay-notify] fetch error:", error);
    return { kind: "timeout" };
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    // ボディが読めない＝結果を確認できない。タイムアウトと同じ扱い
    console.error("[delay-notify] json parse error:", error);
    return { kind: "timeout" };
  }

  if (data && data.sent === true) {
    return { kind: "sent", message: data.message, minutes };
  }
  if (data && data.needsPhoneCall === true) {
    return { kind: "phone", message: data.message };
  }
  if (response.status === 409) {
    return { kind: "conflict", message: data?.message, previous: data?.previous };
  }
  return { kind: "error", message: data?.message };
}

function renderItems() {
  if (state.status !== "success" || state.items.length === 0) {
    scheduleListElement.innerHTML = "";
    return;
  }

  scheduleListElement.innerHTML = state.items.map(function (item, index) {
    const googleAdded = isCalAdded(state.date, index, "google");
    const appleAdded = isCalAdded(state.date, index, "apple");

    // item.id が無い予定は遅延連絡できない（サーバーは scheduleId 必須）ので出さない
    const hasId = item.id !== null && item.id !== undefined && item.id !== "";
    const delayRecord = hasId ? getDelayRecord(state.date, item.id) : null;
    const delayHtml = delayRecord
      ? `<span class="delay-badge">✅ ${escapeHtml(delayRecord.minutes)}分遅れ・${escapeHtml(formatClock(delayRecord.at))} 連絡済</span>`
      : hasId
        ? `<button class="delay-btn" data-index="${index}">📢 遅れる連絡</button>`
        : "";

    const coHelpers = Array.isArray(item.coHelpers) ? item.coHelpers : [];
    const coHelpersHtml = coHelpers.length > 0
      ? `<div class="schedule-row">
          <div class="schedule-label">🤝 合同</div>
          <div class="schedule-value">${escapeHtml(coHelpers.join("・"))}</div>
        </div>`
      : "";

    return `
      <article class="schedule-card">
        <div class="schedule-time">${escapeHtml(formatTimeRange(item))}</div>
        <div class="schedule-helper">${escapeHtml(getDisplayValue(item.helperName))}</div>
        <div class="schedule-details">
          <div class="schedule-row">
            <div class="schedule-label">👤 利用者</div>
            <div class="schedule-value">${escapeHtml(getDisplayValue(item.userName))}</div>
          </div>
          ${coHelpersHtml}
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
          ${delayHtml}
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

  scheduleListElement.querySelectorAll(".delay-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const idx = parseInt(btn.dataset.index, 10);
      const item = state.items[idx];
      if (!item) return;
      openDelaySheet(item);
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
