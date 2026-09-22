# シフト×出欠ボード 設計書

- 作成日: 2026-09-15
- 対象: NEW CLUB Kingyo キャスト管理システム「金魚」
- ステータス: 承認済み（ブレスト完了、実装計画待ち）

## 1. 目的・背景

黒服・管理者が **当日／月次のシフトと出欠を一覧**で把握し、黒服が現場で
**出欠確認**と**シフト変更**を行えるようにする。従来は管理者のみがシフト確定・
勤怠編集を行い、黒服は担当キャストの閲覧に限られていた。現場運用（点呼・当日調整）を
黒服に開放し、経営・管理者はそのまま監査できる状態を維持する。

### 決定事項（ブレスト結論）
- **対象範囲**: 黒服は**所属店の全キャスト**を閲覧・操作できる（担当キャスト限定ではない）。
- **シフト変更**: 黒服による変更は**即時反映**（管理者承認を挟まない）。監査用に更新者・更新時刻を記録。
- **出欠区分**: **5区分**（出勤 / 同伴出勤 / 遅刻 / 欠勤 / 当欠）。同伴出勤は独立区分。

## 2. データモデル

新テーブル・新カラムは追加しない。既存 `daily_records.data`(jsonb) の
`attended` / `isLate` / `isAbsent` / `attendanceType` / `douhan` を用いて出欠を表現する
（出勤率算出 `data/attendance.ts` と給与ロジックが既にこれらを参照済み）。

### 2.1 出欠区分 → フィールドのマッピング

| 区分 | attended | isLate | isAbsent | attendanceType | douhan | 実開始時刻 |
|---|---|---|---|---|---|---|
| 出勤 | true | false | false | `normal` | 変更なし | 予定開始 |
| 同伴出勤 | true | false | false | `douhan` | +1（未計上時） | **同伴時刻**（予定より前倒し） |
| 遅刻 | true | true | false | `late` | 変更なし | 実際の到着時刻 |
| 欠勤（事前） | false | false | true | `absent` | 0 | — |
| 当欠（当日） | false | false | true | `same_day_absence` | 0 | — |

- 同伴と遅刻は**排他**（同伴は早入り前提のため両立しない）。
- 同伴時刻は既存 `ShiftDayRequest.douhanTime` の運用に倣い `daily_records.data.douhanTime`
  （`"HH:mm"`）へ保存し、実働時間・出勤時刻の起点とする。
- 出勤率は既存ロジックを踏襲：`attended === true && isAbsent !== true` を出勤日として算出。
  遅刻・同伴出勤は出勤扱い、欠勤・当欠は非出勤。

### 2.2 出欠確認の書き込み（非破壊マージ）

出欠確認は該当日の `daily_records`（`store_id` + `cast_id` + `date`）を **upsert**。
**出欠フィールドのみ**を更新し、売上系フィールド（`nominatedSales` / `freeSales` / `honShimei`
ほか）は既存値を保持する（管理者の実績入力を破壊しない）。行が未作成の場合は
出欠フィールド＋売上0で新規作成する。

### 2.3 「未確認」状態

シフト（`shifts` の `approved` / `published`）に予定はあるが当日の `daily_records` が
未作成、または出欠フィールド未設定の行は **未確認** として表示する（区分5種とは別の初期状態）。

## 3. シフト変更（即時反映）

黒服が確定シフト（`published` / `approved`）に対し以下を即時実行できる：

- 開始／終了時刻の編集
- シフトの追加（対象キャスト・日付を指定）
- シフトの削除

実装は既存 `store/ShiftContext.tsx` の `confirmShift` / `removeConfirmedShift` /
`getConfirmedForMonth` を再利用し、`shifts` テーブルへ直接反映する。
監査のため更新時に `shifts.data` へ `updatedBy`(profile_id) / `updatedAt`(ISO) を書き込む。
希望提出→確定の月次フロー（`ShiftManagementPage`）は変更しない。

## 4. UI 設計

### 4.1 共有コンポーネント `ShiftAttendanceBoard`

黒服・管理者の双方から利用する共有コンポーネント。`storeId` と操作可否（`canEdit`）を
props で受け取り、内部は同一。2つのビューをタブ切替する。

- **当日ビュー**（点呼向け）
  - 今日の出勤予定キャスト一覧（`shifts` の当日 `approved`/`published`）。
  - 各行：キャスト名・予定時刻・出欠区分トグル（出勤/同伴出勤/遅刻/欠勤/当欠）・時刻微調整。
  - 同伴出勤選択時は同伴時刻入力を表示。未確認バッジ。
  - 集計ヘッダ：予定人数 / 出勤 / 未確認 / 欠勤・当欠。
- **月次ビュー**
  - 日付 × キャストのグリッド（既存 `ShiftManagementPage` 確定グリッドの見た目を踏襲）。
  - セルを出欠区分で色分け。タップでその日の編集（出欠＋時刻＋同伴時刻）。
  - 月選択（当月中心に前後）。

### 4.2 導線

- **黒服**: `/kurofuku` に「シフト/出欠」タブを追加（`KurofukuLayout` のタブ拡張）。
  `canEdit = true`、`storeId = 自店`、**全店キャストスコープ**。
- **管理者**: `/admin/attendance`（`AttendanceAdminPage`）に本ボードを統合、または隣接タブとして追加。
  既存の打刻編集・希望→確定フローはそのまま残す。

## 5. 権限・セキュリティ

- 全クエリを `store_id` でスコープ（マルチ店舗前提／IDOR厳禁）。
- 黒服 role に対する **Supabase RLS ポリシー追加が必要**：
  - `shifts`：自店行の SELECT / INSERT / UPDATE / DELETE
  - `daily_records`：自店行の SELECT / UPSERT（出欠確認）
  - 現状これらが admin 限定の可能性があるため、実装前にポリシーを確認・追加する。
- 給与に影響する数値（同伴単価・遅刻/欠勤の扱い等）は**マスタ駆動**のまま。本機能は
  出欠区分の記録に限り、給与計算ロジックへは既存フィールド経由で反映する（ハードコードしない）。

## 6. テスト方針

- 出欠区分 → `daily_records.data` マッピング（5区分＋同伴時刻）。
- 出欠 upsert の**非破壊マージ**（売上フィールドが保持される）。
- 出勤率再計算：遅刻・同伴出勤＝出勤、欠勤・当欠＝非出勤。
- シフト即時変更（時刻編集／追加／削除）と `updatedBy`/`updatedAt` の記録。
- 全店スコープと店内権限（他店データが混入しない）。

## 7. 想定ファイル（実装計画で確定）

- `app/src/components/ShiftAttendanceBoard.tsx`（新規・共有）
- `app/src/data/attendance.ts`（出欠確認 upsert・当日/月次取得を追加）
- `app/src/store/ShiftContext.tsx`（黒服の即時変更許可・`updatedBy` 記録）
- `app/src/components/KurofukuLayout.tsx`（タブ追加）
- `app/src/pages/kurofuku/`（ボード用ページ新規）
- `app/src/pages/admin/AttendanceAdminPage.tsx`（統合）
- `app/src/App.tsx`（ルート追加）
- Supabase RLS ポリシー（`shifts` / `daily_records`）

## 8. 非対象（YAGNI）

- 変更申請→承認ワークフロー（即時反映を採用したため不要）。
- 出欠区分の増設（当面この5区分に固定）。
- 打刻（`time_records`）モデルの変更（本機能は `daily_records` ベースの出欠に限定）。
