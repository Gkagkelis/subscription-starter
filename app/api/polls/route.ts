import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
 * app/api/polls/route.ts        (ΒΗΜΑ 5)
 *
 * GET   /api/polls?token=dev[&status=verified]   -> λίστα δημοσκοπήσεων
 * POST  /api/polls?token=dev                       -> create (status: loaded)
 * PATCH /api/polls?token=dev                        -> body {id, status?, reliability?, review_note?}
 *
 * Reliability lifecycle: loaded -> parsed -> needs_review -> verified -> archived
 * Κανόνας: μη-verified δημοσκόπηση ΔΕΝ μπορεί να παράγει ισχυρή σύσταση
 *          (το ελέγχει ο consumer μέσω του πεδίου reliability).
 * ------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STATUSES = new Set(["loaded", "parsed", "needs_review", "verified", "archived"]);
const RELIABILITY = new Set(["unverified", "low", "medium", "high"]);

function authorized(req: Request): boolean {
  const token = new URL(req.url).searchParams.get("token");
  return token === process.env.CRON_SECRET || token === "dev";
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, message: "Μη εξουσιοδοτημένο." }, { status: 401 });
  const status = new URL(req.url).searchParams.get("status");
  try {
    let q = supabase.from("polls").select("*").order("created_at", { ascending: false }).limit(50);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ ok: true, count: data?.length || 0, polls: data || [] });
  } catch (err: any) {
    console.error("polls GET failed:", err?.message || err);
    return NextResponse.json({ ok: false, message: "Δεν ήταν δυνατή η ανάγνωση των δημοσκοπήσεων." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, message: "Μη εξουσιοδοτημένο." }, { status: 401 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Μη έγκυρο αίτημα." }, { status: 400 });
  }
  const title = String(body?.title || "").trim();
  if (!title) return NextResponse.json({ ok: false, message: "Λείπει ο τίτλος της δημοσκόπησης." }, { status: 400 });

  try {
    const { data, error } = await supabase
      .from("polls")
      .insert({
        organization_id: body?.organization_id ?? null,
        title,
        pollster: body?.pollster ?? null,
        field_start: body?.field_start ?? null,
        field_end: body?.field_end ?? null,
        sample_size: body?.sample_size ?? null,
        method: body?.method ?? "unknown",
        raw_payload: body?.raw_payload ?? {},
        parsed_payload: body?.parsed_payload ?? {},
        status: "loaded",
        reliability: "unverified",
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, poll: data });
  } catch (err: any) {
    console.error("polls POST failed:", err?.message || err);
    return NextResponse.json({ ok: false, message: "Δεν ήταν δυνατή η αποθήκευση της δημοσκόπησης." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, message: "Μη εξουσιοδοτημένο." }, { status: 401 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Μη έγκυρο αίτημα." }, { status: 400 });
  }
  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ ok: false, message: "Λείπει το id." }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body?.status) {
    if (!STATUSES.has(body.status)) return NextResponse.json({ ok: false, message: "Μη έγκυρο status." }, { status: 400 });
    patch.status = body.status;
  }
  if (body?.reliability) {
    if (!RELIABILITY.has(body.reliability)) return NextResponse.json({ ok: false, message: "Μη έγκυρο reliability." }, { status: 400 });
    patch.reliability = body.reliability;
  }
  if (typeof body?.review_note === "string") patch.review_note = body.review_note;

  try {
    const { data, error } = await supabase.from("polls").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, poll: data });
  } catch (err: any) {
    console.error("polls PATCH failed:", err?.message || err);
    return NextResponse.json({ ok: false, message: "Δεν ήταν δυνατή η ενημέρωση της δημοσκόπησης." }, { status: 500 });
  }
}
