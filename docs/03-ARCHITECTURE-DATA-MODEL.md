# 03 — Architecture & Data Model

## 1. Architecture
```
Browser (Next.js client, Firebase client SDK)
   ├─ Firestore (realtime listeners, rules-protected)
   ├─ Realtime DB (presence only)
   ├─ Storage (avatars, attachments)
   └─ FCM (push)
Vercel (Next.js)
   ├─ Server Actions / Route Handlers (firebase-admin) → privileged ops
   └─ Cron endpoints  /api/cron/*  (secured with CRON_SECRET)
External: WhatsApp Cloud API, Anthropic/Gemini API
```
"No backend" = no separate server. Privileged logic runs as Vercel serverless functions inside the same Next.js project.

## 2. Auth & roles
- Custom claims `{ role: 'admin'|'employee', businessId }` set by admin routes. Rules use `request.auth.token.role`.
- Username login: map `username` → `username@traxio.app` (or stored email) client-side before `signInWithEmailAndPassword`.
- Admin seeded by `scripts/seed-admin.ts`.
- Next.js middleware checks a session cookie (Firebase ID token verified in route) for page guards; rules remain the real security.

## 3. Firestore collections
(`ts` = Firestore Timestamp, dates as `YYYY-MM-DD` PKT strings)
- `businesses/{id}`: name, color, logoUrl, workStart, workEnd, workDays[], active
- `users/{uid}`: role, name, username, email, phone, photoUrl, businessId, designation, status, idleThresholdMin, fcmTokens[], createdAt
- `taskTemplates/{id}`: employeeId, businessId, title, description, priority, dueTime?, subtasks[{id,title}], activeDays[], active, order, updatedAt
- `tasks/{id}`: kind('daily'|'oneoff'), templateId?, date, businessId, assigneeIds[], completion{uid:{done,at}}, completionMode('all'|'any'), title, description, priority, status, blockedReason?, blockedBy?, dueAt?, requiresReview, subtasks[{id,title,done,doneAt,doneBy}], subtaskTotal, subtaskDone, relatedTaskIds[], dependsOnIds[], attachments[], tags[], createdBy, createdAt, updatedAt, completedAt?, escalation{l1At?,l2At?}
  - Daily instance id = `${templateId}_${employeeId}_${date}` (idempotent).
- `journals/{employeeId}_{date}`: employeeId, date, dayIndex, slots{ '09': {text, taskIds[], updatedAt}, ... }, updatedAt
- `reminders/{id}`: fromUid, toUids[], body, attachments[], taskId?, readBy{uid:ts}, createdAt
- `questions/{id}`: employeeId, taskId?, subject, status, urgent, createdAt; subcollection `messages/{id}`: authorId, body, attachments[], createdAt
- `chats/{chatId}`: type('direct'|'group'), memberIds[], title, lastMessage, lastAt, unread{uid:n}; subcollection `messages/{id}`: authorId, body, attachments[], reactions{}, createdAt, editedAt
- `activity/{id}`: actorId, actorName, businessId, type, entityType, entityId, text, createdAt (TTL 90d)
- `auditLogs/{id}`: actorId, action, entityType, entityId, from, to, meta, createdAt (server timestamp). **No client write.**
- `breaks/{id}`: employeeId, date, type, note, startAt, endAt
- `presenceDaily/{employeeId}_{date}`: activeSec, idleSec, breakSec, firstSeenAt, lastSeenAt
- `leaveRequests/{id}`: employeeId, type, fromAt, toAt, reason, attachments[], status, decidedBy, decisionNote
- `calendar/{id}`: type('holiday'|'closure'), date, name, businessId|null; `settings/global`: weekendDays[], timezone, escalation{l1Min:60,l2Min:180}, briefingTime, promptMinute, idleMin
- `notifications/{id}`: toUid, title, body, link, readAt, createdAt
- `whatsappLogs/{id}`: toUid, kind, templateName, payload, status, providerId, createdAt
- `aiSummaries/{id}`: weekStart, weekEnd, text, stats, model, createdAt
RTDB: `presence/{uid}`: {state:'online'|'idle'|'break', since, lastChanged} with `onDisconnect`.

## 4. Security rules (principles)
- Admin: read/write all except `auditLogs` (read-only; created server-side).
- Employee: read own `users` doc; read own/assigned `tasks`; may update only permitted fields (status among allowed transitions, own completion, subtask done, blockedReason); read own `taskTemplates`; read/write own journal **only if `dayIndex == floor((request.time.toMillis()+18000000)/86400000)`** (today in PKT; verify rule syntax in emulator); create `questions`/`leaveRequests`/`breaks` for self; read chats where member.
- Storage: users upload under `/u/{uid}/…`, admin read all, size/type limits.
- Write rules unit tests with the Firebase emulator (Phase 0/2/5).

## 5. Server routes
- `POST /api/admin/employees` (create/update/disable/reset password, set claims)
- `POST /api/tasks/transition` (shared helper: validates rules like sub-tasks/dependencies, writes task + audit + activity in a batch) — may also be a client function using batched writes if rules suffice; prefer server for audit integrity.
- `POST /api/whatsapp/send` (admin only)
- `POST /api/ai/weekly-summary`
- Cron (GET, `Authorization: Bearer CRON_SECRET`):
  - `/api/cron/generate-daily-tasks` — daily ~00:05 PKT; generates instances for the day (skips holidays/leave); also callable lazily when employee dashboard loads (idempotent safety net)
  - `/api/cron/morning-briefing` — 09:00 PKT (04:00 UTC)
  - `/api/cron/escalations` — every 10–15 min during working hours
  - `/api/cron/lock-journals` — optional; real lock is enforced by rules
  - `/api/cron/weekly-summary` — weekly
  - `/api/cron/finalize-presence` — nightly rollups

## 6. Scheduling reality check
Vercel Hobby cron = once/day only. Options: (a) Vercel Pro (frequent crons), or (b) free external pinger (cron-job.org / GitHub Actions schedule) calling the secured endpoints every 10 min. Design all cron handlers idempotent and time-window based, so late/duplicate triggers are harmless.

## 7. Realtime & performance
Scope every listener by `assigneeIds array-contains uid` / `date`; paginate chat; denormalize names/colors into tasks/activity; composite indexes defined in `firestore.indexes.json`.

## 8. Notifications
FCM tokens stored per user device; service worker `firebase-messaging-sw.js`; notification center reads `notifications`. WhatsApp via Cloud API **template messages** (task_nudge, morning_briefing, escalation_alert) — template names in env.

## 9. Idle detection
Client hook listens to mousemove/keydown/touch/scroll + `visibilitychange`; after threshold marks idle; writes state to RTDB; accumulates seconds locally, flushes to `presenceDaily` every 60 s and on `pagehide`. Break overrides idle.

## 10. Folder structure
`app/(auth)/login`, `app/admin/*` (dashboard, employees/[id], kanban, tasks, reminders, inbox, chat, journals, activity, calendar, leave, analytics, audit, ai-summaries, settings), `app/me/*` (today, kanban, journal, reminders, ask, chat, leave), `app/api/*`, `components/ui`, `components/features/*`, `lib/firebase`, `lib/server`, `lib/domain` (task rules), `hooks`, `types`, `scripts`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`.
