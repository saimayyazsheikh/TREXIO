# 02 — Features & Modules (with acceptance criteria)

Legend: A = admin, E = employee. Dependencies show which modules must exist first.

## M0 Foundation
- Next.js app, Tailwind, shadcn/ui, design tokens, layout shells (admin shell, employee shell), theme (light/dark), toasts, error boundaries.
- Firebase init (client + admin), custom claims `{role, businessId}`, route protection middleware.
- AC: unauthenticated users redirect to /login; employees can't open /admin/*.

## M1 Authentication
- Email/username + password login (Firebase Auth). Admin account pre-created in Firebase (seed script).
- Forgot-password (admin-triggered reset for employees), logout, session persistence.
- Employees blocked if `status = disabled`.
- AC: wrong credentials show friendly error; admin lands on /admin, employee on /me.

## M2 Businesses & Employee Management (Settings → Team)
- A: CRUD businesses (name, color, logo). Color is used everywhere to tag tasks/employees.
- A: CRUD employees: photo upload, full name, email, username, password (set/reset), phone (WhatsApp), business, designation, working hours, status (active/disabled).
- Creating employee = server route using Admin SDK (does NOT sign admin out), sets custom claims.
- AC: new employee can log in immediately; disabling blocks login and hides from assignment lists.

## M3 Daily (Repetitive) Tasks
- A: define per-employee task templates: title, description, priority, optional due time, checklist, active days (default Mon–Sun minus holidays), order.
- System generates a **daily instance** per employee per working day (see 03 for generation strategy). Instances appear on employee dashboard automatically.
- A can edit/pause a template; edits apply from today onward, never rewrite history.
- AC: no duplicate instances for same employee/template/date; paused on holidays/weekends (M15).

## M4 One-off (New) Tasks
- A: create task for a date/time: title, rich description, priority, due date-time, assignees (1+), attachments, business, tags.
- AC: appears on assignee dashboards instantly; due-date shown with overdue state.

## M5 Priority
- High / Medium / Low on templates and tasks; color + icon + sort weight; filter and sort by it.

## M6 Sub-task Checklist (Micro-tasks)
- Add sub-tasks to any task/template. Employee cannot mark parent complete until all sub-tasks are complete (enforced in UI + rules/server helper).
- Progress bar (3/5) on cards.

## M7 Task Links, Multi-Assignee & Dependencies
- Multi-assignee: one task, several employees (each has own completion tick; task completes when all done, or admin chooses "any one").
- Related-task link (informational): Task 1 ↔ Task 2.
- Dependency (blocking): Task 2 cannot start/complete until Task 1 is completed; UI shows "Waiting on: Task 1".
- AC: circular dependencies rejected.

## M8 Kanban Board
- Columns: To-Do, In Progress, Under Review, Completed, Blocked. Drag & drop (dnd-kit) with optimistic UI.
- Filters: business, employee, priority, date, tags. Admin sees all; employee sees own (read/move own).
- Moving to **Blocked** requires a reason (modal); reason shown on card. Employee or admin can block; unblocking logs who/when.
- Under Review → Completed allowed to admin only (configurable per task: "requires review").
- Every move writes audit + activity.

## M9 Reminders / Updates (A → E)
- A composes message (text + images + documents), selects one/many/all employees, sends.
- Employee dashboard has **Reminders** section with unread badge, mark as read/acknowledged; admin sees read receipts.
- Optional link to a task. Optional "also send WhatsApp".

## M10 Questions / Help Requests (E → A)
- Employee opens "Ask a question" on a task or globally: text + attachments, optionally marks urgent.
- Appears in admin **Inbox** with status (Open / Answered / Closed); admin replies; thread view. **Separate from chat.**

## M11 Chat
- 1:1 admin↔employee, plus **Everyone group chat** (and optional per-business groups). Slack-like UI: channel list, unread counts, typing indicator, image/file sharing, emoji reactions, message edit/delete (own), online dot.
- Realtime via Firestore listeners (paginated, last 50 messages).

