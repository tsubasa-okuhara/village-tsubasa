const STRUCTURED_LIST_ENDPOINT = "/api/service-records-structured/list";

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

function formatLocation(value) {
  const key = String(value ?? "").trim();
  return LOCATION_LABELS[key] || key || "未設定";
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

function setStatus(message, type) {
  const statusElement = getRequiredElement("structured-list-status");
  statusElement.textContent = message;
  statusElement.classList.remove("is-error", "is-success");

  if (type) {
    statusElement.classList.add(type);
  }
}

function buildListCard(item) {
  return `
    <a class="structured-list-card" href="/service-records-move/structured-detail.html?id=${encodeURIComponent(item.id)}">
      <div class="structured-list-card__top">
        <div class="structured-list-card__title">${escapeHtml(getDisplayValue(item.userName, "利用者未設定"))}</div>
        <div>${escapeHtml(formatDateTime(item.createdAt))}</div>
      </div>

      <div class="structured-list-card__meta">
        <dl class="structured-kv">
          <dt>サービス日</dt>
          <dd>${escapeHtml(getDisplayValue(item.serviceDate, "未設定"))}</dd>
        </dl>
        <dl class="structured-kv">
          <dt>担当者</dt>
          <dd>${escapeHtml(getDisplayValue(item.helperName, "未設定"))}</dd>
        </dl>
        <dl class="structured-kv">
          <dt>行動</dt>
          <dd>${escapeHtml(getDisplayValue(item.actionType, "未設定"))}</dd>
        </dl>
      </div>

      <div class="structured-list-card__grid">
        <dl class="structured-kv">
          <dt>身体状態</dt>
          <dd>${escapeHtml(getDisplayValue(item.physicalState, "未設定"))}</dd>
        </dl>
        <dl class="structured-kv">
          <dt>精神状態</dt>
          <dd>${escapeHtml(getDisplayValue(item.mentalState, "未設定"))}</dd>
        </dl>
        <dl class="structured-kv">
          <dt>介助レベル</dt>
          <dd>${escapeHtml(getDisplayValue(item.assistLevel, "未設定"))}</dd>
        </dl>
        <dl class="structured-kv">
          <dt>実施結果</dt>
          <dd>${escapeHtml(getDisplayValue(item.actionResult, "未設定"))}</dd>
        </dl>
        <dl class="structured-kv">
          <dt>負担感</dt>
          <dd>${escapeHtml(getDisplayValue(item.difficulty, "未設定"))}</dd>
        </dl>
        <dl class="structured-kv">
          <dt>場所区分</dt>
          <dd>${escapeHtml(formatLocation(item.location))}</dd>
        </dl>
        <dl class="structured-kv">
          <dt>helper_email</dt>
          <dd>${escapeHtml(getDisplayValue(item.helperEmail, "未設定"))}</dd>
        </dl>
        <dl class="structured-kv">
          <dt>作成日時</dt>
          <dd>${escapeHtml(formatDateTime(item.createdAt))}</dd>
        </dl>
      </div>
    </a>
  `;
}

async function fetchStructuredList() {
  const userName = String(getRequiredElement("structured-list-user-name").value || "").trim();
  const helperEmail = String(getRequiredElement("structured-list-helper-email").value || "").trim();
  const serviceDate = String(getRequiredElement("structured-list-service-date").value || "").trim();

  const url = new URL(STRUCTURED_LIST_ENDPOINT, window.location.origin);

  if (userName) {
    url.searchParams.set("user_name", userName);
  }

  if (helperEmail) {
    url.searchParams.set("helper_email", helperEmail);
  }

  if (serviceDate) {
    url.searchParams.set("service_date", serviceDate);
  }

  setStatus("構造化ログ一覧を取得しています...");

  try {
    const response = await fetch(`${url.pathname}${url.search}`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "failed to fetch structured list");
    }

    const listContainerElement = getRequiredElement("structured-list-container");
    const items = Array.isArray(data.items) ? data.items : [];

    if (items.length === 0) {
      listContainerElement.innerHTML = `<div class="structured-empty">構造化ログはまだありません。</div>`;
      setStatus("0件です。条件を変えて再確認してください。", "is-success");
      return;
    }

    listContainerElement.innerHTML = items.map(buildListCard).join("");
    setStatus(`${items.length}件の構造化ログを表示しています。`, "is-success");
  } catch (error) {
    console.error("[structured-list] error:", error);
    getRequiredElement("structured-list-container").innerHTML =
      `<div class="structured-empty">構造化ログの取得に失敗しました。</div>`;
    setStatus("構造化ログ一覧の取得に失敗しました。", "is-error");
  }
}

function applyInitialFilters() {
  const searchParams = new URLSearchParams(window.location.search);
  const helperEmail = searchParams.get("helper_email") || "";
  const userName = searchParams.get("user_name") || "";
  const serviceDate = searchParams.get("service_date") || "";

  getRequiredElement("structured-list-helper-email").value = helperEmail;
  getRequiredElement("structured-list-user-name").value = userName;
  getRequiredElement("structured-list-service-date").value = serviceDate;
}

getRequiredElement("structured-list-filter-form").addEventListener("submit", function (event) {
  event.preventDefault();
  fetchStructuredList();
});

applyInitialFilters();
fetchStructuredList();
