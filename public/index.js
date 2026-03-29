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
    errorLabel: "今日の予定取得に失敗しました",
  },
  {
    key: "tomorrow",
    endpoint: "/api/tomorrow-helper-summary",
    personalPagePath: "/tomorrow-schedule/",
    allPagePath: "/tomorrow-schedule-all/",
    errorLabel: "明日の予定取得に失敗しました",
  },
];

const NOTIFICATIONS_CONFIG = {
  endpoint: "/api/notifications",
  pagePath: "/notifications/",
  errorLabel: "通知取得に失敗しました",
};

const NEXT_SCHEDULE_CONFIG = {
  endpoint: "/api/next-helper-schedule",
  pagePath: "/schedule-sync/",
  errorLabel: "次の予定取得に失敗しました",
};

const PUSH_CONFIG = {
  serviceWorkerPath: "/service-worker.js",
  publicKeyEndpoint: "/api/push/public-key",
  subscribeEndpoint: "/api/push/subscribe",
  unsubscribeEndpoint: "/api/push/unsubscribe",
  testEndpoint: "/api/push/test",
};

const state = {
  helperEmail: "",
  pushRegistration: null,
  pushSubscription: null,
  pushSupported: false,
};

async function forceTestAppBadge() {
  // TEMP: iPhone PWA の Badging API 切り分け用。確認後はこの関数呼び出しごと外してください。
  try {
    if (!state.helperEmail) {
      console.log("[badge:test] skipped: helper_email is not set");
      return;
    }

    if (typeof navigator === "undefined") {
      console.log("[badge:test] skipped: navigator is unavailable");
      return;
    }

    if (typeof navigator.setAppBadge !== "function") {
      console.log("[badge:test] skipped: setAppBadge is not supported");
      return;
    }

    console.log("[badge:test] forcing app badge to 1");
    await navigator.setAppBadge(1);
    console.log("[badge:test] setAppBadge(1) completed");
  } catch (error) {
    console.error("[badge:test] force badge error:", error);
  }
}

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

function formatNextScheduleDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value}T00:00:00+09:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatNextScheduleTime(startTime, endTime) {
  if (!startTime && !endTime) {
    return "—";
  }

  if (!endTime) {
    return getDisplayValue(startTime);
  }

  return `${getDisplayValue(startTime)} - ${endTime}`;
}

function updatePersonalActions() {
  for (const config of SUMMARY_CONFIGS) {
    const actionElement = getRequiredElement(`${config.key}-personal-action`);
    actionElement.setAttribute(
      "href",
      buildPersonalActionUrl(config.personalPagePath),
    );
    actionElement.classList.toggle("is-disabled", !state.helperEmail);
    actionElement.setAttribute(
      "aria-disabled",
      state.helperEmail ? "false" : "true",
    );
  }

  const notificationsActionElement = getRequiredElement("notifications-action");
  notificationsActionElement.setAttribute(
    "href",
    buildPersonalActionUrl(NOTIFICATIONS_CONFIG.pagePath),
  );
  notificationsActionElement.classList.toggle(
    "is-disabled",
    !state.helperEmail,
  );
  notificationsActionElement.setAttribute(
    "aria-disabled",
    state.helperEmail ? "false" : "true",
  );

  const nextActionElement = getRequiredElement("next-action");
  nextActionElement.setAttribute("href", NEXT_SCHEDULE_CONFIG.pagePath);
}

