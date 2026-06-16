import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ΔΙΑΓΝΩΣΤΙΚΟ: διαβάζει το dimoskopiseis.gr από τον server και ψάχνει
// τα δεδομένα μέσα στα γραφήματα Flourish, ώστε να δούμε την ακριβή μορφή τους.
// Άνοιξέ το: /api/polls/dimoskopiseis-debug
export async function GET() {
  const out: any = { ok: true, steps: {} };
  const UA = { "User-Agent": "Mozilla/5.0 (compatible; NorayaBot/1.0)" };

  try {
    // 1) Κατέβασε το homepage (server-side = χωρίς διαφημίσεις/popups)
    const home = await fetch("https://dimoskopiseis.gr/", { headers: UA });
    const html = await home.text();
    out.steps.home_status = home.status;
    out.steps.home_length = html.length;

    // 2) Βρες τα Flourish visualisation IDs + τυχόν τίτλους/ημερομηνίες δίπλα
    const ids = Array.from(
      new Set((html.match(/flo\.uri\.sh\/visualisation\/(\d+)/g) || []).map((s) => s.split("/").pop()))
    );
    out.steps.flourish_ids = ids;

    // Τίτλοι γραφημάτων (περιέχουν "Ενημέρωση ηη/μμ/εε")
    const titles = (html.match(/Όλες οι[^<"]{0,120}Ενημέρωση\s*\d{2}\/\d{2}\/\d{2}/g) || []).slice(0, 6);
    out.steps.chart_titles = titles;

    // 3) Για κάθε ένα από τα 2 πρώτα γραφήματα, κατέβασε το embed και ψάξε τα δεδομένα
    out.steps.embeds = [];
    for (const fid of ids.slice(0, 2)) {
      const e: any = { id: fid };
      try {
        const emb = await fetch(`https://flo.uri.sh/visualisation/${fid}/embed`, { headers: UA });
        const t = await emb.text();
        e.embed_status = emb.status;
        e.embed_length = t.length;
        e.has_Flourish_data = t.includes("_Flourish_data");
        e.has_load_sources = t.includes("load_sources") || t.includes("data.csv");

        // Βρες πιθανές πηγές δεδομένων (script src / data urls)
        e.script_srcs = (t.match(/src=["'][^"']+["']/g) || []).slice(0, 25).map((x) => x.replace(/src=["']|["']/g, ""));

        // Αν υπάρχει inline _Flourish_data, πάρε δείγμα γύρω από αυτό
        const idx = t.indexOf("_Flourish_data");
        if (idx >= 0) e.flourish_data_sample = t.slice(idx, idx + 1500);
        else e.embed_head_sample = t.slice(0, 1500);
      } catch (err: any) {
        e.error = err?.message || String(err);
      }
      out.steps.embeds.push(e);
    }
  } catch (e: any) {
    out.ok = false;
    out.error = e?.message || String(e);
  }

  return NextResponse.json(out);
}
