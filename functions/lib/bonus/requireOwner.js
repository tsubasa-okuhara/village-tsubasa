"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireOwner = requireOwner;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const VILLAGE_ADMIN_PROJECT_ID = "village-admin-bd316";
const VILLAGE_ADMIN_APP_NAME = "village-admin";
// このダッシュボードを開けるのはオーナーのみ（ヘルパーは含めない）
const ALLOWED_OWNER_EMAILS = ["admin@village-support.jp"].map((v) => v.toLowerCase());
let villageAdminApp = null;
function getVillageAdminApp() {
    if (villageAdminApp)
        return villageAdminApp;
    const existing = (0, app_1.getApps)().find((a) => a.name === VILLAGE_ADMIN_APP_NAME);
    if (existing) {
        villageAdminApp = existing;
        return existing;
    }
    villageAdminApp = (0, app_1.initializeApp)({ projectId: VILLAGE_ADMIN_PROJECT_ID }, VILLAGE_ADMIN_APP_NAME);
    return villageAdminApp;
}
async function requireOwner(req, res, next) {
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
        const decoded = await (0, auth_1.getAuth)(getVillageAdminApp()).verifyIdToken(idToken);
        const email = (decoded.email ?? "").toLowerCase();
        if (!email || !ALLOWED_OWNER_EMAILS.includes(email)) {
            console.log("[bonus/requireOwner] forbidden:", email);
            res.status(403).json({ ok: false, message: "forbidden" });
            return;
        }
        req.ownerEmail = email;
        next();
    }
    catch (error) {
        console.error("[bonus/requireOwner] verify error:", error);
        res.status(401).json({ ok: false, message: "unauthorized" });
    }
}
