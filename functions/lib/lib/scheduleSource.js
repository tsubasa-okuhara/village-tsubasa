"use strict";
/**
 * スケジュールのデータソース境界（旧DB / sub2）を集約するモジュール。
 *
 * これは一時的な移行処理ではなく恒久的なデータ境界。
 *   2026年7月以前 = 旧DB (schedule_web_v / schedule)
 *   2026年8月以降 = sub2 (schedule_entries)
 * 過去データ参照のため、この境界を削除すると7月以前が表示されなくなる。
 *
 * 境界の定数を各所に散らすと必ずズレるので、判定は必ずこのファイルの関数を使うこと。
 *
 * sub2 の schedule_entries には helper_email 列が無い。ヘルパーの特定は
 *   email → helper.helper_name → schedule_entries.helper_name
 * の2段引きになる。突合は必ず「完全一致」で行う（部分一致にすると
 * 「木野」が「木野(真)」「木野(遙)」を巻き込む）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSub2YearMonth = isSub2YearMonth;
exports.isSub2Date = isSub2Date;
exports.getCutoverStartDate = getCutoverStartDate;
exports.formatClockTime = formatClockTime;
exports.fetchSub2Helpers = fetchSub2Helpers;
exports.findSub2HelperNames = findSub2HelperNames;
exports.buildSub2EmailByHelperName = buildSub2EmailByHelperName;
exports.fetchSub2HelperNamesByEmail = fetchSub2HelperNamesByEmail;
exports.fetchSub2EntriesByDate = fetchSub2EntriesByDate;
exports.toScheduleItemFromSub2 = toScheduleItemFromSub2;
exports.buildSub2CoHelpers = buildSub2CoHelpers;
exports.fetchSub2ScheduleByHelperEmail = fetchSub2ScheduleByHelperEmail;
exports.fetchSub2ScheduleAllByDate = fetchSub2ScheduleAllByDate;
exports.fetchSub2SummaryRowsByDate = fetchSub2SummaryRowsByDate;
exports.fetchSub2NextEntryOnDate = fetchSub2NextEntryOnDate;
exports.fetchSub2NextEntryAfterDate = fetchSub2NextEntryAfterDate;
const supabase_1 = require("./supabase");
// ========== 1. データ境界の判定 ==========
/**
 * 環境変数は呼び出しごとに読む。モジュール初期化時に固定すると
 * コールドスタート時の値に貼り付き、設定変更やテストでの上書きが効かなくなる。
 */
function getCutoverYearMonth() {
    return {
        year: Number(process.env.CUTOVER_YEAR ?? 2026),
        month: Number(process.env.CUTOVER_MONTH ?? 8),
    };
}
/** その年月が sub2 の担当か（月単位。境界は既定で 2026-08） */
function isSub2YearMonth(year, month) {
    const cutover = getCutoverYearMonth();
    return year > cutover.year || (year === cutover.year && month >= cutover.month);
}
/** "YYYY-MM-DD" が sub2 の担当か。形式不正は旧DB側に倒す（現行挙動を変えない） */
function isSub2Date(date) {
    const matched = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(date ?? "").trim());
    if (!matched)
        return false;
    return isSub2YearMonth(Number(matched[1]), Number(matched[2]));
}
/** sub2 が担当する最初の日（既定 "2026-08-01"）。境界を跨ぐ検索の範囲指定に使う */
function getCutoverStartDate() {
    const { year, month } = getCutoverYearMonth();
    return `${year}-${String(month).padStart(2, "0")}-01`;
}
/**
 * "10:00:00" / "10:00" → "10:00"。**ゼロ詰めは維持する**（"09:00" を "9:00" にしない）。
 *
 * sub2 の start_time / end_time は time 型で "10:00:00" と返るため、
 * 旧APIの "10:00" 形式に合わせるのに使う。
 * delayNotify.ts の formatTime() は LINE 文面用にゼロ詰めを落とす別物なので流用しない。
 */
function formatClockTime(raw) {
    if (raw === null || raw === undefined)
        return null;
    const matched = /^(\d{1,2}):(\d{2})/.exec(String(raw).trim());
    if (!matched)
        return null;
    return `${matched[1].padStart(2, "0")}:${matched[2]}`;
}
/** sub2 の helper マスタ（35行規模）。件数が小さいので全件取ってアプリ側で突合する */
async function fetchSub2Helpers() {
    const supabase = (0, supabase_1.getSupabaseSub2Client)();
    const { data, error } = await supabase.from("helper").select("helper_name, email");
    if (error) {
        throw error;
    }
    return (data ?? []);
}
/**
 * 比較用の正規化。前後空白を落として小文字化する。
 * 旧DBは helper_master 側の btrim 漏れが不具合の温床だったので、同じ穴を開けない。
 */
