"use strict";
/**
 * serviceRecordsSub2 の保存判定テスト。
 *
 * ここで守りたいのは1点:
 *   「本文が空の行 = これから書く行」を弾いてしまうと、
 *   ヘルパーが記録を1件も保存できなくなる。
 * isBlankBody() の否定を1文字間違えるだけでそうなるので、3分岐を固定する。
 *
 * 実行: functions/ で `npm test`
 * Supabase には接続しない（偽クライアントを差し込む）。
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const serviceRecordsSub2_1 = require("./serviceRecordsSub2");
/**
 * supabase-js のうち updateSub2Record が使う呼び出しだけを再現する。
 *   SELECT: from(t).select(cols).eq(col, val).maybeSingle()
 *   UPDATE: from(t).update(payload).eq(col, val)
 */
function createFakeClient(rowsByUuid) {
    const updates = [];
    const client = {
        from() {
            return {
                select() {
                    let requestedUuid = "";
                    const builder = {
                        eq(_column, value) {
                            requestedUuid = value;
                            return builder;
                        },
                        async maybeSingle() {
                            return {
                                data: rowsByUuid[requestedUuid] ?? null,
                                error: null,
                            };
                        },
                    };
                    return builder;
                },
                update(payload) {
                    return {
                        async eq(_column, value) {
                            updates.push({ recordUuid: value, payload });
                            return { error: null };
                        },
                    };
                },
            };
        },
    };
    return { client: client, updates };
}
const PAYLOAD = {
    final_note: "2026-08-01 10:00:00〜11:00:00、記録本文です。",
    memo: "区分: 身体介護",
    task: "身体介護",
};
(0, node_test_1.test)("isBlankBody は NULL・空文字・空白のみを未記入とみなす", () => {
    strict_1.default.equal((0, serviceRecordsSub2_1.isBlankBody)(null), true);
    strict_1.default.equal((0, serviceRecordsSub2_1.isBlankBody)(undefined), true);
    strict_1.default.equal((0, serviceRecordsSub2_1.isBlankBody)(""), true);
    strict_1.default.equal((0, serviceRecordsSub2_1.isBlankBody)("   "), true);
    strict_1.default.equal((0, serviceRecordsSub2_1.isBlankBody)("記録本文"), false);
});
(0, node_test_1.test)("本文が空文字の行は updated が返り、UPDATE が実行される", async () => {
    const { client, updates } = createFakeClient({
        "uuid-blank": { record_uuid: "uuid-blank", final_note: "" },
    });
    const outcome = await (0, serviceRecordsSub2_1.saveSub2HomeRecord)("uuid-blank", PAYLOAD, client);
    strict_1.default.deepEqual(outcome, { status: "updated" });
    strict_1.default.equal(updates.length, 1);
    strict_1.default.equal(updates[0].recordUuid, "uuid-blank");
    strict_1.default.equal(updates[0].payload.final_note, PAYLOAD.final_note);
    // updated_at は UPDATE 時に必ず更新する
    strict_1.default.ok(updates[0].payload.updated_at);
});
(0, node_test_1.test)("本文が NULL の行も updated が返る（GAS がどちらで作るか不定のため）", async () => {
    const { client, updates } = createFakeClient({
        "uuid-null": { record_uuid: "uuid-null", final_note: null },
    });
    const outcome = await (0, serviceRecordsSub2_1.saveSub2HomeRecord)("uuid-null", PAYLOAD, client);
    strict_1.default.deepEqual(outcome, { status: "updated" });
    strict_1.default.equal(updates.length, 1);
});
(0, node_test_1.test)("本文が既に入っている行は already_written が返り、UPDATE されない", async () => {
    const { client, updates } = createFakeClient({
        "uuid-written": { record_uuid: "uuid-written", final_note: "既に書いた記録" },
    });
    const outcome = await (0, serviceRecordsSub2_1.saveSub2HomeRecord)("uuid-written", PAYLOAD, client);
    strict_1.default.deepEqual(outcome, { status: "already_written" });
    strict_1.default.equal(updates.length, 0);
});
(0, node_test_1.test)("record_uuid が存在しない場合は not_found が返り、UPDATE されない", async () => {
    const { client, updates } = createFakeClient({});
    const outcome = await (0, serviceRecordsSub2_1.saveSub2HomeRecord)("uuid-missing", PAYLOAD, client);
    strict_1.default.deepEqual(outcome, { status: "not_found" });
    strict_1.default.equal(updates.length, 0);
});
