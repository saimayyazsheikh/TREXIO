# 01 — Business Requirements Document (BRD): Traxio

## 1. Purpose
Give a business owner running several businesses one place to assign work, see what every employee is doing in real time, communicate, and measure productivity — without needing training or any separate server.

## 2. Problem statement
- Daily routine work and ad-hoc work are tracked on WhatsApp/paper; nothing is auditable.
- Owner cannot see who is idle, blocked, on break, or late without calling people.
- Delays are discovered too late; no escalation; no historical analytics.

## 3. Objectives & success metrics
| Objective | Metric |
|---|---|
| Replace WhatsApp task chasing | ≥90% of tasks created and closed inside Traxio |
| Real-time visibility | Admin sees status changes within 2 s |
| Accountability | 100% of status changes logged with timestamp + actor |
| Journal discipline | ≥80% hourly journal slots filled during working hours |
| Zero-training UX | New employee completes first task with no instruction |

## 4. Stakeholders & roles
- **Admin (owner)** – single account, full access across all businesses.
- **Employee** – belongs to exactly one business; sees only own data (plus group chat and tasks shared with them).
(Future: Manager role per business — see suggestions.)

## 5. In scope
Auth; business & employee management; daily (repetitive) tasks; one-off tasks; reminders; task links & multi-assignee; Kanban; priority; sub-task checklist; dependencies; hourly journal (+ auto-lock, drag tasks into slots); employee dashboards (admin view per employee); questions/updates channel; direct + group chat; hourly smart prompt; idle detection, breaks; live activity stream; leave/excuse management; holiday/weekend calendar; notifications (FCM + WhatsApp); 9 AM WhatsApp briefing; escalation matrix; analytics (Recharts); audit logs; AI weekly summary; premium UI/UX.

## 6. Out of scope (v1)
Native mobile apps (PWA instead); payroll; client-facing portal; screenshots/keystroke logging; multi-admin/multi-tenant SaaS; billing.

## 7. Functional requirements summary
See `02-FEATURES-MODULES.md` (IDs FR-xx per module).

## 8. Non-functional requirements
- **Performance:** dashboard first load < 2.5 s on 4G; realtime listeners scoped by query (never listen to whole collections).
- **Security:** role-based Firestore/Storage rules; custom claims; server-only secrets; audit log append-only.
- **Reliability:** scheduled jobs idempotent (safe to run twice).
- **Usability:** every control has label/tooltip; consistent navigation; responsive (desktop-first, fully usable on phone); light + dark theme.
- **Privacy/Ethics:** employees are told exactly what is tracked (activity within Traxio tab, breaks, journals). No hidden monitoring.
- **Cost:** stay within Firebase/Vercel free or low tiers where possible (see risks).

## 9. Assumptions
- Single timezone PKT. Working hours configurable (default 9:00–18:00) per business.
- Username login implemented as synthetic email `username@traxio.app` unless a real email is given.
- Admin provides WhatsApp Business Cloud API access (Meta) and approved message templates.
- Employee WhatsApp numbers stored in international format (+92…).

## 10. Dependencies & constraints
Vercel (hosting + cron), Firebase project (Blaze plan likely required for Storage and server-triggered features), Meta WhatsApp Business, Anthropic/Gemini API key.

## 11. Key risks
1. **Scheduled jobs on Vercel Hobby plan** run at most once per day → hourly/5-min escalation needs Vercel Pro or an external pinger (cron-job.org) calling a secured endpoint.
2. **Idle detection is browser-limited:** can only detect activity on the Traxio tab (mouse/keyboard/visibility), not the whole computer. Document this honestly in UI.
3. **WhatsApp business-initiated messages need pre-approved templates** and Meta business verification.
4. **Firebase Storage** may require Blaze (pay-as-you-go) plan for new projects.
5. Browser push requires user permission; iOS push needs PWA installed.
