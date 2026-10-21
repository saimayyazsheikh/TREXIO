# 06 — UI/UX Guidelines (Traxio)

## Design intent
Premium, calm-but-colorful SaaS feel. Never a plain white page: layered gradient backgrounds, soft glass cards, vivid accent colors, generous spacing. Every element self-explanatory.

## Tokens
> The authoritative, contrast-verified palette and type system is `design-system/traxio/MASTER.md` (generated from the ui-ux-pro-max skill). The values below are the original intent; where they differ, MASTER wins.
- **Brand:** indigo?violet gradient (#4F46E5 ? #7C3AED, white text >= 5.7:1), accent cyan, success emerald, warning amber, danger rose; lighter tonal variants are used for text in dark mode.
- **Status colors:** To-Do slate, In Progress blue, Under Review violet, Completed emerald, Blocked rose. Always paired with icon + label.
- **Priority:** High rose (flame icon), Medium amber, Low sky.
- **Business colors:** each business has its own color from a curated accessible swatch list; used on chips, card left-border, avatar rings.
- **Backgrounds:** light = soft gradient (#F5F7FF?#EEF2FF) with low-intensity color blobs; dark = deep navy (#070B18, never pure black) with glow blobs.
- **Glass:** near-opaque blurred surface (`.glass` utility) for shells, cards and modals; text always sits on >= 4.5:1.
- **Type:** Plus Jakarta Sans (headings/numbers) + Inter (UI); scale 12/14/16/20/24/32; body 16px / 1.5; tabular figures for numbers. Radius 12 (controls) / 18 (cards). 4/8 spacing.
- **Motion:** Framer Motion, 150�300 ms ease-out, exits shorter than enters; respect reduced-motion.
## Layout
- **Admin:** left sidebar (grouped, icons + labels, collapsible), top bar (search/⌘K, notifications, theme, profile). Groups: *Overview* (Dashboard, Live Activity) · *Work* (Tasks, Kanban, Daily Templates, Reminders) · *People* (Employees, Journals, Presence, Leave) · *Communicate* (Inbox/Questions, Chat) · *Insights* (Analytics, AI Summaries, Audit Logs) · *Settings* (pinned at bottom: Team, Businesses, Calendar, Automation, Notifications).
- **Employee:** simpler sidebar: Today, My Board, Journal, Reminders, Ask a Question, Chat, Leave & Breaks. Persistent **status pill** (Active / Break) with one-click Start Break.
- Mobile: bottom tab bar for employee, drawer for admin.

## UX rules (no training needed)
1. **Every page** has a title + one-line subtitle explaining its purpose.
2. **Every icon button** has a tooltip + aria-label; destructive actions confirm.
3. **Empty states** explain what the page is for and offer the primary action.
4. One feature = one place. Questions ≠ Chat ≠ Reminders: use distinct icons, colors, names, and helper text ("Questions are for formal help requests; Chat is for quick talk").
5. Consistent patterns: cards for items, drawers for detail/edit, modals only for short decisions.
6. Immediate feedback: optimistic updates, toasts with Undo where possible, skeleton loaders.
7. Show state, not just data: overdue (red), due soon (amber), blocked reason inline, locked journal (lock icon + banner).
8. Progressive disclosure: advanced options in "More options".
9. First-run onboarding tour (admin & employee) + "?" help popovers; keyboard shortcuts (N new task, G then K kanban, ⌘K palette).
10. Accessibility: focus rings, labels, keyboard DnD alternative (move-to menu), color never the only signal.

## Key screens
- **Admin Dashboard:** KPI row (tasks today, completed %, overdue, blocked, employees online/idle/break), live status board, activity stream, per-business tabs, alerts (escalations, open questions, pending leave).
- **Employee detail (admin):** tabs — Overview · Daily Tasks · One-off Tasks · Journal · Updates & Reminders · Questions · Presence · Leave.
- **Kanban:** swimlane toggle (by employee/business), compact cards (priority, assignee avatars, sub-task progress, due chip, WhatsApp nudge icon for admin).
- **Task drawer:** title, status, priority, assignees, due, description, checklist, dependencies, linked tasks, attachments, activity timeline, "Send WhatsApp" button.
- **Journal:** left = my tasks (draggable), right = hourly timeline; current hour highlighted; past locked days greyed with lock.
- **Chat:** Slack-style three-pane.
- **Analytics:** colorful Recharts cards with consistent palette, tooltips, date range chips.

## Component library
shadcn/ui as base, restyled with tokens; build reusable `GlassCard`, `StatCard`, `StatusBadge`, `PriorityBadge`, `BusinessChip`, `AvatarStack`, `PresenceDot`, `TaskCard`, `EmptyState`, `PageHeader`.

## Copy tone
Friendly, short, action-first ("Add your first task", not "No records found").
