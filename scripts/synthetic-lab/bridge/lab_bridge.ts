// ============================================================
// Γέφυρα Lab (TypeScript) ↔ ASE (Python). Καλεί ΜΟΝΟ υπάρχουσες συναρτήσεις του Lab· δεν αλλάζει τη συμπεριφορά τους
// και δεν αποθηκεύει τίποτα στο Lab (save:false). Η κατάσταση του ερωτώμενου ανήκει στο ASE (ενιαία πηγή αλήθειας):
// η γέφυρα δέχεται τους ερωτώμενους του ASE με τα δικά τους IDs/σπόρους και επιστρέφει αποτελέσματα με τα ίδια IDs.
//
//   npx tsx scripts/synthetic-lab/bridge/lab_bridge.ts <route|anchors|answer> <in.json> <out.json>
//
// route   {model, ref, questions[Lab Question]}                      → ανά ερώτηση: autolink, προετοιμασία PIE, βαθμίδα 1–5
// anchors {model, respondents[{id, seed, age_band, gender, education, region_code, settlement, income_quintile, household_size}]}
//                                                                     → άγκυρες PIE (αλυσίδα από ελληνικά μικροδεδομένα)
// answer  {model, ref, questions, respondents (με anchors), seed}    → απαντήσεις PIE ΜΟΝΟ για ερωτήσεις που η πολιτική
//                                                                       τεκμηρίωσης δεν βάζει σε αποχή (βαθμίδες 1–4)
// ============================================================
import { readFileSync, writeFileSync } from 'fs';
import { buildIdf, suggestLink, AUTOLINK_VERSION } from '../../../lib/synthetic-lab/persona/autolink';
import { classifyEvidence, loadEvidencePolicy, applyEvidenceDecision } from '../../../lib/synthetic-lab/persona/evidence-tier';
import { loadPersonaModel, type PersonaDemographics } from '../../../lib/synthetic-lab/persona/model';
import { generateAnchors } from '../../../lib/synthetic-lab/persona/panel';
import { answerPersona, prepareQuestion } from '../../../lib/synthetic-lab/persona/respond';
import { hashString } from '../../../lib/synthetic-lab/rng';
import type { Question } from '../../../lib/synthetic-lab/types';

export const BRIDGE_VERSION = 'lab-bridge-1';
const NUTS1: Record<string, string> = {
  GRCr101: 'attica', GRCr105: 'north', GRCr106: 'north', GRCr107: 'north', GRCr108: 'north', GRCr109: 'centre', GRCr110: 'centre',
  GRCr111: 'centre', GRCr112: 'centre', GRCr113: 'centre', GRCr102: 'islands', GRCr103: 'islands', GRCr104: 'islands'
};

interface AseRespondent {
  id: string;
  seed: number;
  age_band: string;
  gender: string;
  education: string;
  region_code: string;
  settlement: string;
  income_quintile?: number | string | null;
  household_size?: string | number | null;
  anchors?: Record<string, unknown>;
}

/** Ίδιοι κανόνες με το demographicsOf του Lab (ηλικία 18–24 → ζώνη 17–24 του μοντέλου, εκπαίδευση σε 3 επίπεδα). */
export function demographicsFromAse(r: AseRespondent): PersonaDemographics {
  const age = r.age_band === '18-24' ? '17-24' : ['25-34', '35-44', '45-54', '55-64', '65+'].includes(r.age_band) ? r.age_band : null;
  const e = r.education;
  const edu3 = e === 'tertiary' ? 'high' : e === 'upper_secondary' || e === 'lower_secondary' || e === 'post_secondary' ? 'medium' : e ? 'low' : null;
  return { age_band: age, gender: r.gender || null, edu3, nuts1: NUTS1[r.region_code] || null, urban: r.settlement === 'urban' || r.settlement === 'rural' ? r.settlement : null };
}

function household(r: AseRespondent): { incq5: number | null; hhsize5: number | null } {
  const q = r.income_quintile == null || r.income_quintile === '' ? null : Number(r.income_quintile);
  const hs = String(r.household_size ?? '');
  const size = hs === '' ? null : hs === '1' ? 1 : hs === '2' ? 2 : hs === '3-4' ? 3.5 : 5;
  return { incq5: Number.isFinite(q as number) ? (q as number) : null, hhsize5: size };
}

function modelOrThrow(v: string) {
  const m = loadPersonaModel(v);
  if (!m) throw new Error(`MODEL_UNAVAILABLE: ${v}`);
  return m;
}

