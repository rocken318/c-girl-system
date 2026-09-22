# 設計書：P4 LINE連携＋未提出督促（土台）

作成日：2026-09-14 / ユーザー委任により自走。親：ハンドオフ§4-6（P4）。前提：P0-P2稼働。

## 1. ゴール（今回=土台）
LINE公式アカウント連携の器を作る：webhook受信（署名検証）＋アカウント紐付け（`line_links`）＋push送信＋未提出検知cron。督促文は当面テンプレ（AI生成はP5で差し替え）。**APIキーはサーバー関数のみ。クライアントに出さない。**

## 2. アーキテクチャ
- **Vercel Functions（`/api`）** を新設（現状はSPAのみ）。`vercel.json` の全リライトから `/api` を除外。関数は**依存ゼロ**（Node組込 `crypto`＋`fetch`のみ）でLINE/Supabase RESTを叩く。
- サーバー環境変数（Vercel・Sensitive・投入済/追加済）：`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`。
- webhook/cron は未認証だが署名検証・cronシークレットで保護。DB書込は service role（RLSバイパス）。

## 3. データモデル（0012）
`line_links`：`id, store_id, cast_id(references casts, 任意), profile_id(references profiles, 任意), line_user_id text unique, linked_at`。RLS：admin/統合はSELECT（自店/全店）、書込はservice role（RLS対象外）。

## 4. エンドポイント
- `POST /api/line/webhook`：`X-Line-Signature` を `LINE_CHANNEL_SECRET` でHMAC-SHA256検証（不一致は403）。イベント処理：`follow` または「連携コード」テキストで `line_links` を upsert（line_user_id）。※誰のアカウントかの特定は、当面「連携コード方式」（キャストがアプリで発行したコードをLINEに送る→紐付け）または follow時に line_user_id を保存し後で管理画面で割当。土台では **line_user_id の保存＋（あれば）コード照合** まで。
- 内部 push ユーティリティ：`pushLine(to, messages)`（LINE `/v2/bot/message/push`）。
- `GET/POST /api/cron/check-submissions`：`CRON_SECRET` 検証。**未提出検知**＝アクティブcastで「翌月のシフト希望(shifts)が0件」の者を抽出し、`line_links` がある者へテンプレ督促を push。Vercel Cron で定期実行（当面 手動/日次）。

## 5. 純ロジック（app/src/lib・テスト必須）
- `lib/lineSignature.ts`：`verifyLineSignature(rawBody, signature, channelSecret): boolean`（Node crypto HMAC-SHA256, base64）。
- `lib/submissionCheck.ts`：`unsubmittedCasts(activeCastIds, submittedCastIds): string[]`（差集合）。
- Vitestで検証。関数実体（/api）は同ロジックを内包（小規模ゆえ重複許容・libをsource of truth）。

## 6. 未確定/後続
- 督促文のAI生成（P5）。日報・出金予定の提出モデル（別途）。連携方式の最終確定（コード方式 vs 管理画面割当）。webhook URL の LINE Developers 登録は**デプロイ後に人手で**（`https://kingyo-system.vercel.app/api/line/webhook`）＋Webhook利用ON。
- 本土台は「デプロイしてエンドポイントが生存・署名検証が効く」まで。実push疎通は紐付け済みLINEユーザーが要る。

## 7. テスト/検証
- pgTAP：`line_links` のadmin/統合SELECT・他店不可。
- Vitest：verifyLineSignature（正/不正）、unsubmittedCasts。
- デプロイ後：`/api/line/webhook` が SPA に飲まれず応答すること、不正署名で403、`/api/cron/...` が secret 無しで401。
