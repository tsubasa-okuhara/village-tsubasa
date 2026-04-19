/**
 * 契約操作の監査ログユーティリティ。
 * すべての契約系 API 操作（および Webhook 受信）でこれを呼ぶ。
 */
import { getSupabaseClient } from "../../lib/supabase";

export type AuditActorRole =
  | "admin"
  | "helper"
  | "subject"
  | "system"
  | "provider_webhook";

export type AuditAction =
  | "template_created"
  | "template_updated"
  | "template_deactivated"
  | "contract_created"
  | "contract_updated"
  | "contract_sent"
  | "contract_revoked"
  | "signature_requested"
  | "signature_signed"
  | "signature_declined"
  | "document_downloaded";

export interface AuditEntry {
  contractId?: string | null;
  actorEmail?: string | null;
  actorRole: AuditActorRole;
  action: AuditAction;
  payload?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  const supabase = getSupabaseClient();
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
