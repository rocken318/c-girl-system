-- 0013: LINE連携コード方式
-- profiles に line_link_code カラムを追加し、既存 cast/kurofuku にバックフィル。
-- line_links の SELECT RLS を拡張してキャスト本人が自分の連携状態を確認できるようにする。

alter table public.profiles add column if not exists line_link_code text unique;

-- 既存 cast/kurofuku に8桁英数字コードをバックフィル（衝突ほぼ無し）
update public.profiles
set line_link_code = upper(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 8))
where role in ('cast','kurofuku') and line_link_code is null;

-- line_links の SELECT RLS を更新：cast 本人が自分のレコードを読めるよう拡張
drop policy if exists line_links_select on public.line_links;
create policy line_links_select on public.line_links for select using (
  current_is_integrated()
  or (store_id is not null and is_store_admin(store_id))
  or cast_id = (select current_cast_id())
);
