# HANDOFF — village-admin セルフマッチング承認 UI（Phase 1）

> **作成日**: 2026-05-06（奥原翼 + Claude Opus 4.7）
> **ステータス**: 仕様確定済み → 実装フェーズ
> **改訂**: 2026-05-06 既存 5/6 仕様書 (`ff7da8b`) と統合。決定事項は今日のチャットを優先採用、既存仕様の有用情報（admin allow-list 3 名・対象ヘルパー 7 名・テスト SQL）を取り込み

---

## 1. 背景と目的

ヘルパー側の `/self-matching/`（村つばさ）で、`enable_self_matching = true` のヘルパー 7 名が「未割当の予定に入れます」と申請できる UI が動いている。申請データは `schedule_claims` テーブルに `status='pending'` でたまる。

**現状（2026-05-06 時点）**: 管理者承認 UI が無いため、奥原さんが Supabase SQL Editor で直接 update する運用になっており、現実的でない。本フェーズで **village-admin に承認 UI を追加** し、ワンクリックで承認/却下できるようにする。

### 対象ヘルパー（`enable_self_matching=true`、7 名）

| メール | 名前 |
|---|---|
| yuki200164@gmail.com | 三枝 |
| zhongtiannasu@gmail.com | 中野 |
| 141213zero@gmail.com | 久保田 |
| shinichi.hr22@gmail.com | 伊藤信一 |
| mrokrs1212@gmail.com | 村岡 |
| 8ha8ya4shi@gmail.com | 林 |
| dannyfrommorikiko@gmail.com | 樋口 |

### 管理者 allow-list（既存 `admin_users` テーブル + `village-admin/functions/src/middleware/adminAuth.ts` と一致させる）

| メール | 役割 |
|---|---|
| admin@village-support.jp | 奥原 |
| inachichoco@gmail.com | （既存 admin） |
| yutaka.ito1994@gmail.com | （既存 admin） |

---

## 2. スコープ

### IN
- village-tsubasa Cloud Functions に admin 承認用 API を 4 本追加
  - `GET  /api/self-matching/admin/pending` — 未処理 claim 一覧
  - `GET  /api/self-matching/admin/history` — 処理済み履歴
  - `POST /api/self-matching/admin/approve` — claim を承認 + schedule.helper_email 更新 + 同予定の他 claim を rejected
  - `POST /api/self-matching/admin/reject` — claim を却下
- village-admin に新規ページ `public/self-matching.html` + `public/self-matching.js`
- 既存ページのナビに「🤝 セルフマッチング」リンクを追加
- ダッシュボード（index.html）の集計に「未処理セルフマッチング N件」バッジを追加

### OUT（Phase 2 以降）
- ヘルパー宛の承認/却下メール通知
- 1日1回の pending サマリメール
- 重複承認の取消（一旦承認したものを取り消す UI）
- 優先度スコア（`priority_score`）の活用
- 利用者との相性表示（`user_helper_compatibility`）
- 申請メモ（`note`）の表示（今は判断材料に不要、と確認済み）
- `schedule.name` の自動補完（GAS 同期で吸収）
- `synced_to_sheet=false` リセット（GAS 月次フラッシュ運用と整合確認後の Phase 2）

---

## 3. データモデル（既存）

### `schedule_claims`（2026-05-06 作成済み）

| 列 | 型 | 役割 |
|---|---|---|
| id | uuid PK | |
| schedule_id | uuid NOT NULL FK→schedule.id | |
| helper_email | text NOT NULL | 申請者 |
| status | text NOT NULL CHECK in `'pending'/'approved'/'rejected'/'withdrawn'` | |
| priority_score | numeric default 0 | 未使用 |
| note | text nullable | ヘルパーが添える任意メッセージ |
| created_at / updated_at | timestamptz NOT NULL | |
| **decided_at** | timestamptz nullable | 承認/却下時刻 — **本フェーズで初使用** |
| **decided_by** | text nullable | 判定者 email — **本フェーズで初使用** |

