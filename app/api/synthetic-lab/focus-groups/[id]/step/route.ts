import { fail, ok, requireLabAccess } from '@/lib/synthetic-lab/api';
import { liveAuthorized } from '@/lib/synthetic-lab/ai/config';
import { loadFocusGroup, stepFocusGroup } from '@/lib/synthetic-lab/engine/focus-group';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Προχωρά τη συζήτηση κατά λίγα βήματα (η κατάσταση αποθηκεύεται μετά από κάθε κλήση).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const s0 = loadFocusGroup(params.id);
  if (!s0) return fail('Το focus group δεν βρέθηκε.', 404);
  if (s0.mode === 'live' && !liveAuthorized(req)) return fail('Live focus group: απαιτείται κλειδί πρόσβασης.', 403);
  const url = new URL(req.url);
  const n = Math.max(1, Math.min(s0.mode === 'live' ? 2 : 10, Number(url.searchParams.get('n') || 1)));
  try {
    const s = await stepFocusGroup(params.id, n);
    return ok({ session: s });
  } catch (e: any) {
    return fail(String(e?.message || e), 500);
  }
}
