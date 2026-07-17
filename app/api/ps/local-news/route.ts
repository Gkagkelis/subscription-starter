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

type NewsItem = { title: string; ageDays: number };

async function googleNews(q: string, relevanceTerms: string[]): Promise<NewsItem[]> {
  try {
    // «when:14d» -> ο Google News επιστρεφει ΜΟΝΟ τελευταιες 14 μερες
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:14d")}&hl=el&gl=GR&ceid=GR:el`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = xml.split("<item>").slice(1, 12);
    const out: NewsItem[] = [];
    const now = Date.now();
    for (const it of items) {
      const tm = it.match(/<title>([\s\S]*?)<\/title>/);
      if (!tm) continue;
      let t = decode(tm[1]);
      const dash = t.lastIndexOf(" - ");
      if (dash > 20) t = t.slice(0, dash);
      if (!t) continue;

      // ΦΙΛΤΡΟ ΣΧΕΤΙΚΟΤΗΤΑΣ: ο τιτλος πρεπει να αναφερει την περιφερεια ή σχετικο ορο
      const low = t.toLowerCase();
      const relevant = relevanceTerms.some((rt) => low.includes(rt.toLowerCase()));
      if (!relevant) continue;

      // ΦΙΛΤΡΟ ΧΡΟΝΟΥ: κρατα ηλικια σε μερες απο το pubDate
      let ageDays = 0;
      const pm = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      if (pm) {
        const d = new Date(pm[1]).getTime();
        if (!isNaN(d)) ageDays = Math.floor((now - d) / 86400000);
      }
      if (ageDays > 20) continue; // ασφαλεια: οχι παλια

      out.push({ title: t, ageDays });
    }
    // ταξινομηση: νεοτερα πρωτα
    out.sort((a, b) => a.ageDays - b.ageDays);
    return out;
  } catch {
    return [];
  }
}

