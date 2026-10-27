import { fail, ok, parseBody, requireLabAccess } from '@/lib/synthetic-lab/api';
import { allDatasets, freshness } from '@/lib/synthetic-lab/data/registry';
import { backtestableMetrics, latestSuite, runBacktest, runValidationSuite } from '@/lib/synthetic-lab/engine/validation';
import { loadPopulation } from '@/lib/synthetic-lab/population/store';
import { ValidationRunSchema } from '@/lib/synthetic-lab/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const gate = await requireLabAccess();
  if (gate) return gate;
  return ok({
    suite: latestSuite(),
    metrics: backtestableMetrics(),
    freshness: allDatasets().map((d) => ({ id: d.id, name: d.name, usage: d.usage, ...freshness(d) }))
  });
}

export async function POST(req: Request) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const body = await parseBody(req, ValidationRunSchema);
  if ('error' in body) return body.error;
  if (!loadPopulation(body.data.populationId)) return fail('Ο πληθυσμός δεν βρέθηκε.', 404);
  try {
    if (body.data.metric) return ok({ backtest: runBacktest({ ...body.data, metric: body.data.metric }) });
    return ok({ suite: runValidationSuite(body.data) });
  } catch (e: any) {
    return fail(String(e?.message || e), 400);
  }
}
