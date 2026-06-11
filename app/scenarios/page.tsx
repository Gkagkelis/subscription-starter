"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { IBM_Plex_Sans } from "next/font/google";

const plex = IBM_Plex_Sans({ subsets: ["greek", "latin"], weight: ["400", "500", "600", "700"], display: "swap" });

type Situation = Record<string, unknown>;

type Foresight = { label: string; path: string; probability: number; rationale: string; signals: string[]; window: string };
type Move = { label: string; move: string; best_for_path: string; upside: string; downside: string; who_gains: string; who_loses: string; opponent_counter: string; risk: string };
type Scenarios = {
  situation: { headline: string; where_it_stands: string };
  foresight: Foresight[];
  moves: Move[];
  connection: string;
  recommendation: { move_label: string; because: string; watch: string[] };
};

const navTabs: { label: string; href: string | null }[] = [
  { label: "Σήμερα", href: "/strategy-room" },
  { label: "Ατζέντα", href: "/agenda" },
  { label: "Καταστάσεις", href: "/situations" },
  { label: "Σενάρια", href: "/scenarios" },
  { label: "Πρόσωπα", href: null },
  { label: "Αρχεία", href: null },
  { label: "Δεδομένα", href: null },
];

function num(v: unknown, f = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : f;
}

function pathMeta(path: string): { label: string; color: string; glyph: string } {
  const p = String(path || "").toLowerCase();
  if (p === "escalate") return { label: "Κλιμάκωση", color: "#f87171", glyph: "▲" };
  if (p === "deescalate") return { label: "Εκτόνωση", color: "#34d399", glyph: "▼" };
  if (p === "pivot") return { label: "Στροφή", color: "#fbbf24", glyph: "↘" };
  return { label: "Λίμνασμα", color: "#64748b", glyph: "—" };
}

function riskMeta(risk: string): { label: string; cls: string } {
  const r = String(risk || "").toLowerCase();
  if (r === "high") return { label: "Υψηλό ρίσκο", cls: "text-red-200 border-red-400/40 bg-red-400/10" };
  if (r === "medium") return { label: "Μεσαίο ρίσκο", cls: "text-amber-200 border-amber-300/30 bg-amber-300/10" };
  return { label: "Χαμηλό ρίσκο", cls: "text-emerald-200 border-emerald-300/25 bg-emerald-300/10" };
}

