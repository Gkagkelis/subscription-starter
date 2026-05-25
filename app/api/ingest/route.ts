import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { RSS_FEEDS } from "@/lib/noraya/feeds";

// Use service role key for inserts (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function extractTag(xml: string, tag: string): string {
  const cdataPattern = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i"
  );
  const cdataMatch = xml.match(cdataPattern);
  if (cdataMatch) return cdataMatch[1].trim();

  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(pattern);
  return match ? match[1].trim() : "";
}

function extractAttribute(xml: string, tag: string, attr: string): string {
  const pattern = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i");
  const match = xml.match(pattern);
  return match ? match[1] : "";
}

interface ParsedArticle {
  external_id: string;
  title: string;
  description: string;
  link: string;
  image_url: string | null;
  category: string | null;
  author: string | null;
  published_at: string | null;
  source_name: string;
  source_feed_url: string;
}

function parseRSSItems(xml: string, sourceName: string, feedUrl: string): ParsedArticle[] {
  const items: ParsedArticle[] = [];
  const itemBlocks = xml.split(/<item[\s>]/i).slice(1);

  for (const block of itemBlocks) {
    const itemXml = block.split(/<\/item>/i)[0];
    if (!itemXml) continue;

    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const guid = extractTag(itemXml, "guid") || link;
    const description = extractTag(itemXml, "description");
    const pubDate = extractTag(itemXml, "pubDate");
    const category = extractTag(itemXml, "category");
    const author =
      extractTag(itemXml, "dc:creator") ||
      extractTag(itemXml, "author") ||
      "";

    const imageUrl =
      extractAttribute(itemXml, "enclosure", "url") ||
      extractAttribute(itemXml, "media:thumbnail", "url") ||
      extractAttribute(itemXml, "media:content", "url") ||
      null;

    if (!title || !link) continue;

    let publishedAt: string | null = null;
    if (pubDate) {
      try {
        publishedAt = new Date(pubDate).toISOString();
      } catch {
        publishedAt = null;
      }
    }

    items.push({
      external_id: guid || link,
      title: title.substring(0, 500),
      description: description.substring(0, 2000),
      link,
      image_url: imageUrl,
      category: category || null,
      author: author || null,
      published_at: publishedAt,
      source_name: sourceName,
      source_feed_url: feedUrl,
    });
  }

  return items;
}

async function fetchFeed(
  feedUrl: string,
  sourceName: string
): Promise<ParsedArticle[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Noraya/1.0 (Political Intelligence Platform)",
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[${sourceName}] HTTP ${res.status}`);
      return [];
    }

    const xml = await res.text();
    return parseRSSItems(xml, sourceName, feedUrl);
  } catch (err: any) {
    console.error(`[${sourceName}] Fetch error: ${err.message}`);
    return [];
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { source: string; fetched: number; inserted: number; errors: string[] }[] = [];
  let totalInserted = 0;
  let totalFetched = 0;

  const batchSize = 4;
  for (let i = 0; i < RSS_FEEDS.length; i += batchSize) {
    const batch = RSS_FEEDS.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((feed) => fetchFeed(feed.feedUrl, feed.name))
    );

    for (let j = 0; j < batch.length; j++) {
      const feed = batch[j];
      const articles = batchResults[j];
      const errors: string[] = [];
      let inserted = 0;

      totalFetched += articles.length;

      if (articles.length > 0) {
        const { data, error } = await supabase
          .from("articles")
          .upsert(articles, {
            onConflict: "external_id,source_feed_url",
            ignoreDuplicates: true,
          })
          .select("id");

        if (error) {
          errors.push(error.message);
        } else {
          inserted = data?.length || 0;
          totalInserted += inserted;
        }
      }

      results.push({
        source: feed.name,
        fetched: articles.length,
        inserted,
        errors,
      });
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    summary: {
      sources: RSS_FEEDS.length,
      totalFetched,
      totalInserted,
    },
    details: results,
  });
}
