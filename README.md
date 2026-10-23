# Traxio

Task management and team monitoring for business owners, as a multi-tenant web app. Next.js 15 + Firebase. See `CLAUDE.md` and `/docs`.

## How accounts work
- **Owners** sign up with Google ("Continue with Google" on the login page). Their first sign-in creates their own private **workspace** and makes them its admin. They add their businesses and team from there.
- **Team members** are created by their admin with a username and password. They sign in with the **workspace code** (shown on the Team page, like `acme-traders`), their username and their password.
- Every workspace is walled off: its data lives under `orgs/<workspace id>/` and the database rules only let a login token that names that workspace reach it. Two customers can even use the same username.
- A workspace holds up to 25 team members (one constant, `MAX_EMPLOYEES_PER_WORKSPACE`).

## Run it locally
```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```
Secrets live only in `.env.local`, which git ignores (`.env*` is ignored except the blank `.env.example` and the emulator file). Never paste keys into code, docs or chat.

## Try it locally without Firebase (demo mode)
Everything runs against Firebase's local emulators with fake accounts. Needs Java 21+ (`winget install Microsoft.OpenJDK.21`).
```bash
npm run emulators        # terminal 1: Auth, Firestore and Realtime DB on your machine
npm run seed:emulator    # terminal 2, once: two demo workspaces with businesses, team, routines and tasks (add -- --reset to start over)
npm run dev:emulated     # terminal 2: the app at http://localhost:3000
```
The seed prints the demo logins (also at the top of `scripts/seed-emulator.ts`): an owner who signs in with email and password, a team who sign in with workspace code `alpha-group` plus a username, and a second owner in a separate workspace so you can check that workspaces never mix. "Continue with Google" works in demo mode too, through the emulator's fake Google. The emulator data is wiped when you stop `npm run emulators`; run the seed again next time.

## Firebase setup (once)
1. Create a Firebase project. The free **Spark** plan is enough: Traxio uses no Storage and no Cloud Functions.
2. Build > **Authentication** > Sign-in method: enable **Email/Password** (team members) and **Google** (owners). Under Settings > Authorized domains, add the address you deploy on (`localhost` is there already).
3. Build > **Firestore Database** > create in production mode. Build > **Realtime Database** > create.
4. Project settings > Your apps > add a **Web app**, and copy its config into the `NEXT_PUBLIC_FIREBASE_*` values in `.env.local` (`NEXT_PUBLIC_FIREBASE_DATABASE_URL` is the Realtime Database URL). Under Cloud Messaging > Web Push certificates, generate a key pair and put it in `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
5. Project settings > Service accounts > **Generate new private key**. Put `project_id`, `client_email` and `private_key` into `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` (keep the key on one line with literal `\n`). Set `FIREBASE_DATABASE_URL` to the same Realtime Database URL. Keep the downloaded JSON file out of the project folder.
6. Deploy the rules and indexes: `npx firebase-tools deploy --only firestore,database --project <your-project-id>`.
7. Open the app and press **Continue with Google**. Your first sign-in creates your workspace. (Emergency alternative for an email-and-password owner: `npm run seed:admin -- --email you@example.com --password "a long password" --name "Your Name" --workspace "Your Company"`.)

## Scheduled jobs
Set `CRON_SECRET` in Vercel (a long random string). Every job checks it as `Authorization: Bearer <secret>`.

| Job | Route | When | Where it runs |
|---|---|---|---|
| Daily tasks + close forgotten breaks | `/api/cron/daily` | 19:05 UTC (00:05 PKT) | `vercel.json` |
| 9:00 AM briefing notification, plus last week's AI summary on Mondays | `/api/cron/morning-briefing` | 04:00 UTC (09:00 PKT) | `vercel.json` |
| Late-task alerts | `/api/cron/escalations` | every 10 to 15 minutes | an external pinger |

Vercel Hobby allows two cron entries, once a day each, so the two daily jobs live in `vercel.json` and the escalation check needs a free pinger such as cron-job.org: a GET to `https://your-app.vercel.app/api/cron/escalations` every 10 minutes with the header `Authorization: Bearer <CRON_SECRET>`. On Vercel Pro you can add it to `vercel.json` instead. Every job is safe to run twice. Admin > Settings > Automation also has "Run now" buttons. To trigger one by hand:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/escalations
```
Employees also get today's routines the moment they open their dashboard, so a missed daily run is harmless.

## WhatsApp
There is nothing to set up and nothing to pay for: Traxio never sends WhatsApp messages itself. Wherever a WhatsApp message would help, a button opens WhatsApp (the app, or WhatsApp Web) on that person's chat with the message already typed in, and you press send:
- on any task card or in the task drawer: "Nudge on WhatsApp" (message prefilled from the task, editable);
- in Admin > Settings > Automation: a list of today's briefing for each person;
- on Admin > AI summaries: "Share on WhatsApp".

It needs each person's number saved in Team in international format (like +923001234567) and WhatsApp (or WhatsApp Web) signed in on the device you click from. Late-task alerts and the 9:00 AM briefing arrive as bell notifications (and browser notifications for anyone who turned them on), not as WhatsApp messages.

## AI weekly summary
Every Monday the morning job writes last week's summary (highlights, bottlenecks, per-business notes, suggested actions) and puts it under Admin > AI summaries. "Summarize last week" and "Week so far" write one on demand. Set one key on the server and nothing else:

| Env var | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Uses Claude (model `claude-opus-5-5` unless `AI_MODEL` says otherwise) |
| `GEMINI_API_KEY` | Uses Gemini (`gemini-2.5-flash` unless `AI_MODEL` or `GEMINI_MODEL` says otherwise) |
| `AI_PROVIDER` | Optional: `anthropic`, `gemini` or `mock` to force one. Naming a provider with no key is an error. |

With no key, a built-in template writes the summary from the same figures (no AI, no cost), and the page says so. Only totals and per-person or per-business figures are sent to the model: never journal text, chat or attachments. Blocked-reason text typed by employees is included, clipped to 80 characters. To pass it on, press "Share on WhatsApp" on the page.

## Browser notifications
The bell works everywhere. For alerts while Traxio is closed, set `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (Firebase console > Project settings > Cloud Messaging > Web Push certificates) and each person taps "Get alerts on this device" in the bell. Not available under the emulators.

After pulling new code, redeploy rules and indexes: `npx firebase-tools deploy --only firestore,database --project <your-project-id>`. In the Firebase console, check Firestore > Indexes finishes building before first use.

## Tests
- `npm test` runs unit tests (domain logic, schemas, contrast).
- `npm run test:rules` runs the Firestore and Realtime Database rules tests against the emulators (needs Java 21+ installed).
