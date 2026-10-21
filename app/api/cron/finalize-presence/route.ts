import { NextResponse } from "next/server";
import { rejectUnlessCron } from "@/lib/server/cron-auth";
import { realDocDb } from "@/lib/server/doc-db";
import { finalizeStaleBreaks } from "@/lib/server/time-off";

export const dynamic = "force-dynamic";

/** Nightly: closes breaks that were left running past midnight. Safe to run any number of times. */
export async function GET(req: Request) {
  const denied = rejectUnlessCron(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await finalizeStaleBreaks(realDocDb()));
  } catch (error) {
    console.error("finalize-presence failed", error);
    return NextResponse.json({ error: "Finalize failed." }, { status: 500 });
  }
}
