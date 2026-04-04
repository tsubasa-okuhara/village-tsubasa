const LOCATION_LABELS = {
  indoor: "屋内",
  outdoor: "屋外",
  transit: "移動中",
  facility: "施設",
  home: "自宅",
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

function formatDateTime(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "未設定";
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return date.toLocaleString("ja-JP");
}

function formatLocation(value) {
  const key = String(value ?? "").trim();
  return LOCATION_LABELS[key] || key || "未設定";
}

function renderKv(label, value) {
  return `
    <dl class="structured-kv">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(getDisplayValue(value, "未設定"))}</dd>
    </dl>
  `;
}

function renderBadgeList(values, emptyLabel) {
  if (!Array.isArray(values) || values.length === 0) {
    return `<div class="structured-empty">${escapeHtml(emptyLabel)}</div>`;
  }

  return `
    <div class="structured-badge-list">
      ${values.map((value) => `<span class="structured-badge">${escapeHtml(value)}</span>`).join("")}
    </div>
  `;
}

function setStatus(message, type) {
  const statusElement = getRequiredElement("structured-detail-status");
  statusElement.textContent = message;
  statusElement.classList.remove("is-error", "is-success");

  if (type) {
    statusElement.classList.add(type);
  }
}

function renderActionLogs(actionLogs) {
  if (!Array.isArray(actionLogs) || actionLogs.length === 0) {
    return `<div class="structured-empty">行動ログなし</div>`;
  }

  return `
    <div class="structured-log-list">
      ${actionLogs
        .map(function (item, index) {
          return `
            <section class="structured-log-item">
              <div class="structured-log-item__title">行動ログ ${index + 1}</div>
              <div class="structured-detail-grid structured-detail-grid--four">
                ${renderKv("行動", item.action_type)}
                ${renderKv("行動詳細", item.action_detail)}
                ${renderKv("その他詳細", item.action_detail_other)}
                ${renderKv("実施者", item.actor)}
                ${renderKv("対象", item.target)}
                ${renderKv("開始", item.start_time)}
                ${renderKv("終了", item.end_time)}
                ${renderKv("時間（分）", item.duration)}
                ${renderKv("実施結果", item.action_result)}
                ${renderKv("負担感", item.difficulty)}
                ${renderKv("介助レベル", item.assist_level)}
                ${renderKv("作成日時", formatDateTime(item.created_at))}
              </div>
            </section>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderIrregularEvents(irregularEvents) {
  if (!Array.isArray(irregularEvents) || irregularEvents.length === 0) {
    return `<div class="structured-empty">イレギュラーなし</div>`;
  }

  return `
    <div class="structured-log-list">
      ${irregularEvents
        .map(function (item, index) {
          return `
            <section class="structured-log-item">
              <div class="structured-log-item__title">イレギュラー ${index + 1}</div>
              <div class="structured-detail-grid structured-detail-grid--two">
                ${renderKv("イレギュラー", item.event_type)}
                ${renderKv("作成日時", formatDateTime(item.created_at))}
                ${renderKv("発生前の状態", item.before_state)}
                ${renderKv("対応内容", item.after_action)}
              </div>
            </section>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderDetail(item) {
  const structuredRecord = item.structuredRecord || {};
  const riskFlags = Array.isArray(structuredRecord.risk_flags)
    ? structuredRecord.risk_flags
    : [];

  return `
    <section class="structured-detail-card">
      <div class="structured-detail-card__head">
        <h2>${escapeHtml(getDisplayValue(structuredRecord.user_name, "利用者未設定"))}</h2>
        <p>${escapeHtml(getDisplayValue(structuredRecord.helper_name, "担当者未設定"))} / ${escapeHtml(getDisplayValue(structuredRecord.service_date, "サービス日未設定"))}</p>
      </div>
      <div class="structured-detail-grid structured-detail-grid--four">
        ${renderKv("source_type", structuredRecord.source_type)}
        ${renderKv("source_note_id", structuredRecord.source_note_id)}
        ${renderKv("schedule_task_id", structuredRecord.schedule_task_id)}
        ${renderKv("helper_email", structuredRecord.helper_email)}
        ${renderKv("helper_name", structuredRecord.helper_name)}
        ${renderKv("user_name", structuredRecord.user_name)}
        ${renderKv("service_date", structuredRecord.service_date)}
        ${renderKv("start_time", structuredRecord.start_time)}
        ${renderKv("end_time", structuredRecord.end_time)}
        ${renderKv("created_at", formatDateTime(structuredRecord.created_at))}
      </div>
    </section>

    <section class="structured-detail-card">
      <div class="structured-detail-card__head">
        <h3>状態</h3>
        <p>支援時の状態と全体結果です。</p>
      </div>
      <div class="structured-detail-grid structured-detail-grid--three">
        ${renderKv("身体状態", structuredRecord.physical_state)}
        ${renderKv("精神状態", structuredRecord.mental_state)}
        ${renderKv("介助レベル", structuredRecord.assist_level)}
        ${renderKv("実施結果", structuredRecord.action_result)}
        ${renderKv("負担感", structuredRecord.difficulty)}
      </div>
      ${renderBadgeList(riskFlags, "リスクなし")}
    </section>

    <section class="structured-detail-card">
      <div class="structured-detail-card__head">
        <h3>環境</h3>
        <p>場所と周辺情報です。</p>
      </div>
      <div class="structured-detail-grid structured-detail-grid--four">
        ${renderKv("場所区分", formatLocation(structuredRecord.location))}
        ${renderKv("場所補足", structuredRecord.location_note)}
        ${renderKv("時間帯", structuredRecord.time_of_day)}
        ${renderKv("気温", structuredRecord.temperature)}
      </div>
    </section>

    <section class="structured-detail-card">
      <div class="structured-detail-card__head">
        <h3>行動ログ</h3>
        <p>保存された個別行動ログです。</p>
      </div>
      ${renderActionLogs(item.actionLogs)}
    </section>

    <section class="structured-detail-card">
      <div class="structured-detail-card__head">
        <h3>イレギュラー</h3>
        <p>保存されたイレギュラー情報です。</p>
      </div>
      ${renderIrregularEvents(item.irregularEvents)}
    </section>
  `;
}

async function loadDetail() {
  const searchParams = new URLSearchParams(window.location.search);
  const id = searchParams.get("id") || "";

  if (!id) {
    setStatus("id が指定されていません。", "is-error");
    getRequiredElement("structured-detail-container").innerHTML =
      `<div class="structured-empty">詳細を表示する id がありません。</div>`;
    return;
  }

  try {
    const response = await fetch(`/api/service-records-structured/${encodeURIComponent(id)}`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "failed to fetch structured detail");
    }

    if (!data.item) {
      setStatus("対象の構造化ログが見つかりません。", "is-error");
      getRequiredElement("structured-detail-container").innerHTML =
        `<div class="structured-empty">対象の構造化ログが見つかりません。</div>`;
      return;
    }

    getRequiredElement("structured-detail-container").innerHTML = renderDetail(data.item);
    setStatus("構造化ログ詳細を表示しています。", "is-success");
  } catch (error) {
    console.error("[structured-detail] error:", error);
    setStatus("構造化ログ詳細の取得に失敗しました。", "is-error");
    getRequiredElement("structured-detail-container").innerHTML =
      `<div class="structured-empty">構造化ログ詳細の取得に失敗しました。</div>`;
  }
}

loadDetail();
