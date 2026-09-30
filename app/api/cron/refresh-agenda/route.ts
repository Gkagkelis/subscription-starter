import { NextResponse } from "next/server";
import { isCronOrAdmin, pilotDb, withCronLog } from "@/lib/noraya/pilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// NORAYA — Ανανέωση βαθμολογίας θεματικών (agenda_topics)
// Καθαρά SQL, χωρίς AI. Το radar-tick έκανε αυτό το βήμα μόνο στο slot 23 του
// εξάωρου κύκλου (hh:45 σε ώρες 5, 11, 17, 23 UTC), που τα προγραμματισμένα
// τρεξίματά του δεν πετύχαιναν ποτέ — έτσι το agenda_score έμενε παγωμένο.
// ============================================================

const ROUTE = "/api/cron/refresh-agenda";

async function handle(request: Request): Promise<Response> {
  if (!(await isCronOrAdmin(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  const { data, error } = await pilotDb().rpc("refresh_agenda_topics_from_recent_articles");
  if (error) {
    return NextResponse.json({ ok: false, mode: "error", error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode: "ran", agenda_topics_refreshed: data, elapsed_ms: Date.now() - t0 });
}

export async function GET(request: Request) {
  return withCronLog(ROUTE, () => handle(request));
}
