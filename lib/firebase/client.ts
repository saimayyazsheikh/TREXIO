"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectDatabaseEmulator, getDatabase, type Database } from "firebase/database";
import { emulatorsEnabled, getFirebasePublicConfig } from "@/lib/env";

type Services = { app: FirebaseApp; auth: Auth; db: Firestore; rtdb: Database };

let services: Services | null = null;

/** Lazily initialises the Firebase web SDK once per browser session (and wires emulators in local dev). */
export function getFirebase(): Services {
  if (services) return services;
  const fresh = getApps().length === 0;
  const app = fresh ? initializeApp(getFirebasePublicConfig()) : getApp();
  const auth = getAuth(app);
  const db = getFirestore(app);
  const rtdb = getDatabase(app);
  if (fresh && emulatorsEnabled()) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectDatabaseEmulator(rtdb, "127.0.0.1", 9000);
  }
  services = { app, auth, db, rtdb };
  return services;
}
