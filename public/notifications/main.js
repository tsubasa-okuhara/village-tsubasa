import { buildSchedulePageUrl, getSavedHelperEmail } from "../lib/helperEmail.js";

const NOTIFICATIONS_ENDPOINT = "/api/notifications";
const READ_NOTIFICATION_ENDPOINT = "/api/notifications/read";

const state = {
  helperEmail: "",
  unreadCount: 0,
  items: [],
  status: "loading",
  message: "読み込み中...",
};

async function updateAppBadge(count) {
  try {
    if (typeof navigator === "undefined") {
      return;
    }

    if (!count || count <= 0) {
      if (typeof navigator.clearAppBadge === "function") {
        await navigator.clearAppBadge();
      }
      return;
    }

    if (typeof navigator.setAppBadge === "function") {
      await navigator.setAppBadge(count);
    }
  } catch (error) {
    console.error("[badge] update error:", error);
  }
}

function getRequiredElement(id) {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`missing element: ${id}`);
  }

  return element;
}

const helperEmailElement = getRequiredElement("helper-email");
const unreadCountElement = getRequiredElement("unread-count");
const statusCardElement = getRequiredElement("status-card");
const emptyCardElement = getRequiredElement("empty-card");
const notificationListElement = getRequiredElement("notification-list");

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

function setStatus(status, message) {
  state.status = status;
  state.message = message;
}

function buildNotificationsUrl(helperEmail) {
  const url = new URL(NOTIFICATIONS_ENDPOINT, window.location.origin);
  url.searchParams.set("helper_email", helperEmail);
  url.searchParams.set("limit", "50");
  return url.toString();
}

function formatDateTime(value) {
  if (!value) {
    return "日時不明";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getNotificationTypeLabel(type) {
  if (type === "today") {
    return "本日";
  }

  if (type === "tomorrow") {
    return "明日";
  }

  if (type === "admin") {
    return "お知らせ";
  }

  return getDisplayValue(type, "通知");
}

function renderStatus() {
  const shouldShowStatus = state.status === "loading" || state.status === "error";
  statusCardElement.classList.toggle("is-visible", shouldShowStatus);
  statusCardElement.classList.toggle("is-error", state.status === "error");
  statusCardElement.textContent = state.message;
}

function renderMeta() {
  helperEmailElement.textContent = state.helperEmail || "-";
  unreadCountElement.textContent = `${state.unreadCount}件`;
  updateAppBadge(state.unreadCount);
}

function renderEmpty() {
  const shouldShowEmpty = state.status === "success" && state.items.length === 0;
  emptyCardElement.classList.toggle("is-visible", shouldShowEmpty);
}

function renderItems() {
  if (state.status !== "success" || state.items.length === 0) {
    notificationListElement.innerHTML = "";
    return;
  }

  notificationListElement.innerHTML = state.items.map(function (item) {
    const href = item.linkUrl ? buildSchedulePageUrl(item.linkUrl, state.helperEmail) : "";

    return `
      <a
        class="notification-card${item.isRead ? "" : " is-unread"}${href ? "" : " is-disabled"}"
        href="${escapeHtml(href || "#")}"
        data-notification-id="${escapeHtml(item.id)}"
        data-link-url="${escapeHtml(item.linkUrl || "")}"
      >
        <div class="notification-head">
          <span class="notification-type">${escapeHtml(getNotificationTypeLabel(item.notificationType))}</span>
          <span class="notification-read">${item.isRead ? "既読" : "未読"}</span>
        </div>
        <div class="notification-title">${escapeHtml(getDisplayValue(item.title, "通知"))}</div>
        <p class="notification-body">${escapeHtml(getDisplayValue(item.body, ""))}</p>
        <div class="notification-foot">
          <span>${escapeHtml(formatDateTime(item.createdAt))}</span>
          <span class="notification-link">${href ? "通知先を開く" : "リンク未設定"}</span>
        </div>
      </a>
    `;
  }).join("");
}

function render() {
  renderMeta();
  renderStatus();
  renderEmpty();
  renderItems();
}

async function fetchNotifications(helperEmail) {
  const response = await fetch(buildNotificationsUrl(helperEmail), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(function () {
    return null;
  });

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || "通知の取得に失敗しました");
  }

  return data;
}

async function markNotificationRead(id) {
  const response = await fetch(READ_NOTIFICATION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      id,
      helper_email: state.helperEmail,
    }),
    keepalive: true,
  });

  const data = await response.json().catch(function () {
    return null;
  });

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || "通知の既読化に失敗しました");
  }
}

function markItemReadLocally(id) {
  state.items = state.items.map(function (item) {
    if (item.id === id) {
      return {
        ...item,
        isRead: true,
      };
    }

    return item;
  });

  state.unreadCount = state.items.reduce(function (count, item) {
    return item.isRead ? count : count + 1;
  }, 0);
}

function setupNotificationLinks() {
  notificationListElement.addEventListener("click", async function (event) {
    const card = event.target instanceof Element ? event.target.closest("[data-notification-id]") : null;

    if (!(card instanceof HTMLAnchorElement)) {
      return;
    }

    const id = card.dataset.notificationId ?? "";
    const linkUrl = card.dataset.linkUrl ?? "";

    if (!id || !linkUrl) {
      event.preventDefault();
      return;
    }

    const currentItem = state.items.find(function (item) {
      return item.id === id;
    });

    if (!currentItem || currentItem.isRead) {
      return;
    }

    event.preventDefault();

    try {
      await markNotificationRead(id);
      markItemReadLocally(id);
      render();
    } catch (error) {
      console.error("[notifications] read error:", error);
    }

    window.location.href = buildSchedulePageUrl(linkUrl, state.helperEmail);
  });
}

async function initializePage() {
  state.helperEmail = getHelperEmailFromQuery() || getSavedHelperEmail();
  render();

  if (!state.helperEmail) {
    setStatus("error", "helper_email が指定されていません");
    render();
    return;
  }

  try {
    setStatus("loading", "読み込み中...");
    render();

    const result = await fetchNotifications(state.helperEmail);
    state.helperEmail = result.helperEmail || state.helperEmail;
    state.unreadCount = Number(result.unreadCount) || 0;
    state.items = Array.isArray(result.items) ? result.items : [];
    setStatus("success", "");
    render();
  } catch (error) {
    console.error("[notifications] fetch error:", error);
    state.items = [];
    state.unreadCount = 0;
    setStatus("error", "通知の取得に失敗しました");
    render();
  }
}

setupNotificationLinks();
initializePage();
