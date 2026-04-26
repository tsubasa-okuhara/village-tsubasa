"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCloudSignWebhook = handleCloudSignWebhook;
exports.handleGmoSignWebhook = handleGmoSignWebhook;
const providers_1 = require("../providers");
const audit_1 = require("../services/audit");
const common_1 = require("./common");
function buildHeaderMap(req) {
    const out = {};
    for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string")
            out[k.toLowerCase()] = v;
        else if (Array.isArray(v))
            out[k.toLowerCase()] = v[0] ?? "";
    }
    return out;
}
async function handleProviderWebhook(providerName, req, res) {
    const provider = (0, providers_1.getProvider)(providerName);
    try {
        const parsed = provider.parseWebhook(req.body, buildHeaderMap(req));
        await (0, audit_1.writeAuditLog)({
            actorRole: "provider_webhook",
            action: parsed.event === "declined"
                ? "signature_declined"
                : parsed.event === "signed"
                    ? "signature_signed"
                    : "contract_sent",
            payload: { parsed, rawBody: req.body },
            ipAddress: (0, common_1.getIp)(req),
            userAgent: (0, common_1.getUserAgent)(req),
        });
        // TODO: Phase 3.2 以降
        //  - providerDocumentId から contracts を引く
        //  - contract_signatures.status を signed/declined に更新
        //  - 全員署名完了なら contracts.status = 'signed'
        //  - 署名済PDF を provider.downloadSignedPdf で取得して Storage 保存
        //  - notifications に 'contract_signed' / 'contract_completed' を投げる
        res.status(200).json({ received: true, note: "Phase 3 スタブ: 未処理" });
    }
    catch (err) {
        // parseWebhook が未実装のためここに来る
        console.warn(`${providerName} webhook parse failed:`, err);
        await (0, audit_1.writeAuditLog)({
            actorRole: "provider_webhook",
            action: "contract_sent",
            payload: {
                note: "webhook parse error (Phase 3 スタブ)",
                error: String(err),
                rawBody: req.body,
            },
            ipAddress: (0, common_1.getIp)(req),
            userAgent: (0, common_1.getUserAgent)(req),
        });
        res.status(200).json({ received: true, note: String(err) });
    }
}
async function handleCloudSignWebhook(req, res) {
    await handleProviderWebhook("cloudsign", req, res);
}
async function handleGmoSignWebhook(req, res) {
    await handleProviderWebhook("gmosign", req, res);
}
