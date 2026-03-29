import type { Request, Response } from "express";
import { defineSecret } from "firebase-functions/params";
import webpush, { type PushSubscription } from "web-push";

import { getSupabaseClient } from "./lib/supabase";

export const WEB_PUSH_VAPID_PUBLIC_KEY = defineSecret("WEB_PUSH_VAPID_PUBLIC_KEY");
export const WEB_PUSH_VAPID_PRIVATE_KEY = defineSecret("WEB_PUSH_VAPID_PRIVATE_KEY");
export const WEB_PUSH_SUBJECT = defineSecret("WEB_PUSH_SUBJECT");

type PushSubscriptionRow = {
  id: string;
  helper_email: string | null;
  endpoint: string;
  p256dh_key: string | null;
  auth_key: string | null;
  user_agent: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
};

type PushPublicKeyResponse = {
  ok: true;
  publicKey: string;
};

type PushActionSuccessResponse = {
  ok: true;
  message: string;
  subscribedCount?: number;
  sentCount?: number;
  failedCount?: number;
  deactivatedCount?: number;
};

type PushErrorResponse = {
  ok: false;
  message: string;
};

async function fetchUnreadNotificationCount(helperEmail: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("target_email", helperEmail)
    .eq("is_read", false);

  if (error) {
    throw error;
  }

  return Number(count) || 0;
}

function getStringValue(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0].trim() : "";
  }

  return typeof value === "string" ? value.trim() : "";
}

function getNotificationText(value: unknown, fallback: string): string {
  const text = getStringValue(value);
  return text || fallback;
}

function configureWebPush(): void {
  webpush.setVapidDetails(
    WEB_PUSH_SUBJECT.value(),
    WEB_PUSH_VAPID_PUBLIC_KEY.value(),
    WEB_PUSH_VAPID_PRIVATE_KEY.value()
  );
}

function getPushSubscriptionFromBody(body: unknown): PushSubscription | null {
  const payload = body as {
    endpoint?: unknown;
    keys?: {
      p256dh?: unknown;
      auth?: unknown;
    };
  } | null;

  const endpoint = getStringValue(payload?.endpoint);
  const p256dh = getStringValue(payload?.keys?.p256dh);
  const auth = getStringValue(payload?.keys?.auth);

  if (!endpoint || !p256dh || !auth) {
    return null;
  }

  return {
    endpoint,
    keys: {
      p256dh,
      auth,
    },
  };
}

async function deactivateSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("endpoint", endpoint);

  if (error) {
    throw error;
  }
}

export async function handleGetPushPublicKey(
  _req: Request,
  res: Response<PushPublicKeyResponse | PushErrorResponse>
): Promise<void> {
  try {
    res.status(200).json({
      ok: true,
      publicKey: WEB_PUSH_VAPID_PUBLIC_KEY.value(),
    });
  } catch (error) {
    console.error("[push/public-key] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}

export async function handleSubscribePush(
  req: Request,
  res: Response<PushActionSuccessResponse | PushErrorResponse>
): Promise<void> {
  const helperEmail = getStringValue(req.body?.helperEmail);
  const userAgent = getStringValue(req.body?.userAgent);
  const subscription = getPushSubscriptionFromBody(req.body?.subscription);

  if (!helperEmail) {
    res.status(400).json({
      ok: false,
      message: "helperEmail is required",
    });
    return;
  }

  if (!subscription) {
    res.status(400).json({
      ok: false,
      message: "subscription is required",
    });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({
        helper_email: helperEmail,
        endpoint: subscription.endpoint,
        p256dh_key: subscription.keys.p256dh,
        auth_key: subscription.keys.auth,
        user_agent: userAgent || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "endpoint",
      });

    if (error) {
      throw error;
    }

    res.status(200).json({
      ok: true,
      message: "subscription saved",
      subscribedCount: 1,
    });
  } catch (error) {
    console.error("[push/subscribe] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}

export async function handleUnsubscribePush(
  req: Request,
  res: Response<PushActionSuccessResponse | PushErrorResponse>
): Promise<void> {
  const endpoint = getStringValue(req.body?.endpoint);

  if (!endpoint) {
    res.status(400).json({
      ok: false,
      message: "endpoint is required",
    });
    return;
  }

  try {
    await deactivateSubscriptionByEndpoint(endpoint);

    res.status(200).json({
      ok: true,
      message: "subscription deactivated",
      subscribedCount: 0,
    });
  } catch (error) {
    console.error("[push/unsubscribe] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}

export async function handleSendTestPush(
  req: Request,
  res: Response<PushActionSuccessResponse | PushErrorResponse>
): Promise<void> {
  const helperEmail = getStringValue(req.body?.helperEmail);
  const title = getNotificationText(req.body?.title, "テスト通知");
  const body = getNotificationText(req.body?.body, "Web Push のテスト送信です。");
  const linkUrl = getNotificationText(req.body?.linkUrl, "/notifications/");

  if (!helperEmail) {
    res.status(400).json({
      ok: false,
      message: "helperEmail is required",
    });
    return;
  }

  try {
    configureWebPush();

    const supabase = getSupabaseClient();
    const unreadCount = await fetchUnreadNotificationCount(helperEmail);
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, helper_email, endpoint, p256dh_key, auth_key, user_agent, is_active, created_at, updated_at")
      .eq("helper_email", helperEmail)
      .eq("is_active", true);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as PushSubscriptionRow[];

    if (rows.length === 0) {
      res.status(404).json({
        ok: false,
        message: "active subscription not found",
      });
      return;
    }

    let sentCount = 0;
    let failedCount = 0;
    let deactivatedCount = 0;

    const payload = JSON.stringify({
      title,
      body,
      icon: "/icons/app-icon.svg",
      badge: "/icons/app-badge.svg",
      url: linkUrl,
      helperEmail,
      unreadCount,
    });

    await Promise.all(rows.map(async function (row) {
      const subscription: PushSubscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: String(row.p256dh_key ?? ""),
          auth: String(row.auth_key ?? ""),
        },
      };

      try {
        await webpush.sendNotification(subscription, payload);
        sentCount += 1;
      } catch (error) {
        failedCount += 1;
        const statusCode = typeof error === "object" && error && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : 0;

        if (statusCode === 404 || statusCode === 410) {
          await deactivateSubscriptionByEndpoint(row.endpoint);
          deactivatedCount += 1;
        }

        console.error("[push/test] send error:", error);
      }
    }));

    res.status(200).json({
      ok: true,
      message: "test push sent",
      sentCount,
      failedCount,
      deactivatedCount,
    });
  } catch (error) {
    console.error("[push/test] error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}
