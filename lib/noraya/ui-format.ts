/* ---------------------------------------------------------------------------
 * lib/noraya/ui-format.ts
 *
 * ΒΗΜΑ 1 — UI credibility helpers (pure functions, no side effects).
 * Δεν αλλάζει design. Διορθώνει μόνο: ελληνικά counts, evidence gating,
 * generic topic labels, και πότε ένα sparkline επιτρέπεται να δείχνει τάση.
 *
 * Καθαρό module: μπορεί να γίνει import από οπουδήποτε χωρίς κίνδυνο.
 * ------------------------------------------------------------------------- */

/** Σωστός ελληνικός πληθυντικός: greekCount(1,"άρθρο","άρθρα") => "1 άρθρο". */
export function greekCount(n: number | null | undefined, singular: string, plural: string): string {
  const value = Number.isFinite(n as number) ? Math.max(0, Math.round(n as number)) : 0;
  return `${value} ${value === 1 ? singular : plural}`;
}

/** Presets για τα δύο πιο συχνά counts. */
export const articlesLabel = (n: number | null | undefined) => greekCount(n, "άρθρο", "άρθρα");
export const sourcesLabel = (n: number | null | undefined) => greekCount(n, "πηγή", "πηγές");

export type DocTone = "strong" | "medium" | "initial" | "insufficient" | "low_base";

export type EvidenceGate = {
  /** true όταν το θέμα έχει πολύ μικρή τεκμηριωτική βάση (1 άρθρο / 1 πηγή). */
  isLowBase: boolean;
  /** Ετικέτα προς εμφάνιση στο UI. */
  label: string;
  /** Τόνος για χρωματισμό chip/badge. */
  tone: DocTone;
  /** Σύντομη επεξήγηση (tooltip / subtitle). */
  note: string;
};

/**
 * Evidence gating.
 *
 * Στόχος (από blueprint): αν ένα θέμα έχει λίγα άρθρα/πηγές, ΝΑ ΜΗΝ εμφανίζεται
 * σαν απόλυτο πρώτο θέμα, αλλά ως «Υψηλό αρχικό σήμα · χαμηλή βάση τεκμηρίωσης».
 */
export function evidenceGate(input: {
  articleCount?: number | null;
  sourceCount?: number | null;
  documentationLevel?: string | null;
}): EvidenceGate {
  const articles = Math.max(0, Math.round(input.articleCount ?? 0));
  const sources = Math.max(0, Math.round(input.sourceCount ?? 0));
  const level = (input.documentationLevel || "").toLowerCase();

  const lowBase = articles <= 1 || sources <= 1 || level === "insufficient";

  if (lowBase) {
    return {
      isLowBase: true,
      label: "Υψηλό αρχικό σήμα · χαμηλή βάση τεκμηρίωσης",
      tone: "low_base",
      note: `Βασίζεται σε ${articlesLabel(articles)} / ${sourcesLabel(sources)}. Χρειάζεται περισσότερη τεκμηρίωση πριν θεωρηθεί κορυφαίο θέμα.`,
    };
  }

  if (level === "strong" || level === "high") {
    return { isLowBase: false, label: "Ισχυρή τεκμηρίωση", tone: "strong", note: "Πολλαπλές ανεξάρτητες πηγές." };
  }
  if (level === "medium") {
    return { isLowBase: false, label: "Μεσαία τεκμηρίωση", tone: "medium", note: "Επαρκής αλλά όχι ισχυρή τεκμηρίωση." };
  }
  return { isLowBase: false, label: "Αρχική τεκμηρίωση", tone: "initial", note: "Πρώιμη βάση δεδομένων· υπό ενίσχυση." };
}

/** Tailwind classes ανά tone — ευθυγραμμισμένα με το υπάρχον dark cockpit. */
export function evidenceToneClass(tone: DocTone): string {
  switch (tone) {
    case "strong":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "medium":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "low_base":
      return "border-orange-500/30 bg-orange-500/10 text-orange-300";
    case "insufficient":
      return "border-red-500/30 bg-red-500/10 text-red-300";
    default:
      return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  }
}

/* ---------------------------------------------------------------------------
 * Generic topic vs specific situation title.
 * ------------------------------------------------------------------------- */

const GENERIC_TOPICS = new Set(
  [
    "κοινωνία",
    "οικονομία",
    "πολιτική",
    "υγεία",
    "παιδεία",
    "εκπαίδευση",
    "περιβάλλον",
    "εξωτερικά",
    "δικαιοσύνη",
    "ασφάλεια",
    "μετανάστευση",
    "εργασία",
    "ενέργεια",
    "αθλητισμός",
    "πολιτισμός",
    "τεχνολογία",
    "γενικά",
    "λοιπά",
    "άλλο",
    "other",
  ].map((s) => s.toLowerCase())
);

/** true αν το string είναι απλή κατηγορία (π.χ. «Κοινωνία») και όχι πραγματικό situation title. */
export function isGenericTopic(title?: string | null): boolean {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  if (!t) return true;
  // Μονολεκτικό + στη λίστα κατηγοριών => generic.
  return GENERIC_TOPICS.has(t) || (t.split(/\s+/).length === 1 && GENERIC_TOPICS.has(t));
}

/**
 * Τι να δείξει το UI ως τίτλο.
 * Αν υπάρχει συγκεκριμένο situation title -> δείξ' το.
 * Αν είναι generic -> δείξ' το ως κατηγορία, όχι ως «κατάσταση».
 */
export function displayTitle(title?: string | null): { text: string; isCategory: boolean } {
  const raw = (title || "").trim();
  if (!raw) return { text: "Άτιτλη κατάσταση", isCategory: false };
  if (isGenericTopic(raw)) {
    return { text: `Κατηγορία · ${raw}`, isCategory: true };
  }
  return { text: raw, isCategory: false };
}

/* ---------------------------------------------------------------------------
 * Sparkline trend gate.
 * Δείχνουμε «τάση» μόνο όταν υπάρχει ιστορικό. Αλλιώς, flat baseline.
 * ------------------------------------------------------------------------- */

/** Έχουμε αρκετά σημεία ιστορικού για να δείξουμε αξιόπιστη τάση; */
export function hasTrendHistory(history?: Array<number> | null, minPoints = 3): boolean {
  return Array.isArray(history) && history.filter((v) => Number.isFinite(v)).length >= minPoints;
}

/** Καθαρό μήνυμα όταν δεν υπάρχει ιστορικό (για aria-label / tooltip). */
export const NO_HISTORY_NOTE = "Δεν υπάρχει ακόμη ιστορικό τάσης· εμφανίζεται σταθερή βάση.";
