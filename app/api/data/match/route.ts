import { NextRequest, NextResponse } from "next/server";
import rawIndex from "@/lib/noraya/noraya_data_index.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// NORAYA — "Σύνδεση με δεδομένα" / API ταιριάσματος
//
// Παίρνει ΕΝΑ γεγονός (ελεύθερο κείμενο: theme + τίτλος + σύνοψη),
// το ταιριάζει με ΕΝΑ από τα 7 θέματα των ερευνών μέσω λέξεων-κλειδιών
// (ΧΩΡΙΣ AI — δωρεάν, ακαριαίο), και τραβάει από το ευρετήριο:
//   - το ιστορικό μοτίβο (τάση στον χρόνο)
//   - "ποιον αφορά" σε 6 κοπές (ηλικία/φύλο/μόρφωση/πίεση/τάξη/επάγγελμα)
//   - την εμπιστοσύνη στην κυβέρνηση των επαγγελματικών ομάδων
//   - μια αυτόματη πρόταση-σύνοψη ("Ο Noraya σημειώνει…") φτιαγμένη με κώδικα
//
// Αν οι λέξεις-κλειδιά δεν βρουν τίποτα -> matched:false (το AI fallback
// μπαίνει σε επόμενο βήμα).
// ============================================================

type Trend = [number, number][];
interface GroupRow {
  group: string;
  recent: number;
  n_recent: number;
  trend: Trend;
}
interface MetricBlock {
  overall_trend: Trend;
  by_dimension: Record<string, GroupRow[]>;
}
interface DataIndex {
  meta: { recent_window: [number, number]; year_range: [number, number]; dimensions: string[] };
  topics: Record<string, MetricBlock>;
  trust: Record<string, MetricBlock>;
}

const INDEX = rawIndex as unknown as DataIndex;

const LOW_SAMPLE = 40; // κάτω από αυτό = "λίγα δεδομένα, σημειώνεται"
const DROP_SAMPLE = 8; // πρακτικά άδειο -> δεν εμφανίζεται καθόλου

// ---- Ετικέτες στα ελληνικά (πεζά, για άμεση εμφάνιση στη σελίδα) ----
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
  "15-17": "15-17",
  "18-24": "18-24",
  "25-39": "25-39",
  "40-54": "40-54",
  "55+": "55+",
  male: "άντρες",
  female: "γυναίκες",
  low_education: "βασική μόρφωση",
  medium_education: "μέση μόρφωση",
  high_education: "ανώτατη μόρφωση",
  student_still_studying: "φοιτητές",
  manual_worker: "εργάτες",
  self_employed: "αυτοαπασχολούμενοι",
  white_collar: "υπάλληλοι γραφείου",
  service_worker: "εργαζόμενοι υπηρεσιών",
  student: "φοιτητές",
  unemployed: "άνεργοι",
  low_financial_pressure: "μικρή οικονομική πίεση",
  medium_financial_pressure: "μέτρια οικονομική πίεση",
  high_financial_pressure: "μεγάλη οικονομική πίεση",
  lower_or_working_class: "εργατική / λαϊκή τάξη",
  middle_class: "μεσαία τάξη",
  upper_middle_class: "ανώτερη-μεσαία τάξη",
  upper_class: "ανώτερη τάξη",
};

const DIM_ORDER = [
  "occupation_group",
  "age_group",
  "social_class_group",
  "financial_difficulty_group",
  "education_group",
  "gender",
];

