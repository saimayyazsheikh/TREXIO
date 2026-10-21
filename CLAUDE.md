# Traxio — Project Context for Claude Code

Read this file first, every session. Then read the docs in `/docs` in numeric order.

## What Traxio is
A task-management and team-monitoring web app for ONE admin (the business owner) who runs 4–5 separate businesses (A, B, C, D…), each with its own employees. Admin assigns daily (repetitive) tasks and one-off tasks, sends reminders, chats, tracks hourly journals, idle/break status, leave, and gets analytics + AI weekly summaries. Employees see their own dashboard, complete tasks, write hourly journals, ask questions, and chat.

## Hard constraints
- **Next.js (App Router, TypeScript) only. No separate backend server.** Deployed on Vercel.
- Server-side logic lives ONLY in Next.js Route Handlers / Server Actions (using Firebase Admin SDK) — needed for: creating employee accounts, WhatsApp sends, cron jobs, AI summaries, audit writes.
- Firebase: Auth, Firestore (primary DB), Realtime Database (presence only), Storage, Cloud Messaging (FCM).
- Timezone: Asia/Karachi (PKT, UTC+5) everywhere. Store timestamps in UTC, compute "day" boundaries in PKT.
- Two roles only: `admin`, `employee`. Security is enforced by Firestore/Storage rules, never only by UI.

## Stack
Next.js 15 + React + TypeScript, Tailwind CSS, shadcn/ui (Radix), Framer Motion, lucide-react, @dnd-kit (drag & drop), Recharts, TanStack Query where useful, Zod + React Hook Form, date-fns + date-fns-tz, Firebase JS SDK (client) + firebase-admin (server routes), Anthropic SDK or Gemini SDK (server only).

## Document map
1. `docs/01-BRD.md` – business requirements, roles, scope, assumptions
2. `docs/02-FEATURES-MODULES.md` – every feature, module by module, with acceptance criteria and cross-module links
3. `docs/03-ARCHITECTURE-DATA-MODEL.md` – architecture, Firestore schema, rules, server routes, cron strategy
4. `docs/04-IMPLEMENTATION-PLAN.md` – build order (phases), tasks per phase, definition of done
5. `docs/05-PROJECT-PLAN.md` – timeline, risks, milestones
6. `docs/06-UI-UX-GUIDELINES.md` – design system, layouts, UX rules
7. `docs/07-FEATURE-SUGGESTIONS.md` – extra features from market leaders (prioritized)
8. `docs/08-FIRST-PROMPT.md` – the kickoff prompt

## Working rules
- Build **phase by phase** per `04-IMPLEMENTATION-PLAN.md`. Finish, test, commit each phase before the next.
- Every state-changing action on tasks must go through one shared function that writes: the change + an `auditLogs` entry + an `activity` entry (atomic batch). Build this helper in Phase 2 and always reuse it.
- Never trust client-supplied role/businessId; derive from the auth token custom claims.
- Secrets only in env vars; never expose Admin SDK, WhatsApp, or LLM keys to the client.
- Every page: loading skeleton, empty state, error state, mobile-responsive.
- Every screen follows `06-UI-UX-GUIDELINES.md`. No ad-hoc styling; use design tokens.
- Keep a `CHANGELOG.md` and update `docs/04` checkboxes as phases complete.
- When a requirement is ambiguous, pick the sensible default, note it in `DECISIONS.md`, and continue.

## Env vars (see `.env.example`)
NEXT_PUBLIC_FIREBASE_* (web config), NEXT_PUBLIC_FIREBASE_VAPID_KEY, FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY, FIREBASE_DATABASE_URL, CRON_SECRET, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_* names, ANTHROPIC_API_KEY or GEMINI_API_KEY, APP_TIMEZONE=Asia/Karachi
