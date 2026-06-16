// NORAYA — Μόνιμη πολιτική μνήμη (retrieval layer)
// Φορτώνει τα 3 locked CSV (public/noraya-data) μία φορά, με cache, και επιστρέφει
// ΜΟΝΟ τις σχετικές γραμμές ανά θέμα/ακροατήριο. Δεν «ρίχνει» όγκο στο AI — στοχεύει.
// ΚΑΝΕΝΑ υπάρχον αρχείο δεν αλλάζει από εδώ.

export type MemRow = Record<string, string>;

// ----------------------------------------------------------------------------
// ΚΡΙΣΙΜΟΣ ΚΑΝΟΝΑΣ ΑΠΟΣΑΦΗΝΙΣΗΣ — να μην μπερδευτεί ΣΥΡΙΖΑ/ΕΛΑΣ/Τσίπρας
// ----------------------------------------------------------------------------
export const PARTY_DISAMBIGUATION = [
  "Ο Αλέξης Τσίπρας ήταν αρχηγός του ΣΥΡΙΖΑ έως το 2023 και πρωθυπουργός 2015-2019.",
  "Από τον Μάιο 2026 ηγείται ΝΕΟΥ κόμματος: ΕΛΑΣ (Ελληνική Αριστερή Συμπαράταξη).",
  "Τα ιστορικά δεδομένα leader-traits για «Αλέξης Τσίπρας» αφορούν την εικόνα του ΩΣ ΣΥΡΙΖΑ· μεταφέρονται στην ΕΛΑΣ ΜΟΝΟ ως ένδειξη προσωπικής εικόνας, με ρητή επιφύλαξη.",
  "Τα ιστορικά vote-intention για «ΣΥΡΙΖΑ» (2018-2022) αφορούν το κόμμα που ηγείτο ΤΟΤΕ ο Τσίπρας. Ο ΣΥΡΙΖΑ συνεχίζει ΧΩΡΙΣ αυτόν. ΣΥΡΙΖΑ ≠ ΕΛΑΣ.",
  "Η ΕΛΑΣ είναι νέο κόμμα — ΔΕΝ υπάρχουν ιστορικά εκλογικά ποσοστά της στα δεδομένα. ΠΟΤΕ μην αποδώσεις στην ΕΛΑΣ ποσοστό από το παρελθόν (π.χ. «η ΕΛΑΣ πήρε Χ% το 2019»).",
].join(" ");

// ----------------------------------------------------------------------------
// Μικρός, ανθεκτικός CSV parser (χειρίζεται εισαγωγικά/κόμματα/νέες γραμμές)
// ----------------------------------------------------------------------------
function parseCsv(text: string): MemRow[] {
  const clean = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQ) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      cur.push(field);
      field = "";
    } else if (c === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  const header = (rows.shift() || []).map((h) => h.trim());
  return rows
    .filter((r) => r.length > 1)
    .map((r) => {
      const o: MemRow = {};
      header.forEach((h, idx) => {
        o[h] = (r[idx] ?? "").trim();
      });
      return o;
    });
}

// ----------------------------------------------------------------------------
// Φόρτωση + cache (ανά warm instance). Διαβάζει το static asset από public/.
// ----------------------------------------------------------------------------
const cache = new Map<string, MemRow[]>();

async function loadCsv(origin: string, file: string): Promise<MemRow[]> {
  if (cache.has(file)) return cache.get(file) as MemRow[];
  try {
    const res = await fetch(`${origin}/noraya-data/${file}`, { cache: "force-cache" });
    if (!res.ok) {
      cache.set(file, []);
      return [];
    }
    const rows = parseCsv(await res.text());
    cache.set(file, rows);
    return rows;
  } catch {
    cache.set(file, []);
    return [];
  }
}

export const loadPublicOpinion = (origin: string) => loadCsv(origin, "public_opinion.csv");
export const loadVoteIntention = (origin: string) => loadCsv(origin, "vote_intention.csv");
export const loadLeaderTraits = (origin: string) => loadCsv(origin, "leader_traits.csv");

