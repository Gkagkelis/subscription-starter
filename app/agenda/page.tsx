"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "../../components/TopNav";
import { IBM_Plex_Sans } from "next/font/google";

const plex = IBM_Plex_Sans({
  subsets: ["greek", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

type Stance = "opportunity" | "threat" | "neutral";

type Topic = {
  topic: string;
  total: number;
  last7: number;
  prev7: number;
  change_7d: number;
  change_pct: number;
  trend: "up" | "down" | "flat";
  agenda_score: number | null;
  daily: number[];
  stance: Stance;
  angle: string;
};

type TimelineResponse = {
  party: string;
  days: number;
  has_party_profile: boolean;
  day_keys: string[];
  topics: Topic[];
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function microLabel(t: Topic): { text: string; tone: string } {
  if (t.prev7 === 0 && t.last7 > 0) return { text: "Νέο σήμα", tone: "text-cyan-200 border-cyan-300/30 bg-cyan-300/10" };
  if (t.change_pct >= 30) return { text: "Ανεβαίνει γρήγορα", tone: "text-emerald-200 border-emerald-300/30 bg-emerald-300/10" };
  if (t.change_pct <= -30) return { text: "Υποχωρεί", tone: "text-zinc-300 border-[#243049] bg-white/[0.03]" };
  if ((t.agenda_score ?? 0) >= 65) return { text: "Σταθερά ισχυρό", tone: "text-amber-200 border-amber-300/30 bg-amber-300/10" };
  return { text: "Σταθερό", tone: "text-zinc-300 border-[#243049] bg-white/[0.03]" };
}

function stanceMeta(s: Stance) {
  if (s === "opportunity") return { label: "Ευκαιρία", cls: "text-emerald-200 border-emerald-300/30 bg-emerald-300/10", dot: "#34d399" };
  if (s === "threat") return { label: "Απειλή", cls: "text-red-200 border-red-300/30 bg-red-400/10", dot: "#f87171" };
  return { label: "Ουδέτερο", cls: "text-zinc-300 border-[#243049] bg-white/[0.03]", dot: "#94a3b8" };
}

function changeLabel(t: Topic): string {
  const sign = t.change_pct > 0 ? "+" : "";
  return `${sign}${t.change_pct}%`;
}

function LiveSparkline({ data, color = "#22d3ee", className = "" }: { data: number[]; color?: string; className?: string }) {
  const uid = useId().replace(/[:]/g, "");
  const [hover, setHover] = useState(false);
  const w = 240;
  const h = 56;
  const pts = data && data.length ? data : [0];
  const allZero = pts.every((v) => v === 0);
  const localMax = Math.max(1, ...pts);
  const step = pts.length > 1 ? w / (pts.length - 1) : w;
  const coords = pts.map((v, i) => [i * step, allZero ? h - 5 : h - (v / localMax) * (h - 9) - 5] as [number, number]);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gradId = `lsg-${uid}`;
  const pathId = `lsp-${uid}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      preserveAspectRatio="none"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <style>{`@keyframes norayaDraw{to{stroke-dashoffset:0}}@keyframes norayaFade{from{opacity:0}to{opacity:1}}`}</style>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {!allZero ? (
        <path d={area} fill={`url(#${gradId})`} style={{ animation: "norayaFade 1.2s ease forwards" }} />
      ) : null}
      <path
        id={pathId}
        d={line}
        fill="none"
        stroke={allZero ? "#2a3650" : color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={allZero ? 0 : 1}
        style={allZero ? undefined : { animation: "norayaDraw 1.1s ease forwards" }}
      />
      {!allZero ? (
        <circle r="2.6" fill={color}>
          <animateMotion dur="2.6s" repeatCount="indefinite" begin="1s">
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      ) : null}
      {hover
        ? coords.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="2" fill={color} stroke="#0a0f1c" strokeWidth="1" />
          ))
        : null}
    </svg>
  );
}

function AgendaRadar({ topics, onPick }: { topics: Topic[]; onPick: (t: Topic) => void }) {
  const W = 720;
  const H = 360;
  const padL = 54;
  const padR = 22;
  const padT = 26;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const x = (t: Topic) => padL + (clamp(t.agenda_score ?? 0, 0, 100) / 100) * plotW;
  const maxAbs = Math.max(5, ...topics.map((t) => Math.abs(t.change_7d)));
  const yOf = (c: number) => padT + (1 - (c + maxAbs) / (2 * maxAbs)) * plotH;
  const maxVol = Math.max(1, ...topics.map((t) => t.total));
  const r = (t: Topic) => 5 + (t.total / maxVol) * 15;

  const labelSet = new Set(topics.slice().sort((a, b) => b.total - a.total).slice(0, 7).map((t) => t.topic));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <line key={`gx${g}`} x1={padL + g * plotW} y1={padT} x2={padL + g * plotW} y2={padT + plotH} stroke="#15203a" strokeWidth="1" />
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <line key={`gy${g}`} x1={padL} y1={padT + g * plotH} x2={padL + plotW} y2={padT + g * plotH} stroke="#15203a" strokeWidth="1" />
      ))}
      <line x1={padL} y1={yOf(0)} x2={padL + plotW} y2={yOf(0)} stroke="#22d3ee" strokeOpacity="0.2" strokeDasharray="4 4" />
      <text x={padL + plotW} y={H - 16} fill="#5b6b8c" fontSize="11" textAnchor="end">Βαθμολογία ατζέντας →</text>
      <text x={16} y={padT + 4} fill="#5b6b8c" fontSize="11" transform={`rotate(-90 16 ${padT + 4})`} textAnchor="end">πτώση ↓   άνοδος ↑</text>
      {topics.map((t) => {
        const m = stanceMeta(t.stance);
        const showLabel = labelSet.has(t.topic);

        return (
          <g key={t.topic} className="cursor-pointer" onClick={() => onPick(t)}>
            <circle cx={x(t)} cy={yOf(t.change_7d)} r={r(t)} fill={m.dot} fillOpacity="0.18" stroke={m.dot} strokeWidth="1.5" />
            {showLabel ? (
              <text x={x(t)} y={yOf(t.change_7d) - r(t) - 4} fill="#cdd6ea" fontSize="10" textAnchor="middle">
                {t.topic.length > 18 ? t.topic.slice(0, 17) + "…" : t.topic}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export default function AgendaPage() {
  const router = useRouter();
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [partyLabel, setPartyLabel] = useState("ΕΛΑΣ");
  const [loadingTopic, setLoadingTopic] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let pk = "elas";

      try {
        const pr = await fetch("/api/onboarding", { cache: "no-store" });
        if (pr.ok) {
          const pj = await pr.json();
          if (pj?.party_key) pk = String(pj.party_key);
          if (pj?.party_name) setPartyLabel(String(pj.party_name));
        }
      } catch {
        /* default elas */
      }

      try {
        const r = await fetch(`/api/agenda/timeline?token=dev&party=${encodeURIComponent(pk)}`, { cache: "no-store" });
        if (r.ok) setData((await r.json()) as TimelineResponse);
      } catch {
        /* ignore */
      }

      setLoading(false);
    })();
  }, []);

  const topics = useMemo(() => (data?.topics || []).slice(), [data]);
  const hasRising = useMemo(() => topics.some((t) => t.change_pct > 0), [topics]);

  const rising = useMemo(() => {
    const sorted = topics.slice();
    if (hasRising) sorted.sort((a, b) => b.change_pct - a.change_pct || (b.agenda_score ?? 0) - (a.agenda_score ?? 0));
    else sorted.sort((a, b) => (b.agenda_score ?? 0) - (a.agenda_score ?? 0));
    return sorted.slice(0, 3);
  }, [topics, hasRising]);

  const opportunities = useMemo(() => topics.filter((t) => t.stance === "opportunity").sort((a, b) => (b.agenda_score ?? 0) - (a.agenda_score ?? 0)).slice(0, 6), [topics]);
  const threats = useMemo(() => topics.filter((t) => t.stance === "threat").sort((a, b) => (b.agenda_score ?? 0) - (a.agenda_score ?? 0)).slice(0, 6), [topics]);
  const allRanked = useMemo(() => topics.slice().sort((a, b) => (b.agenda_score ?? b.total) - (a.agenda_score ?? a.total)), [topics]);
  const strongest = useMemo(() => allRanked.slice(0, 8), [allRanked]);

  function pickTopic(t: Topic) {
    setLoadingTopic(t.topic);
    setTimeout(() => router.push(`/strategy-room?topic=${encodeURIComponent(t.topic)}`), 650);
  }

  return (
    <div className={`${plex.className} min-h-screen bg-[#060a14] text-zinc-200`}>
      <header className="sticky top-0 z-20 border-b border-[#101a30] bg-[#060a14]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-300 to-cyan-600" />
            <div>
              <div className="text-sm font-semibold tracking-wide text-zinc-100">NORAYA</div>
              <div className="text-[10px] tracking-wide text-zinc-600">Πολιτική ευφυΐα</div>
            </div>
          </div>

          <TopNav />

          <div className="rounded-2xl border border-[#1a2640] bg-[#0c1220] px-3 py-2 text-[11px] text-zinc-400">{partyLabel}</div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-8">
        <section className="mb-8">
          <div className="text-xs font-medium text-cyan-300/70">Κέντρο Ατζέντας</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">Ατζέντα σε κίνηση</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Τα θέματα που αλλάζουν το πολιτικό πεδίο τις τελευταίες {data?.days ?? 7} ημέρες — και τι σημαίνουν για {partyLabel}.
          </p>
        </section>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-3xl border border-[#1a2640] bg-[#0c1220]" />
            ))}
          </div>
        ) : topics.length === 0 ? (
          <div className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-8 text-center text-sm text-zinc-400">
            Δεν υπάρχουν ακόμη ταξινομημένα θέματα για να εμφανιστεί η τάση. Μόλις ολοκληρωθεί η ταξινόμηση, η ατζέντα γεμίζει αυτόματα.
          </div>
        ) : (
          <>
            <section className="mb-10">
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-base font-semibold text-zinc-200">{hasRising ? "Τα 3 θέματα που ανεβαίνουν" : "Τα 3 ισχυρότερα σήματα τώρα"}</h2>
                <span className="text-[11px] text-zinc-600">{hasRising ? "τα ισχυρότερα ανερχόμενα σήματα" : "δεν υπάρχει σαφής άνοδος αυτή τη στιγμή"}</span>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {rising.map((t) => {
                  const m = stanceMeta(t.stance);
                  const lbl = microLabel(t);

                  return (
                    <button
                      key={t.topic}
                      type="button"
                      onClick={() => pickTopic(t)}
                      className="group relative overflow-hidden rounded-3xl border border-[#1a2640] bg-gradient-to-b from-[#0d1525] to-[#0a0f1c] p-5 text-left transition hover:border-cyan-300/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-lg font-semibold text-zinc-50">{t.topic}</div>
                          <div className="mt-1 text-[11px] text-zinc-500">Βαθμολογία {t.agenda_score ?? "—"} · {t.total} άρθρα</div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${lbl.tone}`}>{lbl.text}</span>
                      </div>

                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div className={`text-2xl font-semibold ${t.change_pct >= 0 ? "text-emerald-300" : "text-zinc-400"}`}>
                          {changeLabel(t)}
                          <span className="ml-1 text-[11px] font-normal text-zinc-500">7 ημέρες</span>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${m.cls}`}>Για {partyLabel}: {m.label}</span>
                      </div>

                      <div className="mt-3 h-12">
                        <LiveSparkline data={t.daily} color={m.dot} className="h-full w-full" />
                      </div>

                      {t.angle ? <p className="mt-3 text-xs leading-5 text-zinc-400">{t.angle}</p> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mb-10">
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-base font-semibold text-zinc-200">Ραντάρ ατζέντας</h2>
                <span className="text-[11px] text-zinc-600">μέγεθος = όγκος άρθρων · χρώμα = ευκαιρία / απειλή</span>
              </div>

              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <div className="rounded-3xl border border-[#1a2640] bg-[#0a0f1c] p-4">
                  <div className="aspect-[2/1] w-full">
                    <AgendaRadar topics={allRanked} onPick={pickTopic} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4 px-2 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#34d399" }} /> Ευκαιρία</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#f87171" }} /> Απειλή</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#94a3b8" }} /> Ουδέτερο</span>
                  </div>
                </div>

                <div className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-4">
                  <div className="mb-2 text-xs font-medium text-zinc-400">Ισχυρότερα σήματα</div>
                  <div className="grid gap-1">
                    {strongest.map((t) => {
                      const m = stanceMeta(t.stance);

                      return (
                        <button key={t.topic} type="button" onClick={() => pickTopic(t)} className="flex items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.04]">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.dot }} />
                          <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">{t.topic}</span>
                          <span className="shrink-0 text-[11px] text-zinc-500">{t.agenda_score ?? "—"}</span>
                          <span className={`shrink-0 text-[11px] ${t.change_pct >= 0 ? "text-emerald-300" : "text-zinc-500"}`}>{changeLabel(t)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-10 grid gap-5 lg:grid-cols-2">
              <div>
                <div className="mb-3">
                  <h2 className="text-base font-semibold text-emerald-300">Πού να επιτεθείς</h2>
                  <p className="text-[11px] text-zinc-600">Ευκαιρίες για {partyLabel} — πού μπορείς να κερδίσεις ατζέντα</p>
                </div>

                <div className="grid gap-3">
                  {opportunities.length === 0 ? (
                    <div className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-4 text-xs text-zinc-500">Καμία καθαρή ευκαιρία αυτή τη στιγμή.</div>
                  ) : (
                    opportunities.map((t) => (
                      <div key={t.topic} className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.04] p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-emerald-50">{t.topic}</div>
                          <div className="text-[11px] text-emerald-300/80">{changeLabel(t)} · βαθμ. {t.agenda_score ?? "—"}</div>
                        </div>
                        {t.angle ? <p className="mt-1.5 text-xs leading-5 text-zinc-300">{t.angle}</p> : null}
                        <button type="button" onClick={() => pickTopic(t)} className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-[11px] text-emerald-100 transition hover:bg-emerald-300/20">
                          Άνοιγμα στο «Σήμερα» →
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="mb-3">
                  <h2 className="text-base font-semibold text-red-300">Πού να αμυνθείς</h2>
                  <p className="text-[11px] text-zinc-600">Απειλές για {partyLabel} — πού μπορεί να σε στριμώξει η επικαιρότητα</p>
                </div>

                <div className="grid gap-3">
                  {threats.length === 0 ? (
                    <div className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-4 text-xs text-zinc-500">Καμία καθαρή απειλή αυτή τη στιγμή.</div>
                  ) : (
                    threats.map((t) => (
                      <div key={t.topic} className="rounded-2xl border border-red-300/15 bg-red-400/[0.05] p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-red-50">{t.topic}</div>
                          <div className="text-[11px] text-red-300/80">{changeLabel(t)} · βαθμ. {t.agenda_score ?? "—"}</div>
                        </div>
                        {t.angle ? <p className="mt-1.5 text-xs leading-5 text-zinc-300">{t.angle}</p> : null}
                        <button type="button" onClick={() => pickTopic(t)} className="mt-3 rounded-xl border border-red-300/30 bg-red-400/10 px-3 py-1.5 text-[11px] text-red-100 transition hover:bg-red-400/20">
                          Προετοιμασία απάντησης →
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold text-zinc-200">Όλα τα θέματα</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {allRanked.map((t) => {
                  const m = stanceMeta(t.stance);
                  const lbl = microLabel(t);

                  return (
                    <button
                      key={t.topic}
                      type="button"
                      onClick={() => pickTopic(t)}
                      className="group rounded-2xl border border-[#1a2640] bg-[#0c1220] p-4 text-left transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.03]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-100">{t.topic}</div>
                          <div className="mt-0.5 text-[10px] text-zinc-500">βαθμ. {t.agenda_score ?? "—"} · {t.total} άρθρα</div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${m.cls}`}>{m.label}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-8 flex-1">
                          <LiveSparkline data={t.daily} color={m.dot} className="h-full w-full" />
                        </div>
                        <div className={`shrink-0 text-xs font-semibold ${t.change_pct >= 0 ? "text-emerald-300" : "text-zinc-400"}`}>{changeLabel(t)}</div>
                      </div>
                      <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] ${lbl.tone}`}>{lbl.text}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>

      {loadingTopic ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#060a14]/80 backdrop-blur">
          <div className="rounded-3xl border border-cyan-300/30 bg-[#0c1220] px-8 py-6 text-center">
            <div className="mx-auto mb-3 h-2 w-2 animate-ping rounded-full bg-cyan-300" />
            <div className="text-[11px] tracking-wide text-cyan-300/70">Φόρτωση κατάστασης…</div>
            <div className="mt-1 text-lg font-semibold text-zinc-50">{loadingTopic}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
