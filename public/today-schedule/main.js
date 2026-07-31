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

function markDelaySent(dateStr, scheduleId, record) {
  const data = getDelaySent();
  data[`${dateStr}_${scheduleId}`] = {
    destination: record.destination,
    reasonCode: record.reasonCode,
    arrivalTime: record.arrivalTime,
    at: Date.now(),
  };
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

// 宛先。client=利用者（ご自宅・グループホーム）へ LINE、
// office=事業所へ電話連絡を依頼（福祉園など、利用者側に LINE が無い先）
const DELAY_DESTINATIONS = [
  { destination: "client", label: "ご自宅・グループホームへ連絡", confirmLabel: "ご自宅・GHへ連絡します" },
  { destination: "office", label: "事業所へ電話を依頼（福祉園など）", confirmLabel: "事業所へ電話連絡を依頼します" },
];

// 理由コード。code はサーバー /api/delay-notify の REASON_MAP のキーと
// 完全に一致していること（不一致は 400「reasonCode が不正です」になる）。
// 利用者へ送る文面のやわらげはサーバー側が持つので、ここは現場の言葉のまま。
const DELAY_REASONS = [
  { code: "prev_support", label: "前の支援が長引いています" },
  { code: "traffic", label: "渋滞" },
  { code: "train", label: "電車遅延" },
  { code: "vehicle", label: "車のトラブル" },
  { code: "sick", label: "体調不良" },
  { code: "overslept", label: "寝坊" },
  { code: "other", label: "その他" },
];

const ARRIVAL_QUICK_OFFSETS = [10, 20, 30];

function getReasonLabel(code) {
  const found = DELAY_REASONS.find(function (r) { return r.code === code; });
  return found ? found.label : code;
}

// active は入力途中の下書きも兼ねる。
// { item, destination, reasonCode, reasonNote, arrivalTime }
// 確認画面から「戻る」で入力画面に戻っても値が消えないよう、
// 入力は都度 active に書き戻す。
const delaySheet = {
  active: null,
  sending: false, // 送信中は外側タップで閉じない
};

/** "HH:MM" / "HH:MM:SS" → 0時からの分。読めなければ null */
function parseHm(value) {
  const matched = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());
  if (!matched) return null;

  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (hour > 23 || minute > 59) return null;

  return hour * 60 + minute;
}

/** 0時からの分 → "HH:MM"（24時をまたいだら 0 時に戻す） */
function formatHm(totalMinutes) {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  return `${padTwo(Math.floor(wrapped / 60))}:${padTwo(wrapped % 60)}`;
}

/** 到着時刻候補の基準。予定開始時刻が読めないときだけ現在時刻に倒す */
function getArrivalBaseMinutes(item) {
  const start = parseHm(item.startTime);
  if (start !== null) return start;

  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

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
  delaySheet.active = {
    item,
    destination: "",
    reasonCode: "",
    reasonNote: "",
    arrivalTime: "",
  };
  delaySheet.sending = false;
  document.getElementById("delay-overlay").hidden = false;
  document.body.style.overflow = "hidden";
  renderDelayDestination();
}

function closeDelaySheet() {
  const overlay = document.getElementById("delay-overlay");
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = "";
  delaySheet.active = null;
  delaySheet.sending = false;
}

// ステップ1: 宛先（誰に連絡するか）を選ぶ
function renderDelayDestination() {
  const draft = delaySheet.active;
  const name = getDisplayValue(draft.item.userName, "利用者様");
  setDelayTitle(`${name} への連絡方法を選んでください`);

  const body = document.getElementById("delay-body");
  body.innerHTML = "";

  DELAY_DESTINATIONS.forEach(function (opt) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "delay-opt";
    btn.textContent = opt.label;
    btn.addEventListener("click", function () {
      draft.destination = opt.destination;
      renderDelayInput();
    });
    body.appendChild(btn);
  });

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "delay-cancel";
  cancel.textContent = "キャンセル";
  cancel.addEventListener("click", closeDelaySheet);
  body.appendChild(cancel);
}