function renderHelperEmailPanel() {
  const statusElement = getRequiredElement("helper-email-status");
  const currentElement = getRequiredElement("helper-email-current");
  const noteElement = getRequiredElement("helper-email-note");
  const inputElement = getRequiredElement("helper-email-input");

  if (state.helperEmail) {
    statusElement.textContent = "保存済み";
    currentElement.textContent = state.helperEmail;
    noteElement.textContent =
      "このメールアドレスで、自分の予定と自分への連絡を表示します。";
    inputElement.value = state.helperEmail;
  } else {
    statusElement.textContent = "未保存";
    currentElement.textContent = "未設定";
    noteElement.textContent =
      "メールアドレスを保存すると、自分用の予定と連絡を開けるようになります。";
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

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding)
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

function setPushMessage(message, tone = "default") {
  const messageElement = getRequiredElement("push-message");
  messageElement.textContent = message;
  messageElement.dataset.tone = tone;
}

function setPushStatusLabel(label) {
  const statusElement = getRequiredElement("push-status");
  statusElement.textContent = label;
}

function renderPushControls() {
  const enableButtonElement = getRequiredElement("push-enable");
  const disableButtonElement = getRequiredElement("push-disable");
  const testButtonElement = getRequiredElement("push-test");

  if (!state.pushSupported) {
    setPushStatusLabel("未対応");
    enableButtonElement.disabled = true;
    disableButtonElement.disabled = true;
    testButtonElement.disabled = true;
    setPushMessage(
      "この端末・ブラウザでは Web Push を利用できません。",
      "error",
    );
    return;
  }

  if (!state.helperEmail) {
    setPushStatusLabel("未設定");
    enableButtonElement.disabled = true;
    disableButtonElement.disabled = !state.pushSubscription;
    testButtonElement.disabled = true;
    setPushMessage(
      "メールアドレスを保存すると、端末通知を登録できます。",
      "default",
    );
    return;
  }

  if (window.Notification.permission === "denied") {
    setPushStatusLabel("拒否中");
    enableButtonElement.disabled = true;
    disableButtonElement.disabled = !state.pushSubscription;
    testButtonElement.disabled = true;
    setPushMessage(
      "通知がブラウザで拒否されています。ブラウザ設定から許可に変更してください。",
      "error",
    );
    return;
  }

  if (state.pushSubscription) {
    setPushStatusLabel("登録済み");
    enableButtonElement.disabled = false;
    disableButtonElement.disabled = false;
    testButtonElement.disabled = false;
    setPushMessage(
      "この端末は通知を受け取る設定になっています。",
      "success",
    );
    return;
  }

  setPushStatusLabel(
    window.Notification.permission === "granted" ? "未登録" : "未許可",
  );
  enableButtonElement.disabled = false;
  disableButtonElement.disabled = true;
  testButtonElement.disabled = true;
  setPushMessage(
    "通知を許可すると、この端末で連絡を受け取れるようになります。",
    "default",
  );
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(function () {
    return null;
  });

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || "request failed");
  }

  return data;
}

async function fetchPushPublicKey() {
  const response = await fetch(PUSH_CONFIG.publicKeyEndpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(function () {
    return null;
  });

  if (!response.ok || !data?.ok || !data.publicKey) {
    throw new Error(data?.message || "public key fetch failed");
  }

  return String(data.publicKey).trim();
}

async function registerPushServiceWorker() {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    state.pushSupported = false;
    state.pushRegistration = null;
    state.pushSubscription = null;
    renderPushControls();
    return;
  }

  state.pushSupported = true;
  state.pushRegistration = await navigator.serviceWorker.register(
    PUSH_CONFIG.serviceWorkerPath,
  );
  state.pushSubscription =
    await state.pushRegistration.pushManager.getSubscription();
  renderPushControls();
}

async function syncSubscriptionToServer(subscription) {
  await postJson(PUSH_CONFIG.subscribeEndpoint, {
    helperEmail: state.helperEmail,
    userAgent: navigator.userAgent,
    subscription: subscription.toJSON(),
  });
}

