"use client";

import { useMemo } from "react";
import { useDocument } from "@/hooks/use-document";
import { getFirebase } from "@/lib/firebase/client";
import { orgRootDocument } from "@/lib/firebase/org";

/** This workspace's name and the code its team types to sign in. */
export function useWorkspace(): { name: string | null; code: string | null; loading: boolean } {
  const ref = useMemo(() => orgRootDocument(getFirebase().db), []);
  const snap = useDocument<{ name: string; code: string }>(ref);
  return { name: snap.data?.name ?? null, code: snap.data?.code ?? null, loading: snap.loading };
}
