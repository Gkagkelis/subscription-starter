// ============================================================
// RESEARCH REPORT BUILDER
// Κάθε ενότητα φέρει evidence kind: observed / estimate / simulation / ai.
// ============================================================

import { csvRow as csvEscapeRow } from '../csv';
import { allDatasets, freshness } from '../data/registry';
import { getMetric, latestWave, metricSourceLabel, metricTier } from '../data/noraya';
import { observedDistribution } from './evidence';
import { populationAttribution } from '../population/store';
import type { EvidenceKind, Question, QuestionAggregate, StudyRun } from '../types';
import { SIMULATED_LABEL } from '../types';
import { headlineLabel } from './aggregate';
import { basisLabel } from './demo-responder';

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  observed: 'Παρατηρημένα δεδομένα',
  estimate: 'Στατιστική εκτίμηση',
  simulation: 'Συνθετική προσομοίωση',
  ai: 'Ερμηνεία AI'
};

export interface ReportSection {
  id: string;
  title: string;
  evidence: EvidenceKind | null;
  paragraphs: string[];
  bullets?: string[];
}

export interface StudyReport {
  title: string;
  label: string;
  generatedAt: string;
  studyId: string;
  sections: ReportSection[];
}

function topLine(q: Question, a: QuestionAggregate): string {
  if (a.shares?.length) {
    const top = [...a.shares].sort((x, y) => y.share - x.share)[0];
    return `«${top.option}»: ${top.share}% (95% διάστημα προσομοίωσης ${top.ciLow}–${top.ciHigh}%)`;
  }
  if (a.priceCurve?.length) return a.priceCurve.map((p) => `${p.price}€ → ${p.acceptance}%`).join(', ');
  if (a.rankingScores?.length) {
    const best = [...a.rankingScores].sort((x, y) => x.meanRank - y.meanRank)[0];
    return `Πρώτη στην κατάταξη: «${best.option}» (μέση θέση ${best.meanRank})`;
  }
  if (a.openThemes?.length) return `Συχνότερα θέματα: ${a.openThemes.slice(0, 3).map((t) => `${t.theme} (${t.count})`).join(', ')}`;
  return '—';
}

