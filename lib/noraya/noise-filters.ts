// ============================================================
// NORAYA — Κοινα φιλτρα θορυβου τιτλων (ΜΙΑ πηγη αληθειας).
// Χρησιμοποιειται απο: situation-engine, agenda-probe (και οπου αλλου χρειαστει).
// ΠΡΟΣΟΧΗ (JS): το \w ΔΕΝ πιανει ελληνικα γραμματα — χρησιμοποιουμε [α-ωά-ώ...]
// ============================================================

const GR = "α-ωάέήίόύώϊϋΐΰ"; // ελληνικα πεζα + τονισμενα (το ς ειναι μεσα στο α-ω)

// 1) Ευαισθητα (ανηλικοι/τραγωδιες/ατομικα) — ΠΟΤΕ στην πολιτικη ατζεντα
// Σκληρα ευαισθητα: ΠΑΝΤΑ εκτος πολιτικης ατζεντας, χωρις εξαιρεση.
export const HARD_SENSITIVE_RE = /(αν[ηή]λικ|βιασμ|αποπλ[αά]ν|κακοπο[ιί]η|παιδεραστ)/i;
// Μαλακα ευαισθητα: εκτος ΕΚΤΟΣ αν υπαρχει κρατικη ευθυνη/θεσμικη διασταση
// (π.χ. ναυαγιο με ευθυνη λιμενικου, αυτοκτονια κρατουμενου, τροχαιο λογω υποδομων).
export const SOFT_SENSITIVE_RE = /(εξαφ[αά]νι|αγνο[οό]?[υύ]μεν|αυτοκτον|απαγωγ|πνιγμ|τροχα[ιί]ο)/i;
// Κρατικη ευθυνη / θεσμικη διασταση
export const STATE_RESPONSIBILITY_RE =
  /(κρατικ|κυβ[εέ]ρν|υπουργ|αστυνομ|ΕΛ\.?ΑΣ|λιμενικ|πυροσβεστ|πολιτικ[ηή] προστασ[ιί]|δημ[οό]σι|υποδομ|αμ[εέ]λει|ευθ[υύ]ν|επιθεωρ|εποπτε[ιί]|κρατο[υύ]μεν|φυλακ|νοσοκομε[ιί]|ΟΣΕ|hellenic train|σιδηροδρομ|εκτροχ|πολιτικ[ηή] θ[υύ]ελλα|πολιτικ[εέ]ς αντιδρ[αά]σεις)/i;

export function isSensitiveEvent(title?: string | null): boolean {
  const t = String(title || "");
  if (HARD_SENSITIVE_RE.test(t)) return true;
  return SOFT_SENSITIVE_RE.test(t) && !STATE_RESPONSIBILITY_RE.test(t);
}

// 2) Ξενα εταιρικα/διεθνη οικονομικα ΧΩΡΙΣ ελληνικη αναφορα
export const FOREIGN_NOISE_RE =
  /(microsoft|google|amazon|\bapple\b|\bmeta\b|tesla|nvidia|openai|samsung|\bintel\b|boeing|volkswagen|\bbmw\b|mercedes|toyota|nasdaq|dow jones|wall street|silicon valley|federal reserve|γερμανικ[ήη][^.]{0,25}(αυτοκινητο|βιομηχαν)|κινεζικ[ήη][^.]{0,25}(ανταγωνισ|βιομηχαν|αυτοκινητο))/i;
export const GREEK_CONTEXT_RE =
  /(ελλ[αά]δ|ελληνικ|αθ[ηή]ν|θεσσαλον|κυβ[εέ]ρν|βουλ[ήη]|υπουργ|μητσοτ[αά]κ|ΕΛΑΣ|ΠΑΣΟΚ|ΣΥΡΙΖΑ|ΚΚΕ|τσ[ιί]πρα|ανδρουλ[αά]κ)/i;
export function isForeignNoise(title?: string | null): boolean {
  const t = String(title || "");
  return FOREIGN_NOISE_RE.test(t) && !GREEK_CONTEXT_RE.test(t);
}

// 3) Εμπορικος/καταναλωτικος θορυβος (εκπτωσεις κ.λπ.) — ΕΚΤΟΣ αν εχει σαφως πολιτικη αναφορα
export const COMMERCIAL_NOISE_RE = new RegExp(
  "((θεριν|χειμεριν|ενδιαμεσ)[" + GR + "]*\\s+εκπτ[ωώ]σε|εκπτ[ωώ]σεις\\s+(ξεκιν|αρχιζ|λ[ηή]γ)|black friday|cyber monday|εκπτωσιακ)",
  "i",
);
export const POLITICAL_CONTEXT_RE =
  /(φ[οό]ρο|φορολογ|κυβ[εέ]ρν|υπουργ|νομοσχ[εέ]δι|επ[ιί]δομ|βουλ[ηή]|πρωθυπουργ|μητσοτ[αά]κ)/i;
export function isCommercialNoise(title?: string | null): boolean {
  const t = String(title || "");
  return COMMERCIAL_NOISE_RE.test(t) && !POLITICAL_CONTEXT_RE.test(t);
}

