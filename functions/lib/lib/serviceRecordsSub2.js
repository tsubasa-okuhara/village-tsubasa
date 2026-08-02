"use strict";
/**
 * sub2 のサービス記録テーブル（service_records_home / service_records_move）への
 * アクセスを集約するモジュール。
 *
 * 【旧DB との最大の違い: アプリは INSERT ではなく UPDATE する】
 *   旧DB: アプリが service_notes_* に INSERT し、
 *         home_schedule_tasks / schedule_tasks_move の status を written に更新していた。
 *   sub2: GAS（独立プロジェクト「サービス記録転送 sub2」）が record_uuid を発行して
 *         **本文が空の行を先に作る**。アプリは record_uuid でその行を UPDATE する。
 *
 * 【未記入の定義】
 *   status 列は無い。本文（居宅 final_note / 移動 summary_text）が
 *   NULL または空文字なら未記入。isBlankBody() を必ず通すこと。
 *
 * 【日付境界】
 *   新しい定数は作らない。判定は scheduleSource.ts の isSub2Date() に相乗りする。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVICE_RECORDS_MOVE_TABLE = exports.SERVICE_RECORDS_HOME_TABLE = void 0;
exports.isBlankBody = isBlankBody;
exports.fetchSub2UnwrittenHomeRecords = fetchSub2UnwrittenHomeRecords;
exports.fetchSub2UnwrittenMoveRecords = fetchSub2UnwrittenMoveRecords;
exports.saveSub2HomeRecord = saveSub2HomeRecord;
exports.saveSub2MoveRecord = saveSub2MoveRecord;
exports.fetchSub2LatestWrittenHome = fetchSub2LatestWrittenHome;
exports.fetchSub2LatestWrittenMove = fetchSub2LatestWrittenMove;
exports.fetchSub2HomeSamples = fetchSub2HomeSamples;
exports.fetchSub2MoveSamples = fetchSub2MoveSamples;
exports.toUnwrittenHomeItem = toUnwrittenHomeItem;
exports.toUnwrittenMoveItem = toUnwrittenMoveItem;
const scheduleSource_1 = require("./scheduleSource");
const supabase_1 = require("./supabase");
exports.SERVICE_RECORDS_HOME_TABLE = "service_records_home";
exports.SERVICE_RECORDS_MOVE_TABLE = "service_records_move";
/**
 * PostgREST の既定上限。超えると黙って切れるので検知だけする
 * （scheduleSource.ts の SUB2_ROW_LIMIT と同じ考え方）。
 */
const SUB2_ROW_LIMIT = 1000;
const HOME_COLUMNS = "record_uuid, service_date, start_time, end_time, helper_name, user_name, " +
    "helper_email, recipient_number, task, memo, final_note, " +
    "condition, special_notes_type, special_notes_detail, created_at, updated_at";
const MOVE_COLUMNS = "record_uuid, service_date, start_time, end_time, helper_name, user_name, " +
    "helper_email, recipient_number, task, haisha, transport, notes, summary_text, " +
    "condition, special_notes_type, special_notes_detail, created_at, updated_at";
/**
 * 本文が未記入か。NULL と空文字と空白のみを同じ「未記入」として扱う。
 *
 * GAS が作る行の本文が NULL なのか空文字なのかは転送側の実装次第なので、
 * どちらでも未記入と判定できるようにしてある。
 * この判定を各所に散らすと必ずズレるので、必ずこの関数を通すこと。
 */
function isBlankBody(value) {
    return String(value ?? "").trim() === "";
}
function warnIfTruncated(rows, label) {
    if (rows.length >= SUB2_ROW_LIMIT) {
        console.error(`[${label}] sub2 の取得が上限 ${SUB2_ROW_LIMIT} 件に達しました。件数が切れている可能性があります`);
    }
}
// ========== 1. 未記入一覧 ==========
/**
 * 未記入の居宅記録。helper_email は ilike（大文字小文字無視。RULES.md ルール7）。
 *
 * 未記入の絞り込みは PostgREST の or() ではなく JS 側で行う。
 * 「NULL または空文字」を or() で書くと空文字の表現が読み手に伝わりにくく、
 * 取りこぼしても件数が減るだけで気付けないため（1日30件規模なので全件取って問題ない）。
 */