// ΠΛΑΤΥ Google News: ολος ο νομος, δεκαδες ειδησεις (αντικαθιστα το freelist που μπλοκαρει τον Vercel)
async function googleNewsBroad(terms: string[], relevanceTerms: string[]): Promise<NewsItem[]> {
  const out: NewsItem[] = [];
  const seen = new Set<string>();
  const now = Date.now();
  for (const term of terms) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(term + " when:21d")}&hl=el&gl=GR&ceid=GR:el`;
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
      if (!r.ok) continue;
      const xml = await r.text();
      const items = xml.split("<item>").slice(1, 60);
      for (const it of items) {
        const tm = it.match(/<title>([\s\S]*?)<\/title>/);
        if (!tm) continue;
        let t = decode(tm[1]);
        const dash = t.lastIndexOf(" - ");
        if (dash > 20) t = t.slice(0, dash);
        if (!t || t.length < 12) continue;
        const low = t.toLowerCase();
        if (!relevanceTerms.some((rt) => low.includes(rt.toLowerCase()))) continue;
        let ageDays = 0;
        const pm = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        if (pm) { const d = new Date(pm[1]).getTime(); if (!isNaN(d)) ageDays = Math.floor((now - d) / 86400000); }
        if (ageDays > 25) continue;
        const key = t.toLowerCase().slice(0, 40);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ title: t, ageDays });
      }
    } catch {}
  }
  out.sort((a, b) => a.ageDays - b.ageDays);
  return out;
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

// Ορος αναζητησης ανα περιφερεια. Για τις μεγαλες πολεις (Αθηνα/Πειραιας) βαζουμε
// ΠΡΑΓΜΑΤΙΚΕΣ πολεις-κλειδια (ετσι το Google News φερνει σχετικα & το φιλτρο πιανει τιτλους).
// Για τους νομους: ερχεται ηδη σωστο 'search' απο τον caller (electoral-districts.ts).
const DISTRICT_OVERRIDES: [RegExp, string][] = [
  [/Β1.*Βόρει.*Αθην/i, "Κηφισιά Μαρούσι Χαλάνδρι Πεντέλη Ψυχικό Φιλοθέη"],
  [/Β2.*Δυτικ.*Αθην/i, "Περιστέρι Ίλιον Πετρούπολη Αιγάλεω Χαϊδάρι"],
  [/Β3.*Νότι.*Αθην/i, "Γλυφάδα Καλλιθέα Άλιμος Νέα Σμύρνη Παλαιό Φάληρο"],
  [/Α.*Αθην/i, "Αθήνα κέντρο Εξάρχεια Κυψέλη Παγκράτι"],
  [/Β.*Πειραι/i, "Νίκαια Κορυδαλλός Σαλαμίνα Αίγινα Κερατσίνι"],
  [/Α.*Πειραι/i, "Πειραιάς λιμάνι"],
  [/Α.*Θεσσαλον/i, "Θεσσαλονίκη κέντρο"],
  [/Β.*Θεσσαλον/i, "Θεσσαλονίκη Καλαμαριά Εύοσμος Σταυρούπολη"],
];

// ============ FREELIST: πλουσια τοπικη ροη ανα νομο (ΟΛΗ η Ελλαδα) ============
const FREELIST_PREFECTURE: Record<string, number> = {
  "Α΄ Αθηνών": 5, "Β1΄ Βόρειου Τομέα Αθηνών": 5, "Β2΄ Δυτικού Τομέα Αθηνών": 55,
  "Β3΄ Νότιου Τομέα Αθηνών": 5, "Α΄ Πειραιώς": 53, "Β΄ Πειραιώς": 53,
  "Περιφέρεια Αττικής (Υπόλοιπο)": 54, "Α΄ Θεσσαλονίκης": 19, "Β΄ Θεσσαλονίκης": 19,
  "Αιτωλοακαρνανίας": 1, "Αργολίδας": 2, "Αρκαδίας": 3, "Άρτας": 4, "Αχαΐας": 6,
  "Βοιωτίας": 7, "Γρεβενών": 8, "Δράμας": 9, "Δωδεκανήσου": 10, "Έβρου": 11,
  "Εύβοιας": 12, "Ευρυτανίας": 13, "Ζακύνθου": 14, "Ηλείας": 15, "Ημαθίας": 16,
  "Ηρακλείου": 17, "Θεσπρωτίας": 18, "Ιωαννίνων": 20, "Καβάλας": 21, "Καρδίτσας": 22,
  "Καστοριάς": 23, "Κέρκυρας": 24, "Κεφαλληνίας": 25, "Κιλκίς": 26, "Κοζάνης": 27,
  "Κορινθίας": 28, "Κυκλάδων": 29, "Λακωνίας": 30, "Λάρισας": 31, "Λασιθίου": 32,
  "Λέσβου": 33, "Λευκάδας": 34, "Μαγνησίας": 35, "Μεσσηνίας": 36, "Ξάνθης": 37,
  "Πέλλας": 38, "Πιερίας": 39, "Πρέβεζας": 40, "Ρεθύμνης": 41, "Ροδόπης": 42,
  "Σάμου": 43, "Σερρών": 44, "Τρικάλων": 45, "Φθιώτιδας": 46, "Φλώρινας": 47,
  "Φωκίδας": 48, "Χαλκιδικής": 49, "Χανίων": 50, "Χίου": 51,
};
function prefectureIdFor(district: string): number | null {
  if (!district) return null;
  const d = district.trim();
  if (FREELIST_PREFECTURE[d] != null) return FREELIST_PREFECTURE[d];
  const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^ν\.?\s*/, "").trim();
  const dn = norm(d);
  for (const [k, v] of Object.entries(FREELIST_PREFECTURE)) if (norm(k) === dn) return v;
  return null;
}
function cleanFreelistTitle(t: string): string {
  const parts = t.split(/\s+[-–]\s+/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (last.length <= 25 && !/\d{4}/.test(last)) parts.pop();
  }
  return parts.join(" - ").replace(/&#8211;/g, "–").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
}
function parseFreelistDate(s: string): Date | null {
  const months: Record<string, number> = { January:0,February:1,March:2,April:3,May:4,June:5,July:6,August:7,September:8,October:9,November:10,December:11 };
  const m = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), months[m[2]] ?? 0, Number(m[1]));
}
async function freelistNews(district: string, maxDays = 30): Promise<NewsItem[]> {
  const pid = prefectureIdFor(district);
  if (!pid) return [];
  try {
    const resp = await fetch(`https://news.freelist.gr/?prefectureId=${pid}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NorayaBot/1.0)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) return [];
    const html = await resp.text();
    const items: NewsItem[] = [];
    const re = /###\s*\[([^\]]+)\]\(([^)]+)\)/g;
    const raw: { title: string; idx: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) raw.push({ title: m[1], idx: m.index });
    const now = Date.now();
    const seen = new Set<string>();
    for (let i = 0; i < raw.length; i++) {
      const start = raw[i].idx;
      const end = i + 1 < raw.length ? raw[i + 1].idx : html.length;
      const chunk = html.slice(start, end);
      const dm = chunk.match(/📅\s*(\d{1,2}\s+\w+\s+\d{4})/);
      const dt = dm ? parseFreelistDate(dm[1]) : null;
      const ageDays = dt ? Math.floor((now - dt.getTime()) / 86400000) : 0;
      if (ageDays > maxDays) continue; // πολυ παλιο
      const title = cleanFreelistTitle(raw[i].title);
      if (!title || title.length < 12) continue;
      const key = title.toLowerCase().slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ title, ageDays });
    }
    return items;
  } catch { return []; }
}

