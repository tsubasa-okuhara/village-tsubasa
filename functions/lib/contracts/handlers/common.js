"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = isAdmin;
exports.getEmailFromReq = getEmailFromReq;
exports.getIp = getIp;
exports.getUserAgent = getUserAgent;
const ADMIN_EMAIL = "admin@village-support.jp";
function isAdmin(email) {
    return (typeof email === "string" && email.trim().toLowerCase() === ADMIN_EMAIL);
}
function getEmailFromReq(req) {
    const q = req.query.email;
    if (typeof q === "string")
        return q.trim();
    const b = (req.body && req.body.email);
    if (typeof b === "string")
        return b.trim();
    return "";
}
function getIp(req) {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length > 0) {
        return xff.split(",")[0]?.trim() ?? null;
    }
    return (req.ip ?? null) || null;
}
function getUserAgent(req) {
    const ua = req.headers["user-agent"];
    return typeof ua === "string" ? ua : null;
}
