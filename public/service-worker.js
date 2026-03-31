self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

async function updateAppBadge(count) {
  try {
    if (!self.navigator) {
      return;
    }

    if (!count || count <= 0) {
      if (typeof self.navigator.clearAppBadge === "function") {
        await self.navigator.clearAppBadge();
      }
      return;
    }

    if (typeof self.navigator.setAppBadge === "function") {
      await self.navigator.setAppBadge(count);
    }
  } catch (error) {
    console.error("[service-worker] badge update error:", error);
  }
}

self.addEventListener("push", function (event) {
  if (!event.data) {
    return;
  }

  const rawText = event.data.text();
  let payload = {};

  try {
    payload = JSON.parse(rawText);
  } catch (_error) {
    payload = {
      title: "通知",
      body: rawText,
    };
  }

  // TEMP: Push payload 確認用。確認後はこのログを外してください。
  console.log("[sw] raw push payload", rawText);
  console.log("[sw] parsed push payload", payload);

  const title = typeof payload.title === "string" && payload.title ? payload.title : "通知";
  const body = typeof payload.body === "string" ? payload.body : "";
  const icon = typeof payload.icon === "string" && payload.icon ? payload.icon : "/icons/app-icon.svg";
  const badge = typeof payload.badge === "string" && payload.badge ? payload.badge : "/icons/app-badge.svg";
  const url = typeof payload.url === "string" && payload.url ? payload.url : "/notifications/";
  const helperEmail = typeof payload.helperEmail === "string" ? payload.helperEmail : "";
  const hasUnreadCount = typeof payload.unreadCount === "number" && Number.isFinite(payload.unreadCount);
  const unreadCount = hasUnreadCount ? payload.unreadCount : 0;

  const notificationUrl = new URL(url, self.location.origin);
  if (helperEmail) {
    notificationUrl.searchParams.set("helper_email", helperEmail);
  }

  event.waitUntil(
    Promise.all([
      hasUnreadCount ? updateAppBadge(unreadCount) : Promise.resolve(),
      self.registration.showNotification(title, {
        body,
        icon,
        badge,
        data: {
          url: notificationUrl.toString(),
        },
      }),
    ])
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/notifications/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
