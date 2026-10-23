# 04 — Implementation Plan (build order)

Order is chosen so each phase is testable and later phases reuse earlier foundations. Tick boxes as you go. Definition of Done (DoD) for every phase: works on desktop + mobile, loading/empty/error states, rules updated + emulator-tested, no TS errors, lint clean, committed, CHANGELOG updated.

## Phase 0 — Foundation (M0, M21 base)
- [x] Next.js + TS + Tailwind + shadcn/ui; design tokens (06 doc); theme toggle
- [x] Firebase client/admin init; `.env.example`; emulator config
- [x] Layout shells: AdminShell (sidebar+topbar), EmployeeShell; route guards
- [x] Shared UI kit: PageHeader, StatCard, EmptyState, Avatar, PriorityBadge, StatusBadge, GlassCard, ConfirmDialog
## Phase 1 — Auth & Team (M1, M2)
- [x] Login page, seed admin script, custom claims, username→email mapping
- [x] Settings → Businesses CRUD; Settings → Team (employee CRUD, photo upload, password reset, disable)
- [x] Rules v1 (users, businesses, storage) + tests
## Phase 2 — Task Core (M3, M4, M5, M6 + audit/activity helper)
- [x] `lib/domain/tasks`: transition helper writing task+audit+activity atomically (build FIRST)
- [x] Task templates UI (admin, per employee) + daily instance generation (cron + lazy)
- [x] One-off task creation (single assignee first), priority, due dates, attachments
- [x] Employee "Today" dashboard: daily + one-off lists, check-off, sub-task checklist with completion rule
- [x] Admin per-employee dashboard v1 (tasks tab)
## Phase 3 — Kanban & Relations (M7, M8)
- [x] Kanban board (dnd-kit) for admin + employee, filters, Blocked-with-reason modal, review flow
- [x] Multi-assignee + completion modes; related links; dependencies with cycle check and "waiting on" UI
## Phase 4 — Communication (M9, M10, M11)
- [x] Reminders (compose with attachments, read receipts, employee section)
- [x] Questions/Help inbox (threaded) — separate from chat
- [x] Chat: direct + everyone group, unread counts, attachments, typing, reactions
## Phase 5 — Journal (M12, M13)
- [x] Hourly timeline UI, text per slot, drag tasks into slots
- [x] Midnight lock rule (dayIndex) + emulator tests incl. bypass attempts
- [x] Hourly prompt at :55 (modal + browser notification)
- [x] Admin journal views (per-employee tab + overview)
## Phase 6 — Presence & Time (M14, M15)
- [x] Presence heartbeat (RTDB), idle hook, breaks (types, timer), daily rollups
- [x] Admin live status board + idle/break report
- [x] Leave/excuse requests + approval; global calendar (weekends/holidays/closures) wired into task generation
## Phase 7 — Live Feed & Audit UI (M16, M18)
- [x] Activity stream widget on admin dashboard; Audit log page (filter, search, CSV export)
## Phase 8 — Notifications & Automation (M17)
- [x] Notification center + FCM (service worker, token mgmt)
- [x] WhatsApp service (`lib/server/whatsapp.ts`), button on every task card, logs
- [x] 09:00 morning briefing cron; escalation cron (L1 in-app at +1h, L2 WhatsApp admin at +3h; idempotent flags; pauses on holidays/leave)
- [x] Settings → Automation thresholds
## Phase 9 — Analytics & AI (M19, M20)
- [x] Analytics dashboards (Recharts), filters, exports
- [x] AI weekly summary service (provider abstraction: Claude/Gemini), cron + "Generate now", history page
## Phase 10 — Polish & Launch (M21)
- [ ] Command palette (Ctrl/Cmd+K), global search, keyboard shortcuts, onboarding tour, tooltips audit
- [ ] PWA manifest/install, performance pass (indexes, listener scoping, image optimization)
- [ ] Accessibility + responsive QA; security review of rules; seed/demo data script
- [ ] Vercel deploy, env vars, cron setup (or external pinger), Firebase rules/index deploy, README + user guide
## Phase 11 — Post-launch (see 07)
Pick from suggestions: comments/@mentions, calendar view, templates, time tracking, gamification, etc.

## Testing strategy
Unit: domain rules (transitions, dependencies, sub-task gate, escalation windows, generation idempotency). Rules: Firebase emulator suite. E2E: Playwright smoke flows (login, create employee, assign, complete, journal, lock). Manual QA checklist per phase.

