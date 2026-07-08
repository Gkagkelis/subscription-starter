"use client";

import { useEffect, useMemo, useState } from "react";

// ============================================================
// NORAYA — Καρτελα «Επιθεσεις» (/attacks) v3
// ΠΡΑΓΜΑΤΙΚΕΣ επιθεσεις 48h + σεναριο απαντησης (ΙΔΙΑ μορφη με «Σεναρια»).
// ============================================================

const CYAN = "#22d3ee";
const CYAN_L = "#67e8f9";

type Attack = { attacker: string; claim: string; target?: string; source: string; url: string; published: string; title: string; credible?: boolean; isLeader?: boolean; count?: number; sources?: string[] };
type Scenario = any;

const num = (x: any) => { const n = typeof x === "number" ? x : parseFloat(String(x)); return Number.isFinite(n) ? n : 0; };
function pathMeta(path: string) {
  const p = String(path || "").toLowerCase();
  if (p === "escalate") return { label: "Κλιμάκωση", color: "#f87171", glyph: "▲" };
  if (p === "deescalate") return { label: "Εκτόνωση", color: "#34d399", glyph: "▼" };
  if (p === "pivot") return { label: "Στροφή", color: "#fbbf24", glyph: "↘" };
  return { label: "Λίμνασμα", color: "#64748b", glyph: "—" };
}
function riskMeta(risk: string) {
  const r = String(risk || "").toLowerCase();
  if (r === "high") return { label: "Υψηλό ρίσκο", cls: "text-red-200 border-red-400/40 bg-red-400/10" };
  if (r === "medium") return { label: "Μεσαίο ρίσκο", cls: "text-amber-200 border-amber-300/30 bg-amber-300/10" };
  return { label: "Χαμηλό ρίσκο", cls: "text-emerald-200 border-emerald-300/25 bg-emerald-300/10" };
}
function ago(published: string) {
  if (!published) return "";
  const h = Math.round((Date.now() - new Date(published).getTime()) / 3.6e6);
  if (Number.isNaN(h)) return "";
  return h <= 1 ? "μόλις τώρα" : `πριν ${h}ω`;
}
function Row({ tone, label, text }: { tone: "emerald" | "red"; label: string; text: string }) {
  if (!text) return null;
  const c = tone === "emerald" ? "#6ee7b7" : "#fca5a5";
  return (
    <div className="mt-2 flex gap-2 text-[12px]">
      <span className="shrink-0 font-medium" style={{ color: c }}>{label}:</span>
      <span className="text-zinc-300">{text}</span>
    </div>
  );
}

