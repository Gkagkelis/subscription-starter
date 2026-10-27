// ============================================================
// Πολιτικά και μεθοδολογικά όρια του Lab.
//
// Το Lab ΔΕΝ υποστηρίζει:
//  - πρόθεση ψήφου / εκλογικές προβλέψεις / "δημοσκοπήσεις"
//  - αξιολόγηση κομμάτων ή πολιτικών προσώπων
//  - στοχευμένη εκλογική πειθώ, κατάταξη ή χειραγώγηση ψηφοφόρων
// Επιτρέπει ουδέτερη διερεύνηση κοινωνικών ζητημάτων και δημόσιων πολιτικών.
// ============================================================

export interface GuardrailResult {
  allowed: boolean;
  blockedReasons: string[];
  warnings: string[];
}

function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ');
}

// Κόμματα / πρόσωπα που εμφανίζονται στα δεδομένα NORAYA και συνήθη ονόματα.
const PARTY_OR_LEADER_TERMS = [
  'νεα δημοκρατια', 'συριζα', 'πασοκ', 'κιναλ', 'ελληνικη λυση', 'μερα25', 'μερα 25',
  'πλευση ελευθεριασ', 'χρυση αυγη', 'ενωση κεντρωων', 'σπαρτιατεσ',
  'νεα αριστερα', 'μητσοτακ', 'τσιπρα', 'ανδρουλακ', 'κουτσουμπα', 'βελοπουλ',
  'κασσελακ', 'φαμελλ', 'βαρουφακ', 'κωνσταντοπουλου', 'new democracy', 'syriza', 'pasok'
];
// Σύντομα ονόματα/αρκτικόλεξα που είναι και κοινές λέξεις (π.χ. «νίκη», «ελπίδα»,
// «ποτάμι») ελέγχονται ΜΟΝΟ ως ολόκληρες λέξεις και μόνο μαζί με εκλογικό πλαίσιο.
const PARTY_ABBREV = /(^|[^a-zα-ω])(νδ|nd|κκε|ανελ|ελασ)([^a-zα-ω]|$)/;
const AMBIGUOUS_PARTY = /(^|[^a-zα-ω])(νικη|ελπιδα|ποταμι)([^a-zα-ω]|$)/;

const ELECTORAL_TERMS = [
  'προθεση ψηφου', 'θα ψηφισ', 'ψηφισατε', 'ψηφισει', 'ψηφοφορ', 'εκλογικ', 'εκλογεσ', 'εκλογη', 'δημοσκοπησ',
  'κομμα', 'υποψηφι', 'αναποφασιστ', 'πρωθυπουργ'
];
const ELECTORAL_EN = /\b(vote intention|voting|voters?|elections?|electoral|polls?|polling|candidates?|swing voters?)\b/;

const PERSUASION_TERMS = [
  'πεισουμε', 'να πεισω', 'να πεισει', 'πειθω', 'πειθουσ', 'μηνυμα για ψηφοφορ', 'στοχευση ψηφοφορ',
  'στοχευμεν', 'microtarget', 'micro-target', 'χειραγωγ', 'αποτρεψουμε να ψηφισ', 'κερδισουμε τισ εκλογ',
  'να αλλαξουν ψηφο', 'persuade', 'manipulat', 'targeting voters'
];

/** Έλεγχος ερευνητικού ερωτήματος / ερώτησης / σεναρίου. */
export function checkText(text: string, context: 'request' | 'question' | 'scenario' = 'request'): GuardrailResult {
  const t = norm(text);
  const blocked: string[] = [];
  const warnings: string[] = [];

  const electoral = ELECTORAL_TERMS.some((p) => t.includes(p)) || ELECTORAL_EN.test(t);
  const mentionsParty =
    PARTY_OR_LEADER_TERMS.some((p) => t.includes(p)) || PARTY_ABBREV.test(t) || (electoral && AMBIGUOUS_PARTY.test(t));
  const persuasion = PERSUASION_TERMS.some((p) => t.includes(p));

  if (persuasion && (electoral || mentionsParty)) {
    blocked.push(
      'Το Lab δεν υποστηρίζει σχεδιασμό εκλογικής πειθούς, στοχευμένων πολιτικών μηνυμάτων ή χειραγώγησης ψηφοφόρων.'
    );
  }
  if (mentionsParty) {
    blocked.push(
      'Οι προσομοιώσεις δεν αφορούν κόμματα ή πολιτικά πρόσωπα. Διατύπωσε το θέμα ως ουδέτερη δημόσια πολιτική (π.χ. «μέτρο για τη στέγαση των νέων»).'
    );
  }
  if (electoral && !mentionsParty) {
    blocked.push(
      'Οι συνθετικές απαντήσεις δεν είναι δημοσκόπηση και δεν χρησιμοποιούνται για πρόθεση ψήφου ή εκλογικές προβλέψεις.'
    );
  }

  if (!blocked.length && context !== 'question' && /πολιτικ|μετρο|νομοσχεδι|δημοσ|δημοτ|περιφερει/.test(t)) {
    warnings.push(
      'Θέμα δημόσιας πολιτικής: τα αποτελέσματα είναι υποθετικές συνθετικές αντιδράσεις, όχι μέτρηση της κοινής γνώμης.'
    );
  }

  return { allowed: blocked.length === 0, blockedReasons: Array.from(new Set(blocked)), warnings };
}

/** Έλεγχος ολόκληρου ερωτηματολογίου. */
export function checkQuestionnaire(
  researchQuestion: string,
  questions: { text: string; options?: string[] }[]
): GuardrailResult {
  const parts = [checkText(researchQuestion, 'request')];
  for (const q of questions) parts.push(checkText([q.text, ...(q.options || [])].join(' '), 'question'));
  const blocked = Array.from(new Set(parts.flatMap((p) => p.blockedReasons)));
  const warnings = Array.from(new Set(parts.flatMap((p) => p.warnings)));
  return { allowed: blocked.length === 0, blockedReasons: blocked, warnings };
}
