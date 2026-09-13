"use strict";
/**
 * ライブ（schedule_entries）と確定版（helper_check_entries）の境界計算テスト。
 *
 * ここで守りたいのは2点:
 *   1. 境界は「今日」であって「月」ではない。月単位で判定すると、
 *      今日が月末のときに翌日（別月）の扱いを間違える。
 *   2. 過去の月は全部が確定版、未来の月は全部がライブ、今月だけが両方。
 *      片側だけを照会すべき月で両方を叩くと、無意味な問い合わせと
 *      誤った「0件」警告が出る。
 *
 * 実行: functions/ で `npm test`
 * Supabase には接続しない（純関数だけを見る）。
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const scheduleList_1 = require("./scheduleList");
(0, node_test_1.test)("getMonthRange: 月末をまたぐ範囲を [1日, 翌月1日) で返す", () => {
    strict_1.default.deepEqual((0, scheduleList_1.getMonthRange)(2026, 9), {
        startDate: "2026-09-01",
        endDate: "2026-10-01",
    });
    // 12月は翌年へ繰り上がる
    strict_1.default.deepEqual((0, scheduleList_1.getMonthRange)(2026, 12), {
        startDate: "2026-12-01",
        endDate: "2027-01-01",
    });
    // 2月（うるう年でない）
    strict_1.default.deepEqual((0, scheduleList_1.getMonthRange)(2026, 2), {
        startDate: "2026-02-01",
        endDate: "2026-03-01",
    });
});
(0, node_test_1.test)("今月: 今日で2つに割れる。今日はライブ側", () => {
    const { startDate, endDate } = (0, scheduleList_1.getMonthRange)(2026, 9);
    const s = (0, scheduleList_1.splitMonthByToday)(startDate, endDate, "2026-09-07");
    strict_1.default.equal(s.confirmedTo, "2026-09-07", "確定版は今日の前日まで（終端は含まない）");
    strict_1.default.equal(s.liveFrom, "2026-09-07", "今日はライブ側");
    strict_1.default.equal(s.hasConfirmedRange, true);
    strict_1.default.equal(s.hasLiveRange, true);
});
(0, node_test_1.test)("過去の月: 全部が確定版。ライブ側は照会しない", () => {
    const { startDate, endDate } = (0, scheduleList_1.getMonthRange)(2026, 8);
    const s = (0, scheduleList_1.splitMonthByToday)(startDate, endDate, "2026-09-07");
    strict_1.default.equal(s.confirmedTo, "2026-09-01", "月の終端で頭打ち");
    strict_1.default.equal(s.hasConfirmedRange, true);
    strict_1.default.equal(s.hasLiveRange, false, "未来の範囲が無いのでライブは叩かない");
});
(0, node_test_1.test)("未来の月: 全部がライブ。控えは照会しない", () => {
    const { startDate, endDate } = (0, scheduleList_1.getMonthRange)(2026, 10);
    const s = (0, scheduleList_1.splitMonthByToday)(startDate, endDate, "2026-09-07");
    strict_1.default.equal(s.liveFrom, "2026-10-01", "月の先頭で頭打ち");
    strict_1.default.equal(s.hasLiveRange, true);
    strict_1.default.equal(s.hasConfirmedRange, false, "過去の範囲が無いので控えは叩かない");
});
(0, node_test_1.test)("月初が今日: 確定版は空。全部ライブ", () => {
    const { startDate, endDate } = (0, scheduleList_1.getMonthRange)(2026, 9);
    const s = (0, scheduleList_1.splitMonthByToday)(startDate, endDate, "2026-09-01");
    strict_1.default.equal(s.hasConfirmedRange, false, "9/1 より前は同じ月に無い");
    strict_1.default.equal(s.hasLiveRange, true);
    strict_1.default.equal(s.liveFrom, "2026-09-01");
});
(0, node_test_1.test)("月末が今日: 最終日だけライブ、残りは確定版", () => {
    const { startDate, endDate } = (0, scheduleList_1.getMonthRange)(2026, 9);
    const s = (0, scheduleList_1.splitMonthByToday)(startDate, endDate, "2026-09-30");
    strict_1.default.equal(s.confirmedTo, "2026-09-30");
    strict_1.default.equal(s.liveFrom, "2026-09-30");
    strict_1.default.equal(s.hasConfirmedRange, true);
    strict_1.default.equal(s.hasLiveRange, true);
});
(0, node_test_1.test)("今日が月末で、翌日が別月でも壊れない（月単位判定だと間違えるケース）", () => {
    // 9/30 が今日。10月を見ると全部が未来なのでライブだけ。
    const oct = (0, scheduleList_1.getMonthRange)(2026, 10);
    const sOct = (0, scheduleList_1.splitMonthByToday)(oct.startDate, oct.endDate, "2026-09-30");
    strict_1.default.equal(sOct.hasConfirmedRange, false);
    strict_1.default.equal(sOct.hasLiveRange, true);
    strict_1.default.equal(sOct.liveFrom, "2026-10-01");
    // 同じ日に9月を見ると、9/30 だけライブで残りは確定版。
    const sep = (0, scheduleList_1.getMonthRange)(2026, 9);
    const sSep = (0, scheduleList_1.splitMonthByToday)(sep.startDate, sep.endDate, "2026-09-30");
    strict_1.default.equal(sSep.hasConfirmedRange, true);
    strict_1.default.equal(sSep.hasLiveRange, true);
});
(0, node_test_1.test)("年をまたぐ: 12月が今日なら翌年1月は全部ライブ", () => {
    const jan = (0, scheduleList_1.getMonthRange)(2027, 1);
    const s = (0, scheduleList_1.splitMonthByToday)(jan.startDate, jan.endDate, "2026-12-31");
    strict_1.default.equal(s.hasConfirmedRange, false);
    strict_1.default.equal(s.hasLiveRange, true);
    strict_1.default.equal(s.liveFrom, "2027-01-01");
});
(0, node_test_1.test)("2つの範囲は重ならず、隙間も無い（今日でぴったり接する）", () => {
    const { startDate, endDate } = (0, scheduleList_1.getMonthRange)(2026, 9);
    for (const today of ["2026-09-01", "2026-09-07", "2026-09-15", "2026-09-30"]) {
        const s = (0, scheduleList_1.splitMonthByToday)(startDate, endDate, today);
        strict_1.default.equal(s.confirmedTo, s.liveFrom, `${today}: 確定版の終端とライブの始端が一致していないと、重複か抜けが出る`);
    }
});
(0, node_test_1.test)("並び替え: 日付昇順 → 開始時刻昇順。時刻なしは同じ日付の末尾", () => {
    const items = [
        { date: "2026-09-08", startTime: "09:00" },
        { date: "2026-09-07", startTime: null },
        { date: "2026-09-07", startTime: "13:30" },
        { date: "2026-09-07", startTime: "09:00" },
    ];
    const sorted = [...items].sort(scheduleList_1.compareByDateThenStartTime);
    strict_1.default.deepEqual(sorted.map((x) => [x.date, x.startTime]), [
        ["2026-09-07", "09:00"],
        ["2026-09-07", "13:30"],
        ["2026-09-07", null],
        ["2026-09-08", "09:00"],
    ]);
});
