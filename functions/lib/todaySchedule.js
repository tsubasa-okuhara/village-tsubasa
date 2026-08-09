"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidDateString = isValidDateString;
exports.getTodayDateJst = getTodayDateJst;
exports.fetchTodayScheduleByHelperEmail = fetchTodayScheduleByHelperEmail;
exports.fetchTodayScheduleItems = fetchTodayScheduleItems;
exports.handleTodaySchedule = handleTodaySchedule;
const scheduleSource_1 = require("./lib/scheduleSource");
const supabase_1 = require("./lib/supabase");
/** "YYYY-MM-DD" 形式かつ実在する日付か（2026-02-31 のような値を弾く） */
function isValidDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day);
}
function getTodayDateJst() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    return formatter.format(new Date());
}
async function fetchTodayScheduleByHelperEmail(helperEmail, date) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    // 当日の全レコードを取得（合同シフト判定のため、本人以外も含めて全件）
    const { data, error } = await supabase
        .from("schedule_web_v")
        .select("id, date, name, helper_email, client, start_time, end_time, haisha, task, summary")
        .eq("date", date)
        .order("start_time", { ascending: true });
    if (error) {
        throw error;
    }
    const allRows = (data ?? []);
    const helperEmailLc = helperEmail.toLowerCase();
    // 本人の行（helper_email 一致）を抽出
    const myRows = allRows.filter(function (r) {
        return (r.helper_email ?? "").toLowerCase() === helperEmailLc;
    });
    return myRows.map(function (row) {
        // 同 (client, start_time) で本人以外のヘルパー名を抽出（合同シフト）
        const coHelperSet = new Set();
        for (const other of allRows) {
            if (other === row)
                continue;
            if (other.client !== row.client)
                continue;
            if (other.start_time !== row.start_time)
                continue;
            if (!other.name)
                continue;
            if (other.name === row.name)
                continue;
            coHelperSet.add(other.name);
        }
        return {
            id: row.id,
            helperName: row.name,
            userName: row.client,
            startTime: row.start_time,
            endTime: row.end_time,
            haisha: row.haisha,
            task: row.task,
            summary: row.summary,
            coHelpers: Array.from(coHelperSet),
        };
    });
}
/**
 * 対象日に応じてデータソースを切り替える。
 * 2026年7月以前は旧DB（schedule_web_v）、8月以降は sub2（schedule_entries）。
 * 旧DB経路 fetchTodayScheduleByHelperEmail は一切変更していない。
 */
async function fetchTodayScheduleItems(helperEmail, date) {
    if ((0, scheduleSource_1.isSub2Date)(date)) {
        return (0, scheduleSource_1.fetchSub2ScheduleByHelperEmail)(helperEmail, date, "today-schedule");
    }
    return fetchTodayScheduleByHelperEmail(helperEmail, date);
}
async function handleTodaySchedule(req, res) {
    const helperEmailValue = Array.isArray(req.query.helper_email)
        ? req.query.helper_email[0]
        : req.query.helper_email;
    const helperEmail = typeof helperEmailValue === "string" ? helperEmailValue.trim() : "";
    if (helperEmail === "") {
        res.status(400).json({
            ok: false,
            message: "helper_email is required",
        });
        return;
    }
    // date は任意。未指定なら従来どおり JST の今日を見る（既定の挙動は変えない）
    const dateValue = Array.isArray(req.query.date) ? req.query.date[0] : req.query.date;
    const requestedDate = typeof dateValue === "string" ? dateValue.trim() : "";
    if (requestedDate !== "" && !isValidDateString(requestedDate)) {
        res.status(400).json({
            ok: false,
            message: "invalid date",
        });
        return;
    }
    try {
        const todayDate = requestedDate !== "" ? requestedDate : getTodayDateJst();
        const items = await fetchTodayScheduleItems(helperEmail, todayDate);
        res.status(200).json({
            ok: true,
            date: todayDate,
            helperEmail: helperEmail,
            count: items.length,
            items: items,
        });
    }
    catch (error) {
        console.error("[today-schedule] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
