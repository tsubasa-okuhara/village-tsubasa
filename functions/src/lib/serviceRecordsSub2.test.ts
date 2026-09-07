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

import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isBlankBody, saveSub2HomeRecord } from "./serviceRecordsSub2";

type FakeRow = Record<string, unknown>;

/**
 * supabase-js のうち updateSub2Record が使う呼び出しだけを再現する。
 *   SELECT: from(t).select(cols).eq(col, val).maybeSingle()
 *   UPDATE: from(t).update(payload).eq(col, val)
 */
function createFakeClient(rowsByUuid: Record<string, FakeRow>) {
  const updates: Array<{ recordUuid: string; payload: FakeRow }> = [];

  const client = {
    from() {
      return {
        select() {
          let requestedUuid = "";
          const builder = {
            eq(_column: string, value: string) {
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
        update(payload: FakeRow) {
          return {
            async eq(_column: string, value: string) {
              updates.push({ recordUuid: value, payload });
              return { error: null };
            },
          };
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, updates };
}

const PAYLOAD = {
  final_note: "2026-08-01 10:00:00〜11:00:00、記録本文です。",
  memo: "区分: 身体介護",
};

test("isBlankBody は NULL・空文字・空白のみを未記入とみなす", () => {
  assert.equal(isBlankBody(null), true);
  assert.equal(isBlankBody(undefined), true);
  assert.equal(isBlankBody(""), true);
  assert.equal(isBlankBody("   "), true);
  assert.equal(isBlankBody("記録本文"), false);
});

test("本文が空文字の行は updated が返り、UPDATE が実行される", async () => {
  const { client, updates } = createFakeClient({
    "uuid-blank": { record_uuid: "uuid-blank", final_note: "" },
  });

  const outcome = await saveSub2HomeRecord("uuid-blank", PAYLOAD, client);

  assert.deepEqual(outcome, { status: "updated" });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].recordUuid, "uuid-blank");
  assert.equal(updates[0].payload.final_note, PAYLOAD.final_note);
  // updated_at は UPDATE 時に必ず更新する
  assert.ok(updates[0].payload.updated_at);
  // task は**絶対に書き込まない**。GAS が転送時に入れた原文
  //（身体 / 家事 / 重訪 / 移動、重訪 …）を残す。4900 の移動介護加算は
  // この原文の「移動」の有無で判定しているため、上書きすると加算が落ちる。
  assert.equal(
    Object.prototype.hasOwnProperty.call(updates[0].payload, "task"),
    false,
  );
});

test("本文が NULL の行も updated が返る（GAS がどちらで作るか不定のため）", async () => {
  const { client, updates } = createFakeClient({
    "uuid-null": { record_uuid: "uuid-null", final_note: null },
  });

  const outcome = await saveSub2HomeRecord("uuid-null", PAYLOAD, client);

  assert.deepEqual(outcome, { status: "updated" });
  assert.equal(updates.length, 1);
});

test("本文が既に入っている行は already_written が返り、UPDATE されない", async () => {
  const { client, updates } = createFakeClient({
    "uuid-written": { record_uuid: "uuid-written", final_note: "既に書いた記録" },
  });

  const outcome = await saveSub2HomeRecord("uuid-written", PAYLOAD, client);

  assert.deepEqual(outcome, { status: "already_written" });
  assert.equal(updates.length, 0);
});

test("record_uuid が存在しない場合は not_found が返り、UPDATE されない", async () => {
  const { client, updates } = createFakeClient({});

  const outcome = await saveSub2HomeRecord("uuid-missing", PAYLOAD, client);

  assert.deepEqual(outcome, { status: "not_found" });
  assert.equal(updates.length, 0);
});
