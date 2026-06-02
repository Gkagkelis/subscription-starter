import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
 * app/api/situations/[id]/route.ts        (ΒΗΜΑ 2)
 *
 * GET   /api/situations/<id>?token=dev   -> πλήρες situation + evidence (από live view)
 * PATCH /api/situations/<id>?token=dev   -> ασφαλές update επιτρεπόμενων πεδίων
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

// Whitelist: μόνο αυτά επιτρέπεται να αλλάξουν μέσω API.
const UPDATABLE = new Set([
  "title",
  "topic",
  "status",
  "situation_type",
  "priority_score",
  "public_attention_score",
  "political_risk_level",
  "opportunity_level",
  "documentation_level",
  "framing_summary",
  "strategic_question",
  "recommended_action",
  "avoid_action",
  "red_team_warning",
  "trigger_reason",
  "situation_detail",
]);

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: "Μη εξουσιοδοτημένο αίτημα." }, { status: 401 });
  }
  try {
    const { data, error } = await supabase
      .from("v_situation_engine_live")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      // fallback στον base πίνακα
      const fb = await supabase.from("political_situations").select("*").eq("id", params.id).maybeSingle();
      if (fb.error) throw fb.error;
      if (!fb.data) return NextResponse.json({ ok: false, message: "Δεν βρέθηκε η κατάσταση." }, { status: 404 });
      return NextResponse.json({ ok: true, situation: fb.data, source: "political_situations" });
    }
    return NextResponse.json({ ok: true, situation: data, source: "v_situation_engine_live" });
  } catch (err: any) {
    console.error("situation GET failed:", err?.message || err);
    return NextResponse.json({ ok: false, message: "Δεν ήταν δυνατή η ανάγνωση της κατάστασης." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: "Μη εξουσιοδοτημένο αίτημα." }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Μη έγκυρο αίτημα." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(body || {})) {
    if (UPDATABLE.has(key)) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, message: "Δεν δόθηκαν επιτρεπόμενα πεδία προς ενημέρωση." }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from("political_situations")
      .update(patch)
      .eq("id", params.id)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, situation: data });
  } catch (err: any) {
    console.error("situation PATCH failed:", err?.message || err);
    return NextResponse.json({ ok: false, message: "Δεν ήταν δυνατή η ενημέρωση της κατάστασης." }, { status: 500 });
  }
}
