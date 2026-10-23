"use client";

import { createContext, useContext } from "react";
import { setCurrentOrg } from "@/lib/firebase/org";

const OrgContext = createContext<string | null>(null);

/**
 * Tells everything below which workspace the verified session belongs to. The module-level value is set during render on
 * purpose: children (hooks that build database paths) render after their parent, so it is ready before the first query.
 */
export function OrgScope({ orgId, children }: { orgId: string; children: React.ReactNode }) {
  setCurrentOrg(orgId);
  return <OrgContext.Provider value={orgId}>{children}</OrgContext.Provider>;
}

export function useOrgId(): string {
  const id = useContext(OrgContext);
  if (!id) throw new Error("useOrgId needs to be inside <OrgScope>.");
  return id;
}
