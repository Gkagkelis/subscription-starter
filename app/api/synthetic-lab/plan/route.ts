import { fail, ok, parseBody, requireLabAccess } from '@/lib/synthetic-lab/api';
import { planStudy } from '@/lib/synthetic-lab/engine/planner';
import { PlanRequestSchema } from '@/lib/synthetic-lab/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Προτείνει σχέδιο έρευνας από φυσική γλώσσα (κανόνες, χωρίς κόστος AI).
export async function POST(req: Request) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const body = await parseBody(req, PlanRequestSchema);
  if ('error' in body) return body.error;
  const r = planStudy(body.data);
  if (r.blocked) return fail(r.blockedReasons.join(' '), 422, { blocked: true, blockedReasons: r.blockedReasons });
  return ok(r);
}