function districtSearchTerm(district: string, providedSearch?: string): string {
  for (const [re, val] of DISTRICT_OVERRIDES) if (re.test(district)) return val;
  // αν ο caller εδωσε ετοιμο search (απο electoral-districts), χρησιμοποιησε το
  if (providedSearch && providedSearch.trim()) return providedSearch.trim();
  // fallback: το ονομα με μετατροπη γενικης -> ονομαστικη
  return district.replace(/ών$/, "ες").replace(/ίας$/, "ία").replace(/^Ν\.?\s*/, "").trim();
}

// Ριζες-φιλτρο: απο ΟΛΕΣ τις λεξεις-πολεις του ορου (>=4 γρ), με κομμενες καταληξεις.
// Αγνοει γενικες λεξεις (κεντρο, προαστια, περιφερεια, λιμανι, νησια...).
const STOP_WORDS = ["κεντρο", "κεντ", "προαστ", "περιφε", "λιμαν", "νησια", "δυτικ", "ανατολ", "βορει", "νοτι", "αττικ"];
function relevanceRoots(term: string): string[] {
  const strip = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const out: string[] = [];
  for (const w of strip(term).split(/\s+/)) {
    if (w.length < 4) continue;
    if (STOP_WORDS.some((sw) => w.startsWith(sw))) continue;
    const r = w.replace(/(ες|ων|ης|ας|ου|ια|α|ο|η|ι|ς)$/, "");
    if (r.length >= 4) out.push(r.slice(0, 6));
  }
  return Array.from(new Set(out));
}

