import { fail, ok, requireLabAccess } from '@/lib/synthetic-lab/api';
import { controlFocusGroup } from '@/lib/synthetic-lab/engine/focus-group';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (!['pause', 'resume', 'cancel'].includes(action)) return fail('Άγνωστη ενέργεια.');
  try {
    return ok({ session: controlFocusGroup(params.id, action) });
  } catch (e: any) {
    return fail(String(e?.message || e), 404);
  }
}
