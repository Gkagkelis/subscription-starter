import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type ActionType =
  | "analysis"
  | "scenario"
  | "social_map"
  | "stance"
  | "wording"
  | "custom";

function isValidActionType(value: string): value is ActionType {
  return [
    "analysis",
    "scenario",
    "social_map",
    "stance",
    "wording",
    "custom"
  ].includes(value);
}

export async function GET(req: Request) {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");

  if (!threadId) {
    return NextResponse.json(
      { error: "Missing threadId" },
      { status: 400 }
    );
  }

  const { data: thread, error: threadError } = await supabase
    .from("advisor_threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .single();

  if (threadError || !thread) {
    return NextResponse.json(
      { error: "Thread not found" },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from("advisor_messages")
    .select("*")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: data || [] });
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

  const threadId = body.threadId;
  const role = body.role;
  const content = body.content?.trim();
  const rawActionType = body.actionType || "custom";

  if (!threadId) {
    return NextResponse.json(
      { error: "Missing threadId" },
      { status: 400 }
    );
  }

  if (!["user", "assistant"].includes(role)) {
    return NextResponse.json(
      { error: "Invalid role" },
      { status: 400 }
    );
  }

  if (!content) {
    return NextResponse.json(
      { error: "Missing content" },
      { status: 400 }
    );
  }

  const actionType = isValidActionType(rawActionType)
    ? rawActionType
    : "custom";

  const { data: thread, error: threadError } = await supabase
    .from("advisor_threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .single();

  if (threadError || !thread) {
    return NextResponse.json(
      { error: "Thread not found" },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from("advisor_messages")
    .insert({
      thread_id: threadId,
      user_id: user.id,
      role,
      action_type: actionType,
      content
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase
    .from("advisor_threads")
    .update({
      updated_at: new Date().toISOString()
    })
    .eq("id", threadId)
    .eq("user_id", user.id);

  return NextResponse.json({ message: data });
}
