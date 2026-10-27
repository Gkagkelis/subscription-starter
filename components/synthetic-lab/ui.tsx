// Κοινά UI στοιχεία του Synthetic Research Lab (ανοιχτό θέμα, ελληνικά).
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { EvidenceKind } from '@/lib/synthetic-lab/types';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-stone-600">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

const EVIDENCE: Record<EvidenceKind, { label: string; cls: string; icon: string }> = {
  observed: { label: 'Παρατηρημένα δεδομένα', cls: 'border-emerald-300 bg-emerald-50 text-emerald-900', icon: '●' },
  estimate: { label: 'Στατιστική εκτίμηση', cls: 'border-sky-300 bg-sky-50 text-sky-900', icon: '◐' },
  simulation: { label: 'Συνθετική προσομοίωση', cls: 'border-amber-300 bg-amber-50 text-amber-900', icon: '◌' },
  ai: { label: 'Ερμηνεία AI', cls: 'border-violet-300 bg-violet-50 text-violet-900', icon: '✦' }
};

export function EvidenceBadge({ kind }: { kind: EvidenceKind }) {
  const e = EVIDENCE[kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${e.cls}`}>
      <span aria-hidden>{e.icon}</span>
      {e.label}
    </span>
  );
}

export function SimulatedLabel() {
  return (
    <span className="inline-flex items-center rounded border border-amber-400 bg-amber-100 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-amber-900">
      Simulated response — not human survey data
    </span>
  );
}

export function Banner({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'danger' | 'ok'; title?: string; children: ReactNode }) {
  const cls = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    danger: 'border-red-300 bg-red-50 text-red-900',
    ok: 'border-emerald-300 bg-emerald-50 text-emerald-900'
  }[tone];
  const icon = { info: 'ℹ', warning: '⚠', danger: '⛔', ok: '✓' }[tone];
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <div className="flex gap-2">
        <span aria-hidden className="font-bold">
          {icon}
        </span>
        <div>
          {title && <div className="font-semibold">{title}</div>}
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  className = ''
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const cls = {
    primary: 'bg-stone-900 text-white hover:bg-stone-700',
    secondary: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50',
    ghost: 'text-stone-700 hover:bg-stone-100',
    danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50'
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${cls} ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = 'secondary' }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary' }) {
  const cls = variant === 'primary' ? 'bg-stone-900 text-white hover:bg-stone-700' : 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50';
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${cls}`}>
      {children}
    </Link>
  );
}

export function Spinner({ label = 'Εκτέλεση…' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-stone-600" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-800" aria-hidden />
      {label}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-stone-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-stone-500">{hint}</div>}
    </div>
  );
}

export function Help({ children }: { children: ReactNode }) {
  return (
    <details className="group text-sm text-stone-600">
      <summary className="cursor-pointer select-none text-stone-700 underline decoration-dotted underline-offset-2">Τι σημαίνει αυτό;</summary>
      <div className="mt-2 rounded-lg bg-stone-50 p-3">{children}</div>
    </details>
  );
}

export const inputCls =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200';

export const labelCls = 'mb-1 block text-sm font-medium text-stone-800';
