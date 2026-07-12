// ============================================================
// NORAYA — Κοινα φιλτρα θορυβου τιτλων (ΜΙΑ πηγη αληθειας).
// Χρησιμοποιειται απο: situation-engine, agenda-probe (και οπου αλλου χρειαστει).
// ΠΡΟΣΟΧΗ (JS): το \w ΔΕΝ πιανει ελληνικα γραμματα — χρησιμοποιουμε [α-ωά-ώ...]
// ============================================================

const GR = "α-ωάέήίόύώϊϋΐΰ"; // ελληνικα πεζα + τονισμενα (το ς ειναι μεσα στο α-ω)

// 1) Ευαισθητα (ανηλικοι/τραγωδιες/ατομικα) — ΠΟΤΕ στην πολιτικη ατζεντα
export const SENSITIVE_EVENT_RE =
  /(αν[ηή]λικ|εξαφ[αά]νι|αγνο[οό]?[υύ]μεν|βιασμ|αποπλ[αά]ν|κακοπο[ιί]η|παιδεραστ|αυτοκτον|απαγωγ|πνιγμ|τροχα[ιί]ο)/i;
export function isSensitiveEvent(title?: string | null): boolean {
  return SENSITIVE_EVENT_RE.test(String(title || ""));
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
  /(στ[αά]ρμερ|starmer|μακρ[οό]ν|σολτς|\bμερτς|βρεταν|ηνωμ[εέ]νο βασ[ιί]λειο|γαλλικ[ηή] κυβ[εέ]ρν|γερμανικ[ηή] κυβ[εέ]ρν|ιταλικ[ηή] κυβ[εέ]ρν|ισπανικ|πολωνικ|ολλανδικ|λευκ[οό]ς ο[ιί]κος|αμερικανικ[εέ]ς εκλογ|πρωθυπουργ[οό]ς (της )?(βρεταν|γαλλ|γερμαν|ιταλ|ισπαν))/i;
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
export function politicalCatalystBoost(title?: string | null): number {
  return POLITICAL_CATALYST_RE.test(String(title || "")) ? 8 : 0;
}
