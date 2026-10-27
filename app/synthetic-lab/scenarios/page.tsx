import { Suspense } from 'react';
import ScenarioForm from '@/components/synthetic-lab/ScenarioForm';
import { PageTitle } from '@/components/synthetic-lab/ui';

export default function ScenariosPage() {
  return (
    <div>
      <PageTitle title="Σύγκριση Σεναρίων" subtitle="Συγκρίνετε δύο έως πέντε εκδοχές ενός προϊόντος, μιας υπηρεσίας ή μιας υποθετικής δημόσιας πολιτικής, στο ίδιο συνθετικό δείγμα." />
      <Suspense>
        <ScenarioForm />
      </Suspense>
    </div>
  );
}
