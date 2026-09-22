-- =============================================================
-- seed_top_cast_target.sql
--   各店舗の「当月売上トップのキャスト」の当月・月次売上目標を
--   2,500,000 円に設定（既存があれば上書き）。冪等。
--   実行例:
--     psql "<接続文字列>" -f seed_top_cast_target.sql
-- =============================================================
with sales as (
  select c.store_id, c.id as cast_id,
    sum(coalesce((dr.data->>'nominatedSales')::numeric, 0)
      + coalesce((dr.data->>'freeSales')::numeric, 0)) as total
  from public.casts c
  join public.daily_records dr on dr.cast_id = c.id
  where c.status = 'active'
    and dr.date >= date_trunc('month', current_date)::date
    and dr.date <  (date_trunc('month', current_date) + interval '1 month')::date
  group by c.store_id, c.id
),
ranked as (
  select *, row_number() over (partition by store_id order by total desc) as rn
  from sales
)
insert into public.sales_targets (store_id, scope, cast_id, period_type, period_key, target_amount)
select store_id, 'cast', cast_id, 'month', to_char(current_date, 'YYYY-MM'), 2500000
from ranked
where rn = 1
on conflict (store_id, cast_id, period_type, period_key) where scope = 'cast'
do update set target_amount = excluded.target_amount, updated_at = now();
