import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { liveAvailable } from '@/lib/synthetic-lab/ai/config';
import LabNav from '@/components/synthetic-lab/LabNav';
import { hasLabAccess } from '@/lib/synthetic-lab/api';

export const metadata: Metadata = {
  title: 'Greek Synthetic Research Lab',
  description: 'Συνθετική έρευνα για την Ελλάδα με διαφανή μεθοδολογία, προέλευση δεδομένων και επικύρωση.'
};

export const dynamic = 'force-dynamic';

export default async function SyntheticLabLayout({ children }: { children: ReactNode }) {
  const live = liveAvailable();
  const allowed = await hasLabAccess();
  return (
    <div lang="el" className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/synthetic-lab" className="text-lg font-semibold tracking-tight text-stone-900">
              Synthetic Research Lab
            </Link>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${live ? 'border-violet-300 bg-violet-50 text-violet-900' : 'border-stone-300 bg-stone-100 text-stone-700'}`}
              title={live ? 'Οι κλήσεις AI είναι διαθέσιμες με κλειδί πρόσβασης και όρια κόστους.' : 'Καμία εξωτερική κλήση AI — μηδενικό κόστος.'}
            >
              {live ? 'Live mode διαθέσιμο' : 'Demo mode · χωρίς AI'}
            </span>
          </div>
          <LabNav />
        </div>
      </header>
      <div className="border-b border-amber-200 bg-amber-50">
        <p className="mx-auto max-w-6xl px-4 py-2 text-xs text-amber-900 sm:px-6">
          Οι συνθετικές απαντήσεις είναι προσομοιώσεις — <strong>δεν είναι δημοσκόπηση, δεν είναι πρόβλεψη και δεν αντικαθιστούν πραγματική έρευνα</strong>.
        </p>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {allowed ? (
          children
        ) : (
          <p className="rounded-lg border border-stone-200 bg-white p-6 text-sm">
            Απαιτείται σύνδεση για το Synthetic Research Lab. <Link className="underline" href="/signin">Σύνδεση</Link>
          </p>
        )}
      </main>
    </div>
  );
}
