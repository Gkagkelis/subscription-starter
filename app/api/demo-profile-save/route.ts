import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "full" ? "full" : "short";
    const row = {
      mode,
      label: typeof body?.label === "string" ? body.label.slice(0, 120) : null,
      answers: body?.answers ?? null,
      scores: body?.scores ?? null,
      issue_ranking: body?.issueRanking ?? null,
    };
    const { data, error } = await svc().from("psychometric_profiles").insert(row).select("id").limit(1);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: Array.isArray(data) ? data[0]?.id : null });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
