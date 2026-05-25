import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

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
    return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
  }

  const { data: thread, error: threadError } = await supabase
    .from("advisor_threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .single();

  if (threadError || !thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("advisor_files")
    .select("*")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ files: data || [] });
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
  const fileName = body.fileName?.trim() || "Επικολλημένο κείμενο";
  const fileType = body.fileType?.trim() || "pasted_text";
  const extractedText = body.extractedText?.trim() || "";

  if (!threadId) {
    return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
  }

  if (!extractedText) {
    return NextResponse.json(
      { error: "Missing extractedText" },
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
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("advisor_files")
    .insert({
      thread_id: threadId,
      user_id: user.id,
      file_name: fileName,
      file_type: fileType,
      storage_path: null,
      extracted_text: extractedText
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

  return NextResponse.json({ file: data });
}
