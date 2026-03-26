import {
  buildSchedulePageUrl,
  clearSavedHelperEmail,
  getSavedHelperEmail,
  saveHelperEmail,
} from "./lib/helperEmail.js";

const SUMMARY_CONFIGS = [
  {
    key: "today",
    endpoint: "/api/today-helper-summary",
    personalPagePath: "/today-schedule/",
    allPagePath: "/today-schedule-all/",
    errorLabel: "本日の通知取得に失敗しました",
  },
  {
    key: "tomorrow",
    endpoint: "/api/tomorrow-helper-summary",
    personalPagePath: "/tomorrow-schedule/",
    allPagePath: "/tomorrow-schedule-all/",
    errorLabel: "明日の通知取得に失敗しました",
  },
];

const NOTIFICATIONS_CONFIG = {
  endpoint: "/api/notifications",
  pagePath: "/notifications/",
  errorLabel: "通知取得に失敗しました",
};

const state = {
  helperEmail: "",
};

function getRequiredElement(id) {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`missing element: ${id}`);
  }

  return element;
}

function getDisplayValue(value, fallback = "—") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function getEarliestStartTime(helpers) {
  return helpers.reduce(function (earliest, helper) {
    if (!helper?.firstStartTime) {
      return earliest;
    }

    if (!earliest || helper.firstStartTime.localeCompare(earliest) < 0) {
      return helper.firstStartTime;
    }

    return earliest;
  }, "");
}

function buildPersonalActionUrl(pagePath) {
  return buildSchedulePageUrl(pagePath, state.helperEmail);
}

function updatePersonalActions() {
  for (const config of SUMMARY_CONFIGS) {
    const actionElement = getRequiredElement(`${config.key}-personal-action`);
    actionElement.setAttribute("href", buildPersonalActionUrl(config.personalPagePath));
    actionElement.classList.toggle("is-disabled", !state.helperEmail);
    actionElement.setAttribute("aria-disabled", state.helperEmail ? "false" : "true");
  }

  const notificationsActionElement = getRequiredElement("notifications-action");
  notificationsActionElement.setAttribute("href", buildPersonalActionUrl(NOTIFICATIONS_CONFIG.pagePath));
  notificationsActionElement.classList.toggle("is-disabled", !state.helperEmail);
  notificationsActionElement.setAttribute("aria-disabled", state.helperEmail ? "false" : "true");
}

function renderHelperEmailPanel() {
  const statusElement = getRequiredElement("helper-email-status");
  const currentElement = getRequiredElement("helper-email-current");
  const noteElement = getRequiredElement("helper-email-note");
  const inputElement = getRequiredElement("helper-email-input");

  if (state.helperEmail) {
    statusElement.textContent = "保存済み";
    currentElement.textContent = state.helperEmail;
    noteElement.textContent = "このメールアドレスを、自分用の予定表示に使います。";
    inputElement.value = state.helperEmail;
  } else {
    statusElement.textContent = "未保存";
    currentElement.textContent = "未設定";
    noteElement.textContent = "メールアドレスを保存すると、自分の予定リンクが使えるようになります。";
    inputElement.value = "";
  }

  updatePersonalActions();
}

