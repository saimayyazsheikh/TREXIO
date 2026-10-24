# 09 – UI redesign plan (look only; no logic, data or UX changes)

## Why
The current look (indigo-to-violet gradients, frosted glass over a coloured backdrop, big soft shadows) reads as generic and
"AI made". The target is the calm, flat, professional style of the reference: a rich side panel, a quiet white work area,
hairline borders, small tinted pills, roomy tables, one strong accent.

## Palette (from the supplied image)
| Role | Hex |
| --- | --- |
| Ink / darkest | `#051F20` |
| Deep | `#0B2B26` |
| Forest | `#163832` |
| Primary | `#235347` |
| Sage | `#8EB69B` |
| Mint | `#DAF1DE` |

Neutrals and borders are tints of these (never grey or blue-grey), so every screen feels like one family.
Status, priority and danger colours stay functional (red, amber, blue, green) but are tuned to sit well on green.

## Light mode
- Page `#F3F8F4`, cards white, raised surfaces `#EDF5EF`, hairline borders `#D9E7DD`.
- Text `#0B2B26`, muted `#4A6358`. Primary buttons `#235347` with white text. Links and focus ring `#235347`.
- Side panel is the deep forest gradient (`#163832` to `#051F20`) with mint text, as in the reference.

## Dark mode
- Page `#051F20`, cards `#0B2B26`, raised `#163832`, borders `#1D4539`.
- Text `#DAF1DE`, muted `#8EB69B`. Primary buttons sage `#8EB69B` with ink text. Focus ring sage.
- Side panel `#051F20` on the page `#051F20` separated by a hairline, active item in raised forest.

## Shape and depth
- Radius: cards 16px, controls 10px, pills fully round. Depth by 1px border plus a very light shadow; no blur, no gradients
  on surfaces (gradient only in the side panel). Dialog overlays keep a soft dim.
- One type family for the interface (Inter), display weight limited to semibold. Tabular numbers for figures.

## Component changes
1. **Tokens** (`app/globals.css`): new palette, `--brand` + `--brand-fg` replace the gradient pair, sidebar tokens, softer
   shadows, new chart palette. `glass` becomes a flat card; `bg-brand-gradient` becomes a solid brand fill.
2. **Shell**: admin sidebar (dark forest, grouped labels, mint active pill with a sage marker), flat top bar with a hairline,
   employee top bar and mobile tab bar to match; logo mark and avatars solid.
3. **Primitives**: buttons (solid primary, outlined secondary, quiet ghost), inputs and selects, tabs as an underline bar,
   dialogs and sheets, dropdowns, tooltips, skeletons.
4. **Shared pieces**: page header, stat cards (tinted icon chip, no gradient tile), empty and error states, status,
   priority and business pills, notification bell, presence pill.
5. **Pages**: sign-in, dashboard, kanban, task cards, tables (audit, analytics, team), chat, journal, leave, settings,
   AI summaries. Mostly inherited from the tokens; each page is checked on screen and fixed where it still looks off.
6. **Charts**: green, amber and blue categorical set and a green sequential ramp, validated for contrast.

## Rules while doing it
- Components keep using semantic tokens; no raw hex in components.
- WCAG AA contrast is still enforced by `lib/design/contrast.test.ts` (updated for the new tokens) in both modes.
- No change to routes, data, rules, copy or behaviour. Existing tests stay green.

## Done when
Every page has been looked at in light and dark at desktop and phone width, `npm test`, lint and typecheck pass, and the
design notes in `design-system/traxio/MASTER.md` match what shipped.