export function buildReport(run: StudyRun): StudyReport {
  const qs = run.plan.questions;
  const linked = qs.filter((q) => q.evidenceLink);
  const datasets = allDatasets().filter((d) => run.datasetsUsed.includes(d.id));
  const s: ReportSection[] = [];

  s.push({
    id: 'question',
    title: '1. Ερευνητικό ερώτημα',
    evidence: null,
    paragraphs: [run.plan.researchQuestion, `Τομέας: ${run.plan.domain === 'consumer' ? 'Καταναλωτική έρευνα' : 'Κοινωνική έρευνα & δημόσιες πολιτικές'}.`]
  });

  const empiricalShare = run.aggregates.length ? Math.round(run.aggregates.reduce((acc, a) => acc + a.basisMix.empirical_prior, 0) / run.aggregates.length) : 0;
  s.push({
    id: 'summary',
    title: '2. Σύνοψη',
    evidence: 'simulation',
    paragraphs: [
      `${SIMULATED_LABEL}. Εκτελέστηκε συνθετική έρευνα με ${run.respondentCount} συνθετικούς ερωτώμενους από τον πληθυσμό «${run.populationSummary.name}» (έτος αναφοράς ${run.populationSummary.referenceYear || '—'}).`,
      `Περίπου ${empiricalShare}% των απαντήσεων έχουν εμπειρική βάση (εκτίμηση από πραγματική έρευνα)· οι υπόλοιπες βασίζονται σε δηλωμένες παραδοχές ή είναι ουδέτερες.`,
      run.validation.message
    ],
    bullets: run.aggregates.filter((a) => a.n > 0).slice(0, 6).map((a) => {
      const q = qs.find((x) => x.id === a.questionId)!;
      return `${q.text} — ${topLine(q, a)}`;
    })
  });

  s.push({
    id: 'data',
    title: '3. Δεδομένα που χρησιμοποιήθηκαν',
    evidence: 'observed',
    paragraphs: [
      ...datasets.map((d) => `${d.name} — ${d.organization}. Έτη συλλογής: ${d.collectionYears ? d.collectionYears.join('–') : 'άγνωστα'}. ${freshness(d).label}. Άδεια: ${d.license}.`),
      ...(linked.some((q) => metricTier(q.evidenceLink!.metric) === 'research_only')
        ? ['ΜΟΝΟ ΓΙΑ ΕΡΕΥΝΗΤΙΚΗ ΧΡΗΣΗ: η μελέτη χρησιμοποιεί δεδομένα που επιτρέπονται μόνο για μη εμπορική έρευνα με αναφορά πηγής. Για εμπορική χρήση των αποτελεσμάτων απαιτείται άδεια από τον κάτοχο των δεδομένων.']
        : [])
    ],
    bullets: linked.map((q) => {
      const dist = observedDistribution(q);
      if (dist.length) {
        const src = metricSourceLabel(q.evidenceLink!.metric);
        return `${q.id}: «${q.text}» — ${src}, κύμα ${dist[0].waveKey} (n=${dist[0].n}): ${dist.map((d) => `«${d.option}» ${d.value}%`).join(', ')}.`;
      }
      const m = getMetric(q.evidenceLink!.metric);
      const w = latestWave(q.evidenceLink!.metric);
      return `${q.id}: «${m?.label}» — κύμα ${w?.key}, συνολικό παρατηρημένο ποσοστό ${w?.groups.all?.all?.value}% (n=${w?.groups.all?.all?.n}).`;
    })
  });

  s.push({
    id: 'population',
    title: '4. Συνθετικός πληθυσμός',
    evidence: 'estimate',
    paragraphs: [
      `${run.populationSummary.name}. Αντιπροσωπεύει ${run.populationSummary.representedPopulation.toLocaleString('el-GR')} άτομα (έτος αναφοράς ${run.populationSummary.referenceYear}).`,
      run.populationSummary.updateStatus.message,
      `Κοινό: ${audienceText(run)}. Επιλογή: στρωματοποιημένη ανά περιφέρεια, seed ${run.seed}.`,
      populationAttribution(run.populationId)
    ],
    bullets: run.populationSummary.qualityNotes
  });

  s.push({
    id: 'method',
    title: '5. Μεθοδολογία',
    evidence: null,
    paragraphs: [
      run.engine.mode === 'demo'
        ? 'Λειτουργία demo: χωρίς κλήσεις AI. Ερωτήσεις συνδεδεμένες με δείκτη Eurobarometer απαντώνται με πιθανότητα από μοντέλο κύριων επιδράσεων (logit) προσαρμοσμένο στα παρατηρημένα ποσοστά ανά ηλικία, φύλο και μόρφωση. Οι υπόλοιπες ερωτήσεις ακολουθούν ρητές παραδοχές ή ουδέτερη κατανομή. Τα ελεύθερα κείμενα είναι πρότυπα.'
        : `Λειτουργία live: κάθε συνθετικός ερωτώμενος απαντά μέσω μοντέλου AI (${run.engine.model}) με βάση το δημογραφικό του προφίλ και, όπου υπάρχουν, εμπειρικά στοιχεία ομάδας.`,
      `Έκδοση μηχανής: ${run.engine.engineVersion}. Planner: ${run.plan.plannerVersion}.`
    ],
    bullets: run.plan.assumptions.map((a) => `${a.enabled ? '✓' : '✗'} ${a.title}${a.value != null ? ` = ${a.value}` : ''} (${a.source === 'researcher' ? 'ερευνητής' : 'προεπιλεγμένη παραδοχή'}) — ${a.description}`)
  });

  s.push({
    id: 'results',
    title: '6–7. Αποτελέσματα και γραφήματα',
    evidence: 'simulation',
    paragraphs: ['Τα διαστήματα αφορούν μόνο τη μεταβλητότητα της προσομοίωσης — όχι το σφάλμα του μοντέλου ή τη διαφορά από την πραγματικότητα.'],
    bullets: run.aggregates.map((a) => {
      const q = qs.find((x) => x.id === a.questionId)!;
      const mix = Object.entries(a.basisMix).filter(([, v]) => v > 0).map(([k, v]) => `${basisLabel(k as any)} ${v}%`).join(', ');
      return `${q.id} (${a.n} απαντήσεις, effective n ${a.effectiveN}): ${topLine(q, a)} [${EVIDENCE_LABEL[a.evidenceKind]}; βάση: ${mix || '—'}]`;
    })
  });

  const segBullets: string[] = [];
  run.aggregates.forEach((a) => {
    const q = qs.find((x) => x.id === a.questionId)!;
    if (!a.bySegment || q.type === 'open_ended') return;
    const inc = a.bySegment.incomeQuintile?.filter((x) => x.headline !== null && x.n >= 20) || [];
    if (inc.length >= 2) {
      const sorted = [...inc].sort((x, y) => (y.headline || 0) - (x.headline || 0));
      segBullets.push(`${q.id}: ${headlineLabel(q)} υψηλότερο σε «${sorted[0].segment}» (${sorted[0].headline}%), χαμηλότερο σε «${sorted[sorted.length - 1].segment}» (${sorted[sorted.length - 1].headline}%).`);
    }
  });
  s.push({
    id: 'findings',
    title: '8. Κύρια προσομοιωμένα ευρήματα',
    evidence: 'simulation',
    paragraphs: ['Οι διαφορές μεταξύ ομάδων αντανακλούν το μοντέλο και τις παραδοχές του· δεν είναι μετρημένες διαφορές της ελληνικής κοινωνίας.'],
    bullets: segBullets.length ? segBullets : ['Δεν εντοπίστηκαν αξιοσημείωτες διαφορές μεταξύ ομάδων με επαρκές n.']
  });

  const open = run.aggregates.filter((a) => a.openThemes?.length);
  s.push({
    id: 'objections',
    title: '9. Πιθανές αντιρρήσεις ή διαφορετικές αποκρίσεις',
    evidence: run.engine.mode === 'live' ? 'ai' : 'simulation',
    paragraphs: [run.engine.mode === 'demo' ? 'Στη λειτουργία demo τα κείμενα είναι πρότυπα — χρήσιμα μόνο ως λίστα υποθέσεων για πραγματική έρευνα.' : 'Τα κείμενα παράχθηκαν από AI και ΔΕΝ είναι πραγματικές συνεντεύξεις.'],
    bullets: open.flatMap((a) => a.openThemes!.slice(0, 4).map((t) => `${t.theme}: ${t.count} αναφορές${t.examples[0] ? ` — π.χ. «${t.examples[0]}»` : ''}`))
  });

  s.push({
    id: 'validation',
    title: '10. Αποτελέσματα επικύρωσης',
    evidence: 'observed',
    paragraphs: [run.validation.message],
    bullets: run.stability
      ? [`Σταθερότητα (${run.stability.runs} επαναλήψεις με άλλα seeds): μέγιστη τυπική απόκλιση ποσοστού ${run.stability.maxSd} π.μ.`]
      : []
  });

  s.push({
    id: 'limits',
    title: '11. Περιορισμοί και αβεβαιότητες',
    evidence: null,
    paragraphs: ['Οι συνθετικές απαντήσεις δεν είναι δημοσκόπηση, δεν είναι πρόβλεψη και δεν αντικαθιστούν πραγματική έρευνα.'],
    bullets: run.warnings
  });

  s.push({
    id: 'next',
    title: '12. Προτεινόμενες επόμενες πραγματικές έρευνες',
    evidence: null,
    paragraphs: [],
    bullets: [
      'Πιλοτική έρευνα με πραγματικό δείγμα (π.χ. 300–500 online, με ποσοστώσεις ηλικίας/φύλου/περιφέρειας) για τις βασικές ερωτήσεις.',
      run.plan.domain === 'consumer'
        ? 'Έρευνα τιμολόγησης (π.χ. Van Westendorp ή conjoint) με πραγματικούς καταναλωτές της κατηγορίας.'
        : 'Ποιοτική έρευνα με εκπροσώπους των ομάδων που επηρεάζονται περισσότερο.',
      'Πραγματικά focus groups για τα θέματα με τη μεγαλύτερη απόκλιση/αβεβαιότητα.',
      'Επικαιροποίηση πληθυσμού με νεότερα στοιχεία ΕΛΣΤΑΤ πριν από αποφάσεις.'
    ]
  });

  s.push({
    id: 'sources',
    title: '13. Πηγές και αδειοδοτήσεις',
    evidence: 'observed',
    paragraphs: datasets.map((d) => `${d.name}: ${d.license}${d.sourceUrl ? ` — ${d.sourceUrl}` : ''}. Εμπορική χρήση: ${commercial(d.commercialUse)}.`),
    bullets: ['Μεθοδολογικές ιδέες από open-source έργα (ανεξάρτητη υλοποίηση, χωρίς αντιγραφή κώδικα): βλ. docs/synthetic-lab/DATA_SOURCES.md.']
  });

  return { title: run.plan.title, label: SIMULATED_LABEL, generatedAt: new Date().toISOString(), studyId: run.id, sections: s };
}