// ----------------------------------------------------------------------------
// Βοηθητικά
// ----------------------------------------------------------------------------
function num(v: string | undefined): number {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}
function yearNum(r: MemRow): number {
  const n = parseInt(String(r.survey_year || "0"), 10);
  return Number.isFinite(n) ? n : 0;
}
// Πιο πρόσφατο πρώτα
function byLatest(a: MemRow, b: MemRow): number {
  const dy = yearNum(b) - yearNum(a);
  if (dy !== 0) return dy;
  return String(b.survey_quarter || "").localeCompare(String(a.survey_quarter || ""));
}

// ----------------------------------------------------------------------------
// Χαρτογράφηση ΘΕΜΑ → σχετικά metrics public opinion (audience-engine seed)
// ----------------------------------------------------------------------------
const TOPIC_METRICS: { keys: string[]; metrics: string[]; label: string }[] = [
  { keys: ["στεγ", "ενοικ", "ακιν", "housing", "rent"], metrics: ["issue_country_housing"], label: "Στέγαση" },
  { keys: ["μεταναστ", "προσφυγ", "immigration", "migr"], metrics: ["issue_country_immigration"], label: "Μετανάστευση" },
  { keys: ["υγει", "νοσοκομ", "ασθεν", "ιατρ", "health"], metrics: ["issue_country_health"], label: "Υγεία" },
  { keys: ["κλιμα", "περιβαλλ", "οικολογ", "environment", "climate"], metrics: ["issue_country_environment_climate"], label: "Περιβάλλον/Κλίμα" },
  { keys: ["πολιτικη προστασ", "πυρκαγ", "πλημμυρ", "φυσικη καταστροφ", "σεισμ"], metrics: ["issue_country_environment_climate"], label: "Πολιτική προστασία" },
  { keys: ["εγκλημ", "αστυν", "εγκληματικοτ", "ασφαλεια", "crime", "security"], metrics: ["issue_country_crime_security"], label: "Ασφάλεια/Εγκληματικότητα" },
  { keys: ["ασφαλιστ", "συνταξ", "pension"], metrics: ["national_economy_situation", "trust_national_government"], label: "Ασφαλιστικό/Συντάξεις" },
  { keys: ["εργασ", "ανεργ", "μισθ", "εργαζομεν", "job", "employment"], metrics: ["employment_country_situation", "expectation_personal_job"], label: "Εργασία" },
  { keys: ["ακριβ", "πληθωρ", "κοστος"], metrics: ["national_economy_situation", "expectation_national_economy"], label: "Ακρίβεια/Κόστος ζωής" },
  { keys: ["φορολογ", "φορο", "tax"], metrics: ["national_economy_situation", "expectation_national_economy"], label: "Φορολογία" },
  { keys: ["ενεργει", "ρευμα", "καυσιμ", "φυσικο αεριο", "energy"], metrics: ["national_economy_situation", "expectation_national_economy"], label: "Ενέργεια" },
  { keys: ["αγροτ", "κτηνοτρ", "farmer"], metrics: ["national_economy_situation", "expectation_national_economy"], label: "Αγροτικά" },
  { keys: ["νεολαι", "φοιτητ", "νεοι εργαζ", "youth"], metrics: ["expectation_personal_job", "national_economy_situation"], label: "Νεολαία" },
  { keys: ["παιδει", "πανεπιστ", "σχολει", "εκπαιδ", "μαθητ", "education"], metrics: ["trust_national_government", "national_economy_situation"], label: "Παιδεία" },
  { keys: ["δημογραφ", "οικογενει", "γεννησ", "family"], metrics: ["national_economy_situation", "expectation_personal_job"], label: "Οικογένεια/Δημογραφικό" },
  { keys: ["δικαιοσυν", "δικαστ", "justice"], metrics: ["trust_national_parliament", "democracy_satisfaction_country"], label: "Δικαιοσύνη" },
  { keys: ["θεσμ", "διαφανει", "διαφθορ", "κρατος δικαιου", "corruption"], metrics: ["democracy_satisfaction_country", "trust_national_government", "trust_national_parliament"], label: "Θεσμοί/Διαφάνεια" },
  { keys: ["ανθρωπιν δικαιωμ", "δικαιωματ", "human rights"], metrics: ["democracy_satisfaction_country", "trust_national_parliament"], label: "Ανθρώπινα δικαιώματα" },
  { keys: ["ισοτητ", "συμπεριληψ", "λοατ", "διακρισ"], metrics: ["democracy_satisfaction_country"], label: "Ισότητα/Συμπερίληψη" },
  { keys: ["ευρωπ", "european"], metrics: ["trust_european_union", "democracy_satisfaction_eu"], label: "Ευρωπαϊκή πολιτική" },
  { keys: ["εξωτερικη πολιτικ", "γεωπολιτ", "διπλωματ", "foreign policy"], metrics: ["trust_european_union", "national_economy_situation"], label: "Εξωτερική πολιτική/Γεωπολιτική" },
  { keys: ["αμυν", "ενοπλ", "στρατ", "εξοπλισ", "defense"], metrics: ["trust_national_government", "trust_european_union"], label: "Άμυνα" },
  { keys: ["υποδομ", "μεταφορ", "δρομ", "τρενο", "infrastructure"], metrics: ["trust_national_government", "national_economy_situation"], label: "Υποδομές/Μεταφορές" },
  { keys: ["τοπικη αυτοδιοικ", "δημος", "περιφερει", "municipal"], metrics: ["trust_national_government", "democracy_satisfaction_country"], label: "Τοπική αυτοδιοίκηση" },
  { keys: ["ψηφιακ", "τεχνολογ", "τεχνητη νοημ", "digital", "technology"], metrics: ["national_economy_situation", "trust_national_government"], label: "Ψηφιακή πολιτική/Τεχνολογία" },
  { keys: ["οικονομ", "αναπτυξ", "επενδυσ", "economy"], metrics: ["national_economy_situation", "expectation_national_economy"], label: "Οικονομία" },
];