async function subscribeCurrentDevice() {
  if (!state.helperEmail) {
    throw new Error("helper_email is required");
  }

  if (!state.pushRegistration) {
    throw new Error("service worker is not ready");
  }

  let permission = window.Notification.permission;
  if (permission !== "granted") {
    permission = await window.Notification.requestPermission();
  }

  if (permission !== "granted") {
    throw new Error("notification permission not granted");
  }

  const publicKey = await fetchPushPublicKey();
  console.log("publicKey:", publicKey);
  console.log("publicKey type:", typeof publicKey);
  console.log("publicKey length:", publicKey.length);

  const convertedKey = urlBase64ToUint8Array(publicKey);
  console.log("convertedKey:", convertedKey);
  console.log("convertedKey length:", convertedKey.length);

  const existingSubscription =
    await state.pushRegistration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await state.pushRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey,
    }));

  await syncSubscriptionToServer(subscription);
  state.pushSubscription = subscription;
  renderPushControls();
}

async function unsubscribeCurrentDevice() {
  if (!state.pushSubscription) {
    renderPushControls();
    return;
  }

  const endpoint = state.pushSubscription.endpoint;
  await postJson(PUSH_CONFIG.unsubscribeEndpoint, {
    endpoint,
  });
  await state.pushSubscription.unsubscribe();
  state.pushSubscription = state.pushRegistration
    ? await state.pushRegistration.pushManager.getSubscription()
    : null;
  renderPushControls();
}

async function syncExistingSubscriptionIfNeeded() {
  if (!state.helperEmail || !state.pushSubscription) {
    renderPushControls();
    return;
  }

  try {
    await syncSubscriptionToServer(state.pushSubscription);
    renderPushControls();
  } catch (error) {
    console.error("[push] sync existing subscription error:", error);
    setPushMessage(
      "端末登録の同期に失敗しました。再度登録してください。",
      "error",
    );
  }
}

async function sendTestPush() {
  if (!state.helperEmail) {
    throw new Error("helper_email is required");
  }

  await postJson(PUSH_CONFIG.testEndpoint, {
    helperEmail: state.helperEmail,
    title: "テストPush通知",
    body: "ビレッジひろばの端末通知テストです。",
    linkUrl: "/notifications/",
  });
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
    initializeNextSchedule().catch(function (error) {
      console.error("[next-helper-schedule] refresh error:", error);
    });
    syncExistingSubscriptionIfNeeded().catch(function (error) {
      console.error("[push] sync after save error:", error);
    });
    setFormMessage("メールアドレスを保存しました。自分用の表示が使えます。", "success");
  });

  clearButtonElement.addEventListener("click", function () {
    clearSavedHelperEmail();
    state.helperEmail = "";
    renderHelperEmailPanel();
    initializeNotifications().catch(function (error) {
      console.error("[notifications-summary] refresh error:", error);
    });
    initializeNextSchedule().catch(function (error) {
      console.error("[next-helper-schedule] refresh error:", error);
    });
    renderPushControls();
    setFormMessage("保存したメールアドレスを消去しました。", "default");
  });
}

