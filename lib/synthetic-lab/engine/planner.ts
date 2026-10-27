// ============================================================
// Planner: από φυσική γλώσσα σε προτεινόμενο σχέδιο έρευνας (κανόνες,
// χωρίς AI). Ο χρήστης βλέπει και εγκρίνει/αλλάζει το σχέδιο πριν την
// εκτέλεση (Βήμα 4 του wizard).
// ============================================================

import type { AudienceFilter, Question, ResearchDomain, StudyKind, StudyPlan } from '../types';
import { behaviourAssumption, defaultAssumptions } from './assumptions';
import { getMetric } from '../data/noraya';
import { checkText } from './guardrails';
import { bankQuestion, suggestResearchQuestions } from './question-bank';

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

/** Θέμα καταναλωτικής έρευνας -> δείκτης συμπεριφοράς (Έρευνα ΤΠΕ ΕΛΣΤΑΤ/Eurostat). */
const CONSUMER_TOPICS: { metric: string; keys: string[] }[] = [
  { metric: 'ict_buy_telecom_online', keys: ['κινητ', 'internet', 'ιντερνετ', 'συνδεσ', 'τηλεφων', 'data', 'καρτοκινητ', 'mobile', 'ινες', 'fiber'] },
  { metric: 'ict_sub_video_streaming', keys: ['streaming', 'netflix', 'σειρ', 'ταινι', 'αθλητικ καναλ', 'τηλεορασ', 'disney', 'video'] },
  { metric: 'ict_sub_music_streaming', keys: ['μουσικ', 'spotify', 'podcast'] },
  { metric: 'ict_food_delivery', keys: ['φαγητ', 'delivery', 'ντελιβερ', 'εστιατορ', 'wolt', 'efood', 'παραγγελια φαγ'] },
  { metric: 'ict_groceries_online', keys: ['σουπερ', 'τροφιμ', 'λαχανικ', 'φρουτ', 'παντοπωλ', 'ψωνια', 'μαναβ'] },
  { metric: 'ict_clothes_online', keys: ['ρουχ', 'παπουτσ', 'μοδα', 'ενδυσ', 'αξεσουαρ'] },
  { metric: 'ict_tickets_online', keys: ['εισιτηρι', 'συναυλι', 'θεατρ', 'εκδηλωσ', 'φεστιβαλ'] },
  { metric: 'ict_accommodation_online', keys: ['ξενοδοχ', 'διαμον', 'ταξιδ', 'airbnb', 'καταλυμ', 'διακοπ'] },
  { metric: 'ict_medicine_online', keys: ['φαρμακ', 'βιταμιν', 'συμπληρωμ'] },
  { metric: 'ict_sub_news', keys: ['εφημεριδ', 'ειδησ', 'περιοδικ', 'news'] },
  { metric: 'ict_sub_health_app', keys: ['γυμναστ', 'fitness', 'ασκησ', 'διατροφ εφαρμογ', 'wellness app'] },
  { metric: 'ict_electronics_online', keys: ['υπολογιστ', 'tablet', 'laptop', 'κινητο τηλεφωνο', 'smartphone', 'ηλεκτρονικ συσκευ'] },
  { metric: 'ict_cosmetics_online', keys: ['καλλυντικ', 'ομορφι', 'περιποιησ'] },
  { metric: 'ict_buy_utilities_online', keys: ['ρευμα', 'ηλεκτρικ ενεργ', 'νερο', 'θερμανσ', 'φυσικο αεριο'] }
];

export function detectConsumerTopics(text: string): string[] {
  const t = norm(text);
  return CONSUMER_TOPICS.filter((x) => x.keys.some((k) => t.includes(norm(k)))).map((x) => x.metric).filter((m) => !!getMetric(m));
}

/** Ερώτηση συμπεριφοράς με εμπειρική σύνδεση (Ναι/Όχι). */
function behaviourQuestion(id: string, metric: string): Question | null {
  const m = getMetric(metric);
  if (!m) return null;
  return {
    id,
    type: 'single_choice',
    text: m.question || m.label,
    options: ['Ναι', 'Όχι'],
    evidenceLink: { datasetId: m.datasetId || 'eurostat-isoc-ict', metric, positiveOption: 'Ναι' }
  };
}

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

