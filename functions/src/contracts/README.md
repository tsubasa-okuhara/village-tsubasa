# functions/src/contracts/

電子契約機能の Firebase Functions 実装。

**設計書**: `docs/CONTRACTS_DESIGN.md`
**Phase 0 方針メモ**: `docs/CONTRACTS_PHASE0.md`
**DB スキーマ**: `sql/create_contracts.sql`

## ディレクトリ構成

```
contracts/
├── README.md                  # 本ファイル
├── routes.ts                  # Express ルータ (/api/contracts/*)
├── types.ts                   # 共通 TypeScript 型
├── handlers/                  # リクエストハンドラ
│   ├── common.ts              # isAdmin / getIp 等のユーティリティ
│   ├── templates.ts           # テンプレート CRUD
│   ├── contracts.ts           # 契約 CRUD + 送信 + 監査ログ
│   └── webhook.ts             # 外部API からの Webhook 受信
├── services/
│   └── audit.ts               # contract_audit_log 書き込み
└── providers/                 # 外部署名API 抽象化層
    ├── index.ts               # getProvider() レジストリ
    ├── types.ts               # SignatureProvider インタフェース
    ├── cloudsign.ts           # クラウドサイン実装（Phase 3 スタブ）
    └── gmosign.ts             # GMOサイン実装（スタブのみ）
```

## Phase 3 時点の動作状況

| API | 状態 |
|---|---|
| `GET  /api/contracts/templates` | ✅ 動作 |
| `POST /api/contracts/templates` | ✅ 動作 |
| `GET  /api/contracts/templates/:id` | ✅ 動作 |
| `POST /api/contracts/templates/:id/new-version` | ✅ 動作 |
| `POST /api/contracts/templates/:id/deactivate` | ✅ 動作 |
| `GET  /api/contracts` | ✅ 動作 |
| `GET  /api/contracts/:id` | ✅ 動作 |
| `POST /api/contracts` | ✅ 動作（draft 作成） |
| `POST /api/contracts/:id/revoke` | ✅ 動作 |
| `GET  /api/contracts/mine` | ✅ 動作 |
| `GET  /api/contracts/:id/audit` | ✅ 動作 |
| `POST /api/contracts/:id/send` | ⚠️ 501 スタブ（providers/cloudsign.ts 実装後に有効化） |
| `GET  /api/contracts/:id/download` | ⚠️ 501 スタブ |
| `GET  /api/contracts/:id/sign-url` | ⚠️ 501 スタブ |
| `POST /api/contracts/webhook/cloudsign` | ⚠️ 受信はするが parse は未実装（監査ログだけ残す） |
| `POST /api/contracts/webhook/gmosign` | ⚠️ 同上 |

## Phase 3 を動かすための必要設定

### Supabase
`sql/create_contracts.sql` を Supabase SQL Editor で実行済みであること。

### Firebase Functions Secret Manager（実送信を始めるまで不要）
providers/cloudsign.ts を実装する時点で以下の secret を追加:

```sh
firebase functions:secrets:set CLOUDSIGN_CLIENT_ID
firebase functions:secrets:set CLOUDSIGN_WEBHOOK_SECRET
```

併せて `functions/src/index.ts` の `api` `onRequest` の `secrets: [...]` 配列に以下を追加:

```typescript
export const api = onRequest(
  {
    region: "asia-northeast1",
    secrets: [
      SUPABASE_SERVICE_ROLE_KEY,
      OPENAI_API_KEY,
      WEB_PUSH_VAPID_PUBLIC_KEY,
      WEB_PUSH_VAPID_PRIVATE_KEY,
      WEB_PUSH_SUBJECT,
      // 契約機能を有効化するときに追加:
      // CLOUDSIGN_CLIENT_ID,
      // CLOUDSIGN_WEBHOOK_SECRET,
    ],
  },
  app,
);
```

Phase 3 スタブの段階では `providers/cloudsign.ts` の `defineSecret` コールは **宣言だけで値は読まない**（handler が 501 を返す前に value() に到達しない経路になっている）ため、デプロイはブロックされない。

## 今後の実装タスク（Phase 3.2 以降）

1. `providers/cloudsign.ts` の実装
   - `createAndSendDocument`: POST /documents → /attachments → /widgets → /participants → /documents/{id} の5ステップ
   - `parseWebhook`: ヘッダのシークレット比較、JSON からの providerDocumentId / providerSignerId / event 抽出
   - `getSignUrl`: クラウドサインの署名画面 URL（または iframe 埋め込み用 URL）の取得
2. `handlers/contracts.ts` の `handleSendContract` 実装
   - テンプレート PDF を Storage から取得
   - `field_values` を差し込み（`services/template.ts` を新設）
   - `provider.createAndSendDocument` で送信
   - `contracts.status` / `contract_signatures` / `notifications` を更新
3. `handlers/webhook.ts` の本処理
   - `contract_signatures.status` 更新
   - 全員署名完了なら `contracts.status='signed'` + 署名済 PDF を Storage 保存
   - 関係者へアプリ内通知
4. `handleDownloadSigned` の実装（GCS Signed URL を短命で発行）
