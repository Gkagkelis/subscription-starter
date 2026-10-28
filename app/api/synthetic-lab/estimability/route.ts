import { z } from 'zod';
import { ok, fail, parseBody, requireLabAccess } from '@/lib/synthetic-lab/api';
import { evidenceContextForPlan, fitPriorsForQuestions } from '@/lib/synthetic-lab/engine/survey';
import { prepareEvidence, summarizeEstimability } from '@/lib/synthetic-lab/engine/evidence-responder';
import { PRODUCTION_MODEL } from '@/lib/synthetic-lab/engine/model-config';
import { loadPopulation } from '@/lib/synthetic-lab/population/store';
import { PlanSchema } from '@/lib/synthetic-lab/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ plan: PlanSchema, populationId: z.string().trim().max(100) });

/** Έλεγχος εκτιμησιμότητας (μηχανισμός «Τεκμηριωμένη πρόβλεψη»): τι μπορεί να εκτιμηθεί, πριν από την εκτέλεση. */
export async function POST(req: Request) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const body = await parseBody(req, Body);
  if ('error' in body) return body.error;
  const { plan, populationId } = body.data;
  const pop = loadPopulation(populationId);
  if (!pop) return fail('Ο πληθυσμός δεν βρέθηκε.', 404);
  const ctx = { ...evidenceContextForPlan(plan), wavePolicy: PRODUCTION_MODEL.wavePolicy };
  const { fits } = fitPriorsForQuestions(plan.questions, pop.personas, [], ctx);
  return ok(summarizeEstimability(prepareEvidence(plan.questions, pop.personas, fits, ctx)));
}
