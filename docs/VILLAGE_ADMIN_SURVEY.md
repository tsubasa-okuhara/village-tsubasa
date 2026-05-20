# village-admin 実態調査レポート

調査日: 2026-05-12

## 判定: **C（統合・既に統合運用中の姉妹システム）**

village-admin は village-tsubasa とは別 Firebase プロジェクト・別リポジトリだが、
**同一 Supabase バックエンドを共有し、API 連携している管理画面アプリ**。
村つばさ全体は「3 アプリ横断」構成（CHANGELOG 冒頭に明記）で、village-admin は
そのうちの「事業所内部の業務管理／監査書類生成／セルフマッチング承認」担当。

別物でも、置き換え対象でもない。**現在も活発に開発中**（最終コミット 2026-05-06、
6 日前）。

---

## 1. ローカルリポジトリ

| 項目 | 値 |
| --- | --- |
| パス | `~/village-admin/` |
| origin | `https://github.com/tsubasa-okuhara/village-admin.git` |
| 現ブランチ | `main` |
| 最終コミット | `466ec67` 2026-05-06 20:31 「セルフマッチング承認 UI を deploy 完了に更新」 |
| コミット履歴 | 4 件（`debfa03` 初期セットアップ → 全機能実装 → records-home/nav-prefs/セルフマッチング承認UI → CHANGELOG 更新） |

ローカルにフル一式が存在: `public/`（HTML/JS 24 ファイル）、`functions/`（TypeScript、
firebase-functions v6、Express、Supabase JS、ExcelJS、JSZip）、`sql/`、CHANGELOG、
設計書 PDF/docx、Supabase スキーマダンプなど。

## 2. GitHub リモートの存在確認

`gh repo view tsubasa-okuhara/village-admin` は **HTTP 401**（ローカル CLI の token
が失効）。未認証で `gh api repos/tsubasa-okuhara/village-admin` を叩くと **HTTP 404**。

→ **public リポではない**（404 は private or 存在せず）。ただし `git remote` に URL が
設定されており、CHANGELOG 内から村つばさ側 PR
`tsubasa-okuhara/village-tsubasa#5` を参照していること、`origin/main` をローカルが
追跡していることから、**奥原氏の private リポとして存在している可能性が極めて
高い**（要再認証で確認）。

## 3. デプロイ先 URL の挙動

`https://village-admin-bd316.web.app` は live。

- タイトル: 「ダッシュボード — village-admin」
- アプリ名: ビレッジ管理アプリ
- 用途: **介護サービス記録管理（移動支援・居宅介護）の事業所内業務管理ツール**
- ダッシュボード KPI: 未記録件数（移動支援/居宅介護別）、完成件数、本日の予定、
  エラー通知、未読研修報告、**セルフマッチング承認待ち**
- ナビ: スケジュール、研修、検索・印刷、サービス記録（移動/居宅）、実績記録票、
  ヘルパー資格、監査書類、セルフマッチング
- ログイン: 既にログイン状態のため画面右上に「ログアウト」。`login.html` は別途
  存在（Firebase Auth）。

## 4. village-tsubasa との関係

### 別プロジェクトである根拠

| | village-admin | village-tsubasa |
| --- | --- | --- |
| Firebase project | `village-admin-bd316` | （別プロジェクト） |
| Hosting URL | `village-admin-bd316.web.app` | 別ドメイン |
| GitHub | `tsubasa-okuhara/village-admin` | `tsubasa-okuhara/village-tsubasa` |
| 役割 | 事業所内・管理者向け（業務記録・監査・承認） | ヘルパー向けマッチング |
| UI | Vanilla JS + 静的 HTML | （別スタック） |

### 既に統合されている根拠

1. **同一 Supabase DB を共有**: `helper_master`, `schedule`, `admin_users` などの
   テーブルを両方が参照。`schedule.helper_email` を admin が承認時に更新する
   仕様（CHANGELOG）。
2. **API 連携が live**: village-tsubasa 側に
   `/api/self-matching/admin/{pending,history,approve,reject}` が実装され、
   village-admin から Firebase Auth `id_token` を Bearer 認証で叩く。
   2026-05-06 に PR #5 として merge し本番デプロイ済み。
3. **共通 admin allow-list**: village-tsubasa の `functions/src/middleware/adminAuth.ts`
   と同じ 3 名の admin_users で認可。
4. **CHANGELOG で明示的にクロスリファレンス**: village-admin の CHANGELOG 冒頭に
   「3アプリ横断の正規版・時系列詳細は `village-tsubasa/docs/CHANGELOG.md` を参照」
   と記載。`HANDOFF_VILLAGE_ADMIN_SELF_MATCHING.md` も村つばさ docs 配下。

### 機能スコープ（重複なし）

village-admin だけが持つ機能（村つばさには無い）:

- 監査書類: シフト表（月次マトリクス、居宅/移動タブ）、勤務形態一覧表（常勤換算 ÷173.8）
- 実績記録票（records-home）
- サービス記録（移動・居宅）
- 研修管理
- ヘルパー資格管理
- 検索・印刷（Excel 出力: ExcelJS、ZIP まとめ: JSZip）
- エラー通知ダッシュボード
- セルフマッチング**承認**側 UI（申請側は村つばさ）

→ 機能的に**完全に補完関係**で、置き換え/重複は無し。

## 5. 結論と推奨アクション

- **判定: C（統合・既に統合済み）**
- 何もしなくて良い。両アプリは既に同一 Supabase + API 連携で一体運用されている。
- 村つばさ側 docs から village-admin を「外部システム」扱いせず、
  「同エコシステムの管理画面コンポーネント」として扱うのが正確。
- GitHub リポの存在確認だけ宿題として残る（`gh auth login` で
  tsubasa-okuhara アカウントを再認証すれば確認可能）。private リポと推定。

### 補足: D 要素

判定 C で確度は高いが、以下は奥原氏に念のため確認したい:

- 「3 アプリ横断」の **3 つ目**が何か（village-admin / village-tsubasa の他に何があるか。
  「Village Tsubasa Schedule App」というディレクトリが `~/` にあるのでこれが
  3 つ目の可能性）。
- village-admin の今後のロードマップ（村つばさ側に統廃合する計画があるか、
  独立した別アプリとして残すか）。
