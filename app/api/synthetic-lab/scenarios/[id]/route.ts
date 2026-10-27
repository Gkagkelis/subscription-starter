import { fail, ok, requireLabAccess } from '@/lib/synthetic-lab/api';
import { loadComparison } from '@/lib/synthetic-lab/engine/scenarios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const c = loadComparison(params.id);
  if (!c) return fail('Η σύγκριση δεν βρέθηκε.', 404);
  return ok({ comparison: c });
}
