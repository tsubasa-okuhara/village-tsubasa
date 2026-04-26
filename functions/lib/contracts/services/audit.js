"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAuditLog = writeAuditLog;
/**
 * 契約操作の監査ログユーティリティ。
 * すべての契約系 API 操作（および Webhook 受信）でこれを呼ぶ。
 */
const supabase_1 = require("../../lib/supabase");
async function writeAuditLog(entry) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    const { error } = await supabase.from("contract_audit_log").insert({
        contract_id: entry.contractId ?? null,
        actor_email: entry.actorEmail ?? null,
        actor_role: entry.actorRole,
        action: entry.action,
        payload: entry.payload ?? null,
        ip_address: entry.ipAddress ?? null,
        user_agent: entry.userAgent ?? null,
    });
    if (error) {
        // 監査ログ失敗は握りつぶさない（アラート化は Phase 5）
        console.error("contract_audit_log insert failed:", error);
    }
}