function setFormMessage(message, tone) {
  const messageElement = getRequiredElement("helper-email-message");
  messageElement.textContent = message;
  messageElement.dataset.tone = tone;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function setupHelperEmailForm() {
  const inputElement = getRequiredElement("helper-email-input");
  const saveButtonElement = getRequiredElement("helper-email-save");
  const clearButtonElement = getRequiredElement("helper-email-clear");

  saveButtonElement.addEventListener("click", function () {
    const nextEmail = inputElement.value.trim();

    if (!isValidEmail(nextEmail)) {
      setFormMessage("メールアドレスの形式を確認してください。", "error");
      return;
    }

    state.helperEmail = saveHelperEmail(nextEmail);
    renderHelperEmailPanel();
    initializeNotifications().catch(function (error) {
      console.error("[notifications-summary] refresh error:", error);
    });
    setFormMessage("メールアドレスを保存しました。", "success");
  });

  clearButtonElement.addEventListener("click", function () {
    clearSavedHelperEmail();
    state.helperEmail = "";
    renderHelperEmailPanel();
    initializeNotifications().catch(function (error) {
      console.error("[notifications-summary] refresh error:", error);
    });
    setFormMessage("保存したメールアドレスをクリアしました。", "default");
  });
}

function renderSummaryCard(key, payload) {
  const root = getRequiredElement(`${key}-summary`);
  const statusElement = getRequiredElement(`${key}-status`);
  const countElement = getRequiredElement(`${key}-count-value`);
  const timeElement = getRequiredElement(`${key}-time`);
  const noteElement = getRequiredElement(`${key}-note`);
  const actionElement = getRequiredElement(`${key}-action`);

  root.classList.remove("is-loading", "is-error", "is-empty", "is-ready");

  if (payload.status === "loading") {
    root.classList.add("is-loading");
    statusElement.textContent = "確認中";
    countElement.textContent = "—";
    timeElement.textContent = "—";
    noteElement.textContent = "予定の有無を確認しています。";
    actionElement.setAttribute("href", payload.allPagePath);
    return;
  }

  if (payload.status === "error") {
    root.classList.add("is-error");
    statusElement.textContent = "取得失敗";
    countElement.textContent = "—";
    timeElement.textContent = "—";
    noteElement.textContent = payload.message;
    actionElement.setAttribute("href", payload.allPagePath);
    return;
  }

  const hasItems = payload.count > 0;

  root.classList.add(hasItems ? "is-ready" : "is-empty");
  statusElement.textContent = hasItems ? "予定あり" : "予定なし";
  countElement.textContent = String(payload.count);
  timeElement.textContent = getDisplayValue(payload.firstStartTime);
  noteElement.textContent = hasItems
    ? `${payload.count}名のヘルパーに予定があります。`
    : "予定があるヘルパーはいません。";
  actionElement.setAttribute("href", payload.allPagePath);
}

function renderNotificationsCard(payload) {
  const root = getRequiredElement("notifications-summary");
  const statusElement = getRequiredElement("notifications-status");
  const unreadCountElement = getRequiredElement("notifications-unread-count");
  const badgeElement = getRequiredElement("notifications-badge");
  const noteElement = getRequiredElement("notifications-note");
  const actionBadgeElement = getRequiredElement("notifications-action-badge");

  function setActionBadge(count) {
    if (count <= 0) {
      actionBadgeElement.classList.remove("is-visible");
      actionBadgeElement.textContent = "";
      actionBadgeElement.setAttribute("aria-hidden", "true");
      return;
    }

    actionBadgeElement.classList.add("is-visible");
    actionBadgeElement.textContent = count >= 9 ? "9+" : String(count);
    actionBadgeElement.setAttribute("aria-hidden", "false");
  }

  root.classList.remove("is-loading", "is-error", "is-empty", "is-ready", "has-unread");
  badgeElement.classList.remove("is-muted");

  if (!state.helperEmail) {
    root.classList.add("is-empty");
    statusElement.textContent = "未設定";
    unreadCountElement.textContent = "—";
    badgeElement.textContent = "未設定";
    badgeElement.classList.add("is-muted");
    setActionBadge(0);
    noteElement.textContent = "helper_email を保存すると、自分の通知一覧を開けます。";
    return;
  }

  if (payload.status === "loading") {
    root.classList.add("is-loading");
    statusElement.textContent = "確認中";
    unreadCountElement.textContent = "—";
    badgeElement.textContent = "確認中";
    setActionBadge(0);
    noteElement.textContent = "未読件数を確認しています。";
    return;
  }

  if (payload.status === "error") {
    root.classList.add("is-error");
    statusElement.textContent = "取得失敗";
    unreadCountElement.textContent = "—";
    badgeElement.textContent = "エラー";
    setActionBadge(0);
    noteElement.textContent = payload.message;
    return;
  }

  root.classList.add(payload.unreadCount > 0 ? "is-ready" : "is-empty");
  root.classList.toggle("has-unread", payload.unreadCount > 0);
  statusElement.textContent = payload.unreadCount > 0 ? "未読あり" : "確認済み";
  unreadCountElement.textContent = String(payload.unreadCount);
  badgeElement.textContent = payload.unreadCount > 0 ? "未読あり" : "未読なし";
  badgeElement.classList.toggle("is-muted", payload.unreadCount === 0);
  setActionBadge(payload.unreadCount);
  noteElement.textContent = payload.unreadCount > 0
    ? `${payload.unreadCount}件の未読通知があります。`
    : "未読通知はありません。";
}

async function fetchSummary(config) {
  const response = await fetch(config.endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(function () {
    return null;
  });

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || config.errorLabel);
  }

  const helpers = Array.isArray(data.helpers) ? data.helpers : [];

  return {
    status: "success",
    count: Number(data.count) || 0,
    firstStartTime: getEarliestStartTime(helpers),
    message: "",
    allPagePath: config.allPagePath,
  };
}

async function initializeSummaries() {
  for (const config of SUMMARY_CONFIGS) {
    renderSummaryCard(config.key, {
      status: "loading",
      count: 0,
      firstStartTime: "",
      message: "",
      allPagePath: config.allPagePath,
    });
  }

  await Promise.all(SUMMARY_CONFIGS.map(async function (config) {
    try {
      const payload = await fetchSummary(config);
      renderSummaryCard(config.key, payload);
    } catch (error) {
      console.error(`[${config.key}-helper-summary] fetch error:`, error);
      renderSummaryCard(config.key, {
        status: "error",
        count: 0,
        firstStartTime: "",
        message: config.errorLabel,
        allPagePath: config.allPagePath,
      });
    }
  }));
}

async function fetchNotificationsSummary() {
  const url = new URL(NOTIFICATIONS_CONFIG.endpoint, window.location.origin);
  url.searchParams.set("helper_email", state.helperEmail);
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(function () {
    return null;
  });

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || NOTIFICATIONS_CONFIG.errorLabel);
  }

  return {
    status: "success",
    unreadCount: Number(data.unreadCount) || 0,
    message: "",
  };
}

async function initializeNotifications() {
  if (!state.helperEmail) {
    renderNotificationsCard({
      status: "idle",
      unreadCount: 0,
      message: "",
    });
    return;
  }

  renderNotificationsCard({
    status: "loading",
    unreadCount: 0,
    message: "",
  });

  try {
    const payload = await fetchNotificationsSummary();
    renderNotificationsCard(payload);
  } catch (error) {
    console.error("[notifications-summary] fetch error:", error);
    renderNotificationsCard({
      status: "error",
      unreadCount: 0,
      message: NOTIFICATIONS_CONFIG.errorLabel,
    });
  }
}

async function initializePage() {
  state.helperEmail = getSavedHelperEmail();
  setupHelperEmailForm();
  renderHelperEmailPanel();
  await initializeNotifications();
  await initializeSummaries();
}

window.addEventListener("DOMContentLoaded", function () {
  initializePage().catch(function (error) {
    console.error("[index] initialize error:", error);
  });
});
