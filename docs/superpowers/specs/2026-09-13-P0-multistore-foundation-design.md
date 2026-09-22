# 設計書：P0 基盤＋複数店対応（マルチストア正式化）

作成日：2026-09-13 / 承認済み（設計方向OK）
対象：NEW CLUB Kingyo キャスト管理システム「金魚」 / 開発元：合同会社 Y&Y
親ドキュメント：`docs/superpowers/specs/2026-09-13-拡張全体設計とハンドオフ.md`（P0〜P5ロードマップ）

## 1. 背景とゴール
既存はSupabase（Postgres/RLS/Auth/RPC）へ移行済みで、全主要テーブルに `store_id`・RLS（`current_store_id()`）・4ロール（admin/kurofuku/cast/terminal）を持つ。ただし **1ユーザー=1店舗固定**（`profiles.store_id`）で、系列店統合やアクティブ店舗の概念が無い。系列店は既に複数運用中のため、P0で**複数店を正式運用化**する。

P0のゴール：
- `stores` マスタに**実2店舗**を登録
- **多対多メンバーシップ**（兼務黒服対応）＋**統合閲覧ロール**（全店横断）
- **アクティブ店舗**概念とRLSの作り替え
- 既存の `store_1` 固定クエリの撤廃
- **データ投入の受け皿**（テンプレ＋取込）を用意（実データは受領後に投入）

実データ（各店の名簿・給与条件・実績）は**近日受領予定**。本Phaseは「器＋取込導線」まで。実ロードは受領後。

## 2. 絶対原則（CLAUDE.md 厳守）
1. マスタ駆動（数値は設定から）
2. 権限分離（IDOR厳禁）
3. マルチ店舗（全主要テーブルに store_id、クエリは店舗スコープ）
4. 給与は単一エンジン、確定はスナップショットで不変
5. ★未確定値はハードコードしない

## 3. 対象店舗（確定）
| 店 | kind | 所在地 | 営業 |
|---|---|---|---|
| NEWCLUB Kingyo | cabaret | 仙台市青葉区国分町2-12-4 セブンヴィレッジビル2F | 20:00–1:00（日曜休） |
| B club | club | 仙台市青葉区国分町2-10-14 エムロード6F | 20:00–1:00 |

両店とも営業20:00–1:00 → `business_day_cutover_hour = 6`（既定）のまま。

## 4. データモデル変更

### 4.1 stores（列追加）
既存 `stores(id, name, closing_day, payment_day, business_day_cutover_hour, settings, created_at)` に追加：
- `kind text`（'cabaret' | 'club' 等）
- `address text`
- `area text`（例：'仙台・国分町'）
- `status text not null default 'active'`（'active'|'inactive'）

### 4.2 user_store_memberships（新規・多対多）
```
user_store_memberships(
  id uuid pk,
  user_id uuid references profiles(id),
  store_id uuid references stores(id),
  role user_role not null,        -- 店ごとの役割（兼務黒服は店ごとに持てる）
  is_primary boolean not null default false,
  status text not null default 'active',
  created_at timestamptz default now(),
  unique(user_id, store_id)
)
```
- 一般スタッフ/キャスト＝1行、兼務黒服＝複数行。
- 既存 `profiles.store_id` から**1ユーザー1membershipを backfill**（is_primary=true, role=profiles.role）。
- `profiles.store_id` は「主店舗」として互換保持（削除しない）。

### 4.3 統合閲覧ロール
- `profiles.is_integrated_viewer boolean not null default false` を追加。
- オーナー・常務に true。新role追加はしない（adminのまま全店横断"閲覧"を許可）。
- 統合ユーザーの**横断は閲覧のみ**。確定操作（給与確定・補正等）は各店の admin 権限の範囲。

### 4.4 アクティブ店舗
- `profiles.active_store_id uuid references stores(id)`（nullable）を追加。
- 単一所属者：自店（membership の store）。
- 兼務/統合者：**店舗切替**で更新。切替時にアクセス権を検証（membership保有 OR 統合）。

## 5. 補助関数（SECURITY DEFINER・RLS再帰回避）
- `current_store_id()` を改修：`profiles.active_store_id` を返す。未設定なら is_primary の membership の store に fallback。
- `current_is_integrated()`：`profiles.is_integrated_viewer` を返す。
- `has_store_access(p_store uuid)`：`current_is_integrated() OR exists(membership where user_id=auth.uid() and store_id=p_store and status='active')`。
- `current_role_name()` / `current_cast_id()` は既存維持（必要なら active store 考慮に微修正）。

