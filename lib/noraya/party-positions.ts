// ============================================================
// NORAYA — Θεσεις κομματων στην πολιτικη πυξιδα (benchmark)
// Αξονες: economic -10 (Αριστερα) .. +10 (Δεξια)
//         social   -10 (Φιλελευθερος/GAL) .. +10 (Συντηρητικος/TAN)
//
// ΠΗΓΗ / ΑΞΙΟΠΙΣΤΙΑ:
//   Θεσεις συνεπεις με το Chapel Hill Expert Survey (lrecon/galtan)
//   + ερευνα NORAYA 2026 για τα νεα κομματα (ΕΛΑΣ, Ελπιδα, κ.λπ.).
//   Μετατροπη CHES: economic = (lrecon-5)*2 · social = (galtan-5)*2.
//   *** Οταν κατεβασεις το επισημο CHES dataset, αντικατεστησε τα
//       economic/social εδω με τις ακριβεις τιμες (ιδια κλιμακα). ***
// ============================================================

export interface PartyPos {
  key: string;
  name: string;
  abbr: string;
  economic: number; // -10..+10
  social: number; // -10..+10
  color: string;
}

export const PARTY_POSITIONS: PartyPos[] = [
  { key: "nd", name: "Νεα Δημοκρατια", abbr: "ΝΔ", economic: 6, social: 4, color: "#4a90d9" },
  { key: "syriza", name: "ΣΥΡΙΖΑ", abbr: "ΣΥ", economic: -6, social: -4, color: "#e754a2" },
  { key: "pasok", name: "ΠΑΣΟΚ", abbr: "ΠΑ", economic: -1, social: -1, color: "#2bb673" },
  { key: "kke", name: "ΚΚΕ", abbr: "ΚΚΕ", economic: -9, social: 1, color: "#d64545" },
  { key: "elliniki_lysi", name: "Ελληνικη Λυση", abbr: "ΕΛ", economic: 3, social: 9, color: "#3f6fb0" },
  { key: "niki", name: "Νικη", abbr: "ΝΙ", economic: 2, social: 9, color: "#8b6db5" },
  { key: "spartiates", name: "Σπαρτιατες", abbr: "ΣΠ", economic: 2, social: 10, color: "#7a7a7a" },
  { key: "mera25", name: "ΜεΡΑ25", abbr: "ΜεΡΑ", economic: -7, social: -6, color: "#c0392b" },
  { key: "elas", name: "ΕΛΑΣ (Τσιπρα)", abbr: "ΕΛΑΣ", economic: -5, social: -4, color: "#e67e22" },
  { key: "elpida_dimokratia", name: "Ελπιδα (Καρυστιανου)", abbr: "ΕΛΠ", economic: 0, social: -1, color: "#16a085" },
];

// Μεσος Ελληνας ψηφοφορος — εκτιμηση βασει ESS (ελαφρα οικον. αριστερα,
// κοινωνικα μετρια συντηρητικος). Αντικατεστησε με ακριβη ESS aggregates.
export const AVERAGE_VOTER = { economic: -1, social: 2 };

export function euclidean(ax: number, ay: number, bx: number, by: number): number {
  return Math.round(Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2) * 10) / 10;
}

export function closestParty(economic: number, social: number): { party: PartyPos; distance: number } | null {
  let best: { party: PartyPos; distance: number } | null = null;
  for (const p of PARTY_POSITIONS) {
    const d = euclidean(economic, social, p.economic, p.social);
    if (!best || d < best.distance) best = { party: p, distance: d };
  }
  return best;
}
