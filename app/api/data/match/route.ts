import { NextRequest, NextResponse } from "next/server";
import rawIndex from "@/lib/noraya/noraya_data_index.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// NORAYA — "Σύνδεση με δεδομένα" / API ταιριάσματος (v2)
//
// Παίρνει ΕΝΑ γεγονός/θέμα και επιστρέφει την εικόνα δεδομένων.
// Ταίριασμα με ΔΥΟ τρόπους:
//   1) Αν το theme είναι μία από τις 30 ομπρέλες (taxonomy) -> άμεσος χάρτης
//   2) Αλλιώς (ελεύθερο κείμενο) -> λέξεις-κλειδιά
//
// Αν το θέμα έχει έρευνα (8 "πράσινα") -> kind:"survey" με νούμερα.
// Αν ΔΕΝ έχει (τα υπόλοιπα) -> kind:"noraya_only" (η έξυπνη ανάγνωση
// Noraya έρχεται από ξεχωριστό endpoint, με cache).
// ============================================================

type Trend = [number, number][];
interface GroupRow { group: string; recent: number; n_recent: number; trend: Trend; }
interface MetricBlock { overall_trend: Trend; by_dimension: Record<string, GroupRow[]>; }
interface DataIndex {
  meta: { recent_window: [number, number]; year_range: [number, number]; dimensions: string[] };
  topics: Record<string, MetricBlock>;
  trust: Record<string, MetricBlock>;
}
const INDEX = rawIndex as unknown as DataIndex;

const LOW_SAMPLE = 40;
const DROP_SAMPLE = 8;

const TOPIC_LABELS: Record<string, string> = {
  environment_climate: "περιβάλλον / κλίμα",
  inflation: "ακρίβεια / πληθωρισμός",
  unemployment: "ανεργία",
  immigration: "μετανάστευση",
  health: "υγεία",
  housing: "στέγαση",
  crime_security: "έγκλημα / ασφάλεια",
};

const DIM_LABELS: Record<string, string> = {
  age_group: "ηλικία",
  gender: "φύλο",
  education_group: "μόρφωση",
  occupation_group: "επάγγελμα",
  financial_difficulty_group: "οικονομική πίεση",
  social_class_group: "κοινωνική τάξη",
};

const GROUP_LABELS: Record<string, string> = {
  "15-17": "15-17", "18-24": "18-24", "25-39": "25-39", "40-54": "40-54", "55+": "55+",
  male: "άντρες", female: "γυναίκες",
  low_education: "βασική μόρφωση", medium_education: "μέση μόρφωση",
  high_education: "ανώτατη μόρφωση", student_still_studying: "φοιτητές",
  manual_worker: "εργάτες", self_employed: "αυτοαπασχολούμενοι",
  white_collar: "υπάλληλοι γραφείου", service_worker: "εργαζόμενοι υπηρεσιών",
  student: "φοιτητές", unemployed: "άνεργοι",
  low_financial_pressure: "μικρή οικονομική πίεση", medium_financial_pressure: "μέτρια οικονομική πίεση",
  high_financial_pressure: "μεγάλη οικονομική πίεση",
  lower_or_working_class: "εργατική / λαϊκή τάξη", middle_class: "μεσαία τάξη",
  upper_middle_class: "ανώτερη-μεσαία τάξη", upper_class: "ανώτερη τάξη",
};

const DIM_ORDER = [
  "occupation_group", "age_group", "social_class_group",
  "financial_difficulty_group", "education_group", "gender",
];

// ---- Χάρτης: 30 ομπρέλες (taxonomy) -> θέμα έρευνας ή null ("ανάγνωση Noraya") ----
const THEME_TO_TOPIC: Record<string, string | null> = {
  "Ακρίβεια / κόστος ζωής": "inflation",
  "Στέγαση": "housing",
  "Εργασία": "unemployment",
  "Υγεία": "health",
  "Μεταναστευτικό": "immigration",
  "Ασφάλεια / εγκληματικότητα": "crime_security",
  "Περιβάλλον / κλιματική κρίση": "environment_climate",
  "Πολιτική προστασία": "environment_climate",
  // τα υπόλοιπα 22 -> ανάγνωση Noraya (δεν τα ρωτά / δεν τα τραβήξαμε ακόμα)
  "Οικονομία": null, "Φορολογία": null, "Ασφαλιστικό / συντάξεις": null,
  "Παιδεία": null, "Πανεπιστήμια": null, "Νεολαία": null,
  "Οικογένεια / δημογραφικό": null, "Δικαιοσύνη": null, "Θεσμοί / διαφάνεια": null,
  "Άμυνα": null, "Γεωπολιτική": null, "Εξωτερική πολιτική": null, "Ενέργεια": null,
  "Αγροτικά": null, "Υποδομές / μεταφορές": null, "Ψηφιακή πολιτική / τεχνολογία": null,
  "Πολιτισμός": null, "Αθλητισμός": null, "Τοπική αυτοδιοίκηση": null,
  "Ευρωπαϊκή πολιτική": null, "Ανθρώπινα δικαιώματα": null, "Ισότητα / συμπερίληψη": null,
};

