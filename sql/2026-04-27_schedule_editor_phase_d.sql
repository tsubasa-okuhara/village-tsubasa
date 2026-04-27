-- =============================================================
-- Phase D: schedule-editor 論理削除対応
-- =============================================================
--
-- 適用日: 2026-04-27
-- 目的:
--   schedule_web_v に WHERE s.deleted_at IS NULL を追加し、
--   論理削除されたレコードを Web 表示から除外する。
--
-- 影響:
--   - schedule_web_v を参照している全 API（schedule-list / today /
--     tomorrow / helper-summary / next-helper / 通知）も自動で
--     deleted_at IS NULL の行のみ返すようになる。
--   - 既に deleted_at が NULL の行のみ存在しているはず（Phase A で列追加、
--     未だ削除操作なし）なので、データ可視性に変化は無い。
--
-- ロールバック:
--   このファイル末尾の rollback 用 SQL を実行すれば元に戻せる
--   （deleted_at フィルタを削除）。
-- =============================================================

drop view if exists public.schedule_web_v;

create view public.schedule_web_v as
select
  s.id,
  s.date,

  case
    when nullif(btrim(s.name), '') is null then '担当未設定'
    else btrim(s.name)
  end as name,

  coalesce(
    nullif(btrim(s.helper_email), ''),
    hm.helper_email
  ) as helper_email,

  nullif(btrim(s.client), '') as client,

  nullif(btrim(s.start_time), '') as start_time,

  case
    when nullif(btrim(s.start_time), '') is not null
     and nullif(btrim(s.end_time), '') is not null
      then nullif(btrim(s.end_time), '')
    else null
  end as end_time,

  coalesce(nullif(btrim(s.haisha), ''), '—') as haisha,

  nullif(btrim(s.task), '') as task,

  case
    when nullif(btrim(s.summary), '') is null then null
    when btrim(s.summary) in ('概要なし', '—', '-') then null
    else btrim(s.summary)
  end as summary,

  nullif(btrim(s.beneficiary_number), '') as beneficiary_number,

  s.created_at,
  s.updated_at
from public.schedule s
left join public.helper_master hm
  on nullif(btrim(s.name), '') = hm.helper_name
where s.deleted_at is null;  -- ← Phase D で追加

comment on view public.schedule_web_v is
  'Webアプリ表示用に schedule を整形した view（Phase D 以降は deleted_at IS NULL のみ）';

-- view は security_invoker で動かす（呼び出し元の権限で評価）
alter view public.schedule_web_v set (security_invoker = true);

-- =============================================================
-- ロールバック用（必要な場合に手動で実行）
-- =============================================================
--
-- drop view if exists public.schedule_web_v;
-- create view public.schedule_web_v as
-- select
--   ... (above without WHERE s.deleted_at is null)
-- from public.schedule s
-- left join public.helper_master hm
--   on nullif(btrim(s.name), '') = hm.helper_name;
