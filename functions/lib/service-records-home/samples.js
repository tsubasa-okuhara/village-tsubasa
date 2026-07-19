"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSamplesHome = handleSamplesHome;
const supabase_1 = require("../lib/supabase");
const noteTimePrefix_1 = require("../lib/noteTimePrefix");
// 同じ利用者・同じ種別の過去記録を最大10件、AI下書き生成の参考例として返す。
// 丸写し用ではなく「書き方のお手本」。当日の実際はオーナーが確定する（設計メモ 2026-07-17）。
const FETCH_LIMIT = 50; // 直近この件数を取得し、JS 側でシャッフルして最大 10 件返す
const SAMPLE_SIZE = 10;
function getQueryValue(value) {
    if (Array.isArray(value))
        return String(value[0] ?? "").trim();
    return String(value ?? "").trim();
}
// Fisher-Yates。元配列は破壊しない。
function shuffle(items) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
async function handleSamplesHome(req, res) {
    const userName = getQueryValue(req.query.user_name);
    const task = getQueryValue(req.query.task);
    if (!userName) {
        res.status(400).json({ ok: false, message: "user_name is required" });
        return;
    }
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        let query = supabase
            .from("service_notes_home")
            .select("service_date, task, final_note")
            .eq("user_name", userName)
            .not("final_note", "is", null)
            .neq("final_note", "")
            .order("service_date", { ascending: false })
            .limit(FETCH_LIMIT);
        // 居宅は統一済み3種別（身体介護 / 家事援助 / 通院等介助）で絞る
        if (task) {
            query = query.eq("task", task);
        }
        const { data, error } = await query;
        if (error)
            throw error;
        const samples = (data ?? [])
            .map((row) => ({
            service_date: row.service_date ?? "",
            task: row.task ?? "",
            note: (0, noteTimePrefix_1.stripNoteTimePrefix)(row.final_note ?? ""),
        }))
            .filter((sample) => sample.note !== "");
        res.status(200).json({ ok: true, samples: shuffle(samples).slice(0, SAMPLE_SIZE) });
    }
    catch (error) {
        console.error("[service-records-home/samples] error:", error);
        res.status(500).json({ ok: false, message: "internal error" });
    }
}
