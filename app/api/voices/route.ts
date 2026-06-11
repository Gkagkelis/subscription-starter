import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { buildNorayaStrategicSystemPrompt } from "@/lib/noraya/strategic-reasoning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// NORAYA — Citizen Voices ("Πρόσωπα")
// YouTube (θεματικά + δελτία) + Apify/Twitter (πειραματικό).
// Πραγματικά usernames + Δείκτης Δυναμικής (likes + followers, 0-100).
// Authoritative ref-mapping: τα νούμερα είναι αληθινά, όχι AI guess.
// ============================================================

const ANALYSIS_MODEL = "claude-sonnet-4-6";
const MAX_VIDEOS = 6;
const COMMENTS_PER_VIDEO = 15;
const MAX_COMMENTS = 70;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

type Comment = {
  ref: number;
  text: string;
  name: string;
  source: "youtube" | "twitter";
  likes: number;
  followers: number | null;
  influence: number;
  channelId?: string | null;
};

function cleanText(raw: string): string {
  return String(raw || "").replace(/<[^>]+>/g, " ").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
}

async function ytSearch(key: string, query: string): Promise<string[]> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&order=relevance&regionCode=GR&relevanceLanguage=el&q=${encodeURIComponent(query)}&key=${key}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.items || []).map((it: any) => it?.id?.videoId).filter(Boolean);
  } catch {
    return [];
  }
}

async function ytComments(key: string, videoId: string): Promise<Partial<Comment>[]> {
  const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=${COMMENTS_PER_VIDEO}&order=relevance&textFormat=plainText&key=${key}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.items || [])
      .map((it: any) => {
        const sn = it?.snippet?.topLevelComment?.snippet;
        if (!sn) return null;
        const text = cleanText(sn.textDisplay || "");
        if (text.length < 8) return null;
        return {
          text: text.slice(0, 400),
          name: String(sn.authorDisplayName || "Πολίτης").replace(/^@+/, "").trim() || "Πολίτης",
          source: "youtube" as const,
          likes: Number(sn.likeCount) || 0,
          followers: null,
          channelId: sn?.authorChannelId?.value || null,
        };
      })
      .filter(Boolean) as Partial<Comment>[];
  } catch {
    return [];
  }
}