function matchMetrics(topic: string): { metrics: string[]; label: string } {
  const t = (topic || "").toLowerCase();
  for (const m of TOPIC_METRICS) {
    if (m.keys.some((k) => t.includes(k))) return { metrics: m.metrics, label: m.label };
  }
  // default: γενικό κλίμα οικονομίας + εμπιστοσύνη
  return { metrics: ["national_economy_situation", "trust_national_government"], label: "Γενικό κλίμα" };
}

// ----------------------------------------------------------------------------
// EVIDENCE PACK — συμπυκνωμένο, έτοιμο να μπει σε prompt
// ----------------------------------------------------------------------------
export type EvidenceSignal = {
  metric: string;
  group_type: string;
  group: string;
  value: number;
  year: number;
  quarter: string;
  confidence: string;
};

export type EvidencePack = {
  topic: string;
  matched_label: string;
  matched_metrics: string[];
  overall_signals: EvidenceSignal[];
  affected_audiences: EvidenceSignal[];
  disambiguation: string;
  confidence: "high" | "medium" | "low";
  caveats: string[];
  note: string;
};

export async function buildEvidencePack(origin: string, topic: string): Promise<EvidencePack> {
  const po = await loadPublicOpinion(origin);
  const { metrics, label } = matchMetrics(topic);

  const overall: EvidenceSignal[] = [];
  for (const metric of metrics) {
    const rows = po
      .filter((r) => r.metric === metric && r.group_type === "all")
      .sort(byLatest);
    const latest = rows[0];
    if (latest) {
      overall.push({
        metric,
        group_type: "all",
        group: "overall",
        value: Math.round(num(latest.value_weighted_0_100) * 10) / 10,
        year: yearNum(latest),
        quarter: latest.survey_quarter || "",
        confidence: latest.sample_confidence || "",
      });
    }
  }

  // Ποια ακροατήρια «πονάνε» πιο πολύ στο κύριο metric (πιο πρόσφατη μέτρηση ανά ομάδα)
  const primary = metrics[0];
  const affected: EvidenceSignal[] = [];
  for (const gt of ["age_group", "financial_difficulty_group", "occupation_group"]) {
    const rows = po.filter((r) => r.metric === primary && r.group_type === gt);
    const latestYear = Math.max(0, ...rows.map(yearNum));
    const latestRows = rows.filter((r) => yearNum(r) === latestYear);
    const seen = new Set<string>();
    for (const r of latestRows) {
      if (seen.has(r.group)) continue;
      seen.add(r.group);
      affected.push({
        metric: primary,
        group_type: gt,
        group: r.group,
        value: Math.round(num(r.value_weighted_0_100) * 10) / 10,
        year: yearNum(r),
        quarter: r.survey_quarter || "",
        confidence: r.sample_confidence || "",
      });
    }
  }
  affected.sort((a, b) => b.value - a.value);
  const topAffected = affected.slice(0, 6);

  const confidences = [...overall, ...topAffected].map((s) => s.confidence);
  const hasHigh = confidences.includes("high");
  const hasLow = confidences.every((c) => c === "low");
  const confidence: EvidencePack["confidence"] = overall.length >= 2 && hasHigh ? "high" : hasLow ? "low" : "medium";

  return {
    topic,
    matched_label: label,
    matched_metrics: metrics,
    overall_signals: overall,
    affected_audiences: topAffected,
    disambiguation: PARTY_DISAMBIGUATION,
    confidence,
    caveats: [
      "Public opinion = Ευρωβαρόμετρο, διαχρονικά μοτίβα — όχι σημερινή δημοσκόπηση.",
      "Vote intention 2018-2022 & leader traits = ιστορικά/διαρθρωτικά, όχι τρέχουσα πρόθεση ψήφου.",
    ],
    note:
      overall.length === 0
        ? "Δεν βρέθηκαν άμεσα στοιχεία public opinion για το θέμα — χαμηλή τεκμηρίωση."
        : "Στοιχεία από τη μόνιμη μνήμη public opinion, στοχευμένα στο θέμα.",
  };
}


