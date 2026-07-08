import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA — «Επιθεσεις» v3 (ΠΡΑΓΜΑΤΙΚΕΣ, καθαρες, ενοποιημενες)
// research: Google News 48h · αρχηγος=κλισεις επωνυμου, μη-αρχηγοι=ΠΛΗΡΕΣ ΟΝΟΜΑ
//           · μονο καθαρες επιθεσεις · συγχωνευση διπλοτυπων (N πηγες)
//           · εγκυροτητα πηγων (whitelist) · προτεραιοτητα αρχηγου.
// scenario: σεναριο απαντησης ανα επιθεση — ΙΔΙΑ ΜΗΤΡΑ με «Σεναρια».
// ============================================================

const MODEL = "claude-sonnet-4-6";
const WINDOW_HOURS_DEFAULT = 48;
const ATTACK = "(επίθεση OR κατά OR παραλήρημα OR επιτέθηκε OR ξέσπασε OR καταγγελία OR κριτική)";

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
function json(p: unknown, s = 200) { return NextResponse.json(p, { status: s }); }

function decode(s: string): string {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}
function norm(x: string): string {
  return (x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9α-ω]/gi, "");
}
const CREDIBLE_TOKENS = [
  "efsyn", "εφημεριδατωνσυντακτων", "καθημερινη", "kathimerini", "τοβημα", "tovima", "τανεα", "tanea",
  "ingr", "ναυτεμπορικη", "naftemporiki", "ερτ", "ertnews", "σκαι", "skai", "πρωτοθεμα", "protothema",
  "news247", "newsit", "documento", "protagon", "iefimerida", "ιεφημεριδα", "cnn", "εθνος", "ethnos",
  "lifo", "tvxs", "αυγη", "avgi", "megatv", "mega", "star", "alpha",
];
function isCredible(source: string): boolean {
  const n = norm(source);
  return !!n && CREDIBLE_TOKENS.some((t) => n.includes(t));
}
function surnameForms(name: string): string[] {
  const parts = (name || "").trim().split(/\s+/);
  const sn = parts[parts.length - 1] || name;
  const forms = new Set<string>([sn]);
  if (sn.endsWith("ς")) forms.add(sn.slice(0, -1)); // «κατα Τσιπρα»
  return Array.from(forms);
}

type NewsItem = { title: string; url: string; source: string; published: string; ageHours: number };

async function googleNews(query: string, windowHours: number): Promise<NewsItem[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:2d")}&hl=el&gl=GR&ceid=GR:el`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = xml.split("<item>").slice(1, 12);
    const now = Date.now();
    const out: NewsItem[] = [];
    for (const it of items) {
      const tm = it.match(/<title>([\s\S]*?)<\/title>/);
      const lm = it.match(/<link>([\s\S]*?)<\/link>/);
      const pm = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const sm = it.match(/<source[^>]*>([\s\S]*?)<\/source>/);
      if (!tm) continue;
      let title = decode(tm[1]);
      let source = sm ? decode(sm[1]) : "";
      const dash = title.lastIndexOf(" - ");
      if (dash > 20 && !source) { source = title.slice(dash + 3); title = title.slice(0, dash); }
      const published = pm ? decode(pm[1]) : "";
      const t = published ? new Date(published).getTime() : now;
      const ageHours = (now - t) / 3.6e6;
      if (ageHours > windowHours) continue;
      out.push({ title, url: lm ? decode(lm[1]) : "", source, published, ageHours: Math.round(ageHours) });
    }
    return out;
  } catch { return []; }
}

async function callClaude(system: string, user: string, maxTokens = 1800): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!resp.ok) throw new Error("Claude API " + resp.status);
  const data = await resp.json();
  return (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}
