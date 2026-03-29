create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  helper_email text not null,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists push_subscriptions_endpoint_uidx
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_helper_email_active_idx
  on public.push_subscriptions (helper_email, is_active, updated_at desc);

comment on table public.push_subscriptions is 'helper_email と端末 Push 購読情報の紐付け';
comment on column public.push_subscriptions.endpoint is 'PushSubscription endpoint';
comment on column public.push_subscriptions.p256dh_key is 'PushSubscription.keys.p256dh';
comment on column public.push_subscriptions.auth_key is 'PushSubscription.keys.auth';
