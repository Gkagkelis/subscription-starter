import { Suspense } from 'react';
import NewStudyWizard from '@/components/synthetic-lab/NewStudyWizard';
import { PageTitle } from '@/components/synthetic-lab/ui';

export default function NewStudyPage() {
  return (
    <div>
      <PageTitle title="Νέα Έρευνα" subtitle="Πέντε απλά βήματα: θέμα, κοινό, ερωτηματολόγιο, παραδοχές και εκτέλεση. Τίποτα δεν εκτελείται πριν το εγκρίνετε." />
      <Suspense>
        <NewStudyWizard />
      </Suspense>
    </div>
  );
}
