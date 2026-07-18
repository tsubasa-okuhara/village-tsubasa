import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

// 同じ利用者の過去の移動支援記録を最大10件、AI下書き生成の参考例として返す。
// 移動の task は「目的地」で表記ゆれが激しいため種別では絞らず、利用者単位で母集団を取る（設計メモ 2026-07-17）。

const FETCH_LIMIT = 50; // 直近この件数を取得し、JS 側でシャッフルして最大 10 件返す
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
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("service_notes_move")
      .select("service_date, task, summary_text")
      .eq("user_name", userName)
      .not("summary_text", "is", null)
      .neq("summary_text", "")
      .order("service_date", { ascending: false })
      .limit(FETCH_LIMIT);

    if (error) throw error;

    const samples: Sample[] = ((data ?? []) as SampleRow[])
      .map((row) => ({
        service_date: row.service_date ?? "",
        task: row.task ?? "",
        note: (row.summary_text ?? "").trim(),
      }))
      .filter((sample) => sample.note !== "");

    res.status(200).json({ ok: true, samples: shuffle(samples).slice(0, SAMPLE_SIZE) });
  } catch (error) {
    console.error("[service-records-move/samples] error:", error);
    res.status(500).json({ ok: false, message: "internal error" });
  }
}
