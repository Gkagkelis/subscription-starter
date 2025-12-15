import { createClient } from "@/utils/supabase/server";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { NextResponse } from "next/server";

const KNOWLEDGE_SOURCES = [
  {
    title: "Running a Museum: A Practical Handbook (ICOM/UNESCO)",
    url: "https://icom.museum/wp-content/uploads/2018/07/practical_handbook.pdf",
    category: "museum_management"
  }
];

// Split text into chunks
function splitIntoChunks(text: string, chunkSize: number = 1000): string[] {
  const sentences = text.split(/[.!?]+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence + ". ";
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { content, title, source, category } = await req.json();

    if (!content || !title) {
      return NextResponse.json({ error: "Content and title required" }, { status: 400 });
    }

    const chunks = splitIntoChunks(content, 1500);
    let insertedCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Create embedding
      const { embedding } = await embed({
        model: openai.embedding("text-embedding-3-small"),
        value: chunk,
      });

      // Insert into database
      const { error } = await supabase.from("knowledge_base").insert({
        title: `${title} - Part ${i + 1}`,
        content: chunk,
        source: source || "manual",
        category: category || "general",
        embedding: embedding,
      });

      if (!error) insertedCount++;
    }

    return NextResponse.json({ 
      success: true, 
      chunks: chunks.length,
      inserted: insertedCount 
    });
  } catch (error: any) {
    console.error("Knowledge ingest error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
