// ============================================================
// Πολιτικά δεδομένα NORAYA -> "empirical priors" (ίδια μορφή με το public_opinion).
//
// Πηγές (ανάγνωση μόνο):
//  - public/noraya-data/vote_intention.csv: πρόθεση ψήφου ανά κόμμα, % επί των εγκύρων,
//    ανά μία διάσταση (φύλο, ηλικία, μόρφωση, περιοχή, επάγγελμα, ψήφος 2019, αριστερά–δεξιά).
//  - public/noraya-data/leader_traits.csv: αξιολογήσεις αρχηγών (καταλληλότερος πρωθυπουργός,
//    έγκριση, χαρακτηριστικά, ευθύνη), ποσοστά ανά επιλογή.
//
// Κανόνες:
//  - Η πηγή δεν δίνει γραμμή «σύνολο». Το σύνολο κάθε κύματος υπολογίζεται από τις ομάδες
//    φύλου (σταθμισμένος μέσος με βάση το n) και σημειώνεται ως παράγωγο.
//  - Πολλές έρευνες στο ίδιο τρίμηνο, χωρίς κωδικό έρευνας: συνδυάζονται με στάθμιση n·
//    απόκλιση > 3 SE σημειώνεται, και κύμα με ασύμβατο σύνολο απομονώνεται (όπως στο public_opinion).
//  - Γραμμές χωρίς έτος/τρίμηνο δεν χρησιμοποιούνται.
//  - Το leader_traits δεν δημοσιεύει n: τα κελιά σημειώνονται nUnknown και συνδυάζονται με ίσα βάρη.
//  - Η άδεια της πηγής είναι άγνωστη: tier research_only (μόνο εσωτερική χρήση).
// ============================================================

import { parseCsvObjects } from '../csv';
import type { NorayaPriors, PriorMetric } from './noraya-build';
import { buildNorayaPriors } from './noraya-build';

export const POLITICAL_DATASET_ID = 'noraya-political';

/** Σταθερά κλειδιά κομμάτων (ίδια σε όλες τις πολιτικές πηγές του Lab). */
export const PARTY_KEYS: Record<string, string> = {
  'ΝΔ': 'nd',
  'ΣΥΡΙΖΑ': 'syriza',
  'ΠΑΣΟΚ/ΚΙΝΑΛ': 'pasok_kinal',
  'ΚΚΕ': 'kke',
  'Ελληνική Λύση': 'elliniki_lysi',
  'ΜέΡΑ25': 'mera25',
  'Πλεύση Ελευθερίας': 'plefsi',
  'Χρυσή Αυγή': 'xrysi_avgi',
  'Ένωση Κεντρώων': 'enosi_kentroon',
  'ΑΝΕΛ': 'anel',
  'Ποτάμι': 'potami',
  other_party: 'other'
};

export const PARTY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PARTY_KEYS).map(([label, key]) => [key, label === 'other_party' ? 'Άλλο κόμμα' : label])
);

function slug(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9α-ω]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

const GROUP_DIMS = new Set(['gender', 'age_group', 'education_group', 'region_group', 'occupation_group', 'previous_vote_party', 'left_right_group']);
const EDU = new Set(['low_education', 'medium_education', 'high_education']);

interface Row {
  metric: string;
  metric_family: string;
  group_type: string;
  group: string;
  value_weighted_0_100: number;
  survey_year: string;
  survey_quarter: string;
  sample_confidence: string;
  n_valid_weighted: number;
}

function keepGroup(type: string, group: string): boolean {
  if (!GROUP_DIMS.has(type)) return false;
  if (type === 'education_group') return EDU.has(group);
  return !/δεν|δε θέλω|don't want|γνωρίζω/i.test(group);
}

/** Προσθήκη γραμμής «σύνολο» ανά (δείκτη, κύμα) από τις ομάδες φύλου. */
function withDerivedTotals(rows: Row[]): Row[] {
  const acc = new Map<string, { num: number; den: number; conf: string; fam: string }>();
  for (const r of rows) {
    if (r.group_type !== 'gender') continue;
    const k = [r.metric, r.survey_year, r.survey_quarter].join('\u0001');
    const a = acc.get(k) || { num: 0, den: 0, conf: r.sample_confidence, fam: r.metric_family };
    a.num += r.value_weighted_0_100 * r.n_valid_weighted;
    a.den += r.n_valid_weighted;
    acc.set(k, a);
  }
  const out = [...rows];
  acc.forEach((a, k) => {
    const [metric, y, q] = k.split('\u0001');
    if (a.den <= 0) return;
    out.push({
      metric,
      metric_family: a.fam,
      group_type: 'all',
      group: 'all',
      value_weighted_0_100: a.num / a.den,
      survey_year: y,
      survey_quarter: q,
      sample_confidence: a.conf,
      n_valid_weighted: a.den
    });
  });
  return out;
}

