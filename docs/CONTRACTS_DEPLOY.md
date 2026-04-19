# CONTRACTS_DEPLOY — 電子契約 Phase 3 雛形のデプロイ手順

> **位置付け**: `docs/CONTRACTS_DESIGN.md` の Phase 3 雛形（現状の git 状態）を本番環境に反映する手順。
> Phase 3.2 以降（`providers/cloudsign.ts` 実装後）にはさらに secret 追加とクラウドサイン管理画面での Webhook URL 登録が必要になる。

対象: 奥原翼さん（本番環境へのデプロイ権限あり）
所要時間: 約 20 分（SQL 3分 + Functions デプロイ 10分 + 疎通確認 5分）

---

## 1. 事前チェック

```bash
cd ~/path/to/village-tsubasa
git log -1 --oneline
# → "feat: 電子契約機能 Phase 0〜4 雛形を追加" がHEADにあるか確認

node --version   # v18 以上
firebase --version
firebase projects:list | grep village-tsubasa
```

---

## 2. Supabase に SQL を適用

### 2.1 SQL の内容確認

```bash
cat sql/create_contracts.sql | head -30
```

新規 5 テーブルを追加するだけ。既存テーブル変更なし（RULES ルール2 遵守）。

### 2.2 Supabase SQL Editor で実行

1. https://supabase.com/dashboard/project/pbqqqwwgswniuomjlhsh/sql にブラウザでアクセス
2. 「New query」をクリック
3. `sql/create_contracts.sql` の内容を全文貼り付け
4. 「Run」を実行（右下の緑ボタン）
5. 成功メッセージ（`Success. No rows returned` 等）を確認

### 2.3 テーブル作成の確認

```sql
-- Supabase SQL Editor で実行
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'contract%'
ORDER BY tablename;
```

期待結果:
```
contract_audit_log
contract_parties
contract_signatures
contract_templates
contracts
```

5 件出ていれば OK。

### 2.4 ロールバックしたい場合

```sql
-- 慎重に。このセッションでしか使わないこと
DROP TABLE IF EXISTS contract_audit_log CASCADE;
DROP TABLE IF EXISTS contract_signatures CASCADE;
DROP TABLE IF EXISTS contract_parties CASCADE;
DROP TABLE IF EXISTS contracts CASCADE;
DROP TABLE IF EXISTS contract_templates CASCADE;
```

---

## 3. Firebase Functions をビルド & デプロイ

### 3.1 ビルド

```bash
cd functions
npm install                    # 初回のみ
npx tsc --noEmit               # 型エラーがないこと（EXIT 0 になるはず）
npm run build                  # lib/ を更新
cd ..
```

### 3.2 デプロイ

```bash
# api 関数だけピンポイントでデプロイ（他を触らない）
firebase deploy --only functions:api
```

約 3〜5 分。完了メッセージに以下が含まれるはず:
```
✔  functions: Finished running predeploy script.
✔  functions[api(asia-northeast1)] Successful update operation.
```

### 3.3 Scheduler 関数を触らないことの確認

```
functions[notifyTodaySchedule(...)] Function is up to date, skipped.
functions[notifyTomorrowSchedule(...)] Function is up to date, skipped.
```

が出ていれば既存 scheduler は無変更（RULES ルール4 の「Scheduler ジョブを変えない」を満たす）。

---

## 4. 疎通確認

### 4.1 ヘルスチェック（既存 API が壊れていないか）

```bash
curl -s https://asia-northeast1-village-tsubasa.cloudfunctions.net/api/healthz
# → ok

curl -s "https://asia-northeast1-village-tsubasa.cloudfunctions.net/api/schedule-list?year=2026&month=4" \
  | head -c 200
# → 既存の schedule JSON が返ること（他アプリを壊していない）
```

### 4.2 契約テンプレート一覧（管理者として）

```bash
curl -s "https://asia-northeast1-village-tsubasa.cloudfunctions.net/api/contracts/templates?email=admin@village-support.jp"
# → {"templates":[]}  （空配列）
```

### 4.3 契約テンプレートの登録

