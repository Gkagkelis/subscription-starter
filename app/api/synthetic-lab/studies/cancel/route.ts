import { fail, ok, requireLabAccess } from '@/lib/synthetic-lab/api';
import { cancelRun } from '@/lib/synthetic-lab/ai/live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ακύρωση live εκτέλεσης που τρέχει (στο ίδιο instance του server).
export async function POST(req: Request) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const body = await req.json().catch(() => ({}));
  const runId = String(body?.runId || '');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(runId)) return fail('Μη έγκυρο runId.');
  return ok({ cancelled: cancelRun(runId) });
}