// ----------------------------------------------------------------------------
// Ελληνικές ετικέτες metrics (για να μη μπερδεύεται το AI με τα αγγλικά ids)
// ----------------------------------------------------------------------------
const METRIC_LABELS: Record<string, string> = {
  issue_country_housing: "Στέγαση ως κορυφαίο εθνικό πρόβλημα (% κοινού)",
  issue_country_immigration: "Μετανάστευση ως κορυφαίο πρόβλημα (%)",
  issue_country_health: "Υγεία ως κορυφαίο πρόβλημα (%)",
  issue_country_environment_climate: "Περιβάλλον/κλίμα ως κορυφαίο πρόβλημα (%)",
  issue_country_crime_security: "Εγκληματικότητα/ασφάλεια ως κορυφαίο πρόβλημα (%)",
  national_economy_situation: "Θετική αξιολόγηση εθνικής οικονομίας (%)",
  expectation_national_economy: "Προσδοκία βελτίωσης εθνικής οικονομίας (%)",
  employment_country_situation: "Θετική αξιολόγηση αγοράς εργασίας (%)",
  expectation_personal_job: "Προσδοκία βελτίωσης προσωπικής εργασίας (%)",
  trust_national_government: "Εμπιστοσύνη στην κυβέρνηση (%)",
  trust_national_parliament: "Εμπιστοσύνη στη Βουλή (%)",
  trust_european_union: "Εμπιστοσύνη στην ΕΕ (%)",
  democracy_satisfaction_country: "Ικανοποίηση από τη δημοκρατία στην Ελλάδα (%)",
  democracy_satisfaction_eu: "Ικανοποίηση από τη δημοκρατία στην ΕΕ (%)",
  left_right_placement: "Τοποθέτηση αριστερά-δεξιά (κλίμακα)",
};
export function metricLabel(m: string): string {
  return METRIC_LABELS[m] || m;
}

// Μετατρέπει το evidence pack σε συμπαγές κείμενο, έτοιμο για system prompt.
export function formatEvidenceForPrompt(pack: EvidencePack): string {
  const lines: string[] = [];
  lines.push(`ΘΕΜΑ ΜΝΗΜΗΣ: ${pack.matched_label} · συνολική βεβαιότητα: ${pack.confidence}`);
  if (pack.overall_signals.length) {
    lines.push("Συνολικοί δείκτες κοινής γνώμης (πιο πρόσφατη μέτρηση):");
    for (const sgn of pack.overall_signals) {
      lines.push(`  • ${metricLabel(sgn.metric)} = ${sgn.value} [${sgn.year} ${sgn.quarter}, τεκμηρίωση: ${sgn.confidence}]`);
    }
  }
  if (pack.affected_audiences.length) {
    lines.push("Ακροατήρια με τις εντονότερες τιμές στο κύριο δείκτη:");
    for (const a of pack.affected_audiences) {
      lines.push(`  • ${a.group_type} → ${a.group}: ${a.value} [${a.year}]`);
    }
  }
  lines.push("CAVEATS: " + pack.caveats.join(" "));
  lines.push("ΑΠΟΣΑΦΗΝΙΣΗ ΚΟΜΜΑΤΩΝ (ΥΠΟΧΡΕΩΤΙΚΟ — μην το παραβιάσεις): " + pack.disambiguation);
  return lines.join("\n");
}

