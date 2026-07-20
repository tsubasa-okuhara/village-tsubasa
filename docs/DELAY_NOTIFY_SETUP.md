# 遅延通知API 導入手順

## 1. ファイル配置

```
functions/src/delayNotify.ts   ← 新規（これ1つだけ）
```

sub2 への接続は既存の `lib/supabase.ts` の `getSupabaseSub2Client()` を使う。
新しくクライアントや Secret を作らないこと（二重管理になる）。

## 2. functions/src/index.ts の差分

**インポートを追加**（既存のimport群の末尾へ）

```ts
import { handleDelayNotify, LINE_CHANNEL_ACCESS_TOKEN } from "./delayNotify";
```

`SUPABASE_SUB2_SERVICE_ROLE_KEY` は既に import 済みのはずなので追加不要。

**ルートを追加**（`app.post("/api/push/test", ...)` のあたりに並べる）

```ts
app.post("/delay-notify", handleDelayNotify);
app.post("/api/delay-notify", handleDelayNotify);
```

既存のルートが `/xxx` と `/api/xxx` の両方を定義しているので、それに合わせています。

**secrets に2つ追加**（`export const api = onRequest` の中）

```ts
export const api = onRequest(
  {
    region: "asia-northeast1",
    secrets: [
      SUPABASE_SERVICE_ROLE_KEY,
      OPENAI_API_KEY,
      WEB_PUSH_VAPID_PUBLIC_KEY,
      WEB_PUSH_VAPID_PRIVATE_KEY,
      WEB_PUSH_SUBJECT,
      SUPABASE_SUB2_SERVICE_ROLE_KEY, // ← 既にあるはず
      LINE_CHANNEL_ACCESS_TOKEN,      // ← これだけ追加
    ],
  },
  app,
);
```

この2行を忘れると、デプロイは通るのに実行時に「Secret が取得できない」で落ちます。

## 3. Secret の登録

sub2 のキー（`SUPABASE_SUB2_SERVICE_ROLE_KEY`）は登録済み・検証済みなので、
今回新たに登録するのは LINE のトークン1つだけ。

```bash
firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN
# → GASのスクリプトプロパティにある値と同じもの
```

## 4. デプロイ

```bash
cd functions
npm run build          # 型エラーがないか先に確認
cd ..
firebase deploy --only functions:api
```

## 5. テスト（本番送信の前に）

**必ずテスト用グループで確認してください。** いきなり本番の予定IDで叩くと、実際の利用者にLINEが飛びます。

**手順1: 送信されないケースから試す**

LINE ID が無い利用者の予定IDを使うと、送信せずに `needsPhoneCall: true` が返るだけなので安全です。

```sql
-- LINE未登録の利用者の予定を1件探す
select s.id, s.date, s.user_name, s.start_time
from schedule_entries s
left join users u on u.name = replace(s.user_name, '様', '')
where u.line_group_id is null
  and s.user_name is not null and s.user_name <> ''
limit 5;
```

```bash
curl -X POST https://asia-northeast1-<project>.cloudfunctions.net/api/api/delay-notify \
  -H "Content-Type: application/json" \
  -d '{"scheduleId": 上のID, "minutes": 10}'
```

期待する応答：

```json
{"ok":true,"sent":false,"needsPhoneCall":true,"clientName":"○○様","reason":"..."}
```

ここまで通れば、予定取得・氏名突合・ログ保存がすべて動いています。

**手順2: 実際の送信を試す**

`users` にテスト用の行を1つ作り、`line_group_id` に自分だけのテストグループIDを入れます。その氏名で `schedule_entries` にテスト予定を1件作って叩けば、自分にだけLINEが届きます。

```sql
-- テスト後は必ず削除する
delete from delay_notices where client_name like 'テスト%';
```

## 6. 動作確認用のクエリ

```sql
-- 送信ログを新しい順に
select sent_at, client_name, helper_name, minutes, status, error_message
from delay_notices
order by sent_at desc
limit 20;

-- ステータス別の件数
select status, count(*) from delay_notices group by status;
```

---

## つまずきやすい点

**「Secret が取得できない」**
→ 手順2の `secrets:` 配列に `LINE_CHANNEL_ACCESS_TOKEN` を足し忘れている。

**「予定が見つかりません」**
→ `scheduleId` が旧DBのIDになっている可能性。sub2 の `schedule_entries.id` を使ってください。

**`needsPhoneCall` ばかり返る**
→ 氏名の突合失敗。`replace(user_name, '様', '')` で `users.name` に一致するか確認してください。旧字体（﨑・髙）や全角スペースが原因のことがあります。

**LINE から HTTP 400**
→ グループIDが古いか、Botがそのグループから退出しています。`delay_notices.error_message` に本文が残るので、そこで判別できます。
