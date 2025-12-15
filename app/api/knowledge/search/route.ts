import { createClient } from "@/utils/supabase/server";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { query, limit = 5 } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Query required" }, { status: 400 });
    }

    // Create embedding for the query
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query,
    });

    // Search for similar documents
    const { data, error } = await supabase.rpc("match_knowledge", {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: limit,
    });

    if (error) {
      console.error("Search error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ results: data || [] });
  } catch (error: any) {
    console.error("Knowledge search error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
