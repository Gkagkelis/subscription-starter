'use client';
import { useEffect, useState } from 'react';
import type { AudienceFilter, PopulationSummary } from '@/lib/synthetic-lab/types';
import { inputCls, labelCls } from './ui';

export interface LabStatus {
  mode: {
    liveAvailable: boolean;
    message: string;
    limits: { maxAgents: number; costCapUsd: number; defaultModel: string; maxConcurrency: number; dailyCapUsd: number };
    models: { id: string; label: string }[];
  };
  populations: PopulationSummary[];
  defaultPopulationId: string;
}

export function usePopulations() {
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/synthetic-lab/status')
      .then((r) => r.json())
      .then((d) => (d.ok ? setStatus(d) : setError(d.error)))
      .catch((e) => setError(String(e)));
  }, []);
  return { status, error };
}

// Περιφέρειες GLOPOP-S (GDL codes).
export const REGIONS: [string, string][] = [
  ['GRCr101', 'Αττική'],
  ['GRCr102', 'Βόρειο Αιγαίο'],
  ['GRCr103', 'Νότιο Αιγαίο'],
  ['GRCr104', 'Κρήτη'],
  ['GRCr105', 'Αν. Μακεδονία & Θράκη'],
  ['GRCr106', 'Κεντρική Μακεδονία'],
  ['GRCr107', 'Δυτική Μακεδονία'],
  ['GRCr108', 'Ήπειρος'],
  ['GRCr109', 'Θεσσαλία'],
  ['GRCr110', 'Ιόνια Νησιά'],
  ['GRCr111', 'Δυτική Ελλάδα'],
  ['GRCr112', 'Στερεά Ελλάδα'],
  ['GRCr113', 'Πελοπόννησος']
];

const AGE_MIN = [
  [15, '15+'],
  [25, '25+'],
  [35, '35+'],
  [45, '45+'],
  [55, '55+'],
  [65, '65+']
] as const;
const AGE_MAX = [
  [120, 'χωρίς όριο'],
  [24, 'έως 24'],
  [34, 'έως 34'],
  [44, 'έως 44'],
  [54, 'έως 54'],
  [64, 'έως 64']
] as const;

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const a = arr || [];
  return a.includes(v) ? a.filter((x) => x !== v) : [...a, v];
}

export function AudienceEditor({
  populations,
  populationId,
  onPopulation,
  audience,
  onAudience
}: {
  populations: PopulationSummary[];
  populationId: string;
  onPopulation: (id: string) => void;
  audience: AudienceFilter;
  onAudience: (a: AudienceFilter) => void;
}) {
  const set = (p: Partial<AudienceFilter>) => {
    const next = { ...audience, ...p };
    (Object.keys(next) as (keyof AudienceFilter)[]).forEach((k) => {
      const v = next[k];
      if (Array.isArray(v) && v.length === 0) delete next[k];
    });
    onAudience(next);
  };
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`;
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="pop">
          Συνθετικός πληθυσμός
        </label>
        <select id="pop" className={inputCls} value={populationId} onChange={(e) => onPopulation(e.target.value)}>
          {populations.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isDevFixture ? ' — ΤΕΧΝΗΤΟ' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Ηλικία από</label>
          <select className={inputCls} value={audience.minAge ?? 15} onChange={(e) => set({ minAge: Number(e.target.value) })}>
            {AGE_MIN.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-stone-500">Οι ηλικίες στα δεδομένα είναι σε ζώνες· το 15+ είναι η πλησιέστερη ζώνη για ενήλικες.</p>
        </div>
        <div>
          <label className={labelCls}>Ηλικία έως</label>
          <select className={inputCls} value={audience.maxAge ?? 120} onChange={(e) => set({ maxAge: Number(e.target.value) === 120 ? undefined : Number(e.target.value) })}>
            {AGE_MAX.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <div className={labelCls}>Φύλο</div>
        <div className="flex gap-2">
          {(
            [
              ['female', 'Γυναίκες'],
              ['male', 'Άνδρες']
            ] as const
          ).map(([v, l]) => (
            <button type="button" key={v} className={chip(!!audience.genders?.includes(v))} onClick={() => set({ genders: toggle(audience.genders, v) })}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className={labelCls}>Περιφέρειες (καμία επιλογή = όλη η Ελλάδα)</div>
        <div className="flex flex-wrap gap-2">
          {REGIONS.map(([v, l]) => (
            <button type="button" key={v} className={chip(!!audience.regions?.includes(v))} onClick={() => set({ regions: toggle(audience.regions, v) })}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className={labelCls}>Περιοχή κατοικίας</div>
          <div className="flex gap-2">
            {(
              [
                ['urban', 'Αστική'],
                ['rural', 'Αγροτική']
              ] as const
            ).map(([v, l]) => (
              <button type="button" key={v} className={chip(!!audience.settlements?.includes(v))} onClick={() => set({ settlements: toggle(audience.settlements, v) })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className={labelCls}>Εισοδηματικό πεμπτημόριο</div>
          <div className="flex gap-2">
            {([1, 2, 3, 4, 5] as const).map((v) => (
              <button type="button" key={v} className={chip(!!audience.incomeQuintiles?.includes(v))} onClick={() => set({ incomeQuintiles: toggle(audience.incomeQuintiles, v) })}>
                {v === 1 ? '1 (χαμηλό)' : v === 5 ? '5 (υψηλό)' : v}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <div className={labelCls}>Εκπαίδευση</div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['less_than_primary', 'Κάτω από δημοτικό'],
              ['primary', 'Δημοτικό'],
              ['lower_secondary', 'Γυμνάσιο'],
              ['upper_secondary', 'Λύκειο'],
              ['tertiary', 'Ανώτατη']
            ] as const
          ).map(([v, l]) => (
            <button type="button" key={v} className={chip(!!audience.educations?.includes(v))} onClick={() => set({ educations: toggle(audience.educations, v) })}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-stone-500">
        Διαθέσιμα χαρακτηριστικά: ηλικία, φύλο, περιφέρεια, αστική/αγροτική, εκπαίδευση, εισόδημα, νοικοκυριό. Επάγγελμα, απασχόληση και καταναλωτικές
        συνήθειες <strong>δεν υπάρχουν</strong> στα δεδομένα και δεν επινοούνται.
      </p>
    </div>
  );
}