// 4) Εσωτερικη πολιτικη ΞΕΝΩΝ χωρων — ΕΚΤΟΣ αν: Τουρκια/ελληνοτουρκικα,
//    αποφασεις ΕΕ/ΝΑΤΟ που δεσμευουν την Ελλαδα, ή ρητη αναφορα στην Ελλαδα.
export const FOREIGN_POLITICS_RE =
  /(στ[αά]ρμερ|starmer|μακρ[οό]ν|σολτς|\bμερτς|βρεταν|ηνωμ[εέ]νο βασ[ιί]λειο|γαλλικ[ηή] κυβ[εέ]ρν|γερμανικ[ηή] κυβ[εέ]ρν|ιταλικ[ηή] κυβ[εέ]ρν|ισπανικ|πολωνικ|ολλανδικ|λευκ[οό]ς ο[ιί]κος|αμερικανικ[εέ]ς εκλογ|ουκραν|ζελ[εέ]νσκ|πο[υύ]τιν|κυβ[εέ]ρνησης (της )?(ουκραν|ρωσ|βρεταν|γαλλ|γερμαν)|πρωθυπουργ[οό]ς (της )?(βρεταν|γαλλ|γερμαν|ιταλ|ισπαν|ουκραν))/i;
export const GREEK_STAKE_RE = new RegExp(
  "(ελλ[αά]δ|ελλην|ελληνοτουρκ|τουρκ|ερντογ[αά]ν|κ[υύ]προ|αιγα[ιί]|casus belli|μητσοτ[αά]κ|ευρωπαϊκ[οό] συμβο[υύ]λιο|σ[υύ]νοδο[ςυ]? κορυφ[ηή]ς|αποφ[αά]σ[" + GR + "]* (ΕΕ|νατο)|δασμ)",
  "i",
);
export function isForeignPolitics(title?: string | null): boolean {
  const t = String(title || "");
  return FOREIGN_POLITICS_RE.test(t) && !GREEK_STAKE_RE.test(t);
}

// Συνδυαστικο: true = ΚΟΒΕΤΑΙ απο την πολιτικη ατζεντα
export function isNoiseTitle(title?: string | null): boolean {
  return isSensitiveEvent(title) || isForeignNoise(title) || isCommercialNoise(title) || isForeignPolitics(title);
}

// 5) Πολιτικος καταλυτης: οταν το γεγονος εμπλεκει πρωθυπουργο/υπουργους/αρχηγους/Βουλη,
//    ειναι η στιγμη που το επιτελειο ΠΡΕΠΕΙ να το δει — μικρο, σταθερο boost.
export const POLITICAL_CATALYST_RE =
  /(πρωθυπουργ|μητσοτ[αά]κ|υπουργ|κυβ[εέ]ρνησ|τσ[ιί]πρα|ανδρουλ[αά]κ|φ[αά]μελλ|κουτσο[υύ]μπα|βελ[οό]πουλ|κ[οό]μμα\b|βουλ[ηή]|κοινοβουλ|αντιπολ[ιί]τευσ|πολιτικ[ηή] θ[υύ]ελλα|πολιτικ[εέ]ς αντιδρ[αά]σεις)/i;
const FOREIGN_HINT_RE =
  /(ουκραν|ζελ[εέ]νσκ|πο[υύ]τιν|ρωσ[ιί]|βρεταν|γαλλ[ιί]|γερμαν[ιί]|ιταλ[ιί]|ισπαν[ιί]|πολων|ολλανδ|αμερικαν|ΗΠΑ|λευκ[οό]ς ο[ιί]κος|τουρκικ[ηή] κυβ[εέ]ρν|ερντογ[αά]ν)/i;
export function politicalCatalystBoost(title?: string | null): number {
  const t = String(title || "");
  if (!POLITICAL_CATALYST_RE.test(t)) return 0;
  // Το boost αφορα ΕΛΛΗΝΙΚΗ πολιτικη εμπλοκη — οχι ξενους πρωθυπουργους/κυβερνησεις.
  if (FOREIGN_HINT_RE.test(t) && !/(μητσοτ[αά]κ|τσ[ιί]πρα|ανδρουλ[αά]κ|φ[αά]μελλ|κουτσο[υύ]μπα|βελ[οό]πουλ|ελλ[αά]δ|ελλην)/i.test(t)) return 0;
  return 8;
}

// 6) ΚΡΑΤΙΚΗ ΛΟΓΟΔΟΣΙΑ: ανθρωπινο κοστος (θανατοι/τραυματισμοι/καταστροφες) ΜΕ κρατικη
//    ευθυνη/αμελεια = παντα πρωτης γραμμης πολιτικο θεμα. Καλυπτει: αστυνομικη βια,
//    σιδηροδρομικα, ναυαγια, πυρκαγιες/πλημμυρες, καταρρευσεις, εργατικα, κρατουμενους, blackout.
export const HUMAN_COST_RE =
  /(θ[αά]νατ|νεκρ|τραυματ|δυστ[υύ]χημ|ναυ[αά]γ|πνιγμ|πυρκαγι|φωτι[αά]|πλημμ[υύ]ρ|εκτροχ|σ[υύ]γκρουση τρ[εέ]ν|καταρρε[υύ]σ|ασφυξ|black ?out|διακοπ[ηή] ρε[υύ]ματος|εγκλωβισμ|πυροβολισμ)/i;
export function stateAccountabilityBoost(title?: string | null): number {
  const t = String(title || "");
  if (HARD_SENSITIVE_RE.test(t)) return 0; // παιδικα/σεξουαλικα: ποτε στην ατζεντα
  return HUMAN_COST_RE.test(t) && STATE_RESPONSIBILITY_RE.test(t) ? 14 : 0;
}