function renderSummaryCard(key, payload) {
  const root = getRequiredElement(`${key}-summary`);
  const statusElement = getRequiredElement(`${key}-status`);
  const countElement = getRequiredElement(`${key}-count-value`);
  const timeElement = getRequiredElement(`${key}-time`);
  const noteElement = getRequiredElement(`${key}-note`);
  const actionElement = getRequiredElement(`${key}-action`);
  const personalActionElement = getRequiredElement(`${key}-personal-action`);

  root.classList.remove("is-loading", "is-error", "is-empty", "is-ready");

  if (payload.status === "loading") {
    root.classList.add("is-loading");
    statusElement.textContent = "確認中";
    countElement.textContent = "—";
    timeElement.textContent = "—";
    noteElement.textContent =
      key === "today"
        ? "今日の予定を確認しています。"
        : "明日の予定を確認しています。";
    actionElement.setAttribute("href", payload.allPagePath);
    personalActionElement.setAttribute(
      "href",
      buildPersonalActionUrl(
        SUMMARY_CONFIGS.find(function (config) {
          return config.key === key;
        })?.personalPagePath || "/",
      ),
    );
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

  const hasItems = payload.scheduleCount > 0;

  root.classList.add(hasItems ? "is-ready" : "is-empty");
  statusElement.textContent = hasItems ? "予定あり" : "予定なし";
  countElement.textContent = String(payload.scheduleCount);
  timeElement.textContent = getDisplayValue(payload.firstStartTime);
  noteElement.textContent = hasItems
    ? `${payload.helperCount}名分の予定があります。`
    : key === "today"
      ? "今日は予定が入っていません。"
      : "明日は予定が入っていません。";
  actionElement.setAttribute("href", payload.allPagePath);
}

function renderNotificationsCard(payload) {
  const root = getRequiredElement("notifications-summary");
  const statusElement = getRequiredElement("notifications-status");
  const countElement = getRequiredElement("notifications-count");
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

  root.classList.remove(
    "is-loading",
    "is-error",
    "is-empty",
    "is-ready",
    "has-unread",
  );
  badgeElement.classList.remove("is-muted");

  if (!state.helperEmail) {
    root.classList.add("is-empty");
    statusElement.textContent = "未設定";
    countElement.textContent = "—";
    unreadCountElement.textContent = "—";
    badgeElement.textContent = "未設定";
    badgeElement.classList.add("is-muted");
    setActionBadge(0);
    updateAppBadge(0);
    noteElement.textContent =
      "メールアドレスを保存すると、自分への連絡を開けます。";
    return;
  }

  if (payload.status === "loading") {
    root.classList.add("is-loading");
    statusElement.textContent = "確認中";
    countElement.textContent = "—";
    unreadCountElement.textContent = "—";
    badgeElement.textContent = "確認中";
    setActionBadge(0);
    noteElement.textContent = "自分への連絡を確認しています。";
    return;
  }

  if (payload.status === "error") {
    root.classList.add("is-error");
    statusElement.textContent = "取得失敗";
    countElement.textContent = "—";
    unreadCountElement.textContent = "—";
    badgeElement.textContent = "エラー";
    setActionBadge(0);
    noteElement.textContent = payload.message;
    return;
  }

  root.classList.add(payload.unreadCount > 0 ? "is-ready" : "is-empty");
  root.classList.toggle("has-unread", payload.unreadCount > 0);
  statusElement.textContent = payload.unreadCount > 0 ? "未読あり" : "確認済み";
  countElement.textContent = String(payload.count);
  unreadCountElement.textContent = String(payload.unreadCount);
  badgeElement.textContent = payload.unreadCount > 0 ? "未読あり" : "未読なし";
  badgeElement.classList.toggle("is-muted", payload.unreadCount === 0);
  setActionBadge(payload.unreadCount);
  updateAppBadge(payload.unreadCount);
  noteElement.textContent =
    payload.unreadCount > 0
      ? `${payload.count}件の連絡のうち、${payload.unreadCount}件が未読です。`
      : "未読の連絡はありません。";
}

function renderNextScheduleCard(payload) {
  const root = getRequiredElement("next-summary");
  const statusElement = getRequiredElement("next-status");
  const dateElement = getRequiredElement("next-date");
  const timeElement = getRequiredElement("next-time");
  const userElement = getRequiredElement("next-user");
  const taskElement = getRequiredElement("next-task");
  const helperRowElement = getRequiredElement("next-helper-row");
  const helperElement = getRequiredElement("next-helper");
  const noteElement = getRequiredElement("next-note");

  root.classList.remove("is-loading", "is-error", "is-empty", "is-ready");

  if (!state.helperEmail) {
    root.classList.add("is-empty");
    statusElement.textContent = "未設定";
    dateElement.textContent = "—";
    timeElement.textContent = "—";
    userElement.textContent = "—";
    taskElement.textContent = "—";
    helperElement.textContent = "—";
    helperRowElement.hidden = true;
    noteElement.textContent =
      "メールアドレスを保存すると、自分の次の予定を表示できます。";
    return;
  }

  if (payload.status === "loading") {
    root.classList.add("is-loading");
    statusElement.textContent = "確認中";
    dateElement.textContent = "—";
    timeElement.textContent = "—";
    userElement.textContent = "—";
    taskElement.textContent = "—";
    helperElement.textContent = "—";
    helperRowElement.hidden = true;
    noteElement.textContent = "次の予定を確認しています。";
    return;
  }

  if (payload.status === "error") {
    root.classList.add("is-error");
    statusElement.textContent = "取得失敗";
    dateElement.textContent = "—";
    timeElement.textContent = "—";
    userElement.textContent = "—";
    taskElement.textContent = "—";
    helperElement.textContent = "—";
    helperRowElement.hidden = true;
    noteElement.textContent = payload.message;
    return;
  }

  if (!payload.item) {
    root.classList.add("is-empty");
    statusElement.textContent = "予定なし";
    dateElement.textContent = "—";
    timeElement.textContent = "—";
    userElement.textContent = "—";
    taskElement.textContent = "—";
    helperElement.textContent = "—";
    helperRowElement.hidden = true;
    noteElement.textContent = "今後の予定はありません。";
    return;
  }

  root.classList.add("is-ready");
  statusElement.textContent = "予定あり";
  dateElement.textContent = formatNextScheduleDate(payload.item.date);
  timeElement.textContent = formatNextScheduleTime(
    payload.item.startTime,
    payload.item.endTime,
  );
  userElement.textContent = getDisplayValue(payload.item.userName);
  taskElement.textContent = getDisplayValue(payload.item.task, "内容未設定");
  helperElement.textContent = getDisplayValue(payload.item.helperName);
  helperRowElement.hidden = !payload.item.helperName;
  noteElement.textContent = "今日以降で最も近い予定を表示しています。";
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
    helperCount: Number(data.count) || 0,
    scheduleCount: helpers.reduce(function (total, helper) {
      return total + (Number(helper?.scheduleCount) || 0);
    }, 0),
    firstStartTime: getEarliestStartTime(helpers),
    message: "",
    allPagePath: config.allPagePath,
  };
}

