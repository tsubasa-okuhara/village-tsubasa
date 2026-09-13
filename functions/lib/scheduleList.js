"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseYearMonthParams = parseYearMonthParams;
exports.getMonthRange = getMonthRange;
exports.fetchScheduleEntriesRange = fetchScheduleEntriesRange;
exports.fetchScheduleListSub2 = fetchScheduleListSub2;
exports.splitMonthByToday = splitMonthByToday;
exports.fetchScheduleListMerged = fetchScheduleListMerged;
exports.compareByDateThenStartTime = compareByDateThenStartTime;
exports.fetchScheduleList = fetchScheduleList;
exports.handleScheduleList = handleScheduleList;
const helperCheckSource_1 = require("./lib/helperCheckSource");
const scheduleSource_1 = require("./lib/scheduleSource");
const supabase_1 = require("./lib/supabase");
// 「今日」の算出は既存実装を流用する。Cloud Functions は UTC なので、
// 素朴に new Date() から作ると JST 0〜9時のあいだだけ1日ずれる。
// 同じ処理を書き足すと片方だけ直す事故が起きるため、必ずこれを使うこと。
const todaySchedule_1 = require("./todaySchedule");
function parseYearMonthParams(req) {
    const yearValue = Array.isArray(req.query.year) ? req.query.year[0] : req.query.year;
    const monthValue = Array.isArray(req.query.month) ? req.query.month[0] : req.query.month;
    const year = Number(yearValue);
    const month = Number(monthValue);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return null;
    }
    return { year, month };
}
/** その月の [開始日, 翌月1日) を返す。境界計算をここ1箇所に集約する */
function getMonthRange(year, month) {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonthDate = new Date(year, month, 1);
    const endDate = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
    return { startDate, endDate };
}
/**
 * schedule_entries を日付範囲で取得する（開始日を含み、終了日を含まない）。
 *
 * 2026-09-07 に fetchScheduleListSub2 の中身をここへ出した。
 * 控えとの合成では月単位ではなく日単位で区切る必要があるため
 * （今日が 9/30 なら明日は 10/1 で別月になる）。
 * 絞り込み条件は従来と1つも変えていない。
 */
async function fetchScheduleEntriesRange(startDate, endDate) {
    if (startDate >= endDate) {
        return [];
    }
    const supabase = (0, supabase_1.getSupabaseSub2Client)();
    const pageSize = 1000;
    const rows = [];
    for (let offset = 0;; offset += pageSize) {
        const { data, error } = await supabase
            .from("schedule_entries")
            .select("id, date, helper_name, user_name, start_time, end_time, transport, support_flow, helper_note, updated_at")
            .eq("is_published", true)
            .is("cancelled_at", null)
            .not("helper_name", "is", null)
            .neq("helper_name", "")
            .gte("date", startDate)
            .lt("date", endDate)
            .order("date", { ascending: true })
            .order("start_time", { ascending: true })
            .range(offset, offset + pageSize - 1);
        if (error) {
            throw error;
        }
        const pageRows = (data ?? []);
        rows.push(...pageRows);
        if (pageRows.length < pageSize) {
            break;
        }
    }
    return rows.map(function (row) {
        return {
            id: row.id,
            date: row.date,
            helperName: row.helper_name,
            userName: row.user_name,
            // sub2 の time 型は "09:40:00" で返るので旧DBと同じ "HH:MM" に揃える。
            // 旧DB経路は既に "HH:MM" で、かつ end_time に "16:00以降" のような
            // 自由記述が混ざっているため通さない（通すと "16:00" に化けて情報が消える）
            startTime: (0, scheduleSource_1.formatClockTime)(row.start_time),
            endTime: (0, scheduleSource_1.formatClockTime)(row.end_time),
            haisha: row.transport,
            task: row.support_flow,
            summary: row.helper_note,
            updatedAt: row.updated_at,
        };
    });
}
/** 月単位で schedule_entries を取得する。既存の呼び出し互換のために残している */
async function fetchScheduleListSub2(year, month) {
    const { startDate, endDate } = getMonthRange(year, month);
    return fetchScheduleEntriesRange(startDate, endDate);
}
/**
 * 月の範囲を「今日」で2つに割る。
 *
 *   [startDate, confirmedTo)  → 控え（確定版）
 *   [liveFrom,  endDate)      → schedule_entries（ライブ）
 *
 * 今日は必ずライブ側に入る。境界は日単位で、月単位では判定しない
 * （今日が 9/30 なら明日は 10/1 で別月になる）。
 *
 * 過去の月は全部が確定版、未来の月は全部がライブ、今月だけが両方になる。
 * I/O を含まないのでテストで固定できる（scheduleList.test.ts）。
 */
function splitMonthByToday(startDate, endDate, today) {
    const liveFrom = today > startDate ? today : startDate;
    const confirmedTo = today < endDate ? today : endDate;
    return {
        liveFrom: liveFrom,
        confirmedTo: confirmedTo,
        hasConfirmedRange: startDate < confirmedTo,
        hasLiveRange: liveFrom < endDate,
    };
}
/**
 * ライブ（schedule_entries）と確定版（helper_check_entries）を1つの月に合成する。
 *
 * 【役割分担】2026-09-07 決定
 *   今日以降     → schedule_entries      伊藤さん・ライブ。未来は1か月先まで保持されている
 *   今日より過去 → helper_check_entries  控え・精査済み。週次でまとめて同期
 *
 * 【日付で完全に分割する。マージはしない】
 *   ある日付は必ずどちらか一方だけが担当する。同じ日付の行を突き合わせない。
 *   控えは (date, user_name, start_time) が一意にならないため slot_no を持つが
 *   （2026-08 実測で衝突グループ298・衝突行610）、schedule_entries に slot_no は無い。
 *   2つのテーブルの行を対応づける信頼できるキーが存在しないので、混ぜると
 *   二重表示か取りこぼしのどちらかが必ず起きる。
 */
