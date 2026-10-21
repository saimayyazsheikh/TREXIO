# Decisions

Assumptions made where the docs were ambiguous. Newest last.

| # | Decision | Reason |
|---|---|---|
| D1 | Tailwind CSS v4 (CSS-first tokens in `app/globals.css`) with hand-written shadcn-style components on Radix primitives. | Current default for Next 15; no config file drift; tokens map 1:1 to docs/06. |
| D2 | Zod 3 + `@hookform/resolvers` 3. | Resolvers 6 has an unresolved peer conflict at install time; v3 is stable. |
| D3 | Session = Firebase **session cookie** (httpOnly, 5 days) minted by `POST /api/auth/session` from a fresh ID token (<5 min old). Server layouts verify it with `checkRevoked=true`, so disabling a user locks them out. | Needed for server-side route guards; middleware cannot run firebase-admin. |
| D4 | `middleware.ts` only reads the role from the cookie payload (unverified) for redirects. Real checks: `requireRole()` in layouts and Firestore/Storage rules. | Edge-safe UX routing; never a security boundary. |
| D5 | Stale/invalid cookie redirects to `/logout` (clears cookie) instead of `/login`. | Prevents a redirect loop with the middleware. |
| D6 | Phase 0 rules are deny-all; each phase opens only what it needs and adds emulator tests. | Least privilege. |
| D7 | Nav lists only routes that exist; each phase appends to `components/shell/nav-config.ts`. | No dead links. |
| D8 | Rules tests live in `tests/rules` and run with `npm run test:rules` (needs Java for the Firestore emulator). Unit tests run with `npm test`. | Separate fast and emulator suites. |
| D9 | Day boundaries use fixed UTC+5 (Pakistan has no DST) in `lib/time.ts`; Firestore rule uses the same arithmetic. | Matches docs/03 journal-lock rule. |
| D10 | UI re-based on the ui-ux-pro-max skill: palette/type in design-system/traxio/MASTER.md, contrast enforced by lib/design/contrast.test.ts. Search script not run (no Python); CSV data read directly. | User request; fixes AA failures found in the Phase 0 UI. |
| D11 | Dark mode stays opt-in/system-follow (skill flags dark-by-default as an anti-pattern for general SaaS), but is designed in parallel with light. | Skill ui-reasoning rule. |
| D12 | Employee Auth email is always username@traxio.app; a real email is stored separately as contactEmail. | Lets username login work without a pre-login lookup (rules deny anonymous reads). Only the admin signs in with a real email. |
| D13 | users documents are created/changed only by server routes (Admin SDK). The only client write is the admin setting photoUrl. Businesses are written by the admin client directly under rules. | Keeps roles, claims and status tamper-proof; businesses need no server logic. |
| D14 | Disabling an employee disables the Auth user, revokes refresh tokens and flips status. Server pages reject them immediately (session cookie is verified with revocation); an already-issued ID token can still read Firestore for up to 1 hour. | Avoids an extra Firestore read on every rules check; acceptable for an internal team tool. |
| D15 | Business colours are a curated swatch id (indigo, iolet, …) mapped to --biz-* CSS tokens, not free hex. | Guarantees contrast in both themes. |
| D16 | All task, routine, audit and activity writes happen in server routes inside one Firestore transaction via lib/server/task-store.ts (commitTaskPlan). Clients only read; rules deny every client write on these collections. | One shared writer guarantees task + audit + activity are atomic and nothing changes without a trail. |
| D17 | Workflow rules live in pure functions (lib/domain/tasks.ts): transition table, sub-task gate, review flow (an employee finishing a review-required task lands in Under Review; only the admin approves), blocked needs a 3-300 char reason. The server planners and the UI both use them. | Testable without Firebase; one source of truth. |
| D18 | Daily instance id is ${templateId}__; generation checks existence and uses create (never overwrite), falling back to one-by-one on a race. Cron (00:05 PKT, ercel.json) and a lazy call from the employee dashboard share the same function. | Idempotent under overlap; Hobby-plan friendly (once a day). Holidays/leave are added in Phase 6. |
| D19 | A routine edit rewrites today's copy only while it is untouched (To-Do, no steps ticked); earlier days are never changed. Deleting or pausing a routine keeps existing days. | Matches 'edits apply from today onward, never rewrite history'. |
| D20 | Employee Today shows today's tasks plus unfinished one-off tasks from earlier days ('Carried over'). Missed daily routines are not carried over. | Avoids a growing pile of stale routine copies; escalation (Phase 8) covers lateness. |
| D21 | Task attachments live at 	asks/{taskId}/… (admin upload, assignees read via a Firestore lookup in the Storage rule). They are shared as download URLs, so anyone holding a link can open the file. | Simple links for employees; acceptable for internal documents. |