// ---- Λεξικό λέξεων-κλειδιών (χωρίς τόνους, πεζά) ----
const KEYWORDS: Record<string, string[]> = {
  environment_climate: [
    "φωτια", "φωτιες", "πυρκαγ", "καυσων", "κλιμα", "κλιματικ", "περιβαλλον",
    "πλημμυρ", "ρυπανσ", "οικολογ", "δασος", "δαση", "καιρικ", "θερμοκρασ",
    "υπερθερμανσ", "εκπομπ ρυπων", "ανεμογεννητρ",
  ],
  inflation: [
    "ακριβεια", "πληθωρισμ", "τιμες", "τιμων", "κοστος ζωης", "ενεργειακ",
    "ρευμα", "λογαριασμ", "βενζιν", "καυσιμ", "καλαθι", "φπα", "αυξησ τιμων",
    "πανακριβ",
  ],
  unemployment: [
    "ανεργ", "απολυσ", "θεσεις εργασιας", "χωρις δουλεια", "αγορα εργασιας",
  ],
  immigration: [
    "μεταναστ", "προσφυγ", "συνορα", "λαθρομεταναστ", "εβρος", "frontex",
    "ροες", "αλλοδαπ", "hotspot",
  ],
  health: [
    "υγεια", "νοσοκομ", "εσυ", "γιατρ", "φαρμακ", "εμβολ", "πανδημ", "ασθεν",
    "περιθαλψ", "χειρουργ", "ταμεια υγειας",
  ],
  housing: [
    "στεγασ", "στεγαστικ", "ενοικι", "ακινητ", "σπιτι", "σπιτια", "golden visa",
    "airbnb", "στεγη", "αντικειμενικ αξιες", "κοκκιν δανει",
  ],
  crime_security: [
    "εγκλημα", "εγκληματικοτητ", "βια", "ασφαλεια", "αστυνομ", "ληστ",
    "δολοφον", "βιασμ", "οπαδικ", "μαφια", "ναρκωτικ", "μαχαιρωμα", "ξυλοδαρμ",
  ],
};

// ---- Βοηθητικά ----
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // αφαίρεση τόνων
    .replace(/ς/g, "σ");
}

function round0(n: number): number {
  return Math.round(n);
}

function recentAvg(trend: Trend, win: [number, number]): number | null {
  const pts = trend.filter((p) => p[0] >= win[0] && p[0] <= win[1]);
  if (!pts.length) return null;
  const sum = pts.reduce((a, p) => a + p[1], 0);
  return sum / pts.length;
}

function labelGroup(key: string): string {
  return GROUP_LABELS[key] || key;
}

interface OutRow {
  key: string;
  label: string;
  recent: number;
  n_recent: number;
  low_sample: boolean;
  trend: Trend;
}

function buildRows(rows: GroupRow[]): OutRow[] {
  return rows
    .filter((r) => r.recent !== null && r.n_recent >= DROP_SAMPLE)
    .map((r) => ({
      key: r.group,
      label: labelGroup(r.group),
      recent: round0(r.recent),
      n_recent: r.n_recent,
      low_sample: r.n_recent < LOW_SAMPLE,
      trend: r.trend,
    }));
}

function matchTopic(text: string): { topic: string | null; terms: string[] } {
  const norm = normalize(text);
  let best: string | null = null;
  let bestCount = 0;
  let bestTerms: string[] = [];
  Object.keys(KEYWORDS).forEach((topic) => {
    const hits = KEYWORDS[topic].filter((kw) => norm.includes(kw));
    if (hits.length > bestCount) {
      bestCount = hits.length;
      best = topic;
      bestTerms = hits;
    }
  });
  return { topic: best, terms: bestTerms };
}

function trendDirection(trend: Trend, win: [number, number]): { rose: boolean; fromYear: number | null } {
  const recent = recentAvg(trend, win);
  if (recent === null) return { rose: false, fromYear: null };
  const old = trend.filter((p) => p[0] >= win[0] - 6 && p[0] <= win[0] - 2);
  if (!old.length) return { rose: false, fromYear: null };
  const oldAvg = old.reduce((a, p) => a + p[1], 0) / old.length;
  if (recent - oldAvg >= 8) {
    const spikeYear = trend.find((p) => p[0] >= win[0] - 3 && p[1] >= recent * 0.6);
    return { rose: true, fromYear: spikeYear ? spikeYear[0] : win[0] };
  }
  return { rose: false, fromYear: null };
}

function trustWord(v: number): string {
  if (v < 20) return "χαμηλή";
  if (v < 35) return "μέτρια";
  return "σχετικά καλή";
}

