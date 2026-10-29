// ============================================================
// PIE — αυτόματη ερμηνεία νέων ερωτήσεων (C6 του sprint 10/2026).
//
// Για μια ερώτηση χωρίς χειροκίνητη σύνδεση (personaLink), προτείνει σύνδεση με:
//   - άγκυρα του προσώπου (αυτοτοποθέτηση, «πώς τα βγάζετε πέρα», ενδιαφέρον για την πολιτική, επαγγελματική κατάσταση), ή
//   - item του μοντέλου (ομοιότητα κειμένου + κειμένου επιλογών, ίδιος αριθμός ουσιαστικών επιλογών, ίδια φορά κλίμακας).
// Αυτόματη αποδοχή ΜΟΝΟ πάνω από κατώφλι· αλλιώς η ερώτηση μένει «δεν εκτιμάται» και η πρόταση καταγράφεται για τον ερευνητή.
// Όλες οι αυτόματες συνδέσεις είναι kind 'equivalent' (MODEL_EXTRAPOLATED), με την παραδοχή γραμμένη.
// Πρόθεση ψήφου ΔΕΝ συνδέεται αυτόματα (απαιτεί σενάριο κομμάτων).
// ============================================================

import type { PersonaLink, Question } from '../types';
import type { PersonaItem, PersonaModel } from './model';
import { incumbencyMismatch } from './incumbency';

export const AUTOLINK_VERSION = 'autolink-1';
export const AUTOLINK_ACCEPT = 0.55;

export interface LinkSuggestion {
  questionId: string;
  link: PersonaLink | null;
  confidence: number;
  accepted: boolean;
  target: string | null;
  reason: string;
}

const STOP = new Set(
  'και για την την του της των στην στον στο στα στις στους που πόσο ποσο ποια ποιο ποιος ποιες είστε ειστε έχετε εχετε σας μας από απο με θα να είναι ειναι ή η οι τα το τον τη τι πως πώς σε ενα ένα μια μία κάθε καθε βαθμο βαθμό βαθμος συνολικα συνολικά συνηθως συνήθως παρακάτω παρακατω ακόλουθα ακολουθα γενικά γενικα σήμερα σημερα σχετικά σχετικα κατά κατα the of and to in for how what your you are is do with on'
    .split(' ')
);
// Μικρός θησαυρός συνωνύμων του πεδίου (κανονικοποιημένες ρίζες → κοινή ρίζα)
const SYN: Record<string, string> = {
  κοινοβ: 'βουλη', parlia: 'βουλη', δικαστ: 'δικαιο', courts: 'δικαιο', δικαιο: 'δικαιο', justic: 'δικαιο', legal: 'δικαιο',
  δημαρχ: 'αυτοδι', τοπικη: 'αυτοδι', αυτοδι: 'αυτοδι', local: 'αυτοδι', μμε: 'μμεμμε', media: 'μμεμμε', μεσα: 'μμεμμε',
  κυβερν: 'κυβερν', govern: 'κυβερν', ευρωπ: 'ευρωπ', europe: 'ευρωπ', εε: 'ευρωπ', ενωση: 'ευρωπ', εμπιστ: 'εμπιστ', trust: 'εμπιστ', confid: 'εμπιστ',
  ικανοπ: 'ικανοπ', satisf: 'ικανοπ', τηλεορ: 'τηλεορ', tv: 'τηλεορ', social: 'κοινων', κοινων: 'κοινων', διαδικ: 'ιντερν', ιντερν: 'ιντερν', internet: 'ιντερν'
};

export function normText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ')
    .replace(/[^a-zα-ω0-9]+/g, ' ')
    .trim();
}

export function stems(s: string): string[] {
  return normText(s)
    .split(' ')
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .map((w) => {
      const st = w.slice(0, 6);
      return SYN[st] || SYN[w] || st;
    });
}