async function fetchScheduleListMerged(year, month) {
    const { startDate, endDate } = getMonthRange(year, month);
    const split = splitMonthByToday(startDate, endDate, (0, todaySchedule_1.getTodayDateJst)());
    const { liveFrom, confirmedTo, hasConfirmedRange, hasLiveRange } = split;
    const [confirmedThrough, confirmedItems, liveItems] = await Promise.all([
        (0, helperCheckSource_1.fetchConfirmedThrough)(),
        hasConfirmedRange
            ? (0, helperCheckSource_1.fetchConfirmedScheduleRange)(startDate, confirmedTo)
            : Promise.resolve([]),
        hasLiveRange ? fetchScheduleEntriesRange(liveFrom, endDate) : Promise.resolve([]),
    ]);
    // 「0件」の意味を切り分ける。
    // 控えは週次〜月次でまとめて同期する運用なので、月内0件は正常にあり得る。
    // 一方 RLS やキーの問題で読めていないときも、エラーではなく空配列が返る。
    // 件数だけでは区別できないので、テーブル全体の有無で判定する。
    if (hasConfirmedRange && confirmedItems.length === 0) {
        if (confirmedThrough === null) {
            console.error("[schedule-list] helper_check_entries が全期間で0件です。" +
                "RLS またはキーで読めていない可能性があります（RLS は空配列を返すためエラーになりません）。");
        }
        else {
            console.info(`[schedule-list] ${startDate}〜${confirmedTo} は控えに未反映（精査前）。` +
                `confirmedThrough=${confirmedThrough}`);
        }
    }
    // 「今日以降は schedule_entries に1か月先まで入っている」という前提が崩れた合図
    if (hasLiveRange && liveItems.length === 0) {
        console.warn(`[schedule-list] ${liveFrom}〜${endDate} の schedule_entries が0件です。` +
            "保持範囲の前提が変わった可能性があります。");
    }
    const items = confirmedItems
        .map(function (item) {
        return { ...item, source: "confirmed" };
    })
        .concat(liveItems.map(function (item) {
        return { ...item, source: "live" };
    }))
        .sort(compareByDateThenStartTime);
    return { items: items, confirmedThrough: confirmedThrough };
}
/** 日付昇順 → 開始時刻昇順。時刻が無い行は同じ日付の末尾へ置く */
function compareByDateThenStartTime(a, b) {
    if (a.date !== b.date) {
        return a.date < b.date ? -1 : 1;
    }
    const at = a.startTime ?? "99:99";
    const bt = b.startTime ?? "99:99";
    if (at === bt) {
        return 0;
    }
    return at < bt ? -1 : 1;
}
async function fetchScheduleList(year, month) {
    // データ境界の判定は lib/scheduleSource.ts に集約している（定数の二重持ち禁止）。
    // 2026年7月以前 = 旧DB(schedule_web_v) / 2026年8月以降 = sub2(schedule_entries)。
    //
    // ⚠️ 旧DB 経路はこの分岐ごと従来のまま。1行も変えていない。
    //    運用対象は 2026-08 以降だが、旧DB クライアントは他に40ファイルが使っており
    //    ここを消しても何も削減できず、7月以前が画面から見えなくなるだけのため。
    if ((0, scheduleSource_1.isSub2YearMonth)(year, month)) {
        const merged = await fetchScheduleListMerged(year, month);
        return merged.items;
    }
    const supabase = (0, supabase_1.getSupabaseClient)();
    const pageSize = 1000;
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonthDate = new Date(year, month, 1);
    const endDate = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
    const rows = [];
    for (let offset = 0;; offset += pageSize) {
        const { data, error } = await supabase
            .from("schedule_web_v")
            .select("id, date, name, client, start_time, end_time, haisha, task, summary, updated_at")
            .gte("date", startDate)
            .lt("date", endDate)
            .order("date", { ascending: true })
            .order("start_time", { ascending: true })
            .range(offset, offset + pageSize - 1);
        if (error) {
            throw error;
        }
        const pageRows = (data ?? []);
        rows.push(...pageRows);
        if (pageRows.length < pageSize) {
            break;
        }
    }
    return rows.map(function (row) {
        return {
            id: row.id,
            date: row.date,
            helperName: row.name,
            userName: row.client,
            startTime: row.start_time,
            endTime: row.end_time,
            haisha: row.haisha,
            task: row.task,
            summary: row.summary,
            updatedAt: row.updated_at,
        };
    });
}
async function handleScheduleList(req, res) {
    const parsed = parseYearMonthParams(req);
    if (!parsed) {
        res.status(400).json({
            ok: false,
            message: "invalid year or month",
        });
        return;
    }
    try {
        // 旧DB 経路（2026-07 以前）は控えの対象外なので confirmedThrough を持たない
        if (!(0, scheduleSource_1.isSub2YearMonth)(parsed.year, parsed.month)) {
            const items = await fetchScheduleList(parsed.year, parsed.month);
            res.status(200).json({
                ok: true,
                year: parsed.year,
                month: parsed.month,
                items: items,
            });
            return;
        }
        const merged = await fetchScheduleListMerged(parsed.year, parsed.month);
        res.status(200).json({
            ok: true,
            year: parsed.year,
            month: parsed.month,
            items: merged.items,
            confirmedThrough: merged.confirmedThrough,
        });
    }
    catch (error) {
        console.error("[schedule-list] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