const KEYWORDS: Record<string, string[]> = {
  environment_climate: ["φωτια","φωτιες","πυρκαγ","καυσων","κλιμα","κλιματικ","περιβαλλον","πλημμυρ","ρυπανσ","οικολογ","δασος","δαση","καιρικ","θερμοκρασ","υπερθερμανσ","εκπομπ ρυπων","ανεμογεννητρ","πολιτικη προστασια"],
  inflation: ["ακριβεια","πληθωρισμ","τιμες","τιμων","κοστος ζωης","ενεργειακ","ρευμα","λογαριασμ","βενζιν","καυσιμ","καλαθι","φπα","αυξησ τιμων","πανακριβ"],
  unemployment: ["ανεργ","απολυσ","θεσεις εργασιας","χωρις δουλεια","αγορα εργασιας","εργασια"],
  immigration: ["μεταναστ","προσφυγ","συνορα","λαθρομεταναστ","εβρος","frontex","ροες","αλλοδαπ","hotspot"],
  health: ["υγεια","νοσοκομ","εσυ","γιατρ","φαρμακ","εμβολ","πανδημ","ασθεν","περιθαλψ","χειρουργ","ταμεια υγειας"],
  housing: ["στεγασ","στεγαστικ","ενοικι","ακινητ","σπιτι","σπιτια","golden visa","airbnb","στεγη","αντικειμενικ αξιες","κοκκιν δανει"],
  crime_security: ["εγκλημα","εγκληματικοτητ","βια","ασφαλεια","αστυνομ","ληστ","δολοφον","βιασμ","οπαδικ","μαφια","ναρκωτικ","μαχαιρωμα","ξυλοδαρμ"],
};

function normalize(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ς/g, "σ").trim();
}
function round0(n: number): number { return Math.round(n); }
function recentAvg(trend: Trend, win: [number, number]): number | null {
  const pts = trend.filter((p) => p[0] >= win[0] && p[0] <= win[1]);
  if (!pts.length) return null;
  return pts.reduce((a, p) => a + p[1], 0) / pts.length;
}
function labelGroup(key: string): string { return GROUP_LABELS[key] || key; }

interface OutRow { key: string; label: string; recent: number; n_recent: number; low_sample: boolean; trend: Trend; }
function buildRows(rows: GroupRow[]): OutRow[] {
  return rows
    .filter((r) => r.recent !== null && r.n_recent >= DROP_SAMPLE)
    .map((r) => ({
      key: r.group, label: labelGroup(r.group), recent: round0(r.recent),
      n_recent: r.n_recent, low_sample: r.n_recent < LOW_SAMPLE, trend: r.trend,
    }));
}

// ---- Επίλυση θέματος: ομπρέλα (exact) -> χάρτης, αλλιώς λέξεις-κλειδιά ----
interface Resolved { topic: string | null; umbrella: string | null; method: string; terms: string[] }
function resolve(text: string): Resolved {
  const norm = normalize(text);

  // 1) exact ομπρέλα
  let umbrellaHit: string | null = null;
  Object.keys(THEME_TO_TOPIC).forEach((u) => {
    if (!umbrellaHit && normalize(u) === norm) umbrellaHit = u;
  });
  if (umbrellaHit) {
    return { topic: THEME_TO_TOPIC[umbrellaHit], umbrella: umbrellaHit, method: "theme", terms: [] };
  }

  // 2) λέξεις-κλειδιά
  let best: string | null = null;
  let bestCount = 0;
  let bestTerms: string[] = [];
  Object.keys(KEYWORDS).forEach((topic) => {
    const hits = KEYWORDS[topic].filter((kw) => norm.includes(normalize(kw)));
    if (hits.length > bestCount) { bestCount = hits.length; best = topic; bestTerms = hits; }
  });
  return { topic: best, umbrella: null, method: best ? "keywords" : "none", terms: bestTerms };
}

function trendDirection(trend: Trend, win: [number, number]): { rose: boolean; fromYear: number | null } {
  const recent = recentAvg(trend, win);
  if (recent === null) return { rose: false, fromYear: null };
  const old = trend.filter((p) => p[0] >= win[0] - 6 && p[0] <= win[0] - 2);
  if (!old.length) return { rose: false, fromYear: null };
  const oldAvg = old.reduce((a, p) => a + p[1], 0) / old.length;
  if (recent - oldAvg >= 8) {
    const spike = trend.find((p) => p[0] >= win[0] - 3 && p[1] >= recent * 0.6);
    return { rose: true, fromYear: spike ? spike[0] : win[0] };
  }
  return { rose: false, fromYear: null };
}
function trustWord(v: number): string { return v < 20 ? "χαμηλή" : v < 35 ? "μέτρια" : "σχετικά καλή"; }

