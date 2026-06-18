import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .trim();
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? decodeEntities(m[1]) : "";
}

// PROBE (Στρώση Β): δωρεάν δοκιμή Google News RSS — δεν γράφει τίποτα, μόνο διαβάζει.
// Σκοπός: να δούμε αν η Google απαντά από την IP της Vercel (πλήθος άρθρων + ποικιλία πηγών).
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== "dev") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Τα queries είναι ΘΕΜΑΤΑ ΑΤΖΕΝΤΑΣ (κοινωνικοπολιτικά), όχι πρόσωπα.
  // Καθαρίζουμε σύνθετα labels: "Ακρίβεια / κόστος ζωής" -> "Ακρίβεια κόστος ζωής".
  const rawQ = (url.searchParams.get("q") || "Στέγαση").trim();
  const q = rawQ.replace(/\s*\/\s*/g, " ");
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=el&gl=GR&ceid=GR:el`;

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000); // fail-fast 8s

  try {
    const r = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NorayaBot/1.0; +https://noraya.vercel.app)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);

    const status = r.status;
    const xml = await r.text();

    if (!r.ok) {
      return NextResponse.json({
        ok: false,
        query: q,
        http_status: status,
        rate_limited: status === 429,
        fetch_ms: Date.now() - started,
        snippet: xml.slice(0, 300),
      });
    }

    const blocks = xml.split("<item>").slice(1).map((c) => c.split("</item>")[0]);
    const parsed = blocks.map((b) => ({
      title: pick(b, "title"),
      source: pick(b, "source"),
      published_at: pick(b, "pubDate"),
    }));

    const sources = Array.from(new Set(parsed.map((p) => p.source).filter(Boolean)));

    return NextResponse.json({
      ok: true,
      query: q,
      http_status: status,
      article_count: parsed.length,
      unique_source_count: sources.length,
      sources: sources.slice(0, 20),
      sample: parsed.slice(0, 5),
      fetch_ms: Date.now() - started,
    });
  } catch (err) {
    clearTimeout(timer);
    const e = err as { name?: string; message?: string };
    return NextResponse.json({
      ok: false,
      query: q,
      error: e?.name === "AbortError" ? "timeout_8s" : String(e?.message || err),
      fetch_ms: Date.now() - started,
    });
  }
}
