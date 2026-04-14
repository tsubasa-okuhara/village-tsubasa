-- ============================================================
-- 落ち着き確認システム (Calm Check System)
-- ============================================================

-- 1. 対象利用者テーブル（管理者が追加・削除できる）
CREATE TABLE IF NOT EXISTS calm_check_targets (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     UUID NOT NULL,          -- clients テーブルの id
  client_name   TEXT NOT NULL,          -- 表示用（例: 上倉 晃輝）
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calm_check_targets_active
  ON calm_check_targets(is_active);

-- 初期データ: 2名
INSERT INTO calm_check_targets (client_id, client_name) VALUES
  ('af66a826-7d51-460e-8d12-9cfc5ed5e9dd', '上倉 晃輝'),
  ('1a43c81a-716b-4819-8755-4792e4838e8f', '今井 雄翔')
ON CONFLICT DO NOTHING;


-- 2. 落ち着き確認記録テーブル
CREATE TABLE IF NOT EXISTS calm_checks (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 誰の確認か
  client_id         UUID NOT NULL,
  client_name       TEXT NOT NULL,

  -- 誰が回答したか
  helper_email      TEXT NOT NULL,
  helper_name       TEXT,

  -- スケジュール情報（紐づけ）
  schedule_task_id  UUID,               -- schedule_tasks_move の id
  service_date      DATE NOT NULL,
  start_time        TEXT,               -- 開始時間（例: "10:00"）
  end_time          TEXT,               -- 終了時間（例: "12:00"）
  task_name         TEXT,               -- 支援場所・内容

  -- 回答内容
  is_calm           BOOLEAN NOT NULL,   -- true=落ち着いていた, false=落ち着いていなかった
  severity          TEXT,               -- null | 'overall' (全体的に) | 'partial' (部分的に)
  memo              TEXT,               -- 自由記述メモ

  -- ステータス
  status            TEXT NOT NULL DEFAULT 'pending',
  -- pending: 未回答（通知表示中）
  -- answered: 回答済み
  -- skipped: スキップ（記録完了で自動クローズ）

  -- LINE 共有（将来用）
  shared_to_line    BOOLEAN NOT NULL DEFAULT false,
  shared_at         TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_calm_checks_helper
  ON calm_checks(helper_email);
CREATE INDEX IF NOT EXISTS idx_calm_checks_status
  ON calm_checks(status);
CREATE INDEX IF NOT EXISTS idx_calm_checks_date
  ON calm_checks(service_date DESC);
CREATE INDEX IF NOT EXISTS idx_calm_checks_client
  ON calm_checks(client_id);
CREATE INDEX IF NOT EXISTS idx_calm_checks_task
  ON calm_checks(schedule_task_id);
