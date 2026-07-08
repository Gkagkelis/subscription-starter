"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// ============================================================
// NORAYA — Καρτελα «Επιθεσεις» (/attacks)
// Επιθεσεις αντιπαλων κομματων + προσωπο-σε-προσωπο + ετοιμες απαντησεις.
// Παιρνει το επιλεγμενο κομμα απο το onboarding.
// ============================================================

const CYAN = "#22d3ee";
const CYAN_L = "#67e8f9";

type PartyAttack = { attacker: string; attack: string; response: string; risk_level: string };
type PersonAttack = { attacker: string; target: string; attack: string; response: string; risk_level: string };

function riskColor(r: string) {
  if (r === "high") return { bg: "rgba(248,113,113,0.15)", fg: "#fca5a5" };
  if (r === "low") return { bg: "rgba(161,161,170,0.12)", fg: "#a1a1aa" };
  return { bg: "rgba(245,158,11,0.15)", fg: "#fcd34d" };
}

export default function AttacksPage() {
  const [party, setParty] = useState("elas");
  const [partyLabel, setPartyLabel] = useState("ΕΛΑΣ");
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [partyAttacks, setPartyAttacks] = useState<PartyAttack[]>([]);
  const [personAttacks, setPersonAttacks] = useState<PersonAttack[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const didAuto = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/onboarding", { cache: "no-store" });
        const j = await r.json();
        if (j?.party_key) setParty(String(j.party_key));
        if (j?.party_name) setPartyLabel(String(j.party_name));
      } catch {}
    })();
  }, []);

  async function generate(focusOverride?: string) {
    setLoading(true);
    setErr("");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 55000);
    try {
      const r = await fetch("/api/attacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ party, partyLabel, focus: focusOverride ?? focus }),
        signal: ctrl.signal,
      });
      const j = await r.json();
      if (j?.ok) {
        setPartyAttacks(Array.isArray(j.partyAttacks) ? j.partyAttacks : []);
        setPersonAttacks(Array.isArray(j.personAttacks) ? j.personAttacks : []);
        if ((j.partyAttacks?.length || 0) + (j.personAttacks?.length || 0) === 0) setErr("Δεν βγηκε αποτελεσμα — δοκιμασε ξανα.");
      } else {
        setErr("Δεν βγηκε αποτελεσμα — δοκιμασε ξανα.");
      }
    } catch (e: any) {
      setErr(e?.name === "AbortError" ? "Αργησε — δοκιμασε ξανα." : "Σφαλμα — δοκιμασε ξανα.");
    } finally {
      clearTimeout(t);
      setLoading(false);
    }
  }

  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  }

  const quick = useMemo(
    () => [
      "Επιθέσεις Άδ. Γεωργιάδη",
      "Αντιπαράθεση με ΝΔ / κυβέρνηση",
      "Αντιπαράθεση με ΠΑΣΟΚ",
      "Αντιπαράθεση με ΣΥΡΙΖΑ",
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-[#060a14] px-5 py-6 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <div className="mb-1 text-[11px] tracking-[0.15em]" style={{ color: CYAN_L }}>
          NORAYA · ΕΠΙΘΕΣΕΙΣ
        </div>
        <h1 className="text-2xl font-bold text-zinc-50">
          Επιθέσεις στον οργανισμό — <span style={{ color: CYAN_L }}>{partyLabel}</span>
        </h1>
        <p className="mt-1 text-[13px] text-zinc-400">
          Τι θα σου ρίξουν οι αντίπαλοι (κόμματα & πρόσωπα) — και η έτοιμη απάντηση, στη φωνή σου.
        </p>

        {/* Focus */}
        <div className="mt-5 rounded-2xl border border-white/[0.07] bg-[#0e1626] p-4">
          <div className="mb-2 text-[11px] tracking-[0.06em]" style={{ color: CYAN_L }}>
            ΕΣΤΙΑΣΗ (θέμα ή πρόσωπο)
          </div>
          <div className="flex flex-wrap gap-2">
            {quick.map((q) => (
              <button
                key={q}
                onClick={() => { setFocus(q); generate(q); }}
                disabled={loading}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-[12px] text-zinc-300 transition hover:border-cyan-300/40 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="π.χ. Σύνοδος ΝΑΤΟ, Άδωνης Γεωργιάδης, ακρίβεια… (ή άφησέ το κενό)"
              className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-[13px] text-zinc-100 outline-none transition focus:border-cyan-300/40"
            />
            <button
              onClick={() => generate()}
              disabled={loading}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-slate-950 transition disabled:opacity-50"
              style={{ background: CYAN }}
            >
              {loading ? "Αναλύει…" : "Δημιούργησε"}
            </button>
          </div>
          {err && <div className="mt-2 text-[12px] text-amber-300">{err}</div>}
        </div>

        {loading && (
          <div className="mt-6 text-center text-[13px] text-zinc-500">Ο Noraya ετοιμάζει επιθέσεις & απαντήσεις…</div>
        )}

        {/* Party attacks */}
        {partyAttacks.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 text-[11px] tracking-[0.08em]" style={{ color: CYAN_L }}>
              ΕΠΙΘΕΣΕΙΣ ΚΑΤΑ ΤΟΥ ΚΟΜΜΑΤΟΣ
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {partyAttacks.map((a, i) => {
                const rc = riskColor(a.risk_level);
                const id = "pa" + i;
                return (
                  <div key={id} className="rounded-2xl border border-white/[0.07] bg-[#0e1626] p-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-zinc-100">{a.attacker}</span>
                      <span className="rounded-full px-2 py-0.5 text-[9px] uppercase" style={{ background: rc.bg, color: rc.fg }}>
                        {a.risk_level}
                      </span>
                    </div>
                    <div className="text-[13px] italic leading-snug text-zinc-300">«{a.attack}»</div>
                    <div className="mt-2 border-t border-white/[0.06] pt-2">
                      <div className="mb-0.5 flex items-center justify-between">
                        <span className="text-[9px] uppercase tracking-wider text-emerald-300/80">Απάντηση</span>
                        <button onClick={() => copy(a.response, id)} className="text-[10px] text-zinc-500 hover:text-zinc-300">
                          {copied === id ? "Αντιγράφηκε" : "Αντιγραφή"}
                        </button>
                      </div>
                      <div className="text-[13px] leading-snug text-zinc-100">{a.response}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Person attacks */}
        {personAttacks.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 text-[11px] tracking-[0.08em]" style={{ color: "#fca5a5" }}>
              ΕΠΙΘΕΣΕΙΣ ΚΑΤΑ ΣΤΕΛΕΧΩΝ ΣΟΥ
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {personAttacks.map((a, i) => {
                const rc = riskColor(a.risk_level);
                const id = "pe" + i;
                return (
                  <div key={id} className="rounded-2xl border border-white/[0.07] bg-[#0e1626] p-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-zinc-100">
                        {a.attacker} <span className="text-zinc-500">→</span> {a.target}
                      </span>
                      <span className="rounded-full px-2 py-0.5 text-[9px] uppercase" style={{ background: rc.bg, color: rc.fg }}>
                        {a.risk_level}
                      </span>
                    </div>
                    <div className="text-[13px] italic leading-snug text-zinc-300">«{a.attack}»</div>
                    <div className="mt-2 border-t border-white/[0.06] pt-2">
                      <div className="mb-0.5 flex items-center justify-between">
                        <span className="text-[9px] uppercase tracking-wider text-emerald-300/80">Απάντηση</span>
                        <button onClick={() => copy(a.response, id)} className="text-[10px] text-zinc-500 hover:text-zinc-300">
                          {copied === id ? "Αντιγράφηκε" : "Αντιγραφή"}
                        </button>
                      </div>
                      <div className="text-[13px] leading-snug text-zinc-100">{a.response}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && partyAttacks.length === 0 && personAttacks.length === 0 && !err && (
          <div className="mt-8 text-center text-[13px] text-zinc-500">
            Διάλεξε ένα θέμα/πρόσωπο πάνω ή πάτα «Δημιούργησε» — ο Noraya θα βγάλει τις πιθανές επιθέσεις και τις έτοιμες απαντήσεις σου.
          </div>
        )}
      </div>
    </div>
  );
}