function toCsv(rows: Row[]): string {
  const cols = ['metric', 'metric_family', 'group_type', 'group', 'value_weighted_0_100', 'survey_year', 'survey_quarter', 'sample_confidence', 'n_valid_weighted', 'data_status'];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => [...cols.slice(0, -1).map((c) => esc((r as any)[c])), 'ok'].join(','))].join('\n');
}

export function buildPoliticalPriors(voteCsv: string, leaderCsv: string, sha: { vote: string; leader: string }): NorayaPriors {
  const labels: Record<string, string> = {};
  const questions: Record<string, string> = {};
  const vote: Row[] = [];
  for (const r of parseCsvObjects(voteCsv)) {
    const key = PARTY_KEYS[r.party];
    const y = Number(r.survey_year);
    const n = Number(r.n_valid_vote_unweighted);
    const v = Number(r.vote_share_weighted_valid);
    if (!key || !Number.isFinite(y) || !r.survey_quarter || r.survey_quarter === 'unknown' || !(n > 0) || !Number.isFinite(v)) continue;
    if (!keepGroup(r.group_type, r.group)) continue;
    const metric = `pol:vote:${key}`;
    labels[metric] = `Πρόθεση ψήφου: ${PARTY_LABELS[key]} (% επί των εγκύρων)`;
    vote.push({
      metric,
      metric_family: 'political_vote_intention',
      group_type: r.group_type,
      group: r.group,
      value_weighted_0_100: v,
      survey_year: r.survey_year,
      survey_quarter: r.survey_quarter,
      sample_confidence: r.sample_confidence,
      n_valid_weighted: n
    });
  }

  const leader: Row[] = [];
  for (const r of parseCsvObjects(leaderCsv)) {
    const y = Number(r.survey_year);
    const v = Number(r.share_weighted_valid);
    if (!Number.isFinite(y) || !r.survey_quarter || r.survey_quarter === 'unknown' || !Number.isFinite(v)) continue;
    if (!keepGroup(r.group_type, r.group)) continue;
    const base = `pol:leader:${r.metric_family}:${slug(r.metric_name)}`;
    const metric = `${base}:${slug(r.response_option)}`;
    const opt = r.response_option === 'none' ? 'Κανένας' : r.response_option === 'positive_approval' ? 'Θετική' : r.response_option === 'negative_approval' ? 'Αρνητική' : r.response_option;
    labels[metric] = `${r.metric_name} — ${opt}`;
    questions[metric] = r.metric_name;
    // χωρίς n στην πηγή: ίσα βάρη (n=1), σημειώνεται nUnknown μετά το build
    leader.push({
      metric,
      metric_family: `political_${r.metric_family}`,
      group_type: r.group_type,
      group: r.group,
      value_weighted_0_100: v,
      survey_year: r.survey_year,
      survey_quarter: r.survey_quarter,
      sample_confidence: r.sample_confidence,
      n_valid_weighted: 1
    });
  }

  const built = buildNorayaPriors(toCsv(withDerivedTotals([...vote, ...leader])), sha.vote, {
    datasetId: POLITICAL_DATASET_ID,
    sourceFile: 'public/noraya-data/vote_intention.csv + public/noraya-data/leader_traits.csv',
    labels,
    exclude: {},
    semanticsNote:
      'Πρόθεση ψήφου: % επί των εγκύρων απαντήσεων (χωρίς αναποφάσιστους/λευκό/αποχή). Αρχηγοί: % ανά επιλογή. Το σύνολο κάθε κύματος είναι παράγωγο από τις ομάδες φύλου. Η ακριβής διατύπωση των ερωτήσεων δεν τεκμηριώνεται στο repository.'
  });

  const isLeader = (m: string) => m.startsWith('pol:leader:');
  Object.values(built.metrics).forEach((m: PriorMetric) => {
    m.datasetId = POLITICAL_DATASET_ID;
    m.scheme = 'eurobarometer';
    m.tier = 'research_only';
    if (questions[m.metric]) m.question = questions[m.metric];
    if (isLeader(m.metric))
      m.waves.forEach((w) =>
        Object.values(w.groups).forEach((g) =>
          Object.values(g).forEach((c) => {
            c.n = 0;
            c.nUnknown = true;
            c.inconsistent = false;
          })
        )
      );
  });
  // στους δείκτες αρχηγών ο έλεγχος 3 SE δεν έχει νόημα χωρίς n: καμία απομόνωση
  Object.values(built.metrics).forEach((m) => isLeader(m.metric) && m.waves.forEach((w) => delete w.qualityFlag));
  built.meta.sourceSha256 = `${sha.vote}+${sha.leader}`;
  built.meta.notes.push(
    'Πολιτικά δεδομένα NORAYA (πρόθεση ψήφου, αρχηγοί). Άδεια άγνωστη: μόνο εσωτερική χρήση (research_only).',
    'Γραμμές χωρίς έτος/τρίμηνο και απαντήσεις «Δεν απαντώ» στις ομάδες εξαιρούνται.'
  );
  return built;
}
