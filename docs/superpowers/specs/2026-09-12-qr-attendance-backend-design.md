# 設計書：QR出退勤 ＋ Supabase実運用基盤（P0+P1）

作成日：2026-09-12 / 対象：NEW CLUB Kingyo キャスト管理システム「金魚」
開発元：合同会社 Y&Y

## 1. 背景とゴール

現状はReact+TS+Vite・Context状態のデモ（バックエンド無し）。今回、QR出退勤を「店の共有端末で実際に打刻→サーバーに記録」という実運用に移行する。これに伴い、Supabase（Postgres+Auth+RLS）を正式なバックエンド基盤として導入する。

全体計画は以下に分割し、本書は **P0（基盤）+ P1（QR出退勤）** を扱う。

| Phase | 内容 |
|---|---|
| **P0 基盤** | Supabaseスキーマ＋認証＋RLS（store_idスコープ、admin>黒服>castの3ロール）。既存デモデータの移行。 |
| **P1 QR出退勤** | 共有端末でキャスト＆黒服が個人QRを打刻、サーバー時刻で勤怠記録。 |
| P2 黒服給与（別仕様） | 勤怠（時給×時間）を給与エンジンに統合。 |
| P3 欠勤ペナルティ（別仕様） | 承認済シフト×打刻を突合→状態別固定額を控除。 |
| P4 黒服マネージャー（別仕様） | 担当キャストの出勤率/売上/給与を閲覧（RLS）。 |

（シフト提出・売上連動バックは既存機能。P0移行で取り込む。）

### 絶対原則（CLAUDE.md準拠）
1. マスタ駆動（数値はコード固定せず設定から参照）
2. 権限分離（IDOR厳禁。キャストは自分のデータと公開ランキングのみ）
3. マルチ店舗前提（全主要テーブルに `store_id`、クエリは所属店舗でスコープ）
4. 給与は単一エンジン（payroll）。確定はスナップショットで不変
5. ★未確定値はハードコードしない

## 2. ロールと認証

4種のプリンシパル：

| role | 用途 | 主なアクセス |
|---|---|---|
| `admin` | 経営・オーナー | 店内フル（閲覧・編集・給与確定） |
| `kurofuku` | 黒服（中間層） | 自分の勤怠＋**担当キャストの閲覧のみ**（P4で本格化） |
| `cast` | キャスト | 自分のデータ＋公開ランキングのみ |
| `terminal` | 店舗共有端末 | `punch` RPCの実行のみ（勤怠の書込はRPC経由に限定） |

- Supabase Authで管理。`profiles.role` で判別。
- 端末は1店舗に1つの `terminal` アカウントでログインし、個人QRをかざして打刻する。端末自身は個人データを閲覧できない（RPC実行のみ）。

## 3. 個人QR と 打刻の安全設計

- 各ユーザー（cast/kurofuku）に不透明な `punch_token`（ランダム、推測不可）を発行。本人アプリにQRとして表示（物理カード印刷は将来対応）。
- 打刻は必ず DBの **`punch(p_token text)` RPC（SECURITY DEFINER）** 経由：
  - `clock_in_at` / `clock_out_at` は必ず `now()`（サーバー時刻）。クライアント時刻は一切信用しない。
  - token検証：無効・別店舗・退店済ユーザーのtokenは拒否。
  - 連打防止／状態遷移：当該営業日に「退勤していない記録」があれば退勤（clock_out）、無ければ出勤（clock_in）として記録。極端に短い間隔（例：30秒以内）の再スキャンは無視。
  - 呼び出し元が当該店舗の `terminal`（または admin）であることを検証。
- なりすまし対策：共有端末は監督下での運用を前提に、v1は静的 `punch_token` で開始。**ローテーションQR（例：30秒更新のTOTP的トークン）への拡張余地を残す**（`punch_token` の検証を関数内に閉じ込めることで後方互換に差し替え可能）。

## 4. データモデル（P0+P1で必要な範囲）

全テーブルに `store_id`。既存 docs/04 の論理モデルを土台に、下記を確定する。

### stores
- `id`, `name`, `closing_day`, `payment_day`, 設定JSON
- **`business_day_cutover_hour` int（既定 6）**：深夜営業のため、この時刻より前の打刻は「前日」を営業日（`business_date`）として割り当てる。

### profiles（認証主体）
- `id`（=auth.uid）, `store_id`, `role`（admin/kurofuku/cast/terminal）, `display_name`, `status`（active/inactive）, `punch_token`（cast/kurofukuのみ）

### casts（キャスト基本情報）
- `id`, `store_id`, `user_id`（→profiles 1:1）, `source_name`（源氏名）, `real_name_encrypted`（暗号化）, `rank`, `join_date`, `leave_date`, `status`
- **`manager_id`**（→担当黒服の profiles.id、任意）

### staff_profiles（黒服固有。P1では枠のみ、P2で使用）
- `id`, `store_id`, `user_id`（→profiles）, `hourly_rate`（★設定由来）, `status`

