import BenchmarkPanel from '@/components/synthetic-lab/BenchmarkPanel';
import ValidationDashboard from '@/components/synthetic-lab/ValidationDashboard';

export const dynamic = 'force-dynamic';
import { PageTitle } from '@/components/synthetic-lab/ui';

export default function ValidationPage() {
  return (
    <div>
      <PageTitle title="Έλεγχος Αξιοπιστίας" subtitle="Πόσο κοντά είναι οι προσομοιώσεις σε πραγματικές μετρήσεις που δεν χρησιμοποιήθηκαν; Μετρήσιμα σφάλματα, όχι «σκορ εμπιστοσύνης»." />
      <ValidationDashboard />
      <div className="mt-6">
        <BenchmarkPanel />
      </div>
    </div>
  );
}
