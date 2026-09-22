# C-girl 管理システム 土台コピー＆リブランド 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 金魚のコード一式を `Y:\k-c-girl^system` 直下にフルコピーし、ガールズバー/コンカフェ業態「C-girl」向けにリブランドした、起動可能・テストグリーンの土台を作る。

**Architecture:** 元システム（`Y:\kingyo管理システム\キンギョ管理システム`）を robocopy で秘匿情報・不要物を除外してコピー → 新規 git 初期化 → CSS トークン/アイコン/表示名を機械的にリブランド → 業態デフォルトと env サンプル・接続手順を整備 → 既存テストで検証。給与ロジック等はマスタ駆動のため無改変。

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind v4 / Supabase / Vercel serverless / Vitest。作業環境は Windows + PowerShell。

**参照仕様:** `docs/superpowers/specs/2026-09-23-c-girl-system-scaffold-design.md`

**共通の前提:**
- 作業ディレクトリ（リポジトリルート）: `Y:\k-c-girl^system`
- 元ディレクトリ（読み取り専用・変更しない）: `Y:\kingyo管理システム\キンギョ管理システム`
- パスにキャレット `^` を含む。PowerShell では特殊文字ではないが、必ず引用符で囲む。
- npm コマンドは `app\` 内で実行する。

---

### Task 1: コピー土台の作成（除外コピー + git 初期化 + 初回コミット）

**Files:**
- Create: `Y:\k-c-girl^system\` 直下に元リポジトリの内容（除外分を除く）
- 既存: `docs\superpowers\specs\2026-09-23-...-design.md`, `docs\superpowers\plans\2026-09-23-...-scaffold.md`（本計画。robocopy はマージコピーなので消えない）

- [ ] **Step 1: robocopy で除外コピー**

PowerShell で実行（robocopy は成功でも終了コード 1〜7 を返すため、`$LASTEXITCODE -lt 8` を成功判定とする）:

```powershell
$src = "Y:\kingyo管理システム\キンギョ管理システム"
$dst = "Y:\k-c-girl^system"
robocopy $src $dst /E `
  /XD ".git" "node_modules" "dist" ".vercel" ".temp" ".branches" `
  /XF ".env.local" "*.pptx" "*.pdf" "kingyo_logo_white_transparent.png" "S__224976900.jpg" "DBpw.txt" "kaitou1.txt"
if ($LASTEXITCODE -lt 8) { "COPY OK ($LASTEXITCODE)" } else { "COPY FAILED ($LASTEXITCODE)" }
```

Expected: `COPY OK (...)`

- [ ] **Step 2: 秘匿情報・不要物が入っていないことを検証**

```powershell
$dst = "Y:\k-c-girl^system"
"--- should NOT exist ---"
foreach ($p in @("$dst\.git","$dst\app\node_modules","$dst\app\dist","$dst\.vercel","$dst\app\.env.local","$dst\.env.local","$dst\app\supabase\.temp","$dst\kingyo_logo_white_transparent.png")) {
  "{0}  {1}" -f (Test-Path $p), $p
}
"--- should exist ---"
foreach ($p in @("$dst\app\package.json","$dst\app\src\lib\payroll.ts","$dst\api\line\webhook.js","$dst\vercel.json","$dst\CLAUDE.md","$dst\app\supabase\migrations")) {
  "{0}  {1}" -f (Test-Path $p), $p
}
```

Expected: 上段すべて `False`、下段すべて `True`

- [ ] **Step 3: git 初期化と remote 設定**

```powershell
git -C "Y:\k-c-girl^system" init -b main
git -C "Y:\k-c-girl^system" remote add origin https://github.com/rocken318/c-girl-system
git -C "Y:\k-c-girl^system" remote -v
```

Expected: origin が fetch/push 両方に表示される

- [ ] **Step 4: .gitignore が秘匿ファイルを除外していることを確認**

```powershell
Select-String -Path "Y:\k-c-girl^system\.gitignore","Y:\k-c-girl^system\app\.gitignore" -Pattern "env|node_modules|dist" | Select-Object Filename,Line
```

Expected: `.env` 系・`node_modules`・`dist` が ignore 対象に含まれる。含まれない項目があれば該当 `.gitignore` に追記してから次へ。

- [ ] **Step 5: 初回コミット**

```powershell
git -C "Y:\k-c-girl^system" add -A
git -C "Y:\k-c-girl^system" status --short | Select-Object -First 20
git -C "Y:\k-c-girl^system" commit -m "chore: C-girl 管理システム土台（金魚からのコピー、秘匿情報除外）"
```

Expected: コミット成功。`git status` に `.env.local` / `node_modules` が現れないこと。

---

### Task 2: リブランド — カラートークン + 共有ブランド定数

**Files:**
- Create: `app/src/config/brand.ts`
- Modify: `app/src/index.css`（@theme ブランド定義、グラデーション）
- Modify: `app/src/components/SalesCompareChart.tsx:22`, `app/src/components/SalesTrendChart.tsx:22`, `app/src/lib/exportPayroll.ts:156`

- [ ] **Step 1: 共有ブランド定数を作成**

Create `app/src/config/brand.ts`:

```ts
/**
 * ブランドカラーの単一情報源（暫定: ピンク×パープル）。
 * Recharts / Excel 出力など、CSS 変数を使えない箇所はここを参照する。
 * 正式カラー確定時はこの2値と index.css の @theme を差し替える。
 */
