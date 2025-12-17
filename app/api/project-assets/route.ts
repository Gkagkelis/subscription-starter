import { createClient } from "@/utils/supabase/server";

export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) return Response.json({ error: "Missing project_id" }, { status: 400 });

  const { data, error } = await supabase
    .from("project_assets")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { project_id, kind, format, title, content, tone = "neutral", version = 1 } = body ?? {};

  if (!project_id || !kind || !format || !content) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("project_assets")
    .insert({
      project_id,
      user_id: user.id,
      kind,
      format,
      title: title ?? null,
      content,
      tone,
      version,
    })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}

export async function PUT(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, content } = body ?? {};
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const { data, error } = await supabase
    .from("project_assets")
    .update({ content })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
