-- 黒服(kurofuku)にシフト/出欠ボード用の全店アクセスを付与する。
-- RLS ポリシーは OR で評価されるため、既存の「担当のみ」ポリシーを残したまま
-- 店舗単位の広いポリシーを追加する。
-- Note: daily_records への黒服アクセスは 0015 の出欠専用ビュー+RPC で管理する。
--       売上/給与列の非公開を担保するため、ここでは daily_records ポリシーを設けない。

-- casts: 黒服が自店の全キャストを閲覧
create policy casts_kurofuku_store_select on public.casts
  for select using (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  );

-- shifts: 黒服が自店のシフトを閲覧・即時変更（SELECT / INSERT / UPDATE / DELETE）
create policy shifts_kurofuku_store_select on public.shifts
  for select using (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  );
create policy shifts_kurofuku_store_insert on public.shifts
  for insert with check (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  );
create policy shifts_kurofuku_store_update on public.shifts
  for update using (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  ) with check (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  );
create policy shifts_kurofuku_store_delete on public.shifts
  for delete using (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  );
