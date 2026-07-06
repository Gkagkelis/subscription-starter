"use client";

import { useEffect, useMemo, useState } from "react";
import {
  itemsForMode,
  buildProfile,
  ISSUE_TOPICS,
  level5,
  type Item,
  type Answers,
} from "../../../lib/noraya/psychometrics";

// ============================================================
// NORAYA — Ερωτηματολογιο Προφιλ Βουλευτη/Υποψηφιου (DEMO, ασυνδετο)
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
  const [mode, setMode] = useState<"short" | "full" | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [ranked, setRanked] = useState<string[]>(ISSUE_TOPICS);
  const [done, setDone] = useState(false);

  const items = useMemo(() => (mode ? itemsForMode(mode) : []), [mode]);
  const hasRanking = mode === "full";
  const totalSteps = items.length + (hasRanking ? 1 : 0);

  // restore
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.mode) setMode(s.mode);
        if (s.answers) setAnswers(s.answers);
        if (Array.isArray(s.ranked)) setRanked(s.ranked);
        if (typeof s.step === "number") setStep(s.step);
      }
    } catch {}
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

  function answer(it: Item, v: number) {
    setAnswers((a) => ({ ...a, [it.id]: v }));
    setTimeout(() => setStep((s) => Math.min(totalSteps, s + 1)), 180);
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
            NORAYA · ΠΡΟΦΙΛ ΒΟΥΛΕΥΤΗ / ΥΠΟΨΗΦΙΟΥ
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
          <div className="mt-6 text-[11px] text-zinc-600">DEMO · ασυνδετη σελιδα · οι απαντησεις μενουν τοπικα στον browser σου</div>
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
              <Compass x={comp.economic} y={comp.social} />
              <div className="mt-2 text-center text-[11px] text-zinc-500">
                Οικονομικα: {comp.economic! < 0 ? "Αριστερα" : comp.economic! > 0 ? "Δεξια" : "Κεντρο"} ({comp.economic}) ·
                Κοινωνικα: {comp.social! < 0 ? "Φιλελευθερος" : comp.social! > 0 ? "Συντηρητικος" : "Κεντρο"} ({comp.social})
              </div>
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
            <div className="text-[13px] text-zinc-200">
              <b style={{ color: CYAN_L }}>Επομενο βημα:</b> πανω σε αυτα τα σκορ, ο Noraya θα γραψει το «αφηγημα ταυτοτητας», το message-market fit (ποια ηθικα frames να χρησιμοποιεις), τη θεση σου vs το κομμα σου & τον μεσο ψηφοφορο, και το Red Team.
            </div>
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

function Compass({ x, y }: { x: number | null; y: number | null }) {
  const px = ((x ?? 0) + 10) / 20 * 100;
  const py = (10 - (y ?? 0)) / 20 * 100; // y+ = συντηρητικος = κατω
  return (
    <div className="relative mx-auto h-44 w-44 rounded-lg border border-white/10 bg-[#0a1120]">
      <div className="absolute left-1/2 top-0 h-full w-px bg-white/10" />
      <div className="absolute top-1/2 left-0 h-px w-full bg-white/10" />
      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] text-zinc-600">ΑΡΙΣΤ.</span>
      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-zinc-600">ΔΕΞΙΑ</span>
      <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] text-zinc-600">ΣΥΝΤΗΡ.</span>
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-zinc-600">ΦΙΛΕΛ.</span>
      <div
        className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#060a14]"
        style={{ left: px + "%", top: py + "%", background: CYAN }}
      />
    </div>
  );
}
