-- 2026-05-03: helper_master に雇用形態列を追加
--
-- 用途: village-admin の監査用「勤務形態一覧表」で常勤/非常勤を表示するため
-- 値:   '常勤' / '非常勤' / null（= 未設定。集計時は「非常勤」扱い）
--
-- ルール2「nullable な列追加」に該当 → 既存アプリへの破壊的影響なし

ALTER TABLE helper_master
  ADD COLUMN IF NOT EXISTS employment_type text;

COMMENT ON COLUMN helper_master.employment_type IS
  '雇用形態（''常勤'' / ''非常勤'' / null）。村のつばさ admin 監査用';