async function initializeSummaries() {
  for (const config of SUMMARY_CONFIGS) {
    renderSummaryCard(config.key, {
      status: "loading",
      helperCount: 0,
      scheduleCount: 0,
      firstStartTime: "",
      message: "",
      allPagePath: config.allPagePath,
    });
  }

  await Promise.all(
    SUMMARY_CONFIGS.map(async function (config) {
      try {
        const payload = await fetchSummary(config);
        renderSummaryCard(config.key, payload);
      } catch (error) {
        console.error(`[${config.key}-helper-summary] fetch error:`, error);
        renderSummaryCard(config.key, {
          status: "error",
          helperCount: 0,
          scheduleCount: 0,
          firstStartTime: "",
          message: config.errorLabel,
          allPagePath: config.allPagePath,
        });
      }
    }),
  );
}

async function fetchNotificationsSummary() {
  const url = new URL(NOTIFICATIONS_CONFIG.endpoint, window.location.origin);
  url.searchParams.set("helper_email", state.helperEmail);
  url.searchParams.set("limit", "100");

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
    count: Number(data.count) || 0,
    unreadCount: Number(data.unreadCount) || 0,
    message: "",
  };
}

async function fetchNextSchedule() {
  const url = new URL(NEXT_SCHEDULE_CONFIG.endpoint, window.location.origin);
  url.searchParams.set("helper_email", state.helperEmail);

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
    throw new Error(data?.message || NEXT_SCHEDULE_CONFIG.errorLabel);
  }

  return {
    status: "success",
    item: data.item
      ? {
          date: data.item.date ?? "",
          helperName: data.item.helperName ?? "",
          userName: data.item.userName ?? "",
          startTime: data.item.startTime ?? "",
          endTime: data.item.endTime ?? "",
          task: data.item.task ?? "",
        }
      : null,
    message: "",
  };
}