function buildNote(topicLabel: string, overallRecent: number | null, occRows: OutRow[], trustOcc: Record<string, number>, dir: { rose: boolean; fromYear: number | null }): string {
  if (overallRecent !== null && overallRecent < 5) {
    return "Ο Noraya σημειώνει: στις έρευνες το θέμα «" + topicLabel + "» δηλώνεται ελάχιστα ως κορυφαίο πρόβλημα της χώρας (~" + round0(overallRecent) + "%), παρότι στην καθημερινότητα μπορεί να πιέζει έντονα. Τα νούμερα δείχνουν τη δηλωμένη ανησυχία, όχι κατ' ανάγκη τη βιωμένη.";
  }
  const top = occRows.filter((r) => !r.low_sample).slice(0, 2);
  if (top.length < 1) return "Ο Noraya σημειώνει: τα δεδομένα ανά ομάδα είναι περιορισμένα — δες τις κοπές με προσοχή.";
  const list = top.map((r) => r.label + " " + r.recent + "%").join(", ");
  let note = "Ο Noraya σημειώνει: το θέμα «" + topicLabel + "» αφορά κυρίως: " + list + ".";
  const tv = top.map((r) => trustOcc[r.key]).filter((v) => typeof v === "number");
  if (tv.length) {
    const lo = Math.min(...tv); const hi = Math.max(...tv);
    const range = lo === hi ? lo + "%" : round0(lo) + "–" + round0(hi) + "%";
    note += " Είναι ομάδες με " + trustWord(lo) + " εμπιστοσύνη στην κυβέρνηση (" + range + ").";
  }
  if (dir.rose && dir.fromYear) note += " Η ανησυχία έχει εκτοξευθεί από το " + dir.fromYear + ".";
  return note;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const theme: string = body?.theme || "";
    const eventTitle: string = body?.event_title || body?.active_event_title || "";
    const eventSummary: string = body?.event_summary || body?.active_event_summary || "";
    const text = [theme, eventTitle, eventSummary].filter(Boolean).join(" ");
    if (!text.trim()) return NextResponse.json({ ok: false, error: "no_input" }, { status: 400 });

    const r = resolve(theme || text);

    // Δεν ταίριαξε τίποτα
    if (!r.topic && !r.umbrella) {
      return NextResponse.json({
        ok: true, matched: false, input: { theme, event_title: eventTitle },
        message: "Δεν βρέθηκε θέμα.",
      });
    }

    // Θέμα-ομπρέλα ΧΩΡΙΣ έρευνα -> ανάγνωση Noraya (γεμίζει από ξεχωριστό endpoint)
    if (!r.topic) {
      return NextResponse.json({
        ok: true, matched: true, kind: "noraya_only",
        input: { theme, event_title: eventTitle },
        match: { topic_key: null, topic_label: r.umbrella, method: r.method },
        message: "Δεν υπάρχει σκληρή έρευνα γι' αυτό το θέμα — εδώ μπαίνει η ανάγνωση Noraya.",
      });
    }

    // Θέμα ΜΕ έρευνα
    const block = INDEX.topics[r.topic];
    const win = INDEX.meta.recent_window;
    const overallRecent = recentAvg(block.overall_trend, win);

    const dimensions = DIM_ORDER.filter((d) => block.by_dimension[d]).map((d) => ({
      key: d, label: DIM_LABELS[d] || d, groups: buildRows(block.by_dimension[d]),
    }));

    const trustBlock = INDEX.trust["trust_national_government"];
    const trustOccRows = trustBlock ? buildRows(trustBlock.by_dimension["occupation_group"] || []) : [];
    const trustOccMap: Record<string, number> = {};
    trustOccRows.forEach((r2) => { trustOccMap[r2.key] = r2.recent; });

    const occDim = dimensions.find((d) => d.key === "occupation_group");
    const occRows = occDim ? occDim.groups : [];
    const dir = trendDirection(block.overall_trend, win);
    const topicLabel = TOPIC_LABELS[r.topic] || r.topic;
    const note = buildNote(topicLabel, overallRecent, occRows, trustOccMap, dir);

    return NextResponse.json({
      ok: true, matched: true, kind: "survey",
      input: { theme, event_title: eventTitle },
      match: { topic_key: r.topic, topic_label: topicLabel, method: r.method, matched_terms: r.terms, umbrella: r.umbrella },
      data: {
        recent_window: win, year_range: INDEX.meta.year_range,
        overall_salience_recent: overallRecent === null ? null : round0(overallRecent),
        trend: block.overall_trend, dimensions,
        trust_government_by_occupation: trustOccRows.map((r2) => ({ key: r2.key, label: r2.label, recent: r2.recent, low_sample: r2.low_sample })),
        noraya_note: note,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "server_error", detail: String(e?.message || e) }, { status: 500 });
  }
}
