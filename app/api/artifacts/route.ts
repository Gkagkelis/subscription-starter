import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { mode = "chat", title = "Saved", content } = body as {
      mode?: string;
      title?: string;
      content: string;
    };

    if (!content || !content.trim()) {
      return Response.json({ error: "Missing content" }, { status: 400 });
    }

    const { error } = await supabase.from("artifacts").insert({
      user_id: user.id,
      mode,
      title,
      content,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