export default function ScenariosPage() {
  const [situations, setSituations] = useState<Situation[]>([]);
  const [party, setParty] = useState("elas");
  const [partyLabel, setPartyLabel] = useState("ΕΛΑΣ");
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Scenarios | null>(null);
  const [generating, setGenerating] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

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
        /* default */
      }
      setParty(pk);
      try {
        const r = await fetch(`/api/situation-engine?token=dev&party=${encodeURIComponent(pk)}`, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j?.situations)) setSituations(j.situations as Situation[]);
        }
      } catch {
        /* ignore */
      }
      setLoadingList(false);
    })();
  }, []);

  const list = useMemo(
    () =>
      situations
        .map((s) => ({
          id: String(s["id"] ?? ""),
          title: String(s["title"] ?? s["topic"] ?? "Χωρίς τίτλο"),
          topic: String(s["topic"] ?? s["category"] ?? ""),
          score: Math.round(num(s["priority_score"] ?? s["strategic_index_score"] ?? s["event_score"])),
        }))
        .filter((s) => s.id)
        .sort((a, b) => b.score - a.score),
    [situations]
  );

  const selected = useMemo(() => list.find((s) => s.id === selectedId) || null, [list, selectedId]);

  async function generate(id: string) {
    setScenarios(null);
    setErrMsg(null);
    setGenerating(true);
    try {
      const r = await fetch(`/api/scenarios?token=dev&party=${encodeURIComponent(party)}&event_id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok && j?.scenarios) {
        setScenarios(j.scenarios as Scenarios);
      } else if (j?.error === "event_not_found") {
        setErrMsg("Δεν υπάρχει ζωντανό γεγονός γι' αυτή την κατάσταση αυτή τη στιγμή.");
      } else if (j?.error === "ai_unavailable") {
        setErrMsg("Η ανάλυση σεναρίων δεν ολοκληρώθηκε. Δοκίμασε ξανά σε λίγο.");
      } else {
        setErrMsg("Κάτι πήγε στραβά στη δημιουργία σεναρίων. Δοκίμασε ξανά.");
      }
    } catch {
      setErrMsg("Πρόβλημα σύνδεσης. Δοκίμασε ξανά.");
    }
    setGenerating(false);
  }

  function pick(id: string) {
    setSelectedId(id);
    setScenarios(null);
    setErrMsg(null);
  }

  return (
    <div className={`${plex.className} min-h-screen bg-[#060a14] text-zinc-200`}>
      <style>{`
        @keyframes scIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
        @keyframes scPulse{0%,100%{opacity:1}50%{opacity:.55}}
        @keyframes scFlow{from{stroke-dashoffset:120}to{stroke-dashoffset:0}}
      `}</style>

      <header className="sticky top-0 z-20 border-b border-[#101a30] bg-[#060a14]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-300 to-cyan-600" />
            <div>
              <div className="text-sm font-semibold tracking-wide text-zinc-100">NORAYA</div>
              <div className="text-[10px] tracking-wide text-zinc-600">Πολιτική ευφυΐα</div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {navTabs.map((tab) => {
              const active = tab.label === "Σενάρια";
              const base = "rounded-2xl px-3 py-2 text-xs transition";
              if (tab.href) {
                return (
                  <Link key={tab.label} href={tab.href} className={`${base} ${active ? "border border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"}`}>
                    {tab.label}
                  </Link>
                );
              }
              return <span key={tab.label} className={`${base} cursor-not-allowed text-zinc-700`}>{tab.label}</span>;
            })}
          </nav>
          <div className="rounded-2xl border border-[#1a2640] bg-[#0c1220] px-3 py-2 text-[11px] text-zinc-400">{partyLabel}</div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-8">
        <section className="mb-6">
          <div className="text-xs font-medium text-cyan-300/70">Δωμάτιο σεναρίων</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">Πού πάει — και τι κάνεις</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Διάλεξε μια κατάσταση. Ο Noraya προβλέπει πού μπορεί να πάει και προσομοιώνει κάθε κίνηση, ενωμένα σε έναν συλλογισμό για {partyLabel}.</p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          {/* Picker */}
          <aside className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-3">
            <div className="mb-2 px-1 text-xs font-medium text-zinc-400">Καταστάσεις</div>
            {loadingList ? (
              <div className="grid gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div>
            ) : list.length === 0 ? (
              <div className="px-1 py-6 text-center text-xs text-zinc-500">Καμία ενεργή κατάσταση αυτή τη στιγμή.</div>
            ) : (
              <div className="grid max-h-[70vh] gap-1.5 overflow-y-auto pr-1">
                {list.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pick(s.id)}
                    className={`rounded-2xl border p-2.5 text-left transition ${selectedId === s.id ? "border-cyan-300/40 bg-cyan-300/10" : "border-[#162236] bg-[#0a0f1c] hover:border-cyan-300/20 hover:bg-white/[0.03]"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] text-zinc-500">{s.topic || "—"}</span>
                      <span className="shrink-0 text-[10px] text-zinc-500">{s.score}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-4 text-zinc-100">{s.title}</div>
                  </button>
                ))}
              </div>
            )}
          </aside>

          {/* Reasoning panel */}
          <section>
            {!selected ? (
              <div className="flex h-full min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-[#1a2640] bg-[#0a0f1c]/50 p-8 text-center text-sm text-zinc-500">
                Διάλεξε μια κατάσταση από αριστερά για να δεις πιθανές εξελίξεις και κινήσεις.
              </div>
            ) : !scenarios && !generating && !errMsg ? (
              <div className="rounded-3xl border border-[#1a2640] bg-gradient-to-b from-[#0d1525] to-[#0a0f1c] p-8">
                <div className="text-[11px] text-zinc-500">{selected.topic}</div>
                <h2 className="mt-1 text-2xl font-semibold text-zinc-50">{selected.title}</h2>
                <p className="mt-3 max-w-xl text-sm text-zinc-400">Ο Noraya θα προβλέψει 2-3 πιθανές εξελίξεις και θα προσομοιώσει τις κινήσεις σου, με βάση τα πραγματικά στοιχεία του γεγονότος και το προφίλ σου.</p>
                <button type="button" onClick={() => generate(selected.id)} className="mt-5 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/20">
                  ▶ Ανάλυσε σενάρια
                </button>
              </div>
            ) : generating ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl border border-cyan-300/20 bg-[#0a0f1c] p-8 text-center">
                <div className="mb-4 flex gap-1.5">
                  {[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-cyan-300" style={{ animation: "scPulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />)}
                </div>
                <div className="text-sm text-zinc-300">Χτίζω τα σενάρια…</div>
                <div className="mt-1 text-[11px] text-zinc-600">Προβλέψεις, προσομοίωση κινήσεων, σύσταση</div>
              </div>
            ) : errMsg ? (
              <div className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-8 text-center">
                <div className="text-sm text-zinc-300">{errMsg}</div>
                <button type="button" onClick={() => selected && generate(selected.id)} className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs text-cyan-100 transition hover:bg-cyan-300/20">Δοκίμασε ξανά</button>
              </div>
            ) : scenarios ? (
              <div className="grid gap-5">
                {/* Where it stands */}
                <div className="rounded-3xl border border-[#1a2640] bg-gradient-to-b from-[#0d1525] to-[#0a0f1c] p-5" style={{ animation: "scIn .4s ease both" }}>
                  <div className="text-[11px] uppercase tracking-wide text-cyan-300/60">Πού στέκεται</div>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-50">{scenarios.situation.headline}</h2>
                  <p className="mt-1.5 text-sm leading-6 text-zinc-300">{scenarios.situation.where_it_stands}</p>
                </div>

                {/* Foresight */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-200">Πιθανές εξελίξεις</h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    {scenarios.foresight.map((f, i) => {
                      const m = pathMeta(f.path);
                      const prob = Math.max(0, Math.min(100, Math.round(num(f.probability))));
                      return (
                        <div key={i} className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-4" style={{ animation: "scIn .45s ease both", animationDelay: `${i * 80}ms` }}>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: m.color }}>
                              <span>{m.glyph}</span> {f.label || m.label}
                            </span>
                            <span className="text-sm font-semibold text-zinc-200">{prob}%</span>
                          </div>
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                            <div className="h-full rounded-full" style={{ background: m.color, width: `${prob}%`, transformOrigin: "left", animation: "scBar .9s ease forwards" }} />
                          </div>
                          <p className="mt-3 text-[12px] leading-5 text-zinc-300">{f.rationale}</p>
                          {Array.isArray(f.signals) && f.signals.length > 0 ? (
                            <div className="mt-3 grid gap-1">
                              {f.signals.slice(0, 4).map((sig, k) => (
                                <div key={k} className="flex items-start gap-1.5 text-[11px] text-zinc-400">
                                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ background: m.color }} />
                                  <span>{sig}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {f.window ? <div className="mt-3 inline-block rounded-full border border-[#243049] bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400">Παράθυρο: {f.window}</div> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Connection */}
                <div className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.04] p-5" style={{ animation: "scIn .5s ease both" }}>
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-cyan-300/70">
                    <svg width="46" height="12" viewBox="0 0 46 12"><line x1="2" y1="6" x2="44" y2="6" stroke="#22d3ee" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" style={{ animation: "scFlow 1.2s linear" }} /><polygon points="40,2 46,6 40,10" fill="#22d3ee" /></svg>
                    Ο συλλογισμός: από το «πού πάει» στο «τι κάνεις»
                  </div>
                  <p className="mt-2 text-[13px] leading-6 text-zinc-100">{scenarios.connection}</p>
                </div>

                {/* Moves */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-200">Αν κάνεις…</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {scenarios.moves.map((mv, i) => {
                      const pm = pathMeta(mv.best_for_path);
                      const rk = riskMeta(mv.risk);
                      return (
                        <div key={i} className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-4" style={{ animation: "scIn .45s ease both", animationDelay: `${i * 70}ms` }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-[15px] font-semibold text-zinc-50">{mv.label}</div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${rk.cls}`}>{rk.label}</span>
                          </div>
                          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: pm.color + "55", color: pm.color }}>
                            <span>{pm.glyph}</span> Ταιριάζει αν: {pm.label}
                          </div>
                          <Row tone="emerald" label="Κέρδος" text={mv.upside} />
                          <Row tone="red" label="Κόστος" text={mv.downside} />
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded-xl bg-white/[0.03] px-2 py-1.5"><div className="text-zinc-600">Κερδίζει</div><div className="mt-0.5 text-zinc-300">{mv.who_gains}</div></div>
                            <div className="rounded-xl bg-white/[0.03] px-2 py-1.5"><div className="text-zinc-600">Χάνει</div><div className="mt-0.5 text-zinc-300">{mv.who_loses}</div></div>
                          </div>
                          <div className="mt-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-2 py-1.5 text-[11px]">
                            <div className="text-amber-300/70">Η αντίδραση του αντιπάλου</div>
                            <div className="mt-0.5 text-zinc-300">{mv.opponent_counter}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recommendation */}
                <div className="rounded-3xl border border-cyan-300/30 bg-gradient-to-b from-cyan-300/[0.08] to-[#0a0f1c] p-6" style={{ animation: "scIn .55s ease both" }}>
                  <div className="text-[11px] uppercase tracking-wide text-cyan-300/70">Η σύστασή μου</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-50">{scenarios.recommendation.move_label}</div>
                  <p className="mt-2 text-sm leading-6 text-zinc-200">{scenarios.recommendation.because}</p>
                  {Array.isArray(scenarios.recommendation.watch) && scenarios.recommendation.watch.length > 0 ? (
                    <div className="mt-4">
                      <div className="text-[11px] text-cyan-300/60">Τι να παρακολουθείς</div>
                      <div className="mt-1.5 grid gap-1">
                        {scenarios.recommendation.watch.map((w, i) => (
                          <div key={i} className="flex items-start gap-2 text-[12px] text-zinc-300"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-300" />{w}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <button type="button" onClick={() => selected && generate(selected.id)} className="mt-5 rounded-xl border border-[#243049] bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-400 transition hover:text-zinc-200">↻ Νέα ανάλυση</button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}

function Row({ tone, label, text }: { tone: "emerald" | "red"; label: string; text: string }): ReactNode {
  const cls = tone === "emerald" ? "text-emerald-300/80" : "text-red-300/80";
  const dot = tone === "emerald" ? "#34d399" : "#f87171";
  return (
    <div className="mt-2 flex items-start gap-2 text-[12px]">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
      <span className={`shrink-0 ${cls}`}>{label}:</span>
      <span className="text-zinc-300">{text}</span>
    </div>
  );
}
