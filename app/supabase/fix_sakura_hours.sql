-- fix_sakura_hours.sql
-- 本番DB用: SAKURAの勤務時間を7h→5h（1日最大5時間ルール対応）に更新
-- 冪等: 何度実行しても結果は同じ
-- 適用者が手動で本番DBに実行すること（自動適用しない）
--
-- cast_id: dddddddd-0000-0000-0000-000000000001 (SAKURA)

update public.performances
set data = jsonb_set(data, '{hoursPerDay}', '5')
where cast_id = 'dddddddd-0000-0000-0000-000000000001';

update public.daily_records
set data = jsonb_set(data, '{hours}', '5')
where cast_id = 'dddddddd-0000-0000-0000-000000000001';
