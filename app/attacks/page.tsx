"use client";

import { useEffect, useMemo, useState } from "react";

// ============================================================
// NORAYA — Καρτελα «Επιθεσεις» (/attacks) v2
// ΠΡΑΓΜΑΤΙΚΕΣ επιθεσεις (τελευταιες 48h) + σεναριο απαντησης ανα επιθεση.
// ============================================================

const CYAN = "#22d3ee";
const CYAN_L = "#67e8f9";

type Attack = { attacker: string; claim: string; target?: string; source: string; url: string; published: string; title: string };
type Scenario = any;

function riskColor(r: string) {
  const t = (r || "").toLowerCase();
  if (t === "high") return { bg: "rgba(248,113,113,0.15)", fg: "#fca5a5" };
  if (t === "low") return { bg: "rgba(161,161,170,0.12)", fg: "#a1a1aa" };
  return { bg: "rgba(245,158,11,0.15)", fg: "#fcd34d" };
}
function ago(published: string) {
  if (!published) return "";
  const h = Math.round((Date.now() - new Date(published).getTime()) / 3.6e6);
  if (Number.isNaN(h)) return "";
  return h <= 1 ? "μόλις τώρα" : `πριν ${h}ω`;
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

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/onboarding", { cache: "no-store" });
        const j = await r.json();
        const pk = j?.party_key ? String(j.party_key) : "elas";
        setParty(pk);
        if (j?.party_name) setPartyLabel(String(j.party_name));
        research(pk, j?.party_name ? String(j.party_name) : "ΕΛΑΣ");
      } catch {
        research("elas", "ΕΛΑΣ");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function research(pk = party, pl = partyLabel) {
    setLoading(true);
    setErr("");
    setRan(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 55000);
    try {
      const r = await fetch("/api/attacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "research", party: pk, partyLabel: pl, windowHours: 48 }),
        signal: ctrl.signal,
      });
      const j = await r.json();
      if (j?.ok) {
        setOrg(Array.isArray(j.orgAttacks) ? j.orgAttacks : []);
        setPersons(Array.isArray(j.personAttacks) ? j.personAttacks : []);
        setChecked(Array.isArray(j.checked) ? j.checked : []);
      } else setErr("Δεν βγήκε αποτέλεσμα — δοκίμασε ξανά.");
    } catch (e: any) {
      setErr(e?.name === "AbortError" ? "Αργησε — δοκίμασε ξανά." : "Σφάλμα — δοκίμασε ξανά.");
    } finally {
      clearTimeout(t);
      setLoading(false);
    }
  }

  async function makeScenario(key: string, attack: Attack) {
    setScenarios((s) => ({ ...s, [key]: { loading: true, data: null } }));
    try {
      const r = await fetch("/api/attacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "scenario", party, partyLabel, attack }),
      });
      const j = await r.json();
      setScenarios((s) => ({ ...s, [key]: { loading: false, data: j?.ok ? j.scenario : null } }));
    } catch {
      setScenarios((s) => ({ ...s, [key]: { loading: false, data: null } }));
    }
  }

  // ομαδοποιηση προσωπων ανα στοχο
  const byPerson = useMemo(() => {
    const m = new Map<string, Attack[]>();
    for (const a of persons) {
      const k = a.target || "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return Array.from(m.entries());
  }, [persons]);

  function AttackCard({ a, kk }: { a: Attack; kk: string }) {
    const sc = scenarios[kk];
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-[#0e1626] p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-zinc-100">{a.attacker && a.attacker !== "—" ? a.attacker : "Επίθεση"}</span>
          <span className="shrink-0 text-[10px] text-zinc-500">{ago(a.published)}</span>
        </div>
        <div className="text-[13px] leading-snug text-zinc-300">{a.claim || a.title}</div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <a href={a.url} target="_blank" rel="noreferrer" className="truncate text-[11px] text-cyan-300/80 hover:text-cyan-200">
            {a.source || "πηγή"} ↗
          </a>
          <button
            onClick={() => makeScenario(kk, a)}
            disabled={sc?.loading}
            className="shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50"
            style={{ borderColor: CYAN + "55", color: CYAN_L, background: CYAN + "12" }}
          >
            {sc?.loading ? "Σενάριο…" : sc?.data ? "Ξανά" : "Βγάλε σενάριο"}
          </button>
        </div>
        {sc?.data && <ScenarioView s={sc.data} />}
        {sc && !sc.loading && !sc.data && <div className="mt-2 text-[11px] text-amber-300">Δεν βγήκε σενάριο — ξαναδοκίμασε.</div>}
      </div>
    );
  }

  function ScenarioView({ s }: { s: Scenario }) {
    const rec = s?.recommendation;
    return (
      <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
        {s?.situation && (
          <div>
            <div className="text-[12px] font-semibold text-zinc-100">{s.situation.headline}</div>
            <div className="text-[11.5px] text-zinc-400">{s.situation.where_it_stands}</div>
          </div>
        )}
        {Array.isArray(s?.foresight) && s.foresight.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: CYAN_L }}>Προοπτική</div>
            <div className="space-y-1">
              {s.foresight.map((f: any, i: number) => (
                <div key={i} className="text-[11.5px] text-zinc-300">
                  <b>{f.label}</b> {typeof f.probability === "number" ? `(${f.probability}%)` : ""} · {f.window} — {f.rationale}
                </div>
              ))}
            </div>
          </div>
        )}
        {Array.isArray(s?.moves) && s.moves.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: CYAN_L }}>Κινήσεις</div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {s.moves.map((m: any, i: number) => {
                const rc = riskColor(m.risk);
                return (
                  <div key={i} className="rounded-lg border border-white/[0.06] bg-[#0a1120] p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-zinc-100">{m.label}</span>
                      <span className="rounded-full px-1.5 py-0.5 text-[8px] uppercase" style={{ background: rc.bg, color: rc.fg }}>{m.risk}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-emerald-300/80">+ {m.upside}</div>
                    <div className="text-[11px] text-zinc-500">− {m.downside}</div>
                    {m.opponent_counter && <div className="mt-0.5 text-[10.5px] text-zinc-500">Αντίδραση αντιπάλου: {m.opponent_counter}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {rec && (
          <div className="rounded-lg border p-2.5" style={{ borderColor: CYAN + "33", background: CYAN + "0d" }}>
            <div className="text-[12px]"><b style={{ color: CYAN_L }}>Σύσταση:</b> {rec.move_label} — {rec.because}</div>
            {Array.isArray(rec.watch) && rec.watch.length > 0 && (
              <div className="mt-1 text-[11px] text-zinc-400">Παρακολούθησε: {rec.watch.join(" · ")}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060a14] px-5 py-6 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <div className="mb-1 text-[11px] tracking-[0.15em]" style={{ color: CYAN_L }}>NORAYA · ΕΠΙΘΕΣΕΙΣ</div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-50">
            Επιθέσεις στον οργανισμό — <span style={{ color: CYAN_L }}>{partyLabel}</span>
          </h1>
          <button
            onClick={() => research()}
            disabled={loading}
            className="rounded-xl px-4 py-2 text-[13px] font-semibold text-slate-950 transition disabled:opacity-50"
            style={{ background: CYAN }}
          >
            {loading ? "Ψάχνει…" : "Ανανέωση"}
          </button>
        </div>
        <p className="mt-1 text-[13px] text-zinc-400">
          Πραγματικές επιθέσεις των <b>τελευταίων 48 ωρών</b> — κατά του κόμματος & κατά στελεχών. Βγάλε σενάριο απάντησης σε όποια θέλεις.
        </p>
        {checked.length > 0 && (
          <div className="mt-1 text-[11px] text-zinc-600">Ελέγχθηκαν: {checked.join(" · ")}</div>
        )}
        {err && <div className="mt-3 text-[12px] text-amber-300">{err}</div>}

        {loading && <div className="mt-8 text-center text-[13px] text-zinc-500">Ο Noraya ψάχνει πραγματικές επιθέσεις (48ωρο)…</div>}

        {!loading && ran && org.length === 0 && persons.length === 0 && !err && (
          <div className="mt-8 rounded-2xl border border-white/[0.07] bg-[#0e1626] p-5 text-center text-[13px] text-zinc-400">
            Καμία πραγματική επίθεση στο τελευταίο 48ωρο. (Καλά νέα — ή ήρεμη μέρα.)
          </div>
        )}

        {org.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 text-[11px] tracking-[0.08em]" style={{ color: CYAN_L }}>ΕΠΙΘΕΣΕΙΣ ΚΑΤΑ ΤΟΥ ΚΟΜΜΑΤΟΣ</div>
            <div className="grid gap-3 md:grid-cols-2">
              {org.map((a, i) => <AttackCard key={"o" + i} a={a} kk={"o" + i} />)}
            </div>
          </div>
        )}

        {byPerson.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 text-[11px] tracking-[0.08em]" style={{ color: "#fca5a5" }}>ΕΠΙΘΕΣΕΙΣ ΚΑΤΑ ΣΤΕΛΕΧΩΝ ΣΟΥ</div>
            <div className="space-y-4">
              {byPerson.map(([person, list]) => (
                <div key={person}>
                  <div className="mb-2 text-[13px] font-semibold text-zinc-200">{person} <span className="text-[11px] text-zinc-500">· {list.length} επιθέσεις</span></div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {list.map((a, i) => <AttackCard key={"p" + person + i} a={a} kk={"p" + person + i} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
