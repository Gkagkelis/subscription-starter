import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs" as const;
export const dynamic = "force-dynamic" as const;

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const mode = String(body?.mode ?? "chat");
    const title = String(body?.title ?? "Saved");
    const content = String(body?.content ?? "");

    if (!content.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("artifacts")
      .insert({ user_id: user.id, mode, title, content })
      .select("id,user_id,mode,title,content,created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode");

    let q = supabase
      .from("artifacts")
      .select("id,user_id,mode,title,content,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (mode) q = q.eq("mode", mode);

    const { data, error } = await q;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
