# Traxio

Task management and team monitoring for one owner running several businesses. Next.js 15 + Firebase. See `CLAUDE.md` and `/docs`.

## Run it locally
```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

## Try it locally without Firebase (demo mode)
Everything runs against Firebase's local emulators with fake accounts. Needs Java 21+ (`winget install Microsoft.OpenJDK.21`).
```bash
npm run emulators        # terminal 1: Auth, Firestore, Realtime DB and Storage on your machine
npm run seed:emulator    # terminal 2, once: demo businesses, team, routines and tasks (add -- --reset to start over)
npm run dev:emulated     # terminal 2: the app at http://localhost:3000
```
The seed prints the demo logins (they are also at the top of `scripts/seed-emulator.ts`). The admin signs in with an email, employees with just a username. The emulator data is wiped when you stop `npm run emulators`; run the seed again next time.
## Firebase setup (once)
1. Create a Firebase project on the **Blaze** plan (Storage needs it).
2. Build > **Authentication** > enable Email/Password.
3. Build > **Firestore Database** > create in production mode. Build > **Realtime Database** > create. Build > **Storage** > get started.
4. Project settings > Your apps > add a **Web app**, and copy its config into the `NEXT_PUBLIC_FIREBASE_*` values in `.env.local` (`NEXT_PUBLIC_FIREBASE_DATABASE_URL` is the Realtime Database URL).
5. Project settings > Service accounts > **Generate new private key**. Put `project_id`, `client_email` and `private_key` into `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` (keep the key on one line with literal `\n`). Set `FIREBASE_DATABASE_URL` to the same Realtime Database URL.
6. Deploy the rules and indexes: `npx firebase-tools deploy --only firestore,storage,database --project <your-project-id>`.
7. Create your admin account:
   ```bash
   npm run seed:admin -- --email you@example.com --password "a long password" --name "Your Name"
   ```
8. Open http://localhost:3000 and sign in with that email and password.

## Scheduled jobs
Set `CRON_SECRET` in Vercel (a long random string). Every job checks it as `Authorization: Bearer <secret>`.

| Job | Route | When | Where it runs |
|---|---|---|---|
| Daily tasks + close forgotten breaks | `/api/cron/daily` | 19:05 UTC (00:05 PKT) | `vercel.json` |
| 9:00 AM WhatsApp briefing | `/api/cron/morning-briefing` | 04:00 UTC (09:00 PKT) | `vercel.json` |
| Late-task alerts | `/api/cron/escalations` | every 10 to 15 minutes | an external pinger |

Vercel Hobby allows two cron entries, once a day each, so the two daily jobs live in `vercel.json` and the escalation check needs a free pinger such as cron-job.org: a GET to `https://your-app.vercel.app/api/cron/escalations` every 10 minutes with the header `Authorization: Bearer <CRON_SECRET>`. On Vercel Pro you can add it to `vercel.json` instead. Every job is safe to run twice. Admin > Settings > Automation also has "Run now" buttons. To trigger one by hand:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/escalations
```
Employees also get today's routines the moment they open their dashboard, so a missed daily run is harmless.

## WhatsApp
`WHATSAPP_PROVIDER=mock` (the default) records every message in Admin > Settings > Automation > WhatsApp log without sending anything, so the whole flow works before Meta approves your templates. To go live set `WHATSAPP_PROVIDER=cloud`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and the three template names. Create these message templates in Meta Business Manager (category Utility, language English) and put their names in the env vars:

| Env var | Body |
|---|---|
| `WHATSAPP_TEMPLATE_TASK_NUDGE` | `Hi {{1}}, {{2}}` |
| `WHATSAPP_TEMPLATE_MORNING_BRIEFING` | `Good morning {{1}}! Your tasks today: {{2}}` |
| `WHATSAPP_TEMPLATE_ESCALATION_ALERT` | `{{1}}` |

Employee numbers are set in Team (international format, like +923001234567); your own number for late-task alerts is in Automation.

## Browser notifications
The bell works everywhere. For alerts while Traxio is closed, set `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (Firebase console > Project settings > Cloud Messaging > Web Push certificates) and each person taps "Get alerts on this device" in the bell. Not available under the emulators.

After pulling new code, redeploy rules and indexes: `npx firebase-tools deploy --only firestore,storage,database --project <your-project-id>`. In the Firebase console, check Firestore > Indexes finishes building before first use.

## Tests
- `npm test` runs unit tests (domain logic, schemas, contrast).
- `npm run test:rules` runs the Firestore/Storage rules tests against the emulators (needs Java 21+ installed).
