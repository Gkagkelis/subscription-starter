import { fail, ok, parseBody, requireLabAccess, resolveMode } from '@/lib/synthetic-lab/api';
import { runSurvey } from '@/lib/synthetic-lab/engine/survey';
import { loadPopulation } from '@/lib/synthetic-lab/population/store';
import { RunStudySchema } from '@/lib/synthetic-lab/schemas';
import { listDocs, newId } from '@/lib/synthetic-lab/storage/file-store';
import type { StudyRun } from '@/lib/synthetic-lab/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const studies = listDocs<StudyRun>('studies').map((s) => ({
    id: s.id,
    title: s.plan.title,
    domain: s.plan.domain,
    status: s.status,
    createdAt: s.createdAt,
    respondents: s.respondentCount,
    mode: s.engine.mode,
    validation: s.validation.status
  }));
  return ok({ studies });
}

export async function POST(req: Request) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const body = await parseBody(req, RunStudySchema);
  if ('error' in body) return body.error;
  const { plan, populationId, seed, model, costCapUsd } = body.data;
  if (!loadPopulation(populationId)) return fail('Ο πληθυσμός δεν βρέθηκε.', 404);
  const m = resolveMode(req, body.data.mode);
  if (m.error) return m.error;
  if (m.note) plan.warnings = [...plan.warnings, m.note];
  const runId = newId('study');
  try {
    const run = await runSurvey({ plan, populationId, seed, mode: m.mode, model, costCapUsd, runId });
    return ok({ id: run.id, status: run.status, warnings: run.warnings });
  } catch (e: any) {
    return fail(`Η εκτέλεση απέτυχε: ${String(e?.message || e)}`, 500);
  }
}
