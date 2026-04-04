begin;

delete from public.service_irregular_events
where structured_record_id in (
  select id
  from public.service_record_structured
  where helper_email = 'move.test.helper@example.com'
);

delete from public.service_action_logs
where structured_record_id in (
  select id
  from public.service_record_structured
  where helper_email = 'move.test.helper@example.com'
);

delete from public.service_record_structured
where helper_email = 'move.test.helper@example.com';

delete from public.service_notes_move
where helper_email = 'move.test.helper@example.com';

delete from public.schedule_tasks_move
where helper_email = 'move.test.helper@example.com';

do $$
declare
  template_row jsonb;
  payload jsonb;
begin
  select to_jsonb(t)
    into template_row
  from public.schedule_tasks_move as t
  limit 1;

  if template_row is null then
    template_row := '{}'::jsonb;
  end if;

  payload := jsonb_build_array(
    jsonb_strip_nulls(
      template_row
      || jsonb_build_object(
        'id', '0d2b5dc7-2fd8-4729-9b3d-9d9d3a111001',
        'helper_email', 'move.test.helper@example.com',
        'helper_name', '移動テスト担当',
        'user_name', '移動テスト利用者A',
        'date', '2026-03-30',
        'start_time', '09:30',
        'end_time', '10:30',
        'haisha', '通常',
        'task', '病院同行',
        'summary', '自宅から病院まで同行し、受付まで支援するテスト予定',
        'status', 'unwritten',
        'source_key', 'move-structured-test-001',
        'created_at', now(),
        'updated_at', now()
      )
    ),
    jsonb_strip_nulls(
      template_row
      || jsonb_build_object(
        'id', '0d2b5dc7-2fd8-4729-9b3d-9d9d3a111002',
        'helper_email', 'move.test.helper@example.com',
        'helper_name', '移動テスト担当',
        'user_name', '移動テスト利用者B',
        'date', '2026-03-30',
        'start_time', '14:00',
        'end_time', '15:00',
        'haisha', '通常',
        'task', '買い物同行',
        'summary', '近隣店舗での買い物同行テスト予定',
        'status', 'unwritten',
        'source_key', 'move-structured-test-002',
        'created_at', now(),
        'updated_at', now()
      )
    )
  );

  begin
    insert into public.schedule_tasks_move
    select *
    from jsonb_populate_recordset(null::public.schedule_tasks_move, payload);
  exception
    when undefined_column then
      insert into public.schedule_tasks_move (
        id,
        helper_email,
        helper_name,
        user_name,
        date,
        start_time,
        end_time,
        haisha,
        task,
        summary,
        status
      )
      values
        (
          '0d2b5dc7-2fd8-4729-9b3d-9d9d3a111001',
          'move.test.helper@example.com',
          '移動テスト担当',
          '移動テスト利用者A',
          '2026-03-30',
          '09:30',
          '10:30',
          '通常',
          '病院同行',
          '自宅から病院まで同行し、受付まで支援するテスト予定',
          'unwritten'
        ),
        (
          '0d2b5dc7-2fd8-4729-9b3d-9d9d3a111002',
          'move.test.helper@example.com',
          '移動テスト担当',
          '移動テスト利用者B',
          '2026-03-30',
          '14:00',
          '15:00',
          '通常',
          '買い物同行',
          '近隣店舗での買い物同行テスト予定',
          'unwritten'
        );
  end;
end $$;

commit;

select
  id,
  helper_email,
  helper_name,
  user_name,
  date,
  start_time,
  end_time,
  task,
  status,
  summary
from public.schedule_tasks_move
where helper_email = 'move.test.helper@example.com'
order by date asc, start_time asc;
