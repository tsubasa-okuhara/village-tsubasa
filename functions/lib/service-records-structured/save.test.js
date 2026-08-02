"use strict";
/**
 * 構造化ログ保存の sub2 スキップ判定テスト。
 *
 * ここで守りたいのは1点:
 *   8月以降の記録に対して旧DB を見に行くと 404「source move note not found」になり、
 *   移動画面に「構造化ログの保存に失敗しました。内容を確認して再保存してください」が
 *   出る。保存先テーブルが sub2 に無いので、再保存しても永久に直らない。
 *
 * Supabase には接続しない。8月分はスキップして旧DB に触れないことを確認する
 * （テスト環境には認証情報が無いため、旧DB 経路に入れば必ず 500 になる。
 *   これを7月分の判定に利用して、境界を両側から固定している）。
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const save_1 = require("./save");
function createFakeRes() {
    const captured = { statusCode: 0, body: null };
    const res = {
        status(code) {
            captured.statusCode = code;
            return res;
        },
        json(body) {
            captured.body = body;
            return res;
        },
    };
    // handleServiceRecordsStructuredSave は express の Response 型を要求するが、
    // 実際に使うのは status() と json() だけ。
    return { res: res, captured };
}
function createRequestBody(serviceDate) {
    return {
        sourceType: "move",
        sourceNoteId: "11111111-2222-3333-4444-555555555555",
        serviceDate,
        riskFlags: [],
        actions: [],
        irregularEvents: [],
    };
}
function createFakeReq(serviceDate) {
    return { method: "POST", body: createRequestBody(serviceDate) };
}
(0, node_test_1.test)("8月の記録は保存せず ok を返す（旧DB に触れない）", async () => {
    const { res, captured } = createFakeRes();
    await (0, save_1.handleServiceRecordsStructuredSave)(createFakeReq("2026-08-01"), res);
    strict_1.default.equal(captured.statusCode, 200);
    strict_1.default.equal(captured.body?.ok, true);
    strict_1.default.equal(captured.body?.skipped, true);
    // 既存フィールドは消さない（RULES.md ルール3）
    strict_1.default.equal(captured.body?.structuredRecordId, "");
    strict_1.default.equal(captured.body?.sourceNoteId, "11111111-2222-3333-4444-555555555555");
});
(0, node_test_1.test)("9月以降もスキップされる（境界は月単位で以降すべて）", async () => {
    const { res, captured } = createFakeRes();
    await (0, save_1.handleServiceRecordsStructuredSave)(createFakeReq("2026-12-31"), res);
    strict_1.default.equal(captured.statusCode, 200);
    strict_1.default.equal(captured.body?.skipped, true);
});
(0, node_test_1.test)("7月以前はスキップせず旧DB 経路に進む", async () => {
    const { res, captured } = createFakeRes();
    await (0, save_1.handleServiceRecordsStructuredSave)(createFakeReq("2026-07-31"), res);
    // 旧DB 経路に入った証拠。テスト環境には Supabase の認証情報が無いため 500 になる。
    // ここが 200 + skipped:true になったら、7月以前の構造化ログが
    // 黙って捨てられるようになったということ。
    strict_1.default.notEqual(captured.body?.skipped, true);
    strict_1.default.equal(captured.statusCode, 500);
});
(0, node_test_1.test)("serviceDate が無い場合はスキップしない（現行挙動を変えない）", async () => {
    const { res, captured } = createFakeRes();
    await (0, save_1.handleServiceRecordsStructuredSave)(createFakeReq(null), res);
    strict_1.default.notEqual(captured.body?.skipped, true);
    strict_1.default.equal(captured.statusCode, 500);
});
