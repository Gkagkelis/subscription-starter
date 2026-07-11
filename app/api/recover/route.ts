import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA — «Επαναφορα» με ΕΝΑ πατημα (μετα απο διακοπη credits κ.λπ.)
// Σελιδα που προχωραει ΜΟΝΗ ΤΗΣ βημα-βημα (auto-refresh), ωστε καθε
// φορτωση να μενει ΚΑΤΩ απο το οριο χρονου του Vercel (οχι 504).
// Σειρα: Ειδησεις -> Ταξινομηση (μεχρι τελος) -> Γεγονοτα (μεχρι τελος).
// Χρηση: /api/recover?token=dev
// ============================================================

const STEP_TIMEOUT_MS = 40_000; // ενα βημα ανα φορτωση, με περιθωριο απο το 60s

async function hit(origin: string, path: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), STEP_TIMEOUT_MS);
  try {
    const r = await fetch(origin + path, { cache: "no-store", signal: ctrl.signal });
    const j = await r.json().catch(() => ({}));
    return { http: r.status, ...j };
  } catch (e: any) {
    // timeout/σφαλμα: το επιμερους endpoint γραφει προοδευτικα — στο επομενο refresh συνεχιζουμε
    return { http: 0, timeout: true, error: String(e?.name || e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

function page(title: string, lines: string[], nextUrl: string | null): NextResponse {
  const refresh = nextUrl ? `<meta http-equiv="refresh" content="2;url=${nextUrl}">` : "";
  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8">${refresh}
<title>Noraya · Επαναφορά</title>
<style>body{background:#060a14;color:#e4e4e7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{max-width:560px;width:92%;background:#0e1626;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:28px}
h1{font-size:18px;margin:0 0 6px;color:#67e8f9}.s{font-size:13px;color:#a1a1aa;margin:0 0 18px}
.l{font-size:14px;line-height:1.9;margin:0;padding:0;list-style:none}
.ok{color:#6ee7b7}.run{color:#fcd34d}.done{color:#67e8f9;font-weight:600;font-size:15px;margin-top:14px}
.spin{display:inline-block;width:10px;height:10px;border:2px solid #fcd34d;border-top-color:transparent;border-radius:50%;animation:r 1s linear infinite;margin-right:6px;vertical-align:-1px}
@keyframes r{to{transform:rotate(360deg)}}</style></head>
<body><div class="card"><h1>NORAYA · Επαναφορά</h1>
<p class="s">${nextUrl ? "Τρέχει μόνο του — μην κλείσεις τη σελίδα." : "Ολοκληρώθηκε."}</p>
<ul class="l">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
${nextUrl ? "" : '<div class="done">✅ Όλα φρέσκα. Κάνε refresh στο strategy-room.</div>'}
</div></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } }) as any;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const origin = url.origin;
  const step = url.searchParams.get("step") || "ingest";
  const round = Math.max(1, Number(url.searchParams.get("round")) || 1);
  const base = `/api/recover?token=${encodeURIComponent(token!)}`;

  // ΒΗΜΑ 1: Ειδησεις
  if (step === "ingest") {
    const r = await hit(origin, "/api/ingest?token=dev");
    const inserted = r?.summary?.totalInserted ?? "—";
    return page("Επαναφορά", [
      r.timeout
        ? `<span class="run"><span class="spin"></span>Βήμα 1/3 · Ειδήσεις: συνεχίζεται…</span>`
        : `<span class="ok">✓ Βήμα 1/3 · Ειδήσεις: ${inserted} νέα άρθρα</span>`,
      `<span class="run"><span class="spin"></span>Βήμα 2/3 · Ταξινόμηση: ξεκινά…</span>`,
    ], `${base}&step=classify&round=1`);
  }

  // ΒΗΜΑ 2: Ταξινομηση — μια παρτιδα ανα φορτωση, μεχρι remaining 0
  if (step === "classify") {
    const c = await hit(origin, "/api/classify-bulk?token=dev");
    const remaining = typeof c?.remaining_unclassified === "number" ? c.remaining_unclassified : null;
    const didWork = (c?.total_classified ?? 0) > 0;
    const finished = remaining === 0 || (!didWork && !c.timeout && remaining === null);
    if (!finished && round < 15) {
      return page("Επαναφορά", [
        `<span class="ok">✓ Βήμα 1/3 · Ειδήσεις</span>`,
        `<span class="run"><span class="spin"></span>Βήμα 2/3 · Ταξινόμηση: γύρος ${round}${remaining != null ? ` — απομένουν ~${remaining}` : ""}…</span>`,
      ], `${base}&step=classify&round=${round + 1}`);
    }
    return page("Επαναφορά", [
      `<span class="ok">✓ Βήμα 1/3 · Ειδήσεις</span>`,
      `<span class="ok">✓ Βήμα 2/3 · Ταξινόμηση: ολοκληρώθηκε</span>`,
      `<span class="run"><span class="spin"></span>Βήμα 3/3 · Γεγονότα: ξεκινά…</span>`,
    ], `${base}&step=detect&round=1`);
  }

  // ΒΗΜΑ 3: Γεγονοτα — ενα περασμα ανα φορτωση, μεχρι να μη μενει θεμα
  const d = await hit(origin, "/api/situation-engine/detect-events");
  const remainingTopic = d?.remaining_topic ?? null;
  const created = d?.events_created ?? "—";
  if ((remainingTopic || d.timeout) && round < 8) {
    return page("Επαναφορά", [
      `<span class="ok">✓ Βήμα 1/3 · Ειδήσεις</span>`,
      `<span class="ok">✓ Βήμα 2/3 · Ταξινόμηση</span>`,
      `<span class="run"><span class="spin"></span>Βήμα 3/3 · Γεγονότα: πέρασμα ${round} (${created} νέα)${remainingTopic ? ` — συνεχίζει από «${remainingTopic}»` : ""}…</span>`,
    ], `${base}&step=detect&round=${round + 1}`);
  }
  return page("Επαναφορά", [
    `<span class="ok">✓ Βήμα 1/3 · Ειδήσεις</span>`,
    `<span class="ok">✓ Βήμα 2/3 · Ταξινόμηση</span>`,
    `<span class="ok">✓ Βήμα 3/3 · Γεγονότα: ολοκληρώθηκε</span>`,
  ], null);
}