### time_records（勤怠：本Phaseの中核）
- `id`, `store_id`, `person_id`（→profiles）, `role_at_punch`（cast/kurofuku）
- `business_date`（date、カットオーバー適用後）
- `clock_in_at`（timestamptz）, `clock_out_at`（timestamptz, null可）
- `worked_minutes`（生成列：clock_out - clock_in を分換算、未退勤はnull）
- `source`（'qr' | 'manual'）, `created_by`, `updated_by`, `note`
- 補正時は旧値を `audit_logs` に記録（手動補正の追跡）。

### audit_logs
- `id`, `store_id`, `actor_user_id`, `action`, `target`, `before`, `after`, `at`, `ip`

既存の設定/実績/シフト/給与テーブル（settings, performance, shift, payrolls, payroll_items, rankings, requests）は docs/04 の論理モデルに沿ってマッピングし、現 seed を投入する。

## 5. RLS（権限分離の核）

方針：**デフォルト deny**。全ポリシーで `store_id = (自分のprofiles.store_id)` を必須化した上で、ロール別に限定する。

- **cast**：`time_records` / payroll / performance は `person_id = auth.uid()`（または自分の cast_id）の行のみ SELECT。公開フラグの立った `rankings` は SELECT 可。他者データは不可。INSERT/UPDATEは原則不可（打刻はRPC経由）。
- **kurofuku**：自分の行に加え、`casts.manager_id = auth.uid()` の担当キャストの勤怠/実績/給与を **SELECT のみ**（P4で画面化。ポリシー自体はP0で用意）。編集不可。
- **admin**：店内全行の SELECT/INSERT/UPDATE。給与確定などの特権操作。
- **terminal**：テーブル直アクセスは付与しない。`punch` RPC（SECURITY DEFINER）のみが勤怠を書き込む。

RLSはテストで担保（第8章）。

## 6. P1 QR出退勤の画面・フロー

### 端末画面 `/kiosk`
- `terminal` アカウントでログイン。フルスクリーンのカメラスキャナ（`@zxing/browser` 等の軽量QRライブラリ）。
- スキャン → `punch(token)` RPC 呼び出し → 結果を大きくフィードバック表示：「氏名・出勤 or 退勤・時刻」。エラー（無効token等）は明確に表示。
- キャスト・黒服で画面は共通（tokenが人物とroleを解決）。
- スキャン音／バイブ等で成功を明示。連続運用を想定し、数秒後に自動でスキャン待受へ戻る。

### 自分のQR画面
- cast アプリ（MyPage）と 黒服 アプリに「自分のQR」を表示（`punch_token` をQR化）。

### 勤怠ビュー
- **cast**：自分の打刻履歴（既存 `AttendancePage` を出勤/退勤時刻・勤務時間表示に拡張）。
- **admin**：店内の勤怠一覧＋**手動補正**（補正は `audit_logs` に記録）。
- **黒服**：自分の勤怠（担当キャスト閲覧はP4）。

### サーバー権威時刻
- すべての打刻時刻はRPC内の `now()`。タイムゾーンは Asia/Tokyo 基準で営業日を計算。

## 7. 既存デモの移行方針

- Context（Settings/Performance/Shift/PayrollSnapshot/Auth）を Supabase データ層に差し替え。**UIページは極力流用**（データソースのみ差し替え）。
  - `lib/supabase` クライアント＋型付きデータアクセス（hooks）を新設し、各 Context を段階的に置換。
- 現 `data/seed.ts` の内容を Supabase 投入用 seed（SQL or スクリプト）に変換し、連続性を確保。
- 認証は Supabase Auth に移行（デモのログインスキップは開発用フラグとして残してよいが、本番は実ログイン）。

## 8. テスト戦略

- **RLS / IDOR**：cast が他者の `time_records` を読めないこと、kurofuku が非担当キャストを読めないこと、別店舗データにアクセスできないことを、Supabase のポリシーテスト（pgTAP もしくは認証付きクライアントでの自動テスト）で検証。
- **punch RPC**：
  - 初回スキャン→出勤記録作成、2回目→退勤記録（clock_out）
  - 30秒以内の再スキャンは無視
  - 別店舗／無効／退店済 token の拒否
  - 営業日カットオーバー（例：02:00の打刻は前日 business_date）
- **回帰**：移行後も SAKURA 給与 ¥480,000（basePay 294,000 + commission 115,000 + backs 79,500 − deductions 8,500）が一致すること。
- **給与・権限は必ずテストを伴う**（CLAUDE.md原則）。

## 9. スコープ外（本書では扱わない）

- P2 黒服の時給×時間による給与計算（枠のみ用意）
- P3 当日欠勤ペナルティの給与反映（判定＝承認済シフトがある日に打刻無し、状態別固定額。マスタ `settings.penalties` を使用）
- P4 黒服マネージャーの担当キャスト閲覧画面（RLSポリシーはP0で用意、画面はP4）
- ローテーションQR・物理カード印刷（将来拡張）

## 10. 未確定事項（実装中に確認）

- `punch_token` のQRエンコード仕様（プレーンtoken or 署名付き）。v1はプレーンで開始。
- 端末アカウントの配布・ログイン維持方法（PWA/kioskモード等）。
- 本名など機微情報の暗号化方式（Supabase の pgcrypto or アプリ層）。docs/04の方針を踏襲。