async function fetchSub2UnwrittenHomeRecords(helperEmail, fromDate) {
    const supabase = (0, supabase_1.getSupabaseSub2Client)();
    let query = supabase
        .from(exports.SERVICE_RECORDS_HOME_TABLE)
        .select(HOME_COLUMNS)
        .gte("service_date", fromDate)
        .order("service_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true })
        .order("helper_name", { ascending: true });
    if (helperEmail) {
        query = query.ilike("helper_email", helperEmail);
    }
    const { data, error } = await query;
    if (error) {
        throw error;
    }
    const rows = (data ?? []);
    warnIfTruncated(rows, "service-records-home/unwritten");
    return rows.filter((row) => isBlankBody(row.final_note));
}
/** 未記入の移動記録。居宅版と同じ方針（本文は summary_text） */
async function fetchSub2UnwrittenMoveRecords(helperEmail, fromDate) {
    const supabase = (0, supabase_1.getSupabaseSub2Client)();
    let query = supabase
        .from(exports.SERVICE_RECORDS_MOVE_TABLE)
        .select(MOVE_COLUMNS)
        .gte("service_date", fromDate)
        .order("service_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true })
        .order("helper_name", { ascending: true });
    if (helperEmail) {
        query = query.ilike("helper_email", helperEmail);
    }
    const { data, error } = await query;
    if (error) {
        throw error;
    }
    const rows = (data ?? []);
    warnIfTruncated(rows, "service-records-move/unwritten");
    return rows.filter((row) => isBlankBody(row.summary_text));
}
/**
 * record_uuid の行を UPDATE する。
 *
 * 旧DB 経路にあった「status=unwritten を条件にした条件付き UPDATE + ロールバック」は
 * 引き継がない。あれは INSERT の二重実行で記録が2件できるのを防ぐ仕掛けで、
 * record_uuid 指定の UPDATE は**何度実行しても同じ結果になる**ため不要になった。
 * 二重保存（既に本文がある行への上書き）だけは事前 SELECT で弾く。
 *
 * supabase 引数はテストから偽クライアントを差し込むためのもの。
 * 既定値は呼び出し時に評価されるので、本番の挙動は引数なしのときと変わらない。
 */
async function updateSub2Record(table, bodyColumn, recordUuid, payload, supabase = (0, supabase_1.getSupabaseSub2Client)()) {
    const { data: existing, error: selectError } = await supabase
        .from(table)
        .select(`record_uuid, ${bodyColumn}`)
        .eq("record_uuid", recordUuid)
        .maybeSingle();
    if (selectError) {
        throw selectError;
    }
    if (!existing) {
        return { status: "not_found" };
    }
    const currentBody = existing[bodyColumn];
    if (!isBlankBody(currentBody)) {
        return { status: "already_written" };
    }
    const { error: updateError } = await supabase
        .from(table)
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("record_uuid", recordUuid);
    if (updateError) {
        throw updateError;
    }
    return { status: "updated" };
}
function saveSub2HomeRecord(recordUuid, payload, supabase) {
    return updateSub2Record(exports.SERVICE_RECORDS_HOME_TABLE, "final_note", recordUuid, payload, supabase ?? (0, supabase_1.getSupabaseSub2Client)());
}
function saveSub2MoveRecord(recordUuid, payload, supabase) {
    return updateSub2Record(exports.SERVICE_RECORDS_MOVE_TABLE, "summary_text", recordUuid, payload, supabase ?? (0, supabase_1.getSupabaseSub2Client)());
}
// ========== 3. 過去記録（previous / samples） ==========
/**
 * 同じ利用者の直近の記入済み記録を1件。
 * sub2 には 2026-08 以降しか無いので、呼び出し側で旧DB の結果とマージすること。
 */
async function fetchSub2LatestWrittenHome(userName, before) {
    const supabase = (0, supabase_1.getSupabaseSub2Client)();
    let query = supabase
        .from(exports.SERVICE_RECORDS_HOME_TABLE)
        .select(HOME_COLUMNS)
        .eq("user_name", userName)
        .not("final_note", "is", null)
        .neq("final_note", "")
        .order("service_date", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1);
    if (before) {
        query = query.lt("service_date", before);
    }
    const { data, error } = await query;
    if (error) {
        throw error;
    }
    return ((data ?? [])[0] ?? null);
}
/** 移動版。本文は summary_text */
async function fetchSub2LatestWrittenMove(userName, before) {
    const supabase = (0, supabase_1.getSupabaseSub2Client)();
    let query = supabase
        .from(exports.SERVICE_RECORDS_MOVE_TABLE)
        .select(MOVE_COLUMNS)
        .eq("user_name", userName)
        .not("summary_text", "is", null)
        .neq("summary_text", "")
        .order("service_date", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1);
    if (before) {
        query = query.lt("service_date", before);
    }
    const { data, error } = await query;
    if (error) {
        throw error;
    }
    return ((data ?? [])[0] ?? null);
}
/** AI 下書きの参考例。居宅は task（統一済み3種別）で絞れる */
async function fetchSub2HomeSamples(userName, task, limit) {
    const supabase = (0, supabase_1.getSupabaseSub2Client)();
    let query = supabase
        .from(exports.SERVICE_RECORDS_HOME_TABLE)
        .select("service_date, task, final_note")
        .eq("user_name", userName)
        .not("final_note", "is", null)
        .neq("final_note", "")
        .order("service_date", { ascending: false })
        .limit(limit);
    if (task) {
        query = query.eq("task", task);
    }
    const { data, error } = await query;
    if (error) {
        throw error;
    }
    return (data ?? []).map((row) => ({
        service_date: row.service_date ?? null,
        task: row.task ?? null,
        body: row.final_note ?? null,
    }));
}
/** 移動版。task は目的地で表記ゆれが激しいため絞らない（samples.ts の設計メモ参照） */
async function fetchSub2MoveSamples(userName, limit) {
    const supabase = (0, supabase_1.getSupabaseSub2Client)();
    const { data, error } = await supabase
        .from(exports.SERVICE_RECORDS_MOVE_TABLE)
        .select("service_date, task, summary_text")
        .eq("user_name", userName)
        .not("summary_text", "is", null)
        .neq("summary_text", "")
        .order("service_date", { ascending: false })
        .limit(limit);
    if (error) {
        throw error;
    }
    return (data ?? []).map((row) => ({
        service_date: row.service_date ?? null,
        task: row.task ?? null,
        body: row.summary_text ?? null,
    }));
}
function toUnwrittenHomeItem(row) {
    return {
        id: row.record_uuid,
        schedule_id: null,
        service_date: row.service_date ?? "",
        helper_name: row.helper_name ?? "",
        helper_email: row.helper_email,
        user_name: row.user_name ?? "",
        // time 型は "10:00:00" で返るので旧APIの "10:00" 形式に揃える
        start_time: (0, scheduleSource_1.formatClockTime)(row.start_time),
        end_time: (0, scheduleSource_1.formatClockTime)(row.end_time),
        task: row.task,
        summary: row.task,
        beneficiary_number: row.recipient_number,
        status: "unwritten",
    };
}
function toUnwrittenMoveItem(row) {
    return {
        taskId: row.record_uuid,
        helperEmail: row.helper_email ?? "",
        serviceDate: row.service_date ?? "",
        // time 型は "10:00:00" で返るので旧APIの "10:00" 形式に揃える
        startTime: (0, scheduleSource_1.formatClockTime)(row.start_time) ?? "",
        endTime: (0, scheduleSource_1.formatClockTime)(row.end_time) ?? "",
        userName: row.user_name ?? "",
        helperName: row.helper_name ?? "",
        task: row.task ?? "",
        haisha: row.haisha ?? "",
        // 居宅と同じ理由で task を入れる（null だと一覧で訪問を判別できない）
        summary: row.task ?? "",
        summaryText: row.summary_text ?? "",
        beneficiaryNumber: row.recipient_number ?? "",
        raw: row,
    };
}