// One-shot: φτιάχνει pack + το γυρνά ως κείμενο. Ασφαλές (ποτέ δεν πετάει).
export async function getMemoryBlock(origin: string, topic: string): Promise<string> {
  try {
    const pack = await buildEvidencePack(origin, topic);
    return formatEvidenceForPrompt(pack);
  } catch {
    return "";
  }
}

// ============================================================================
// CSV #2 (vote intention) + #3 (leader traits) — ΙΣΤΟΡΙΚΟ ΜΟΤΙΒΟ ΚΟΙΝΩΝ/ΑΡΧΗΓΩΝ
// ΠΡΟΣΟΧΗ: δεδομένα 2018-2022 (εποχή ΣΥΡΙΖΑ). ΟΧΙ σημερινά. Η ΕΛΑΣ δεν υπάρχει → proxy ΣΥΡΙΖΑ.
// ============================================================================

const AUDIENCE_MAP: Record<string, { voteProxy?: string; leader?: string; proxyNote?: string }> = {
  elas: {
    voteProxy: "ΣΥΡΙΖΑ",
    leader: "Αλέξης Τσίπρας",
    proxyNote: "Η ΕΛΑΣ δεν υπάρχει στα ιστορικά δεδομένα· ως proxy χρησιμοποιείται η εποχή ΣΥΡΙΖΑ/Τσίπρα (διαρθρωτικό μοτίβο, όχι σημερινό).",
  },
  nd: { voteProxy: "ΝΔ", leader: "Κυριάκος Μητσοτάκης" },
  pasok: { voteProxy: "ΠΑΣΟΚ/ΚΙΝΑΛ" },
  syriza: { voteProxy: "ΣΥΡΙΖΑ", leader: "Αλέξης Τσίπρας" },
  kke: { voteProxy: "ΚΚΕ" },
  elliniki_lysi: { voteProxy: "Ελληνική Λύση" },
  plefsi: { voteProxy: "Πλεύση Ελευθερίας" },
  mera25: { voteProxy: "ΜέΡΑ25" },
};

