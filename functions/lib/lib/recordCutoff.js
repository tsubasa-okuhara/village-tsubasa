"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECORD_LIST_CUTOFF_DATE = void 0;
// ヘルパー向けサービス記録の「未記入一覧」に出す下限日。
//
// 2026-07-31 以前の未記入（居宅 344件 / 移動 1,433件）は事業所側で精査するため、
// ヘルパーの記録画面には一切出さない。記載基準対応（③）の運用開始が 8/1 のため、
// ヘルパーには 8/1 以降の予定だけを見せて新フォーマットで書いてもらう。
//
// 参照元:
//   - service-records-home/listUnwritten.ts （home_schedule_tasks）
//   - service-records-move/listUnwritten.ts （schedule_tasks_move）
// ※ qrec（/qrec-okuhara-9k2b/）も同じ unwritten API を叩くため同じ境界が効く。
//
// 境界を変えるときはこの定数だけ直す（片方のテーブルだけ直す事故を防ぐため定数化）。
exports.RECORD_LIST_CUTOFF_DATE = "2026-08-01";
