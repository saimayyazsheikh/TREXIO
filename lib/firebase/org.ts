"use client";

import { collection, doc, type CollectionReference, type DocumentReference, type Firestore } from "firebase/firestore";
import { ref, type Database, type DatabaseReference } from "firebase/database";

/**
 * Which workspace this browser tab belongs to. It is set once by the signed-in layout from the server's verified session,
 * and every database path below starts with it. The database rules independently require the login token to name the same
 * workspace, so even a tampered value here cannot reach anyone else's data.
 */
let currentOrg: string | null = null;

export function setCurrentOrg(orgId: string | null): void {
  currentOrg = orgId;
}

export function currentOrgId(): string {
  if (!currentOrg) throw new Error("No workspace is set. Open the app through a signed-in page.");
  return currentOrg;
}

/** A collection inside this workspace: orgCollection(db, "tasks") is orgs/<id>/tasks. */
export function orgCollection(db: Firestore, name: string, ...more: string[]): CollectionReference {
  return collection(db, "orgs", currentOrgId(), name, ...more);
}

/** A document inside this workspace: orgDocument(db, "users", uid) is orgs/<id>/users/<uid>. */
export function orgDocument(db: Firestore, name: string, ...more: string[]): DocumentReference {
  return doc(db, "orgs", currentOrgId(), name, ...more);
}

/** A Realtime Database location inside this workspace (live presence). */
export function orgRtdbRef(rtdb: Database, path: string): DatabaseReference {
  return ref(rtdb, `orgs/${currentOrgId()}/${path}`);
}

/** The workspace's own record (name and sign-in code): orgs/<id>. */
export function orgRootDocument(db: Firestore): DocumentReference {
  return doc(db, "orgs", currentOrgId());
}
