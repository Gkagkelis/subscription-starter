import { notFound } from 'next/navigation';
import ScenarioResults from '@/components/synthetic-lab/ScenarioResults';
import { loadComparison } from '@/lib/synthetic-lab/engine/scenarios';

export const dynamic = 'force-dynamic';

export default function ScenarioResultPage({ params }: { params: { id: string } }) {
  const c = loadComparison(params.id);
  if (!c) notFound();
  return <ScenarioResults c={c} />;
}
