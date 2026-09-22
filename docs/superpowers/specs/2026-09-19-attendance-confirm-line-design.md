# 出欠確認LINE ワンクリック送信 — 設計書

作成日: 2026-09-19 / 状態: 承認待ち

## 目的
管理者ページと黒服ページから、本日出勤するキャストへ「出欠確認（本日の出勤お願い）」の
LINEをワンクリックで一斉送信できるようにする。文面はキャストごとに個別化する
（出勤時刻・ヘアメ時間・同伴予定を各自の内容で差し込む）。

## スコープ
- 対象ボード: 共有コンポーネント `ShiftAttendanceBoard`（管理者・黒服の両ページで使用）の「当日」ビュー。
- 送信対象: **本日の確定シフト全員**（status = approved/published、当日、自店）。
  LINE連携済みのキャストのみ実送信し、未連携はスキップして件数報告する。
- 文面: 個別化。先頭に店名は付けない（確認済み）。

### 非スコープ（YAGNI）
- キャストからの返信を自動でボードへ反映する双方向連携（webhook/DB拡張）は対象外。
- 送信履歴の永続化・連打ロック。確認ダイアログで誤送信を防ぐに留める。

## 個別文面
純関数 `buildAttendanceConfirmMessage(input)` に集約する。
`app/src/lib/dunningPrompt.ts` と同じ「lib が source of truth・API側はインライン複製」方針に従う。

入力:
```ts
interface AttendanceConfirmInput {
  sourceName: string;    // 源氏名
  startTime: string;     // "20:00"
  endTime: string;       // "01:00"
  hairMakeTime?: string; // "18:00"（任意）
  douhanTime?: string;   // "19:00"（任意）
}
```

出力例（すべて任意項目ありの場合）:
```
〇〇さん、おはようございます。
本日は 20:00〜01:00 の出勤です。よろしくお願いします🙇
ヘアメイクは 18:00 のご予約です。
本日は 19:00 に同伴のご予定です。
```
- 2行目（源氏名＋出勤時刻）は常に出力。
- ヘアメ行は `hairMakeTime` がある場合のみ。
- 同伴行は `douhanTime` がある場合のみ。

## 新データ項目
確定シフトに以下2つを追加する。**`shifts.data`（JSONB）へ格納するため DBマイグレーション不要。**
- `hairMakeTime?: string`（ヘアメ時間）
- `douhanPlanTime?: string`（同伴予定時刻）

変更点:
- `ShiftContext.ts` の `ConfirmedShift` 型に上記2項目を追加。
- `rowToConfirmedShift` で `data.hairMakeTime` / `data.douhanPlanTime` を読み取り。
- `confirmShift` の upsert payload（`data`）へ2項目を含める。
- 当日ボード各行 `AttendanceRow` の既存編集エリアに「ヘアメ時間」「同伴予定時刻」の
  `<input type="time">` を追加し、時刻保存と同じ導線で保存する。

## UI（ShiftAttendanceBoard 当日ビュー）
- 当日サマリの直下に「📩 出欠確認を一斉送信」ボタンを1つ配置。ラベルに対象人数を表示。
- 押下 → 確認ダイアログ（対象人数・未連携数・文面サンプル1件）→ 送信 → 結果トースト
  （`sent / skipped / failed` 件数）。実質ワンクリック。
- ボタンは `canEdit` 時のみ表示（管理者・黒服とも `canEdit` で使用）。

## API `POST /api/line/attendance-confirm`
`api/ai/churn-comment.js` と同じ認証・権限パターンに従う。

- 認証: `Authorization: Bearer <supabase access_token>` を Supabase `/auth/v1/user` で検証。
- 権限: profiles.role が `admin` または `kurofuku`、もしくは `is_integrated_viewer=true`。
- 店舗スコープ: リクエストの `storeId` が自身の store_id（統合ビューアは許容）と一致すること。
- リクエストボディ: `{ storeId: string, date: "YYYY-MM-DD" }` のみ。
- サーバ処理（サービスロール使用）:
  1. `shifts` から 当日・自店・status in (approved,published) を取得（`data` に時刻・ヘアメ・同伴含む）。
  2. `casts` から `id → source_name` を取得。
  3. `line_links` から `cast_id → line_user_id` を取得。
  4. キャストごとに `buildAttendanceConfirmMessage`（インライン）で文面生成し LINE push。
- **`line_user_id` はサーバ側のみで扱い、クライアントへ返さない**（権限分離）。
- レスポンス: `{ sent: number, skipped: number, failed: number }`。

## デモモード時の挙動（`VITE_DEMO_MODE` 既定ON・セッション無し）
- クライアントは `supabase.auth.getSession()` のトークン有無で分岐。
- トークン無し（デモ）: 実送信せず、`buildAttendanceConfirmMessage` でローカル生成した
  文面プレビュー一覧をモーダル表示（「デモ: 以下の内容が送信されます」）。ネットワーク呼び出し無し。
- トークン有り（本番）: API を呼び実送信し、結果件数をトースト表示。

## テスト
- `app/src/test/attendanceConfirm.test.ts`:
  - 基本（源氏名＋出勤時刻のみ）
  - ＋ヘアメ時間
  - ＋同伴予定
  - 両方あり
  改行・任意行の有無を検証。

## 影響ファイル
- 追加: `app/src/lib/attendanceConfirm.ts`, `app/src/test/attendanceConfirm.test.ts`, `api/line/attendance-confirm.js`
- 変更: `app/src/store/ShiftContext.tsx`（型・parse・upsert）,
  `app/src/components/ShiftAttendanceBoard.tsx`（ボタン・行入力欄・送信導線）
- 変更なし（確認のみ）: `vercel.json`（新APIは自動ルーティング）
