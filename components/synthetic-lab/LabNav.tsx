'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const LAB_SECTIONS = [
  { href: '/synthetic-lab/new', label: 'Νέα Έρευνα' },
  { href: '/synthetic-lab/focus-group', label: 'Focus Group' },
  { href: '/synthetic-lab/scenarios', label: 'Σύγκριση Σεναρίων' },
  { href: '/synthetic-lab/population', label: 'Πληθυσμός & Κοινά' },
  { href: '/synthetic-lab/data', label: 'Τα Δεδομένα μου' },
  { href: '/synthetic-lab/validation', label: 'Έλεγχος Αξιοπιστίας' }
];

export default function LabNav() {
  const path = usePathname() || '';
  return (
    <nav className="-mx-1 flex flex-wrap gap-1" aria-label="Ενότητες Lab">
      {LAB_SECTIONS.map((s) => {
        const active = path === s.href || path.startsWith(s.href + '/');
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${active ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'}`}
          >
            {s.label}
          </Link>
        );
      })}
      <Link href="/synthetic-lab/studies" className={`rounded-lg px-3 py-1.5 text-sm ${path.startsWith('/synthetic-lab/studies') ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'}`}>
        Μελέτες
      </Link>
    </nav>
  );
}
