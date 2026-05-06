# HANDOFF — village-admin 側で実装する「セルフマッチング承認 UI」

> このドキュメントは **village-admin リポ** での実装作業のために、village-tsubasa 側で
> 完成した Phase 1 (ヘルパーセルフマッチング) の前提と、admin 側で必要な機能・実装手順を
> まとめた引き継ぎ書です。
>
> village-admin の新規チャットで開いてください。本ドキュメントのコピペ + 「これに沿って
> village-admin に承認 UI を実装してほしい」と渡せば即作業可能です。

最終更新: 2026-05-06 (奥原翼 + Claude Opus / village-tsubasa Phase 1 完了直後)

---

## 0. 5分で読む全体像

ヘルパー側 (village-tsubasa) は完成済み:

```
[ヘルパー]
   ↓ /self-matching/ ページで「入れます」をタップ
   ↓ POST /api/self-matching/claim
   ↓
[Supabase: schedule_claims テーブル]
   status='pending' で行が増える
   ↓
[ここからが village-admin の仕事]   ← 本ドキュメントのスコープ
   - 未承認 claim 一覧を表示
   - approve/reject ボタン
   - approve したら schedule.helper_email を確定
   ↓
[ヘルパー]
   - 自分の claim が approved に → 確定通知 (将来)
```

---

## 1. 既に整備済み (前提)

### 1.1 Supabase スキーマ

既に DDL 適用済 (2026-05-06)。`SUPABASE_SCHEMA.md` に詳細あり。

#### `helper_master.enable_self_matching` (boolean, NOT NULL, default false)
セルフマッチングに参加するヘルパーのフラグ。現在 7 名 true:
- yuki200164@gmail.com (三枝)
- zhongtiannasu@gmail.com (中野)
- 141213zero@gmail.com (久保田)
- shinichi.hr22@gmail.com (伊藤信一)
- mrokrs1212@gmail.com (村岡)
- 8ha8ya4shi@gmail.com (林)
- dannyfrommorikiko@gmail.com (樋口)

#### `schedule_claims` テーブル
```
id              uuid PK (default gen_random_uuid())
schedule_id     uuid NOT NULL → schedule(id) ON DELETE CASCADE
helper_email    text NOT NULL
status          text NOT NULL DEFAULT 'pending'
                CHECK in ('pending','approved','rejected','withdrawn')
priority_score  numeric default 0
note            text
created_at      timestamptz default now()
updated_at      timestamptz default now()  ← トリガーで自動更新
decided_at      timestamptz
decided_by      text  ← admin の email
UNIQUE(schedule_id, helper_email)
```

RLS は ON、policy 未設定。**Cloud Functions は service_role キーで bypass する想定**(既存パターン踏襲)。

### 1.2 ヘルパー側 API (village-tsubasa、既に live)

| Method | Path | 用途 |
|---|---|---|
| GET  | `/api/self-matching/candidates?helper_email=...` | 未割当予定 + 自分の claim 状況 |
| POST | `/api/self-matching/claim` | 「入れます」申請 |
| POST | `/api/self-matching/withdraw` | 自分の pending claim を取り下げ |

実装: `tsubasa-okuhara/village-tsubasa` の `functions/src/self-matching/`

### 1.3 schedule テーブル (連携先)
- 列: `id` (uuid), `date`, `name`, `helper_email`, `client`, `start_time`, `end_time`, `task`, `haisha`, `summary`, `beneficiary_number`, `deleted_at` 他
- 注意: **複数アプリ共有テーブル**(⚠️マーク)。RULES.md ルール4 該当
- approve 時に `schedule.helper_email` と `schedule.name` を UPDATE する必要あり

---

## 2. village-admin 側で作るもの

### 2.1 新規画面: `/self-matching-admin.html`

**目的**: 未承認 claim の一覧表示と approve/reject 操作。

#### 表示要件

| エリア | 内容 |
|---|---|
| ヘッダー | 「セルフマッチング承認」タイトル + 既存ナビ |
| stat-card | 未処理件数(`pending` カウント) |
| メイン | claim カード一覧(新しい順) |
| 各カード | 申請日時 / ヘルパー名+email / 予定日 / 時間 / 利用者 / task / haisha / サマリ / [✅承認] [❌却下] ボタン |

#### カード内の表示項目

