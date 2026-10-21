# Traxio Design System — MASTER

Source: `ui-ux-pro-max` skill data (styles, colors, typography, ux-guidelines, ui-reasoning), applied by hand because Python was not installed to run `search.py`. Page-specific overrides go in `design-system/traxio/pages/<page>.md` and win over this file.

## Direction
- **Product type:** SaaS productivity + operations monitoring (dense, daily-use, owner dashboards on desktop, employees mostly on phones).
- **Style:** Dark Mode (OLED-aware) + Data-Dense Dashboard. Glassmorphism is an *accent* for shells, cards and modals only (skill rates it "conditional" for accessibility: needs 4.5:1 text, visible focus, reduced-motion, near-opaque surface behind text).
- **Density dial:** ~7 (compact tables, 8px grid gap on data views, 44px touch targets kept on controls).
- **Anti-patterns to avoid (from skill):** pure `#000` backgrounds, colour-only meaning, ornate charts, excessive animation, gray-on-gray text, raw hex in components, emoji as icons.

## Colour tokens (CSS variables in `app/globals.css`; verified by `lib/design/contrast.test.ts`)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | #F5F7FF | #070B18 | page base (deep navy, never pure black) |
| `--surface-solid` | #FFFFFF | #0F1629 | cards, dialogs, inputs |
| `--surface-raised` | #EEF1FB | #172036 | hover/raised (lighter in dark = higher elevation) |
| `--foreground` | #0F172A | #F1F5FF | body text (>= 15:1) |
| `--muted` | #475569 | #A5B1CC | secondary text (>= 7:1) |
| `--border-solid` | #D5DBEA | #2A3654 | dividers |
| `--input` | #64748B | #7B89A8 | control borders (>= 3:1) |
| `--brand-from/to` | #4F46E5 → #7C3AED | same | gradient fills, always with white text (>= 5.7:1) |
| `--brand-text` | #4338CA | #A5B4FC | links, active text |
| `--ring` | #4F46E5 | #A5B4FC | 3px focus ring |
| `--accent` | #155E75 | #22D3EE | highlights |
| `--success` / `--warning` / `--danger` / `--info` | #065F46 / #92400E / #BE123C / #075985 | #34D399 / #FBBF24 / #FB7185 / #38BDF8 | semantic text and tints (>= 4.5:1 on plain and 15% tint) |
| `--danger-solid` | #BE123C | #BE123C | destructive button fill, white text |

Status: To-Do slate · In Progress blue · Under Review violet · Completed emerald · Blocked rose. Priority: High rose (flame) · Medium amber · Low sky. Every status/priority badge pairs colour with an icon and label.

**Business colours:** admin picks from a curated accessible swatch list (Phase 1), never free hex, so chips stay >= 4.5:1.

## Typography
- **Display (headings, numbers):** Plus Jakarta Sans 700–800 ("Friendly SaaS / Enterprise SaaS" pairing). **UI/body:** Inter 400/500/600 ("Minimal Swiss": dashboards, admin panels).
- Scale 12 / 14 / 16 / 20 / 24 / 32. Body 16px with line-height 1.5; controls 14px on desktop, 16px on mobile (prevents iOS zoom). Minimum 12px anywhere.
- Weights: headings 700–800, labels 500–600, body 400. Headings use `text-wrap: balance`.
- Numbers (counters, timers, tables) use the `num` utility (`tabular-nums`).
- Fonts load via `next/font` with `display: swap`.

## Spacing, shape, elevation
- 4/8px spacing scale. Radius: controls 12px, cards 18px.
- Elevation tokens only: `--shadow-1` (controls), `--shadow-2` (cards), `--shadow-3` (dialogs). No ad-hoc shadows.
- z-index scale: 0 content · 10 sticky headers · 30 app bars · 50 overlays/dialogs · 100 toasts.

## Interaction & motion
- Touch targets: 44px for primary controls (`md`/`icon`); `sm` (36px) only for dense desktop toolbars; >= 8px between targets.
- Focus: 3px `--ring` outline, never removed. Hover-only affordances are forbidden.
- Motion tokens: `--dur-fast` 150ms, `--dur-base` 200ms, `--dur-slow` 300ms, `--ease-out`. Animate transform/opacity only; exits ~65% of enter duration; `prefers-reduced-motion` disables all.
- Press feedback: scale 0.98. Loading buttons disable and show a spinner.

## Forms
Visible labels (never placeholder-only), required marker, error text below the field linked with `aria-describedby`, `role="alert"` for form-level errors, password show/hide toggle, `autocomplete` attributes, toasts never steal focus.

## Navigation
Desktop admin: collapsible sidebar with grouped icon+label items. Mobile admin: drawer. Employee: top nav on desktop, bottom tab bar (<= 5 items, icon + label) on mobile. Current page marked with `aria-current` and a filled state.

## Charts (Phase 9)
Recharts with this palette, direct labels where possible, tooltips, keyboard-reachable data table alternative, subtle gridlines, no colour-only encoding, skeleton while loading, empty/error states with retry.

## Pre-delivery checklist
- [ ] Contrast test green (`npm test`)  - [ ] Keyboard path + visible focus  - [ ] 44px targets on mobile
- [ ] Light + dark checked  - [ ] 375 / 768 / 1280 widths, no horizontal scroll  - [ ] Loading, empty, error states
- [ ] Reduced-motion honoured  - [ ] Icon-only controls have tooltip + aria-label
