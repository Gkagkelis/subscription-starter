import { fail, ok, parseBody, requireLabAccess, resolveMode } from '@/lib/synthetic-lab/api';
import { compareScenarios, listComparisons } from '@/lib/synthetic-lab/engine/scenarios';
import { loadPopulation } from '@/lib/synthetic-lab/population/store';
import { CompareSchema } from '@/lib/synthetic-lab/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const gate = await requireLabAccess();
  if (gate) return gate;
  return ok({
    comparisons: listComparisons().map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt, status: c.status, scenarios: c.scenarios.length }))
  });
}

export async function POST(req: Request) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const body = await parseBody(req, CompareSchema);
  if ('error' in body) return body.error;
  if (!loadPopulation(body.data.populationId)) return fail('Ο πληθυσμός δεν βρέθηκε.', 404);
  const m = resolveMode(req, body.data.mode);
  if (m.error) return m.error;
  try {
    const c = await compareScenarios({ ...body.data, mode: m.mode });
    if (m.note) c.warnings.unshift(m.note);
    return ok({ id: c.id, status: c.status, warnings: c.warnings });
  } catch (e: any) {
    return fail(String(e?.message || e), 400);
  }
}
