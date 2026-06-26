"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import TopNav from "../../components/TopNav";
import { IBM_Plex_Sans } from "next/font/google";

const plex = IBM_Plex_Sans({
  subsets: ["greek", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

type Situation = Record<string, unknown>;

const STAGES = [
  "Παρακολούθηση",
  "Χαμηλή επίπτωση",
  "Θεσμική πρόκληση",
  "Κοινωνική πίεση",
  "Παρέμβαση αρχηγού",
  "Σύγκρουση",
];

const STAGE_ACCENT = ["#22d3ee", "#38bdf8", "#fbbf24", "#fb923c", "#fb7185", "#f87171"];

const STAGE_POSTURE = [
  "Παρακολούθηση — χωρίς δημόσια κίνηση ακόμη",
  "Έτοιμη γραμμή απάντησης, χαμηλό προφίλ",
  "Τεκμηριωμένη θεσμική παρέμβαση",
  "Ενεργοποίηση κοινωνικής πίεσης",
  "Παρέμβαση αρχηγού / πρώτο πρόσωπο",
  "Μετωπική σύγκρουση — πλήρης ανάπτυξη",
];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function pick(s: Situation, key: string): unknown {
  if (s[key] !== undefined && s[key] !== null) return s[key];

  const brief = s["advisor_brief"];
  if (brief && typeof brief === "object" && (brief as Record<string, unknown>)[key] !== undefined) {
    return (brief as Record<string, unknown>)[key];
  }

  return undefined;
}

function riskMeta(raw: unknown): { label: string; dot: string; ring: string } {
  const v = String(raw ?? "").toLowerCase();

  if (/(high|υψηλ|critical|κρίσιμ|severe)/.test(v)) {
    return { label: "Υψηλό ρίσκο", dot: "#f87171", ring: "border-red-400/40" };
  }

  if (/(medium|μεσα|moderate|μέτρι)/.test(v)) {
    return { label: "Μεσαίο ρίσκο", dot: "#fbbf24", ring: "border-amber-300/30" };
  }

  if (/(low|χαμηλ|minor)/.test(v)) {
    return { label: "Χαμηλό ρίσκο", dot: "#34d399", ring: "border-emerald-300/25" };
  }

  return { label: "Άγνωστο ρίσκο", dot: "#64748b", ring: "border-[#1a2640]" };
}

type Card = {
  id: string;
  title: string;
  topic: string;
  score: number;
  stage: number;
  recommended: number;
  escalate: boolean;
  nextMove: string;
  risk: ReturnType<typeof riskMeta>;
  articles: number;
  sources: number;
};

function toCard(s: Situation): Card {
  const score = num(
    pick(s, "priority_score") ??
      pick(s, "strategic_index_score") ??
      pick(s, "event_score") ??
      pick(s, "agenda_score")
  );

  const stage = clamp(
    Math.round(num(pick(s, "escalation_level"), score >= 70 ? 3 : score >= 50 ? 2 : 1)),
    1,
    6
  );

  const recommended = clamp(
    Math.round(num(pick(s, "escalation_recommended"), score >= 75 ? 3 : 2)),
    1,
    6
  );

  const action = pick(s, "recommended_action");
  const actionStr = typeof action === "string" && action.trim() ? action.trim() : "";

  return {
    id: String(s["id"] ?? s["topic"] ?? Math.random().toString(36).slice(2)),
    title: String(s["title"] ?? s["topic"] ?? "Χωρίς τίτλο"),
    topic: String(s["topic"] ?? s["category"] ?? ""),
    score: Math.round(score),
    stage,
    recommended,
    escalate: recommended > stage,
    nextMove: actionStr || STAGE_POSTURE[stage - 1],
    risk: riskMeta(pick(s, "political_risk_level")),
    articles: num(pick(s, "article_count")),
    sources: num(pick(s, "source_count")),
  };
}

export default function SituationsPage() {
  const router = useRouter();

  const [situations, setSituations] = useState<Situation[]>([]);
  const [loading, setLoading] = useState(true);
  const [partyLabel, setPartyLabel] = useState("ΕΛΑΣ");
  const [riskFilter, setRiskFilter] = useState<"all" | "high">("all");
  const [onlyEscalate, setOnlyEscalate] = useState(false);
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
        const r = await fetch(`/api/situation-engine?token=dev&party=${encodeURIComponent(pk)}`, {
          cache: "no-store",
        });

        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j?.situations)) setSituations(j.situations as Situation[]);
        }
      } catch {
        /* ignore */
      }

      setLoading(false);
    })();
  }, []);

  const cards = useMemo(() => situations.map(toCard).sort((a, b) => b.score - a.score), [situations]);

  const filtered = useMemo(
    () =>
      cards.filter(
        (c) =>
          (riskFilter === "all" || c.risk.label === "Υψηλό ρίσκο") &&
          (!onlyEscalate || c.escalate)
      ),
    [cards, riskFilter, onlyEscalate]
  );

  const columns = useMemo(() => STAGES.map((_, i) => filtered.filter((c) => c.stage === i + 1)), [filtered]);

  const totalActive = cards.length;
  const needEscalation = useMemo(() => cards.filter((c) => c.escalate).length, [cards]);
  const highRisk = useMemo(() => cards.filter((c) => c.risk.label === "Υψηλό ρίσκο").length, [cards]);

  function openTopic(c: Card) {
    setLoadingTopic(c.topic || c.title);

    const q = c.topic ? `?topic=${encodeURIComponent(c.topic)}` : "";

    setTimeout(() => router.push(`/strategy-room${q}`), 600);
  }

  return (
    <div className={`${plex.className} min-h-screen bg-[#060a14] text-zinc-200`}>
      <style>{`
        @keyframes sitIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sitPulse{0%,100%{opacity:1}50%{opacity:.45}}
        @keyframes barGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
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

          <TopNav />

          <div className="rounded-2xl border border-[#1a2640] bg-[#0c1220] px-3 py-2 text-[11px] text-zinc-400">
            {partyLabel}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-8">
        <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-cyan-300/70">Πίνακας καταστάσεων</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
              Πού στέκεται κάθε μάχη
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Κάθε ενεργή κατάσταση στο στάδιο αντίδρασης που βρίσκεται — και η επόμενη κίνηση για{" "}
              {partyLabel}.
            </p>
          </div>

          <div className="flex gap-2">
            <Stat label="Ενεργές" value={totalActive} tone="text-zinc-100" />
            <Stat label="Θέλουν κλιμάκωση" value={needEscalation} tone="text-amber-300" />
            <Stat label="Υψηλό ρίσκο" value={highRisk} tone="text-red-300" />
          </div>
        </section>

        <section className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-500">Φίλτρα:</span>
          <Toggle active={riskFilter === "all"} onClick={() => setRiskFilter("all")}>
            Όλες
          </Toggle>
          <Toggle active={riskFilter === "high"} onClick={() => setRiskFilter("high")}>
            Μόνο υψηλό ρίσκο
          </Toggle>
          <Toggle active={onlyEscalate} onClick={() => setOnlyEscalate((v) => !v)}>
            Μόνο όσες θέλουν κλιμάκωση
          </Toggle>
        </section>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {STAGES.map((_, i) => (
              <div
                key={i}
                className="h-72 animate-pulse rounded-3xl border border-[#1a2640] bg-[#0c1220]"
              />
            ))}
          </div>
        ) : totalActive === 0 ? (
          <div className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-8 text-center text-sm text-zinc-400">
            Δεν υπάρχουν ενεργές καταστάσεις αυτή τη στιγμή. Μόλις εντοπιστούν νέα γεγονότα, ο πίνακας
            γεμίζει αυτόματα.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {STAGES.map((stage, i) => {
              const accent = STAGE_ACCENT[i];
              const col = columns[i];

              return (
                <div
                  key={stage}
                  className="flex min-h-[120px] flex-col rounded-3xl border border-[#141f38] bg-[#0a0f1c]/70 p-2.5"
                >
                  <div className="mb-2 px-1.5">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-semibold text-zinc-200">{stage}</div>
                      <div className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {col.length}
                      </div>
                    </div>

                    <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.04]">
                      <div
                        className="h-full origin-left rounded-full"
                        style={{
                          background: accent,
                          animation: "barGrow .7s ease forwards",
                          animationDelay: `${i * 60}ms`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-2">
                    {col.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[#172339] py-6 text-[10px] text-zinc-600">
                        —
                      </div>
                    ) : (
                      col.map((c, idx) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => openTopic(c)}
                          style={{
                            animation: "sitIn .45s ease both",
                            animationDelay: `${idx * 50 + i * 40}ms`,
                            borderLeftColor: c.risk.dot,
                          }}
                          className={`group rounded-2xl border border-l-[3px] ${c.risk.ring} bg-[#0c1220] p-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-cyan-300/[0.03]`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[10px] text-zinc-500">{c.topic || "—"}</span>
                            <span className="flex shrink-0 items-center gap-1 text-[10px] text-zinc-500">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: c.risk.dot }}
                              />
                              {c.score}
                            </span>
                          </div>

                          <div className="mt-1 line-clamp-2 text-[13px] font-medium leading-5 text-zinc-100">
                            {c.title}
                          </div>

                          <div className="mt-2 rounded-xl bg-white/[0.03] px-2 py-1.5">
                            <div className="text-[9px] uppercase tracking-wide text-zinc-600">
                              Επόμενη κίνηση
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-zinc-300">
                              {c.nextMove}
                            </div>
                          </div>

                          {c.escalate ? (
                            <div
                              className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[10px] text-amber-200"
                              style={{ animation: "sitPulse 2.2s ease-in-out infinite" }}
                            >
                              <span>▲</span>
                              <span>Πρόταση κλιμάκωσης → {STAGES[c.recommended - 1]}</span>
                            </div>
                          ) : null}

                          <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-600">
                            <span>
                              {c.articles} άρθρα · {c.sources} πηγές
                            </span>
                            <span className="text-cyan-300/0 transition group-hover:text-cyan-300/70">
                              Άνοιγμα →
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-[#1a2640] bg-[#0c1220] px-4 py-2.5 text-center">
      <div className={`text-xl font-semibold ${tone}`}>{value}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
        active
          ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
          : "border-[#1a2640] bg-[#0c1220] text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