```bash
curl -s -X POST \
  https://asia-northeast1-village-tsubasa.cloudfunctions.net/api/contracts/templates \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@village-support.jp",
    "kind":"employment",
    "title":"ヘルパー雇用契約書 2026年度版（動作確認用）",
    "fillable_fields":[
      {"key":"helper_name","label":"氏名","required":true,"source":"helper_master.name"},
      {"key":"start_date","label":"契約開始日","required":true,"type":"date"}
    ]
  }'
# → {"success":true,"template":{...}}
```

### 4.4 一覧で確認

```bash
curl -s "https://asia-northeast1-village-tsubasa.cloudfunctions.net/api/contracts/templates?email=admin@village-support.jp"
# → {"templates":[{...}]}
```

### 4.5 スタブが意図通り 501 を返すこと

まだテンプレートしかないので send はできないが、適当な ID で試す:

```bash
curl -s -i -X POST \
  https://asia-northeast1-village-tsubasa.cloudfunctions.net/api/contracts/00000000-0000-0000-0000-000000000000/send \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@village-support.jp"}'
# → HTTP/2 501
#    {"error":"Phase 3 スタブ: 外部API送信は未実装です..."}
```

### 4.6 ヘルパー画面が表示されること

ブラウザで https://village-tsubasa.web.app/contracts/ を開く:
- メール入力欄に自分のメールを入れると `/api/contracts/mine` が叩かれる
- 現時点では「現在、自分宛の契約はありません。」と出るのが正常

---

## 5. 監査ログの確認

```sql
-- Supabase SQL Editor で実行
SELECT action, actor_email, payload, created_at
FROM contract_audit_log
ORDER BY created_at DESC
LIMIT 20;
```

上記の動作確認で `template_created` 1件が残っているはず。
501 スタブを叩いた際にも `contract_sent` のエントリが残る（stub note 付き）。

---

## 6. トラブルシューティング

### 症状: `{"error":"管理者のみ操作できます"}`
原因: `email` パラメータのタイポ or 本文 body に含めていない。`admin@village-support.jp` と一字違いで落ちる。

### 症状: `{"error":"保存に失敗しました"}` / 500 が返る
原因: Supabase にテーブルが作られていない（手順2 未実行）。上述の SELECT で 5 件出るか確認。

### 症状: 既存の `/api/schedule-list` 等が壊れる
原因: ビルド時のエラーか、誤ったパスにデプロイした。`firebase deploy --only functions:api` でピンポイント再デプロイ。`functions/lib/index.js` の最終更新時刻で確認。

### 症状: `CLOUDSIGN_CLIENT_ID is not defined` エラー
原因: Phase 3.2 以降で `providers/cloudsign.ts` の中身を実装したあと、secret 設定とセキュアリスト登録を忘れているケース。下記 7 節参照。

---

## 7. Phase 3.2 以降で追加で必要になる手順（今は不要）

`providers/cloudsign.ts` を実装する段階で:

```bash
# Secret 追加
firebase functions:secrets:set CLOUDSIGN_CLIENT_ID
firebase functions:secrets:set CLOUDSIGN_WEBHOOK_SECRET

# functions/src/index.ts の onRequest secrets 配列に追加
#   secrets: [
#     SUPABASE_SERVICE_ROLE_KEY,
#     OPENAI_API_KEY,
#     WEB_PUSH_VAPID_PUBLIC_KEY,
#     WEB_PUSH_VAPID_PRIVATE_KEY,
#     WEB_PUSH_SUBJECT,
#     CLOUDSIGN_CLIENT_ID,           // ← 追加
#     CLOUDSIGN_WEBHOOK_SECRET,      // ← 追加
#   ],

# 再デプロイ
firebase deploy --only functions:api
```

そしてクラウドサイン管理画面で Webhook URL を:

```
https://asia-northeast1-village-tsubasa.cloudfunctions.net/api/contracts/webhook/cloudsign
```

に登録する。

---

## 8. デプロイ後に CHANGELOG を追記（RULES ルール5）

デプロイ成功後、`docs/CHANGELOG.md` の該当エントリの末尾に以下を追記:

```
- 本番デプロイ完了: YYYY-MM-DD
  - Supabase: sql/create_contracts.sql 適用済み（5テーブル追加確認）
  - Firebase Functions: api 関数をデプロイ、疎通確認OK
  - 既存APIへの影響: なし
```
