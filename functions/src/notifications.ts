import type { Request, Response } from "express";

import { getSupabaseClient } from "./lib/supabase";

type NotificationRow = {
  id: string;
  target_email: string | null;
  title: string | null;
  body: string | null;
  link_url: string | null;
  notification_type: string | null;
  is_read: boolean | null;
  created_at: string;
};

type NotificationItem = {
  id: string;
  targetEmail: string;
  title: string;
  body: string;
  linkUrl: string;
  notificationType: string;
  isRead: boolean;
  createdAt: string;
};

type NotificationsSuccessResponse = {
  ok: true;
  helperEmail: string;
  unreadCount: number;
  count: number;
  items: NotificationItem[];
};

type NotificationsErrorResponse = {
  ok: false;
  message: string;
};

type ReadNotificationSuccessResponse = {
  ok: true;
  id: string;
};

function getStringValue(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0].trim() : "";
  }

  return typeof value === "string" ? value.trim() : "";
}

function toNotificationItem(row: NotificationRow): NotificationItem {
  return {
    id: String(row.id),
    targetEmail: String(row.target_email ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    linkUrl: String(row.link_url ?? ""),
    notificationType: String(row.notification_type ?? ""),
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

function getLimit(value: unknown): number {
  const parsed = Number.parseInt(getStringValue(value), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30;
  }

  return Math.min(parsed, 100);
}

export async function handleGetNotifications(
  req: Request,
  res: Response<NotificationsSuccessResponse | NotificationsErrorResponse>
): Promise<void> {
  const helperEmail = getStringValue(req.query.helper_email);
  const limit = getLimit(req.query.limit);

  if (!helperEmail) {
    res.status(400).json({
      ok: false,
      message: "helper_email is required",
    });
    return;
  }

  try {
    const supabase = getSupabaseClient();

    const [{ data, error }, { count, error: countError }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, target_email, title, body, link_url, notification_type, is_read, created_at")
        .ilike("target_email", helperEmail)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .ilike("target_email", helperEmail)
        .eq("is_read", false),
    ]);

    if (error) {
      throw error;
    }

    if (countError) {
      throw countError;
    }

    const rows = (data ?? []) as NotificationRow[];

    res.status(200).json({
      ok: true,
      helperEmail,
      unreadCount: count ?? 0,
      count: rows.length,
      items: rows.map(toNotificationItem),
    });
  } catch (error) {
    console.error("[notifications] get error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}

export async function handleReadNotification(
  req: Request,
  res: Response<ReadNotificationSuccessResponse | NotificationsErrorResponse>
): Promise<void> {
  const id = getStringValue(req.body?.id);
  const helperEmail = getStringValue(req.body?.helper_email);

  if (!id) {
    res.status(400).json({
      ok: false,
      message: "id is required",
    });
    return;
  }

  if (!helperEmail) {
    res.status(400).json({
      ok: false,
      message: "helper_email is required",
    });
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .ilike("target_email", helperEmail)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      res.status(404).json({
        ok: false,
        message: "notification not found",
      });
      return;
    }

    res.status(200).json({
      ok: true,
      id: String(data.id),
    });
  } catch (error) {
    console.error("[notifications/read] post error:", error);
    res.status(500).json({
      ok: false,
      message: "internal error",
    });
  }
}
