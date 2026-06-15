import { NextResponse } from "next/server";
import {
  buildEvidencePack,
  loadPublicOpinion,
  loadVoteIntention,
  loadLeaderTraits,
  PARTY_DISAMBIGUATION,
} from "@/lib/noraya/political-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originFrom(request: Request): string {
  const h = request.headers;
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = originFrom(request);
  const topic = url.searchParams.get("topic") || "στέγαση";

  // Επιβεβαίωση ότι φορτώθηκαν τα 3 CSV
  const [po, vi, lt] = await Promise.all([
    loadPublicOpinion(origin),
    loadVoteIntention(origin),
    loadLeaderTraits(origin),
  ]);

  const counts = {
    public_opinion_rows: po.length,
    vote_intention_rows: vi.length,
    leader_traits_rows: lt.length,
  };

  if (counts.public_opinion_rows === 0) {
    return NextResponse.json({
      ok: false,
      error: "Τα CSV δεν φορτώθηκαν — έλεγξε ότι ανέβηκαν στο public/noraya-data/",
      origin,
      counts,
    });
  }

  const pack = await buildEvidencePack(origin, topic);

  return NextResponse.json({
    ok: true,
    origin,
    counts,
    disambiguation_loaded: PARTY_DISAMBIGUATION.length > 0,
    evidence_pack: pack,
  });
}
