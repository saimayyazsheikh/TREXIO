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
