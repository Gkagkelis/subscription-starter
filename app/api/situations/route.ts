import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
 * app/api/situations/route.ts        (ΒΗΜΑ 2)
 *
 * GET  /api/situations?token=dev&status=active   -> list (από v_situation_engine_live)
 * POST /api/situations?token=dev                  -> create candidate situation
 *
 * ΔΕΝ αλλάζει το /api/situation-engine. Διαβάζει από το ΙΔΙΟ live view, με ίδιο
 * safe fallback στο political_situations. Τα γραψίματα γίνονται με service role.
 * ------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function authorized(req: Request): boolean {
  const token = new URL(req.url).searchParams.get("token");
  return token === process.env.CRON_SECRET || token === "dev";
}

const cleanError = (message: string) =>
  NextResponse.json({ ok: false, message }, { status: 500 });

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: "Μη εξουσιοδοτημένο αίτημα." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // candidate | active | monitoring | resolved
  const limit = Math.min(parseInt(searchParams.get("limit") || "25", 10), 100);

  try {
    let query = supabase.from("v_situation_engine_live").select("*", { count: "exact" }).limit(limit);
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) throw error;

    let rows = data || [];
    let source = "v_situation_engine_live";
    let fallbackUsed = false;
    let total = count ?? rows.length;

    // Safe fallback: ίδιο μοτίβο με το situation-engine.
    if (rows.length === 0) {
      let fq = supabase.from("political_situations").select("*", { count: "exact" }).limit(limit);
      if (status) fq = fq.eq("status", status);
      const fb = await fq;
      if (fb.error) throw fb.error;
      rows = fb.data || [];
      source = "political_situations";
      fallbackUsed = true;
      total = fb.count ?? rows.length;
    }

    return NextResponse.json({
      ok: true,
      count: total,
      returned_count: rows.length,
      source,
      fallback_used: fallbackUsed,
      situations: rows,
    });
  } catch (err: any) {
    console.error("situations GET failed:", err?.message || err);
    return cleanError("Δεν ήταν δυνατή η ανάγνωση των καταστάσεων.");
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: "Μη εξουσιοδοτημένο αίτημα." }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Μη έγκυρο αίτημα." }, { status: 400 });
  }

  const title = String(body?.title || "").trim();
  const topic = String(body?.topic || body?.category || "Γενικά").trim();
  if (!title) {
    return NextResponse.json({ ok: false, message: "Λείπει ο τίτλος της κατάστασης." }, { status: 400 });
  }

  const situationKey =
    String(body?.situation_key || title)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80) || `sit-${Date.now()}`;

  try {
    const { data, error } = await supabase
      .from("political_situations")
      .insert({
        organization_id: body?.organization_id ?? null,
        title,
        topic,
        situation_key: situationKey,
        status: body?.status || "candidate",
        situation_type: body?.situation_type || "manual",
        documentation_level: "initial",
        framing_summary: body?.framing_summary ?? null,
        trigger_reason: body?.trigger_reason || "Δημιουργήθηκε χειροκίνητα από το Strategy Room.",
        situation_detail: body?.situation_detail ?? {},
      })
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, situation: data });
  } catch (err: any) {
    console.error("situations POST failed:", err?.message || err);
    return cleanError("Δεν ήταν δυνατή η δημιουργία της κατάστασης.");
  }
}
