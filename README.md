# Traxio

Task management and team monitoring for one owner running several businesses. Next.js 15 + Firebase. See `CLAUDE.md` and `/docs`.

## Run it locally
```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

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

## Tests
- `npm test` runs unit tests (domain logic, schemas, contrast).
- `npm run test:rules` runs the Firestore/Storage rules tests against the emulators (needs Java 21+ installed).
