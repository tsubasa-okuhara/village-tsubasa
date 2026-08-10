import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";
import { stripNoteTimePrefix } from "../lib/noteTimePrefix";
import { fetchSub2HomeSamples, type Sub2SampleRow } from "../lib/serviceRecordsSub2";

// 同じ利用者・同じ種別の過去記録を最大10件、AI下書き生成の参考例として返す。
// 丸写し用ではなく「書き方のお手本」。当日の実際はオーナーが確定する（設計メモ 2026-07-17）。
//
// 【2026-08 以降は旧DB と sub2 の両取り】
// 記録の保存先は 2026-08 から sub2 に移ったが、7月以前の 528 件は旧DB にしか無い。
// 参考例は「過去の書きぶり」が欲しいだけで保存先は関係ないため、期間分割（isSub2Date）は使わず
// **両方に同じ条件で問い合わせて日付降順でマージする**。
// 期間で振り分けると、境界をまたいだ瞬間に母集団が片方だけになって手本が痩せる。

const FETCH_LIMIT = 50; // 各DBからこの件数を取り、マージ後もこの件数に切ってからシャッフルする
const SAMPLE_SIZE = 10;

type SampleRow = {
  service_date: string | null;
  task: string | null;
  final_note: string | null;
};

type Sample = {
  service_date: string;
  task: string;
  note: string;
};

function getQueryValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

// Fisher-Yates。元配列は破壊しない。
function shuffle<T>(items: T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// service_date は "YYYY-MM-DD" なので文字列比較でそのまま日付順になる。
// null は最後に落とす（日付が無い行を新しい側に混ぜない）。
function byServiceDateDesc(a: Sub2SampleRow, b: Sub2SampleRow): number {
  return String(b.service_date ?? "").localeCompare(String(a.service_date ?? ""));
}

// LIKE のワイルドカードを無効化する。氏名に % や _ が入る想定は無いが、
// 1件の異常データで前方一致が全件一致に化けるのを防ぐ。
function escapeLikePattern(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}

/**
 * 旧DB（2026-07 以前の記録）。本文と task の絞り込み条件は従来のまま。
 *
 * 【user_name だけ前方一致にしている理由】
 * 旧DB には「岩下遥香様(通院)」「小泉晃子様(家事)」のような区分サフィックス付きが
 * 11件混在するが、sub2 は「岩下遥香様」で統一されている（2026-08-10 実データで確認）。
 * 完全一致のままだと、**サフィックス付きでしか記録が無い利用者**
 * （岩下遥香様・田中龍気様）の過去記録が1件も取れない。
 *
 * 前方一致にするのは検索キーが「様」で終わるときだけ。「様」は敬称の終端なので
 * 「◯◯様…」で始まる別人は構造上あり得ず、巻き込み事故が起きない。
 * 敬称なしの姓で前方一致すると「田中」が「田中龍気様」を拾うため、
 * 「様」で終わらない想定外の値は従来どおり完全一致に倒す。
 *
 * サフィックスを列挙して除去する案は採らなかった。新しい区分が増えた瞬間に
 * 無音で取りこぼす（＝今回の8月分欠落と同じ壊れ方をする）ため。
 *
 * ※ 異体字ゆれ（門崎 / 門﨑）はこの方式では拾えない。別件として切り出し済み。
 */
async function fetchLegacySamples(
  userName: string,
  task: string,
): Promise<Sub2SampleRow[]> {
  const supabase = getSupabaseClient();

  const base = supabase
    .from("service_notes_home")
    .select("service_date, task, final_note");

  let query = (
    userName.endsWith("様")
      ? base.like("user_name", `${escapeLikePattern(userName)}%`)
      : base.eq("user_name", userName)
  )
    .not("final_note", "is", null)
    .neq("final_note", "")
    .order("service_date", { ascending: false })
    .limit(FETCH_LIMIT);

  // 居宅は統一済み3種別（身体介護 / 家事援助 / 通院等介助）で絞る
  if (task) {
    query = query.eq("task", task);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as SampleRow[]).map((row) => ({
    service_date: row.service_date,
    task: row.task,
    body: row.final_note,
  }));
}

/**
 * 片方が落ちても、もう片方の参考例は返す。
 *
 * 参考記録は無くても記録は書ける（フロントも取得失敗を握って入力を続行させる）。
 * 全滅させるより痩せた母集団を返すほうが実害が小さいため。
 * ただし黙って減ると「8月分が入っていない」に気付けないので console.error は必ず出す。
 */
function unwrap(
  result: PromiseSettledResult<Sub2SampleRow[]>,
  label: string,
): Sub2SampleRow[] {
  if (result.status === "fulfilled") return result.value;
  console.error(`[service-records-home/samples] ${label} fetch failed:`, result.reason);
  return [];
}

export async function handleSamplesHome(
  req: Request,
  res: Response,
): Promise<void> {
  const userName = getQueryValue(req.query.user_name);
  const task = getQueryValue(req.query.task);

  if (!userName) {
    res.status(400).json({ ok: false, message: "user_name is required" });
    return;
  }

  try {
    const [legacyResult, sub2Result] = await Promise.allSettled([
      fetchLegacySamples(userName, task),
      fetchSub2HomeSamples(userName, task, FETCH_LIMIT),
    ]);

    if (legacyResult.status === "rejected" && sub2Result.status === "rejected") {
      throw legacyResult.reason;
    }

    const merged = [
      ...unwrap(legacyResult, "legacy"),
      ...unwrap(sub2Result, "sub2"),
    ]
      .sort(byServiceDateDesc)
      .slice(0, FETCH_LIMIT);

    const samples: Sample[] = merged
      .map((row) => ({
        service_date: row.service_date ?? "",
        task: row.task ?? "",
        note: stripNoteTimePrefix(row.body ?? ""),
      }))
      .filter((sample) => sample.note !== "");

    res.status(200).json({ ok: true, samples: shuffle(samples).slice(0, SAMPLE_SIZE) });
  } catch (error) {
    console.error("[service-records-home/samples] error:", error);
    res.status(500).json({ ok: false, message: "internal error" });
  }
}
