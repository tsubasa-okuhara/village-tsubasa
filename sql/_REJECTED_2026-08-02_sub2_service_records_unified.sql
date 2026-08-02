-- =============================================================================
-- ⚠️ 【未採用案・実行禁止】 2026-08-02
--
-- このファイルは検討段階の DDL 案であり、**実行されていない**。
-- 実際に sub2 に作られたのは、旧DB と同じ居宅／移動の 2 テーブル:
--     service_records_home (16列 + memo)  /  service_records_move (18列 + notes)
-- 列名も visit_date ではなく service_date（旧DB 踏襲）。visit_key は持たない。
--
-- この案（service_records 1テーブル統合・visit_* 列名・visit_key あり）を
-- そのまま実行すると、実在しない別テーブルができて破綻する。
--
-- 経緯と実際の構造は docs/HANDOFF_2026-08-02_sub2_service_records.md §9 を参照。
-- 記録として残すだけのファイル。
-- =============================================================================

-- =============================================================================
-- sub2 (gmellfgcyypfrtjxblla) : サービス記録テーブル
-- 2026-08-02 作成
--
-- 【前提】
--   2026-08 以降、予定は sub2 の schedule_entries に一本化されている。
--   記録側は旧DB (pbqqqwwgswniuomjlhsh) に取り残されているため、sub2 に新設する。
--   旧DB の service_notes_home / service_notes_move の後継。
--
-- 【sub2 への DDL 制約】
--   sub2 は他者が構築した本番環境。ALTER / DROP / TRUNCATE / DELETE は行わない。
--   IF NOT EXISTS / OR REPLACE も使わない（既存物との衝突をエラーとして検知するため）。
--   本ファイルは新規オブジェクトの CREATE のみで構成する。
--
-- 【設計方針】
--   - 記録行の存在＝記入済み。schedule_entries に status を持てないため
--     未記入一覧は「schedule_entries にあって service_records に無い」で出す。
--   - 二重保存防止は record_uuid の UNIQUE で担保する。
--   - 居宅/移動は service_type 列で 1 テーブルに統合する。
-- =============================================================================

CREATE TABLE service_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ---- 記録の独自 ID（二重保存防止 + 実績記録との突合） ---------------------
  -- GAS が転送時に発行し、転送シート J 列と一致させる値。
  -- この UNIQUE が二重保存防止として機能する前提は次の 2 つ。どちらも GAS 側の
  -- 設計として確定済み（2026-08-02 奥原）:
  --   1. J 列の UUID は行ごとに 1 回だけ発行し、再同期でも振り直さない
  --   2. アプリは J 列由来の UUID をそのまま送る（アプリ側で発行しない）
  -- この前提が崩れると二重送信で別 UUID が 2 件入るため、GAS を変更する際は
  -- 必ずここを読み直すこと。
  record_uuid         uuid NOT NULL UNIQUE,

  -- ---- 実績記録との突合条件 -------------------------------------------------
  visit_date          date NOT NULL,
  visit_start_time    time,
  visit_end_time      time,
  visit_helper_name   text,
  visit_user_name     text,
  -- 移動支援の目的地。sub2 の schedule_entries に専用列が無いため、
  -- 何を入れるかは GAS 転送側の仕様に合わせて決める（下部メモ参照）。
  destination         text,

  -- ---- 訪問の同一性（参考列。UNIQUE は張らない） ----------------------------
  -- delay_notices.visit_key と同一フォーマット:
  --   "YYYY-MM-DD|HH:MM|正規化利用者名|正規化ヘルパー名"
  --   正規化は delayNotify.ts の normalizeName()（空白除去 + 末尾「様」除去）
  -- record_uuid が再同期で振り直される設計だと UNIQUE(record_uuid) は
  -- 同一訪問の二重記録を防げない。その場合にここへ UNIQUE を後付けできるよう、
  -- 列とインデックスだけ先に用意しておく（後から列を足すと埋め戻しが必要になる）。
  visit_key           text,

  -- ---- 予定行への参考リンク（FK も UNIQUE も張らない） ----------------------
  -- schedule_entries.id は週シート再同期のたびに振り直される
  -- （同一予定で +6259 ずれた実測、8月分の行数が 4526→4380 と 146 件変動）。
  -- 永続的な参照キーには使えないので、あくまで転送時点の参考値として持つ。
  schedule_entry_id   bigint,

  -- ---- 記録の属性 -----------------------------------------------------------
  service_type        text NOT NULL,
  recipient_number    text,
  helper_email        text,
  task                text,

  -- ---- 居宅固有（service_type = 'move' では NULL） --------------------------
  memo                text,
  ai_summary          text,
  final_note          text,

  -- ---- 移動固有（service_type = 'home' では NULL） --------------------------
  haisha              text,
  notes               text,
  summary_text        text,

  -- ---- 送信・監査 -----------------------------------------------------------
  sent_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT service_records_service_type_chk
    CHECK (service_type IN ('home', 'move')),

  -- 本文が空の記録が入るのを防ぐ。厳しすぎる場合はこの 2 つを外してよい。
  CONSTRAINT service_records_home_body_chk
    CHECK (service_type <> 'home' OR final_note IS NOT NULL),
  CONSTRAINT service_records_move_body_chk
    CHECK (service_type <> 'move' OR summary_text IS NOT NULL)
);

-- 未記入一覧は月内の日付範囲で引くため、visit_date が主たる絞り込み列。
CREATE INDEX idx_service_records_visit_date
  ON service_records (visit_date);

-- ヘルパー個人の記録一覧・突合用。
CREATE INDEX idx_service_records_helper_date
  ON service_records (visit_helper_name, visit_date);

CREATE INDEX idx_service_records_helper_email
  ON service_records (helper_email);

-- visit_key での突合用（UNIQUE ではない）。
CREATE INDEX idx_service_records_visit_key
  ON service_records (visit_key);


-- =============================================================================
-- 積み残しメモ（このファイルでは作らない）
-- =============================================================================
-- 1. destination に何を入れるか
--    sub2 の schedule_entries に目的地の専用列が無い。近いのは
--    transport（配車）/ support_flow（支援の流れ）で、いずれも目的地そのものでは
--    ない。GAS 転送側で転送シートのどの列を destination に入れるかを決めてから、
--    アプリ側の突合ロジックを書くこと。
--
-- 2. 構造化ログ（旧 service_action_logs_home 相当）
--    home の任意入力機能。8 月開始に必須ではないため後回し。
--    必要になった時点で service_action_logs を CREATE TABLE で追加する
--    （service_records.id を参照する FK 付き）。
--
-- 3. 旧DB から持ち込まなかった列と理由
--    - source_key    : 生成元が伊藤さん管理の GAS プロジェクトにあり仕様が不明
--    - schedule_id   : 旧DB でも FK 制約が無く用途不明
--    - condition / special_notes_type / special_notes_detail
--                    : 現行の saveRecord がどちらも書いていない（未使用列）
--    - status        : 記録行の存在そのもので代替する
--
-- 4. 未記入一覧の実装
--    schedule_entry_id に FK を張らないため PostgREST の埋め込み JOIN は使えない。
--    「schedule_entries を GET → service_records を GET → アプリ側で突合」になる。
--    突合キーは record_uuid（予定側が J 列 UUID を持つ場合）。
-- =============================================================================
