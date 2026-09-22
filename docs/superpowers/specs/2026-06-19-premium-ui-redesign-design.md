# Premium UI Redesign — Design Spec

> **Concept**: 和モダン × 高級ナイトラウンジ
> **Approach**: C案 — CSS design tokens + minimal JS animations, zero new dependencies

---

## 1. Design System

### 1.1 Color Tokens

```
Brand
  --brand          : #c8243e  (金魚レッド core)
  --brand-light    : #e8485f
  --brand-dark     : #9a1c30
  --brand-gradient : linear-gradient(135deg, #c8243e 0%, #a01d32 60%, #7a1526 100%)

Gold / Accent
  --gold           : #c9a84c
  --gold-light     : #e8d5a0
  --gold-shimmer   : linear-gradient(135deg, #c9a84c 0%, #e8d5a0 40%, #c9a84c 80%)

Ink (text)
  --ink            : #1a1a1a  (墨色)
  --ink-secondary  : #4a4a4a
  --ink-tertiary   : #8a8a8a
  --ink-placeholder: #b0b0b0
  --ink-on-dark    : #f5f5f5
  --ink-on-brand   : #ffffff

Water (cool backgrounds)
  --water-50       : #f0f7fa
  --water-100      : #e0eff5
  --water-200      : #c5e2ed

Surface hierarchy
  --surface-base     : #f8f6f4  (warm off-white, not pure white)
  --surface-card     : #ffffff
  --surface-elevated : #ffffff  (+ shadow-elevated)
  --surface-overlay  : rgba(0,0,0,0.5)
  --surface-glass    : rgba(255,255,255,0.72)  (+ backdrop-blur)
  --surface-dark     : #1a1a1a
  --surface-sidebar  : #111111

Semantic
  --success    : #2d9d78
  --success-bg : #e8f5f0
  --warn       : #d4a020
  --warn-bg    : #fdf6e3
  --danger     : #c8243e  (reuse brand)
  --danger-bg  : #fef2f2
```

### 1.2 Typography

```
Heading (serif/mincho): "Hiragino Mincho ProN", "Noto Serif JP", "Yu Mincho", serif
  - Display: 2.75rem/1 weight 700, letter-spacing -0.02em
  - H1: 1.75rem/1.2 weight 700
  - H2: 1.25rem/1.3 weight 600
  - H3: 1rem/1.4 weight 600

Body (sans): "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif
  - Base: 0.875rem/1.5 weight 400
  - Small: 0.75rem/1.4 weight 400
  - Tiny: 0.625rem/1.3 weight 400

Money: tabular-nums, font-feature-settings "tnum"
  - Hero: 2.75rem/1 weight 800
  - Large: 1.5rem/1 weight 700
  - Inline: inherit weight 600
```

### 1.3 Spacing & Layout

8px grid. Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Card padding: 20-24px
- Section gap: 24px
- Page padding: cast=16px, admin=24-32px

### 1.4 Radius & Shadows

```
Radius
  --radius-sm  : 8px
  --radius-md  : 12px
  --radius-lg  : 16px
  --radius-xl  : 20px
  --radius-full: 9999px

Shadows (multi-layer, warm-tinted)
  --shadow-sm      : 0 1px 2px rgba(26,26,26,0.04), 0 1px 3px rgba(26,26,26,0.06)
  --shadow-md      : 0 2px 4px rgba(26,26,26,0.04), 0 4px 12px rgba(26,26,26,0.08)
  --shadow-lg      : 0 4px 8px rgba(26,26,26,0.04), 0 8px 24px rgba(26,26,26,0.10)
  --shadow-elevated: 0 8px 16px rgba(26,26,26,0.06), 0 16px 48px rgba(26,26,26,0.12)
  --shadow-glow    : 0 0 20px rgba(200,36,62,0.15)  (brand glow for hero cards)
  --shadow-gold    : 0 0 20px rgba(201,168,76,0.2)   (gold glow for rank #1)
```

### 1.5 Motion

All CSS-only except: count-up hook, fade-in observer hook.