function parseJsonLoose(raw: string): any | null {
  let s = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  // Δευτερη ευκαιρια: μαζεψε ο,τι μπορεις ακομα κι αν κοπηκε το JSON
  const grab = (key: string) => {
    const i = s.indexOf('"' + key + '"');
    if (i < 0) return null;
    const start = s.indexOf("[", i);
    if (start < 0) return null;
    let depth = 0;
    for (let j = start; j < s.length; j++) {
      if (s[j] === "[") depth++;
      else if (s[j] === "]") { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, j + 1)); } catch { return null; } } }
    }
    // ανοιχτος πινακας -> κλεισε τον στο τελευταιο ολοκληρωμενο }
    const last = s.lastIndexOf("}");
    if (last > start) { try { return JSON.parse(s.slice(start, last + 1) + "]"); } catch { return null; } }
    return null;
  };
  const foresight = grab("foresight");
  const moves = grab("moves");
  if (foresight || moves) {
    const hm = s.match(/"headline"\s*:\s*"([^"]*)"/);
    const wm = s.match(/"where_it_stands"\s*:\s*"([^"]*)"/);
    const mm = s.match(/"move_label"\s*:\s*"([^"]*)"/);
    const bm = s.match(/"because"\s*:\s*"([^"]*)"/);
    return {
      situation: { headline: hm?.[1] || "Ανάλυση", where_it_stands: wm?.[1] || "" },
      foresight: foresight || [],
      moves: moves || [],
      recommendation: mm ? { move_label: mm[1], because: bm?.[1] || "", watch: [] } : undefined,
    };
  }
  return null;
}