## M12 Journal (hourly log)
- Employee dashboard: timeline of hourly slots across working hours. Each slot has free text + drag-and-drop of that day's tasks into the slot (0, 1 or many tasks).
- Admin sees every employee's journal live (per-employee page + overview).
- **Auto-lock at 00:00 PKT:** previous days are read-only. Enforced by Firestore rules (server time) + visual lock state.
- **Smart hourly prompt (M13):** at :55 each hour, pop-up asks employee to fill the current slot.
- AC: editing yesterday's slot is rejected by rules even via direct API calls.

## M13 Hourly Smart Prompt
- In-app modal/toast at minute 55 (configurable 55/56) during working hours if the current slot is empty; "Fill now" opens inline quick-entry; "Snooze 3 min".
- Also triggers a browser notification if tab is in background (permission-based).

## M14 Presence, Idle & Breaks
- Heartbeat while Traxio tab open (Realtime DB presence + `onDisconnect`). Idle = no mouse/keyboard/touch/scroll for N minutes (default 5, configurable).
- Employee can start a **break** (Namaz, Lunch, Other + optional note); timer runs; end break button. While on break, idle time is not counted as idle.
- Admin: live status chips (Online / Idle 12m / On break – Namaz / Offline) per employee; per-day totals: active, idle, break; daily idle report.
- UI states clearly that tracking only tells whether the computer is in use (browser idle detection, with permission; otherwise activity inside Traxio), never which apps or sites are open.

## M15 Leave, Excuses & Holiday Calendar
- E requests leave / short excuse (type, date range or time range, reason, attachment). A approves/rejects with note; status visible to E.
- Global calendar (Settings): weekends (configurable days), public holidays (admin-managed list, optionally seed Pakistan holidays), business-specific closures. On those days daily-task instances are **not generated** and escalations pause. Approved leave also pauses that employee's daily tasks.

## M16 Live Activity Stream
- Admin dashboard feed (realtime, last 100): "Ali marked *Server check* as Done · 2m ago". Filter by business/employee/type. Source = `activity` collection written by the shared helper.

## M17 Notifications & Automation
- In-app notification center (bell) for both roles; FCM web push for standard notifications.
- **WhatsApp button** on every task card (A only): "Send WhatsApp nudge" → modal with prefilled editable message (task title, due, status, ask for reason/ETA) → sends to employee's number via server route; logged in `whatsappLogs`.
- **9:00 AM briefing:** cron sends each active employee a WhatsApp listing today's daily tasks (skipped on holidays/leave).
- **Escalation matrix:** task late ≥1h → in-app (+FCM) alert to employee; ≥3h → WhatsApp alert to admin. Each level fires once per task (idempotent flags). Configurable thresholds in Settings.

## M18 Audit Logs
- Append-only ledger: who, what, entity, from→to, timestamp (server), metadata. Task status changes are authoritative source for time-in-status calculations (e.g., In Progress → Done duration).
- Admin Audit page: filter/search/export CSV. Clients cannot write/update/delete.

## M19 Analytics & Reporting
- Recharts dashboards: completion rate (per employee / business / period), on-time vs late, productivity trend (daily/weekly), active vs idle vs break hours, blocked-task reasons, journal fill rate, workload heatmap.
- Date range + business filter; export to CSV/PDF.

## M20 AI Weekly Summary
- Weekly cron (Sunday/Monday morning) + "Generate now" button: server gathers last 7 days of journals, tasks, blocked reasons, idle stats → LLM (Claude or Gemini) → short summary with productivity highlights, bottlenecks, per-business notes, suggested actions. Stored in `aiSummaries`; shown in admin and optionally sent on WhatsApp/email.
- Only aggregated/necessary text sent to LLM; key stays server-side.

## M21 UI/UX Layer (cross-cutting)
- Per `06-UI-UX-GUIDELINES.md`: glassmorphism-accented, colorful but professional, tooltips/empty states, onboarding tour, command palette, keyboard shortcuts.

## Cross-module connections
- M3/M4 → M8 (all tasks show on Kanban) → M18/M16 (every move logged/streamed) → M19/M20 (analytics read from tasks+audit+journal+presence).
- M12 pulls tasks from M3/M4 for drag-in. M14 feeds M19 and M12 context. M15 feeds M3 generation and M17 escalation pausing. M7 feeds M8 (blocked-by-dependency badge) and M6 (completion rule).