export const BRAND_COLOR = '#e6398b';
export const ACCENT_COLOR = '#8b5cf6';
```

- [ ] **Step 2: index.css の @theme ブランド定義を差し替え**

`app/src/index.css` の `/* Brand */` ブロックを置換:

```css
  /* Brand (pink) */
  --color-brand: #e6398b;
  --color-brand-light: #f06cae;
  --color-brand-dark: #b81f6d;

  /* Accent (purple) */
  --color-accent: #8b5cf6;
  --color-accent-light: #a78bfa;
  --color-accent-dark: #7c3aed;
```

同ファイル `/* Semantic */` の danger をブランドから独立した赤へ:

```css
  --color-danger: #dc2626;
  --color-danger-bg: #fef2f2;
```

同ファイル `/* Legacy aliases */` の3行（`--color-kingyo*`）を削除。

- [ ] **Step 3: ブランドグラデーションをピンク→パープルへ**

`app/src/index.css` の `.bg-brand-gradient`:

```css
.bg-brand-gradient {
  background: linear-gradient(135deg, #e6398b 0%, #b81f6d 50%, #8b5cf6 100%);
}
```

- [ ] **Step 4: ハードコード色を共有定数へ差し替え**

`app/src/components/SalesCompareChart.tsx` — ファイル冒頭の import 群に追加し、`fill="#c8243e"` を差し替え:

```tsx
import { BRAND_COLOR } from '../config/brand';
```
```tsx
      <Bar dataKey="current" name="今年" fill={BRAND_COLOR} radius={[3, 3, 0, 0]} />
```

`app/src/components/SalesTrendChart.tsx` — 同様に import 追加し `stroke="#c8243e"` を差し替え:

```tsx
import { BRAND_COLOR } from '../config/brand';
```
```tsx
      <Line type="monotone" dataKey="current" name="今年" stroke={BRAND_COLOR} strokeWidth={2} dot={false} />
```

`app/src/lib/exportPayroll.ts` — 冒頭 import に追加し、`const BRAND = '#c8243e';` を差し替え:

```ts
import { BRAND_COLOR } from '../config/brand';
```
```ts
const BRAND = BRAND_COLOR;
```

- [ ] **Step 5: 旧ブランド色が残っていないことを検証**

```powershell
Select-String -Path "Y:\k-c-girl^system\app\src\*","Y:\k-c-girl^system\app\src\**\*" -Pattern "c8243e","color-kingyo" -SimpleMatch 2>$null | Select-Object Path,LineNumber,Line
```

Expected: 出力なし（0 件）

- [ ] **Step 6: コミット（カラー分は後段の表示名とまとめて Task 4 でコミット）**

このタスクの変更は次タスク以降と同一コミット単位（リブランド）にまとめる。ここでは未コミットのまま進む。

---

### Task 3: リブランド — ロゴアイコンの差し替え

**Files:**
- Create: `app/src/components/CgirlIcon.tsx`
- Delete: `app/src/components/KingyoIcon.tsx`
- Modify: `app/src/components/AdminLayout.tsx`, `app/src/components/CastLayout.tsx`, `app/src/components/KurofukuLayout.tsx`, `app/src/pages/LoginPage.tsx`, `app/src/pages/DemoTopPage.tsx`

- [ ] **Step 1: 自己完結型 SVG の CgirlIcon を作成**

Create `app/src/components/CgirlIcon.tsx`（外部 PNG に依存しない。API は旧 KingyoIcon と互換）:

```tsx
/**
 * C-girl ロゴマーク — 自己完結型のインライン SVG（ピンク→パープルのグラデーション円に白い "C"）。
 * gradient 円が背景色に依存せず視認できるため onDark は互換のため残すのみ（描画は不変）。
 * 正式ロゴ確定時はこのコンポーネントのみ差し替える。
 */
export function CgirlIcon({
  size = 48,
  animate = false,
  onDark: _onDark = true,
}: {
  size?: number;
  animate?: boolean;
  onDark?: boolean;
}) {
  return (
    <span className={animate ? 'animate-float inline-block' : 'inline-block'}>
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="C-girl" className="object-contain">
        <defs>
          <linearGradient id="cgirl-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e6398b" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill="url(#cgirl-grad)" />
        <path d="M66 36a20 20 0 1 0 0 28" fill="none" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" />
      </svg>
    </span>
  );
}
```

- [ ] **Step 2: 旧アイコンを削除**

```powershell
Remove-Item "Y:\k-c-girl^system\app\src\components\KingyoIcon.tsx"
```

- [ ] **Step 3: 各レイアウトの import と使用箇所を差し替え**

`app/src/components/AdminLayout.tsx`:
- `import { KingyoIcon } from './KingyoIcon';` → `import { CgirlIcon } from './CgirlIcon';`
- `<KingyoIcon size={36} />` → `<CgirlIcon size={36} />`
- `<KingyoIcon size={28} />` → `<CgirlIcon size={28} />`

`app/src/components/CastLayout.tsx`:
- `import { KingyoIcon } from './KingyoIcon';` → `import { CgirlIcon } from './CgirlIcon';`
- `<KingyoIcon size={28} onDark={false} />` → `<CgirlIcon size={28} onDark={false} />`

`app/src/components/KurofukuLayout.tsx`:
- `import { KingyoIcon } from './KingyoIcon';` → `import { CgirlIcon } from './CgirlIcon';`
- `<KingyoIcon size={28} onDark={false} />` → `<CgirlIcon size={28} onDark={false} />`

`app/src/pages/LoginPage.tsx`:
- `import { KingyoIcon } from '../components/KingyoIcon';` → `import { CgirlIcon } from '../components/CgirlIcon';`
- `<KingyoIcon size={88} animate />` → `<CgirlIcon size={88} animate />`

- [ ] **Step 4: DemoTopPage の PNG 直参照を CgirlIcon に差し替え**

`app/src/pages/DemoTopPage.tsx` の import 群に追加:

```tsx
import { CgirlIcon } from '../components/CgirlIcon';
```

`<img src="/kingyo_logo_white_transparent.png" ... />`（ロゴブロックの img 要素）を置換:

```tsx
          <CgirlIcon size={120} animate />
```

- [ ] **Step 5: KingyoIcon 参照が残っていないことを検証**

```powershell
Select-String -Path "Y:\k-c-girl^system\app\src\**\*" -Pattern "KingyoIcon","kingyo_logo" 2>$null | Select-Object Path,Line
```

Expected: 出力なし（0 件）

---

### Task 4: リブランド — 表示名・識別子・ドキュメント

**Files:**
- Modify: `app/index.html`, `app/src/components/AdminLayout.tsx`, `app/src/components/CastLayout.tsx`, `app/src/components/KurofukuLayout.tsx`, `app/src/pages/LoginPage.tsx`, `app/src/pages/DemoTopPage.tsx`, `app/src/store/settings.ts:96`, `app/supabase/config.toml`, `app/README.md`, `CLAUDE.md`

- [ ] **Step 1: index.html のタイトルと favicon**

`app/index.html`:
- `<link rel="icon" type="image/png" href="/kingyo_logo_white_transparent.png" />` → `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`
- `<title>Kingyo - キャスト管理システム</title>` → `<title>C-girl - キャスト管理システム</title>`

- [ ] **Step 2: レイアウト/ページ内の "Kingyo" テキストを "C-girl" へ**

各ファイルの表示テキスト "Kingyo" を "C-girl" に置換:
- `app/src/components/AdminLayout.tsx`: `>Kingyo</div>` の2箇所 → `>C-girl</div>`
- `app/src/components/CastLayout.tsx`: `text-brand text-lg">Kingyo</span>` → `...>C-girl</span>`
- `app/src/components/KurofukuLayout.tsx`: `text-brand text-lg">Kingyo</span>` → `...>C-girl</span>`
- `app/src/pages/LoginPage.tsx`: 見出しテキスト `Kingyo` → `C-girl`

- [ ] **Step 3: DemoTopPage のタイトルとサブタイトル**

`app/src/pages/DemoTopPage.tsx`:
- `<h1 ...>Kingyo</h1>` → `<h1 ...>C-girl</h1>`
- サブタイトル `<p class="text-gold-gradient ...">金 魚</p>` → 業態に合わせたタグラインへ:

```tsx
        <p className="text-gold-gradient font-mincho text-xl tracking-[0.4em] mb-2">
          C - girl
        </p>
```

- [ ] **Step 4: 既定店名の差し替え**

`app/src/store/settings.ts`:
- `storeName: 'NEW CLUB Kingyo',` → `storeName: 'C-girl',`（暫定店名）

- [ ] **Step 5: Supabase プロジェクト識別子**

`app/supabase/config.toml`:
- `project_id = "kingyo"` → `project_id = "c-girl"`

- [ ] **Step 6: README と CLAUDE.md の見出し・プロジェクト説明を C-girl 向けに更新**

`CLAUDE.md` 冒頭の見出しと概要を C-girl 向けに書き換える（金魚→C-girl、業態＝ガールズバー/コンカフェ、開発元記述は維持）。マスタ駆動・権限分離・マルチ店舗などの原則はそのまま維持。`app/README.md` の "Kingyo/金魚" 表記も C-girl に置換。

Run（残存確認・コード優先。docs の履歴的記述は許容）:

```powershell
Select-String -Path "Y:\k-c-girl^system\app\src\**\*","Y:\k-c-girl^system\app\index.html" -Pattern "Kingyo","金魚","キンギョ" 2>$null | Select-Object Path,Line
```

Expected: `app/src` と `index.html` から 0 件（docs 配下の履歴的記述は対象外）

- [ ] **Step 7: リブランド一括コミット**

```powershell
git -C "Y:\k-c-girl^system" add -A
git -C "Y:\k-c-girl^system" commit -m "feat: C-girl 向けリブランド（表示名・カラー・アイコン・識別子）"
```

Expected: コミット成功

---

### Task 5: 業態デフォルト調整 + env サンプル + バックエンド接続手順書

**Files:**
- Create: `app/.env.local.example`
- Create: `docs/10_バックエンド接続手順.md`
- Modify: `app/src/store/settings.ts`（初期データのダミー名など、必要範囲のみ）

- [ ] **Step 1: フロント用 env サンプルを作成**

Create `app/.env.local.example`:

```
# Supabase（新規プロジェクト作成後に設定）
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# デモモード（true=ログイン不要。本番開始時に false）
VITE_DEMO_MODE=true
```

- [ ] **Step 2: バックエンド接続手順書を作成**

Create `docs/10_バックエンド接続手順.md`（api/ が使用する全 env と手順を記載）:

```markdown
# C-girl バックエンド接続手順（Supabase / Vercel 新規）

現状はデモモード（`VITE_DEMO_MODE=true`）でフロントのみで動作する。本番接続時に以下を実施する。

## 1. Supabase プロジェクト作成
1. 新規プロジェクトを作成（金魚とは別プロジェクト）。
2. `app/supabase/migrations/` を順に適用（`supabase db push` もしくはダッシュボードの SQL エディタ）。
3. `app/supabase/seed*.sql` で初期データを投入（必要なもののみ）。

## 2. 環境変数

### フロント（Vite / `app/.env.local`）
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_DEMO_MODE`（本番は `false`）

### サーバーレス API（Vercel の環境変数）
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_ANON_KEY`
- `LINE_CHANNEL_SECRET`（LINE 連携: `api/line/webhook.js`）
- `LINE_CHANNEL_ACCESS_TOKEN`（LINE 連携: webhook / attendance-confirm / cron）
- `OPENAI_API_KEY`（AI: `api/ai/*`, `api/cron/check-submissions.js`）
- `CRON_SECRET`（cron 認証: `api/cron/check-submissions.js`）

## 3. Vercel
1. 新規プロジェクトとして GitHub リポ `rocken318/c-girl-system` を接続。
2. Build 設定は `vercel.json` に準拠（`cd app && npm install && npm run build` / 出力 `app/dist`）。
3. 上記サーバーレス env を設定。cron（`/api/cron/check-submissions` 03:00）は `vercel.json` の定義どおり。
```

- [ ] **Step 3: 初期ダミーデータの店名・キャスト名を C-girl 用に調整（必要範囲のみ）**

`app/src/store/settings.ts` および `app/src/data/seed.ts` に「NEW CLUB Kingyo」「金魚」等の固有名が残っていれば C-girl 用ダミーへ置換。給与の数値（時給・単価・率）は暫定のまま維持（マスタ駆動・後で画面変更）。

Run（残存固有名の確認）:

```powershell
Select-String -Path "Y:\k-c-girl^system\app\src\store\settings.ts","Y:\k-c-girl^system\app\src\data\seed.ts" -Pattern "Kingyo","金魚" 2>$null | Select-Object Path,Line
```

Expected: 0 件

- [ ] **Step 4: コミット**

```powershell
git -C "Y:\k-c-girl^system" add -A
git -C "Y:\k-c-girl^system" commit -m "chore: 業態デフォルト調整とバックエンド接続手順・env サンプル"
```

Expected: コミット成功

---

### Task 6: 検証（install / test / dev）と push

**Files:** なし（検証のみ）

- [ ] **Step 1: 依存インストール**

```powershell
Push-Location "Y:\k-c-girl^system\app"; npm install; $code=$LASTEXITCODE; Pop-Location; "npm install exit=$code"
```

Expected: `npm install exit=0`

- [ ] **Step 2: テスト実行（既存 20+ テストの回帰確認）**

```powershell
Push-Location "Y:\k-c-girl^system\app"; npm run test; $code=$LASTEXITCODE; Pop-Location; "test exit=$code"
```

Expected: `test exit=0`（全テスト PASS）。失敗時はリブランドで壊した箇所を特定し修正（給与・権限ロジックは無改変のため主にラベル/インポート由来のはず）。

- [ ] **Step 3: 本番相当ビルドの確認**

```powershell
Push-Location "Y:\k-c-girl^system\app"; npm run build; $code=$LASTEXITCODE; Pop-Location; "build exit=$code"
```

Expected: `build exit=0`（型エラー・未解決 import がないこと）

- [ ] **Step 4: 開発サーバ起動確認（手動）**

```powershell
# 実行後ブラウザで表示確認。確認できたら Ctrl+C で停止。
Push-Location "Y:\k-c-girl^system\app"; npm run dev
```

Expected: Vite が起動しローカル URL を表示。トップ/管理/キャストの主要画面が C-girl 表示（ピンク/パープル、"C-girl" ロゴ）で描画される。

- [ ] **Step 5: 最終残存チェック（コード側で金魚表記ゼロ）**

```powershell
Select-String -Path "Y:\k-c-girl^system\app\src\**\*","Y:\k-c-girl^system\app\index.html","Y:\k-c-girl^system\app\supabase\config.toml" -Pattern "Kingyo","金魚","キンギョ","c8243e" 2>$null | Select-Object Path,Line
```

Expected: 0 件

- [ ] **Step 6: リモートへ push**

```powershell
git -C "Y:\k-c-girl^system" push -u origin main
```

Expected: push 成功。認証を求められた場合はユーザーが対応。リモートに既存コミットがある場合は状況を確認してから対応（強制 push はしない）。

---

## 完了の定義（受け入れ基準）
- `npm install` / `npm run test` / `npm run build` がすべて成功
- コード（`app/src`, `index.html`, `config.toml`）に「Kingyo / 金魚 / キンギョ / c8243e」が 0 件
- 秘匿ファイル（`.env.local` 等）がコミットに含まれない
- GitHub `rocken318/c-girl-system` の `main` に3コミットが push されている
- 起動時に C-girl ブランド（ピンク/パープル・"C-girl" ロゴ）で主要画面が表示される