// ---------------- RESEARCH ----------------
async function doResearch(partyKey: string, partyLabel: string, windowHours: number) {
  let officials: { name: string; role: string }[] = [];
  try {
    const { data } = await svc().from("political_party_profiles").select("key_officials").eq("party_key", partyKey).limit(1);
    const row: any = Array.isArray(data) ? data[0] : null;
    if (row?.key_officials && Array.isArray(row.key_officials)) officials = row.key_officials.slice(0, 5);
  } catch {}
  if (officials.length === 0) officials = [{ name: partyLabel, role: "κόμμα" }];
  const leaderName = officials[0]?.name || "";

  type Col = { person: string; role: string; isLeader: boolean; credible: boolean; item: NewsItem };
  const collected: Col[] = [];
  const seen = new Set<string>();

  await Promise.all(
    officials.map(async (o) => {
      const isLeader = o.name === leaderName;
      // Αρχηγος: κλισεις επωνυμου + λεξεις-επιθεσης. Μη-αρχηγοι: ΠΛΗΡΕΣ ΟΝΟΜΑ (κοβει συνωνυμους).
      const queries = isLeader
        ? [...surnameForms(o.name), `${surnameForms(o.name).slice(-1)[0]} ${ATTACK}`]
        : [`"${o.name}"`];
      const results = await Promise.all(queries.map((q) => googleNews(q, windowHours)));
      for (const items of results) {
        for (const item of items.slice(0, 8)) {
          if (!item.url || seen.has(item.url)) continue;
          seen.add(item.url);
          collected.push({ person: o.name, role: o.role, isLeader, credible: isCredible(item.source), item });
        }
      }
    }),
  );

  if (collected.length === 0) {
    return { orgAttacks: [], personAttacks: [], officials, checked: officials.map((o) => o.name), sourcesFound: 0 };
  }

  const refList = collected
    .map((c, i) => `[${i + 1}] ${c.credible ? "[ΕΓΚΥΡΗ]" : "[χαμηλή]"} (${c.item.source || "—"} · ${c.item.ageHours}h)${c.isLeader ? " [ΑΡΧΗΓΟΣ]" : ""} ΓΙΑ: ${c.person} — ${c.item.title}`)
    .join("\n");

  const officialNames = officials.map((o) => o.name).join(", ");
  const system = `Εισαι αναλυτης του Noraya. Σου δινονται ΠΡΑΓΜΑΤΙΚΟΙ τιτλοι ειδησεων (τελευταιων ${windowHours} ωρων).
Στοχος: ΚΑΘΑΡΕΣ επιθεσεις/κριτικη εναντιον του κομματος "${partyLabel}" η των στελεχων του: ${officialNames}.

ΚΡΙΣΙΜΟΙ ΚΑΝΟΝΕΣ:
1) ΜΟΝΟ ουσιαστικες ΕΠΙΘΕΣΕΙΣ/ΚΡΙΤΙΚΗ. ΑΓΝΟΗΣΕ ουδετερες ειδησεις, ρεπορταζ χωρις αιχμη, διαδικαστικα («ασιστ», «παρεμβαση») που ΔΕΝ ειναι επιθεση.
2) ΛΑΘΟΣ ΠΡΟΣΩΠΟ: αν τιτλος αφορα ΑΛΛΟ προσωπο με ιδιο επωνυμο (οχι το στελεχος της λιστας), ΑΓΝΟΗΣΕ τον τελειως.
3) ΣΥΓΧΩΝΕΥΣΗ: αν ΠΟΛΛΟΙ τιτλοι περιγραφουν την ΙΔΙΑ επιθεση, ΕΝΩΣΕ τους σε ΜΙΑ εγγραφη με ΟΛΑ τα refs. Οχι διπλοτυπα.
4) ΠΡΟΤΕΡΑΙΟΤΗΤΑ: επιθεσεις στον [ΑΡΧΗΓΟΣ] = υψιστης σημασιας. Οι [ΕΓΚΥΡΗ] πηγες μετρανε πιο πολυ.

Για καθε ενοποιημενη επιθεση: attacker (ποιος επιτιθεται), claim (τι λεει, συντομα), refs (πινακας ΟΛΩΝ των σχετικων αριθμων).`;

  const user = `ΤΙΤΛΟΙ (τελευταιες ${windowHours}h):
${refList}

Επεστρεψε ΜΟΝΟ εγκυρο JSON (καθε επιθεση ΜΙΑ φορα, με ολα τα refs της):
{
 "orgAttacks":   [ { "attacker": "...", "claim": "...", "refs": [1,3] } ],
 "personAttacks":[ { "target": "πληρες ονομα στελεχους", "attacker": "...", "claim": "...", "refs": [2,5] } ]
}
Αν δεν υπαρχει καμια καθαρη επιθεση: {"orgAttacks":[],"personAttacks":[]}`;

  const text = await callClaude(system, user, 1900);
  const parsed = parseJsonLoose(text) || {};

  const attach = (a: any) => {
    const refs: number[] = (Array.isArray(a?.refs) ? a.refs : a?.ref != null ? [a.ref] : [])
      .map((n: any) => Number(n) - 1)
      .filter((i: number) => i >= 0 && i < collected.length);
    const items = refs.map((i) => collected[i]).filter(Boolean) as Col[];
    if (!items.length) return null;
    const primary = items.slice().sort((x, y) => (y.credible ? 1 : 0) - (x.credible ? 1 : 0) || x.item.ageHours - y.item.ageHours)[0];
    const sources = Array.from(new Set(items.map((i) => i.item.source).filter(Boolean)));
    return {
      attacker: String(a?.attacker || "—").trim(),
      claim: String(a?.claim || "").trim(),
      target: a?.target ? String(a.target).trim() : undefined,
      source: primary.item.source || "",
      url: primary.item.url || "",
      published: primary.item.published || "",
      title: primary.item.title || "",
      credible: items.some((i) => i.credible),
      isLeader: !!primary.isLeader,
      count: items.length,
      sources,
    };
  };
  const rank = (a: any, b: any) => (b.credible ? 1 : 0) - (a.credible ? 1 : 0) || b.count - a.count;
  const orgAttacks = (Array.isArray(parsed.orgAttacks) ? parsed.orgAttacks : []).map(attach).filter((x: any) => x && x.claim && x.url).sort(rank);
  const personAttacks = (Array.isArray(parsed.personAttacks) ? parsed.personAttacks : []).map(attach).filter((x: any) => x && x.claim && x.url)
    .sort((a: any, b: any) => (b.isLeader ? 1 : 0) - (a.isLeader ? 1 : 0) || rank(a, b));

  return { orgAttacks, personAttacks, officials, checked: officials.map((o) => o.name), sourcesFound: collected.length };
}

