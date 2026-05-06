// =============================================================
// schedule-editor 共有ユーティリティ
// =============================================================
//
// update.ts と create.ts の両方で使う、入力値の正規化処理。

/**
 * 時刻文字列を "HH:MM" 形式に正規化する。
 *   "915"     → "09:15"
 *   "2340"    → "23:40"
 *   "9:15"    → "09:15"
 *   "9"       → "09:00"
 *   "9:5"     → "09:05"
 *   ""        → null
 *   null      → null
 *
 * 範囲外（25:00 など）は Error を投げる。
 */
export function normalizeTimeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === "") return null;

  const cleaned = str.replace(/[^\d:]/g, "");
  let hourStr: string;
  let minuteStr: string;

  if (cleaned.includes(":")) {
    const parts = cleaned.split(":");
    if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
      throw new Error("時刻の形式が不正です（例: 9:15 / 09:15 / 915）");
    }
    hourStr = parts[0];
    minuteStr = parts[1];
  } else {
    if (cleaned.length === 1 || cleaned.length === 2) {
      // "9" / "23" → 分は 00 とみなす
      hourStr = cleaned;
      minuteStr = "00";
    } else if (cleaned.length === 3) {
      // "915" → 時=先頭1桁、分=末尾2桁
      hourStr = cleaned.slice(0, 1);
      minuteStr = cleaned.slice(1);
    } else if (cleaned.length === 4) {
      // "2340" → 時=先頭2桁、分=末尾2桁
      hourStr = cleaned.slice(0, 2);
      minuteStr = cleaned.slice(2);
    } else {
      throw new Error("時刻の形式が不正です（例: 9:15 / 09:15 / 915）");
    }
  }

  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error("時刻は 00:00〜23:59 の範囲で指定してください");
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * テキスト値を trim して、空文字なら null にして返す。
 */
export function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str === "" ? null : str;
}

/**
 * 日付文字列が "YYYY-MM-DD" 形式で、有効な日付かを検証する。
 * OK ならその文字列を返す、NG なら Error を投げる。
 */
export function normalizeDateString(value: unknown): string {
  if (value === null || value === undefined) {
    throw new Error("日付は必須です");
  }
  const str = String(value).trim();
  if (str === "") {
    throw new Error("日付は必須です");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw new Error("日付は YYYY-MM-DD 形式で指定してください（例: 2026-04-30）");
  }
  // Date オブジェクトで往復して同じ文字列が返るかで実在判定
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error("実在しない日付です");
  }
  return str;
}