UNIQUE (schedule_id, helper_email)、`idx_schedule_claims_pending` あり、RLS ON（service_role のみ）。

### `helper_master`
- `enable_self_matching = true` のヘルパーのみが claim を出せる（既存ロジック）。
- `qualification`（`'介護福祉士'` / `'初任者研修'` / `'重度訪問介護'`）を承認 UI で表示。

### `schedule`
- 承認時に `helper_email` を申請者の値で UPDATE（NULL → 申請者）。
- `name` / `synced_to_sheet` は **触らない**（GAS 同期に委ねる、Phase 2 で再評価）。

---

## 4. 仕様の核となる決定事項（2026-05-06 確定）

| 質問 | 決定 |
|---|---|
| 承認時に `schedule.helper_email` を自動セットするか | **YES**（承認 = 予定確定） |
| 承認時に `schedule.name` も更新するか | **NO**（GAS 同期に委ねる、要動作確認） |
| 同予定の他 pending claim はどうするか | **自動で `rejected` にセット**（`decided_at` も） |
| API / UI の置き場所 | **API: village-tsubasa、UI: village-admin** |
| `decided_by` の値 | **village-admin の Firebase Auth ログイン email**（`auth.currentUser.email`） |
| API 認証方式 | **Firebase Auth id_token を Authorization Bearer で送り、village-tsubasa 側で検証 + admin email allow-list で照合** |
| 表示する申請者の判断材料 | **申請者名・メール・申請日時（必須）+ 資格（`qualification`）のみ**（メモ、利用者相性は出さない） |
| 履歴の見せ方 | **タブで切り替え（未処理 / 履歴）** |

---

## 5. API 仕様（village-tsubasa: `functions/src/self-matching/`）

### 共通: 管理者認証ミドルウェア `adminAuth.ts`

新規ファイル `functions/src/self-matching/adminAuth.ts`:
- リクエスト Header `Authorization: Bearer <id_token>` を検証
- `firebase-admin` の `getAuth().verifyIdToken()` を使う
- 成功したら `req.adminEmail` に email を載せる
- email が hard-coded allow-list（admin_users テーブルと一致）に含まれるかチェック
- 弾いたら `401 unauthorized` / `403 forbidden`

> village-admin の `requireAdmin` ミドルウェアと同じパターンで書く（`village-admin/functions/src/middleware/adminAuth.ts` 参考）。

### `GET /api/self-matching/admin/pending`

未処理 claim 一覧を返す。

**Headers:** `Authorization: Bearer <id_token>` 必須

**Response:**
```json
{
  "ok": true,
  "items": [
    {
      "scheduleId": "uuid",
      "date": "2026-05-10",
      "client": "山田太郎",
      "startTime": "10:00",
      "endTime": "12:00",
      "task": "居宅介護",
      "haisha": "...",
      "summary": "...",
      "beneficiaryNumber": "...",
      "claims": [
        {
          "claimId": "uuid",
          "helperEmail": "tanaka@example.com",
          "helperName": "田中花子",
          "qualification": "初任者研修",
          "createdAt": "2026-05-06T10:23:45Z",
          "note": null
        }
      ]
    }
  ]
}
```

- 並び順: `schedule.date ASC, schedule.start_time ASC`
- 同じ schedule_id の複数 pending claim は `claims[]` にまとめる（複数申請の比較がしやすい）
- `helperName` は `helper_master.helper_name` を join。`qualification` も同様
- `schedule_claims.status = 'pending'` のみ
- `schedule.deleted_at IS NOT NULL` のものは出さない
- `schedule.helper_email IS NOT NULL` のものは出さない（既に確定済み）

### `GET /api/self-matching/admin/history?limit=50&before=YYYY-MM-DDTHH:MM:SSZ`

`status IN ('approved', 'rejected', 'withdrawn')` の履歴を新しい順に。

