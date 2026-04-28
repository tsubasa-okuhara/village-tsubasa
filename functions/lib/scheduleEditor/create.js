"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleScheduleEditorCreate = handleScheduleEditorCreate;
const supabase_1 = require("../lib/supabase");
const normalize_1 = require("./normalize");
/**
 * 新規予定の追加
 * POST /api/schedule-editor/create
 *   body: { email, date, name, client, startTime, endTime, haisha, task, summary, beneficiaryNumber }
 *
 * - 必須: email, date, client
 * - id は Supabase が自動採番
 * - helper_email は helper_master から自動補完（name が一致するレコードがあれば）
 * - source_key は null（editor 由来の行は同期キー無し）
 * - synced_to_sheet = false（GAS 月次フラッシュで反映）
 */
async function handleScheduleEditorCreate(req, res) {
    try {
        const body = req.body ?? {};
        const email = typeof body.email === "string" ? body.email.trim() : "";
        if (!email) {
            res.status(400).json({
                ok: false,
                reason: "invalid_request",
                message: "email が必要です",
            });
            return;
        }
        // 入力値のバリデーション + 正規化（バリデーションエラーは invalid_request にまとめる）
        let date;
        let name;
        let client;
        let startTime;
        let endTime;
        let haisha;
        let task;
        let summary;
        let beneficiaryNumber;
        try {
            date = (0, normalize_1.normalizeDateString)(body.date);
            name = (0, normalize_1.normalizeText)(body.name);
            client = (0, normalize_1.normalizeText)(body.client);
            if (!client) {
                throw new Error("利用者名は必須です");
            }
            startTime = (0, normalize_1.normalizeTimeString)(body.startTime);
            endTime = (0, normalize_1.normalizeTimeString)(body.endTime);
            haisha = (0, normalize_1.normalizeText)(body.haisha);
            task = (0, normalize_1.normalizeText)(body.task);
            summary = (0, normalize_1.normalizeText)(body.summary);
            beneficiaryNumber = (0, normalize_1.normalizeText)(body.beneficiaryNumber);
        }
        catch (validationError) {
            const message = validationError instanceof Error
                ? validationError.message
                : "入力値が不正です";
            res.status(400).json({
                ok: false,
                reason: "invalid_request",
                message,
            });
            return;
        }
        const supabase = (0, supabase_1.getSupabaseClient)();
        // 認可チェック
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
        // helper_email を helper_master から自動補完
        let helperEmail = null;
        if (name) {
            const { data: helper, error: helperError } = await supabase
                .from("helper_master")
                .select("helper_email")
                .eq("helper_name", name)
                .maybeSingle();
            if (helperError) {
                // helper_master 検索失敗は致命的ではない（手入力なら null のまま）
                console.warn("[scheduleEditor/create] helper_master lookup failed:", helperError);
            }
            else if (helper) {
                helperEmail = helper.helper_email ?? null;
            }
        }
        // INSERT（id・created_at・updated_at は Supabase が自動採番）
        const insertPayload = {
            date,
            name,
            helper_email: helperEmail,
            client,
            start_time: startTime,
            end_time: endTime,
            haisha,
            task,
            summary,
            beneficiary_number: beneficiaryNumber,
            synced_to_sheet: false,
            // source_key は意図的に未指定（null になる）
        };
        const { data: inserted, error: insertError } = await supabase
            .from("schedule")
            .insert(insertPayload)
            .select("id")
            .single();
        if (insertError)
            throw insertError;
        if (!inserted) {
            throw new Error("INSERT 結果が取得できませんでした");
        }
        // schedule_web_v 経由で取得し直して、レスポンスを一覧 API と同じ形に統一
        const { data: viewRow, error: viewError } = await supabase
            .from("schedule_web_v")
            .select("id, date, name, client, start_time, end_time, haisha, task, summary, updated_at")
            .eq("id", inserted.id)
            .maybeSingle();
        if (viewError)
            throw viewError;
        if (!viewRow) {
            throw new Error("INSERT は成功したが view 経由の再取得に失敗しました（id: " +
                inserted.id +
                "）");
        }
        const item = {
            id: viewRow.id,
            date: viewRow.date,
            helperName: viewRow.name,
            userName: viewRow.client,
            startTime: viewRow.start_time,
            endTime: viewRow.end_time,
            haisha: viewRow.haisha,
            task: viewRow.task,
            summary: viewRow.summary,
            updatedAt: viewRow.updated_at,
        };
        res.status(200).json({ ok: true, item });
    }
    catch (error) {
        console.error("[scheduleEditor/create] error:", error);
        res.status(500).json({
            ok: false,
            reason: "server_error",
            message: "サーバーエラーが発生しました",
        });
    }
}
