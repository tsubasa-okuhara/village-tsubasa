"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleNextHelperSchedule = handleNextHelperSchedule;
const scheduleSource_1 = require("./lib/scheduleSource");
const supabase_1 = require("./lib/supabase");
const helperSummary_1 = require("./helperSummary");
function getCurrentJstTime() {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(new Date());
}
function mapScheduleRow(row) {
    return {
        id: row.id,
        date: row.date,
        helperName: row.name,
        helperEmail: row.helper_email,
        userName: row.client,
        startTime: row.start_time,
        endTime: row.end_time,
        task: row.task,
    };
}
/**
 * sub2 の予定 → レスポンス形状。
 * helperEmail は schedule_entries に無いので、検索に使ったメールをそのまま返す。
 * task は support_flow、時刻は "HH:MM" に整形（ゼロ詰め維持）。
 */
function mapSub2Row(row, helperEmail) {
    return {
        id: row.id,
        date: row.date,
        helperName: row.helper_name,
        helperEmail,
        userName: row.user_name,
        startTime: (0, scheduleSource_1.formatClockTime)(row.start_time),
        endTime: (0, scheduleSource_1.formatClockTime)(row.end_time),
        task: row.support_flow,
    };
}
async function fetchUpcomingScheduleOnDate(helperEmail, date, currentTime) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    const { data, error } = await supabase
        .from("schedule_web_v")
        .select("id, date, name, helper_email, client, start_time, end_time, task")
        .ilike("helper_email", helperEmail)
        .eq("date", date)
        .gte("start_time", currentTime)
        .order("start_time", { ascending: true })
        .limit(1);
    if (error) {
        throw error;
    }
    const row = ((data ?? [])[0] ?? null);
    return row ? mapScheduleRow(row) : null;
}
async function fetchFutureSchedule(helperEmail, date) {
    const supabase = (0, supabase_1.getSupabaseClient)();
    const { data, error } = await supabase
        .from("schedule_web_v")
        .select("id, date, name, helper_email, client, start_time, end_time, task")
        .ilike("helper_email", helperEmail)
        .gt("date", date)
        // 境界以降は sub2 の担当。旧DBに8月以降の行が残っていても拾わない
        .lt("date", (0, scheduleSource_1.getCutoverStartDate)())
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(1);
    if (error) {
        throw error;
    }
    const row = ((data ?? [])[0] ?? null);
    return row ? mapScheduleRow(row) : null;
}
async function handleNextHelperSchedule(req, res) {
    const helperEmailValue = Array.isArray(req.query.helper_email)
        ? req.query.helper_email[0]
        : req.query.helper_email;
    const helperEmail = String(helperEmailValue ?? "").trim();
    if (helperEmail === "") {
        res.status(400).json({
            ok: false,
            message: "helper_email is required",
        });
        return;
    }
    try {
        const targetDate = (0, helperSummary_1.getDateJstByOffset)(0);
        const currentTime = getCurrentJstTime();
        // 「今日」と「その先」でデータソースが変わりうる（境界跨ぎ）。
        // 今日が境界以降なら全部 sub2、今日が境界より前なら
        // 今日〜7/31 は旧DB → 見つからなければ 8/1 以降を sub2 で探す。
        if ((0, scheduleSource_1.isSub2Date)(targetDate)) {
            const helperNames = await (0, scheduleSource_1.fetchSub2HelperNamesByEmail)(helperEmail);
            if (helperNames.length === 0) {
                console.warn(`[next-helper-schedule] sub2 の helper にこのメールの登録がありません: ${helperEmail}`);
                res.status(200).json({ ok: true, helperEmail, item: null });
                return;
            }
            const todayRow = await (0, scheduleSource_1.fetchSub2NextEntryOnDate)(helperNames, targetDate, currentTime);
            if (todayRow) {
                res.status(200).json({
                    ok: true,
                    helperEmail,
                    item: mapSub2Row(todayRow, helperEmail),
                });
                return;
            }
            const futureRow = await (0, scheduleSource_1.fetchSub2NextEntryAfterDate)(helperNames, targetDate);
            res.status(200).json({
                ok: true,
                helperEmail,
                item: futureRow ? mapSub2Row(futureRow, helperEmail) : null,
            });
            return;
        }
        const todayItem = await fetchUpcomingScheduleOnDate(helperEmail, targetDate, currentTime);
        if (todayItem) {
            res.status(200).json({
                ok: true,
                helperEmail,
                item: todayItem,
            });
            return;
        }
        const futureItem = await fetchFutureSchedule(helperEmail, targetDate);
        if (futureItem) {
            res.status(200).json({
                ok: true,
                helperEmail,
                item: futureItem,
            });
            return;
        }
        // 旧DB側（境界より前）に予定が無いので、境界以降を sub2 で探す
        const helperNames = await (0, scheduleSource_1.fetchSub2HelperNamesByEmail)(helperEmail);
        const sub2Row = await (0, scheduleSource_1.fetchSub2NextEntryAfterDate)(helperNames, targetDate);
        res.status(200).json({
            ok: true,
            helperEmail,
            item: sub2Row ? mapSub2Row(sub2Row, helperEmail) : null,
        });
    }
    catch (error) {
        console.error("[next-helper-schedule] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
