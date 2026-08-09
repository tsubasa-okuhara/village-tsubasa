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

import assert from "node:assert/strict";
import { test } from "node:test";

import { handleServiceRecordsStructuredSave } from "./save";

type Captured = { statusCode: number; body: Record<string, unknown> | null };

function createFakeRes() {
  const captured: Captured = { statusCode: 0, body: null };

  const res = {
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
      return res;
    },
  };

  // handleServiceRecordsStructuredSave は express の Response 型を要求するが、
  // 実際に使うのは status() と json() だけ。
  return { res: res as never, captured };
}

function createRequestBody(serviceDate: string | null) {
  return {
    sourceType: "move",
    sourceNoteId: "11111111-2222-3333-4444-555555555555",
    serviceDate,
    riskFlags: [],
    actions: [],
    irregularEvents: [],
  };
}

function createFakeReq(serviceDate: string | null) {
  return { method: "POST", body: createRequestBody(serviceDate) } as never;
}

test("8月の記録は保存せず ok を返す（旧DB に触れない）", async () => {
  const { res, captured } = createFakeRes();

  await handleServiceRecordsStructuredSave(createFakeReq("2026-08-01"), res);

  assert.equal(captured.statusCode, 200);
  assert.equal(captured.body?.ok, true);
  assert.equal(captured.body?.skipped, true);
  // 既存フィールドは消さない（RULES.md ルール3）
  assert.equal(captured.body?.structuredRecordId, "");
  assert.equal(
    captured.body?.sourceNoteId,
    "11111111-2222-3333-4444-555555555555",
  );
});

test("9月以降もスキップされる（境界は月単位で以降すべて）", async () => {
  const { res, captured } = createFakeRes();

  await handleServiceRecordsStructuredSave(createFakeReq("2026-12-31"), res);

  assert.equal(captured.statusCode, 200);
  assert.equal(captured.body?.skipped, true);
});

test("7月以前はスキップせず旧DB 経路に進む", async () => {
  const { res, captured } = createFakeRes();

  await handleServiceRecordsStructuredSave(createFakeReq("2026-07-31"), res);

  // 旧DB 経路に入った証拠。テスト環境には Supabase の認証情報が無いため 500 になる。
  // ここが 200 + skipped:true になったら、7月以前の構造化ログが
  // 黙って捨てられるようになったということ。
  assert.notEqual(captured.body?.skipped, true);
  assert.equal(captured.statusCode, 500);
});

test("serviceDate が無い場合はスキップしない（現行挙動を変えない）", async () => {
  const { res, captured } = createFakeRes();

  await handleServiceRecordsStructuredSave(createFakeReq(null), res);

  assert.notEqual(captured.body?.skipped, true);
  assert.equal(captured.statusCode, 500);
});
