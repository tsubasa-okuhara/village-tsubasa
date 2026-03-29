create table if not exists public.helper_master (
  helper_name text primary key,
  helper_email text not null
);

comment on table public.helper_master is 'ヘルパー名とメールアドレスの対応マスタ';
comment on column public.helper_master.helper_name is 'schedule.name と一致させるヘルパー表示名';
comment on column public.helper_master.helper_email is 'ヘルパーの通知・予定紐付け用メールアドレス';

-- 例:
-- insert into public.helper_master (helper_name, helper_email) values
-- ('奥原', 'village.tsubasa_4499@iCloud.com'),
-- ('伊藤', 'ito@example.com'),
-- ('池田', 'ikeda@example.com')
-- on conflict (helper_name) do update
-- set helper_email = excluded.helper_email;