function commercial(c: string) {
  return { allowed: 'επιτρέπεται', allowed_with_attribution: 'επιτρέπεται με αναφορά', unclear: 'ασαφής — απαιτείται έλεγχος', not_allowed: 'δεν επιτρέπεται' }[c] || c;
}

function audienceText(run: StudyRun): string {
  const a = run.plan.audience;
  const parts: string[] = [];
  if (a.minAge !== undefined || a.maxAge !== undefined) parts.push(`ηλικία ${a.minAge ?? 0}–${a.maxAge ?? '…'}`);
  if (a.genders?.length) parts.push(`φύλο: ${a.genders.join(', ')}`);
  if (a.regions?.length) parts.push(`περιφέρειες: ${a.regions.length}`);
  if (a.settlements?.length) parts.push(`περιοχή: ${a.settlements.join(', ')}`);
  if (a.educations?.length) parts.push(`εκπαίδευση: ${a.educations.length} επίπεδα`);
  if (a.incomeQuintiles?.length) parts.push(`εισοδηματικά πεμπτημόρια: ${a.incomeQuintiles.join(', ')}`);
  return parts.join(' · ') || 'όλος ο πληθυσμός';
}

export function reportMarkdown(r: StudyReport): string {
  const out = [`# ${r.title}`, '', `> **${r.label}**`, '', `Αναφορά μελέτης ${r.studyId} — ${new Date(r.generatedAt).toLocaleString('el-GR')}`, ''];
  r.sections.forEach((sec) => {
    out.push(`## ${sec.title}${sec.evidence ? ` _[${EVIDENCE_LABEL[sec.evidence]}]_` : ''}`, '');
    sec.paragraphs.forEach((p) => out.push(p, ''));
    sec.bullets?.forEach((b) => out.push(`- ${b}`));
    if (sec.bullets?.length) out.push('');
  });
  return out.join('\n');
}