function vec(words: string[], idf: Map<string, number>): Map<string, number> {
  const v = new Map<string, number>();
  words.forEach((w) => v.set(w, (v.get(w) || 0) + (idf.get(w) ?? 1)));
  return v;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  a.forEach((x, k) => {
    na += x * x;
    if (b.has(k)) dot += x * b.get(k)!;
  });
  b.forEach((x) => (nb += x * x));
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const POS = /^(πολυ|παρα πολυ|απολυτα|πολλη|αρκετ|συμφων|ναι|θετικ|καλ|σιγουρα ναι|εμπιστευ|ικανοποιημεν|πανω|very|a great|strongly agree|agree|yes|always|παντα|καθημεριν|5|4)/;
const NEG = /^(καθολου|διαφων|οχι|αρνητικ|κακ|ποτε|σιγουρα οχι|δεν|not at all|never|no\b|strongly dis|disagree|1\b|0\b)/;
/** +1 αν η κλίμακα πάει από θετικό σε αρνητικό, -1 αν από αρνητικό σε θετικό, 0 αν δεν φαίνεται. */
export function polarity(labels: string[]): number {
  if (labels.length < 2) return 0;
  const f = normText(labels[0]);
  const l = normText(labels[labels.length - 1]);
  const fp = POS.test(f) ? 1 : NEG.test(f) ? -1 : 0;
  const lp = POS.test(l) ? 1 : NEG.test(l) ? -1 : 0;
  if (fp > 0 && lp <= 0) return 1;
  if (fp < 0 && lp >= 0) return -1;
  if (lp > 0 && fp === 0) return -1;
  if (lp < 0 && fp === 0) return 1;
  return 0;
}

const DK_RX = /(δεν (γνωριζ|ξερ|απαντ)|δγ|δα$|δα |δξ|γνωμη|refus|don.?t know|prefer not|no answer|δεν επιθυμ|δεν τοποθετ)/;
function substantive(opts: string[]): { subst: string[]; dk: string | null } {
  const dk = opts.find((o) => DK_RX.test(normText(o))) || null;
  return { subst: opts.filter((o) => !DK_RX.test(normText(o))), dk };
}

interface AnchorRule {
  name: NonNullable<PersonaLink['anchor']>['name'];
  rx: RegExp;
  build: (opts: string[]) => Record<string, string[]> | null;
  assumption: string;
}

function byOrder(opts: string[], values: string[], reverseIfPositiveFirst: boolean): Record<string, string[]> | null {
  if (opts.length !== values.length) return null;
  const pol = polarity(opts);
  const ordered = reverseIfPositiveFirst && pol === 1 ? [...values].reverse() : values;
  return Object.fromEntries(opts.map((o, i) => [o, [ordered[i]]]));
}

const PV_RX: [RegExp, string][] = [
  [/(νεα δημοκρ|^νδ$|^νδ )/, 'nd'], [/συριζα/, 'syriza'], [/(πασοκ|κιναλ)/, 'pasok'], [/^κκε|κομμουνιστ/, 'kke'],
  [/(δεν ψηφισ|λευκο|ακυρο|δεν θυμ|δεν απαντ|δεν ειχα|αποχη)/, 'abstain']
];
const EMP_RX: [RegExp, string[]][] = [
  [/(μισθωτ|ιδιωτικ|δημοσι|employee|employed)/, ['private_emp', 'public_emp', 'employed']], [/(ελευθερ|αυτοαπασχ|self)/, ['self_emp', 'farmer']],
  [/(αγροτ|farmer)/, ['farmer']], [/(ανεργ|unemploy)/, ['unemployed']], [/(συνταξ|retire)/, ['retired']], [/(φοιτητ|μαθητ|σπουδ|student)/, ['student']],
  [/(οικιακ|νοικοκυρ|φροντιδ|home)/, ['homemaker']], [/(αλλ|other)/, ['other']]
];

const ANCHOR_RULES: AnchorRule[] = [
  {
    name: 'believer',
    rx: /πιστευ.*(θεο|θεικ)|believe in god/,
    build: (opts) => {
      const s = substantive(opts).subst;
      if (s.length !== 2) return null;
      const yes = s.find((o) => /^(ναι|yes|πιστευ)/.test(normText(o)));
      const no = s.find((o) => /^(οχι|no$|no |δεν)/.test(normText(o)));
      return yes && no ? { [yes]: ['1'], [no]: ['0'] } : null;
    },
    assumption: 'Αυτόματη αντιστοίχιση: πίστη στον Θεό ↔ άγκυρα believer (διαΝΕΟσις 12/2023).'
  },
  {
    name: 'pv',
    rx: /ψηφισατε.*εκλογ|εκλογ.*ψηφισατε|voted.*election/,
    build: (opts) => {
      const m: Record<string, string[]> = {};
      const used = new Set<string>();
      for (const o of opts) {
        const t = normText(o);
        const hit = PV_RX.find(([rx]) => rx.test(t));
        const v = hit ? hit[1] : 'other';
        if (used.has(v)) return null; // δύο επιλογές στην ίδια κατηγορία της πηγής = διάσπαση, δεν εκτιμάται
        used.add(v);
        m[o] = [v, ...(v === 'abstain' ? ['blank', 'nonvote', 'dk'] : [])];
      }
      return ['nd', 'syriza', 'pasok', 'kke', 'other', 'abstain'].every((v) => used.has(v)) ? m : null;
    },
    assumption: 'Αυτόματη αντιστοίχιση: ψήφος στις τελευταίες εκλογές ↔ άγκυρα pv (διαΝΕΟσις 12/2023· τα μικρά κόμματα είναι συγχωνευμένα στο «άλλο»).'
  },
  {
    name: 'emp',
    rx: /(επαγγελματικ.*κατασταση|κατασταση απασχολ|εργασιακ.*κατασταση|employment status)/,
    build: (opts) => {
      const m: Record<string, string[]> = {};
      const used = new Set<string>();
      for (const o of opts) {
        if (DK_RX.test(normText(o))) continue;
        const hit = EMP_RX.find(([rx]) => rx.test(normText(o)));
        if (!hit) return null;
        const vals = hit[1].filter((v) => !used.has(v));
        vals.forEach((v) => used.add(v));
        m[o] = vals;
      }
      const all = ['private_emp', 'public_emp', 'self_emp', 'farmer', 'employed', 'unemployed', 'retired', 'student', 'homemaker', 'other'];
      return all.every((v) => used.has(v)) ? m : null;
    },
    assumption: 'Αυτόματη αντιστοίχιση: επαγγελματική κατάσταση ↔ άγκυρα emp (διαΝΕΟσις 12/2023).'
  },
  {
    name: 'lr7',
    rx: /(αριστερ.*δεξι|δεξι.*αριστερ|left.*right)/,
    build: (opts) => {
      const nums = opts.filter((o) => /^\s*\d/.test(o));
      if (nums.length !== 7) return null;
      const m: Record<string, string[]> = Object.fromEntries(nums.map((o, i) => [o, [String(i + 1)]]));
      const rest = opts.filter((o) => !/^\s*\d/.test(o));
      const none = rest.find((o) => /(εκφραζ|τοποθετ|καμια|none)/.test(normText(o))) || rest.find((o) => DK_RX.test(normText(o)));
      if (none) m[none] = ['none'];
      return m;
    },
    assumption: 'Αυτόματη αντιστοίχιση: κλίμακα 1–7 ↔ αυτοτοποθέτηση του προσώπου (διαΝΕΟσις, 7 κατηγορίες).'
  },
  {
    name: 'polint4',
    rx: /ενδιαφερ.*πολιτικ|interest.*politic/,
    build: (opts) => {
      const s = substantive(opts).subst;
      const pol = polarity(s);
      return pol === 0 ? null : byOrder(s, pol === 1 ? ['1', '2', '3', '4'] : ['4', '3', '2', '1'], false);
    },
    assumption: 'Αυτόματη αντιστοίχιση: 4 βαθμίδες ενδιαφέροντος (πολύ → καθόλου) ↔ άγκυρα polint4.'
  },
  {
    name: 'econ4',
    rx: /(βγαζ.*περα|ανταποκριν.*υποχρεω|τα βγαζετε|make ends meet|household.?s income nowadays)/,
    build: (opts) => {
      const s = substantive(opts).subst;
      if (s.length !== 4) return null;
      // από «εύκολα/άνετα» προς «δύσκολα» ή αντίστροφα
      const easyFirst = /(ευκολ|ανετ|comfort|easil)/.test(normText(s[0]));
      const vals = easyFirst ? ['4', '3', '2', '1'] : ['1', '2', '3', '4'];
      return Object.fromEntries(s.map((o, i) => [o, [vals[i]]]));
    },
    assumption: 'Αυτόματη αντιστοίχιση: 4 βαθμίδες οικονομικής άνεσης ↔ άγκυρα «πώς τα βγάζετε πέρα» (διαΝΕΟσις).'
  }
];

/** Προτείνει (και, πάνω από κατώφλι, αποδέχεται) σύνδεση για μία ερώτηση. */
export function suggestLink(model: PersonaModel, q: Question, referenceMonth: string, ctx?: { idf: Map<string, number> }): LinkSuggestion {
  const none = (reason: string, confidence = 0, target: string | null = null): LinkSuggestion => ({ questionId: q.id, link: null, confidence, accepted: false, target, reason });
  const opts = q.type === 'likert' || q.type === 'concept_test' ? q.scale || [] : q.options || [];
  if (!opts.length) return none('Η ερώτηση δεν έχει επιλογές.');
  const text = normText(q.text);
  if (/(ψηφισ|κομμα).*(εκλογ|κυριακη)|(εκλογ|κυριακη).*(κομμα|ψηφ)/.test(text) && !/ψηφισατε/.test(text)) {
    return none('Πρόθεση ψήφου: απαιτεί ρητό σενάριο κομμάτων (personaLink.vote)· δεν συνδέεται αυτόματα.');
  }
  for (const r of ANCHOR_RULES) {
    if (!r.rx.test(text)) continue;
    if (!model.anchorNodes.some((n) => n.node === r.name)) continue;
    const map = r.build(opts);
    if (!map) return none(`Μοιάζει με την άγκυρα ${r.name}, αλλά οι επιλογές δεν αντιστοιχίζονται με ασφάλεια.`, 0.4, `anchor:${r.name}`);
    return {
      questionId: q.id,
      link: { kind: 'equivalent', optionMap: {}, anchor: { name: r.name, optionMap: map }, assumption: r.assumption },
      confidence: 0.9,
      accepted: true,
      target: `anchor:${r.name}`,
      reason: r.assumption
    };
  }
  if (q.type === 'multiple_choice') return none('Πολλαπλή επιλογή: απαιτεί αντιστοίχιση ανά επιλογή (optionItems)· δεν συνδέεται αυτόματα.');
  const { subst, dk } = substantive(opts);
  const idf = ctx?.idf || buildIdf(model);
  // περιγραφές κλίμακας σε παρένθεση («1 = καθόλου … 5 = απόλυτα») δεν είναι περιεχόμενο της ερώτησης
  const qText = q.text.replace(/\([^)]*\d[^)]*\)/g, ' ');
  const qv = vec(stems(qText), idf);
  const qo = vec(stems(subst.join(' ')), idf);
  const qPol = polarity(subst);
  // ένα item ανά οικογένεια: το πιο πρόσφατο ≤ μήνα αναφοράς
  const latest = new Map<string, PersonaItem>();
  for (const it of model.items) {
    if (it.wave > referenceMonth) continue;
    const k = it.family || it.id;
    const cur = latest.get(k);
    if (!cur || it.wave > cur.wave || (it.wave === cur.wave && it.n > cur.n)) latest.set(k, it);
  }
  let best: { it: PersonaItem; score: number; reverse: boolean } | null = null;
  for (const it of Array.from(latest.values())) {
    if (it.options.length !== subst.length) continue;
    const labels = it.options.map((o) => o.label);
    const itPol = polarity(labels);
    const iv = vec(stems(`${it.text} ${it.construct || ''} ${labels.join(' ')}`), idf);
    const s1 = cosine(qv, vec(stems(`${it.text} ${it.construct || ''}`), idf));
    const s2 = cosine(qo, vec(stems(labels.join(' ')), idf));
    // κάλυψη: πόσο από το «βάρος» (idf) των λέξεων της ερώτησης υπάρχει στο item· μια διακριτική λέξη που λείπει (π.χ. «αντιπολίτευση») ρίχνει τη βαθμολογία
    let tot = 0;
    let hit = 0;
    qv.forEach((x, k) => {
      tot += x;
      if (iv.has(k)) hit += x;
    });
    const cover = tot ? hit / tot : 0;
    const age = yearsBetween(it.wave, referenceMonth);
    const govPenalty = incumbencyMismatch(`${q.text} ${it.text}`, it.wave, referenceMonth) ? 0.6 : 1; // E3: προτίμηση ίδιας κυβερνητικής περιόδου
    const score = (0.45 * s1 + 0.2 * s2 + 0.35 * cover) * Math.exp(-Math.max(age - 2, 0) / 8) * (cover < 0.45 ? 0.5 : 1) * govPenalty;
    if (!best || score > best.score) best = { it, score, reverse: it.type !== 'nominal' && qPol !== 0 && itPol !== 0 && qPol !== itPol };
  }
  if (!best) return none('Κανένα item του μοντέλου με ίδιο αριθμό επιλογών.');
  const { it, score, reverse } = best;
  if (it.type === 'nominal') {
    // ονομαστικές: απαιτείται ταύτιση ετικετών ένα-προς-ένα
    const map: Record<string, string[]> = {};
    for (const o of subst) {
      const ov = vec(stems(o), idf);
      let bi: { code: string; s: number } | null = null;
      for (const io of it.options) {
        const s = cosine(ov, vec(stems(io.label), idf));
        if (!bi || s > bi.s) bi = { code: io.code, s };
      }
      if (!bi || bi.s < 0.5 || Object.values(map).some((v) => v[0] === bi!.code)) return none(`Ονομαστικό item ${it.id}: οι επιλογές δεν ταυτίζονται με ασφάλεια.`, score, it.id);
      map[o] = [bi.code];
    }
    return accept(q.id, it, map, dk, score);
  }
  const codes = it.options.map((o) => o.code);
  const ordered = reverse ? [...codes].reverse() : codes;
  const map = Object.fromEntries(subst.map((o, i) => [o, [ordered[i]]]));
  return accept(q.id, it, map, dk, score);
}

