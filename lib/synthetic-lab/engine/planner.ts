// ============================================================
// Planner: από φυσική γλώσσα σε προτεινόμενο σχέδιο έρευνας (κανόνες,
// χωρίς AI). Ο χρήστης βλέπει και εγκρίνει/αλλάζει το σχέδιο πριν την
// εκτέλεση (Βήμα 4 του wizard).
// ============================================================

import type { AudienceFilter, Question, ResearchDomain, StudyKind, StudyPlan } from '../types';
import { defaultAssumptions } from './assumptions';
import { checkText } from './guardrails';

export const PLANNER_VERSION = 'rules-1.0';

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ');
}

const CONSUMER_HINTS = ['προιον', 'υπηρεσι', 'τιμη', '€', 'ευρω', 'συνδρομ', 'προγραμμα κινητ', 'κινητη', 'εφαρμογ', 'μαρκα', 'αγορα', 'πελατ', 'πακετο', 'καταστημ', 'μηνα', 'eshop', 'app'];
const POLICY_HINTS = ['μετρο', 'πολιτικ', 'δημο', 'περιφερει', 'νομο', 'επιδομ', 'κρατ', 'δημοσι', 'υπουργ', 'κοινων', 'πολιτ', 'ρυθμισ', 'φορο', 'στεγαστ'];

/** Θέμα πολιτικής -> δείκτης NORAYA/Eurobarometer για εμπειρική σύνδεση. */
const POLICY_TOPICS: { metric: string; label: string; keys: string[] }[] = [
  { metric: 'issue_country_housing', label: 'η στέγαση', keys: ['στεγ', 'ενοικ', 'κατοικι', 'σπιτ', 'ακινητ'] },
  { metric: 'issue_country_inflation', label: 'η ακρίβεια', keys: ['ακριβει', 'πληθωρισμ', 'τιμεσ', 'κοστοσ ζωησ', 'ενεργει', 'ρευμα'] },
  { metric: 'issue_country_unemployment', label: 'η ανεργία', keys: ['ανεργ', 'απασχολησ', 'θεσεισ εργασιασ'] },
  { metric: 'issue_country_health', label: 'η υγεία', keys: ['υγει', 'νοσοκομ', 'εσυ', 'γιατρ'] },
  { metric: 'issue_country_immigration', label: 'η μετανάστευση', keys: ['μεταναστ', 'προσφυγ'] },
  { metric: 'issue_country_crime_security', label: 'η εγκληματικότητα', keys: ['εγκλημ', 'ασφαλει', 'αστυνομ'] },
  { metric: 'issue_country_environment_climate', label: 'το περιβάλλον και το κλίμα', keys: ['περιβαλλ', 'κλιμα', 'πυρκαγι', 'ανακυκλ', 'ρυπανσ'] }
];

export function detectDomain(text: string): ResearchDomain {
  const t = norm(text);
  const c = CONSUMER_HINTS.filter((k) => t.includes(norm(k))).length;
  const p = POLICY_HINTS.filter((k) => t.includes(norm(k))).length;
  return p > c ? 'social_policy' : 'consumer';
}

