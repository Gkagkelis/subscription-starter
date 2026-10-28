import { describe, expect, it } from 'vitest';
import { POST as planPOST } from '@/app/api/synthetic-lab/plan/route';
import { GET as statusGET } from '@/app/api/synthetic-lab/status/route';
import { GET as studiesGET, POST as studiesPOST } from '@/app/api/synthetic-lab/studies/route';
import { GET as studyGET } from '@/app/api/synthetic-lab/studies/[id]/route';
import { GET as exportGET } from '@/app/api/synthetic-lab/studies/[id]/export/route';
import { POST as datasetsPOST, GET as datasetsGET } from '@/app/api/synthetic-lab/datasets/route';
import { POST as fgPOST } from '@/app/api/synthetic-lab/focus-groups/route';
import { POST as fgStep } from '@/app/api/synthetic-lab/focus-groups/[id]/step/route';
import { BASELINE_POPULATION_ID, clearPopulationCache, loadPopulation, DEFAULT_POPULATION_ID } from '@/lib/synthetic-lab/population/store';

const json = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('API', () => {
  it('status reports demo mode and populations', async () => {
    const d = await (await statusGET()).json();
    expect(d.ok).toBe(true);
    expect(d.mode.liveAvailable).toBe(false);
    expect(d.defaultPopulationId).toBe(DEFAULT_POPULATION_ID);
  });

  it('plan -> run -> fetch -> export (full research flow)', async () => {
    const p = await (await planPOST(json('http://x/api/synthetic-lab/plan', { text: 'Θέλω να δοκιμάσω ένα νέο πρόγραμμα κινητής τηλεφωνίας που κοστίζει 25€ τον μήνα' }))).json();
    expect(p.ok).toBe(true);
    // ζητάμε live χωρίς άδεια: πρέπει να εκτελεστεί σε demo με εξήγηση
    const run = await (
      await studiesPOST(json('http://x/api/synthetic-lab/studies', { plan: { ...p.plan, sampleSize: 200 }, populationId: DEFAULT_POPULATION_ID, seed: 9, mode: 'live' }))
    ).json();
    expect(run.ok).toBe(true);
    expect(run.warnings.join(' ')).toMatch(/demo mode/);
    const got = await (await studyGET(new Request('http://x'), { params: { id: run.id } })).json();
    expect(got.study.engine.mode).toBe('demo');
    expect(got.study.respondentCount).toBe(200);
    expect(got.report.sections.length).toBe(13); // + «3β. Προέλευση παραμέτρων»;
    const bytes = new Uint8Array(await (await exportGET(new Request('http://x?format=csv'), { params: { id: run.id } })).arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]); // BOM για Excel
    const csv = new TextDecoder().decode(bytes);
    expect(csv).toContain('SIMULATED RESPONSE — NOT HUMAN SURVEY DATA');
    const doc = await exportGET(new Request('http://x?format=doc'), { params: { id: run.id } });
    expect(doc.headers.get('content-type')).toMatch(/msword/);
    const list = await (await studiesGET()).json();
    expect(list.studies.some((s: any) => s.id === run.id)).toBe(true);
  });

  it('accepts political requests, rejects voter suppression with 422 and invalid input with 400', async () => {
    const ok = await planPOST(json('http://x', { text: 'Πρόθεση ψήφου για τις εκλογές' }));
    expect(ok.status).toBe(200);
    const r = await planPOST(json('http://x', { text: 'Πώς να αποθαρρύνουμε τους συνταξιούχους να μην ψηφίσουν' }));
    expect(r.status).toBe(422);
    const bad = await studiesPOST(json('http://x', { plan: { title: 'x' }, populationId: 'p' }));
    expect(bad.status).toBe(400);
    const id = await studyGET(new Request('http://x'), { params: { id: '../../etc/passwd' } });
    expect(id.status).toBe(404);
  });

  it('imports calibration targets privately and recalibrates the population', async () => {
    const year = new Date().getFullYear();
    const r = await datasetsPOST(
      json('http://x', {
        kind: 'calibration_targets',
        name: 'Δοκιμαστικοί στόχοι',
        organization: 'Test',
        collectionYear: year,
        license: 'CC BY 4.0',
        commercialUse: 'allowed_with_attribution',
        csv: 'attribute,category,value\ngender,female,52\ngender,male,48\n'
      })
    );
    const d = await r.json();
    expect(d.ok).toBe(true);
    clearPopulationCache();
    const pop = loadPopulation(BASELINE_POPULATION_ID)!;
    expect(pop.summary.updateStatus.calibrated).toBe(true);
    expect(pop.summary.updateStatus.message).toMatch(/Μερική βαθμονόμηση/);
    const list = await (await datasetsGET()).json();
    expect(list.datasets.some((x: any) => x.id === d.meta.id)).toBe(true);
    // προσωπικά δεδομένα απορρίπτονται
    const pii = await datasetsPOST(json('http://x', { kind: 'aggregate_survey', name: 'PII', organization: 'x', collectionYear: 2024, license: 'x', commercialUse: 'unclear', csv: 'name,email\na,b@c.d\n' }));
    expect(pii.status).toBe(400);
  });

  it('focus group API creates and steps a session', async () => {
    const c = await (
      await fgPOST(json('http://x', { topic: 'Δημοτικά ποδήλατα', domain: 'social_policy', guide: ['Πρώτη αντίδραση;'], participants: 3, populationId: DEFAULT_POPULATION_ID }))
    ).json();
    expect(c.ok).toBe(true);
    const s = await (await fgStep(new Request('http://x?n=10', { method: 'POST' }), { params: { id: c.id } })).json();
    expect(s.session.status).toBe('completed');
  });
});
