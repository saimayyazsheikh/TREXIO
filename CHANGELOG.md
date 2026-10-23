# Changelog

## Phase 0 — Foundation
- Next.js 15 (App Router, TS) + Tailwind v4, design tokens from docs/06, light/dark theme.
- Shared UI kit: PageHeader, StatCard, EmptyState, ErrorState, Avatar, PriorityBadge, StatusBadge, BusinessChip, GlassCard, ConfirmDialog, Tooltip, Skeleton, Dialog, Button, Input, Label.
- AdminShell (collapsible sidebar, mobile drawer) and EmployeeShell (top nav, mobile bottom tabs).
- Firebase client/admin init, env validation, emulator config, deny-all rules, `.env.example`.
- Login page, session cookie API, `/logout`, middleware + server `requireRole` guards.
- PKT time helpers (`lib/time.ts`) with unit tests.

## Phase 0 — UI refresh (ui-ux-pro-max)
- New contrast-verified light/dark token set, elevation + motion tokens, 44px touch targets, 12px minimum text, tabular numbers, accessible badge colours.
- Login: password toggle, field-linked errors, required markers.
- Added design-system/traxio/MASTER.md and lib/design/contrast.test.ts.

## Phase 1 — Auth & Team
- Admin seed script (
pm run seed:admin), custom claims, username to email login.
- Businesses page: colour swatches, logo upload, working hours and days, active flag, safe delete.
- Team page: add, edit, photo, password reset (with generator), turn off or on, search and filters.
- Server routes under /api/admin/employees with rollback if the profile write fails.
- Firestore and Storage rules v1 with emulator tests (written; need Java to run).

## Phase 2 — Task core
- Shared task writer: every change writes the task, an audit entry and an activity entry in one transaction.
- Task rules (transitions, checklist gate, review flow, blocked reason) with unit tests.
- Daily routines per employee with nightly generation (cron) and lazy generation, idempotent.
- One-off tasks: assign, edit, delete, priority, due time, checklist, attachments.
- Employee Today screen: check-off with undo, start, checklist, review, carried-over tasks.
- Admin team-member page: tasks by day, approve or send back, routines (add, pause, edit, delete).
- Rules for tasks, routines, audit and activity; indexes; activity TTL (90 days).

## Phase 3 — Kanban and relations
- Kanban board for admin (all businesses) and employees (own tasks): drag and drop, keyboard moves (arrow keys jump columns), a Move to menu, filters (period, priority, business, person, search), swimlanes by person or business.
- Blocked needs a reason; review flow and sub-task gate enforced on every move; refused moves explain why.
- Several assignees per task with all/any completion; each person ticks their own part.
- Dependencies with loop detection and Waiting on messages; related links shown on both tasks.
- Task drawer with checklist, links, attachments and an admin history timeline.
- Light theme is the default again (matching the login page).

## Local demo mode and test pass
- Java installed; all 34 Firestore and Storage rules tests run and pass.
- Demo mode: npm run emulators, seed:emulator and dev:emulated run the whole app against local emulators with fake accounts.
- Admin dashboard shows live numbers (tasks today, completed, overdue, blocked, waiting for review).
- Fixes found by clicking through: card accent width, Kanban column width, locked check circle explains itself, buttons default to type button.

## Phase 4 - Communication
- Reminders: admin sends to chosen people or everyone with files and an optional linked task; read receipts per person; employees get a Reminders page with Got it and an unread badge.
- Questions: employees ask a formal question (subject, details, task, urgent, files); admin Inbox with Open, Answered and Closed, replies, close and reopen; unread badges on both sides.
- Chat: direct chat with the admin plus Everyone, unread counts, files, emoji reactions, edit and delete your own, typing indicator, earlier messages on demand.
- Menu badges for unread questions, chat and reminders.
- Rules and tests for all of it (50 emulator tests passing); fixed a stuck Sending placeholder found while testing chat.

## Phase 5 - Journal
- Employee Journal: an hourly timeline across working hours with autosave, drag tasks into an hour (or use the Add a task menu), a Now highlight, a day navigator, and a lock banner on past days.
- Midnight lock enforced by the database rules: the document id must contain today's PKT date computed from the server clock. 28 emulator tests cover bypass attempts (yesterday, tomorrow, someone else, forged dates, fake timestamps, bad shapes); a live forged-write attempt over the raw API was refused.
- Hourly prompt at :55 of a working hour when the hour is empty: save an entry in place, snooze 3 minutes, or skip; browser notification when the tab is hidden and allowed.
- Admin: Journal tab on each employee and a Journals overview with fill rates and expandable entries.
- Employee menu: Journal added; phones get four tabs plus a More menu.

## Phase 6 - Presence and time
- Live status (Online, Idle, On break, Offline) from activity inside the Traxio tab only, with one-click Namaz, lunch and other breaks and a plain-words tracking notice.
- Daily active/idle/break totals, rules-bounded so they can't be inflated.
- Admin: Presence board with a daily report, Leave approvals with a waiting-count badge, Holidays and closures page, and an "Online now" card on the dashboard.
- Employee: Leave and breaks page, short excuses, and a Today banner for holidays, closures and approved leave.
- Approved leave, holidays and closures pause daily task generation; a stale-break cron closes forgotten breaks.

## Phase 7 - Live feed and audit log
- Admin dashboard: live activity stream (last 100 task events) with business, person and kind-of-change filters.
- Audit log page: time range, search, filters, load-older paging and CSV export (spreadsheet-formula safe).
- Pure logic in lib/domain/audit-log.ts with tests. No rules changes: both collections were already admin-read, no client writes.

## Phase 8 - Notifications and automation
- Notification bell for both roles (live, mark read, per-device browser alerts through FCM). Reminders, question replies, leave requests and decisions, and late-task alerts all notify, saved in the same transaction as the change.
- WhatsApp service with a mock provider behind WHATSAPP_PROVIDER, a "Send WhatsApp nudge" button on every Kanban card and per person in the task drawer, and a WhatsApp log.
- 9:00 AM briefing and late-task escalation jobs (first alert in the app at +1h, second to the admin in the app and on WhatsApp at +3h), each fires once, paused by holidays, closures and leave.
- Settings > Automation: alert thresholds, briefing on/off, journal prompt minute, idle minutes, admin WhatsApp number, "Run now" buttons. Idle time and the prompt minute now follow these settings.
- One daily cron (/api/cron/daily) replaces two so Vercel Hobby's two-job limit leaves room for the briefing; escalations use an external pinger.
