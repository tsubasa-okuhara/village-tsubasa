"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleScheduleEditorRestore = handleScheduleEditorRestore;
const supabase_1 = require("../lib/supabase");
/**
 * 論理削除の取り消し: deleted_at = null に戻す
 * POST /api/schedule-editor/restore
 *   body: { id, email }
 *
 * 復元は競合検知不要（削除済み行を元に戻すだけなので）
 */
async function handleScheduleEditorRestore(req, res) {
    try {
        const body = req.body ?? {};
        const id = typeof body.id === "string" ? body.id.trim() : "";
        const email = typeof body.email === "string" ? body.email.trim() : "";
        if (!id || !email) {
            res.status(400).json({
                ok: false,
                reason: "invalid_request",
                message: "id / email が必要です",
            });
            return;
        }
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data: user, error: userError } = await supabase
            .from("admin_users")
            .select("email, can_edit_schedule")
            .ilike("email", email.toLowerCase())
            .maybeSingle();
        if (userError)
            throw userError;
        if (!user) {
            res.status(403).json({
                ok: false,
                reason: "not_registered",
                message: "登録されていないメールアドレスです",
            });
            return;
        }
        if (!user.can_edit_schedule) {
            res.status(403).json({
                ok: false,
                reason: "no_permission",
                message: "スケジュール編集権限がありません",
            });
            return;
        }
        const { data: current, error: fetchError } = await supabase
            .from("schedule")
            .select("id, updated_at, deleted_at")
            .eq("id", id)
            .maybeSingle();
        if (fetchError)
            throw fetchError;
        if (!current) {
            res.status(404).json({
                ok: false,
                reason: "not_found",
                message: "対象の予定が見つかりません",
            });
            return;
        }
        if (!current.deleted_at) {
            res.status(400).json({
                ok: false,
                reason: "not_deleted",
                message: "この予定は削除されていません",
            });
            return;
        }
        const now = new Date().toISOString();
        const { data: restored, error: updateError } = await supabase
            .from("schedule")
            .update({
            deleted_at: null,
            updated_at: now,
            synced_to_sheet: false,
        })
            .eq("id", id)
            .select("id, updated_at")
            .maybeSingle();
        if (updateError)
            throw updateError;
        if (!restored) {
            res.status(404).json({
                ok: false,
                reason: "not_found",
                message: "復元できませんでした",
            });
            return;
        }
        res.status(200).json({
            ok: true,
            id: restored.id,
            updatedAt: restored.updated_at,
        });
    }
    catch (error) {
        console.error("[scheduleEditor/restore] error:", error);
        res.status(500).json({
            ok: false,
            reason: "server_error",
            message: "サーバーエラーが発生しました",
        });
    }
}
