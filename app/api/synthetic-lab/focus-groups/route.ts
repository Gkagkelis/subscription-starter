import { fail, ok, parseBody, requireLabAccess, resolveMode } from '@/lib/synthetic-lab/api';
import { createFocusGroup, type FocusSession } from '@/lib/synthetic-lab/engine/focus-group';
import { loadPopulation } from '@/lib/synthetic-lab/population/store';
import { FocusCreateSchema } from '@/lib/synthetic-lab/schemas';
import { listDocs } from '@/lib/synthetic-lab/storage/file-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const sessions = listDocs<FocusSession>('focus-groups').map((s) => ({
    id: s.id, topic: s.topic, status: s.status, createdAt: s.createdAt, participants: s.participants.length, mode: s.mode
  }));
  return ok({ sessions });
}

export async function POST(req: Request) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const body = await parseBody(req, FocusCreateSchema);
  if ('error' in body) return body.error;
  if (!loadPopulation(body.data.populationId)) return fail('Ο πληθυσμός δεν βρέθηκε.', 404);
  const m = resolveMode(req, body.data.mode);
  if (m.error) return m.error;
  try {
    const s = createFocusGroup({ ...body.data, mode: m.mode });
    if (m.note) s.warnings.unshift(m.note);
    return ok({ id: s.id, status: s.status, warnings: s.warnings });
  } catch (e: any) {
    return fail(String(e?.message || e), 400);
  }
}
