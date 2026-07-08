import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA — «Επιθεσεις» v3 (ΠΡΑΓΜΑΤΙΚΕΣ, 48h, ζυγισμενη εγκυροτητα)
// research: Google News (48h) ανα στελεχος με ΕΠΩΝΥΜΟ+κλισεις+λεξεις-επιθεσης,
//           προτεραιοτητα ΑΡΧΗΓΟΥ, καταταξη με εγκυρα ΜΜΕ πρωτα (β: ζυγισμενο).
// scenario: σεναριο απαντησης — ΙΔΙΑ ΜΗΤΡΑ με «Σεναρια».
// ============================================================

const MODEL = "claude-sonnet-4-6";
const WINDOW_HOURS_DEFAULT = 48;

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
function json(p: unknown, s = 200) { return NextResponse.json(p, { status: s }); }

function decode(s: string): string {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

// Εγκυρα/υψηλης απηχησης ΜΜΕ (whitelist) — ζυγισμενη καταταξη, οχι κοψιμο
const CREDIBLE = ["efsyn","καθημεριν","kathimerini","βημα","vima","tovima","τα νεα","tanea","in.gr","ερτ","ertnews","ναυτεμπορ","naftempor","σκαι","skai","πρωτο θεμα","protothema","news247","newsit","documento","ntokoumento","protagon","iefimerida","ημεριδα","cnn.gr","reader","έθνος","εθνος","ethnos","lifo","tvxs","αυγη","avgi","parapolitika","παραπολιτικ","kontranews","liberal"];
function isCredible(source: string): boolean {
  const t = (source || "").toLowerCase();
  return CREDIBLE.some((k) => t.includes(k));
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

async function callClaude(system: string, user: string, maxTokens = 2000): Promise<string> {
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
  const s = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
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
  const ATTACK = "(επίθεση OR κατά OR παραλήρημα OR ξέσπασε OR κόντρα OR επιτίθεται OR κατηγορεί OR εναντίον OR πυρά OR απάντηση)";
  const seen = new Set<string>();
  const collected: { person: string; role: string; isLeader: boolean; item: NewsItem }[] = [];

  await Promise.all(
    officials.map(async (o) => {
      const parts = o.name.trim().split(/\s+/);
      const surname = parts[parts.length - 1];
      const stem = surname.replace(/[ςσ]$/, ""); // Τσιπρας -> Τσιπρα (κλισεις)
      const isLeader = o.name === leaderName;
      const queries = [`"${o.name}"`, `(${surname} OR ${stem}) ${ATTACK}`];
      const results = await Promise.all(queries.map((q) => googleNews(q, windowHours)));
      for (const item of results.flat()) {
        if (!item.url || seen.has(item.url)) continue;
        seen.add(item.url);
        collected.push({ person: o.name, role: o.role, isLeader, item });
      }
    }),
  );

  collected.sort((a, b) => (Number(b.isLeader) - Number(a.isLeader)) || (a.item.ageHours - b.item.ageHours));
  collected.splice(40);

  if (collected.length === 0) {
    return { orgAttacks: [], personAttacks: [], checked: officials.map((o) => o.name), sourcesFound: 0 };
  }

  const refList = collected.map((c, i) => `[${i + 1}] (${c.item.source || "—"} · ${c.item.ageHours}h${c.isLeader ? " · ΑΡΧΗΓΟΣ" : ""}) ΓΙΑ: ${c.person} — ${c.item.title}`).join("\n");

  const system = `Εισαι αναλυτης του Noraya. Σου δινονται ΠΡΑΓΜΑΤΙΚΟΙ τιτλοι ειδησεων (τελευταιων ${windowHours} ωρων) για στελεχη του κομματος "${partyLabel}".
Εντοπισε ΠΟΙΟΙ τιτλοι ειναι ΕΠΙΘΕΣΕΙΣ/ΚΡΙΤΙΚΗ εναντιον του κομματος η των προσωπων του. ΜΗΝ εφευρισκεις — ΜΟΝΟ απο τους τιτλους, με ref.
ΠΡΟΤΕΡΑΙΟΤΗΤΑ: επιθεσεις στον ΑΡΧΗΓΟ ειναι οι ΠΙΟ ΣΗΜΑΝΤΙΚΕΣ — μη τις χανεις.
Ξεχωρισε: (α) κατα ΚΟΜΜΑΤΟΣ (γραμμη/συνολο), (β) κατα ΠΡΟΣΩΠΟΥ (συγκεκριμενο στελεχος). Αν τιτλος δεν ειναι επιθεση, ΑΓΝΟΗΣΕ.
Για καθε επιθεση: attacker (ποιος επιτιθεται, αν φαινεται· αλλιως «—»), claim (τι λεει, συντομα), ref.`;

  const user = `ΤΙΤΛΟΙ (τελευταιες ${windowHours}h):
${refList}

Επεστρεψε ΜΟΝΟ εγκυρο JSON:
{
 "orgAttacks":   [ { "attacker": "...", "claim": "...", "ref": 1 } ],
 "personAttacks":[ { "target": "ονομα στελεχους", "attacker": "...", "claim": "...", "ref": 2 } ]
}
Αν καμια επιθεση: {"orgAttacks":[],"personAttacks":[]}`;

  const text = await callClaude(system, user, 1800);
  const parsed = parseJsonLoose(text) || {};
  const attach = (a: any) => {
    const c = collected[Number(a?.ref) - 1];
    return {
      attacker: String(a?.attacker || "—").trim(),
      claim: String(a?.claim || "").trim(),
      target: a?.target ? String(a.target).trim() : undefined,
      source: c?.item.source || "",
      url: c?.item.url || "",
      published: c?.item.published || "",
      title: c?.item.title || "",
      credible: c ? isCredible(c.item.source) : false,
      isLeader: c?.isLeader || false,
    };
  };
  const orgAttacks = (Array.isArray(parsed.orgAttacks) ? parsed.orgAttacks : []).map(attach).filter((x: any) => x.claim && x.url)
    .sort((a: any, b: any) => Number(b.credible) - Number(a.credible));
  const personAttacks = (Array.isArray(parsed.personAttacks) ? parsed.personAttacks : []).map(attach).filter((x: any) => x.claim && x.url)
    .sort((a: any, b: any) => (Number(b.isLeader) - Number(a.isLeader)) || (Number(b.credible) - Number(a.credible)));
  return { orgAttacks, personAttacks, checked: officials.map((o) => o.name), sourcesFound: collected.length };
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
 "situation": { "headline": "συντομος τιτλος", "where_it_stands": "1-2 προτασεις" },
 "foresight": [ { "label": "Κλιμακωση", "path": "escalate", "probability": 55, "rationale": "γιατι", "signals": ["σημα 1","σημα 2"], "window": "π.χ. 24-48 ωρες" } ],
 "moves": [ { "label": "Δηλωση τωρα", "move": "act_now", "best_for_path": "escalate", "upside": "...", "downside": "...", "opponent_counter": "...", "risk": "medium" } ],
 "connection": "ο συλλογισμος",
 "recommendation": { "move_label": "...", "because": "γιατι", "watch": ["1","2"] }
}
Επιτρεπτα path: escalate | deescalate | pivot | stall. Επιτρεπτα move: act_now | wait | institutional | attack | silent. Επιτρεπτο risk: low | medium | high.`;

  const text = await callClaude(system, user, 1600);
  return parseJsonLoose(text);
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