function normalizeForMatch(value) {
    return String(value ?? "").trim().toLowerCase();
}
/**
 * メール → helper_name（完全一致のみ）。
 * email は nullable なので、空の行は突合対象から外す。
 * 同一メールに複数行あってもよいよう配列で返す（改名・旧姓を拾うため）。
 */
function findSub2HelperNames(helpers, helperEmail) {
    const target = normalizeForMatch(helperEmail);
    if (target === "") {
        return [];
    }
    const names = [];
    for (const helper of helpers) {
        const email = normalizeForMatch(helper.email);
        if (email === "" || email !== target)
            continue;
        const name = String(helper.helper_name ?? "").trim();
        if (name !== "" && !names.includes(name)) {
            names.push(name);
        }
    }
    return names;
}
/** helper_name → email。キーは完全一致で引く前提（表示・リンク用に trim した生値を返す） */
function buildSub2EmailByHelperName(helpers) {
    const map = new Map();
    for (const helper of helpers) {
        const name = String(helper.helper_name ?? "").trim();
        const email = String(helper.email ?? "").trim();
        if (name === "" || email === "")
            continue;
        if (!map.has(name)) {
            map.set(name, email);
        }
    }
    return map;
}
/** メールから helper_name を引く（helper マスタの取得込み） */
async function fetchSub2HelperNamesByEmail(helperEmail) {
    return findSub2HelperNames(await fetchSub2Helpers(), helperEmail);
}
const SUB2_ENTRY_COLUMNS = "id, date, helper_name, user_name, start_time, end_time, transport, support_flow, helper_note";
/** PostgREST の既定上限。超えると黙って切れるので検知だけする */
const SUB2_ROW_LIMIT = 1000;
/**
 * 指定日の予定を全件取得する（合同シフト判定のため本人以外も含む）。
 * 絞り込み条件は scheduleList.ts の月次一覧と必ず揃えること
 * （食い違うと「月次には出るのに当日には出ない」予定が生まれる）。
 */
async function fetchSub2EntriesByDate(date) {
    const supabase = (0, supabase_1.getSupabaseSub2Client)();
    const { data, error } = await supabase
        .from("schedule_entries")
        .select(SUB2_ENTRY_COLUMNS)
        .eq("date", date)
        .eq("is_published", true)
        .is("cancelled_at", null)
        .not("helper_name", "is", null)
        .neq("helper_name", "")
        .order("start_time", { ascending: true });
    if (error) {
        throw error;
    }
    const rows = (data ?? []);
    if (rows.length >= SUB2_ROW_LIMIT) {
        console.error(`[schedule-source] schedule_entries の取得が上限 ${SUB2_ROW_LIMIT} 件に達しました date=${date}。件数が切れている可能性があります`);
    }
    return rows;
}
/**
 * schedule_entries → 既存 API のレスポンス形状。列の対応は
 *   transport    → haisha
 *   support_flow → task
 *   helper_note  → summary
 * summary の出所は 2026-07-26 に helper_note で確定（sub2 に7月データが無く旧DBと
 * 突合できないため。月次一覧 scheduleList.ts も同じ対応なので必ず揃えること）。
 *
 * 時刻は time 型が "10:00:00" で返るので "HH:MM" に整形する（ゼロ詰めは維持）。
 */
function toScheduleItemFromSub2(row) {
    return {
        id: row.id,
        helperName: row.helper_name,
        userName: row.user_name,
        startTime: formatClockTime(row.start_time),
        endTime: formatClockTime(row.end_time),
        haisha: row.transport,
        task: row.support_flow,
        summary: row.helper_note,
    };
}
/**
 * 合同シフト（同じ利用者・同じ開始時刻に入る他ヘルパー）を組み立てる。
 *
 * 旧DB経路と同じ考え方だが、start_time が null の行は突合から除外する。
 * 旧経路は null 同士が一致して誤って合同扱いになるため（sub2 経路のみ改善。
 * 旧経路は表示を変えないので触らない）。
 * ヘルパー名の比較は完全一致で行う。
 */
