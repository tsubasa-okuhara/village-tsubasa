-- ============================================================
-- 1. 既存データの helper_email を一括補完
--    helper_email が空 or NULL のレコードに helper_master から埋める
-- ============================================================

-- home_schedule_tasks
UPDATE public.home_schedule_tasks t
SET helper_email = hm.helper_email
FROM public.helper_master hm
WHERE btrim(t.helper_name) = hm.helper_name
  AND (t.helper_email IS NULL OR btrim(t.helper_email) = '');

-- schedule_tasks_move
UPDATE public.schedule_tasks_move t
SET helper_email = hm.helper_email
FROM public.helper_master hm
WHERE btrim(t.helper_name) = hm.helper_name
  AND (t.helper_email IS NULL OR btrim(t.helper_email) = '');

-- schedule（元テーブルも念のため）
UPDATE public.schedule t
SET helper_email = hm.helper_email
FROM public.helper_master hm
WHERE btrim(t.name) = hm.helper_name
  AND (t.helper_email IS NULL OR btrim(t.helper_email) = '');


-- ============================================================
-- 2. トリガー関数: INSERT / UPDATE 時に helper_email を自動補完
-- ============================================================

-- home_schedule_tasks 用
CREATE OR REPLACE FUNCTION public.fill_helper_email_home()
RETURNS trigger AS $$
BEGIN
  IF (NEW.helper_email IS NULL OR btrim(NEW.helper_email) = '') AND NEW.helper_name IS NOT NULL THEN
    SELECT hm.helper_email INTO NEW.helper_email
    FROM public.helper_master hm
    WHERE hm.helper_name = btrim(NEW.helper_name)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fill_helper_email_home ON public.home_schedule_tasks;
CREATE TRIGGER trg_fill_helper_email_home
  BEFORE INSERT OR UPDATE ON public.home_schedule_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_helper_email_home();


-- schedule_tasks_move 用
CREATE OR REPLACE FUNCTION public.fill_helper_email_move()
RETURNS trigger AS $$
BEGIN
  IF (NEW.helper_email IS NULL OR btrim(NEW.helper_email) = '') AND NEW.helper_name IS NOT NULL THEN
    SELECT hm.helper_email INTO NEW.helper_email
    FROM public.helper_master hm
    WHERE hm.helper_name = btrim(NEW.helper_name)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fill_helper_email_move ON public.schedule_tasks_move;
CREATE TRIGGER trg_fill_helper_email_move
  BEFORE INSERT OR UPDATE ON public.schedule_tasks_move
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_helper_email_move();


-- schedule（元テーブル）用
CREATE OR REPLACE FUNCTION public.fill_helper_email_schedule()
RETURNS trigger AS $$
BEGIN
  IF (NEW.helper_email IS NULL OR btrim(NEW.helper_email) = '') AND NEW.name IS NOT NULL THEN
    SELECT hm.helper_email INTO NEW.helper_email
    FROM public.helper_master hm
    WHERE hm.helper_name = btrim(NEW.name)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fill_helper_email_schedule ON public.schedule;
CREATE TRIGGER trg_fill_helper_email_schedule
  BEFORE INSERT OR UPDATE ON public.schedule
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_helper_email_schedule();