```
┌─────────────────────────────────────────────────┐
│ 🕐 2026-05-07 14:23 申請                       │
│ 🙋 三枝 (yuki200164@gmail.com)                 │
│                                                 │
│ 📅 2026-05-10 (土) 09:00〜10:30               │
│ 👤 田中太郎様                                   │
│ 📝 身体  🚗 配車なし                            │
│ 補足: 朝の身支度サポート                        │
│                                                 │
│ note(ヘルパー添えメッセージ): 入れます          │
│                                                 │
│ 他に 1 名が申請中  ← 同じ schedule への他 claim │
│                                                 │
│ [✅ 承認 (この人で確定)]  [❌ 却下]              │
└─────────────────────────────────────────────────┘
```

**他のヘルパーも同じ予定に申請している場合**: カード下部に「他の申請者」リストを表示。
複数候補から1人を選ぶUI、または「全員却下」ボタンも欲しい。

#### フィルタ

- ステータス: pending(デフォルト) / approved / rejected / withdrawn / 全て
- 期間: 直近30日(デフォルト) / 全期間
- ヘルパー名で絞り込み(任意)

### 2.2 新規 API (village-admin の Cloud Functions)

ベースURL: `https://asia-northeast1-village-admin-bd316.cloudfunctions.net/api`
(または village-admin が独自にもつパス)

#### `GET /api/self-matching/claims`
未承認 claim の一覧を返す。schedule との JOIN 込みで欲しい:

```typescript
// クエリパラメータ
status?: 'pending' | 'approved' | 'rejected' | 'withdrawn'  // 省略時 'pending'
fromDate?: string  // 'YYYY-MM-DD' 申請日 from
toDate?: string    // 申請日 to
helperEmail?: string  // 絞り込み

// レスポンス
{
  ok: true,
  items: [
    {
      claimId: string,
      claimStatus: string,
      claimCreatedAt: string,
      claimNote: string | null,
      helperName: string,        // helper_master から JOIN
      helperEmail: string,
      schedule: {
        id: string,
        date: string,
        client: string,
        startTime: string,
        endTime: string,
        task: string,
        haisha: string,
        summary: string,
        beneficiaryNumber: string,
      },
      otherClaimantsCount: number,  // この schedule への他のpending/approved 申請数
    }
  ]
}
```

#### `POST /api/self-matching/approve`

```typescript
// リクエスト
{
  claimId: string,
  decidedBy: string,  // 管理者の email
}

// 処理 (トランザクション推奨)
1. claim を取得 (schedule_id, helper_email を控える)
2. status='pending' でなければ 409 conflict
3. schedule.helper_email がまだ NULL であることを確認、埋まっていれば 409
4. UPDATE schedule_claims SET status='approved', decided_at=now(), decided_by=$1 WHERE id=$claimId
5. UPDATE schedule SET helper_email=$2, name=$helperName WHERE id=$scheduleId
   (helperName は helper_master から逆引き)
6. 同じ schedule の他の pending claim を status='rejected' に一括 UPDATE
   (1人選んだら他は自動却下)
7. (将来) 通知: 承認されたヘルパーに push or アプリ内通知

// レスポンス
{ ok: true, claim: {...}, schedule: {...} }
```

#### `POST /api/self-matching/reject`

```typescript
// リクエスト
{
  claimId: string,
  decidedBy: string,
  reason?: string,  // 任意
}

// 処理
- UPDATE schedule_claims SET status='rejected', decided_at=now(), decided_by=$1, note=COALESCE(note, $reason) WHERE id=$claimId AND status='pending'
- 0行 → 409

// レスポンス
{ ok: true, claim: {...} }
```

### 2.3 ダッシュボード stat-card 追加

既存 `/index.html` (admin ダッシュボード) に「未承認セルフマッチ申請」を追加:
- pending 件数表示
- クリック → `/self-matching-admin.html` へ遷移
- 30秒ポーリングで件数更新

データ取得: `GET /api/self-matching/claims?status=pending` の `items.length`

### 2.4 (任意) 1日1回サマリメール

夜中に当日 pending 件数を集計し、admin 全員にメール。
village-admin の既存 Scheduler ジョブパターンを踏襲。

---

## 3. 認可

- 全エンドポイントは `admin_users` (既存) の email allow-list で認可
- 既存の adminAuth ミドルウェアを再利用
- `decidedBy` は認証された admin の email を埋める

---

