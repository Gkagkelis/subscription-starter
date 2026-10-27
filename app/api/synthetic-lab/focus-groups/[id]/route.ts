import { fail, ok, requireLabAccess } from '@/lib/synthetic-lab/api';
import { loadFocusGroup } from '@/lib/synthetic-lab/engine/focus-group';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const s = loadFocusGroup(params.id);
  if (!s) return fail('Το focus group δεν βρέθηκε.', 404);
  return ok({ session: s });
}
