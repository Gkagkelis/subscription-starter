// ============================================================
// Πλαίσιο καταναλωτικών μελετών (ανοιχτές πηγές, όχι priors):
//  - ΕΚΤ Consumer Expectations Survey, Ελλάδα: πληθωρισμός & δαπάνες (σύνολο)
//  - Eurostat HBS: μερίδιο δαπάνης ανά κατηγορία και εισοδηματικό πεμπτημόριο
// Πηγή: official/consumer-context.json (scripts/synthetic-lab/fetch-consumer-context.ts).
// ============================================================

import ctxJson from './official/consumer-context.json';

interface CesIndicator {
  label: string;
  series: Record<string, number>;
  latest: number | null;
  latestMonth: string | null;
}
interface ConsumerContext {
  datasetIds: { ces: string; hbs: string };
  fetchedAt: string;
  ces: { source: string; url: string; license: string; indicators: Record<string, CesIndicator> };
  hbs: { source: string; license: string; unit: string; url: string; year: number; categories: Record<string, { label: string; perMilleByQuintile: Record<string, number> }> };
}

export const CONSUMER_CONTEXT = ctxJson as unknown as ConsumerContext;
export const CES_DATASET_ID = CONSUMER_CONTEXT.datasetIds.ces;
export const HBS_DATASET_ID = CONSUMER_CONTEXT.datasetIds.hbs;

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toLocaleString('el-GR', { maximumFractionDigits: 1 })}%`);

export function cesSummary(): string {
  const i = CONSUMER_CONTEXT.ces.indicators;
  const m = i.C1120?.latestMonth?.split('-');
  return (
    `Προσδοκίες καταναλωτών (ΕΚΤ Consumer Expectations Survey, Ελλάδα, ${m ? `${m[1]}/${m[0]}` : '—'}, σταθμισμένες διάμεσοι): ` +
    `αντιληπτός πληθωρισμός 12 μηνών ${pct(i.C1020?.latest)}, αναμενόμενος 12 μηνών ${pct(i.C1120?.latest)}, ` +
    `αναμενόμενη αύξηση δαπανών νοικοκυριού ${pct(i.C6120?.latest)}. Μόνο συνολικές τιμές για την Ελλάδα (όχι ανά ομάδα).`
  );
}

const TOPIC_COICOP: { keys: string[]; code: string }[] = [
  { keys: ['κινητ', 'internet', 'ιντερνετ', 'τηλεφων', 'συνδεσ', 'data', 'fiber', 'ινες'], code: 'CP083' },
  { keys: ['φαγητ', 'delivery', 'εστιατορ', 'καφε', 'μπαρ'], code: 'CP111' },
  { keys: ['σουπερ', 'τροφιμ', 'ψωνια', 'φρουτ', 'λαχανικ'], code: 'CP01' },
  { keys: ['ρουχ', 'παπουτσ', 'μοδα', 'ενδυσ'], code: 'CP03' },
  { keys: ['ρευμα', 'ενεργει', 'θερμανσ', 'φυσικο αεριο', 'πετρελαι'], code: 'CP045' },
  { keys: ['ενοικ', 'στεγ', 'κατοικι', 'σπιτ'], code: 'CP04' },
  { keys: ['αυτοκινητ', 'μεταφορ', 'καυσιμ', 'βενζιν', 'λεωφορει', 'μετρο'], code: 'CP07' },
  { keys: ['υγει', 'φαρμακ', 'γιατρ', 'ασφαλισ υγει'], code: 'CP06' },
  { keys: ['streaming', 'netflix', 'σινεμα', 'θεατρ', 'συναυλι', 'βιβλι', 'ταξιδ', 'διακοπ', 'γυμναστ'], code: 'CP09' },
  { keys: ['φροντιστ', 'σχολει', 'εκπαιδευσ', 'μαθηματ', 'σπουδ'], code: 'CP10' },
  { keys: ['επιπλ', 'συσκευ', 'ψυγει', 'πλυντηρ'], code: 'CP05' }
];

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ');
}

/** Μερίδιο δαπάνης για τις κατηγορίες που ταιριάζουν στο κείμενο (HBS, ανά πεμπτημόριο). */
export function spendingContext(text: string): string[] {
  const t = norm(text);
  const codes = Array.from(new Set(TOPIC_COICOP.filter((x) => x.keys.some((k) => t.includes(norm(k)))).map((x) => x.code)));
  const h = CONSUMER_CONTEXT.hbs;
  return codes
    .map((c) => h.categories[c])
    .filter(Boolean)
    .map((c) => {
      const q = c.perMilleByQuintile;
      const f = (k: string) => (q[k] === undefined ? '—' : `${(q[k] / 10).toLocaleString('el-GR', { maximumFractionDigits: 1 })}%`);
      return `Μερίδιο δαπάνης νοικοκυριών για «${c.label}» (Έρευνα Οικογενειακών Προϋπολογισμών ${h.year}, Eurostat/ΕΛΣΤΑΤ): ${f('1')} στο χαμηλότερο εισοδηματικό πεμπτημόριο → ${f('5')} στο υψηλότερο (ενδιάμεσα ${f('2')}, ${f('3')}, ${f('4')}).`;
    });
}
