# C-girl 管理システム — 土台コピー＆リブランド 設計書

- 日付: 2026-09-23
- 対象リポジトリ: `Y:\k-c-girl^system`（= リポジトリルート）
- GitHub: https://github.com/rocken318/c-girl-system
- 元システム: `Y:\kingyo管理システム\キンギョ管理システム`（NEW CLUB Kingyo 向けキャスト管理システム）

## 1. 目的とスコープ

金魚（キャバクラ向けキャスト管理システム）のコード一式をフルコピーし、**ガールズバー/コンカフェ業態の「C-girl」向け**にリブランドした「動く土台」を構築する。給与・シフト・ランキング・LINE/AI/Excel など主要機能はすべて維持する。

金魚は給与の数値（時給・単価・率・控除等）がすべて**マスタ駆動**で、コードに固定値を持たない設計のため、業態が変わってもコード改変は最小限で済む。業態固有の料金体系はコードではなく設定（seed/settings）のデフォルト値で表現する。

**このセッションのゴール（土台）:**
- コピー＋リブランドされたコードが `Y:\k-c-girl^system` 直下に存在する
- 新規 git リポジトリとして初期化され、remote が GitHub に設定されている
- `npm install && npm run dev` で起動し、既存テストがグリーン
- バックエンド（Supabase/Vercel）は環境変数プレースホルダ＋手順書までを用意（実プロジェクト作成は認証操作が必要なため後段でユーザーが実施）

**このセッションでやらないこと:**
- 実 Supabase/Vercel プロジェクトの作成・キー投入
- 業態固有の詳細な料金体系の作り込み（土台完成後に設定画面から）
- C-girl 正式ロゴ・ブランドカラーの確定（暫定値で進め、後で差し替え可能に）

## 2. リポジトリ構成

金魚の内部構成をそのまま維持する。リポジトリルート = `Y:\k-c-girl^system`。

```
Y:\k-c-girl^system\
  app\            React + TS + Vite + Tailwind フロント
    src\
    public\
    supabase\     migrations / tests / seed*.sql / config.toml
    package.json, vite.config.ts, tsconfig*.json, eslint.config.js, vitest.config.ts, index.html
  api\            Vercel サーバーレス（line/ai/cron）
  docs\           仕様一式（本設計書を含む）
  vercel.json
  CLAUDE.md
  .gitignore
  .env.local.example / app\.env.local.example  （新規作成）
```

### コピーする
- `app/src`, `app/public`
- `app/package.json`, `app/vite.config.ts`, `app/vitest.config.ts`, `app/tsconfig*.json`, `app/eslint.config.js`, `app/index.html`, `app/README.md`
- `app/supabase/migrations/`, `app/supabase/tests/`, `app/supabase/seed*.sql`, `app/supabase/config.toml`, `app/supabase/.gitignore`
- `api/`
- `docs/`（金魚固有記述はリブランド対象）
- `vercel.json`, `CLAUDE.md`, `.gitignore`

### コピーしない（重要）
- `.git/`（履歴を引き継がず新規 init）
- `node_modules/`, `app/dist/`（再取得・再ビルド）
- `.vercel/`（新規プロジェクト）
- `.env.local`, `app/.env.local`（金魚の実キー — 秘匿情報）
- `app/supabase/.temp/`, `.branches/`, `start-secrets/`（ローカル状態・秘匿）
- 金魚固有の営業資料: `NEW_CLUB_Kingyo様_ご提案書_*.pdf`, `金魚システム*.pptx`, `kingyo_logo_white_transparent.png`, `S__224976900.jpg`, `DBpw.txt`, `kaitou1.txt`

## 3. リブランド仕様

金魚固有の記述は約41ファイル（コード/設定 約13、docs 約28）。

### 3.1 表示名
- 「金魚 / キンギョ / Kingyo」→ **C-girl**（UI ラベル、`<title>`、README、CLAUDE.md、docs 見出し）
- コンポーネント名 `KingyoIcon` → `CgirlIcon`（参照箇所も更新）
- CSS 変数 `--color-kingyo` → `--color-brand` に統一（意味づけをブランド非依存に）

### 3.2 ブランドカラー（暫定: ピンク/パープル系）
- 定義の集約: `app/src/index.css` の CSS 変数を単一の情報源とする
  - `--color-brand`, `--color-danger`, （旧 `--color-kingyo`）, グラデーション（`index.css` 内 4箇所）
