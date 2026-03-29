-- バッジ・通知確認用の未読通知サンプル投入
insert into public.notifications (
  id,
  target_email,
  title,
  body,
  link_url,
  notification_type,
  is_read,
  created_at
) values (
  gen_random_uuid(),
  'village.tsubasa_4499@iCloud.com',
  'テスト通知',
  'バッジ確認用の未読通知です',
  '/notifications/',
  'test',
  false,
  now()
);

-- 確認
-- select *
-- from public.notifications
-- where target_email = 'village.tsubasa_4499@iCloud.com'
-- order by created_at desc;

-- 後片付け
-- delete from public.notifications
-- where target_email = 'village.tsubasa_4499@iCloud.com'
--   and notification_type = 'test';