function accept(qid: string, it: PersonaItem, map: Record<string, string[]>, dk: string | null, score: number): LinkSuggestion {
  const conf = Math.round(score * 100) / 100;
  const assumption = `Αυτόματη αντιστοίχιση (${AUTOLINK_VERSION}, ομοιότητα ${conf}): «${it.text.slice(0, 90)}» (${it.file}, ${it.wave}). Οι επιλογές αντιστοιχίζονται με τη σειρά τους.`;
  const link: PersonaLink = { kind: 'equivalent', itemId: it.id, optionMap: map, dkOption: dk, assumption };
  return { questionId: qid, link: conf >= AUTOLINK_ACCEPT ? link : null, confidence: conf, accepted: conf >= AUTOLINK_ACCEPT, target: it.id, reason: assumption };
}

function yearsBetween(wave: string, ref: string): number {
  const [y1, m1] = wave.split('-').map(Number);
  const [y2, m2] = ref.split('-').map(Number);
  return (y2 * 12 + (m2 || 1) - (y1 * 12 + (m1 || 1))) / 12;
}

export function buildIdf(model: PersonaModel): Map<string, number> {
  const df = new Map<string, number>();
  for (const it of model.items) new Set(stems(`${it.text} ${it.options.map((o) => o.label).join(' ')}`)).forEach((w) => df.set(w, (df.get(w) || 0) + 1));
  const N = model.items.length;
  const idf = new Map<string, number>();
  df.forEach((c, w) => idf.set(w, Math.log((N + 1) / (c + 1)) + 1));
  return idf;
}