export function reportHtmlDocument(r: StudyReport): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = r.sections
    .map(
      (sec) =>
        `<h2>${esc(sec.title)}${sec.evidence ? ` <small>[${esc(EVIDENCE_LABEL[sec.evidence])}]</small>` : ''}</h2>` +
        sec.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('') +
        (sec.bullets?.length ? `<ul>${sec.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '')
    )
    .join('\n');
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><title>${esc(r.title)}</title></head><body style="font-family:Calibri,Arial,sans-serif"><h1>${esc(r.title)}</h1><p><b>${esc(r.label)}</b></p>${body}</body></html>`;
}

/** Όλες οι συνθετικές απαντήσεις σε CSV (μία γραμμή ανά ερωτώμενο × ερώτηση). */
export function responsesCsv(run: StudyRun): string {
  const header = ['label', 'study_id', 'persona_id', 'weight', 'question_id', 'question_type', 'skipped', 'basis', 'answer', 'rationale'];
  const rows: string[] = [csvEscapeRow(header)];
  run.respondents.forEach((r) =>
    r.answers.forEach((a) => {
      const q = run.plan.questions.find((x) => x.id === a.questionId);
      const v = a.value;
      const answer = !v
        ? ''
        : v.choice ?? (v.choices ? v.choices.join(' | ') : v.ranking ? v.ranking.join(' > ') : v.scaleIndex !== undefined ? (q?.scale || [])[v.scaleIndex] ?? String(v.scaleIndex) : v.priceAcceptance ? Object.entries(v.priceAcceptance).filter(([, ok]) => ok).map(([p]) => p).join(' | ') : v.text ?? '');
      rows.push(csvEscapeRow([r.label, run.id, r.personaId, r.weight.toFixed(2), a.questionId, q?.type || '', a.skipped ? '1' : '0', a.basis, answer, a.rationale || '']));
    })
  );
  return rows.join('\n') + '\n';
}

/** Συγκεντρωτικά αποτελέσματα σε CSV. */
export function aggregatesCsv(run: StudyRun): string {
  const header = ['label', 'question_id', 'question', 'option', 'share_pct', 'ci_low', 'ci_high', 'n', 'effective_n', 'evidence_kind'];
  const rows = [csvEscapeRow(header)];
  run.aggregates.forEach((a) => {
    const q = run.plan.questions.find((x) => x.id === a.questionId)!;
    (a.shares || []).forEach((s) => rows.push(csvEscapeRow([SIMULATED_LABEL, a.questionId, q.text, s.option, s.share, s.ciLow, s.ciHigh, a.n, a.effectiveN, a.evidenceKind])));
    (a.priceCurve || []).forEach((p) => rows.push(csvEscapeRow([SIMULATED_LABEL, a.questionId, q.text, `${p.price}€`, p.acceptance, p.ciLow, p.ciHigh, a.n, a.effectiveN, a.evidenceKind])));
    (a.rankingScores || []).forEach((p) => rows.push(csvEscapeRow([SIMULATED_LABEL, a.questionId, q.text, `${p.option} (μέση θέση ${p.meanRank})`, p.firstPlaceShare, '', '', a.n, a.effectiveN, a.evidenceKind])));
  });
  return rows.join('\n') + '\n';
}
