import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";
import { stripNoteTimePrefix } from "../lib/noteTimePrefix";
import { fetchSub2MoveSamples, type Sub2SampleRow } from "../lib/serviceRecordsSub2";

// 同じ利用者の過去の移動支援記録を最大10件、AI下書き生成の参考例として返す。
// 移動の task は「目的地」で表記ゆれが激しいため種別では絞らず、利用者単位で母集団を取る（設計メモ 2026-07-17）。
//
// 【2026-08 以降は旧DB と sub2 の両取り】
// 理由と方針は居宅版（service-records-home/samples.ts）の冒頭コメントと同じ。

const FETCH_LIMIT = 50; // 各DBからこの件数を取り、マージ後もこの件数に切ってからシャッフルする
const SAMPLE_SIZE = 10;

type SampleRow = {
  service_date: string | null;
  task: string | null;
  summary_text: string | null;
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

// LIKE のワイルドカードを無効化する。理由は居宅版の同名関数のコメント参照。
function escapeLikePattern(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}

/**
 * 旧DB（2026-07 以前の記録）。本文の絞り込み条件は従来のまま。
 *
 * user_name を前方一致にする理由と「様」条件の意味は
 * 居宅版（service-records-home/samples.ts）の同名関数のコメント参照。
 * 移動側の該当は「小林夕華様(通院)」1件のみだが、構造は居宅と同じなので同じ対応を入れる。
 * 片方だけ完全一致のまま残すと、移動にサフィックスが増えた日に無音で取りこぼす。
 *
 * 移動は task（目的地）で絞らないため区分違いの記録も混ざるが、
 * service_notes_move の行はすべて移動支援の記録なので手本として問題ない。
 */
async function fetchLegacySamples(userName: string): Promise<Sub2SampleRow[]> {
  const supabase = getSupabaseClient();

  const base = supabase
    .from("service_notes_move")
    .select("service_date, task, summary_text");

  const { data, error } = await (
    userName.endsWith("様")
      ? base.like("user_name", `${escapeLikePattern(userName)}%`)
      : base.eq("user_name", userName)
  )
    .not("summary_text", "is", null)
    .neq("summary_text", "")
    .order("service_date", { ascending: false })
    .limit(FETCH_LIMIT);

  if (error) throw error;

  return ((data ?? []) as SampleRow[]).map((row) => ({
    service_date: row.service_date,
    task: row.task,
    body: row.summary_text,
  }));
}

/** 片方が落ちても、もう片方の参考例は返す。理由は居宅版の同名関数のコメント参照。 */
function unwrap(
  result: PromiseSettledResult<Sub2SampleRow[]>,
  label: string,
): Sub2SampleRow[] {
  if (result.status === "fulfilled") return result.value;
  console.error(`[service-records-move/samples] ${label} fetch failed:`, result.reason);
  return [];
}

export async function handleSamplesMove(
  req: Request,
  res: Response,
): Promise<void> {
  const userName = getQueryValue(req.query.user_name);

  if (!userName) {
    res.status(400).json({ ok: false, message: "user_name is required" });
    return;
  }

  try {
    const [legacyResult, sub2Result] = await Promise.allSettled([
      fetchLegacySamples(userName),
      fetchSub2MoveSamples(userName, FETCH_LIMIT),
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
    console.error("[service-records-move/samples] error:", error);
    res.status(500).json({ ok: false, message: "internal error" });
  }
}
