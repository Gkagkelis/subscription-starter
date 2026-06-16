import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ΔΙΑΓΝΩΣΤΙΚΟ v2: δείχνει το ΠΡΑΓΜΑΤΙΚΟ data array (γραμμές) του Flourish.
export async function GET() {
  const out: any = { ok: true, steps: {} };
  const UA = { "User-Agent": "Mozilla/5.0 (compatible; NorayaBot/1.0)" };

  try {
    const home = await fetch("https://dimoskopiseis.gr/", { headers: UA });
    const html = await home.text();
    out.steps.home_status = home.status;

    const ids = Array.from(
      new Set((html.match(/flo\.uri\.sh\/visualisation\/(\d+)/g) || []).map((s) => s.split("/").pop()))
    );
    out.steps.flourish_ids = ids;

    out.steps.embeds = [];
    // Μόνο το 1ο γράφημα (πρόθεση ψήφου, ενημ. 16/6) — αυτό μας νοιάζει πρώτα
    for (const fid of ids.slice(0, 1)) {
      const e: any = { id: fid };
      try {
        const emb = await fetch(`https://flo.uri.sh/visualisation/${fid}/embed`, { headers: UA });
        const t = await emb.text();
        e.embed_status = emb.status;

        // Πάρε το ΟΝΟΜΑΤΑ ΣΤΗΛΩΝ
        const cnIdx = t.indexOf("_Flourish_data_column_names");
        // Πάρε το ΚΥΡΙΩΣ data array: "_Flourish_data = {...}"
        const dIdx = t.indexOf("_Flourish_data =");
        e.found_data_assignment = dIdx >= 0;

        if (dIdx >= 0) {
          // Δείγμα 3500 χαρακτήρων από το σημείο "_Flourish_data ="
          e.data_sample = t.slice(dIdx, dIdx + 3500);
        }
        if (cnIdx >= 0) {
          e.column_names_sample = t.slice(cnIdx, cnIdx + 700);
        }
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