function route(inp: { model: string; ref: string; questions: Question[] }) {
  const model = modelOrThrow(inp.model);
  const policy = loadEvidencePolicy();
  const idf = buildIdf(model);
  return {
    bridge: BRIDGE_VERSION, model: model.version, policy: policy ? (policy as any).version : null, autolink: AUTOLINK_VERSION,
    questions: inp.questions.map((q) => {
      const s = q.personaLink ? null : suggestLink(model, q, inp.ref, { idf });
      const qq = s && s.accepted && s.link ? { ...q, personaLink: s.link } : q;
      let pq = prepareQuestion(model, qq, inp.ref);
      const d = policy ? classifyEvidence(pq, model, policy, inp.ref, {}) : null;
      if (d) pq = applyEvidenceDecision(pq, d);
      return {
        id: q.id,
        autolink: s ? { accepted: s.accepted, confidence: s.confidence, target: s.target, reason: s.reason } : null,
        manualLink: !!q.personaLink,
        support: pq.support,
        responseModel: (pq as any).provenance?.responseModel ?? null,
        item: (pq as any).item?.id ?? null,
        decision: d ? { tier: d.tier, label: d.label, specialist: d.specialist, validated: d.validated, experimental: d.experimental, abstain: d.abstain,
          expectedMAE: d.expectedMAE, p90: d.p90, sources: d.sources, limitations: d.limitations } : null
      };
    })
  };
}

function anchors(inp: { model: string; respondents: AseRespondent[] }) {
  const model = modelOrThrow(inp.model);
  return {
    bridge: BRIDGE_VERSION, model: model.version,
    respondents: inp.respondents.map((r) => {
      const d = demographicsFromAse(r);
      const a = generateAnchors(model, d, Number(r.seed) >>> 0, household(r));
      return { id: r.id, demographics: d, anchors: a };
    })
  };
}

function answer(inp: { model: string; ref: string; questions: Question[]; respondents: AseRespondent[]; seed: number }) {
  const model = modelOrThrow(inp.model);
  const policy = loadEvidencePolicy();
  const idf = buildIdf(model);
  const prepared = inp.questions.map((q0) => {
    // ίδια αυτόματη σύνδεση με τη route (αλλιώς η απάντηση θα ακολουθούσε άλλη λογική από τη δρομολόγηση)
    const s = q0.personaLink ? null : suggestLink(model, q0, inp.ref, { idf });
    const q = s && s.accepted && s.link ? { ...q0, personaLink: s.link } : q0;
    let pq = prepareQuestion(model, q, inp.ref);
    const d = policy ? classifyEvidence(pq, model, policy, inp.ref, {}) : null;
    if (d) pq = applyEvidenceDecision(pq, d);
    return { pq, d };
  });
  const usable = prepared.filter((x) => x.pq.support !== 'NOT_RELIABLY_ESTIMABLE' && !(x.d && x.d.abstain));
  const out: Record<string, Record<string, unknown>> = {};
  for (const r of inp.respondents) {
    if (!r.anchors) throw new Error(`ANCHORS_MISSING: ${r.id}`);
    const ps = { personaId: r.id, weight: 1, demographics: demographicsFromAse(r), anchors: r.anchors as any, pseed: hashString(`pseed|${r.seed}`) };
    out[r.id] = {};
    for (const { pq, d } of usable) {
      const a = answerPersona(pq, ps as any, inp.seed);
      out[r.id][pq.q.id] = { value: a.value, skipped: a.skipped, basis: a.basis, tier: d?.tier ?? null };
    }
  }
  return { bridge: BRIDGE_VERSION, model: model.version, answered: usable.map((x) => x.pq.q.id), abstained: prepared.filter((x) => !usable.includes(x)).map((x) => x.pq.q.id), answers: out };
}

const [cmd, inPath, outPath] = process.argv.slice(2);
try {
  const inp = JSON.parse(readFileSync(inPath, 'utf8'));
  const res = cmd === 'route' ? route(inp) : cmd === 'anchors' ? anchors(inp) : cmd === 'answer' ? answer(inp) : null;
  if (!res) throw new Error(`UNKNOWN_COMMAND: ${cmd}`);
  writeFileSync(outPath, JSON.stringify({ ok: true, ...res }));
} catch (e) {
  writeFileSync(outPath, JSON.stringify({ ok: false, error: String((e as Error).message || e) }));
  process.exitCode = 2;
}
