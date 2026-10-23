import "server-only";
import { adminDb } from "@/lib/server/admin";
import { createAutomationDeps } from "@/lib/server/automation-deps-core";
import type { AutomationDeps } from "@/lib/server/automation";
import { pushNotice } from "@/lib/server/push";

export const realAutomationDeps = (): AutomationDeps => createAutomationDeps(adminDb(), pushNotice);
