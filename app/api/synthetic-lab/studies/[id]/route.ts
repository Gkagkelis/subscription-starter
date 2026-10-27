import { fail, ok, requireLabAccess } from '@/lib/synthetic-lab/api';
import { buildReport } from '@/lib/synthetic-lab/engine/report';
import { loadDoc } from '@/lib/synthetic-lab/storage/file-store';
import type { StudyRun } from '@/lib/synthetic-lab/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const run = loadDoc<StudyRun>('studies', params.id);
  if (!run) return fail('Η μελέτη δεν βρέθηκε.', 404);
  return ok({ study: run, report: buildReport(run) });
}
