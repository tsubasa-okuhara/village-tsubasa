# sql/_archive — 不採用になった草稿SQL置き場

実行されなかった/採用版に置き換わった SQL を、経緯を残すために保管。**本番には未適用**。

## 2026-05-12 client_login セキュリティ対応の旧草稿（2本）

- `2026-05-12_client_users_login_rpc.sql` — `verify_client_login(p_name,p_code)` + 列レベルREVOKE 方式の草稿
- `2026-05-12_enable_rls_user_helper_compatibility.sql` — UHC の RLS 有効化を単独で行う草稿

**不採用理由**: 2本を統合し、RPC名を `client_login` に変えた採用版
`sql/2026-05-12_security_client_login_rpc_and_uhc_rls.sql`（適用済み）に置き換わったため。
列レベルREVOKE 方式は採らず、anon の直接SELECT禁止＋RPC経由に一本化した。
