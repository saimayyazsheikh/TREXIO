# Traxio Design System — MASTER

The look is set out in `docs/09-UI-REDESIGN-PLAN.md`. Tokens live in `app/globals.css` and are checked by `lib/design/contrast.test.ts` (WCAG AA, light and dark). Page-specific overrides go in `design-system/traxio/pages/<page>.md` and win over this file.

## Direction
- **Product type:** SaaS productivity and team monitoring: owner dashboards on desktop, employees mostly on phones.
- **Style:** calm and flat. A deep forest side panel, a quiet work area, hairline borders, small tinted pills, one strong accent. No gradients on surfaces, no blur, no glass.
- **Anti-patterns:** pure `#000`, colour-only meaning, ornate charts, gradient fills, raw hex in components, emoji as icons.

## Palette
Ink `#051F20`, deep `#0B2B26`, forest `#163832`, primary `#235347`, sage `#8EB69B`, mint `#DAF1DE`. Neutrals are tints of these.

## Colour tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | #F3F8F4 | #051F20 | page base |
| `--surface-solid` | #FFFFFF | #0B2B26 | cards, dialogs, inputs |
| `--surface-raised` | #EDF5EF | #163832 | hover and raised areas |
| `--border-solid` | #D9E7DD | #1D4539 | hairlines |
| `--input` | #6F8F7E | #5E8F7B | control borders (>= 3:1) |
| `--foreground` | #0B2B26 | #DAF1DE | body text |
| `--muted` | #4A6358 | #8EB69B | secondary text |
| `--brand` / `--brand-fg` | #235347 / #FFFFFF | #8EB69B / #051F20 | primary buttons, active fills |
| `--brand-text` | #235347 | #8EB69B | links and active text |
| `--brand-soft` | #DAF1DE | #163832 | icon chips, avatars, active pills |
| `--sidebar-*` | forest gradient | ink | side panel (mint text, sage muted text) |

Status, priority, danger and business colours are functional hues tuned to sit on green; each one passes AA on plain and 15%-tinted surfaces in both modes.

## Shape, depth, type
- Radius: cards 16px, controls 10px, pills full. Depth: 1px border plus `--shadow-1`; `--shadow-2` for menus; `--shadow-3` for dialogs.
- Controls are 40px high (32px in dense toolbars). Interface font Inter; headings use the display font at semibold. Figures use tabular numbers (`num`).
- Tabs are an underline bar. Primary buttons are solid; secondary are outlined; ghost is quiet.

## Components
- `glass` utility is now a flat card (kept by name so every screen picks it up). `bg-brand-gradient` is a solid brand fill.
- Shells: admin sidebar (`bg-sidebar`, mint active pill with a sage marker), flat top bar; employee top bar and phone tab bar to match.
- Stat cards: label, big figure, tinted icon chip (hidden under 420px). Empty and error states: tinted icon chip, title, one line, one action.
- Charts: `.viz` palette, green / amber / blue categorical slots, green sequential ramp.
