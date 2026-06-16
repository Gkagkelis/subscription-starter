import { NextResponse } from "next/server";
import { fetchPollsSnapshot } from "@/lib/noraya/live-polls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ζωντανές δημοσκοπήσεις από dimoskopiseis.gr (ακριβή δεδομένα, με cache 30').
// Άνοιξέ το: /api/polls/live   (πρόσθεσε ?force=1 για άμεση ανανέωση)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const snap = await fetchPollsSnapshot(force);
  return NextResponse.json(snap);
}
