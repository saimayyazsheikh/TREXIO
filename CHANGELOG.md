# Changelog

## Work, reminders, chat and reports
- Employee Today: Tasks and Daily routines tabs (earliest first), a Not done box where missed routines wait for a reason, a day timeline and a 24-hour clock for routines, notes on tasks and steps, and the last step now finishes the task. Daily routines are editable from their card: this routine from today on, or just today.
- Team page: one-off tasks and daily routines are on separate tabs, with the last 7 days of each routine.
- Reminders: Got it, Ask (opens a linked conversation in Ask) and Completed, with each person's state shown to the admin.
- Chat: a room for each business, with its team and the admin.
- Assign task: pick one, several or all businesses; each gets its own copy.
- Reports: My performance (with PDF) for each person, and Analytics with period, business and person filters and Tasks, Journals, Attendance, Presence and One person tabs, each with CSV export.
- The audit log names the task. Tasks sort by time. The logo links home. Signed out after an hour with no activity. A chime and a flashing tab title for new notifications.

## Attendance and away status
- Presence has a new Attendance tab: one day (present, late, absent, on leave) or a whole month with a day-by-day strip. Login is the first time someone is seen in Traxio that day and logout is the last; approved leave and the business calendar decide who was expected.
- Approved short excuses and leave days now show on Presence as "On break" or "On leave" while they are happening, and excused time counts in the daily report's Breaks.
- Team members now get the same side panel as the admin; kanban cards show who the task is for.

## UI redesign: second pass
- New logo and wordmark; collapse button moved to the top of the sidebar; account menu, theme switch and bell redone.
- Stat tiles: clearer icons, red for blocked, full text, count-up and hover motion. Cleaner pills, kanban cards with the business name on top, task drawer chips.
- Live activity, audit log, reminders, inbox, presence, journals, leave, team, business cards and holidays restyled.
- A custom time chooser replaces the native clock picker. Tab and drawer focus rings no longer get clipped.
- Automation: Run now shows a plain-words result under the buttons.

## UI redesign
- New look from the supplied palette (ink, deep, forest, primary, sage, mint), light and dark: flat cards with hairline borders, a deep forest side panel, solid primary buttons, underline tabs, tinted pills and icon chips, slim scrollbars. Split-screen sign-in.
- Look only: no change to routes, data, rules or behaviour. Plan in docs/09, notes in design-system/traxio/MASTER.md.
- Fixed a theme-toggle hydration warning.

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

## Phase 9 - Analytics and AI
- Admin > Analytics: period (7/14/30/90 days) and business filters in one row, five headline numbers, and six Recharts charts (completion over time, on time versus late, completion by person, active/idle/break time, journal fill rate, what gets blocked) plus a workload-by-weekday heat map. Every chart has a table twin; the per-person table exports to CSV; the page prints cleanly to PDF.
- Chart colours follow a validated palette (colour-blind-safe order, light and dark variants), with legends, hover readouts and values at bar tips.
- Admin > AI summaries: weekly summary service with Claude (official SDK) or Gemini behind one interface, and a template fallback when no key is set. Written every Monday by the morning job, or on demand ("Summarize last week", "Week so far"); history page; optional WhatsApp copy; in-app notification.
- Emulator seed now includes two weeks of history so the charts and summaries have something to show.

## Text only: Storage removed
- Removed file attachments everywhere (tasks, reminders, questions, chat, leave), profile photos and business logos, plus Storage rules, tests, emulator and env settings. Firebase now needs only Auth, Firestore, Realtime Database and FCM, all available on the free Spark plan.
- Chat messages and question replies now require text. Client-side writes to user profiles are closed entirely (only server routes edit them).

## WhatsApp without an API
- Removed the Meta WhatsApp Cloud API integration (service, send route, templates, logs, admin number and weekly-summary-to-WhatsApp settings, rules and index).
- "Nudge on WhatsApp" now opens WhatsApp on the person's chat with the message ready. Automation has a per-person "briefing on WhatsApp" list, and AI summaries have "Share on WhatsApp".
- The 9:00 AM briefing and the late-task second alert are now in-app notifications only.

## Multi-tenant workspaces
- Every customer is now a private workspace: all data under `orgs/{orgId}`, rules requiring the login token's workspace to match, and server and browser code scoped to the signed-in workspace.
- Owners sign up with Google and get their own workspace; they add businesses and team and share the workspace code. Team members sign in with workspace code + username + password.
- Cron jobs, notifications, presence, analytics and AI summaries run per workspace. Workspace team size is capped at 25.
- 47 new rules tests try to read, list, write, delete and sweep across workspaces (as admin, employee, no-workspace and signed-out), plus live presence; the demo seed includes a second customer to see it yourself.

## Real Firebase project connected
- Connected the real project (Auth with Email/Password and Google, Firestore, Realtime Database) through `.env.local` only; nothing secret is in git. Added `npm run deploy:firebase` and published both rule sets.
- Gemini is the AI provider: default model gemini-3.5-flash, 60 s timeouts on both providers.
- Checked end to end on the live project with two throwaway workspaces (sign-in, employees, tasks, presence, cross-workspace denial, the daily job across workspaces, a real AI summary), then deleted them.