// ステップ2: 理由（必須）と到着予定時刻（必須）を入力する
function renderDelayInput() {
  const draft = delaySheet.active;
  const item = draft.item;
  const name = getDisplayValue(item.userName, "利用者様");
  setDelayTitle(`${name} への連絡内容を入力してください`);

  const body = document.getElementById("delay-body");
  body.innerHTML = "";

  // ---- 理由（ラジオ的挙動。選べるのは常に1つ） ----
  const reasonLabel = document.createElement("div");
  reasonLabel.className = "delay-section-label";
  reasonLabel.textContent = "遅れる理由（必須）";
  body.appendChild(reasonLabel);

  const reasonList = document.createElement("div");
  reasonList.className = "delay-reason-list";
  reasonList.setAttribute("role", "radiogroup");
  reasonList.setAttribute("aria-label", "遅れる理由");

  const reasonButtons = [];
  DELAY_REASONS.forEach(function (reason) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "delay-reason-opt";
    btn.textContent = reason.label;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "false");
    btn.addEventListener("click", function () {
      draft.reasonCode = reason.code;
      syncReasonSelection();
      updateSendState();
    });
    reasonButtons.push({ code: reason.code, element: btn });
    reasonList.appendChild(btn);
  });
  body.appendChild(reasonList);

  // 「その他」を選んだときだけ出る自由入力。任意なので空でも送れる
  const note = document.createElement("textarea");
  note.className = "delay-note";
  note.rows = 3;
  note.placeholder = "その他の理由（任意・空欄のままでも送れます）";
  note.value = draft.reasonNote || "";
  note.addEventListener("input", function () {
    draft.reasonNote = note.value;
  });
  body.appendChild(note);

  // ---- 到着予定時刻 ----
  const timeLabel = document.createElement("div");
  timeLabel.className = "delay-section-label";
  timeLabel.textContent = "到着予定時刻（必須）";
  body.appendChild(timeLabel);

  // 予定開始時刻からの候補。押すと下の time 入力にも反映する
  const baseMinutes = getArrivalBaseMinutes(item);
  const quickRow = document.createElement("div");
  quickRow.className = "delay-quick-row";

  const quickButtons = [];
  ARRIVAL_QUICK_OFFSETS.forEach(function (offset) {
    const value = formatHm(baseMinutes + offset);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "delay-quick";
    btn.innerHTML = `<span class="delay-quick-offset">+${offset}分</span><span class="delay-quick-time">${escapeHtml(value)}</span>`;
    btn.addEventListener("click", function () {
      draft.arrivalTime = value;
      timeInput.value = value;
      syncQuickSelection();
      updateSendState();
    });
    quickButtons.push({ value, element: btn });
    quickRow.appendChild(btn);
  });
  body.appendChild(quickRow);

  // 手入力・iOSのドラム・音声入力はこの input が受ける。
  // 最終的にサーバーへ送るのは常にこの input の値
  const timeInput = document.createElement("input");
  timeInput.type = "time";
  timeInput.className = "delay-time-input";
  timeInput.setAttribute("aria-label", "到着予定時刻");
  timeInput.value = draft.arrivalTime || "";
  timeInput.addEventListener("input", function () {
    draft.arrivalTime = timeInput.value;
    syncQuickSelection();
    updateSendState();
  });
  timeInput.addEventListener("change", function () {
    draft.arrivalTime = timeInput.value;
    syncQuickSelection();
    updateSendState();
  });
  body.appendChild(timeInput);

  // input[type=time] 非対応ブラウザはただのテキスト欄になる。
  // その場合だけ手入力が HH:MM でないことがあるので、送る前に止める
  const timeError = document.createElement("p");
  timeError.className = "delay-inline-error";
  timeError.textContent = "到着予定時刻は 14:20 のように入力してください。";
  timeError.hidden = true;
  body.appendChild(timeError);

  // ---- 送信 / 戻る ----
  const send = document.createElement("button");
  send.type = "button";
  send.className = "delay-opt delay-opt--send";
  send.textContent = "確認へ進む";
  send.addEventListener("click", function () {
    if (!draft.reasonCode || !draft.arrivalTime) return;

    const parsed = parseHm(draft.arrivalTime);
    if (parsed === null) {
      timeError.hidden = false;
      return;
    }

    timeError.hidden = true;
    draft.arrivalTime = formatHm(parsed); // "9:05" などを "09:05" に揃える
    renderDelayConfirm();
  });
  body.appendChild(send);

  const back = document.createElement("button");
  back.type = "button";
  back.className = "delay-cancel";
  back.textContent = "戻る";
  back.addEventListener("click", renderDelayDestination);
  body.appendChild(back);

  function syncReasonSelection() {
    reasonButtons.forEach(function (entry) {
      const selected = entry.code === draft.reasonCode;
      entry.element.classList.toggle("is-selected", selected);
      entry.element.setAttribute("aria-checked", selected ? "true" : "false");
    });
    // その他以外を選んだら自由入力は隠す（送信時も送らない）
    note.hidden = draft.reasonCode !== "other";
  }

  function syncQuickSelection() {
    quickButtons.forEach(function (entry) {
      entry.element.classList.toggle("is-selected", entry.value === draft.arrivalTime);
    });
  }

  function updateSendState() {
    send.disabled = !draft.reasonCode || !draft.arrivalTime;
  }

  syncReasonSelection();
  syncQuickSelection();
  updateSendState();
}

/** その他以外を選んでいるときは自由入力を送らない（切り替え前の入力が残るため） */
function getEffectiveReasonNote(draft) {
  if (draft.reasonCode !== "other") return "";
  return (draft.reasonNote || "").trim();
}

