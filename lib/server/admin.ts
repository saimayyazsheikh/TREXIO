import "server-only";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";
import { initAdminApp } from "@/lib/server/admin-config";

export const adminAuth = () => getAuth(initAdminApp());
export const adminDb = () => getFirestore(initAdminApp());
export const adminRtdb = () => getDatabase(initAdminApp());
