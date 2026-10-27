import { notFound } from 'next/navigation';
import StudyResults from '@/components/synthetic-lab/StudyResults';
import { buildReport } from '@/lib/synthetic-lab/engine/report';
import { loadDoc } from '@/lib/synthetic-lab/storage/file-store';
import type { StudyRun } from '@/lib/synthetic-lab/types';

export const dynamic = 'force-dynamic';

export default function StudyPage({ params }: { params: { id: string } }) {
  const study = loadDoc<StudyRun>('studies', params.id);
  if (!study) notFound();
  return <StudyResults study={study} report={buildReport(study)} />;
}