// ステップ3: 確認
function renderDelayConfirm() {
  const draft = delaySheet.active;
  const name = getDisplayValue(draft.item.userName, "利用者様");
  setDelayTitle(`${name} への連絡内容を確認してください`);

  const body = document.getElementById("delay-body");
  body.innerHTML = "";

  const destination = DELAY_DESTINATIONS.find(function (d) {
    return d.destination === draft.destination;
  });
  const note = getEffectiveReasonNote(draft);
  const reasonText = note
    ? `${getReasonLabel(draft.reasonCode)}（${note}）`
    : getReasonLabel(draft.reasonCode);

  const lines = [
    `${name}へ`,
    destination ? destination.confirmLabel : "",
    `理由: ${reasonText}`,
    `到着予定: ${draft.arrivalTime}`,
  ].filter(Boolean);

  const box = document.createElement("div");
  box.className = "delay-confirm-box";
  lines.forEach(function (line) {
    const row = document.createElement("p");
    row.className = "delay-confirm-text";
    row.textContent = line;
    box.appendChild(row);
  });
  body.appendChild(box);

  const send = document.createElement("button");
  send.type = "button";
  send.className = "delay-opt delay-opt--send";
  send.textContent = "送信する";

  const back = document.createElement("button");
  back.type = "button";
  back.className = "delay-cancel";
  back.textContent = "戻る";
  back.addEventListener("click", renderDelayInput);

  // 二重タップ防止: 送信開始で両ボタンを disabled
  send.addEventListener("click", function () {
    send.disabled = true;
    back.disabled = true;
    send.textContent = "送信中...";
    submitDelay();
  });

  body.appendChild(send);
  body.appendChild(back);
}

async function submitDelay() {
  const draft = delaySheet.active;
  const item = draft.item;
  const payload = {
    scheduleId: item.id,
    destination: draft.destination,
    reasonCode: draft.reasonCode,
    reasonNote: getEffectiveReasonNote(draft) || null,
    arrivalTime: draft.arrivalTime,
    helperName: item.helperName ?? "",
  };

  delaySheet.sending = true;
  const result = await postDelayNotify(payload);
  delaySheet.sending = false;

  // 送信中は閉じられないので active は生きているが、念のため確認
  if (!delaySheet.active) return;

  if (result.kind === "sent") {
    // バッジは localStorage から復元する方式なので、保存 → 再描画で反映。
    // シートは閉じずに結果文言を見せる（届いたことを目で確認してから閉じる）
    markDelaySent(state.date, item.id, {
      destination: draft.destination,
      reasonCode: draft.reasonCode,
      arrivalTime: draft.arrivalTime,
    });
    render();
    const fallback = draft.destination === "office"
      ? "事業所へ電話連絡を依頼しました。"
      : `${getDisplayValue(item.userName, "利用者様")}へ連絡しました。`;
    showDelayMessage(result.message || fallback, false);
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
    if (result.previous && result.previous.destination === "office") {
      text += "（事業所への電話依頼が記録されています）";
    } else if (result.previous && result.previous.destination === "client") {
      text += "（ご自宅・GHへの連絡が記録されています）";
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
 * /api/delay-notify を叩く。payload は
 *   { scheduleId, destination, reasonCode, reasonNote, arrivalTime, helperName }
 * 戻り値は
 *   { kind: "sent",     message }
 *   { kind: "phone",    message }            … needsPhoneCall
 *   { kind: "conflict", message, previous }  … 409 連絡済み
 *   { kind: "error",    message }            … その他
 *   { kind: "timeout" }                      … 15秒超過 / 通信失敗 / JSON パース失敗
 * のいずれか。timeout は「確認できなかった」を意味し、未送信とは限らない。
 */
async function postDelayNotify(payload) {
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
      body: JSON.stringify(payload),
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
    return { kind: "sent", message: data.message };
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

    // 遅延通知は sub2（2026年8月以降）の数値ID予定のみ対応。
    // 7月以前の旧DB由来の予定は id が UUID で、サーバー /api/delay-notify が
    // Number(scheduleId) → NaN で 400「scheduleId が不正です」を返す。
    // なので数値として妥当な正の整数IDのときだけボタン/バッジを出す。
    const numericId = Number(item.id);
    const hasDelayId = Number.isInteger(numericId) && numericId > 0;
    const delayRecord = hasDelayId ? getDelayRecord(state.date, item.id) : null;
    // destination が無いのは旧仕様（分数選択）で保存されたバッジ。利用者連絡扱いにする
    const delayBadgeText = delayRecord && delayRecord.destination === "office"
      ? `✅ ${formatClock(delayRecord.at)} 電話依頼済`
      : delayRecord
        ? `✅ ${formatClock(delayRecord.at)} 連絡済`
        : "";
    const delayHtml = delayRecord
      ? `<span class="delay-badge">${escapeHtml(delayBadgeText)}</span>`
      : hasDelayId
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
