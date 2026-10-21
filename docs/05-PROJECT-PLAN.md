# 05 — Project Plan

Estimates assume one developer working with Claude Code, ~4–6 focused hours/day. Adjust freely.

| Phase | Scope | Est. | Milestone |
|---|---|---|---|
| 0 | Foundation | 3–4 d | App shell running on Vercel |
| 1 | Auth & Team | 3–4 d | Admin can create employees who can log in |
| 2 | Task core | 6–8 d | **MVP-1:** assign daily/one-off tasks, employees complete them |
| 3 | Kanban & relations | 5–6 d | Full board, blocked, dependencies |
| 4 | Communication | 5–6 d | Reminders, inbox, chat |
| 5 | Journal | 4–5 d | Hourly journal with lock + prompt |
| 6 | Presence, leave, calendar | 5–6 d | Live status, idle/break, leave |
| 7 | Feed & audit | 2–3 d | Live stream + audit page |
| 8 | Notifications & automation | 6–8 d | **MVP-2:** WhatsApp, briefing, escalation |
| 9 | Analytics & AI | 4–5 d | Charts + weekly AI summary |
| 10 | Polish & launch | 5–7 d | Production release |
Total ≈ 8–11 weeks; **usable internal beta after Phase 2–3 (~3 weeks)**.

## Release strategy
- **Beta 1 (after Phase 3):** pilot with one business / 2–3 employees.
- **Beta 2 (after Phase 6):** all businesses; collect feedback.
- **v1.0 (after Phase 10).**

## Risks & mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Vercel Hobby cron limits | Escalation/briefing unreliable | Vercel Pro or external pinger; idempotent handlers |
| WhatsApp template approval delays | Phase 8 blocked | Apply to Meta on day 1; build with a mock provider + feature flag |
| Firestore cost from listeners | Bills grow | Scoped queries, pagination, TTL on activity |
| Rule bugs expose data | Security | Emulator tests, review before launch |
| Idle tracking mistrust | Employee pushback | Transparent notice, only in-app tracking, no screenshots |
| Scope creep | Delays | Freeze v1 per 02 doc; park ideas in 07 |
| Firestore time-based lock rule complexity | Journal bypass | Rule tests + server-side backstop |

## Parallel non-code tasks (start now)
Create Firebase project (Blaze), Vercel project, Meta WhatsApp Business + templates, decide LLM provider, collect real employee/task data for seed, prepare logo/brand colors.

## Governance
Phase gate: demo → feedback → approve next phase. `DECISIONS.md` tracks assumptions.
