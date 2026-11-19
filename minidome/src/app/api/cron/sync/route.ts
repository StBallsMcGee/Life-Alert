import { NextResponse, type NextRequest } from "next/server";
import { withClient } from "@/lib/db/pg";
import { runSync } from "@/lib/sync/run";
import { providerFromEnv } from "@/lib/sync/provider-factory";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled NFL data sync. Callers must send "Authorization: Bearer <CRON_SECRET>".
 * The response says how soon the next run should happen (adaptive refresh), for schedulers
 * that can follow it; see docs/DEPLOYMENT.md.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const full = request.nextUrl.searchParams.get("full") === "1";
  const r = await withClient(async (db) => runSync(db, await providerFromEnv(db), { full }));
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
