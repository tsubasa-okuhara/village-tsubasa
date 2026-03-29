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
  on nullif(btrim(s.name), '') = hm.helper_name;

comment on view public.schedule_web_v is 'Webアプリ表示用に schedule を整形した view';
