// 記録本文（service_notes_home.final_note / service_notes_move.summary_text）の
// 冒頭に付く日時プレフィックスを除去する。②の参考記録表示で、AI が過去の日時を
// 丸写ししないための前処理（監査基準: 日付・時刻の"事実"は当日の実際で埋める）。
//
// 実データ（本番）で確認した3形式に対応:
//   - ISO 分精度:  2026-05-21 18:45〜19:45、   （1桁時 7:35 もあり）
//   - ISO 秒あり:  2026-04-01 12:00:00〜13:30:00、
//   - 和暦風:      2026年6月8日、12時から18時まで、 / 07:35から07:50まで、 / の間、
//
// 「日付で始まる場合のみ」除去し、日時を含まない本文（例: 「池上福祉園から…」）は残す。

const ISO_DATE = String.raw`\d{4}-\d{2}-\d{2}`;
const JP_DATE = String.raw`\d{4}年\d{1,2}月\d{1,2}日`;
// 時刻: 7:35 / 07:35:00 / 12時30分 / 12時
const TIME = String.raw`\d{1,2}(?::\d{2}(?::\d{2})?|時(?:\d{1,2}分)?)`;
const RANGE_SEP = String.raw`(?:〜|~|から)`;
const RANGE_END = String.raw`(?:まで|の間)?`;

const TIME_PREFIX = new RegExp(
  `^\\s*(?:${ISO_DATE}|${JP_DATE})` +
    `(?:[\\s、]*${TIME}\\s*${RANGE_SEP}\\s*${TIME}?\\s*${RANGE_END})?` +
    `\\s*、\\s*`,
);

export function stripNoteTimePrefix(note: string): string {
  return note.replace(TIME_PREFIX, "").trim();
}
