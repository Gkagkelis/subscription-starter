// Viewscope v2 — κοινή, ντετερμινιστική σύγκριση κειμένων (χωρίς μοντέλα γλώσσας): κανονικοποίηση, τριγράμματα, οντότητες.
// (Χωρίς σημαία /u για συμβατότητα ES5: ρητές περιοχές Λατινικών/Ελληνικών χαρακτήρων.)
const LETTER = 'A-Za-z0-9\\u00C0-\\u024F\\u0370-\\u03FF\\u1F00-\\u1FFF';
const NON_WORD = new RegExp(`[^${LETTER} ]+`, 'g');
const NON_WORD_CHARS = new RegExp(`[^${LETTER}]`, 'g');
const UPPER_START = /^[A-Z\u0386\u0388-\u038F\u0391-\u03A9]/;
const HAS_UPPER = /[A-Z\u0386\u0388-\u038F\u0391-\u03A9]/;
export function normalize(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[∆Δ]/g, 'δ')
    .replace(NON_WORD, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ενοποίηση εκφράσεων «Δεν ξέρω / Δεν απαντώ». */
export function isDkOption(s: string): boolean {
  const t = normalize(s);
  return /^(δγ δα|δξ δα|δγ|δα|δεν ξερω|δεν απαντω|δεν ξερω δεν απαντω|ξ α|dk|dk na)( αυθ)?$/.test(t) || /δεν ξερω.*δεν απαντω/.test(t);
}

function trigrams(s: string): Set<string> {
  const t = normalize(s);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

export function trigramJaccard(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((x) => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}

/**
 * «Οντότητες» της ερώτησης: λέξεις με κεφαλαίο που δεν βρίσκονται στην αρχή πρότασης, ή λέξεις μόνο με κεφαλαία
 * (ονόματα προσώπων, κομμάτων, θεσμών). Δύο ερωτήσεις θεωρούνται ίδιες μόνο αν έχουν τις ίδιες οντότητες
 * (π.χ. «ο Πρωθυπουργός κ. Μητσοτάκης» ≠ «ο Πρόεδρος του ΠΑΣΟΚ»).
 */
export function entityTokens(s: string): Set<string> {
  const out = new Set<string>();
  // αρίθμηση ερώτησης στην αρχή («10.», «Q3)», «ΕΡ:») δεν είναι οντότητα
  const words = (s || '').replace(/^\s*((ΕΡ|Ερ|ερ|Q|q)\s*[.:]?\s*)?(\d+[.)]\s*)?((ΕΡ|Ερ)\s*[.:]\s*)?/, '').replace(/[‘’'"«»]/g, ' ').split(/\s+/).filter(Boolean);
  let sentenceStart = true;
  for (const w0 of words) {
    const w = w0.replace(NON_WORD_CHARS, '');
    if (w.length >= 2 && !sentenceStart && UPPER_START.test(w)) out.add(normalize(w));
    else if (w.length >= 2 && w === w.toUpperCase() && HAS_UPPER.test(w)) out.add(normalize(w));
    // τέλος πρότασης μόνο αν δεν είναι συντομογραφία (π.χ. «κ.», «κα.», «π.χ.»)
    sentenceStart = /[.;;?!]$/.test(w0) && w.length >= 3;
  }
  return out;
}

export function sameEntities(a: string, b: string): boolean {
  const A = entityTokens(a), B = entityTokens(b);
  if (A.size !== B.size) return false;
  let ok = true;
  A.forEach((x) => { if (!B.has(x)) ok = false; });
  return ok;
}

/** Οργανισμός → κλειδί (ίδια λογική με το build_published_waves.py). */
const ORG_KEYS: [string, string][] = [
  ['metron', 'metron'], ['gpo', 'gpo'], ['g.p.o', 'gpo'], ['prorata', 'prorata'], ['marc', 'marc'], ['mrb', 'mrb'], ['pulse', 'pulse'],
  ['opinion poll', 'opinion_poll'], ['interview', 'interview'], ['alco', 'alco'], ['kapa', 'kapa'], ['focus bari', 'focus_bari'],
  ['palmos', 'palmos'], ['ιοβε', 'iobe'], ['eurobarometer', 'eurobarometer'], ['διανεοσις', 'dianeosis'], ['dianeosis', 'dianeosis'],
  ['εεττ', 'eett'], ['dg just', 'dg_just'], ['ελστατ', 'elstat'], ['rass', 'rass'], ['eltrun', 'eltrun'], ['reuters', 'reuters']
];
export function orgKey(s: string | null | undefined): string {
  const t = (s || '').toLowerCase();
  for (const [k, v] of ORG_KEYS) if (t.includes(k)) return v;
  return t.replace(/\W+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}
