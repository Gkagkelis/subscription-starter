import { NextRequest, NextResponse } from "next/server";
import { createClient as naServer } from "@/utils/supabase/server";
import { createClient as naAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA PS — ΤΟΠΙΚΕΣ ΕΙΔΗΣΕΙΣ (δυναμικα ανα περιφερεια)
// Google News RSS: «[περιφερεια] + [θεμα]». Τα θεματα βγαινουν απο το
// Προφιλ Περιφερειας (αν υπαρχει) + σταθεροι πυλωνες. Cache 1 ωρα/περιφερεια.
// ============================================================

function svc() {
  return naAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function jsonOut(p: unknown, s = 200) {
  return NextResponse.json(p, { status: s });
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function googleNews(q: string): Promise<string[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=el&gl=GR&ceid=GR:el`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = xml.split("<item>").slice(1, 7);
    const titles: string[] = [];
    for (const it of items) {
      const m = it.match(/<title>([\s\S]*?)<\/title>/);
      if (m) {
        let t = decode(m[1]);
        const dash = t.lastIndexOf(" - ");
        if (dash > 20) t = t.slice(0, dash);
        if (t) titles.push(t);
      }
    }
    return titles;
  } catch {
    return [];
  }
}

// Σταθεροι πυλωνες που αφορουν ΚΑΘΕ περιφερεια (Ελλαδα)
const BASE_THEMES = [
  "ακρίβεια κόστος ζωής",
  "υγεία νοσοκομείο",
  "στέγαση ενοίκια",
  "εργασία ανεργία",
  "υποδομές έργα",
  "ασφάλεια εγκληματικότητα",
];

// Κανονικοποιηση περιφερειας -> ορος αναζητησης (καθαρος, χωρις «Α΄/Β1΄» κωδικους)
function districtSearchTerm(district: string): string {
  let d = district.trim();
  // «Β1΄ Βόρειου Τομέα Αθηνών» -> «Βόρεια Αθήνα» κ.λπ. (απλες αντιστοιχισεις)
  const map: [RegExp, string][] = [
    [/Α΄?\s*Αθην/i, "Αθήνα κέντρο"],
    [/Β1΄?.*Βόρει.*Αθην/i, "Βόρεια προάστια Αθήνας"],
    [/Β2΄?.*Δυτικ.*Αθην/i, "Δυτική Αθήνα"],
    [/Β3΄?.*Νότι.*Αθην/i, "Νότια προάστια Αθήνας"],
    [/Α΄?\s*Πειραι/i, "Πειραιάς"],
    [/Β΄?\s*Πειραι/i, "Πειραιάς δυτική Αττική"],
    [/Α΄?\s*Θεσσαλον/i, "Θεσσαλονίκη κέντρο"],
    [/Β΄?\s*Θεσσαλον/i, "Θεσσαλονίκη"],
  ];
  for (const [re, val] of map) if (re.test(d)) return val;
  // νομοι: «Σερρών» -> «Σέρρες» (αφαιρεση γενικης καταληξης απλα)
  d = d.replace(/ών$/, "ες").replace(/ίας$/, "ία").replace(/^Ν\.?\s*/, "");
  return d;
}

// GET/POST ?district=Σέρρες  (αν λειπει, το παιρνει απο τον συνδεδεμενο)
async function handle(reqDistrict: string | null, force: boolean) {
  let district = (reqDistrict || "").trim();

  // αν δεν δοθηκε, φερε την περιφερεια του συνδεδεμενου
  if (!district) {
    try {
      const supaU = naServer();
      const { data: { user } } = await supaU.auth.getUser();
      if (user?.id) {
        const { data: org } = await svc()
          .from("organizations")
          .select("district")
          .eq("user_id", user.id)
          .maybeSingle();
        district = String((org as any)?.district || "").trim();
      }
    } catch { /* αγνοειται */ }
  }

  if (!district) return jsonOut({ ok: false, error: "no_district" }, 400);

  const norm = district
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
  const cacheKey = `local_news_v1__${norm}`;

  // cache lookup (1 ωρα)
  if (!force) {
    try {
      const { data: cached } = await svc()
        .from("analysis_cache")
        .select("result, created_at")
        .eq("analysis_kind", "local_news_v1")
        .eq("input_hash", cacheKey)
        .maybeSingle();
      if (cached?.result) {
        const ageMin = (Date.now() - new Date((cached as any).created_at).getTime()) / 60000;
        if (ageMin < 60) {
          return jsonOut({ ok: true, cached: true, district, ...(cached.result as any) });
        }
      }
    } catch { /* αγνοειται */ }
  }

  const term = districtSearchTerm(district);

  // Θεματα: απο το Προφιλ Περιφερειας (coreProblems titles) + σταθεροι πυλωνες
  let themes: string[] = [...BASE_THEMES];
  try {
    const { data: rp } = await svc()
      .from("analysis_cache")
      .select("result")
      .eq("analysis_kind", "region_profile_v1")
      .eq("input_hash", `region_profile_v1__${norm}`)
      .maybeSingle();
    const reg: any = rp?.result || null;
    if (reg && Array.isArray(reg.coreProblems)) {
      const extra = reg.coreProblems
        .map((p: any) => String(p.title || "").toLowerCase())
        .filter(Boolean)
        .slice(0, 4);
      // βαλε τα τοπικα προβληματα ΠΡΩΤΑ (πιο σχετικα), μετα τους πυλωνες
      themes = Array.from(new Set([...extra, ...BASE_THEMES])).slice(0, 6);
    }
  } catch { /* αγνοειται */ }

  // Google News ανα θεμα (παραλληλα)
  const results = await Promise.all(
    themes.map(async (theme) => {
      const q = `${term} ${theme}`;
      const headlines = await googleNews(q);
      return {
        label: theme.charAt(0).toUpperCase() + theme.slice(1),
        count: headlines.length,
        headlines: headlines.slice(0, 3),
      };
    })
  );
  results.sort((a, b) => b.count - a.count);
  const topics = results.filter((r) => r.count > 0);

  const out = { topics, term, built_at: new Date().toISOString() };

  // cache save
  try {
    await svc().from("analysis_cache").upsert(
      { analysis_kind: "local_news_v1", input_hash: cacheKey, result: out },
      { onConflict: "analysis_kind,input_hash" }
    );
  } catch { /* αγνοειται */ }

  return jsonOut({ ok: true, cached: false, district, ...out });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const district = url.searchParams.get("district");
  const force = url.searchParams.get("force") === "1";
  return handle(district, force);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const district = body?.district ? String(body.district) : null;
  const force = body?.force === true || body?.force === 1;
  return handle(district, force);
}
