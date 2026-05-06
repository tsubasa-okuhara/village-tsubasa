"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleScheduleEditorAuth = handleScheduleEditorAuth;
const supabase_1 = require("../lib/supabase");
async function handleScheduleEditorAuth(req, res) {
    try {
        const rawEmail = String(req.query.email || "").trim();
        if (!rawEmail) {
            res.status(400).json({
                ok: false,
                canEdit: false,
                reason: "missing_email",
                message: "メールアドレスが指定されていません",
            });
            return;
        }
        const normalizedEmail = rawEmail.toLowerCase();
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data, error } = await supabase
            .from("admin_users")
            .select("email, can_edit_schedule")
            .ilike("email", normalizedEmail)
            .maybeSingle();
        if (error) {
            throw error;
        }
        if (!data) {
            res.status(200).json({
                ok: false,
                canEdit: false,
                reason: "not_registered",
                message: "登録されていないメールアドレスです。管理者にお問い合わせください。",
            });
            return;
        }
        if (!data.can_edit_schedule) {
            res.status(200).json({
                ok: false,
                canEdit: false,
                reason: "no_permission",
                message: "スケジュール編集の権限がありません。管理者にお問い合わせください。",
            });
            return;
        }
        res.status(200).json({
            ok: true,
            canEdit: true,
            email: data.email,
        });
    }
    catch (error) {
        console.error("[scheduleEditor/auth] error:", error);
        res.status(500).json({
            ok: false,
            message: "サーバーエラーが発生しました",
        });
    }
}
