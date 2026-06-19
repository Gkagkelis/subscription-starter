import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const STOP = new Set([
  "στην", "στον", "στης", "στις", "στα", "στο", "της", "του", "των", "τον", "την", "και",
  "για", "από", "που", "δεν", "είναι", "μετά", "πριν", "ο", "η", "το", "οι", "τα", "με",
  "σε", "ως", "ένα", "μια", "στη", "θα", "να", "κι",
]);

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .trim();
}
function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? decodeEntities(m[1]) : "";
}
function keywords(s: string): Set<string> {
  return new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^a-zA-Z\u0370-\u03ff\u1f00-\u1fff\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}
function distinctive(s: string, topicWords: Set<string>): Set<string> {
  const kw = keywords(s);
  topicWords.forEach((w) => kw.delete(w));
  return kw;
}
function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  a.forEach((w) => { if (b.has(w)) n++; });
  return n;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== "dev") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const topic = (url.searchParams.get("topic") || "Οικονομία").trim();
  const q = topic.replace(/\s*\/\s*/g, " ").trim();
  const topicWords = keywords(topic);

  // 1) Τίτλοι γεγονότων ΑΤΖΕΝΤΑΣ για αυτό το θέμα
  const { data: events } = await supabase
    .from("v_political_events_live")
    .select("title,topic")
    .limit(500);
  const agendaTitles = (Array.isArray(events) ? events : [])
    .filter((e: any) => String(e?.topic || "").trim() === topic)
    .map((e: any) => String(e?.title || "").trim())
    .filter(Boolean);
  const agendaKW = agendaTitles.map((t) => distinctive(t, topicWords));

  // 2) Τίτλοι Google News για το θέμα (τελευταίες ~72h)
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=el&gl=GR&ceid=GR:el`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let headlines: { title: string; source: string }[] = [];
  try {
    const r = await fetch(feedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NorayaBot/1.0)", Accept: "application/rss+xml" },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    const xml = await r.text();
    const now = Date.now();
    headlines = xml.split("<item>").slice(1).map((c) => c.split("</item>")[0])
      .map((b) => ({ title: pick(b, "title"), source: pick(b, "source"), pub: pick(b, "pubDate") }))
      .filter((h) => {
        const t = h.pub ? new Date(h.pub).getTime() : NaN;
        return Number.isFinite(t) && (now - t) / 3_600_000 <= 72;
      })
      .map((h) => ({ title: h.title, source: h.source }));
  } catch {
    clearTimeout(timer);
    return NextResponse.json({ ok: false, topic, error: "google_news_fetch_failed" });
  }

  // 3) Ποιοι τίτλοι News ΔΕΝ ταιριάζουν με κανένα γεγονός ατζέντας
  const unmatched = headlines.filter((h) => {
    const kw = distinctive(h.title, topicWords);
    if (kw.size === 0) return false;
    return !agendaKW.some((ek) => overlap(kw, ek) >= 2);
  });

  // 4) Ομαδοποίηση σε ιστορίες (κοινές λέξεις) + μέτρημα πηγών
  type Cluster = { rep: string; sources: Set<string>; titles: string[]; kw: Set<string> };
  const clusters: Cluster[] = [];
  for (const h of unmatched) {
    const kw = distinctive(h.title, topicWords);
    let placed = false;
    for (const c of clusters) {
      if (overlap(kw, c.kw) >= 2) {
        c.titles.push(h.title);
        if (h.source) c.sources.add(h.source);
        kw.forEach((w) => c.kw.add(w));
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ rep: h.title, sources: new Set(h.source ? [h.source] : []), titles: [h.title], kw });
  }

  const discovered = clusters
    .map((c) => ({ story: c.rep, source_count: c.sources.size, article_count: c.titles.length, sample_titles: c.titles.slice(0, 3) }))
    .filter((c) => c.source_count >= 2) // μόνο ιστορίες πολλαπλών πηγών = πραγματικές
    .sort((a, b) => b.source_count - a.source_count);

  return NextResponse.json({
    ok: true,
    topic,
    agenda_events_for_topic: agendaTitles.length,
    google_news_headlines_72h: headlines.length,
    unmatched_headlines: unmatched.length,
    discovered_stories: discovered.length,
    discovered: discovered.slice(0, 10),
  });
}
