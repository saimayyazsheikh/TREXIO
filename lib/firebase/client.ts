"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectDatabaseEmulator, getDatabase, type Database } from "firebase/database";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { emulatorsEnabled, getFirebasePublicConfig } from "@/lib/env";

type Services = { app: FirebaseApp; auth: Auth; db: Firestore; rtdb: Database; storage: FirebaseStorage };

let services: Services | null = null;

/** Lazily initialises the Firebase web SDK once per browser session (and wires emulators in local dev). */
export function getFirebase(): Services {
  if (services) return services;
  const fresh = getApps().length === 0;
  const app = fresh ? initializeApp(getFirebasePublicConfig()) : getApp();
  const auth = getAuth(app);
  const db = getFirestore(app);
  const rtdb = getDatabase(app);
  const storage = getStorage(app);
  if (fresh && emulatorsEnabled()) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectDatabaseEmulator(rtdb, "127.0.0.1", 9000);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
  services = { app, auth, db, rtdb, storage };
  return services;
}
