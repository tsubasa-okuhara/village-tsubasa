create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  target_email text not null,
  title text not null,
  body text not null default '',
  link_url text not null default '',
  notification_type text not null default 'admin',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_target_email_created_at_idx
  on public.notifications (target_email, created_at desc);

create index if not exists notifications_target_email_is_read_idx
  on public.notifications (target_email, is_read);

comment on table public.notifications is 'helper_email 単位のアプリ内通知';
comment on column public.notifications.target_email is 'helper_email と一致する通知対象メール';
comment on column public.notifications.link_url is '通知押下時の遷移先パス';
comment on column public.notifications.notification_type is 'today / tomorrow / admin などの通知種別';