- ハードコード箇所の是正: `SalesCompareChart.tsx`, `SalesTrendChart.tsx`, `lib/exportPayroll.ts`（計3箇所）の `#c8243e` を、可能な範囲でブランド定数へ寄せる（Recharts は文字列色が必要なため、共有定数 `BRAND_COLOR` を1箇所定義して参照）
- 暫定パレット（後で差し替え可能・値は実装時に確定）:
  - brand（プライマリ）: ピンク系 例 `#e6398b`
  - accent（サブ）: パープル系 例 `#8b5cf6`
  - danger は brand と分離し独立した赤系に戻す（危険操作の視認性維持）

### 3.3 ロゴ・アイコン
- `KingyoIcon.tsx` → `CgirlIcon.tsx`（暫定の簡易 SVG。後で正式ロゴに差し替え可能な単一コンポーネント）
- 金魚ロゴ png は同梱しない。ロゴを参照している箇所はテキストロゴ or 暫定アイコンにフォールバック

### 3.4 識別子・設定
- `app/supabase/config.toml`: `project_id = "kingyo"` → `"c-girl"`
- `vercel.json`: 内容は構成依存のため原則そのまま（プロジェクト名は Vercel 側設定）

## 4. 業態対応（ガールズバー/コンカフェ）

コードは変更せず、**設定/seed のデフォルト値**で表現する。

- `app/src/data/seed.ts`, `app/src/store/settings.ts`, `app/supabase/seed*.sql`: 店名・キャスト名などの初期データを C-girl 用ダミーに置換。給与体系は時給ベース中心の妥当なデフォルトへ調整（具体値は暫定、マスタ駆動なので後から画面変更可能）。
- フィーチャーフラグ（`app/src/config/featureFlags.ts`）: `SHOW_SALES_BACK` / `SHOW_COMMISSION` を業態に合わせて初期設定（バック中心でない業態なら OFF 起点も可。実装時に既定を決定）。
- 詳細な料金体系の作り込みは土台完成後、設定画面から行う（本セッション対象外）。

## 5. バックエンド接続（新規 Supabase/Vercel）

実プロジェクト作成は認証操作を伴うため本セッションでは行わない。

- `.env.local.example`, `app/.env.local.example` を新規作成し、必要な環境変数キー（`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, LINE/AI 系の各キー等）を金魚の `.env.local` の**キー名のみ**を参照して列挙（値は空／プレースホルダ）。
- `docs/` に「バックエンド接続手順書」を追加: 新規 Supabase プロジェクト作成 → migrations 適用 → seed 投入 → 環境変数設定 → Vercel 連携、の手順。
- `.gitignore` が `.env.local` を除外していることを確認（実キーの誤コミット防止）。

## 6. GitHub

- `git init` → 初期ブランチ `main`
- `git remote add origin https://github.com/rocken318/c-girl-system`
- 意味単位のコミット（下記）→ push（リモートの初期化状態は着手時に確認。空リポジトリ想定）。

## 7. コミット分割（意味単位）

1. `chore: C-girl 管理システム土台（金魚からのコピー、秘匿情報除外）`
2. `feat: C-girl 向けリブランド（表示名・カラー・アイコン・識別子）`
3. `chore: 業態デフォルト調整とバックエンド接続手順・env サンプル`

## 8. 動作確認（受け入れ基準）

- `cd app && npm install` が成功する
- `npm run test`（既存 20+ テスト）がグリーン
- `npm run dev` で起動し、デモモードで主要画面（管理/キャスト）が表示される
- UI 上に「金魚/Kingyo」表記が残っていない（grep で 0 件、docs の履歴的記述を除く）
- `.env.local` 等の秘匿ファイルがコミットに含まれない

## 9. リスクと留意点

- **Windows パスにキャレット（`^`）を含む**: `Y:\k-c-girl^system`。シェルによってはエスケープが必要。コピー処理はパスを引用符で囲んで扱う。
- **文字コード**: 日本語ファイル名・内容。UTF-8 前提でツールを使用（PowerShell 出力は `-Encoding utf8`）。
- **リブランド漏れ**: grep ベースで機械的に洗い出し、コード優先・docs は履歴的記述を許容。
- **業態デフォルト**: 暫定値。実運用値は店ヒアリング後に設定画面で確定（金魚の原則「★未確定値はハードコードしない」を継承）。