// GET/POST ?district=Σέρρες  (αν λειπει, το παιρνει απο τον συνδεδεμενο)
async function handle(reqDistrict: string | null, force: boolean, providedSearch?: string) {
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
        const res: any = cached.result;
        // Δεξου cache ΜΟΝΟ αν ειναι νεο format (topics με heat) & προσφατο. Αλλιως ξαναχτισε.
        const isNewFormat =
          Array.isArray(res?.topics) &&
          (res.topics.length === 0 || typeof res.topics[0]?.heat === "string");
        if (ageMin < 360 && isNewFormat) {
          return jsonOut({ ok: true, cached: true, district, ...res });
        }
      }
    } catch { /* αγνοειται */ }
  }

  const term = districtSearchTerm(district, providedSearch);

  // Θεματα: απο το Προφιλ Περιφερειας (coreProblems titles) + σταθεροι πυλωνες
  let themes: string[] = [...BASE_THEMES];
  let coreProblemWords: string[] = []; // για issue-ownership («δικο σου θεμα»)
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
      themes = Array.from(new Set([...extra, ...BASE_THEMES])).slice(0, 6);
      // λεξεις-κλειδια απο τα διαχρονικα προβληματα, για να δουμε ποιο θεμα «ανηκει» στον τοπο
      coreProblemWords = extra
        .join(" ")
        .split(/[\s\/,-]+/)
        .filter((w: string) => w.length >= 4);
    }
  } catch { /* αγνοειται */ }

  // Οροι σχετικοτητας: ο τιτλος της ειδησης ΠΡΕΠΕΙ να αναφερει τον τοπο.
  // Παιρνω τη ριζα της περιφερειας (π.χ. «Σέρρες»/«Σερρών» -> «σερρ») + τον ορο αναζητησης.
  const relevanceTerms = relevanceRoots(term);

  // === ΠΗΓΗ 1α: FREELIST (πλουσια τοπικη ροη ολου του νομου, μια κληση) ===
  // ΠΛΑΤΥ query: ολος ο νομος (σκετο ονομα + «νομος X»). Φερνει δεκαδες ειδησεις. (freelist μπλοκαρει τον Vercel)
  const broadTerms = Array.from(new Set([term, `νομός ${term}`, `${term} δήμος`]));
  const freelistItems = await googleNewsBroad(broadTerms, relevanceTerms);

  // Λεξεις-κλειδια ανα θεμα, για να καταταξουμε τα freelist items.
  const THEME_KEYWORDS: Record<string, string[]> = {
    "πολιτικ": ["πασοκ", "συριζα", "νεα δημοκρατ", " νδ ", "κκε", "βουλευτ", "υπουργ", "εκλογ", "κομμα", "δημαρχ", "περιφερειαρχ", "αντιπεριφερει", "δημοτικο συμβουλ"],
    "εργασ": ["ανεργ", "απεργ", "μισθ", "εργαζομ", "δυπα", "προσληψ", "συνδικ", "εργατ", "απολυσ"],
    "ακριβ": ["ακριβ", "τιμ", "κοστ", "πληθωρ", "λογαριασμ", "ρευμα", "καυσιμ", "βενζιν"],
    "στεγασ": ["στεγ", "ενοικ", "κατοικ", "σπιτ", "ακιν"],
    "υγει": ["υγει", "νοσοκομ", "γιατρ", "ασθεν", " εδε", "μεθ", "ιατρ", "τραυματ", "τροχαι", "νεκρ", "θανατ", "διασωλ"],
    "παιδει": ["παιδει", "σχολ", "πανεπιστημ", "φοιτητ", "εκπαιδευ", "μαθητ", "εξετασ", "διπαε", "επαλ", "μουσικο σχολ"],
    "αγροτ": ["αγροτ", "καλλιεργ", "χαλαζ", "κτηνοτροφ", "φραγμα", "αρδευ", "κερκιν", "ελαιολαδ", "παραγωγ"],
    "ασφαλ": ["εγκλημ", "αστυνομ", "συλληψ", "κλοπ", "ληστ", "δολοφον", "δικη", "φωτια", "πυρκαγ", "112", "σπειρ", "εξαρθρωθ", "ξυλοδαρμ"],
    "υποδομ": ["υποδομ", "γεφυρ", "τρεν", "μετρο", "αεροδρομ", "συγκοινων", "οδικ", "αμαξοστοιχ", "hellenic train"],
    "μεταναστ": ["μεταναστ", "προσφυγ", "δομη σιντικ", "συνορ"],
    "δημογραφ": ["δημογραφ", "γεννησ", "υπογεννητ", "πληθυσμ"],
  };
  const stripK = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  function classifyTheme(title: string): string | null {
    const low = stripK(title);
    let best: string | null = null, bestHits = 0;
    for (const [theme, kws] of Object.entries(THEME_KEYWORDS)) {
      const hits = kws.filter((k) => low.includes(k)).length;
      if (hits > bestHits) { bestHits = hits; best = theme; }
    }
    return bestHits > 0 ? best : null;
  }
  // ομαδοποιησε freelist items ανα θεμα
  const freelistByTheme = new Map<string, string[]>();
  for (const it of freelistItems) {
    const th = classifyTheme(it.title);
    if (!th) continue;
    const arr = freelistByTheme.get(th) || [];
    arr.push(it.title);
    freelistByTheme.set(th, arr);
  }

  // ονοματα εμφανισης ανα θεμα-κλειδι
  const THEME_LABELS: Record<string, string> = {
    "πολιτικ": "Πολιτικά τοπικά",
    "εργασ": "Εργασία & ανεργία", "ακριβ": "Ακρίβεια / κόστος ζωής", "στεγασ": "Στέγαση",
    "υγει": "Υγεία & περιστατικά", "παιδει": "Παιδεία", "αγροτ": "Αγροτικά",
    "ασφαλ": "Ασφάλεια & δικαιοσύνη", "υποδομ": "Υποδομές & έργα", "μεταναστ": "Μεταναστευτικό",
    "περιβαλλ": "Περιβάλλον", "δημογραφ": "Δημογραφικό",
  };

  // === ΠΗΓΗ 1β: Google News ανα θεμα (συμπληρωμα) ===
  const gnResults = await Promise.all(
    themes.map(async (theme) => {
      const q = `${term} ${theme}`;
      const items = await googleNews(q, relevanceTerms);
      return { theme, titles: items.map((it) => it.title) };
    })
  );

  // ΕΝΩΣΗ: για καθε θεμα-κλειδι, freelist (κυρια) + google news (αν ταιριαζει)
  const themeKeys = Object.keys(THEME_LABELS);
  const results = themeKeys.map((tk) => {
    const flTitles = freelistByTheme.get(tk) || [];
    // ταιριαξε google news θεματα σε αυτο το κλειδι
    const gnTitles: string[] = [];
    for (const g of gnResults) {
      if (stripK(g.theme).includes(tk) || tk.includes(stripK(g.theme).slice(0, 5))) {
        gnTitles.push(...g.titles);
      }
    }
    // ενωσε, χωρις διπλα
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const t of [...flTitles, ...gnTitles]) {
      const k = t.toLowerCase().slice(0, 35);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(t);
    }
    return {
      label: THEME_LABELS[tk],
      count: merged.length,
      headlines: merged.slice(0, 4),
    };
  });
  // === ΠΗΓΗ 2: ΡΑΝΤΑΡ ΚΟΜΜΑΤΟΣ (v_political_events_live) — τα «καυτα» που αφορουν τον τοπο ===
  // Το ραντάρ τρεχει ηδη συνεχεια & σκοραρει events. Φιλτραρουμε οσα ο τιτλος αναφερει την περιφερεια.
  type RadarHit = { title: string; topic: string; score: number };
  let radarHits: RadarHit[] = [];
  try {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(); // τελευταιες 3 μερες (φρεσκα)
    const { data: evRows } = await svc()
      .from("v_political_events_live")
      .select("topic,title,event_score,article_count,last_article_at")
      .gte("last_article_at", since)
      .order("event_score", { ascending: false })
      .limit(400);
    const stripT = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const ev of (Array.isArray(evRows) ? evRows : []) as any[]) {
      const title = String(ev?.title || "").trim();
      if (!title) continue;
      const low = stripT(title);
      // ΙΔΙΟ φιλτρο σχετικοτητας: ο τιτλος πρεπει να αναφερει τον τοπο
      if (!relevanceTerms.some((rt) => low.includes(rt))) continue;
      radarHits.push({ title, topic: String(ev?.topic || "").trim(), score: Number(ev?.event_score) || 0 });
    }
    // κρατα τα κορυφαια (σκορ) — max 8
    radarHits = radarHits.slice(0, 8);
  } catch { /* το ραντάρ ειναι προαιρετικο — αν αποτυχει, συνεχιζουμε με Google News */ }

  results.sort((a, b) => b.count - a.count);
  const filtered = results.filter((r) => r.count > 0);

  // ΕΝΤΑΣΗ (agenda-setting: ο ΟΓΚΟΣ οριζει την προτεραιοτητα — McCombs & Shaw)
  //  + «ΔΙΚΟ ΣΟΥ ΘΕΜΑ» (issue ownership — Budge): ταιριαζει με τα διαχρονικα προβληματα του τοπου;
  const maxCount = filtered.length ? filtered[0].count : 0;
  const stripL = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const topics = filtered.map((r) => {
    let heat: "hot" | "rising" | "steady";
    if (r.count >= 4 || (maxCount >= 3 && r.count === maxCount)) heat = "hot";
    else if (r.count >= 2) heat = "rising";
    else heat = "steady";
    const lbl = r.label.toLowerCase();
    const mine = coreProblemWords.some((w) => lbl.includes(w) || w.includes(lbl.split(" ")[0]));
    // Ραντάρ: ταιριαζει καποιο καυτο event σε αυτο το θεμα;
    const lblN = stripL(r.label);
    const matched = radarHits.filter((h) => stripL(h.topic) && (lblN.includes(stripL(h.topic).split(" ")[0]) || stripL(h.topic).includes(lblN.split(" ")[0])));
    const radar = matched.length > 0;
    // αν το ραντάρ το πιανει -> ενταση «hot» (ειναι φρεσκο & σοβαρο)
    return { ...r, heat: radar ? "hot" as const : heat, mine, radar };
  });

  // Ραντάρ events που ΔΕΝ ταιριαξαν σε καμια θεματικη -> ξεχωριστο «🎯 Καυτο τωρα»
  const usedTitles = new Set(topics.flatMap((t) => t.headlines.map((h) => stripL(h))));
  const orphanRadar = radarHits.filter((h) => !Array.from(usedTitles).some((u) => u.includes(stripL(h.title).slice(0, 20))));
  if (orphanRadar.length > 0) {
    topics.unshift({
      label: "🎯 Καυτό τώρα",
      count: orphanRadar.length,
      headlines: orphanRadar.slice(0, 3).map((h) => h.title),
      heat: "hot" as const,
      mine: true,
      radar: true,
    });
  }

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
  const search = url.searchParams.get("search") || undefined;
  const force = url.searchParams.get("force") === "1";
  return handle(district, force, search);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const district = body?.district ? String(body.district) : null;
  const search = body?.search ? String(body.search) : undefined;
  const force = body?.force === true || body?.force === 1;
  return handle(district, force, search);
}
