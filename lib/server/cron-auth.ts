import "server-only";
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * Guards /api/cron/* endpoints. Fails closed: with no CRON_SECRET configured nothing runs.
 * Returns a response to send back when the request is not allowed, or null when it is.
 */
export function rejectUnlessCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