export default function AttacksPage() {
  const [party, setParty] = useState("elas");
  const [partyLabel, setPartyLabel] = useState("ΕΛΑΣ");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [org, setOrg] = useState<Attack[]>([]);
  const [persons, setPersons] = useState<Attack[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [ran, setRan] = useState(false);
  const [scenarios, setScenarios] = useState<Record<string, { loading: boolean; data: Scenario | null }>>({});
  const [open, setOpen] = useState<{ key: string; attack: Attack } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/onboarding", { cache: "no-store" });
        const j = await r.json();
        const pk = j?.party_key ? String(j.party_key) : "elas";
        const pl = j?.party_name ? String(j.party_name) : "ΕΛΑΣ";
        setParty(pk); setPartyLabel(pl);
        research(pk, pl);
      } catch { research("elas", "ΕΛΑΣ"); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function research(pk = party, pl = partyLabel) {
    setLoading(true); setErr(""); setRan(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 55000);
    try {
      const r = await fetch("/api/attacks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "research", party: pk, partyLabel: pl, windowHours: 48 }), signal: ctrl.signal,
      });
      const j = await r.json();
      if (j?.ok) {
        setOrg(Array.isArray(j.orgAttacks) ? j.orgAttacks : []);
        setPersons(Array.isArray(j.personAttacks) ? j.personAttacks : []);
        setChecked(Array.isArray(j.checked) ? j.checked : []);
      } else setErr("Δεν βγήκε αποτέλεσμα — δοκίμασε ξανά.");
    } catch (e: any) {
      setErr(e?.name === "AbortError" ? "Αργησε — δοκίμασε ξανά." : "Σφάλμα — δοκίμασε ξανά.");
    } finally { clearTimeout(t); setLoading(false); }
  }

  function openScenario(key: string, attack: Attack) {
    setOpen({ key, attack });
    if (!scenarios[key]?.data && !scenarios[key]?.loading) makeScenario(key, attack);
  }

  async function makeScenario(key: string, attack: Attack) {
    setScenarios((s) => ({ ...s, [key]: { loading: true, data: null } }));
    try {
      const r = await fetch("/api/attacks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "scenario", party, partyLabel, attack }),
      });
      const j = await r.json();
      setScenarios((s) => ({ ...s, [key]: { loading: false, data: j?.ok ? j.scenario : null } }));
    } catch { setScenarios((s) => ({ ...s, [key]: { loading: false, data: null } })); }
  }

  const byPerson = useMemo(() => {
    const m = new Map<string, Attack[]>();
    for (const a of persons) { const k = a.target || "—"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(a); }
    return Array.from(m.entries());
  }, [persons]);

  function Badge({ a }: { a: Attack }) {
    return (
      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] uppercase tracking-wide"
        style={a.credible ? { background: "rgba(52,211,153,0.15)", color: "#6ee7b7" } : { background: "rgba(161,161,170,0.12)", color: "#a1a1aa" }}>
        {a.credible ? "έγκυρη πηγή" : "χαμηλή απήχηση"}
      </span>
    );
  }
  function CoverBadge({ a }: { a: Attack }) {
    if (!a.count || a.count <= 1) return null;
    return <span className="shrink-0 rounded-full bg-cyan-300/10 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-cyan-200/80">{a.count} πηγές</span>;
  }

  function ScenarioView({ s, onRegen }: { s: Scenario; onRegen: () => void }) {
    if (!s) return null;
    return (
      <div className="mt-4 space-y-4 border-t border-white/[0.06] pt-4">
        {s.situation && (
          <div className="rounded-2xl border border-[#1a2640] bg-gradient-to-b from-[#0d1525] to-[#0a0f1c] p-4">
            <div className="text-[10px] uppercase tracking-wide text-cyan-300/60">Πού στέκεται</div>
            <h2 className="mt-1 text-[17px] font-semibold text-zinc-50">{s.situation.headline}</h2>
            <p className="mt-1 text-[13px] leading-6 text-zinc-300">{s.situation.where_it_stands}</p>
          </div>
        )}

        {Array.isArray(s.foresight) && s.foresight.length > 0 && (
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-zinc-200">Πιθανές εξελίξεις</h3>
            <div className="grid gap-3 md:grid-cols-3">
              {s.foresight.map((f: any, i: number) => {
                const m = pathMeta(f.path);
                const prob = Math.max(0, Math.min(100, Math.round(num(f.probability))));
                return (
                  <div key={i} className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: m.color }}><span>{m.glyph}</span> {f.label || m.label}</span>
                      <span className="text-[13px] font-semibold text-zinc-200">{prob}%</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full" style={{ background: m.color, width: `${prob}%` }} /></div>
                    <p className="mt-2.5 text-[12px] leading-5 text-zinc-300">{f.rationale}</p>
                    {Array.isArray(f.signals) && f.signals.length > 0 && (
                      <div className="mt-2.5 grid gap-1">
                        {f.signals.slice(0, 4).map((sig: string, k: number) => (
                          <div key={k} className="flex items-start gap-1.5 text-[11px] text-zinc-400"><span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ background: m.color }} /><span>{sig}</span></div>
                        ))}
                      </div>
                    )}
                    {f.window && <div className="mt-2.5 inline-block rounded-full border border-[#243049] bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400">Παράθυρο: {f.window}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {s.connection && (
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4">
            <div className="text-[10px] uppercase tracking-wide text-cyan-300/70">Ο συλλογισμός: από το «πού πάει» στο «τι κάνεις»</div>
            <p className="mt-1.5 text-[13px] leading-6 text-zinc-100">{s.connection}</p>
          </div>
        )}

        {Array.isArray(s.moves) && s.moves.length > 0 && (
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-zinc-200">Αν κάνεις…</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {s.moves.map((mv: any, i: number) => {
                const pm = pathMeta(mv.best_for_path);
                const rk = riskMeta(mv.risk);
                return (
                  <div key={i} className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[14px] font-semibold text-zinc-50">{mv.label}</div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${rk.cls}`}>{rk.label}</span>
                    </div>
                    {mv.best_for_path && (
                      <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: pm.color + "55", color: pm.color }}><span>{pm.glyph}</span> Ταιριάζει αν: {pm.label}</div>
                    )}
                    <Row tone="emerald" label="Κέρδος" text={mv.upside} />
                    <Row tone="red" label="Κόστος" text={mv.downside} />
                    {(mv.who_gains || mv.who_loses) && (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-xl bg-white/[0.03] px-2 py-1.5"><div className="text-zinc-600">Κερδίζει</div><div className="mt-0.5 text-zinc-300">{mv.who_gains}</div></div>
                        <div className="rounded-xl bg-white/[0.03] px-2 py-1.5"><div className="text-zinc-600">Χάνει</div><div className="mt-0.5 text-zinc-300">{mv.who_loses}</div></div>
                      </div>
                    )}
                    {mv.opponent_counter && (
                      <div className="mt-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-2 py-1.5 text-[11px]"><div className="text-amber-300/70">Η αντίδραση του αντιπάλου</div><div className="mt-0.5 text-zinc-300">{mv.opponent_counter}</div></div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {s.recommendation && (
          <div className="rounded-2xl border border-cyan-300/30 bg-gradient-to-b from-cyan-300/[0.08] to-[#0a0f1c] p-5">
            <div className="text-[10px] uppercase tracking-wide text-cyan-300/70">Η σύστασή μου</div>
            <div className="mt-1 text-[19px] font-semibold text-zinc-50">{s.recommendation.move_label}</div>
            <p className="mt-1.5 text-[13px] leading-6 text-zinc-200">{s.recommendation.because}</p>
            {Array.isArray(s.recommendation.watch) && s.recommendation.watch.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] text-cyan-300/60">Τι να παρακολουθείς</div>
                <div className="mt-1.5 grid gap-1">
                  {s.recommendation.watch.map((w: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-[12px] text-zinc-300"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-300" />{w}</div>
                  ))}
                </div>
              </div>
            )}
            <button type="button" onClick={onRegen} className="mt-4 rounded-xl border border-[#243049] bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-400 transition hover:text-zinc-200">↻ Νέα ανάλυση</button>
          </div>
        )}
      </div>
    );
  }

  function AttackCard({ a, kk }: { a: Attack; kk: string }) {
    const sc = scenarios[kk];
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-[#0e1626] p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-zinc-100">{a.attacker && a.attacker !== "—" ? a.attacker : "Επίθεση"}</span>
          <span className="shrink-0 text-[10px] text-zinc-500">{ago(a.published)}</span>
        </div>
        <div className="text-[13px] leading-snug text-zinc-300">{a.claim || a.title}</div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <a href={a.url} target="_blank" rel="noreferrer" className="truncate text-[11px] text-cyan-300/80 hover:text-cyan-200">{a.source || "πηγή"} ↗</a>
            <Badge a={a} />
            <CoverBadge a={a} />
          </span>
          <button onClick={() => openScenario(kk, a)}
            className="shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition"
            style={{ borderColor: CYAN + "55", color: CYAN_L, background: CYAN + "12" }}>
            {sc?.data ? "Δες σενάριο" : "Βγάλε σενάριο"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060a14] px-5 py-6 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <div className="mb-1 text-[11px] tracking-[0.15em]" style={{ color: CYAN_L }}>NORAYA · ΕΠΙΘΕΣΕΙΣ</div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-50">Επιθέσεις στον οργανισμό — <span style={{ color: CYAN_L }}>{partyLabel}</span></h1>
          <button onClick={() => research()} disabled={loading} className="rounded-xl px-4 py-2 text-[13px] font-semibold text-slate-950 transition disabled:opacity-50" style={{ background: CYAN }}>
            {loading ? "Ψάχνει…" : "Ανανέωση"}
          </button>
        </div>
        <p className="mt-1 text-[13px] text-zinc-400">Πραγματικές επιθέσεις των <b>τελευταίων 48 ωρών</b> — κατά του κόμματος & κατά στελεχών (έγκυρες πηγές πρώτα). Βγάλε σενάριο σε όποια θέλεις.</p>
        {checked.length > 0 && <div className="mt-1 text-[11px] text-zinc-600">Ελέγχθηκαν: {checked.join(" · ")}</div>}
        {err && <div className="mt-3 text-[12px] text-amber-300">{err}</div>}

        {loading && <div className="mt-8 text-center text-[13px] text-zinc-500">Ο Noraya ψάχνει πραγματικές επιθέσεις (48ωρο)…</div>}
        {!loading && ran && org.length === 0 && persons.length === 0 && !err && (
          <div className="mt-8 rounded-2xl border border-white/[0.07] bg-[#0e1626] p-5 text-center text-[13px] text-zinc-400">Καμία πραγματική επίθεση στο τελευταίο 48ωρο. (Καλά νέα — ή ήρεμη μέρα.)</div>
        )}

        {org.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 text-[11px] tracking-[0.08em]" style={{ color: CYAN_L }}>ΕΠΙΘΕΣΕΙΣ ΚΑΤΑ ΤΟΥ ΚΟΜΜΑΤΟΣ</div>
            <div className="grid gap-3 md:grid-cols-2">{org.map((a, i) => <AttackCard key={"o" + i} a={a} kk={"o" + i} />)}</div>
          </div>
        )}

        {byPerson.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 text-[11px] tracking-[0.08em]" style={{ color: "#fca5a5" }}>ΕΠΙΘΕΣΕΙΣ ΚΑΤΑ ΣΤΕΛΕΧΩΝ ΣΟΥ</div>
            <div className="space-y-4">
              {byPerson.map(([person, list]) => (
                <div key={person}>
                  <div className="mb-2 text-[13px] font-semibold text-zinc-200">{person} <span className="text-[11px] text-zinc-500">· {list.length} επιθέσεις</span>{list[0]?.isLeader && <span className="ml-2 rounded-full bg-emerald-300/10 px-2 py-0.5 text-[9px] uppercase text-emerald-300/80">αρχηγός</span>}</div>
                  <div className="grid gap-3 md:grid-cols-2">{list.map((a, i) => <AttackCard key={"p" + person + i} a={a} kk={"p" + person + i} />)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {open && (() => {
        const sc = scenarios[open.key];
        const a = open.attack;
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-3 sm:p-8" onClick={() => setOpen(null)}>
            <div className="relative w-full max-w-4xl rounded-3xl border border-[#1a2640] bg-[#0a0f1c] p-5 shadow-2xl sm:p-7" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setOpen(null)} aria-label="Κλείσιμο"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:text-zinc-100">✕</button>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-cyan-300/60">Σενάριο απάντησης</div>
              <div className="mb-4 pr-10 text-[13px] text-zinc-400">
                <b className="text-zinc-200">{a.attacker && a.attacker !== "—" ? a.attacker : "Επίθεση"}</b>
                {a.target ? <> → <b className="text-zinc-200">{a.target}</b></> : <> → {partyLabel}</>}: {a.claim}
              </div>
              {sc?.loading && <div className="py-16 text-center text-[13px] text-zinc-500">Ο Noraya χτίζει το σενάριο…</div>}
              {sc?.data && <ScenarioView s={sc.data} onRegen={() => makeScenario(open.key, a)} />}
              {sc && !sc.loading && !sc.data && (
                <div className="py-10 text-center">
                  <div className="text-[13px] text-amber-300">Δεν βγήκε σενάριο.</div>
                  <button onClick={() => makeScenario(open.key, a)} className="mt-3 rounded-xl px-4 py-2 text-[13px] font-semibold text-slate-950" style={{ background: CYAN }}>Δοκίμασε ξανά</button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
