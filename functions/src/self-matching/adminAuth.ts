import type { NextFunction, Request, Response } from "express";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

if (getApps().length === 0) {
  initializeApp();
}

const ALLOWED_ADMIN_EMAILS = [
  "admin@village-support.jp",
  "inachichoco@gmail.com",
  "yutaka.ito1994@gmail.com",
].map((v) => v.toLowerCase());

export type AdminRequest = Request & {
  adminEmail?: string;
};

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization ?? "";

    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({ ok: false, message: "missing authorization header" });
      return;
    }

    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
      res.status(401).json({ ok: false, message: "empty token" });
      return;
    }

    const decoded = await getAuth().verifyIdToken(idToken);
    const email = (decoded.email ?? "").toLowerCase();

    if (!email) {
      res.status(403).json({ ok: false, message: "email not found in token" });
      return;
    }

    if (!ALLOWED_ADMIN_EMAILS.includes(email)) {
      console.log("[self-matching/adminAuth] forbidden email:", email);
      res.status(403).json({ ok: false, message: "forbidden" });
      return;
    }

    (req as AdminRequest).adminEmail = email;
    next();
  } catch (error) {
    console.error("[self-matching/adminAuth] verify error:", error);
    res.status(401).json({ ok: false, message: "unauthorized" });
  }
}
