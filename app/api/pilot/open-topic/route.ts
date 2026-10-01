import { NextResponse } from "next/server";
import { pilotAuth, pilotOpenTopic } from "@/lib/noraya/pilot";

export const dynamic = "force-dynamic";

// «Σήμερα»: ο πελάτης πατάει ένα θέμα για ανάλυση. Στη δωρεάν εκδοχή μετράει
// έως 3 διαφορετικά θέματα την ημέρα (το ίδιο θέμα ξανανοίγει χωρίς χρέωση).
export async function POST(req: Request) {
  const auth = await pilotAuth("/api/pilot/open-topic", "topic");
  if (auth.response) return auth.response;
  const body = await req.json().catch(() => ({}));
  const key = String(body?.key || "").trim();
  if (!key) return NextResponse.json({ ok: false, error: "missing_key" }, { status: 400 });
  const denied = await pilotOpenTopic(auth.caller, key);
  if (denied) return denied;
  return NextResponse.json({ ok: true });
}
