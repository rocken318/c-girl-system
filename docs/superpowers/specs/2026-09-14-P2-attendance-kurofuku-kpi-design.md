# 設計書：P2 出勤率＋黒服別KPI（補強）

作成日：2026-09-14 / ユーザー委任により自走。親：`docs/superpowers/specs/2026-09-13-拡張全体設計とハンドオフ.md`（P2）。前提：P0/P1 完了・本番稼働。

## 1. ゴール
ハンドオフ§6のP2「出勤率％」「黒服別 担当合計売上KPI」を既存に載せる。マスタ駆動/権限分離/マルチ店舗を厳守。給与エンジンは触らない。

## 2. 定義（自走のため明示・後で調整可）
- **出勤率**：`実出勤日数 ÷ 予定シフト日数`（%）。
  - 実出勤日数：`daily_records` で `attended=true`（かつ isAbsent=false）の日数（対象店・対象月・対象cast）。
  - 予定シフト日数：`shifts` で status ∈ {approved, published} の日数（対象cast・対象月）。
  - 予定日数=0（シフト未整備）の場合は **率をnull**とし「出勤◯日」のみ表示（誤解防止）。
- **黒服別KPI**（対象月）：黒服(kurofuku)ごとに
  - 担当キャスト数（`casts.manager_id = 黒服`）
  - 担当キャストの当月合計売上（`daily_records` nominatedSales+freeSales の合算）
  - 担当キャストの平均出勤率（率が出せる者の平均。分母0は除外）

## 3. データ/ロジック
- `lib/attendance.ts`（純関数・テスト）：`attendanceRate(attended: number, scheduled: number): number | null`（scheduled=0→null、それ以外は%小数1桁）。
- `data/attendance.ts`（DBアクセス・RLS任せ）：
  - `fetchCastAttendance(storeId, month) → { castId, attendedDays, scheduledDays }[]`（daily_records と shifts を月範囲で取得し集計）。
  - `fetchKurofukuKpis(storeId, month) → { managerId, name, castCount, totalSales, avgRate }[]`（casts.manager_id で担当を束ね、daily_records合計・出勤率平均）。admin/統合が使用。
- 期間は `lib/targets.ts` の `periodKey`/`periodRange`（当月）を流用。売上合算は既存 `sumSales` 相当。

## 4. UI
- **黒服マイページ（KurofukuCastsPage）**：ヘッダに当月KPI「担当合計売上／担当人数／平均出勤率」を追加。各担当キャストカードに当月出勤率を表示。
- **管理ダッシュボード（DashboardPage）**：
  - キャスト別ランキングに **出勤率** 列を追加（当月）。
  - **黒服別KPIカード**（admin/統合）：黒服ごとに 担当人数／合計売上／平均出勤率。
- 権限：RLSにより黒服=自分の担当のみ、admin=自店、統合=全店。UIは取得結果をそのまま表示（追加ガード不要）。

## 5. テスト
- `attendanceRate` 純関数（Vitest）：scheduled=0→null、10/20→50 等。
- 回帰：SAKURA ¥281,000 維持。build/lint。
- （pgTAP新規テーブル無しのため追加DBテストは不要。既存RLSで担保）

## 6. スコープ外
- 出勤率の別定義（実働時間ベース）、目標出勤率、AI(P5)、LINE(P4)。
