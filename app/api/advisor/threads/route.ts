import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("advisor_threads")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ threads: data || [] });
}

export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const title =
    body.title?.trim() ||
    body.topic?.trim() ||
    "Νέα συζήτηση";

  const topic = body.topic?.trim() || "";

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("advisor_threads")
    .insert({
      user_id: user.id,
      organization_id: org?.id || null,
      title,
      topic
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ thread: data });
}
