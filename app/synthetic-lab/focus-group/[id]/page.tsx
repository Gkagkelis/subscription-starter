import { notFound } from 'next/navigation';
import FocusGroupSessionView from '@/components/synthetic-lab/FocusGroupSession';
import { loadFocusGroup } from '@/lib/synthetic-lab/engine/focus-group';

export const dynamic = 'force-dynamic';

export default function FocusGroupSessionPage({ params }: { params: { id: string } }) {
  const s = loadFocusGroup(params.id);
  if (!s) notFound();
  return <FocusGroupSessionView initial={s} />;
}