function normGr(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function audienceKeyFromInput(input: string): string {
  const n = normGr(input);
  if (/ελασ|ελ\.α\.σ|τσιπρα|elas/.test(n)) return "elas";
  if (/νεα δημοκρατ|μητσοτακ/.test(n) || /(^|[^α-ω])νδ([^α-ω]|$)/.test(n)) return "nd";
  if (/πασοκ|κιναλ|ανδρουλακ/.test(n)) return "pasok";
  if (/συριζα/.test(n)) return "syriza";
  if (/κκε/.test(n)) return "kke";
  if (/ελληνικη λυση|βελοπουλ/.test(n)) return "elliniki_lysi";
  if (/πλευση|κωνσταντοπουλ/.test(n)) return "plefsi";
  if (/μερα ?25|βαρουφακ/.test(n)) return "mera25";
  return "";
}

function isJunkGroup(g: string): boolean {
  return /δεν\s*(γνωριζω|απαντ)|δγ\/δα|^δα$|^αλλο|^$/.test(normGr(g));
}

async function voteBehaviorLines(origin: string, proxy: string): Promise<string[]> {
  const v = await loadVoteIntention(origin);
  const gtLabels: Record<string, string> = {
    age_group: "ηλικία",
    education_group: "μόρφωση",
    left_right_group: "ιδεολογία",
    occupation_group: "επάγγελμα",
  };
  const out: string[] = [];
  for (const gt of Object.keys(gtLabels)) {
    let rows = v.filter(
      (r) => r.party === proxy && r.group_type === gt && num(r.vote_share_weighted_valid) > 0 && !isJunkGroup(r.group)
    );
    if (!rows.length) continue;
    const ly = Math.max(...rows.map(yearNum));
    rows = rows
      .filter((r) => yearNum(r) === ly)
      .sort((a, b) => num(b.vote_share_weighted_valid) - num(a.vote_share_weighted_valid));
    if (!rows.length) continue;
    const hi = rows[0];
    const lo = rows[rows.length - 1];
    out.push(
      `  • ${gtLabels[gt]} (${ly}): ισχυρό «${hi.group}» ${Math.round(num(hi.vote_share_weighted_valid))}% / ασθενές «${lo.group}» ${Math.round(num(lo.vote_share_weighted_valid))}%`
    );
  }
  return out;
}

async function leaderImageLines(origin: string, leader: string): Promise<string[]> {
  const rowsAll = await loadLeaderTraits(origin);
  const avg = (rows: MemRow[]) => {
    const vals = rows.map((r) => num(r.share_weighted_valid)).filter((x) => Number.isFinite(x));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
  };
  const latestOf = (rows: MemRow[]) => {
    if (!rows.length) return [] as MemRow[];
    const ly = Math.max(...rows.map(yearNum));
    return rows.filter((r) => yearNum(r) === ly);
  };
  const out: string[] = [];

  const ap = latestOf(
    rowsAll.filter(
      (r) => r.question_leader_primary === leader && r.metric_family === "leader_approval" && r.response_option === "positive_approval"
    )
  );
  if (ap.length) out.push(`  • Έγκριση (θετική, ${yearNum(ap[0])}): ~${Math.round(avg(ap))}%`);

  const pm = latestOf(rowsAll.filter((r) => r.metric_family === "suitable_pm" && r.response_option === leader));
  if (pm.length) out.push(`  • Κατάλληλος πρωθυπουργός (${yearNum(pm[0])}): ~${Math.round(avg(pm))}%`);

  const tr = latestOf(rowsAll.filter((r) => r.metric_family === "leader_trait" && r.response_option === leader));
  if (tr.length) {
    const byTrait: Record<string, number[]> = {};
    for (const r of tr) {
      const val = num(r.share_weighted_valid);
      if (!Number.isFinite(val)) continue;
      (byTrait[r.metric_name] = byTrait[r.metric_name] || []).push(val);
    }
    const ranked = Object.entries(byTrait)
      .map(([k, arr]) => ({ k, s: arr.reduce((a, b) => a + b, 0) / arr.length }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);
    if (ranked.length) {
      out.push(`  • Δυνατά χαρακτηριστικά (${yearNum(tr[0])}): ` + ranked.map((x) => `${x.k} (~${Math.round(x.s)}%)`).join(", "));
    }
  }
  return out;
}

// Συνδυασμένο μπλοκ #2 + #3 για το ΕΠΙΛΕΓΜΕΝΟ κόμμα (ιστορικό μοτίβο, με caveats).
export async function getAudienceMemoryBlock(origin: string, partyInput: string): Promise<string> {
  try {
    const key = audienceKeyFromInput(partyInput);
    const map = AUDIENCE_MAP[key];
    if (!map) return "";
    const sections: string[] = [];

    if (map.voteProxy) {
      const lines = await voteBehaviorLines(origin, map.voteProxy);
      if (lines.length) {
        sections.push(`ΙΣΤΟΡΙΚΟ ΜΟΤΙΒΟ ΕΚΛΟΓΙΚΗΣ ΣΥΜΠΕΡΙΦΟΡΑΣ (proxy: ${map.voteProxy}, 2018-2022 — ΟΧΙ σημερινό):`);
        sections.push(...lines);
      }
    }
    if (map.leader) {
      const lines = await leaderImageLines(origin, map.leader);
      if (lines.length) {
        sections.push(`ΙΣΤΟΡΙΚΗ ΕΙΚΟΝΑ ΑΡΧΗΓΟΥ (${map.leader}, 2018-2022, εποχή ΣΥΡΙΖΑ — ΟΧΙ σημερινή):`);
        sections.push(...lines);
      }
    }
    if (!sections.length) return "";
    if (map.proxyNote) sections.push(`Σημείωση: ${map.proxyNote}`);
    sections.push("ΧΡΗΣΗ: διαρθρωτικό μοτίβο (ποιο κοινό/τι εικόνα) — ΟΧΙ σημερινά ποσοστά. Για τρέχοντα → ζωντανές δημοσκοπήσεις.");
    return sections.join("\n");
  } catch {
    return "";
  }
}