```
Transitions
  --ease-out-expo : cubic-bezier(0.16, 1, 0.3, 1)
  --duration-fast : 150ms
  --duration-base : 250ms
  --duration-slow : 500ms

Keyframes
  @keyframes fadeInUp   : 0%{opacity:0;transform:translateY(12px)} 100%{opacity:1;transform:translateY(0)}
  @keyframes fadeIn     : 0%{opacity:0} 100%{opacity:1}
  @keyframes shimmer    : 0%{background-position:-200%} 100%{background-position:200%}
  @keyframes ripple     : subtle radial wave for water bg
  @keyframes float      : gentle Y oscillation for goldfish icon on login
  @keyframes pulse-glow : pulsing brand glow for hero salary card
```

JS hooks (< 50 lines total, no deps):
- `useCountUp(target, duration)` — animates number from 0 to target
- `useFadeIn()` — IntersectionObserver, adds `.is-visible` class

### 1.6 Glass Card

```css
.glass {
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(16px) saturate(1.2);
  border: 1px solid rgba(255,255,255,0.3);
}
```

---

## 2. Screen-by-Screen Changes

### 2.1 Login
- Full-viewport dark gradient background (#1a1a1a → #2a1520) with subtle animated water ripple
- Goldfish SVG upgraded: more detailed, gentle float animation
- "Kingyo" in serif, "金 魚" in gold gradient text
- Input fields: dark surface, light text, gold focus ring
- Login button: brand gradient with gold border, hover glow
- Overall mood: "entering a private members' club"

### 2.2 Cast Layout
- Header: glass card effect, brand gradient subtle line at top
- Bottom tab: floating (mx-4, mb-4, rounded-xl), glass background, shadow-lg. Active tab has brand pill indicator + scale
- Background: warm off-white with subtle water gradient mesh

### 2.3 Cast MyPage
- Salary hero: brand-gradient card with gold shimmer border, shadow-glow. Amount in serif with count-up animation
- Stats row: glass pills with icon + serif number
- Menu grid: glass cards with hover lift + shadow transition. Icons replaced with consistent SVG line icons (not emoji)

### 2.4 Cast Payroll
- Net pay hero: brand gradient card, gold border, serif amount
- Section cards: elevated surface with left gold accent bar for totals
- Deductions: subtle danger tint
- Visual hierarchy: large → medium → small font cascade

### 2.5 Cast Ranking
- Top 3 cards: #1 gold shimmer bg + gold shadow, #2 silver gradient, #3 bronze gradient
- Medal icons: refined SVG medals (not emoji)
- "You" indicator: brand glow border
- Staggered fadeInUp animation

### 2.6 Cast Attendance
- Summary: 3 glass stat cards
- Daily list: alternating subtle bg, compact but spacious enough
- Status badges: colored pills (出勤=brand, 遅刻=warn, 欠勤=danger)

### 2.7 Cast Requests / Settings
- Form fields: dark-bordered, gold focus
- Status pills: refined colors with soft bg
- Profile card: glass with avatar gradient border

### 2.8 Admin Layout
- Sidebar: dark surface (#111) with gold/brand accents
- Logo area: gold shimmer text
- Nav items: subtle hover bg, active = gold left border + brand text
- Main area: warm off-white base

### 2.9 Admin Dashboard
- KPI cards: each with unique gradient tint, icon, fadeInUp stagger
- Summary table: refined with subtle row hover, gold accent on headers

### 2.10 Admin Settings / Performance Entry
- Tab bar: pill-style with brand active state
- Form sections: card grouping with serif section headers + thin gold rule
- Grid cells: refined color-coding with hover states
- Preview sidebar: glass card with live calculation

---

## 3. Component Inventory

New/modified shared components:
- `GlassCard` — reusable glass surface wrapper
- `KingyoIcon` — upgraded SVG with more detail + optional animation
- `TabIcons` — SVG icon set replacing all emoji (home, trophy, calendar, settings, chart, users, clipboard, edit, star)
- `CountUp` — animated number display
- `FadeIn` — wrapper applying intersection observer fade

---

## 4. Constraints

- Zero new npm dependencies
- All existing functionality, data flow, and route structure unchanged
- Contrast ratio AA minimum maintained
- Touch targets 44px minimum
- Responsive: cast=max-w-md mobile, admin=full desktop
