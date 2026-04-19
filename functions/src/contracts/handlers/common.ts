/**
 * 契約系ハンドラの共通ユーティリティ
 */
import type { Request } from "express";

const ADMIN_EMAIL = "admin@village-support.jp";

export function isAdmin(email: unknown): boolean {
  return (
    typeof email === "string" && email.trim().toLowerCase() === ADMIN_EMAIL
  );
}

export function getEmailFromReq(req: Request): string {
  const q = req.query.email;
  if (typeof q === "string") return q.trim();
  const b = (req.body && (req.body as Record<string, unknown>).email) as unknown;
  if (typeof b === "string") return b.trim();
  return "";
}

export function getIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0]?.trim() ?? null;
  }
  return (req.ip ?? null) || null;
}

export function getUserAgent(req: Request): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua : null;
}
