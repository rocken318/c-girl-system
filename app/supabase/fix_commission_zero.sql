-- 全店 settings の歩合率を0に（バックは維持）
-- 冪等: commissionRates キーが存在する行のみ更新
update public.settings
set data = jsonb_set(data, '{commissionRates}',
  '[{"category":"本指名売上","rate":0},{"category":"フリー売上","rate":0}]'::jsonb)
where data ? 'commissionRates';
