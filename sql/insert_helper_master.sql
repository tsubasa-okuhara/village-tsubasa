-- helper_master にヘルパー名とメールアドレスを一括登録
-- 既に同名のヘルパーがいる場合はメールアドレスを更新する

INSERT INTO public.helper_master (helper_name, helper_email) VALUES
  ('伊藤',     'yutaka.ito1994@gmail.com'),
  ('稲山',     'inachichoco@gmail.com'),
  ('奥原',     'village.tsubasa_4499@iCloud.com'),
  ('敬子',     'Keiko0309.kandobara@gmail.com'),
  ('三枝',     'yuki200164@gmail.com'),
  ('市川',     'taka.ang.camoo.fair@gmail.com'),
  ('小川',     'masao020842713012@gmail.com'),
  ('大曽根',   'hohtomo45@gmail.com'),
  ('大島',     'tsuabasavillage4499@gmail.com'),
  ('滝澤',    'pethotel.airport@gmail.com'),
  ('池田',     'shohichi.222@gmail.com'),
  ('林',       '8ha8ya4shi@gmail.com'),
  ('中野',     'zhongtiannasu@gmail.com'),
  ('藤田',     'leric6mth@gmail.com'),
  ('木野',     'kinoyoshihiro1115@gmail.com'),
  ('真奈美',   'loveactually.ha@gmail.com'),
  ('木野遙仁', 'haruto0111@gmail.com'),
  ('矢口',     'menya.yaguchi@gmail.com'),
  ('佳織',     'casurin0213@gmail.com'),
  ('伊藤信一', 'shinichi.hr22@gmail.com'),
  ('塚田',     'tsukadakoujichu@gmail.com'),
  ('いわせ',   'detroit3711@gmail.com'),
  ('岩崎祐二', 'yuji605i003@gmail.com'),
  ('竹花',     'miyuki.snoopy.15759@gmail.com'),
  ('笹沼',     'ms065214@gmail.com'),
  ('樋口',     'dannyfrommorikiko@gmail.com'),
  ('久保田',   '141213zero@gmail.com'),
  ('笹川',     'kandobara362684@gmail.com'),
  ('村岡',     'mrokrs1212@gmail.com'),
  ('金城',     'mariopeach1034@gmail.com'),
  ('岩本',     'iwamoto.sytm@gmail.com'),
  ('荻原',     'ogiwam0612@gmail.com')
ON CONFLICT (helper_name) DO UPDATE
SET helper_email = EXCLUDED.helper_email;