**Headers:** `Authorization: Bearer <id_token>` 必須

**Response:**
```json
{
  "ok": true,
  "items": [
    {
      "claimId": "uuid",
      "scheduleId": "uuid",
      "date": "2026-05-10",
      "client": "山田太郎",
      "startTime": "10:00",
      "endTime": "12:00",
      "helperName": "田中花子",
      "helperEmail": "tanaka@example.com",
      "qualification": "初任者研修",
      "status": "approved",
      "decidedAt": "2026-05-06T11:00:00Z",
      "decidedBy": "admin@village-support.jp"
    }
  ],
  "hasMore": false
}
```

- 並び順: `decided_at DESC NULLS LAST, updated_at DESC`（withdrawn は decided_at が無い）
- ページング: クエリ `before` で `decided_at < before` を指定（無ければ最新から）
- `limit` デフォルト 50、最大 200

### `POST /api/self-matching/admin/approve`

**Headers:** `Authorization: Bearer <id_token>` 必須

**Body:**
```json
{ "claimId": "uuid" }
```

**処理:**
1. `claimId` を pending で SELECT。schedule_id / helper_email を取り出す
2. `schedule.helper_email IS NULL` をチェック（race condition 回避）
3. **3 連続 UPDATE（ベストエフォート）**:
   - `UPDATE schedule_claims SET status='approved', decided_at=now(), decided_by=$adminEmail WHERE id=$claimId AND status='pending' RETURNING *` （0行 → 409 conflict）
   - `UPDATE schedule SET helper_email=$helperEmail WHERE id=$scheduleId AND helper_email IS NULL` （0行 → race detected。claim を pending に戻して 409）
   - `UPDATE schedule_claims SET status='rejected', decided_at=now(), decided_by=$adminEmail WHERE schedule_id=$scheduleId AND status='pending' AND id != $claimId`
4. `200 { ok:true, claim: {...}, otherRejected: N }`

> Supabase JS クライアントには transaction が無い。Phase 1 では 3 連続 UPDATE で許容するが、各 UPDATE 結果をログに残し、step 2 が失敗したら step 1 を rollback する補正を入れる。

### `POST /api/self-matching/admin/reject`

**Headers:** `Authorization: Bearer <id_token>` 必須

**Body:**
```json
{ "claimId": "uuid" }
```

**処理:**
- `UPDATE schedule_claims SET status='rejected', decided_at=now(), decided_by=$adminEmail WHERE id=$claimId AND status='pending'`
- 0 行 → 409 not-pending

---

## 6. UI 仕様（village-admin: `public/self-matching.html`）

### ナビゲーション

既存の全 8 ページのヘッダー nav に追加（`is-active` は self-matching ページでのみ）:

```html
<a href="/self-matching.html" class="nav-link">🤝 セルフマッチング</a>
```

### 画面構成

```
ビレッジ管理アプリ                          [admin@...] [ログアウト]
[ダッシュボード][スケジュール][研修][検索][移動][居宅][実績][資格][🤝セルフマッチング][監査]

┌─ サブタブ ────────────────────────────┐
│ [🟡 未処理 (3)] [📜 履歴]              │
└─────────────────────────────────────┘

【未処理タブ】
┌─ 5/10 (土) 10:00-12:00 山田太郎 ────────┐
│ サービス: 居宅介護                       │
│                                          │
│ 申請者:                                   │
│  • 田中花子 (初任者研修)                  │
│    tanaka@... · 2時間前                   │
│    [✓ 承認] [✕ 却下]                      │
│  • 佐藤次郎 (介護福祉士)                  │
│    sato@... · 1時間前                     │
│    [✓ 承認] [✕ 却下]                      │
└──────────────────────────────────────────┘
```

### 操作

