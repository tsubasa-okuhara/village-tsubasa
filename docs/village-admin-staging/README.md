# village-admin-staging/ — 管理者リポ向けの契約管理UI雛形

> このフォルダに入っているファイルは **別リポ `village-admin`** にコピーするための staging です。
> ここで編集してから `tsubasa-okuhara/village-admin` の `public/` 配下にコピーしてください。

## コピー先対応表

| staging のパス | コピー先（village-admin リポ） | 用途 |
|---|---|---|
| `public/contracts.html` | `public/contracts.html` | 契約一覧 |
| `public/contracts-new.html` | `public/contracts-new.html` | 新規契約作成 |
| `public/contracts-templates.html` | `public/contracts-templates.html` | テンプレート管理 |

## コピー手順

```bash
# village-admin リポ側で
cd ~/path/to/village-admin

# staging からコピー
cp ~/path/to/village-tsubasa/docs/village-admin-staging/public/contracts.html public/
cp ~/path/to/village-tsubasa/docs/village-admin-staging/public/contracts-new.html public/
cp ~/path/to/village-tsubasa/docs/village-admin-staging/public/contracts-templates.html public/

# ナビゲーションに「📄 契約」リンクを追加（既存の training.html リンクの近くに）
# 全6ページ（index / schedule / search / service-notes-move / service-notes-home / helper-qualification / training）の
# ナビに <a href="/contracts.html">📄 契約</a> を追加

# ダッシュボード（index.html）のサマリカード領域に「署名待ち契約 N件」を追加
# 既存の30秒ポーリング処理に /api/contracts?status=pending_signature&email=... を追加

# デプロイ
firebase deploy --only hosting
```

## village-tsubasa API への依存

本staging の HTML は以下のエンドポイントを叩きます（すべて **すでに村ひろば側でデプロイ済みの想定**）:

- `GET  /api/contracts/templates?email=...&includeInactive=1`
- `POST /api/contracts/templates`
- `GET  /api/contracts/templates/:id`
- `POST /api/contracts/templates/:id/new-version`
- `POST /api/contracts/templates/:id/deactivate`
- `GET  /api/contracts?email=...&kind=...&status=...`
- `POST /api/contracts`
- `POST /api/contracts/:id/send` （Phase 3.2 まで 501）
- `POST /api/contracts/:id/revoke`
- `GET  /api/contracts/:id/audit`

## Phase 3.2 への繋ぎ方

`contracts-new.html` の「送信」ボタンは Phase 3 スタブでは 501 が返る状態。
Phase 3.2 で `providers/cloudsign.ts` の実装が完了したら、ボタンを押すだけで本送信に切り替わる
（UI 側は改修不要）。

## スタイルの前提

village-admin の既存 `public/style.css` を流用（背景・カード・chip ボタン等のクラス名）。
staging の HTML は `style.css` の既存クラスを可能な限り使う方針。
独自クラスが必要な場合は `<style>` タグ内で定義しておく（後で共通化）。
