import { fail, ok, requireLabAccess } from '@/lib/synthetic-lab/api';
import { describePersonaLong } from '@/lib/synthetic-lab/engine/persona-text';
import { defaultPopulationId, listPopulationSummaries, loadPopulation, marginals, populationAttribution } from '@/lib/synthetic-lab/population/store';
import { createRng } from '@/lib/synthetic-lab/rng';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || defaultPopulationId();
  const pop = loadPopulation(id);
  if (!pop) return fail('Ο πληθυσμός δεν βρέθηκε.', 404);
  const limit = Math.min(60, Math.max(1, Number(url.searchParams.get('limit') || 24)));
  const rng = createRng(Number(url.searchParams.get('seed') || 1));
  const sample = rng.shuffle([...pop.personas]).slice(0, limit).map((p) => ({ ...p, description: describePersonaLong(p) }));
  return ok({
    populations: listPopulationSummaries(),
    summary: pop.summary,
    attribution: populationAttribution(id),
    marginals: marginals(pop.personas),
    personas: sample
  });
}
