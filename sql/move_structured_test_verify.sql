select
  id,
  schedule_task_move_id,
  helper_email,
  helper_name,
  user_name,
  service_date,
  start_time,
  end_time,
  task,
  summary_text,
  created_at
from public.service_notes_move
where helper_email = 'move.test.helper@example.com'
order by created_at desc;

select
  id,
  source_type,
  source_note_id,
  schedule_task_id,
  helper_email,
  helper_name,
  user_name,
  service_date,
  start_time,
  end_time,
  location,
  location_note,
  time_of_day,
  temperature,
  physical_state,
  mental_state,
  risk_flags,
  action_result,
  difficulty,
  assist_level,
  created_at,
  updated_at
from public.service_record_structured
where helper_email = 'move.test.helper@example.com'
order by created_at desc;

select
  a.id,
  a.structured_record_id,
  h.helper_email,
  a.action_type,
  a.action_detail,
  a.action_detail_other,
  a.actor,
  a.target,
  a.start_time,
  a.end_time,
  a.duration,
  a.action_result,
  a.difficulty,
  a.assist_level,
  a.created_at
from public.service_action_logs as a
join public.service_record_structured as h
  on h.id = a.structured_record_id
where h.helper_email = 'move.test.helper@example.com'
order by a.created_at desc;

select
  e.id,
  e.structured_record_id,
  h.helper_email,
  e.event_type,
  e.before_state,
  e.after_action,
  e.created_at
from public.service_irregular_events as e
join public.service_record_structured as h
  on h.id = e.structured_record_id
where h.helper_email = 'move.test.helper@example.com'
order by e.created_at desc;