## 4. 競合回避と冪等性

### 4.1 二重承認の防止

複数管理者が同時に同じ claim を approve しようとした場合:

```sql
UPDATE schedule_claims
SET status='approved', decided_at=now(), decided_by=$1
WHERE id=$claimId AND status='pending'
RETURNING *;
```
→ 0行返り = 既に他の admin が処理した、409 を返す。

### 4.2 schedule の helper_email 競合

approve 時、schedule.helper_email が NULL でない場合 (=既にスプレッドシート / user-schedule-app 経由で埋まった場合) は 409 を返し、claim 自動却下提案を表示。

### 4.3 既存 schedule への影響

- `schedule.helper_email` を埋める INSERT/UPDATE は既に user-schedule-app と GAS でも発生する
- approve から UPDATE する際は **`synced_to_sheet` を false に戻す**ことを推奨 (GAS 月次フラッシュで吸収)
- `name` 列も埋める(helper_master からヘルパー表示名を引いて入れる)

---

## 5. 影響範囲チェックリスト (RULES.md 準拠)

- [ ] **Rule 2**: schedule_claims は新規テーブル、helper_master の追加列も nullable+default → OK
- [ ] **Rule 3**: 既存 API の破壊的変更なし、新規エンドポイント追加のみ → OK
- [ ] **Rule 4**: schedule テーブルの UPDATE が新たな経路で発生 → 要確認
  - 既存: user-schedule-app, GAS, schedule-editor (admin内)
  - 追加: schedule_claims approve 時の UPDATE
  - 既存と同じ列を更新するだけなので破壊的変更ではないが、**`synced_to_sheet=false` に戻す**処理は要確認
- [ ] **Rule 5**: `village-admin/CHANGELOG.md` に実装エントリ追記 + `~/village-tsubasa/docs/CHANGELOG.md` の "village-admin リポの変更（転記）" にも転記

---

## 6. テスト手順

### 6.1 単体テスト用データ

```sql
-- village-tsubasa 側で claim を1件INSERT (テスト用)
insert into schedule_claims (schedule_id, helper_email, status, note)
select id, 'yuki200164@gmail.com', 'pending', 'テスト申請'
from schedule
where helper_email is null
  and date >= current_date
  and (name is null or trim(name) = '')
  and client is not null
  and start_time is not null
limit 1;
```

### 6.2 動作確認

1. admin で `/self-matching-admin.html` を開く → claim カードが1件出る
2. 承認ボタン押下 → 確認ダイアログ → 承認実行
3. Supabase で確認:
   ```sql
   select * from schedule_claims where helper_email='yuki200164@gmail.com' order by created_at desc limit 1;
   -- status='approved', decided_at, decided_by 入っている
   
   select id, helper_email, name, synced_to_sheet from schedule where id=$scheduleId;
   -- helper_email='yuki200164@gmail.com', name='三枝', synced_to_sheet=false
   ```
4. ヘルパーアプリ /self-matching/ で同じ予定が「✅ 確定済み」表示になる

### 6.3 競合シナリオ

- 2 つのブラウザで同じ claim を同時に approve → 1 つは成功、もう 1 つは 409
- 別経路で schedule.helper_email が埋められた後の approve → 409

---

## 7. 次のフェーズ (将来)

- ヘルパーへの確定通知 (push or アプリ内通知)
- approve 履歴のエクスポート (CSV)
- 1日1回サマリメール
- 対応可否(○×)データ取り込み後、approve画面に「○: 対応可」「×: 対応外」「△: 条件付」のラベル表示

---

## 8. 関連ファイル一覧 (village-tsubasa 側)

- `functions/src/self-matching/listCandidates.ts` — 候補一覧 API
- `functions/src/self-matching/claimSchedule.ts` — claim INSERT
- `functions/src/self-matching/withdrawClaim.ts` — claim withdraw
- `functions/src/self-matching/routes.ts` — Express ルーター
- `public/self-matching/index.html` `main.js` `style.css` — ヘルパー側 UI
- `docs/SUPABASE_SCHEMA.md` — schedule_claims, helper_master の定義
- `docs/CURRENT_STATE.md` — API + 画面一覧
- `docs/CHANGELOG.md` 2026-05-06 エントリ — 実装の背景

---

質問・確認したいこと、追加要件あれば village-admin チャットで本ドキュメントを下敷きに相談してください。
