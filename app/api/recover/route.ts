import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA — «Επαναφορα» με ΕΝΑ κλικ (μετα απο διακοπη credits κ.λπ.)
// Τρεχει με τη σειρα: ειδησεις (ingest) -> ταξινομηση (μεχρι τελος)
// -> ανιχνευση γεγονοτων. Επιστρεφει τι εγινε + αν χρειαζεται ξαναπατημα.
// Χρηση: /api/recover?token=dev
// ============================================================

const BUDGET_MS = 50_000; // κραταμε αποθεμα κατω απο το οριο 60s του Vercel

async function hit(origin: string, path: string): Promise<any> {
  try {
    const r = await fetch(origin + path, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return { http: r.status, ...j };
  } catch (e: any) {
    return { http: 0, error: String(e?.message || e) };
  }
}

export async function GET(request: Request) {
  const t0 = Date.now();
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const origin = url.origin;
  const report: Record<string, any> = {};

  // 1) Ειδησεις
  const ing = await hit(origin, "/api/ingest?token=dev");
  report.ingest = { http: ing.http, inserted: ing?.summary?.totalInserted ?? null };

  // 2) Ταξινομηση — επαναλαβε μεχρι να μη μενει τιποτα (ή να τελειωσει ο χρονος)
  let classifyRounds = 0;
  let remaining: number | null = null;
  while (Date.now() - t0 < BUDGET_MS) {
    const c = await hit(origin, "/api/classify-bulk?token=dev");
    classifyRounds++;
    remaining = typeof c?.remaining_unclassified === "number" ? c.remaining_unclassified : null;
    const didWork = (c?.total_classified ?? 0) > 0;
    if (remaining === 0 || (!didWork && remaining === null)) break;
    if (classifyRounds >= 6) break;
  }
  report.classify = { rounds: classifyRounds, remaining_unclassified: remaining };

  // 3) Ανιχνευση γεγονοτων — εως 2 περασματα μεσα στον χρονο
  let detectRuns = 0;
  let remainingTopic: string | null = null;
  let eventsCreated = 0;
  while (Date.now() - t0 < BUDGET_MS && detectRuns < 2) {
    const d = await hit(origin, "/api/situation-engine/detect-events");
    detectRuns++;
    eventsCreated += Number(d?.events_created || 0);
    remainingTopic = d?.remaining_topic ?? null;
    if (!remainingTopic) break;
  }
  report.detect_events = { runs: detectRuns, events_created: eventsCreated, remaining_topic: remainingTopic };

  const finished = remaining === 0 && !remainingTopic;
  return NextResponse.json({
    ok: true,
    finished,
    next_step: finished
      ? "Ολα φρεσκα. Κανε refresh στο strategy-room."
      : "Δεν προλαβε ολα μεσα στο χρονικο οριο — ΞΑΝΑΠΑΤΑ το ιδιο URL μεχρι finished:true.",
    elapsed_ms: Date.now() - t0,
    report,
  });
}
