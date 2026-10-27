import { Suspense } from 'react';
import FocusGroupSetup from '@/components/synthetic-lab/FocusGroupSetup';
import { PageTitle } from '@/components/synthetic-lab/ui';

export default function FocusGroupPage() {
  return (
    <div>
      <PageTitle title="Focus Group" subtitle="Προσομοιωμένη συζήτηση συνθετικών συμμετεχόντων με συντονιστή. Ζωντανό transcript, παύση/συνέχεια, σύνθεση θεμάτων και εξαγωγή." />
      <Suspense>
        <FocusGroupSetup />
      </Suspense>
    </div>
  );
}