// ---------------- SCENARIO ----------------
async function doScenario(partyKey: string, partyLabel: string, attack: any) {
  let profile: any = { party: partyLabel };
  try {
    const { data } = await svc().from("political_party_profiles")
      .select("party_name, strategic_positioning, issue_lens, known_positions, red_lines")
      .eq("party_key", partyKey).limit(1);
    const p: any = Array.isArray(data) ? data[0] : null;
    if (p) profile = p;
  } catch {}

  const atkText = `${attack?.attacker && attack.attacker !== "—" ? attack.attacker + ": " : ""}${attack?.claim || attack?.title || ""}`;
  const target = attack?.target ? `στέλεχος: ${attack.target}` : "το κόμμα";

  const system = `Εισαι ο ΠΡΟΣΩΠΙΚΟΣ συμβουλος του κομματος "${partyLabel}". Ολα απο τη ΔΙΚΗ ΤΟΥ σκοπια. Σεβεσαι θεση, τονο & κοκκινες γραμμες.
ΠΡΟΦΙΛ (JSON): ${JSON.stringify(profile)}
ΚΡΙΝΕ ΜΟΝΟΣ ΣΟΥ τον τονο: αλλες επιθεσεις θελουν αποφορτιση, αλλες ΜΕΤΩΠΙΚΗ ΣΥΓΚΡΟΥΣΗ/αντεπιθεση. Διαλεξε ο,τι συμφερει το κομμα.
ΟΡΙΟ: πολιτικα επιχειρηματα, ΟΧΙ ρατσισμος/μισαλλοδοξια/προσωπικες προσβολες.`;

  const user = `ΠΡΑΓΜΑΤΙΚΗ ΕΠΙΘΕΣΗ (στοχος: ${target}):
«${atkText}»
Πηγη: ${attack?.source || "—"}${attack?.published ? " · " + attack.published : ""}

Δωσε ΣΕΝΑΡΙΟ ΑΠΑΝΤΗΣΗΣ. ΕΠΙΣΤΡΕΨΕ ΜΟΝΟ εγκυρο JSON με ΑΚΡΙΒΩΣ αυτο το σχημα:
{
 "situation": { "headline": "συντομος τιτλος", "where_it_stands": "1-2 προτασεις: που στεκεται τωρα" },
 "foresight": [ { "label": "Κλιμακωση", "path": "escalate", "probability": 55, "rationale": "γιατι", "signals": ["σημα 1","σημα 2"], "window": "π.χ. 24-48 ωρες" } ],
 "moves": [ { "label": "Δηλωση τωρα", "move": "act_now", "best_for_path": "escalate", "upside": "...", "downside": "...", "opponent_counter": "...", "risk": "medium" } ],
 "connection": "ο συλλογισμος που ενωνει foresight & κινηση",
 "recommendation": { "move_label": "...", "because": "γιατι αυτη", "watch": ["τι να παρακολουθεις 1","2"] }
}
Επιτρεπτα path: escalate | deescalate | pivot | stall. Επιτρεπτα move: act_now | wait | institutional | attack | silent. Επιτρεπτο risk: low | medium | high.`;

  let parsed = parseJsonLoose(await callClaude(system, user, 2200));
  if (!parsed || (!parsed.foresight?.length && !parsed.moves?.length)) {
    // retry μια φορα, πιο αυστηρα
    const retryUser = user + "\n\nΠΡΟΣΟΧΗ: επεστρεψε ΜΟΝΟ το JSON, ΟΛΟΚΛΗΡΩΜΕΝΟ, χωρις κειμενο πριν/μετα.";
    parsed = parseJsonLoose(await callClaude(system, retryUser, 2600));
  }
  return parsed;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "research");
    const partyKey = String(body?.party || "").trim();
    const partyLabel = String(body?.partyLabel || partyKey || "το κομμα").trim();
    if (!partyKey) return json({ ok: false, error: "no_party" }, 400);

    if (mode === "scenario") {
      const scenario = await doScenario(partyKey, partyLabel, body?.attack || {});
      if (!scenario) return json({ ok: false, error: "scenario_parse" });
      return json({ ok: true, scenario });
    }

    const windowHours = Number(body?.windowHours) > 0 ? Number(body.windowHours) : WINDOW_HOURS_DEFAULT;
    const res = await doResearch(partyKey, partyLabel, windowHours);
    return json({ ok: true, windowHours, ...res });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}