export function extractPrice(text: string): number | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(€|ευρώ|ευρω|eur\b|euro)/i) || text.match(/€\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function detectPolicyTopic(text: string) {
  const t = norm(text);
  return POLICY_TOPICS.find((x) => x.keys.some((k) => t.includes(k))) || null;
}

function conceptFromText(text: string): string {
  const cleaned = text
    .trim()
    .replace(/^(θέλω|θελω|θα ήθελα|θα ηθελα)\s+(να\s+)?(δοκιμάσω|δοκιμασω|ελέγξω|ελεγξω|ερευνήσω|ερευνησω|αξιολογήσω|αξιολογησω|μάθω|μαθω|εξετάσω|εξετασω)\s+/i, '')
    .replace(/[.!]+$/, '');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function pricePoints(p: number): number[] {
  const r = (x: number) => (x >= 20 ? Math.round(x) : Math.round(x * 2) / 2);
  return Array.from(new Set([0.6, 0.8, 1, 1.2, 1.4].map((f) => r(p * f)))).sort((a, b) => a - b);
}

const INTENT_SCALE = ['Σίγουρα όχι', 'Μάλλον όχι', 'Ίσως', 'Μάλλον ναι', 'Σίγουρα ναι'];
const INTEREST_SCALE = ['Καθόλου', 'Λίγο', 'Μέτρια', 'Αρκετά', 'Πάρα πολύ'];
const OBJECTIONS = ['Η τιμή', 'Δέσμευση / συμβόλαιο', 'Αμφιβολίες για την ποιότητα', 'Είμαι ικανοποιημένος/η με ό,τι έχω', 'Δεν το χρειάζομαι', 'Χρειάζομαι περισσότερες πληροφορίες'];

export function consumerQuestions(concept: string, price: number | null): Question[] {
  const qs: Question[] = [
    { id: 'q1', type: 'concept_test', text: `Πόσο σας ενδιαφέρει: «${concept}»;`, scale: INTEREST_SCALE },
    { id: 'q2', type: 'likert', text: 'Πόσο πιθανό είναι να το αγοράσετε ή να εγγραφείτε μέσα στους επόμενους 3 μήνες;', scale: INTENT_SCALE }
  ];
  if (price) {
    qs.push({ id: 'q3', type: 'price_test', text: 'Σε ποιες από τις παρακάτω μηνιαίες τιμές θα το αγοράζατε;', pricePoints: pricePoints(price) });
    qs.push({ id: 'q4', type: 'single_choice', text: `Η τιμή των ${price}€ σας φαίνεται:`, options: ['Πολύ φθηνή', 'Λογική', 'Ακριβή', 'Πολύ ακριβή'] });
  }
  qs.push(
    { id: 'q5', type: 'multiple_choice', text: 'Τι θα σας έκανε να διστάσετε; (έως 3)', options: OBJECTIONS, maxSelections: 3 },
    {
      id: 'q6',
      type: 'single_choice',
      text: 'Ποιος είναι ο κύριος λόγος που μάλλον δεν θα το επιλέγατε;',
      options: OBJECTIONS,
      followUpOf: { questionId: 'q2', whenAnswerIn: ['Σίγουρα όχι', 'Μάλλον όχι'] }
    },
    { id: 'q7', type: 'open_ended', text: 'Τι θα βελτιώνατε ή τι σας προβληματίζει περισσότερο;' }
  );
  return qs;
}

export function policyQuestions(policy: string, topic: ReturnType<typeof detectPolicyTopic>): Question[] {
  const qs: Question[] = [];
  if (topic) {
    qs.push({
      id: 'q1',
      type: 'single_choice',
      text: `Θεωρείτε ότι ${topic.label} είναι από τα σημαντικότερα προβλήματα της χώρας σήμερα;`,
      options: ['Ναι', 'Όχι'],
      evidenceLink: { datasetId: 'noraya-public-opinion', metric: topic.metric, positiveOption: 'Ναι' }
    });
  }
  qs.push(
    {
      id: 'q2',
      type: 'single_choice',
      text: 'Γενικά, τείνετε να εμπιστεύεστε την εθνική κυβέρνηση ως θεσμό;',
      options: ['Τείνω να εμπιστεύομαι', 'Τείνω να μην εμπιστεύομαι'],
      evidenceLink: { datasetId: 'noraya-public-opinion', metric: 'trust_national_government', positiveOption: 'Τείνω να εμπιστεύομαι' }
    },
    { id: 'q3', type: 'likert', text: `Σε ποιο βαθμό θα υποστηρίζατε: «${policy}»;`, scale: ['Καθόλου', 'Λίγο', 'Ουδέτερα', 'Αρκετά', 'Πολύ'] },
    {
      id: 'q4',
      type: 'likert',
      text: 'Πώς πιστεύετε ότι θα επηρέαζε το δικό σας νοικοκυριό;',
      scale: ['Πολύ αρνητικά', 'Αρνητικά', 'Καθόλου', 'Θετικά', 'Πολύ θετικά']
    },
    {
      id: 'q5',
      type: 'multiple_choice',
      text: 'Τι σας προβληματίζει περισσότερο σε ένα τέτοιο μέτρο; (έως 3)',
      options: ['Κόστος για τον κρατικό προϋπολογισμό', 'Δικαιοσύνη στην κατανομή', 'Αν θα είναι αποτελεσματικό', 'Γραφειοκρατία στην εφαρμογή', 'Δεν με αφορά', 'Χρειάζομαι περισσότερη πληροφόρηση'],
      maxSelections: 3
    },
    { id: 'q6', type: 'open_ended', text: 'Τι θα αλλάζατε στο μέτρο ώστε να είναι πιο δίκαιο ή πιο αποτελεσματικό;' }
  );
  return qs;
}

export function focusGuide(domain: ResearchDomain, concept: string): string[] {
  return domain === 'consumer'
    ? [
        `Πρώτη εντύπωση: τι σκέφτεστε όταν ακούτε «${concept}»;`,
        'Τι θα σας έπειθε να το δοκιμάσετε και τι θα σας απέτρεπε;',
        'Πώς συγκρίνεται με ό,τι χρησιμοποιείτε σήμερα;',
        'Αν μπορούσατε να αλλάξετε ένα πράγμα, ποιο θα ήταν;'
      ]
    : [
        `Πρώτη αντίδραση στην πρόταση: «${concept}».`,
        'Ποιους πιστεύετε ότι θα ωφελούσε και ποιους θα επιβάρυνε;',
        'Τι θα χρειαζόταν για να λειτουργήσει στην πράξη;',
        'Τι θα αλλάζατε για να είναι πιο δίκαιο;'
      ];
}

export interface PlanRequest {
  text: string;
  kind?: StudyKind;
  domain?: ResearchDomain;
  audience?: AudienceFilter;
  sampleSize?: number;
}

export interface PlanResult {
  plan: StudyPlan | null;
  blocked: boolean;
  blockedReasons: string[];
  suggestions: { guide?: string[] };
}

export function planStudy(req: PlanRequest): PlanResult {
  const text = (req.text || '').trim();
  const guard = checkText(text, 'request');
  if (!guard.allowed) return { plan: null, blocked: true, blockedReasons: guard.blockedReasons, suggestions: {} };
  const domain = req.domain || detectDomain(text);
  const kind = req.kind || 'survey';
  const concept = conceptFromText(text);
  const price = domain === 'consumer' ? extractPrice(text) : null;
  const topic = domain === 'social_policy' ? detectPolicyTopic(text) : null;
  const questions = domain === 'consumer' ? consumerQuestions(concept, price) : policyQuestions(concept, topic);
  const warnings = [...guard.warnings];
  if (domain === 'consumer' && !price) warnings.push('Δεν εντοπίστηκε τιμή — η ερώτηση τιμής παραλείφθηκε. Πρόσθεσέ τη αν χρειάζεται.');
  if (domain === 'consumer') warnings.push('Δεν υπάρχουν ελληνικά καταναλωτικά δεδομένα στο Lab: οι απαντήσεις βασίζονται σε δημογραφικά + ρητές παραδοχές, όχι σε μετρημένες προτιμήσεις.');
  if (domain === 'social_policy' && !topic) warnings.push('Το θέμα δεν αντιστοιχίστηκε σε δείκτη Eurobarometer· μόνο η ερώτηση εμπιστοσύνης έχει εμπειρική βάση.');
  const plan: StudyPlan = {
    domain,
    kind,
    title: concept.length > 80 ? concept.slice(0, 77) + '…' : concept,
    researchQuestion: text,
    questions,
    assumptions: defaultAssumptions(domain, price),
    audience: req.audience || { minAge: 15 },
    sampleSize: req.sampleSize || 500,
    warnings,
    plannerVersion: PLANNER_VERSION,
    plannerMode: 'rules'
  };
  return { plan, blocked: false, blockedReasons: [], suggestions: { guide: focusGuide(domain, concept) } };
}