- **承認ボタン**: 確認モーダル「○○さんを承認します。同じ予定への他申請は自動で却下されます。よろしいですか?」 → OK で `POST /admin/approve`
- **却下ボタン**: 確認モーダル「○○さんの申請を却下します。よろしいですか?」 → OK で `POST /admin/reject`
- 操作後はリスト全体を再 fetch して整合を保つ

### 履歴タブ

シンプルなテーブル:
| 判定日時 | 判定 | 予定日時 | 利用者 | 申請者 | 判定者 |
|---|---|---|---|---|---|
| 5/6 11:00 | 承認 | 5/10 10-12 | 山田太郎 | 田中花子 | admin@... |

- 上端に「もっと読み込む」ボタン（cursor-based pagination）

### ダッシュボード（index.html）

既存の stats-grid の最後あたりに追加:

```html
<div class="stat-card" id="self-matching-card">
  <div class="stat-card__label">未処理セルフマッチング</div>
  <div class="stat-card__value" id="stat-self-matching">—</div>
</div>
```

`main.js` の `refresh()` で `/api/self-matching/admin/pending` を叩き、`items.length` を表示。0件なら `is-alert` 外す、>0件なら `is-alert` 付与。

---

## 7. 実装ファイル一覧

### 新規（village-tsubasa）

```
functions/src/self-matching/
├── adminAuth.ts        # Firebase Auth id_token 検証 + admin email allow-list（共通）
├── adminPending.ts     # GET /admin/pending
├── adminHistory.ts     # GET /admin/history
├── adminApprove.ts     # POST /admin/approve
├── adminReject.ts      # POST /admin/reject
└── routes.ts           # 既存ファイルにルート追加
```

allow-list は `adminAuth.ts` 内に hard-code:
```typescript
const ALLOWED_ADMIN_EMAILS = [
  "admin@village-support.jp",
  "inachichoco@gmail.com",
  "yutaka.ito1994@gmail.com",
].map((v) => v.toLowerCase());
```

> Phase 2 で Firebase Secret 化検討。Phase 1 は admin_users テーブルとの整合を取りやすい hard-code で。

### 新規（village-admin）

```
public/
├── self-matching.html  # 新規ページ
├── self-matching.js    # 新規 JS
```

既存の修正:
```
public/index.html       # ナビ追加 + ダッシュボードに stats-grid 1 枚追加
public/main.js          # village-tsubasa の /api/self-matching/admin/pending 取得 + バッジ更新
public/schedule.html    # ナビ追加
public/training.html    # ナビ追加
public/search.html      # ナビ追加
public/service-notes-move.html  # ナビ追加
public/service-notes-home.html  # ナビ追加
public/records-home.html  # ナビ追加
public/helper-qualification.html  # ナビ追加
public/audit/index.html  # ナビ追加（あれば）
```

> ナビが各 HTML に重複定義されているのは既存の課題。将来は include 化したい（FUTURE_IDEAS 候補）。

`public/main.js` 内の `TRAINING_API_BASE = "https://village-tsubasa.web.app/api"` パターンを再利用し、self-matching 用 base を共有定数にしてもよい。

---

## 8. デプロイ手順

```bash
# 1. village-tsubasa: API 実装
cd ~/village-tsubasa
firebase deploy --only functions:api

# 2. village-admin: UI 実装
cd ~/village-admin
firebase deploy --only hosting
```

---

## 9. テスト観点

### API
- [ ] `Authorization` ヘッダー無し → 401
- [ ] 不正な id_token → 401
- [ ] allow-list に無い email の id_token → 403
- [ ] pending 一覧: status='pending' のみ、deleted/filled な schedule は出ない
- [ ] approve: 該当 claim approved + schedule.helper_email 更新 + 他 claim rejected
- [ ] approve: schedule.helper_email が既にセットされていたら 409、claim は pending のまま
- [ ] approve: 既に approved/rejected の claim を再度 approve しようとしたら 409
- [ ] reject: status='rejected' に更新、schedule は触らない

### 単体テスト用 SQL（既存仕様書から流用）

