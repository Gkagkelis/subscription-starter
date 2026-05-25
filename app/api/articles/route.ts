import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/articles
 * Returns recent articles. Optional query params:
 *   ?source=Καθημερινή
 *   ?category=Πολιτική
 *   ?limit=20
 *   ?search=ακρίβεια
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(req.url);

  const source = searchParams.get("source");
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);

  let query = supabase
    .from("articles")
    .select("id, title, description, link, image_url, source_name, category, author, published_at")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (source) {
    query = query.eq("source_name", source);
  }

  if (category) {
    query = query.ilike("category", `%${category}%`);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    count: data?.length || 0,
    articles: data || [],
  });
}
