import ValidationDashboard from '@/components/synthetic-lab/ValidationDashboard';
import { PageTitle } from '@/components/synthetic-lab/ui';

export default function ValidationPage() {
  return (
    <div>
      <PageTitle title="Έλεγχος Αξιοπιστίας" subtitle="Πόσο κοντά είναι οι προσομοιώσεις σε πραγματικές μετρήσεις που δεν χρησιμοποιήθηκαν; Μετρήσιμα σφάλματα, όχι «σκορ εμπιστοσύνης»." />
      <ValidationDashboard />
    </div>
  );
}