```sql
-- 1) 未割当な予定に対して claim を1件作る (テスト用)
insert into schedule_claims (schedule_id, helper_email, status, note)
select id, 'yuki200164@gmail.com', 'pending', 'テスト申請'
from schedule
where helper_email is null
  and date >= current_date
  and (name is null or trim(name) = '')
  and client is not null
  and start_time is not null
limit 1;

-- 2) 承認後の検証
select id, status, decided_at, decided_by from schedule_claims
where helper_email='yuki200164@gmail.com'
order by created_at desc
limit 5;

select id, helper_email, name, synced_to_sheet from schedule
where id = '<上記 claim の schedule_id>';
-- helper_email='yuki200164@gmail.com', name と synced_to_sheet は触らない
```

### UI 手動シナリオ
1. 三枝さん（実在の `enable_self_matching=true` ヘルパー）として `/self-matching/` から空き予定に claim
2. 別の対象ヘルパーでも同じ予定に claim
3. admin で `/self-matching.html` を開き、両者が同じカード内に表示されることを確認
4. 一方を承認 → schedule に helper_email が入り、他方が rejected になる
5. 履歴タブで両方の判定が記録されている
6. ダッシュボードの「未処理セルフマッチング N件」が更新される

### 競合シナリオ
- 2 つのブラウザで同じ claim を同時に approve → 1 つは成功、もう 1 つは 409
- 別経路で `schedule.helper_email` が埋められた後の approve → 409、claim は pending のまま

---

## 10. RULES.md 準拠チェック

- ✅ ルール2: テーブル変更は **追加のみ**（`schedule_claims` の `decided_at`/`decided_by` は既存。`helper_master` は触らない）
- ✅ ルール3: 既存 API は触らない、新規 API のみ追加
- ⚠️ ルール4: `schedule.helper_email` UPDATE は重要テーブル変更 → 本ドキュメントで事前共有済み。`name` / `synced_to_sheet` は触らない方針で他アプリへの影響を最小化
- ⏳ ルール5: 実装後に `CHANGELOG.md` / `SUPABASE_SCHEMA.md` の `schedule_claims` 「参照箇所」を更新
- ⚠️ ルール9: village-admin リポは GitHub remote 未設定（🔴 危険）→ **本実装の事前作業として奥原さんが remote 設定** （2026-05-06 別タスクで実行中）

---

## 11. フォローアップ（Phase 2 候補）

- ヘルパーへの結果通知（Push/メール/LINE）
- 利用者との相性（`user_helper_compatibility`）を UI に出す
- 申請メモ（`note`）を UI に出す
- 「却下理由」を選択式で記録（テーブル列追加が必要）
- 承認の取消（一度確定した予定を解除する管理画面）
- ナビの include 化（重複解消）
- 1 日 1 回の pending サマリメール
- `schedule.name` 自動補完 / `synced_to_sheet=false` リセット（GAS 同期との整合確認後）

---

## 関連ファイル一覧（village-tsubasa 既存）

- `functions/src/self-matching/listCandidates.ts` — 候補一覧 API
- `functions/src/self-matching/claimSchedule.ts` — claim INSERT
- `functions/src/self-matching/withdrawClaim.ts` — claim withdraw
- `functions/src/self-matching/routes.ts` — Express ルーター
- `public/self-matching/index.html` `main.js` `style.css` — ヘルパー側 UI
- `docs/SUPABASE_SCHEMA.md` — schedule_claims, helper_master の定義
- `docs/CURRENT_STATE.md` — API + 画面一覧
- `docs/CHANGELOG.md` 2026-05-06 エントリ — 実装の背景

---

## 更新履歴

- 2026-05-06: 初版作成（奥原翼 + Claude Opus 4.7、当該チャットでの仕様確定）
- 2026-05-06: 既存 5/6 仕様書 (`ff7da8b`) と統合。allow-list / 対象ヘルパー / テスト SQL を取り込み
