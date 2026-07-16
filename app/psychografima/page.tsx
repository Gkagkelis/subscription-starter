"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  itemsForMode,
  buildProfile,
  ISSUE_TOPICS,
  level5,
  type Item,
  type Answers,
} from "../../lib/noraya/psychometrics";
import { PARTY_POSITIONS, AVERAGE_VOTER, euclidean, type PartyPos } from "../../lib/noraya/party-positions";

// ============================================================
// NORAYA PS — Ερωτηματολογιο Προφιλ Βουλευτη/Υποψηφιου (συνδεδεμενο με λογαριασμο)
// Route: /demo/profil-voulefti
// Χρησιμοποιει τη μηχανη scoring (lib/noraya/psychometrics.ts).
// ============================================================

const CYAN = "#22d3ee";
const CYAN_L = "#67e8f9";
const STORE_KEY = "noraya_profile_quiz_v1";

const SECTION_TITLE: Record<string, string> = {
  A: "Προσωπικοτητα",
  B: "Αξιες",
  G: "Ηθικα θεμελια",
  D: "Πολιτικη πυξιδα",
  ST: "Επικοινωνιακο υφος",
};

function scaleOptions(it: Item): { v: number; label: string }[] {
  if (it.scale === "compass4") {
    return [
      { v: -2, label: "Διαφωνω απολυτα" },
      { v: -1, label: "Διαφωνω" },
      { v: 1, label: "Συμφωνω" },
      { v: 2, label: "Συμφωνω απολυτα" },
    ];
  }
  if (it.scale === "l6") {
    return [1, 2, 3, 4, 5, 6].map((v) => ({ v, label: String(v) }));
  }
  // l5 / freq5
  return [1, 2, 3, 4, 5].map((v) => ({ v, label: String(v) }));
}

function endLabels(it: Item): [string, string] {
  if (it.scale === "l6") return ["Δεν μου μοιαζει καθολου", "Μου μοιαζει παρα πολυ"];
  if (it.scale === "freq5") return ["Ποτε", "Σχεδον παντα"];
  if (it.scale === "compass4") return ["", ""];
  return ["Διαφωνω απολυτα", "Συμφωνω απολυτα"];
}