async function initializeNotifications() {
  if (!state.helperEmail) {
    renderNotificationsCard({
      status: "idle",
      count: 0,
      unreadCount: 0,
      message: "",
    });
    return;
  }

  renderNotificationsCard({
    status: "loading",
    count: 0,
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
      count: 0,
      unreadCount: 0,
      message: NOTIFICATIONS_CONFIG.errorLabel,
    });
  }
}

async function initializeNextSchedule() {
  renderNextScheduleCard({
    status: "loading",
    item: null,
    message: "",
  });

  if (!state.helperEmail) {
    renderNextScheduleCard({
      status: "idle",
      item: null,
      message: "",
    });
    return;
  }

  try {
    const payload = await fetchNextSchedule();
    renderNextScheduleCard(payload);
  } catch (error) {
    console.error("[next-helper-schedule] fetch error:", error);
    renderNextScheduleCard({
      status: "error",
      item: null,
      message: NEXT_SCHEDULE_CONFIG.errorLabel,
    });
  }
}

function setupPushControls() {
  const enableButtonElement = getRequiredElement("push-enable");
  const disableButtonElement = getRequiredElement("push-disable");
  const testButtonElement = getRequiredElement("push-test");

  enableButtonElement.addEventListener("click", async function () {
    try {
      setPushStatusLabel("登録中");
      setPushMessage("端末通知を登録しています...", "default");
      enableButtonElement.disabled = true;
      await subscribeCurrentDevice();
      setPushMessage(
        "端末通知を登録しました。必要ならテスト通知も送れます。",
        "success",
      );
    } catch (error) {
      console.error("[push] subscribe error:", error);
      setPushMessage("端末通知の登録に失敗しました。", "error");
      renderPushControls();
    }
  });

  disableButtonElement.addEventListener("click", async function () {
    try {
      setPushStatusLabel("解除中");
      setPushMessage("端末登録を解除しています...", "default");
      disableButtonElement.disabled = true;
      await unsubscribeCurrentDevice();
      setPushMessage("この端末の通知設定を解除しました。", "success");
    } catch (error) {
      console.error("[push] unsubscribe error:", error);
      setPushMessage("端末登録の解除に失敗しました。", "error");
      renderPushControls();
    }
  });

  testButtonElement.addEventListener("click", async function () {
    try {
      setPushStatusLabel("送信中");
      setPushMessage("テストPushを送信しています...", "default");
      testButtonElement.disabled = true;
      await sendTestPush();
      setPushMessage(
        "テスト通知を送りました。端末に表示されるか確認してください。",
        "success",
      );
      renderPushControls();
    } catch (error) {
      console.error("[push] test error:", error);
      setPushMessage("テストPushの送信に失敗しました。", "error");
      renderPushControls();
    }
  });
}

function setupPushDebugListener() {
  // TEMP: Service Worker 受信 payload 確認用。確認後はこの listener を外してください。
  if (typeof navigator === "undefined" || !navigator.serviceWorker) {
    return;
  }

  navigator.serviceWorker.addEventListener("message", function (event) {
    if (event.data?.type !== "PUSH_DEBUG") {
      return;
    }

    console.log("[page] PUSH_DEBUG rawText", event.data.rawText);
    console.log("[page] PUSH_DEBUG payload", event.data.payload);
  });
}

async function initializePage() {
  state.helperEmail = getSavedHelperEmail();
  setupHelperEmailForm();
  setupPushControls();
  setupPushDebugListener();
  renderHelperEmailPanel();
  renderPushControls();
  await forceTestAppBadge();
  await registerPushServiceWorker();
  await syncExistingSubscriptionIfNeeded();
  await Promise.all([
    initializeNotifications(),
    initializeSummaries(),
    initializeNextSchedule(),
  ]);
}

window.addEventListener("DOMContentLoaded", function () {
  initializePage().catch(function (error) {
    console.error("[index] initialize error:", error);
  });
});
