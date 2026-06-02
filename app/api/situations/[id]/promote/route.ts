import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
 * app/api/situations/[id]/promote/route.ts        (ΒΗΜΑ 2)
 *
 * POST /api/situations/<id>/promote?token=dev
 * body: { to: "active" | "monitoring" | "resolved" | "candidate" }
 *
 * Αλλάζει μόνο το status (lifecycle), τίποτα άλλο.
 * ------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ALLOWED = new Set(["candidate", "active", "monitoring", "resolved"]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const token = new URL(req.url).searchParams.get("token");
  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ ok: false, message: "Μη εξουσιοδοτημένο αίτημα." }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Μη έγκυρο αίτημα." }, { status: 400 });
  }

  const to = String(body?.to || "").trim();
  if (!ALLOWED.has(to)) {
    return NextResponse.json(
      { ok: false, message: "Μη έγκυρη κατάσταση. Επιτρεπτά: candidate, active, monitoring, resolved." },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("political_situations")
      .update({ status: to, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .select("id, title, status")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, situation: data });
  } catch (err: any) {
    console.error("situation promote failed:", err?.message || err);
    return NextResponse.json({ ok: false, message: "Δεν ήταν δυνατή η αλλαγή κατάστασης." }, { status: 500 });
  }
}
