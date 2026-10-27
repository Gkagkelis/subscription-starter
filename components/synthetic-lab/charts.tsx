'use client';
// Απλά, προσβάσιμα SVG γραφήματα. Παλέτα: επικυρωμένη κατηγορική σειρά
// (μπλε, πορτοκαλί, aqua, κίτρινο, ματζέντα) — σταθερή σειρά, χωρίς ανακύκλωση.
import { useState } from 'react';

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const INK = '#0b0b0b';
const INK2 = '#52514e';
const MUTED = '#898781';
const GRID = '#e1e0d9';
const AXIS = '#c3c2b7';

export interface BarDatum {
  label: string;
  value: number; // 0-100
  low?: number;
  high?: number;
  note?: string;
}

/** Οριζόντιο γράφημα ποσοστών με διαστήματα (whiskers) και hover tooltip. */
export function BarChart({ data, title, max = 100 }: { data: BarDatum[]; title: string; max?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const rowH = 30;
  const labelW = 190;
  const W = 640;
  const plotW = W - labelW - 70;
  const H = data.length * rowH + 24;
  const x = (v: number) => labelW + (Math.max(0, Math.min(max, v)) / max) * plotW;
  return (
    <figure className="w-full max-w-[760px]">
      <figcaption className="sr-only">{title}</figcaption>
      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label={title}>
          {[0, 25, 50, 75, 100].filter((t) => t <= max).map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={0} y2={H - 20} stroke={GRID} strokeWidth={1} />
              <text x={x(t)} y={H - 6} fontSize={10} textAnchor="middle" fill={MUTED}>
                {t}%
              </text>
            </g>
          ))}
          <line x1={labelW} x2={labelW} y1={0} y2={H - 20} stroke={AXIS} strokeWidth={1} />
          {data.map((d, i) => {
            const y = i * rowH + 6;
            const bh = rowH - 12;
            return (
              <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
                <rect x={0} y={y - 4} width={W} height={rowH} fill={hover === i ? '#f3f2ee' : 'transparent'} />
                <text x={labelW - 8} y={y + bh / 2 + 4} fontSize={12} textAnchor="end" fill={INK}>
                  {d.label.length > 28 ? d.label.slice(0, 27) + '…' : d.label}
                </text>
                <rect x={labelW} y={y} width={Math.max(2, x(d.value) - labelW)} height={bh} rx={4} fill={SERIES[0]} />
                {d.low !== undefined && d.high !== undefined && !Number.isNaN(d.low) && (
                  <g stroke={INK2} strokeWidth={1.5}>
                    <line x1={x(d.low)} x2={x(d.high)} y1={y + bh / 2} y2={y + bh / 2} />
                    <line x1={x(d.low)} x2={x(d.low)} y1={y + 3} y2={y + bh - 3} />
                    <line x1={x(d.high)} x2={x(d.high)} y1={y + 3} y2={y + bh - 3} />
                  </g>
                )}
                <text x={x(Math.max(d.value, d.high ?? 0)) + 6} y={y + bh / 2 + 4} fontSize={12} fill={INK2}>
                  {d.value.toFixed(1)}%
                </text>
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute right-2 top-2 max-w-xs rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-stone-800 shadow">
            <div className="font-semibold">{data[hover].label}</div>
            <div>{data[hover].value.toFixed(1)}%</div>
            {data[hover].low !== undefined && (
              <div className="text-stone-500">
                95% διάστημα προσομοίωσης: {data[hover].low!.toFixed(1)}–{data[hover].high!.toFixed(1)}%
              </div>
            )}
            {data[hover].note && <div className="text-stone-500">{data[hover].note}</div>}
          </div>
        )}
      </div>
    </figure>
  );
}

/** Καμπύλη αποδοχής τιμής με ζώνη διαστήματος και crosshair. */
export function PriceCurve({ points, title }: { points: { price: number; acceptance: number; ciLow: number; ciHigh: number }[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const W = 640;
  const H = 260;
  const m = { l: 48, r: 20, t: 14, b: 36 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const minP = Math.min(...points.map((p) => p.price));
  const maxP = Math.max(...points.map((p) => p.price));
  const x = (p: number) => m.l + (maxP === minP ? pw / 2 : ((p - minP) / (maxP - minP)) * pw);
  const y = (v: number) => m.t + ph - (v / 100) * ph;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.price)},${y(p.acceptance)}`).join(' ');
  const band =
    points.map((p, i) => `${i ? 'L' : 'M'}${x(p.price)},${y(p.ciHigh)}`).join(' ') +
    ' ' +
    [...points].reverse().map((p) => `L${x(p.price)},${y(p.ciLow)}`).join(' ') +
    ' Z';
  return (
    <figure className="w-full max-w-[760px]">
      <figcaption className="sr-only">{title}</figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={GRID} />
              <text x={m.l - 6} y={y(t) + 4} fontSize={10} textAnchor="end" fill={MUTED}>
                {t}%
              </text>
            </g>
          ))}
          <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} stroke={AXIS} />
          <path d={band} fill={SERIES[0]} opacity={0.15} />
          <path d={line} fill="none" stroke={SERIES[0]} strokeWidth={2} />
          {points.map((p, i) => (
            <g key={p.price}>
              <rect x={x(p.price) - pw / points.length / 2} y={m.t} width={pw / points.length} height={ph} fill="transparent" onMouseEnter={() => setHover(i)} />
              <circle cx={x(p.price)} cy={y(p.acceptance)} r={4.5} fill={SERIES[0]} stroke="#fcfcfb" strokeWidth={2} />
              <text x={x(p.price)} y={H - 14} fontSize={11} textAnchor="middle" fill={INK2}>
                {p.price}€
              </text>
            </g>
          ))}
          {hover !== null && <line x1={x(points[hover].price)} x2={x(points[hover].price)} y1={m.t} y2={m.t + ph} stroke={MUTED} strokeDasharray="3 3" />}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-xs shadow">
            <div className="font-semibold">{points[hover].price}€</div>
            <div>Αποδοχή: {points[hover].acceptance.toFixed(1)}%</div>
            <div className="text-stone-500">
              95% διάστημα προσομοίωσης: {points[hover].ciLow.toFixed(1)}–{points[hover].ciHigh.toFixed(1)}%
            </div>
          </div>
        )}
      </div>
    </figure>
  );
}

/** Σύγκριση σεναρίων: ομαδοποιημένες μπάρες, μία σειρά ανά σενάριο, με υπόμνημα. */
export function GroupedBars({ groups, series, title }: { groups: { label: string; values: (number | null)[] }[]; series: string[]; title: string }) {
  const [hover, setHover] = useState<{ g: number; s: number } | null>(null);
  const W = 640;
  const barH = 14;
  const gap = 2;
  const groupH = series.length * (barH + gap) + 18;
  const labelW = 210;
  const pw = W - labelW - 60;
  const H = groups.length * groupH + 24;
  const x = (v: number) => labelW + (Math.max(0, Math.min(100, v)) / 100) * pw;
  return (
    <figure className="w-full max-w-[760px]">
      <figcaption className="sr-only">{title}</figcaption>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-stone-700" aria-label="Υπόμνημα">
        {series.map((s, i) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
            {s}
          </span>
        ))}
      </div>
      <div className="relative overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label={title}>
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={0} y2={H - 20} stroke={GRID} />
              <text x={x(t)} y={H - 6} fontSize={10} textAnchor="middle" fill={MUTED}>
                {t}%
              </text>
            </g>
          ))}
          {groups.map((g, gi) => (
            <g key={g.label}>
              <text x={labelW - 8} y={gi * groupH + groupH / 2} fontSize={11} textAnchor="end" fill={INK}>
                {g.label.length > 32 ? g.label.slice(0, 31) + '…' : g.label}
              </text>
              {g.values.map((v, si) => {
                const y = gi * groupH + 6 + si * (barH + gap);
                return v === null ? null : (
                  <g key={si} onMouseEnter={() => setHover({ g: gi, s: si })} onMouseLeave={() => setHover(null)}>
                    <rect x={labelW} y={y} width={Math.max(2, x(v) - labelW)} height={barH} rx={4} fill={SERIES[si % SERIES.length]} />
                    {(series.length <= 4 || hover?.g === gi) && (
                      <text x={x(v) + 5} y={y + barH - 3} fontSize={10} fill={INK2}>
                        {v.toFixed(1)}%
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-xs shadow">
            <div className="font-semibold">{series[hover.s]}</div>
            <div>{groups[hover.g].label}</div>
            <div>{groups[hover.g].values[hover.s]?.toFixed(1)}%</div>
          </div>
        )}
      </div>
    </figure>
  );
}