export function consumerQuestions(concept: string, price: number | null, topics: string[] = []): Question[] {
  // Ερωτήσεις συμπεριφοράς με εμπειρική βάση (Eurostat): γενική + έως 2 θεματικές.
  const behaviour = ['ict_online_purchase_12m', ...topics.slice(0, 2)]
    .map((m, i) => behaviourQuestion(`b${i + 1}`, m))
    .filter((q): q is Question => !!q);
  const qs: Question[] = [
    ...behaviour,
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
  const consumerTopics = domain === 'consumer' ? detectConsumerTopics(text) : [];
  const questions = domain === 'consumer' ? consumerQuestions(concept, price, consumerTopics) : policyQuestions(concept, topic);
  const warnings = [...guard.warnings];
  // Ερωτήσεις πραγματικών ερευνών με θεματική επικάλυψη (π.χ. διαΝΕΟσις), αν υπάρχουν τοπικά.
  const sourced = suggestResearchQuestions(text, 2)
    .map((rq, i) => bankQuestion(rq.id, `s${i + 1}`))
    .filter((q): q is Question => !!q);
  if (sourced.length) {
    const firstUnlinked = questions.findIndex((q) => !q.evidenceLink);
    questions.splice(domain === 'consumer' ? 0 : firstUnlinked < 0 ? questions.length : firstUnlinked, 0, ...sourced);
    warnings.push(
      `Προστέθηκαν ${sourced.length} ερωτήσεις από πραγματική έρευνα (s*) με θεματική ομοιότητα — έλεγξε ότι ταιριάζουν και αφαίρεσέ τες αν όχι. Είναι δεδομένα ΜΟΝΟ ΓΙΑ ΕΡΕΥΝΗΤΙΚΗ ΧΡΗΣΗ.`
    );
  }
  if (domain === 'consumer' && !price) warnings.push('Δεν εντοπίστηκε τιμή — η ερώτηση τιμής παραλείφθηκε. Πρόσθεσέ τη αν χρειάζεται.');
  if (domain === 'consumer') {
    warnings.push(
      consumerTopics.length
        ? 'Οι ερωτήσεις συμπεριφοράς (b*) βασίζονται σε μετρημένα ποσοστά της Έρευνας ΤΠΕ ΕΛΣΤΑΤ/Eurostat. Το ενδιαφέρον για το ΝΕΟ προϊόν δεν έχει μετρηθεί: συνδέεται με τη συμπεριφορά μόνο μέσω δηλωμένης παραδοχής.'
        : 'Για το νέο προϊόν δεν υπάρχουν μετρημένες προτιμήσεις· μόνο η γενική συμπεριφορά online αγορών (b1) έχει εμπειρική βάση. Οι υπόλοιπες απαντήσεις βασίζονται σε δηλωμένες παραδοχές.'
    );
  }
  if (domain === 'social_policy' && !topic) warnings.push('Το θέμα δεν αντιστοιχίστηκε σε δείκτη Eurobarometer· μόνο η ερώτηση εμπιστοσύνης έχει εμπειρική βάση.');
  const plan: StudyPlan = {
    domain,
    kind,
    title: concept.length > 80 ? concept.slice(0, 77) + '…' : concept,
    researchQuestion: text,
    questions,
    assumptions: [
      ...defaultAssumptions(domain, price),
      ...(consumerTopics[0] ? [behaviourAssumption(consumerTopics[0], getMetric(consumerTopics[0])!.label)] : [])
    ],
    audience: req.audience || { minAge: 15 },
    sampleSize: req.sampleSize || 500,
    warnings,
    plannerVersion: PLANNER_VERSION,
    plannerMode: 'rules'
  };
  return { plan, blocked: false, blockedReasons: [], suggestions: { guide: focusGuide(domain, concept) } };
}
