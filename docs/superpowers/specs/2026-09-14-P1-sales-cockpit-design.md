# 設計書：P1 売上コックピット（目標・達成率・前年比・店間比較）

作成日：2026-09-14 / 承認済み（設計方向OK・グラフはrecharts採用）
対象：NEW CLUB Kingyo キャスト管理システム「金魚」 / 開発元：合同会社 Y&Y
親：`docs/superpowers/specs/2026-09-13-拡張全体設計とハンドオフ.md`（P0〜P5）。前提：P0マルチストア基盤 完了済み。

## 1. 背景とゴール
経営が毎日開く「売上コックピット」を作る。日/月/四半期/半期/年で売上を切り替え、**目標達成率**・**前年同期比**・**店間比較**を一望する。売上はキャスト毎に `daily_records` に入力済み（Dシステム取込も整備済）。売上=`nominatedSales + freeSales`。

## 2. 絶対原則（CLAUDE.md）
マスタ駆動（目標は設定から）／権限分離（統合=全店閲覧・自店adminのみ書込／cast=自分の目標のみ）／マルチ店舗（store_idスコープ）／給与は単一エンジン（本Phaseは給与に触れない）。

## 3. スコープ（P1）
- `sales_targets`（**店舗目標＋キャスト個人目標**、期間種別 day/month/quarter/half/year）
- 売上コックピット（管理 `DashboardPage` 強化）：期間トグル・達成率・前年比・推移グラフ・店間比較・キャスト別達成率
- キャストのマイページに「今月あと¥Xで目標」＋達成率バー
- 目標設定UI（管理）
- 集計ロジック `lib/targets.ts`（純関数・テスト）
- **前年比用の2025ダミーデータ**投入
- グラフは **recharts**

## 4. データモデル

### 4.1 sales_targets（新規・マイグレーション 0011）
```
sales_targets(
  id uuid pk default gen_random_uuid(),
  store_id uuid not null references stores(id),
  scope text not null check (scope in ('store','cast')),
  cast_id uuid references casts(id),          -- scope='cast' の時必須、'store' は null
  period_type text not null check (period_type in ('day','month','quarter','half','year')),
  period_key text not null,                   -- 例 '2026-09-14'(day)/'2026-09'(month)/'2026-Q3'(quarter)/'2026-H2'(half)/'2026'(year)
  target_amount bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, scope, cast_id, period_type, period_key)
)
```
- scope='store' の行は cast_id=null。unique制約で cast_id が null の重複を許さないため、**部分ユニークインデックス**を2本に分ける：
  - `unique (store_id, period_type, period_key) where scope='store'`
  - `unique (store_id, cast_id, period_type, period_key) where scope='cast'`
- RLS（P0パターン）：SELECT=`current_is_integrated() or (has_store_access(store_id) and (is_store_admin(store_id) or (scope='cast' and cast_id=current_cast_id())))` ／ 書込=`is_store_admin(store_id)`。castは自分のcast目標をSELECTのみ。

### 4.2 集計は daily_records から
新たな売上テーブルは作らない。`daily_records.data`(jsonb) の `nominatedSales`+`freeSales` を store/cast・期間で合算。

## 5. 期間モデル
`period_type` と `period_key`：
- day: `YYYY-MM-DD`
- month: `YYYY-MM`
- quarter: `YYYY-Q{1..4}`（Q1=1–3月 … Q4=10–12月）
- half: `YYYY-H{1|2}`（H1=1–6月, H2=7–12月）
- year: `YYYY`
`lib/targets.ts` に `periodKey(date, type)` と `periodRange(periodKey, type) → {start,end}`（両端YYYY-MM-DD）を実装。**前年同期**は period_key の年を-1して算出。

## 6. 集計ロジック `lib/targets.ts`（純関数・テスト必須）
- `periodKey(date: Date, type): string`
- `periodRange(periodKey: string, type): { start: string; end: string }`
- `sumSales(records: DailyLike[], start: string, end: string): number`（各recordの nominatedSales+freeSales を範囲内で合算）
- `achievementRate(actual: number, target: number): number`（target=0 は 0 を返す。%小数1桁）
- `yoyDelta(current: number, lastYear: number): { diff: number; rate: number | null }`（lastYear=0 は rate=null）
- `prevYearPeriodKey(periodKey, type): string`
給与エンジンとは独立。Vitestで固定値検証。

## 7. 画面

### 7.1 売上コックピット（`admin/DashboardPage` 強化）
- **期間トグル**：日/月/四半期/半期/年（+ 対象期間セレクタ：当日/当月/前月/任意）
- **サマリKPI**：総売上・目標・**達成率バー**（店舗目標。scope='store', 選択期間の period_key）
- **推移グラフ（recharts 折れ線）**：選択期間内の売上推移＋**前年同期の重ね線**、前年比％表示
- **店間比較**：統合ロールは Kingyo/B club を並列（一般adminは自店のみ・`has_store_access`）
- **キャスト別**：売上ランキング＋各自の達成率（scope='cast'目標があれば）
- データ取得はRLS任せ＋アクティブ店舗/統合で範囲決定。

### 7.2 キャストのマイページ
- 自分の当月cast目標に対する「**今月あと¥Xで達成**」＋達成率バー（`sales_targets` scope='cast', 自分, month）。

### 7.3 目標設定UI（管理）
- 設定に「売上目標」：店舗目標（期間種別ごと）＋キャスト個人目標を入力・保存（`sales_targets` upsert、自店adminのみ）。

## 8. 前年ダミーデータ
- 2025年の各月、両店のアクティブキャストにキャスト別月次売上のダミーを `daily_records`（または月次相当）で生成投入し、前年比が表示されるようにする。実データ受領後は共存/置換可能。**冪等**（既存2025行は上書きしない）。
- 投入は seed への追記＋本番へ適用（P0同様、DB migration→データ→deploy の順）。

## 9. グラフ描画
- **recharts** を追加（`npm i recharts`）。折れ線＋前年重ね＋ツールチップ。既存の和モダン配色（#c8243e/gold）に合わせる。

## 10. テスト
- `lib/targets.ts` の純関数（periodKey/periodRange/sumSales/achievementRate/yoyDelta/prevYearPeriodKey）をVitestで固定値検証。
- pgTAP：`sales_targets` のRLS（統合=全店、自店admin=自店のみ書込、cast=自分のcast目標のみSELECT、他店不可）。
- 回帰：SAKURA給与 ¥281,000 維持（給与非変更）。
- build/lint（新規エラー増やさない）。

## 11. マイグレーション/反映
1. `0011_sales_targets.sql`（テーブル＋部分ユニーク＋RLS）＋ pgTAP。
2. seed に店舗/キャストのサンプル目標＋2025ダミー売上を追記。
3. 本番：`supabase db push`（0011）→ 2025ダミー/目標を本番へ適用 → `git push`（フロント）。

## 12. スコープ外（後続）
- AI離脱リスク/売上予測(P5)、LINE督促(P4)、同伴ボード、週次粒度、目標のバージョン履歴。

## 13. 未確定（運用時）
- 目標額の実値（店が設定）。ダミーで開始。
- 前年比の「同期」定義は period_type に準拠（月なら前年同月、四半期なら前年同四半期）。