export default function ProfileQuiz() {
  const router = useRouter();
  const [mode, setMode] = useState<"short" | "full" | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [ranked, setRanked] = useState<string[]>(ISSUE_TOPICS);
  const [done, setDone] = useState(false);
  const [narrative, setNarrative] = useState("");
  const [messageFit, setMessageFit] = useState<{ issue: string; frame: string; avoid: string }[]>([]);
  const [redTeam, setRedTeam] = useState<{ vulnerability: string; attack: string; response: string }[]>([]);
  const [narrLoading, setNarrLoading] = useState(false);
  const [narrError, setNarrError] = useState("");
  const [parties, setParties] = useState<PartyPos[]>(PARTY_POSITIONS);
  const [saved, setSaved] = useState<"idle" | "saving" | "done" | "error">("idle");

  const items = useMemo(() => (mode ? itemsForMode(mode) : []), [mode]);
  const hasRanking = mode === "full";
  const totalSteps = items.length + (hasRanking ? 1 : 0);

  // restore
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        // Ο χρηστης διαλεγει ΠΑΝΤΑ ρητα μικρο/μεγαλο — δεν επαναφερουμε αυτοματα το mode.
        if (s.answers) setAnswers(s.answers);
        if (Array.isArray(s.ranked)) setRanked(s.ranked);
        if (typeof s.step === "number") setStep(s.step);
      }
    } catch {}
  }, []);
  // party positions απο τη βαση (fallback: τοπικο αρχειο)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/party-positions", { cache: "no-store" });
        const j = await r.json();
        if (j?.ok && Array.isArray(j.parties) && j.parties.length) setParties(j.parties);
      } catch {}
    })();
  }, []);
  // persist
  useEffect(() => {
    if (!mode) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ mode, answers, ranked, step }));
    } catch {}
  }, [mode, answers, ranked, step]);

  const profile = useMemo(() => {
    if (!done || !mode) return null;
    return buildProfile({ answers, mode, issueRanking: hasRanking ? ranked : undefined });
  }, [done, mode, answers, ranked, hasRanking]);

  // Flywheel: auto-save ολοκληρωμενου προφιλ (χτιζει τα norms)
  useEffect(() => {
    if (!done || !profile || saved !== "idle") return;
    setSaved("saving");
    fetch("/api/demo-profile-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, answers, scores: profile, issueRanking: hasRanking ? ranked : null }),
    })
      .then((r) => r.json())
      .then((j) => setSaved(j?.ok ? "done" : "error"))
      .catch(() => setSaved("error"));
  }, [done, profile, saved, mode, answers, ranked, hasRanking]);

  function answer(it: Item, v: number) {
    setAnswers((a) => ({ ...a, [it.id]: v }));
    setTimeout(() => setStep((s) => Math.min(totalSteps, s + 1)), 180);
  }

  async function genNarrative() {
    if (!profile) return;
    setNarrLoading(true);
    setNarrError("");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45000);
    try {
      const r = await fetch("/api/demo-profile-narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, issues: ranked }),
        signal: ctrl.signal,
      });
      const j = await r.json();
      if (j?.ok) {
        setNarrative(j.narrative || "");
        setMessageFit(Array.isArray(j.messageFit) ? j.messageFit : []);
        setRedTeam(Array.isArray(j.redTeam) ? j.redTeam : []);
        if (!j.narrative) setNarrError("Δεν βγηκε αναλυση — δοκιμασε ξανα.");
      } else {
        setNarrError("Δεν βγηκε αναλυση — δοκιμασε ξανα.");
      }
    } catch (e: any) {
      setNarrError(e?.name === "AbortError" ? "Αργησε — δοκιμασε ξανα." : "Σφαλμα — δοκιμασε ξανα.");
    } finally {
      clearTimeout(t);
      setNarrLoading(false);
    }
  }

  function reset() {
    localStorage.removeItem(STORE_KEY);
    setMode(null);
    setStep(0);
    setAnswers({});
    setRanked(ISSUE_TOPICS);
    setDone(false);
  }

  function move(i: number, dir: -1 | 1) {
    setRanked((r) => {
      const n = [...r];
      const j = i + dir;
      if (j < 0 || j >= n.length) return n;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }

  // ---------- INTRO ----------
  if (!mode) {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl pt-16 text-center">
          <div className="text-[11px] tracking-[0.2em]" style={{ color: CYAN_L }}>
            NORAYA PS · ΤΟ ΠΟΛΙΤΙΚΟ ΣΟΥ ΠΡΟΦΙΛ
          </div>
          <h1 className="mt-3 text-3xl font-bold text-zinc-50">Ας φτιαξουμε το προφιλ σου</h1>
          <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-zinc-400">
            Ενα επιστημονικα θεμελιωμενο ερωτηματολογιο (προσωπικοτητα, αξιες, ηθικα θεμελια, πολιτικη πυξιδα, υφος). Στο τελος παιρνεις το προφιλ σου — και οσο το χρησιμοποιεις, γινεται πιο προσωποποιημενο.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <button
              onClick={() => { setMode("short"); setStep(0); }}
              className="rounded-2xl border border-white/10 bg-[#0e1626] p-5 text-left transition hover:border-cyan-300/40"
            >
              <div className="text-[15px] font-semibold text-zinc-100">Συντομο</div>
              <div className="mt-1 text-[12px] text-zinc-500">~7-8 λεπτα · 38 ερωτησεις</div>
              <div className="mt-3 text-[12px] text-zinc-400">Γρηγορο ξεκινημα. Παιρνεις τους βασικους αξονες και μαθαινει σιγα-σιγα απο τις επιλογες σου.</div>
            </button>
            <button
              onClick={() => { setMode("full"); setStep(0); }}
              className="rounded-2xl border p-5 text-left transition"
              style={{ borderColor: CYAN + "55", background: CYAN + "10" }}
            >
              <div className="text-[15px] font-semibold" style={{ color: CYAN_L }}>Πληρες</div>
              <div className="mt-1 text-[12px] text-zinc-500">~18-22 λεπτα · 102 ερωτησεις + ιεραρχηση</div>
              <div className="mt-3 text-[12px] text-zinc-400">Πληρες προφιλ σε ολα τα layers, με μεγιστη ακριβεια. Επισης μαθαινει και προσωποποιειται.</div>
            </button>
          </div>
          <div className="mt-6 text-[11px] text-zinc-500">Noraya PS · Το προφίλ σου αποθηκεύεται με ασφάλεια στον λογαριασμό σου και γίνεται πιο προσωποποιημένο όσο το χρησιμοποιείς.</div>
        </div>
      </Shell>
    );
  }

  // ---------- RESULTS ----------
  if (done && profile) {
    const bf = profile.bigFive;
    const comp = profile.compass;
    return (
      <Shell>
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="text-[11px] tracking-[0.15em]" style={{ color: CYAN_L }}>ΤΟ ΠΡΟΦΙΛ ΣΟΥ</div>
              <h1 className="mt-1 text-2xl font-bold text-zinc-50">Πρωτη εικονα</h1>
              <div className="mt-1 text-[10px] text-zinc-600">
                {saved === "done" ? "Αποθηκευτηκε · χτιζει τα norms" : saved === "saving" ? "Αποθηκευση…" : saved === "error" ? "Δεν αποθηκευτηκε" : ""}
              </div>
            </div>
            <button onClick={reset} className="rounded-xl border border-white/10 px-3 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-200">
              Απο την αρχη
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Personality brand (Caprara) */}
            <Card title="Προσωπικοτητα-brand (πως σε βλεπει το κοινο)">
              <Bar label="Ενεργεια / Καινοτομια" v={bf.caprara.energyInnovation} max={5} />
              <Bar label="Εντιμοτητα / Αξιοπιστια" v={bf.caprara.honestyTrust} max={5} />
              <div className="mt-3 border-t border-white/[0.06] pt-2 text-[11px] text-zinc-500">
                Big Five: εξωστρεφεια {level5(bf.traits.extraversion)} · ευσυνειδησια {level5(bf.traits.conscientiousness)} · σταθεροτητα {level5(bf.traits.emotionalStability)}
              </div>
            </Card>

            {/* Compass 2D */}
            <Card title="Πολιτικη πυξιδα">
              <Compass x={comp.economic} y={comp.social} parties={parties} />
              <div className="mt-2 text-center text-[11px] text-zinc-500">
                Οικονομικα: {comp.economic! < 0 ? "Αριστερα" : comp.economic! > 0 ? "Δεξια" : "Κεντρο"} ({comp.economic}) ·
                Κοινωνικα: {comp.social! < 0 ? "Φιλελευθερος" : comp.social! > 0 ? "Συντηρητικος" : "Κεντρο"} ({comp.social})
              </div>
              {comp.economic != null && comp.social != null && parties.length > 0 && (() => {
                let best = parties[0];
                let bd = Infinity;
                for (const p of parties) {
                  const d = euclidean(comp.economic!, comp.social!, p.economic, p.social);
                  if (d < bd) { bd = d; best = p; }
                }
                return (
                  <div className="mt-1 text-center text-[11px] text-zinc-400">
                    Πιο κοντινο κομμα: <span style={{ color: best.color }}>{best.name}</span> · αποσταση {Math.round(bd * 10) / 10}
                  </div>
                );
              })()}
            </Card>

            {/* MFQ */}
            <Card title="Ηθικα θεμελια (οδηγος framing)">
              <Bar label="Individualizing (φροντιδα/δικαιοσυνη)" v={profile.mfq.individualizing} max={6} />
              <Bar label="Binding (πιστη/ιεραρχια/ιεροτητα)" v={profile.mfq.binding} max={6} />
              <div className="mt-2 text-[11px] text-zinc-500">
                {(profile.mfq.binding ?? 0) > (profile.mfq.individualizing ?? 0)
                  ? "Μιλας πιο πειστικα με ορους ταξης, κοινοτητας, παραδοσης."
                  : "Μιλας πιο πειστικα με ορους δικαιων κανονων και ανθρωπιας."}
              </div>
            </Card>

            {/* Schwartz higher-order */}
            <Card title="Αξιες (κορυφαιες διαστασεις)">
              <Bar label="Ανοιχτοτητα στην αλλαγη" v={profile.schwartz.higher.opennessToChange} max={2} signed />
              <Bar label="Διατηρηση" v={profile.schwartz.higher.conservation} max={2} signed />
              <Bar label="Αυθυπερβαση" v={profile.schwartz.higher.selfTranscendence} max={2} signed />
              <Bar label="Αυτο-ενισχυση" v={profile.schwartz.higher.selfEnhancement} max={2} signed />
            </Card>

            {/* Style (full) */}
            {profile.style && (
              <Card title="Επικοινωνιακο υφος">
                <Bar label="Χαρισματικες τακτικες" v={profile.style.clt} max={5} />
                <Bar label="Πολυπλοκοτητα λογου" v={profile.style.complexity} max={5} />
                <Bar label="Λαϊκος τονος" v={profile.style.populism} max={5} />
              </Card>
            )}

            {/* Issue ranking (full) */}
            {hasRanking && (
              <Card title="Η ατζεντα ταυτοτητας σου">
                <ol className="space-y-1.5">
                  {ranked.slice(0, 5).map((t, i) => (
                    <li key={t} className="flex items-center gap-2 text-[13px] text-zinc-200">
                      <span className="text-[11px] font-semibold" style={{ color: CYAN_L }}>{i + 1}</span> {t}
                    </li>
                  ))}
                </ol>
              </Card>
            )}
          </div>

          <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: CYAN + "33", background: CYAN + "0d" }}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[12px] font-semibold tracking-[0.06em]" style={{ color: CYAN_L }}>AI ΑΝΑΛΥΣΗ ΠΡΟΦΙΛ</div>
              <button
                onClick={genNarrative}
                disabled={narrLoading}
                className="rounded-xl px-3.5 py-1.5 text-[12px] font-semibold text-slate-950 transition disabled:opacity-50"
                style={{ background: CYAN }}
              >
                {narrLoading ? "Αναλυει…" : narrative ? "Ξανα" : "Δημιουργησε αναλυση"}
              </button>
            </div>
            {narrError && <div className="mb-2 text-[12px] text-amber-300">{narrError}</div>}
            {!narrative && !narrLoading && !narrError && (
              <div className="text-[13px] leading-relaxed text-zinc-300">
                Πατα «Δημιουργησε αναλυση» — ο Noraya θα γραψει, πανω στα σκορ σου: το <b>αφηγημα ταυτοτητας</b>, το <b>message-market fit</b> ανα θεμα (ποια ηθικα frames να χρησιμοποιεις), και το <b>Red Team</b> (οι πιο ευαλωτες πλευρες σου + ετοιμες απαντησεις).
              </div>
            )}
            {narrative && (
              <div className="space-y-4">
                <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-zinc-200">{narrative}</p>
                {messageFit.length > 0 && (
                  <div>
                    <div className="mb-2 text-[11px] tracking-[0.08em]" style={{ color: CYAN_L }}>MESSAGE-MARKET FIT</div>
                    <div className="space-y-2">
                      {messageFit.map((m, i) => (
                        <div key={i} className="rounded-xl border border-white/[0.06] bg-[#0a1120] p-3">
                          <div className="text-[13px] font-semibold text-zinc-100">{m.issue}</div>
                          <div className="mt-1 text-[12px] text-emerald-300/90">Χρησιμοποιησε: {m.frame}</div>
                          <div className="mt-0.5 text-[12px] text-zinc-500">Αποφυγε: {m.avoid}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {redTeam.length > 0 && (
                  <div>
                    <div className="mb-2 text-[11px] tracking-[0.08em] text-red-300">RED TEAM</div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {redTeam.map((rt, i) => (
                        <div key={i} className="rounded-xl border border-white/[0.06] bg-[#0a1120] p-3">
                          <div className="text-[11px] text-zinc-400">{rt.vulnerability}</div>
                          <div className="mt-1 text-[12px] italic text-zinc-300">«{rt.attack}»</div>
                          <div className="mt-1.5 border-t border-white/[0.06] pt-1.5 text-[12px] text-zinc-200">→ {rt.response}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- RANKING STEP (full) ----------
  if (hasRanking && step === items.length) {
    return (
      <Shell>
        <Progress value={step} total={totalSteps} />
        <div className="mx-auto max-w-xl pt-8">
          <div className="text-[11px] tracking-[0.12em]" style={{ color: CYAN_L }}>ΘΕΜΑΤΙΚΗ ΤΑΥΤΟΤΗΤΑ</div>
          <h2 className="mt-2 text-[18px] font-semibold text-zinc-100">Καταταξε τα θεματα — ποσο κεντρικα θελεις να ειναι στη ΔΙΚΗ σου πολιτικη ταυτοτητα;</h2>
          <div className="mt-5 space-y-2">
            {ranked.map((t, i) => (
              <div key={t} className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0e1626] px-3 py-2.5">
                <span className="w-5 text-[12px] font-semibold" style={{ color: CYAN_L }}>{i + 1}</span>
                <span className="flex-1 text-[13px] text-zinc-200">{t}</span>
                <button onClick={() => move(i, -1)} className="px-1.5 text-zinc-500 hover:text-zinc-200" aria-label="up">▲</button>
                <button onClick={() => move(i, 1)} className="px-1.5 text-zinc-500 hover:text-zinc-200" aria-label="down">▼</button>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-between">
            <button onClick={() => setStep((s) => s - 1)} className="text-[13px] text-zinc-500 hover:text-zinc-300">← Πισω</button>
            <button onClick={() => setDone(true)} className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-slate-950" style={{ background: CYAN }}>
              Δες το προφιλ σου →
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- ITEM STEP ----------
  const it = items[step];
  if (!it) {
    // ολα απαντηθηκαν (short: παει κατευθειαν results)
    if (!done) setDone(true);
    return <Shell><div className="pt-20 text-center text-zinc-500">Υπολογισμος…</div></Shell>;
  }
  const opts = scaleOptions(it);
  const [lo, hi] = endLabels(it);
  const current = answers[it.id];

  return (
    <Shell>
      <Progress value={step} total={totalSteps} />
      <div className="mx-auto max-w-xl pt-10">
        <div className="text-[11px] tracking-[0.12em]" style={{ color: CYAN_L }}>
          {SECTION_TITLE[it.section] || ""} · {step + 1}/{totalSteps}
        </div>
        <h2 className="mt-3 min-h-[72px] text-[20px] font-semibold leading-snug text-zinc-50">{it.text}</h2>

        <div className={"mt-6 grid gap-2 " + (opts.length === 4 ? "grid-cols-2" : "grid-cols-3 sm:grid-cols-6")}>
          {opts.map((o) => {
            const active = current === o.v;
            return (
              <button
                key={o.v}
                onClick={() => answer(it, o.v)}
                className={"rounded-xl border px-3 py-3 text-[13px] font-medium transition " + (active ? "text-slate-950" : "text-zinc-300 hover:border-cyan-300/40")}
                style={active ? { background: CYAN, borderColor: CYAN } : { borderColor: "rgba(255,255,255,0.12)", background: "#0e1626" }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {lo && (
          <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
            <span>{lo}</span>
            <span>{hi}</span>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-[13px] text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
          >
            ← Πισω
          </button>
          {current != null && (
            <button onClick={() => setStep((s) => Math.min(totalSteps, s + 1))} className="text-[13px]" style={{ color: CYAN_L }}>
              Επομενο →
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}

// ---------- UI bits ----------
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#060a14] px-5 py-6 text-zinc-100">
      <div className="mx-auto max-w-4xl">{children}</div>
    </div>
  );
}

function Progress({ value, total }: { value: number; total: number }) {
  const pct = Math.round((value / Math.max(1, total)) * 100);
  return (
    <div className="mx-auto max-w-xl">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full rounded-full transition-all" style={{ width: pct + "%", background: CYAN }} />
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0e1626] p-4">
      <div className="mb-3 text-[11px] tracking-[0.06em]" style={{ color: CYAN_L }}>{title.toUpperCase()}</div>
      {children}
    </div>
  );
}

function Bar({ label, v, max, signed }: { label: string; v: number | null; max: number; signed?: boolean }) {
  const val = v ?? 0;
  const pct = signed ? Math.min(100, Math.abs(val) / max * 100) : Math.min(100, (val / max) * 100);
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex justify-between text-[11.5px]">
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-400">{v == null ? "—" : val}</span>
      </div>
      <div className="h-[6px] w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full" style={{ width: pct + "%", background: signed && val < 0 ? "#f59e0b" : CYAN }} />
      </div>
    </div>
  );
}

function Compass({ x, y, parties }: { x: number | null; y: number | null; parties: PartyPos[] }) {
  const toX = (e: number) => ((e + 10) / 20) * 100;
  const toY = (sv: number) => ((10 - sv) / 20) * 100;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px] rounded-lg border border-white/10 bg-[#0a1120]">
      <div className="absolute left-1/2 top-0 h-full w-px bg-white/10" />
      <div className="absolute top-1/2 left-0 h-px w-full bg-white/10" />
      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] text-zinc-600">ΑΡΙΣΤ.</span>
      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-zinc-600">ΔΕΞΙΑ</span>
      <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] text-zinc-600">ΣΥΝΤΗΡ.</span>
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-zinc-600">ΦΙΛΕΛ.</span>

      {parties.map((p) => (
        <div
          key={p.key}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5"
          style={{ left: toX(p.economic) + "%", top: toY(p.social) + "%" }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[7px] text-zinc-500">{p.abbr}</span>
        </div>
      ))}

      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5"
        style={{ left: toX(AVERAGE_VOTER.economic) + "%", top: toY(AVERAGE_VOTER.social) + "%" }}
      >
        <span className="h-2.5 w-2.5 rounded-full border-2 border-white/70" />
        <span className="text-[7px] font-semibold text-white/70">ΜΕΣΟΣ</span>
      </div>

      {x != null && y != null && (
        <div
          className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5"
          style={{ left: toX(x) + "%", top: toY(y) + "%" }}
        >
          <span className="h-3.5 w-3.5 rounded-full ring-2 ring-[#060a14]" style={{ background: CYAN }} />
          <span className="text-[8px] font-bold" style={{ color: CYAN_L }}>ΕΣΥ</span>
        </div>
      )}
    </div>
  );
}
