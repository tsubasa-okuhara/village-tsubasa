import type { Request, Response } from "express";

import { getSupabaseClient } from "../lib/supabase";

type LeaderboardRow = {
  helper_email: string;
  yotei: number;
  kiroku: number;
  kanseido: number | null;
  kigennai: number;
  kigen_pct: number | null;
  names: string | null;
};

function getQueryValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

// month 未指定なら「前月」を JST で算出（YYYY-MM）
function defaultPrevMonthJst(): string {
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  let y = nowJst.getUTCFullYear();
  let m = nowJst.getUTCMonth() - 1;
  if (m < 0) {
    m = 11;
    y -= 1;
  }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

export async function handleBonusLeaderboard(
  req: Request,
  res: Response
): Promise<void> {
  const monthRaw = getQueryValue(req.query.month);
  const month = /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : defaultPrevMonthJst();

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("bonus_leaderboard", {
      p_month: month,
    });
    if (error) {
      console.error("[bonus/leaderboard] rpc error:", error);
      throw error;
    }

    const rows = (data ?? []) as LeaderboardRow[];

    const items = rows.map((r) => {
      const kanseido = Number(r.kanseido ?? 0);
      // 期限遵守率＝期限内 ÷ 予定（書いていない人は0になる）
      const kigenRate =
        r.yotei > 0 ? Math.round((1000 * r.kigennai) / r.yotei) / 10 : 0;
      const sougou = Math.round(((kanseido + kigenRate) / 2) * 10) / 10;
      return {
        helperEmail: r.helper_email,
        names: r.names ?? "",
        yotei: r.yotei,
        kiroku: r.kiroku,
        kanseido,
        kigennai: r.kigennai,
        kigenRate,
        kigenPctOfWritten: r.kigen_pct,
        sougou,
      };
    });

    items.sort((a, b) => b.sougou - a.sougou || b.yotei - a.yotei);

    res.status(200).json({ ok: true, month, count: items.length, items });
  } catch (error) {
    console.error("[bonus/leaderboard] runtime error:", error);
    res.status(500).json({ ok: false, message: "failed to build leaderboard" });
  }
}
