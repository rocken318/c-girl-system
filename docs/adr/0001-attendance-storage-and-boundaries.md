# ADR 0001: 出欠(出勤/同伴/遅刻/欠勤/当欠)の保存先と境界

- 日付: 2026-09-15
- ステータス: 採用
- 関連: `docs/superpowers/specs/2026-09-15-shift-attendance-board-design.md` / `docs/superpowers/plans/2026-09-15-shift-attendance-board.md`

## 背景
黒服・管理者向けの「シフト×出欠ボード」で、出欠5区分（出勤/同伴出勤/遅刻/欠勤/当欠）を
記録・閲覧する。出欠の保存先として新テーブルを作らず、既存 `daily_records.data`(jsonb) の
`attended` / `isLate` / `isAbsent` / `attendanceType` / `douhan` / `douhanTime` を用いる方針を採った
（出勤率算出・給与ロジックが既にこれらを参照済みのため）。

## 決定
1. 出欠は `daily_records.data` に記録する（区分↔フィールドの変換は `src/lib/attendanceStatus.ts`）。
2. 黒服の書込は非破壊マージ（売上・指名等を保持）で行う。
3. 黒服には売上/給与列を見せない（権限分離 / CLAUDE.md 絶対原則#2）。
   このため `daily_records` の全列 SELECT は黒服に開放せず、出欠専用ビュー
   `attendance_board_view` と、出欠フィールドのみを更新する SECURITY DEFINER RPC
   `record_attendance()` を境界として用いる（migration 0015）。0014 で一時的に付与した
   黒服の `daily_records` 直アクセスポリシーは 0015 で撤去する。

## 既知の制約（未対応・意図的な先送り）
### C1: 実績入力/CSV・Dシステム取込による出欠の上書き
`PerformanceContext.replaceMonthlySummary`（`ImportPage` の CSV 取込、`PerformanceEntryPage`
の月次一括保存が使用）は、対象キャストの当月 `daily_records` を **delete → 再挿入** する。
また実績入力/CSV 生成側は `attendanceType` を `'normal' | 'douhan'` しか出力しない。
結果として、黒服がボードで記録した **遅刻/欠勤/当欠 が、その月の実績保存・取込で上書き消去** される。

- 影響: 出欠記録の後に管理者が月次実績を保存 or CSV/Dシステム取込を行うと、出欠区分が失われる
  （`isAbsent` は残るが `same_day_absence`(当欠) → `absent`(欠勤) に降格し得る）。
- 判断: **Dシステム出力Excelの実マッピング確定タスク**（保留中のユーザー作業）と同時に、
  取込/実績保存側が既存の出欠フィールド（`isLate` / `isAbsent` / `attendanceType`）を
  日単位で保持（キャリーフォワード）するよう修正する。本ボード導入と切り離す。
- 回避運用（暫定）: 出欠記録は取込後に行う、または取込後に再記録する。

## 却下案
- 出欠を専用テーブルに分離: 出勤率・給与が参照する既存フィールドと二重管理になり、
  再集計の複雑さが増すため却下。将来 C1 の恒久対処が難しくなった場合に再検討。
