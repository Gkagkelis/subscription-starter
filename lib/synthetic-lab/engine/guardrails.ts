// ============================================================
// Όρια του Lab.
//
// Πολιτικές, εκλογικές και κοινωνικές έρευνες υποστηρίζονται πλήρως, όπως η έρευνα
// αγοράς: πρόθεση ψήφου, κόμματα, πολιτικά πρόσωπα, αυτοτοποθέτηση αριστερά–δεξιά,
// δοκιμή μηνυμάτων. Μένουν μόνο δύο κανόνες, που δεν περιορίζουν την έρευνα:
//  1. Κάθε αποτέλεσμα σημαίνεται ως συνθετική προσομοίωση. Δεν είναι δημοσκόπηση
//     και δεν δημοσιεύεται ως δημοσκόπηση (ν. 3603/2007).
//  2. Δεν υποστηρίζεται αποθάρρυνση συμμετοχής στις εκλογές ή παραπληροφόρηση για
//     τη διαδικασία ψηφοφορίας (πότε, πού, πώς ψηφίζει κανείς).
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


// Αποθάρρυνση συμμετοχής / παραπληροφόρηση για τη διαδικασία ψηφοφορίας. Ελέγχεται η ΠΡΟΘΕΣΗ
// (α' πληθυντικό / οδηγίες), όχι το θέμα: η έρευνα για την αποχή ή την παραπληροφόρηση επιτρέπεται.
const SUPPRESSION_PATTERNS: RegExp[] = [
  /(αποθαρρυν|αποτρεψ|εμποδισ|πεισ)(ουμε|ετε|ω)[^.?!]{0,80}(να μην ψηφισ|απο το να ψηφισ|απο την ψηφο|να απεχ|μακρια απο τισ καλπ)/,
  /(να|ωστε να) μην (πανε|παει) (να ψηφισ|στισ καλπ)/,
  /(διαδωσουμε|διασπειρουμε|στειλουμε|πουμε)[^.?!]{0,60}(λαθοσ|ψευδ|παραπλανητικ)[^.?!]{0,40}(ημερομηνια|εκλογικο τμημα|τροπο|διαδικασια)[^.?!]{0,20}(ψηφ|εκλογ)/,
  /\bvoter suppression (campaign|tactic|strateg)/,
  /how (to|can we|do we|should we) (discourage|stop|prevent|suppress|deter)\b[^.?!]{0,60}\bvot/,
  /(spread|send|tell)[^.?!]{0,40}(false|fake|wrong|misleading)[^.?!]{0,30}(election date|polling (place|station)|voting (date|procedure|location))/
];

/** Πολιτικό/εκλογικό περιεχόμενο (για σήμανση, όχι για αποκλεισμό). */
export function isPoliticalContent(text: string): boolean {
  const t = norm(text);
  return (
    ELECTORAL_TERMS.some((p) => t.includes(p)) ||
    ELECTORAL_EN.test(t) ||
    PARTY_OR_LEADER_TERMS.some((p) => t.includes(p)) ||
    PARTY_ABBREV.test(t)
  );
}

/**
 * Ο κανόνας αποκλεισμού που ίσχυε έως τον Οκτώβριο 2026. Κρατιέται ΜΟΝΟ ώστε το
 * προκαταχωρισμένο benchmark να μένει συγκρίσιμο με τις προηγούμενες εκτελέσεις.
 */
export function legacyPoliticalBlock(text: string): boolean {
  const t = norm(text);
  const electoral = ELECTORAL_TERMS.some((p) => t.includes(p)) || ELECTORAL_EN.test(t);
  const mentionsParty =
    PARTY_OR_LEADER_TERMS.some((p) => t.includes(p)) || PARTY_ABBREV.test(t) || (electoral && AMBIGUOUS_PARTY.test(t));
  return electoral || mentionsParty;
}

export const SYNTHETIC_POLITICAL_NOTICE =
  'Πολιτική/εκλογική μελέτη: τα αποτελέσματα είναι συνθετική προσομοίωση, όχι δημοσκόπηση. Δεν δημοσιεύονται ως δημοσκόπηση (ν. 3603/2007).';

/** Έλεγχος ερευνητικού ερωτήματος / ερώτησης / σεναρίου. */
export function checkText(text: string, context: 'request' | 'question' | 'scenario' = 'request'): GuardrailResult {
  const t = norm(text);
  const blocked: string[] = [];
  const warnings: string[] = [];

  const suppression = SUPPRESSION_PATTERNS.some((re) => re.test(t));
  if (suppression) {
    blocked.push(
      'Το Lab δεν υποστηρίζει αποθάρρυνση συμμετοχής στις εκλογές ή παραπληροφόρηση για τη διαδικασία ψηφοφορίας. Η μελέτη συμμετοχής, πρόθεσης ψήφου και μηνυμάτων επιτρέπεται.'
    );
  }

  if (!blocked.length && isPoliticalContent(text)) {
    warnings.push(SYNTHETIC_POLITICAL_NOTICE);
  } else if (!blocked.length && context !== 'question' && /πολιτικ|μετρο|νομοσχεδι|δημοσ|δημοτ|περιφερει/.test(t)) {
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
