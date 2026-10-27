import Link from 'next/link';
import { listDocs } from '@/lib/synthetic-lab/storage/file-store';
import type { StudyRun } from '@/lib/synthetic-lab/types';
import type { FocusSession } from '@/lib/synthetic-lab/engine/focus-group';
import type { ScenarioComparison } from '@/lib/synthetic-lab/engine/scenarios';
import { Card, LinkButton, PageTitle } from '@/components/synthetic-lab/ui';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = { completed: 'Ολοκληρώθηκε', blocked: 'Μπλοκαρίστηκε', cancelled: 'Ακυρώθηκε', failed: 'Απέτυχε', running: 'Σε εξέλιξη', paused: 'Σε παύση', ready: 'Έτοιμο' };

export default function StudiesPage() {
  const studies = listDocs<StudyRun>('studies');
  const groups = listDocs<FocusSession>('focus-groups');
  const comps = listDocs<ScenarioComparison>('scenarios');
  const row = 'flex flex-col gap-1 px-5 py-3 hover:bg-stone-50 sm:flex-row sm:items-center sm:justify-between';
  return (
    <div className="space-y-8">
      <PageTitle title="Μελέτες" subtitle="Όλες οι εκτελέσεις αποθηκεύονται ιδιωτικά (.synthetic-lab-data), με πλήρεις απαντήσεις, παραδοχές και seed.">
        <LinkButton href="/synthetic-lab/new" variant="primary">
          Νέα Έρευνα
        </LinkButton>
      </PageTitle>
      <section>
        <h2 className="mb-2 font-semibold">Συνθετικές έρευνες</h2>
        <Card className="divide-y divide-stone-100 p-0">
          {studies.length === 0 && <p className="p-5 text-sm text-stone-500">Καμία μελέτη.</p>}
          {studies.map((s) => (
            <Link key={s.id} href={`/synthetic-lab/studies/${s.id}`} className={row}>
              <span className="font-medium">{s.plan.title}</span>
              <span className="text-xs text-stone-500">
                {new Date(s.createdAt).toLocaleString('el-GR')} · {STATUS[s.status]} · {s.respondentCount} ερωτώμενοι · {s.engine.mode}
              </span>
            </Link>
          ))}
        </Card>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Focus groups</h2>
        <Card className="divide-y divide-stone-100 p-0">
          {groups.length === 0 && <p className="p-5 text-sm text-stone-500">Κανένα focus group.</p>}
          {groups.map((g) => (
            <Link key={g.id} href={`/synthetic-lab/focus-group/${g.id}`} className={row}>
              <span className="font-medium">{g.topic}</span>
              <span className="text-xs text-stone-500">
                {new Date(g.createdAt).toLocaleString('el-GR')} · {STATUS[g.status]} · {g.participants.length} συμμετέχοντες
              </span>
            </Link>
          ))}
        </Card>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Συγκρίσεις σεναρίων</h2>
        <Card className="divide-y divide-stone-100 p-0">
          {comps.length === 0 && <p className="p-5 text-sm text-stone-500">Καμία σύγκριση.</p>}
          {comps.map((c) => (
            <Link key={c.id} href={`/synthetic-lab/scenarios/${c.id}`} className={row}>
              <span className="font-medium">{c.title}</span>
              <span className="text-xs text-stone-500">
                {new Date(c.createdAt).toLocaleString('el-GR')} · {STATUS[c.status]} · {c.scenarios.length} σενάρια
              </span>
            </Link>
          ))}
        </Card>
      </section>
    </div>
  );
}