## 6. RLS 作り替え
全テーブルの SELECT ポリシーを、従来の `store_id = current_store_id()` から
**`has_store_access(store_id)` ＋ 役割ロジック** へ変更する。効果：
- **統合ユーザー**：全店の行を読める（横断閲覧）。
- **一般 admin**：所属店のみ（has_store_access が membership 店のみ true）。
- **兼務黒服**：所属する複数店を読める。各店で kurofuku の担当ロジック（`casts.manager_id = auth.uid()`）は従来どおり。
- **cast**：従来どおり自分の行のみ（IDOR維持）。

書込（INSERT/UPDATE）：
- 従来の admin 限定書込は **「has_store_access かつ その店で admin 相当のmembership」** に変更。統合者の横断"書込"は付与しない（閲覧のみ）。
- 打刻 `punch` RPC 等は従来どおり（terminal/admin、店舗検証は membership/active で整合）。

※ 影響範囲：`0005_rls_policies.sql` / `0006_domain_tables.sql` の全ポリシーと補助関数。新マイグレーション（例 `0007_multistore.sql`）で memberships/列追加、`0008_rls_multistore.sql` でポリシー置換。

## 7. アプリ側の店舗スコープ化
- ハードコード撤廃：`pages/admin/ImportPage.tsx`（`STORE_ID='store_1'`）、`pages/admin/PerformanceEntryPage.tsx`、デモseedフォールバック等を**アクティブ店舗参照**に置換。
- `AuthContext` に `activeStoreId` と `memberships`・`isIntegratedViewer` を載せる（profiles＋memberships取得）。
- **店舗切替UI（最小）**：兼務/統合ユーザーにのみ管理ヘッダへドロップダウン表示。切替で `profiles.active_store_id` 更新＋再取得。単一所属者には非表示。
- 全店合算ダッシュボードは **P3**（本Phase対象外）。

## 8. データ投入の受け皿
- **投入テンプレ（Excel/CSV）** を定義：
  - キャスト名簿：源氏名・ランク・入店日・時給・（任意）本指名/場内/同伴などの単価上書き
  - 黒服名簿：表示名・時給
  - （任意）月次実績：対象月・源氏名・各売上/本数
- 取込は既存 `lib/csvImport.ts` / `ImportPage` を拡張。**取込先＝アクティブ店舗**、`import_batches` で**冪等（洗い替え）**。
- 本Phaseは「テンプレ＋取込導線」を完成させる。**実データのロードは受領後**に各店ぶん実行。

## 9. seed（動作確認用）
- 実2店（Kingyo/B club）を投入（既存デモ店行を Kingyo にリネーム流用＋B club 追加）。
- **オーナー/常務**アカウント（`is_integrated_viewer=true`）を作成（横断閲覧の検証用）。
- **両店に所属する兼務黒服**を1名（memberships 2行）作成（兼務/横断の検証用）。
- 既存デモキャスト（SAKURA等）は Kingyo 所属に整理。給与回帰（SAKURA ¥396,000）は維持。

## 10. テスト
- **pgTAP（RLS）**：
  - 統合ユーザー＝Kingyo/B club 両店の行が見える
  - 一般 admin（Kingyo所属）＝B club の行は見えない
  - 兼務黒服（両店membership）＝両店が見える、担当外キャストは見えない
  - cast＝自分の行のみ（IDOR）
  - 統合ユーザーでも他店への**書込**は不可
- **回帰**：SAKURA 給与 ¥396,000 維持（payrollRegression）。
- **ビルド/Lint**：`tsc -b && vite build` 型エラー無し、新規lintエラーを増やさない。
- **移行安全性**：既存プロダクションの1店（現seed）→ Kingyo にリネーム、全 profiles に membership を backfill、active_store_id を主店舗で初期化。既存データが引き続き読めること。

## 11. マイグレーション計画（概要）
1. `0007_multistore.sql`：stores 列追加、`user_store_memberships`、`profiles` へ `is_integrated_viewer`/`active_store_id` 追加、backfill（profiles.store_id→membership, active_store_id）。
2. `0008_rls_multistore.sql`：補助関数改修（current_store_id/has_store_access/current_is_integrated）＋全RLSポリシー置換。
3. `seed.sql` 更新：2店＋オーナー/常務＋兼務黒服。
4. 本番：`supabase db push` ＋ 差分seed/2店目の投入（既存1店はリネーム）。

## 12. スコープ外（後続Phase）
- P1 売上目標＆達成率 / P2 出勤率・黒服別KPI / P3 全店合算ダッシュボード・本格店舗切替 / P4 LINE・未提出督促 / P5 AI分析。

## 13. 未確定（データ受領時に確定）
- 各店の給与条件（時給/単価/率）の差異 → 店ごと `settings`（マスタ）で保持。受領後に投入。
- 追加店舗の有無（現状は2店で確定）。
- 投入テンプレの最終列定義（現行Excelの項目に合わせて微調整）。
