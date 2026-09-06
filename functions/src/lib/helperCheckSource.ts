/**
 * 「令和8年控え」由来の確定版スケジュールを読むモジュール。
 *
 * 読み先は sub2 `gmellfgcyypfrtjxblla` の `helper_check_entries`。
 * 書き込むのは村-all-schedule リポジトリの `hikae/` の GAS で、こちらは読むだけ。
 *
 * 【役割分担】2026-09-07 決定
 *   今日以降     → schedule_entries      （伊藤さん・ライブ。変更が常に反映される）
 *   今日より過去 → helper_check_entries  （控え・精査済みの確定版。週次でまとめて同期）
 *
 *   元は同じスプレッドシートなので内容の整合性は保たれる。
 *   1つのカレンダーで前後に分かれるだけで、ヘルパーから見れば連続した表になる。
 *
 * 【schedule_entries との違い】
 *   ・`helper_name` が NULL の行も返す。控えの NULL は週シートの空きコマではなく
 *     「実施されたが担当が空欄のまま残った訪問」で、ヘルパーが自分の活動記録と
 *     照合して報告するための手がかりになる。件数も月数件しかない。
 *     （schedule_entries 側は 67% が空きコマ由来の NULL なので既存 API が弾いている）
 *   ・`missing_since` が入った行は控えのシートから消えた行なので返さない。
 *   ・`cancelled_at` は無い。控えは精査済みの確定版で、キャンセルは反映済みのため。
 *
 * 【RLS の注意】
 *   `helper_check_entries` は RLS 有効・ポリシー無しで、service_role でしか読めない。
 *   anon キーで読むと **エラーではなく空配列** が返る。
 *   「0件」を「その月は予定なし」と誤読しないよう、呼び出し側は
 *   fetchConfirmedThrough() で接続の健全性を別に確かめること。
 */

import { formatClockTime } from "./scheduleSource";
import { getSupabaseSub2Client } from "./supabase";

/** schedule_entries 由来の項目と同じ形。scheduleList 側でそのまま混ぜられる */
export type ConfirmedScheduleItem = {
  id: string | number;
  date: string;
  helperName: string | null;
  userName: string | null;
  startTime: string | null;
  endTime: string | null;
  haisha: string | null;
  task: string | null;
  summary: string | null;
  updatedAt: string | null;
};

type HelperCheckRow = {
  id: string | number;
  date: string;
  helper_name: string | null;
  user_name: string | null;
  start_time: string | null;
  end_time: string | null;
  transport: string | null;
  support_flow: string | null;
  helper_note: string | null;
  updated_at: string | null;
};

const TABLE = "helper_check_entries";

// PostgREST の1回あたり取得上限（プロジェクト設定 Max Rows、既定1000）。
// 控えは1か月で 1800 行を超えるため、ページングは必須。
// 素の select だと 1000 件で黙って切れる。
const PAGE_SIZE = 1000;

const SELECT_COLUMNS =
  "id, date, helper_name, user_name, start_time, end_time, transport, support_flow, helper_note, updated_at";

/**
 * 指定期間の確定版スケジュールを取得する（開始日を含み、終了日を含まない）。
 *
 * `source_spreadsheet_id` では絞らない。テーブルは控え専用で、
 * 将来「令和9年控え」が増えても日付範囲で自然に分かれるため。
 *
 * @param startDate "YYYY-MM-DD"（含む）
 * @param endDate   "YYYY-MM-DD"（含まない）
 */
export async function fetchConfirmedScheduleRange(
  startDate: string,
  endDate: string
): Promise<ConfirmedScheduleItem[]> {
  if (startDate >= endDate) {
    return [];
  }

  const supabase = getSupabaseSub2Client();
  const rows: HelperCheckRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(SELECT_COLUMNS)
      // 控えのシートから消えた行は表示しない
      .is("missing_since", null)
      .gte("date", startDate)
      .lt("date", endDate)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const pageRows = (data ?? []) as HelperCheckRow[];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) {
      break;
    }
  }

  return rows.map(toConfirmedScheduleItem);
}

/**
 * 精査済みの終端（`helper_check_entries` の最大日付）を返す。データが無ければ null。
 *
 * 2つの役割を兼ねている。
 *   1. API の `confirmedThrough` としてフロントへ返す。
 *      「この日付より後・今日より前」は精査前であって「予定なし」ではない、と
 *      画面が区別できるようにするため。
 *   2. **接続の健全性の判定。**
 *      控えは月末にまとめて同期する運用なので、月内0件は正常にあり得る。
 *      一方 RLS やキーの問題で読めていないときも 0 件が返る。両者は件数だけでは
 *      区別できない。テーブル全体で1件も無ければ後者を疑う。
 */
export async function fetchConfirmedThrough(): Promise<string | null> {
  const supabase = getSupabaseSub2Client();

  const { data, error } = await supabase
    .from(TABLE)
    .select("date")
    .is("missing_since", null)
    .order("date", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<{ date: string }>;
  return rows.length > 0 ? rows[0].date : null;
}

function toConfirmedScheduleItem(row: HelperCheckRow): ConfirmedScheduleItem {
  return {
    id: row.id,
    date: row.date,
    // NULL のまま返す。フロントの getHelperLabel() が「担当未設定」と描く
    helperName: row.helper_name,
    userName: row.user_name,
    // sub2 の time 型は "09:40:00" で返るので "HH:MM" に揃える。
    // 控えの end_time は TIME 列で自由記述が入らないため、開始・終了とも通してよい
    // （旧DB経路は end_time に "16:00以降" のような記述が混ざるので通していない）
    startTime: formatClockTime(row.start_time),
    endTime: formatClockTime(row.end_time),
    haisha: row.transport,
    task: row.support_flow,
    summary: row.helper_note,
    updatedAt: row.updated_at,
  };
}