async function ytChannelFollowers(key: string, channelIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const uniq = Array.from(new Set(channelIds.filter(Boolean)));
  for (let i = 0; i < uniq.length; i += 50) {
    const batch = uniq.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${batch.join(",")}&key=${key}`;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      for (const it of j?.items || []) {
        const st = it?.statistics;
        if (st && st.hiddenSubscriberCount === false && st.subscriberCount != null) {
          out[it.id] = Number(st.subscriberCount) || 0;
        }
      }
    } catch {
      /* skip batch */
    }
  }
  return out;
}

async function collectYouTube(query: string, newsQuery: string): Promise<Partial<Comment>[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const idsA = await ytSearch(key, query);
  const idsB = await ytSearch(key, newsQuery);
  const ids = Array.from(new Set([...idsA, ...idsB])).slice(0, MAX_VIDEOS);
  const out: Partial<Comment>[] = [];
  for (const id of ids) {
    if (out.length >= MAX_COMMENTS) break;
    out.push(...(await ytComments(key, id)));
  }
  const trimmed = out.slice(0, MAX_COMMENTS);
  // followers (subscribers) όπου είναι δημόσιοι
  const followers = await ytChannelFollowers(key, trimmed.map((c) => c.channelId || "").filter(Boolean) as string[]);
  for (const c of trimmed) {
    if (c.channelId && followers[c.channelId] != null) c.followers = followers[c.channelId];
  }
  return trimmed;
}

async function collectApify(query: string): Promise<Partial<Comment>[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return [];
  const actor = (process.env.APIFY_TWITTER_ACTOR || "apidojo/tweet-scraper").replace("/", "~");
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ searchTerms: [query], searchQueries: [query], maxItems: 25, maxTweets: 25, tweetsDesired: 25, language: "el" }),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!r.ok) return [];
    const items = await r.json();
    if (!Array.isArray(items)) return [];
    return items
      .map((it: any) => {
        const text = cleanText(it?.text || it?.full_text || it?.content || it?.tweet || "");
        if (text.length < 8) return null;
        const name = it?.author?.userName || it?.author?.name || it?.username || it?.user?.username || it?.user?.name || "Πολίτης";
        const followers = it?.author?.followers ?? it?.author?.followersCount ?? it?.followers_count ?? it?.user?.followers_count ?? null;
        return {
          text: text.slice(0, 400),
          name: String(name).replace(/^@+/, "").trim() || "Πολίτης",
          source: "twitter" as const,
          likes: Number(it?.likeCount ?? it?.favorite_count ?? it?.likes) || 0,
          followers: followers != null ? Number(followers) || 0 : null,
          channelId: null,
        };
      })
      .filter(Boolean)
      .slice(0, 30) as Partial<Comment>[];
  } catch {
    clearTimeout(timer);
    return [];
  }
}

function finalizeComments(parts: Partial<Comment>[]): Comment[] {
  const list = parts.slice(0, MAX_COMMENTS + 25);
  const maxLikes = Math.max(1, ...list.map((c) => c.likes || 0));
  const withF = list.filter((c) => typeof c.followers === "number" && (c.followers as number) > 0);
  const maxF = Math.max(1, ...withF.map((c) => c.followers as number));
  const lf = (x: number, m: number) => Math.log10((x || 0) + 1) / Math.log10(m + 1);
  return list.map((c, i) => {
    const likes = c.likes || 0;
    const ln = lf(likes, maxLikes);
    let influence: number;
    if (typeof c.followers === "number" && c.followers > 0) {
      influence = Math.round(clamp(0.75 * ln + 0.25 * lf(c.followers, maxF), 0, 1) * 100);
    } else {
      influence = Math.round(clamp(ln, 0, 1) * 100);
    }
    return {
      ref: i + 1,
      text: c.text || "",
      name: c.name || "Πολίτης",
      source: (c.source as "youtube" | "twitter") || "youtube",
      likes,
      followers: typeof c.followers === "number" ? c.followers : null,
      influence,
    };
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type FeedQuote = { name: string; text: string; source: string; likes: number; followers: number | null; influence: number };

function buildFeed(comments: Comment[]): { youtube: FeedQuote[]; twitter: FeedQuote[] } {
  const map = (c: Comment): FeedQuote => ({ name: c.name, text: c.text, source: c.source, likes: c.likes, followers: c.followers, influence: c.influence });
  const yt = shuffle(comments.filter((c) => c.source === "youtube").map(map)).slice(0, 25);
  const tw = shuffle(comments.filter((c) => c.source === "twitter").map(map)).slice(0, 25);
  return { youtube: yt, twitter: tw };
}

function parseAiJson(raw: string): any | null {
  let s = (raw || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = (str: string) => {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  };
  let parsed = tryParse(s);
  if (!parsed) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) parsed = tryParse(m[0]);
  }
  if (!parsed) {
    const start = s.indexOf("{");
    if (start >= 0) {
      let body = s.slice(start);
      let dc = 0, ds = 0, inStr = false, esc = false;
      for (const ch of body) {
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === "{") dc++;
        else if (ch === "}") dc--;
        else if (ch === "[") ds++;
        else if (ch === "]") ds--;
      }
      if (inStr) body += '"';
      body = body.replace(/,\s*$/, "");
      while (ds-- > 0) body += "]";
      while (dc-- > 0) body += "}";
      parsed = tryParse(body);
    }
  }
  return parsed || null;
}

async function loadPartyProfile(supabase: ReturnType<typeof svc>, partyKey: string) {
  if (!partyKey) return null;
  try {
    const { data } = await supabase.from("political_party_profiles").select("*").eq("party_key", partyKey).maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

function docLevel(n: number): string {
  if (n >= 40) return "strong";
  if (n >= 15) return "medium";
  return "initial";
}

function buildSystem(partyProfile: any, partyKey: string): string {
  const base = `${buildNorayaStrategicSystemPrompt()}

ΕΙΣΑΙ Ο ΑΝΑΛΥΤΗΣ ΚΟΙΝΗΣ ΓΝΩΜΗΣ. Παίρνεις ΠΡΑΓΜΑΤΙΚΑ σχόλια πολιτών και βγάζεις τι αισθάνεται/ζητάει ο κόσμος. ΔΕΝ εφευρίσκεις σχόλια. Διαλέγεις χαρακτηριστικά σχόλια ΜΕ ΤΟΝ ΑΡΙΘΜΟ [ref] τους από τη λίστα — μην ξαναγράφεις το κείμενο, μόνο δώσε το ref.`;
  if (!partyProfile) return base;
  return `${base}

ΓΙΑ ΠΟΙΟΝ ΔΟΥΛΕΥΕΙΣ: τον σύμβουλο του κόμματος "${partyKey}". Το "for_party" γράφεται από τη δική του σκοπιά.

ΠΡΟΦΙΛ (JSON): ${JSON.stringify(partyProfile)}`;
}

function buildUser(topic: string, comments: Comment[]): string {
  const lines = comments
    .map((c) => `[${c.ref}] ${c.source === "youtube" ? "YouTube" : "Twitter"} · ${c.likes} likes · ${c.followers != null ? c.followers + " followers" : "followers —"} · δυναμική ${c.influence} · ${c.name}: «${c.text}»`)
    .join("\n");
  return `ΘΕΜΑ: ${topic}

ΠΡΑΓΜΑΤΙΚΑ ΣΧΟΛΙΑ (${comments.length}):
${lines || "—"}

ΣΥΝΘΕΣΕ τι λέει ο κόσμος:
- κυρίαρχο συναίσθημα + μία φράση
- 3-5 θεματικές, με σύντομη περιγραφή και 1-2 χαρακτηριστικά σχόλια (ΔΩΣΕ ΜΟΝΟ ΤΟ ref ΤΟΥΣ — προτίμησε ποικιλία και δυνατές φωνές)
- τι ΖΗΤΑΕΙ ο κόσμος
- για το κόμμα: τι αγγίζει, τι να αποφύγει, πού η ευκαιρία

ΚΑΝΟΝΕΣ: Μόνο τα παραπάνω σχόλια. Καμία εφεύρεση. Αν είναι λίγα, πες το τίμια.

ΜΟΡΦΗ — ΜΟΝΟ JSON, χωρίς markdown/fences:
{
  "summary": { "dominant_emotion": "anger|worry|support|frustration|hope|mixed", "emotion_label": "Ελληνικά", "one_liner": "..." },
  "themes": [ { "label": "...", "gist": "...", "share_hint": "πολλοί/αρκετοί/λίγοι", "quotes": [ { "ref": 3 } ] } ],
  "demands": ["...","..."],
  "for_party": { "resonates": "...", "avoid": "...", "opportunity": "..." },
  "note": "σημείωση τεκμηρίωσης"
}`;
}

async function callAnthropic(system: string, user: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: ANALYSIS_MODEL, max_tokens: 6000, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.content || []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n") || null;
  } catch {
    return null;
  }
}

function enrichQuotes(parsed: any, byRef: Map<number, Comment>) {
  if (!Array.isArray(parsed?.themes)) return;
  for (const t of parsed.themes) {
    const qs = Array.isArray(t?.quotes) ? t.quotes : [];
    t.quotes = qs
      .map((q: any) => {
        const ref = Number(q?.ref);
        const c = Number.isFinite(ref) ? byRef.get(ref) : null;
        if (c) return { text: c.text, name: c.name, source: c.source, likes: c.likes, followers: c.followers, influence: c.influence };
        if (q?.text) return { text: String(q.text), name: String(q.name || "Πολίτης"), source: String(q.source || "youtube"), likes: Number(q.likes) || 0, followers: null, influence: Number(q.influence) || 0 };
        return null;
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.influence - a.influence);
  }
}

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (token !== process.env.CRON_SECRET && token !== "dev") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const topic = (url.searchParams.get("topic") || "").trim();
    const extra = (url.searchParams.get("q") || "").trim();
    const partyKey = url.searchParams.get("party") || "elas";
    if (!topic && !extra) return NextResponse.json({ error: "missing topic" }, { status: 400 });

    const baseQuery = [topic, extra].filter(Boolean).join(" ").slice(0, 120);
    const newsQuery = `${topic || extra} ειδήσεις`.slice(0, 120);

    const [yt, tw] = await Promise.all([collectYouTube(baseQuery, newsQuery), collectApify(baseQuery)]);
    const comments = finalizeComments([...yt, ...tw]);
    const counts = { youtube: yt.length, twitter: tw.length, total: comments.length };

    if (counts.total === 0) {
      return NextResponse.json({ success: true, topic, counts, documentation_level: "initial", empty: true, message: "Δεν βρέθηκαν σχόλια πολιτών γι' αυτό το θέμα αυτή τη στιγμή." });
    }

    const feed = buildFeed(comments);

    // feed_only: μόνο νέες φωνές, χωρίς AI (φθηνό refresh)
    if (url.searchParams.get("feed_only") === "1") {
      return NextResponse.json({ success: true, topic, counts, feed });
    }

    const supabase = svc();
    const partyProfile = await loadPartyProfile(supabase, partyKey);
    const ai = await callAnthropic(buildSystem(partyProfile, partyKey), buildUser(topic || extra, comments));
    const parsed = ai ? parseAiJson(ai) : null;
    if (!parsed || !parsed.themes) return NextResponse.json({ error: "ai_unavailable", counts }, { status: 502 });

    const byRef = new Map<number, Comment>(comments.map((c) => [c.ref, c]));
    enrichQuotes(parsed, byRef);

    return NextResponse.json({
      success: true,
      topic,
      party: partyKey,
      counts,
      documentation_level: docLevel(counts.total),
      voices: parsed,
      feed,
      generated_at: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
