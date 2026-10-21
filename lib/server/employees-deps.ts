import "server-only";
import { adminAuth, adminDb } from "@/lib/server/admin";
import type { Deps } from "@/lib/server/employees";
import { employeeDepsFor } from "@/lib/server/employees-adapter";

/** Wires the employee service to the real Firebase Admin SDK. */
export const realEmployeeDeps = (): Deps => employeeDepsFor(adminAuth(), adminDb());