function buildNorayaNote(
  topicLabel: string,
  overallRecent: number | null,
  occRows: OutRow[],
  trustOcc: Record<string, number>,
  dir: { rose: boolean; fromYear: number | null }
): string {
  // Περίπτωση: το θέμα δηλώνεται ελάχιστα στις έρευνες (π.χ. στέγαση)
  if (overallRecent !== null && overallRecent < 5) {
    return (
      "Ο Noraya σημειώνει: στις έρευνες το θέμα «" + topicLabel +
      "» δηλώνεται ελάχιστα ως κορυφαίο πρόβλημα της χώρας (~" + round0(overallRecent) +
      "%), παρότι στην καθημερινότητα μπορεί να πιέζει έντονα. Τα νούμερα παρακάτω δείχνουν τη δηλωμένη ανησυχία, όχι κατ' ανάγκη τη βιωμένη."
    );
  }

  const top = occRows.filter((r) => !r.low_sample).slice(0, 2);
  if (top.length < 1) {
    return "Ο Noraya σημειώνει: τα δεδομένα για αυτό το θέμα είναι περιορισμένα ανά ομάδα — δες τις κοπές με προσοχή.";
  }

  const list = top.map((r) => r.label + " " + r.recent + "%").join(", ");
  let note = "Ο Noraya σημειώνει: το θέμα «" + topicLabel + "» αφορά κυρίως: " + list + ".";

  const trustVals = top
    .map((r) => trustOcc[r.key])
    .filter((v) => typeof v === "number");
  if (trustVals.length) {
    const lo = Math.min(...trustVals);
    const hi = Math.max(...trustVals);
    const range = lo === hi ? lo + "%" : round0(lo) + "–" + round0(hi) + "%";
    note += " Είναι ομάδες με " + trustWord(lo) + " εμπιστοσύνη στην κυβέρνηση (" + range + ").";
  }

  if (dir.rose && dir.fromYear) {
    note += " Η ανησυχία έχει εκτοξευθεί από το " + dir.fromYear + ".";
  }

  return note;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const theme: string = body?.theme || "";
    const eventTitle: string = body?.event_title || body?.active_event_title || "";
    const eventSummary: string = body?.event_summary || body?.active_event_summary || "";

    const text = [theme, eventTitle, eventSummary].filter(Boolean).join(" ");
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "no_input" }, { status: 400 });
    }

    const { topic, terms } = matchTopic(text);

    if (!topic) {
      return NextResponse.json({
        ok: true,
        matched: false,
        input: { theme, event_title: eventTitle },
        message: "Δεν βρέθηκε θέμα από τις λέξεις-κλειδιά (το AI fallback έρχεται σε επόμενο βήμα).",
      });
    }

    const block = INDEX.topics[topic];
    const win = INDEX.meta.recent_window;
    const overallRecent = recentAvg(block.overall_trend, win);

    // 6 κοπές
    const dimensions = DIM_ORDER.filter((d) => block.by_dimension[d]).map((d) => ({
      key: d,
      label: DIM_LABELS[d] || d,
      groups: buildRows(block.by_dimension[d]),
    }));

    // εμπιστοσύνη στην κυβέρνηση ανά επάγγελμα
    const trustBlock = INDEX.trust["trust_national_government"];
    const trustOccRows = trustBlock ? buildRows(trustBlock.by_dimension["occupation_group"] || []) : [];
    const trustOccMap: Record<string, number> = {};
    trustOccRows.forEach((r) => {
      trustOccMap[r.key] = r.recent;
    });

    const occDim = dimensions.find((d) => d.key === "occupation_group");
    const occRows = occDim ? occDim.groups : [];
    const dir = trendDirection(block.overall_trend, win);

    const norayaNote = buildNorayaNote(
      TOPIC_LABELS[topic] || topic,
      overallRecent,
      occRows,
      trustOccMap,
      dir
    );

    return NextResponse.json({
      ok: true,
      matched: true,
      input: { theme, event_title: eventTitle },
      match: {
        topic_key: topic,
        topic_label: TOPIC_LABELS[topic] || topic,
        method: "keywords",
        matched_terms: terms,
      },
      data: {
        recent_window: win,
        year_range: INDEX.meta.year_range,
        overall_salience_recent: overallRecent === null ? null : round0(overallRecent),
        trend: block.overall_trend,
        dimensions,
        trust_government_by_occupation: trustOccRows.map((r) => ({
          key: r.key,
          label: r.label,
          recent: r.recent,
          low_sample: r.low_sample,
        })),
        noraya_note: norayaNote,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