function buildSub2CoHelpers(row, allRows) {
    if (!row.start_time) {
        return [];
    }
    const myName = String(row.helper_name ?? "").trim();
    const coHelpers = new Set();
    for (const other of allRows) {
        if (other === row)
            continue;
        if (!other.start_time)
            continue;
        if (other.start_time !== row.start_time)
            continue;
        if (other.user_name !== row.user_name)
            continue;
        const otherName = String(other.helper_name ?? "").trim();
        if (otherName === "" || otherName === myName)
            continue;
        coHelpers.add(otherName);
    }
    return Array.from(coHelpers);
}
/**
 * ヘルパー個人の当日予定（合同シフト付き）。
 * メールが helper マスタに無いときは空配列を返す（旧DB経路の「一致0件」と同じ挙動）。
 * ただし黙って消えると気づけないので warn は必ず残す。
 */
async function fetchSub2ScheduleByHelperEmail(helperEmail, date, logLabel) {
    const helperNames = await fetchSub2HelperNamesByEmail(helperEmail);
    if (helperNames.length === 0) {
        console.warn(`[${logLabel}] sub2 の helper にこのメールの登録がありません: ${helperEmail}`);
        return [];
    }
    const allRows = await fetchSub2EntriesByDate(date);
    const nameSet = new Set(helperNames);
    const myRows = allRows.filter(function (row) {
        return nameSet.has(String(row.helper_name ?? "").trim());
    });
    return myRows.map(function (row) {
        return {
            ...toScheduleItemFromSub2(row),
            coHelpers: buildSub2CoHelpers(row, allRows),
        };
    });
}
/** 指定日の全ヘルパー分の予定（全体一覧用） */
async function fetchSub2ScheduleAllByDate(date) {
    const rows = await fetchSub2EntriesByDate(date);
    return rows.map(toScheduleItemFromSub2);
}
/**
 * 日次サマリ・通知用の行。schedule_entries に helper_email が無いので helper マスタで補う。
 *
 * メール未登録のヘルパーは旧DB経路（helper_email が空の行を除外）と同じく落とすが、
 * 落とすと「予定はあるのに一覧にも通知にも出ない」状態になって気づけないため、
 * 対象のヘルパー名を warn に出す。
 */
async function fetchSub2SummaryRowsByDate(date, logLabel) {
    const [helpers, rows] = await Promise.all([
        fetchSub2Helpers(),
        fetchSub2EntriesByDate(date),
    ]);
    const emailByName = buildSub2EmailByHelperName(helpers);
    const missingNames = new Set();
    const summaryRows = [];
    for (const row of rows) {
        const name = String(row.helper_name ?? "").trim();
        const email = name === "" ? "" : (emailByName.get(name) ?? "");
        if (email === "") {
            if (name !== "") {
                missingNames.add(name);
            }
            continue;
        }
        summaryRows.push({
            name: row.helper_name,
            helper_email: email,
            start_time: formatClockTime(row.start_time),
        });
    }
    if (missingNames.size > 0) {
        console.warn(`[${logLabel}] sub2 helper にメール未登録のため除外しました date=${date} helpers=${Array.from(missingNames).join(" / ")}`);
    }
    return summaryRows;
}
/** 指定日の指定時刻以降で、いちばん近い予定を1件 */
async function fetchSub2NextEntryOnDate(helperNames, date, currentTime) {
    if (helperNames.length === 0) {
        return null;
    }
    const supabase = (0, supabase_1.getSupabaseSub2Client)();
    const { data, error } = await supabase
        .from("schedule_entries")
        .select(SUB2_ENTRY_COLUMNS)
        .in("helper_name", helperNames) // 完全一致（ilike は使わない）
        .eq("date", date)
        .eq("is_published", true)
        .is("cancelled_at", null)
        .gte("start_time", currentTime)
        .order("start_time", { ascending: true })
        .limit(1);
    if (error) {
        throw error;
    }
    return ((data ?? [])[0] ?? null);
}
/**
 * 指定日より後で、いちばん近い予定を1件。
 * 境界より前の日付は旧DBの担当なので、sub2 側では拾わない。
 */
async function fetchSub2NextEntryAfterDate(helperNames, afterDate) {
    if (helperNames.length === 0) {
        return null;
    }
    const supabase = (0, supabase_1.getSupabaseSub2Client)();
    const { data, error } = await supabase
        .from("schedule_entries")
        .select(SUB2_ENTRY_COLUMNS)
        .in("helper_name", helperNames) // 完全一致（ilike は使わない）
        .gt("date", afterDate)
        .gte("date", getCutoverStartDate())
        .eq("is_published", true)
        .is("cancelled_at", null)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(1);
    if (error) {
        throw error;
    }
    return ((data ?? [])[0] ?? null);
}
