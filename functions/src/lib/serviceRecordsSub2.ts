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

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatClockTime } from "./scheduleSource";
import { getSupabaseSub2Client } from "./supabase";

export const SERVICE_RECORDS_HOME_TABLE = "service_records_home";
export const SERVICE_RECORDS_MOVE_TABLE = "service_records_move";

/**
 * PostgREST の既定上限。超えると黙って切れるので検知だけする
 * （scheduleSource.ts の SUB2_ROW_LIMIT と同じ考え方）。
 */
const SUB2_ROW_LIMIT = 1000;

const HOME_COLUMNS =
  "record_uuid, service_date, start_time, end_time, helper_name, user_name, " +
  "helper_email, recipient_number, task, memo, final_note, " +
  "condition, special_notes_type, special_notes_detail, created_at, updated_at";

const MOVE_COLUMNS =
  "record_uuid, service_date, start_time, end_time, helper_name, user_name, " +
  "helper_email, recipient_number, task, haisha, transport, notes, summary_text, " +
  "condition, special_notes_type, special_notes_detail, created_at, updated_at";

export interface Sub2HomeRecordRow {
  record_uuid: string;
  service_date: string | null;
  start_time: string | null;
  end_time: string | null;
  helper_name: string | null;
  user_name: string | null;
  helper_email: string | null;
  recipient_number: string | null;
  task: string | null;
  memo: string | null;
  final_note: string | null;
  condition: string | null;
  special_notes_type: string | null;
  special_notes_detail: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Sub2MoveRecordRow {
  record_uuid: string;
  service_date: string | null;
  start_time: string | null;
  end_time: string | null;
  helper_name: string | null;
  user_name: string | null;
  helper_email: string | null;
  recipient_number: string | null;
  task: string | null;
  haisha: string | null;
  transport: string[] | null;
  notes: string | null;
  summary_text: string | null;
  condition: string | null;
  special_notes_type: string | null;
  special_notes_detail: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * 本文が未記入か。NULL と空文字と空白のみを同じ「未記入」として扱う。
 *
 * GAS が作る行の本文が NULL なのか空文字なのかは転送側の実装次第なので、
 * どちらでも未記入と判定できるようにしてある。
 * この判定を各所に散らすと必ずズレるので、必ずこの関数を通すこと。
 */
export function isBlankBody(value: string | null | undefined): boolean {
  return String(value ?? "").trim() === "";
}

function warnIfTruncated(rows: unknown[], label: string): void {
  if (rows.length >= SUB2_ROW_LIMIT) {
    console.error(
      `[${label}] sub2 の取得が上限 ${SUB2_ROW_LIMIT} 件に達しました。件数が切れている可能性があります`,
    );
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
export async function fetchSub2UnwrittenHomeRecords(
  helperEmail: string | null,
  fromDate: string,
): Promise<Sub2HomeRecordRow[]> {
  const supabase = getSupabaseSub2Client();

  let query = supabase
    .from(SERVICE_RECORDS_HOME_TABLE)
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

  const rows = (data ?? []) as unknown as Sub2HomeRecordRow[];
  warnIfTruncated(rows, "service-records-home/unwritten");

  return rows.filter((row) => isBlankBody(row.final_note));
}

/** 未記入の移動記録。居宅版と同じ方針（本文は summary_text） */
export async function fetchSub2UnwrittenMoveRecords(
  helperEmail: string | null,
  fromDate: string,
): Promise<Sub2MoveRecordRow[]> {
  const supabase = getSupabaseSub2Client();

  let query = supabase
    .from(SERVICE_RECORDS_MOVE_TABLE)
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

  const rows = (data ?? []) as unknown as Sub2MoveRecordRow[];
  warnIfTruncated(rows, "service-records-move/unwritten");

  return rows.filter((row) => isBlankBody(row.summary_text));
}

// ========== 2. 保存（UPDATE） ==========

export type Sub2SaveOutcome =
  | { status: "updated" }
  /** record_uuid の行が無い。GAS 転送前 or 予定が消えた */
  | { status: "not_found" }
  /** 既に本文が入っている。二重保存 */
  | { status: "already_written" };

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
async function updateSub2Record(
  table: string,
  bodyColumn: "final_note" | "summary_text",
  recordUuid: string,
  payload: Record<string, unknown>,
  supabase: SupabaseClient = getSupabaseSub2Client(),
): Promise<Sub2SaveOutcome> {
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

  const currentBody = (existing as Record<string, unknown>)[bodyColumn];

  if (!isBlankBody(currentBody as string | null)) {
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

/**
 * 書き込むのは**ヘルパーが画面で入力した列だけ**。
 *
 * helper_name / helper_email / user_name / service_date / start_time / end_time /
 * recipient_number は GAS が転送時に埋めた値をそのまま残す。
 * リクエスト側の値で上書きすると、古いタブが開きっぱなしのときに
 * 転送済みの正しい値を壊す経路ができるため。
 *
 * task も**書き込まない**（移動側と同じ扱い）。
 * 以前は「ヘルパーが区分3択で選ぶ入力だから」として書き込んでいたが、
 * task には GAS が転送時に原文（身体 / 家事 / 重訪 / 移動、重訪 など）を入れており、
 * 4900（重度訪問介護）の移動介護加算はこの原文の「移動」の有無で判定している。
 * 3択で上書きすると加算判定の入力が消える（2026-09-07 修正）。
 * ヘルパーが選んだ区分は memo の「区分: 」行に残る。
 */
export interface Sub2HomeSavePayload {
  final_note: string;
  memo: string | null;
}

export function saveSub2HomeRecord(
  recordUuid: string,
  payload: Sub2HomeSavePayload,
  supabase?: SupabaseClient,
): Promise<Sub2SaveOutcome> {
  return updateSub2Record(
    SERVICE_RECORDS_HOME_TABLE,
    "final_note",
    recordUuid,
    payload as unknown as Record<string, unknown>,
    supabase ?? getSupabaseSub2Client(),
  );
}

/**
 * 移動でヘルパーが入力するのは本文とメモの2つだけ。
 * task（目的地）と haisha は予定側の値で、画面では編集できないため書き込まない
 * （居宅版のコメントも参照）。
 */
export interface Sub2MoveSavePayload {
  summary_text: string;
  notes: string | null;
}

export function saveSub2MoveRecord(
  recordUuid: string,
  payload: Sub2MoveSavePayload,
  supabase?: SupabaseClient,
): Promise<Sub2SaveOutcome> {
  return updateSub2Record(
    SERVICE_RECORDS_MOVE_TABLE,
    "summary_text",
    recordUuid,
    payload as unknown as Record<string, unknown>,
    supabase ?? getSupabaseSub2Client(),
  );
}

// ========== 3. 過去記録（previous / samples） ==========

/**
 * 同じ利用者の直近の記入済み記録を1件。
 * sub2 には 2026-08 以降しか無いので、呼び出し側で旧DB の結果とマージすること。
 */
export async function fetchSub2LatestWrittenHome(
  userName: string,
  before: string,
): Promise<Sub2HomeRecordRow | null> {
  const supabase = getSupabaseSub2Client();

  let query = supabase
    .from(SERVICE_RECORDS_HOME_TABLE)
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

  return ((data ?? [])[0] ?? null) as unknown as Sub2HomeRecordRow | null;
}

/** 移動版。本文は summary_text */
export async function fetchSub2LatestWrittenMove(
  userName: string,
  before: string,
): Promise<Sub2MoveRecordRow | null> {
  const supabase = getSupabaseSub2Client();

  let query = supabase
    .from(SERVICE_RECORDS_MOVE_TABLE)
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

  return ((data ?? [])[0] ?? null) as unknown as Sub2MoveRecordRow | null;
}

export interface Sub2SampleRow {
  service_date: string | null;
  task: string | null;
  body: string | null;
}

/** AI 下書きの参考例。居宅は task（統一済み3種別）で絞れる */
export async function fetchSub2HomeSamples(
  userName: string,
  task: string,
  limit: number,
): Promise<Sub2SampleRow[]> {
  const supabase = getSupabaseSub2Client();

  let query = supabase
    .from(SERVICE_RECORDS_HOME_TABLE)
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

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    service_date: (row.service_date as string) ?? null,
    task: (row.task as string) ?? null,
    body: (row.final_note as string) ?? null,
  }));
}

/** 移動版。task は目的地で表記ゆれが激しいため絞らない（samples.ts の設計メモ参照） */
export async function fetchSub2MoveSamples(
  userName: string,
  limit: number,
): Promise<Sub2SampleRow[]> {
  const supabase = getSupabaseSub2Client();

  const { data, error } = await supabase
    .from(SERVICE_RECORDS_MOVE_TABLE)
    .select("service_date, task, summary_text")
    .eq("user_name", userName)
    .not("summary_text", "is", null)
    .neq("summary_text", "")
    .order("service_date", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    service_date: (row.service_date as string) ?? null,
    task: (row.task as string) ?? null,
    body: (row.summary_text as string) ?? null,
  }));
}

// ========== 4. 一覧レスポンスへの変換 ==========

/**
 * 未記入一覧のレスポンス形状。
 *
 * **旧DB のタスク行と同じキーを保つ**（`id` / `beneficiary_number` / `status`）。
 * フロント（public/service-records-home/main.js:1464 ほか）は一覧の `id` を
 * そのまま save に送り返すので、`id` に record_uuid を載せれば
 * フロント側の改修が要らない。
 *
 * `schedule_id` は sub2 の記録テーブルに相当列が無いため null。
 *
 * `summary`（画面の「予定概要」）にも相当列が無いが、null にすると一覧に
 * 「概要なし」が並んでヘルパーがどの訪問か判断できなくなるため task を入れる。
 * 「内容:」と「予定概要:」に同じ値が出るが、選びやすさを優先する判断
 * （2026-08-02 奥原）。
 */
export interface UnwrittenHomeItem {
  id: string;
  schedule_id: string | null;
  service_date: string;
  helper_name: string;
  helper_email: string | null;
  user_name: string;
  start_time: string | null;
  end_time: string | null;
  task: string | null;
  summary: string | null;
  beneficiary_number: string | null;
  status: string;
}

export function toUnwrittenHomeItem(row: Sub2HomeRecordRow): UnwrittenHomeItem {
  return {
    id: row.record_uuid,
    schedule_id: null,
    service_date: row.service_date ?? "",
    helper_name: row.helper_name ?? "",
    helper_email: row.helper_email,
    user_name: row.user_name ?? "",
    // time 型は "10:00:00" で返るので旧APIの "10:00" 形式に揃える
    start_time: formatClockTime(row.start_time),
    end_time: formatClockTime(row.end_time),
    task: row.task,
    summary: row.task,
    beneficiary_number: row.recipient_number,
    status: "unwritten",
  };
}

/**
 * 移動の未記入一覧の項目。**旧DB 版と同じ camelCase キーを保つ**
 * （居宅とキー名の流儀が違うが、フロントの契約なので揃えない）。
 * `taskId` に record_uuid を載せると public/service-records-move/main.js:487 が
 * そのまま save に送り返せる。
 *
 * `haisha` は旧DB 版の項目に無く、フロントが `state.selectedTask.haisha` を
 * 参照しても常に undefined だった（＝保存時に欠落していた）。
 * sub2 では GAS が haisha を埋めているので、ここで載せて欠落を解消する。
 */
export interface UnwrittenMoveItem {
  taskId: string;
  helperEmail: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  userName: string;
  helperName: string;
  task: string;
  haisha: string;
  summary: string;
  summaryText: string;
  beneficiaryNumber: string;
  raw: Sub2MoveRecordRow;
}

export function toUnwrittenMoveItem(row: Sub2MoveRecordRow): UnwrittenMoveItem {
  return {
    taskId: row.record_uuid,
    helperEmail: row.helper_email ?? "",
    serviceDate: row.service_date ?? "",
    // time 型は "10:00:00" で返るので旧APIの "10:00" 形式に揃える
    startTime: formatClockTime(row.start_time) ?? "",
    endTime: formatClockTime(row.end_time) ?? "",
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
