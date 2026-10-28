/*
 * Μηνιαία τεκμηρίωση πρόθεσης ψήφου από δημοσιευμένες δημοσκοπήσεις -> <dataRoot>/research/polls-greece.json.
 *
 *   npx tsx scripts/synthetic-lab/political/build_polls_evidence.ts
 *
 * Ίδια μέθοδος με το S της προκαταχωρισμένης αξιολόγησης (POLITICAL_PREREGISTRATION.md):
 *  - Εθνικό επίπεδο στο τέλος κάθε μήνα = B2: μέσος όρος ανά εταιρεία των δημοσκοπήσεων των τελευταίων 14 ημερών
 *    (ή οι 3 τελευταίες), μετά μέσος εταιρειών, επί των εγκύρων. Μήνας χωρίς δημοσκόπηση στις 30 ημέρες: κανένα κύμα.
 *  - Διαφορές ομάδων (φύλο, ηλικία, μόρφωση) σε logit από την πιο πρόσφατη μέτρηση πριν από το τέλος του μήνα
 *    (NORAYA ή CSES). Η P1 (εθνικά ποσοστά) πέρασε· η P2 (διαφορές ομάδων) απορρίφθηκε: οι διασπάσεις είναι μη επικυρωμένες.
 * Πηγή δημοσκοπήσεων: πίνακες Wikipedia (CC BY-SA 4.0, απόδοση ανά σελίδα/αναθεώρηση στο README του tidy).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { parseCsvObjects } from '../../../lib/synthetic-lab/csv';
import { getMetric } from '../../../lib/synthetic-lab/data/noraya';
import type { PriorMetric, PriorWave } from '../../../lib/synthetic-lab/data/noraya-build';
import { dataRoot } from '../../../lib/synthetic-lab/storage/paths';
import { DAY, ENGINE_KEY, inv, loadPolls, logit, pollAverage, profileSource, TIDY, type Dist } from './polls_common';

const DIMS = ['gender', 'age_group', 'education_group'];
const OUT = path.join(dataRoot(), 'research/polls-greece.json');

const partyMap = parseCsvObjects(readFileSync(path.join(TIDY, 'party_map.csv'), 'utf8'));
const NAME: Record<string, string> = { OTHER: 'Άλλο κόμμα' };
// πλήρες ελληνικό όνομα· για νέα κόμματα χωρίς επιμελημένη εγγραφή (AUTO_*) το αγγλικό όνομα της πηγής, προς έλεγχο
for (const r of partyMap) if (r.party_key === r.lineage_key) NAME[r.lineage_key] = r.name_el || r.name_en || r.lineage_key;
Object.assign(NAME, { ND: 'ΝΔ', SYRIZA: 'ΣΥΡΙΖΑ', PASOK: 'ΠΑΣΟΚ-ΚΙΝΑΛ', KKE: 'ΚΚΕ', XA: 'Χρυσή Αυγή', ELAS: 'ΕΛΑΣ' });

const polls = loadPolls();
const first = new Date(polls[0].end);
const now = new Date();
const waves = new Map<string, PriorWave[]>(); // lineage -> κύματα
const meta: Record<string, { polls: number; pollsters: number; profile: string }> = {};

for (let y = first.getUTCFullYear(), m = first.getUTCMonth() + 1; y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1); m === 12 ? (y++, (m = 1)) : m++) {
  const T = Math.min(Date.UTC(y, m, 0), now.getTime());
  if (!polls.some((p) => p.end <= T && p.end > T - 30 * DAY)) continue;
  const avg = pollAverage(polls, T);
  if (!avg) continue;
  const src = profileSource(T);
  const key = `${y}-${String(m).padStart(2, '0')}`;
  meta[key] = { polls: avg.n, pollsters: avg.pollsters, profile: src ? `${src.prefix}${src.waveKey}` : '—' };
  for (const [k, v] of Object.entries(avg.dist as Dist)) {
    if (v < 0.5 && k !== 'OTHER') continue;
    const groups: PriorWave['groups'] = { all: { all: { value: Math.round(v * 100) / 100, n: 0, nUnknown: true, confidence: 'high', sources: avg.n, inconsistent: false } } };
    const ek = ENGINE_KEY[k];
    const sw = src && ek ? getMetric(`${src.prefix}${ek}`)?.waves.find((w) => w.key === src.waveKey) : undefined;
    const sall = sw?.groups.all?.all;
    if (sw && sall && sall.value > 0) {
      for (const dim of DIMS) {
        for (const [g, c] of Object.entries(sw.groups[dim] || {})) {
          if (!['male', 'female', '18-24', '25-39', '40-54', '55+', 'low_education', 'medium_education', 'high_education'].includes(g)) continue;
          (groups[dim] = groups[dim] || {})[g] = { ...c, value: Math.round(10000 * inv(logit(c.value / 100) - logit(sall.value / 100) + logit(v / 100))) / 100 };
        }
      }
    }
    const w: PriorWave = { key, year: y, quarter: `Q${Math.floor((m - 1) / 3) + 1}`, month: m, groups };
    (waves.get(k) || waves.set(k, []).get(k)!).push(w);
  }
}

const lastKey = Object.keys(meta).sort().pop()!;
const metrics: PriorMetric[] = Array.from(waves.entries()).map(([k, ws]) => ({
  metric: `polls:vote:${k.toLowerCase()}`,
  family: 'polls_vote',
  label: `Εκτίμηση ψήφου: ${NAME[k] || k} (μέσος όρος δημοσκοπήσεων, % επί των εγκύρων)`,
  semanticsNote:
    'Μηνιαίος μέσος όρος δημοσιευμένων δημοσκοπήσεων (εκτίμηση ψήφου επί των εγκύρων). Εθνικό επίπεδο επικυρωμένο (P1: μέσο σφάλμα 1,6 π.μ. σε 6 εκλογές, όσο ο μέσος όρος δημοσκοπήσεων). Διαφορές ομάδων ΜΗ επικυρωμένες (P2 απορρίφθηκε).',
  scheme: 'eurobarometer',
  datasetId: 'polls-greece',
  question: 'Αν είχαμε βουλευτικές εκλογές, ποιο κόμμα θα ψηφίζατε;',
  waves: ws
}));
const current = metrics.filter((m) => m.waves[m.waves.length - 1].key === lastKey && m.waves[m.waves.length - 1].groups.all.all.value >= 1);
const out = {
  datasetId: 'polls-greece',
  tier: 'research_only',
  source: 'Δημοσιευμένες δημοσκοπήσεις 2000–2026 (πίνακες Wikipedia, ελληνική και αγγλική) — απόδοση ανά σελίδα/αναθεώρηση: raw/political/tidy/README.md',
  license: 'CC BY-SA 4.0 (πίνακες Wikipedia)· τα δεδομένα των εταιρειών δημοσκοπήσεων ανήκουν στις εταιρείες. Χρήση ως research_only.',
  importedAt: new Date().toISOString(),
  years: Array.from(new Set(Object.keys(meta).map((k) => Number(k.slice(0, 4))))),
  months: meta,
  validation: 'docs/synthetic-lab/POLITICAL_RESULTS.md',
  questions: [
    {
      id: 'polls_vote_now',
      part: 'polls',
      variable: 'vote_estimate',
      text: 'Αν είχαμε βουλευτικές εκλογές την επόμενη Κυριακή, ποιο κόμμα θα ψηφίζατε;',
      options: current.map((m) => m.label.replace(/^Εκτίμηση ψήφου: | \(μέσος.*$/g, '')),
      dkOptions: [],
      optionMetrics: Object.fromEntries(current.map((m) => [m.label.replace(/^Εκτίμηση ψήφου: | \(μέσος.*$/g, ''), m.metric])),
      n: meta[lastKey].polls,
      years: [Number(lastKey.slice(0, 4))]
    }
  ],
  metrics
};
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`polls-greece: ${metrics.length} κόμματα, ${Object.keys(meta).length} μήνες (${Object.keys(meta)[0]}…${lastKey}) -> ${OUT}`);
console.log(`Τελευταίος μήνας ${lastKey}: ` + current.map((m) => `${m.label.replace(/^Εκτίμηση ψήφου: | \(μέσος.*$/g, '')} ${m.waves[m.waves.length - 1].groups.all.all.value}`).join(' · '));
