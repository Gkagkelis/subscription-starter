import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "noraya_archives";

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

// GET /api/archive?party=elas -> λίστα
export async function GET(req: NextRequest) {
  try {
    const party = (new URL(req.url).searchParams.get("party") || "elas").trim();
    const sb = svc();
    const { data, error } = await sb
      .from(TABLE)
      .select("id, created_at, updated_at, title, kind, content, event_id, event_title")
      .eq("party_key", party)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, items: data || [] });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}

// POST /api/archive {party,title,kind,content,event_id,event_title} -> αποθήκευση
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const title = String(b?.title || "").trim();
    if (!title) return json({ ok: false, error: "missing_title" }, 400);
    const row = {
      party_key: String(b?.party || "elas").trim(),
      title: title.slice(0, 300),
      kind: String(b?.kind || "note").slice(0, 40),
      content: b?.content != null ? String(b.content) : null,
      event_id: b?.event_id != null ? String(b.event_id).slice(0, 200) : null,
      event_title: b?.event_title != null ? String(b.event_title).slice(0, 400) : null,
    };
    const sb = svc();
    const { data, error } = await sb.from(TABLE).insert(row).select("id").limit(1);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, id: data?.[0]?.id || null });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}

// PATCH /api/archive {id,title} -> μετονομασία
export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const id = String(b?.id || "");
    const title = String(b?.title || "").trim();
    if (!id || !title) return json({ ok: false, error: "missing_id_or_title" }, 400);
    const sb = svc();
    const { error } = await sb
      .from(TABLE)
      .update({ title: title.slice(0, 300), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}

// DELETE /api/archive?id=... -> διαγραφή
export async function DELETE(req: NextRequest) {
  try {
    const id = (new URL(req.url).searchParams.get("id") || "").trim();
    if (!id) return json({ ok: false, error: "missing_id" }, 400);
    const sb = svc();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}
