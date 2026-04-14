"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetPendingCalmChecks = handleGetPendingCalmChecks;
exports.handleAnswerCalmCheck = handleAnswerCalmCheck;
exports.handleGenerateCalmChecks = handleGenerateCalmChecks;
exports.handleGetCalmCheckHistory = handleGetCalmCheckHistory;
exports.handleGetCalmCheckTargets = handleGetCalmCheckTargets;
exports.handleAddCalmCheckTarget = handleAddCalmCheckTarget;
exports.handleRemoveCalmCheckTarget = handleRemoveCalmCheckTarget;
const supabase_1 = require("./lib/supabase");
function str(v) {
    if (Array.isArray(v))
        return typeof v[0] === "string" ? v[0].trim() : "";
    return typeof v === "string" ? v.trim() : "";
}
/* ------------------------------------------------------------------ */
/*  GET /calm-checks/pending                                           */
/*  ヘルパーの未回答の落ち着き確認一覧                                      */
/* ------------------------------------------------------------------ */
async function handleGetPendingCalmChecks(req, res) {
    const helperEmail = str(req.query.helper_email);
    if (!helperEmail) {
        res.status(400).json({ ok: false, message: "helper_email is required" });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data, error } = await supabase
            .from("calm_checks")
            .select("*")
            .ilike("helper_email", helperEmail)
            .eq("status", "pending")
            .order("service_date", { ascending: true });
        if (error)
            throw error;
        res.status(200).json({
            ok: true,
            count: (data ?? []).length,
            items: data ?? [],
        });
    }
    catch (err) {
        console.error("[calm-checks/pending] error:", err);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
/* ------------------------------------------------------------------ */
/*  POST /calm-checks/answer                                           */
/*  ヘルパーが回答を送信                                                  */
/* ------------------------------------------------------------------ */
async function handleAnswerCalmCheck(req, res) {
    const id = str(req.body?.id);
    const helperEmail = str(req.body?.helper_email);
    const isCalm = req.body?.is_calm;
    const severity = str(req.body?.severity) || null; // 'overall' | 'partial' | null
    const memo = str(req.body?.memo) || null;
    if (!id || !helperEmail) {
        res.status(400).json({ ok: false, message: "id and helper_email are required" });
        return;
    }
    if (typeof isCalm !== "boolean") {
        res.status(400).json({ ok: false, message: "is_calm (boolean) is required" });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data, error } = await supabase
            .from("calm_checks")
            .update({
            is_calm: isCalm,
            severity,
            memo,
            status: "answered",
            answered_at: new Date().toISOString(),
        })
            .eq("id", id)
            .ilike("helper_email", helperEmail)
            .eq("status", "pending")
            .select("id, client_name, is_calm, severity, memo")
            .maybeSingle();
        if (error)
            throw error;
        if (!data) {
            res.status(404).json({ ok: false, message: "calm check not found or already answered" });
            return;
        }
        // TODO: LINE 共有処理をここに追加
        // if (!isCalm) { await shareToLine(data); }
        res.status(200).json({ ok: true, id: data.id, answered: true });
    }
    catch (err) {
        console.error("[calm-checks/answer] error:", err);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
/* ------------------------------------------------------------------ */
/*  POST /calm-checks/generate                                         */
/*  今日のスケジュールを元に対象利用者の確認レコードを生成                      */
/*  （スケジュール同期後 or 日次バッチで呼ぶ）                              */
/* ------------------------------------------------------------------ */
async function handleGenerateCalmChecks(req, res) {
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        // 1. アクティブな対象利用者を取得
        const { data: targets, error: tErr } = await supabase
            .from("calm_check_targets")
            .select("client_id, client_name")
            .eq("is_active", true);
        if (tErr)
            throw tErr;
        if (!targets || targets.length === 0) {
            res.status(200).json({ ok: true, message: "no active targets", created: 0 });
            return;
        }
        // 2. 今日の日付（JST）
        const now = new Date();
        const jstOffset = 9 * 60 * 60 * 1000;
        const jstDate = new Date(now.getTime() + jstOffset);
        const today = jstDate.toISOString().slice(0, 10);
        // 3. schedule テーブルから今日の予定を取得し、対象利用者に該当するものを抽出
        //    schedule.client は「上倉晃輝様」のように「様」付き
        //    calm_check_targets.client_name は「上倉 晃輝」（スペース有・様なし）
        const { data: todaySchedules, error: sErr } = await supabase
            .from("schedule")
            .select("id, date, name, client, start_time, end_time, task, helper_email")
            .eq("date", today);
        if (sErr)
            throw sErr;
        if (!todaySchedules || todaySchedules.length === 0) {
            res.status(200).json({ ok: true, message: "no schedules today", created: 0 });
            return;
        }
        // 対象利用者名でフィルタ（「様」やスペースを除去して比較）
        function normalize(s) {
            return s.replace(/[\s　様]/g, "");
        }
        const targetMap = new Map(targets.map((t) => [normalize(t.client_name), t]));
        const matchedTasks = todaySchedules.filter((s) => {
            const clientNorm = normalize(s.client ?? "");
            return targetMap.has(clientNorm);
        });
        if (matchedTasks.length === 0) {
            res.status(200).json({ ok: true, message: "no matching schedules today", created: 0 });
            return;
        }
        // 4. 既に生成済みの確認があるかチェック（重複防止）
        const taskIds = matchedTasks.map((t) => t.id);
        const { data: existing, error: eErr } = await supabase
            .from("calm_checks")
            .select("schedule_task_id")
            .in("schedule_task_id", taskIds);
        if (eErr)
            throw eErr;
        const existingTaskIds = new Set((existing ?? []).map((e) => e.schedule_task_id));
        // 5. 新しい確認レコードを生成
        const newRecords = matchedTasks
            .filter((t) => !existingTaskIds.has(t.id))
            .map((t) => {
            const clientNorm = normalize(t.client ?? "");
            const target = targetMap.get(clientNorm);
            return {
                client_id: target?.client_id ?? null,
                client_name: t.client ?? "",
                helper_email: t.helper_email ?? "",
                helper_name: t.name ?? null,
                schedule_task_id: t.id,
                service_date: t.date,
                start_time: t.start_time ?? null,
                end_time: t.end_time ?? null,
                task_name: t.task ?? null,
                is_calm: false,
                status: "pending",
            };
        })
            .filter((r) => r.helper_email);
        if (newRecords.length === 0) {
            res.status(200).json({ ok: true, message: "all checks already generated", created: 0 });
            return;
        }
        const { data: inserted, error: iErr } = await supabase
            .from("calm_checks")
            .insert(newRecords)
            .select("id");
        if (iErr)
            throw iErr;
        res.status(200).json({
            ok: true,
            created: (inserted ?? []).length,
            date: today,
        });
    }
    catch (err) {
        console.error("[calm-checks/generate] error:", err);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
/* ------------------------------------------------------------------ */
/*  GET /calm-checks/history                                           */
/*  管理者用: 回答履歴の取得                                              */
/* ------------------------------------------------------------------ */
async function handleGetCalmCheckHistory(req, res) {
    const clientId = str(req.query.client_id);
    const limitStr = str(req.query.limit);
    const limit = Math.min(Number.parseInt(limitStr, 10) || 50, 200);
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        let query = supabase
            .from("calm_checks")
            .select("*")
            .in("status", ["answered", "skipped"])
            .order("service_date", { ascending: false })
            .limit(limit);
        if (clientId) {
            query = query.eq("client_id", clientId);
        }
        const { data, error } = await query;
        if (error)
            throw error;
        res.status(200).json({
            ok: true,
            count: (data ?? []).length,
            items: data ?? [],
        });
    }
    catch (err) {
        console.error("[calm-checks/history] error:", err);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
/* ------------------------------------------------------------------ */
/*  GET /calm-checks/targets                                           */
/*  管理者用: 対象利用者リスト取得                                         */
/* ------------------------------------------------------------------ */
async function handleGetCalmCheckTargets(req, res) {
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data, error } = await supabase
            .from("calm_check_targets")
            .select("*")
            .order("created_at", { ascending: true });
        if (error)
            throw error;
        res.status(200).json({
            ok: true,
            count: (data ?? []).length,
            items: data ?? [],
        });
    }
    catch (err) {
        console.error("[calm-checks/targets] error:", err);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
/* ------------------------------------------------------------------ */
/*  POST /calm-checks/targets                                          */
/*  管理者用: 対象利用者を追加                                            */
/* ------------------------------------------------------------------ */
async function handleAddCalmCheckTarget(req, res) {
    const clientId = str(req.body?.client_id);
    const clientName = str(req.body?.client_name);
    const adminEmail = str(req.body?.admin_email);
    if (adminEmail.toLowerCase() !== "admin@village-support.jp") {
        res.status(403).json({ ok: false, message: "admin only" });
        return;
    }
    if (!clientId || !clientName) {
        res.status(400).json({ ok: false, message: "client_id and client_name are required" });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        // 既に登録済みかチェック
        const { data: existing } = await supabase
            .from("calm_check_targets")
            .select("id, is_active")
            .eq("client_id", clientId)
            .maybeSingle();
        if (existing) {
            // 非アクティブなら再アクティブ化
            if (!existing.is_active) {
                await supabase
                    .from("calm_check_targets")
                    .update({ is_active: true, updated_at: new Date().toISOString() })
                    .eq("id", existing.id);
            }
            res.status(200).json({ ok: true, id: existing.id, reactivated: !existing.is_active });
            return;
        }
        const { data, error } = await supabase
            .from("calm_check_targets")
            .insert({ client_id: clientId, client_name: clientName })
            .select("id")
            .single();
        if (error)
            throw error;
        res.status(201).json({ ok: true, id: data.id });
    }
    catch (err) {
        console.error("[calm-checks/targets] add error:", err);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
/* ------------------------------------------------------------------ */
/*  POST /calm-checks/targets/remove                                   */
/*  管理者用: 対象利用者を非アクティブ化                                    */
/* ------------------------------------------------------------------ */
async function handleRemoveCalmCheckTarget(req, res) {
    const targetId = str(req.body?.id);
    const adminEmail = str(req.body?.admin_email);
    if (adminEmail.toLowerCase() !== "admin@village-support.jp") {
        res.status(403).json({ ok: false, message: "admin only" });
        return;
    }
    if (!targetId) {
        res.status(400).json({ ok: false, message: "id is required" });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { error } = await supabase
            .from("calm_check_targets")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", targetId);
        if (error)
            throw error;
        res.status(200).json({ ok: true, id: targetId, removed: true });
    }
    catch (err) {
        console.error("[calm-checks/targets] remove error:", err);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
