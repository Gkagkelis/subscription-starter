"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// ============================================================
// NORAYA PS — Η ΚΑΡΔΙΑ (οθονη): «Συμβαινει κατι -> Ετοιμα ολα»
// Route: /ps
// Ροη: διαλεγεις γεγονος -> ΑΝΑΛΥΣΗ (ξερει τον τοπο σου) -> ΚΙΝΗΣΕΙΣ -> ΕΤΟΙΜΑ ΠΟΣΤ.
// Minimal, feed κινητου, εθιστικο.
// ============================================================

const CYAN = "#22d3ee";
const CYAN_L = "#67e8f9";
const GOLD = "#fbbf24";
const RED = "#f87171";
const GREEN = "#34d399";

type Phase = "campaign" | "term" | "prep" | "";

type Me = {
  name: string;
  district: string;
  party: string;
  phase: Phase;
};

type Analysis = {
  what?: string;
  whyYou?: string;
  publicPulse?: string;
  attackRisk?: string;
};
type Move = { title?: string; detail?: string; stance?: string; why?: string };

// Τα 9 καναλια (id -> ετικετα + εικονιδιο)
const CHANNELS: Array<{ id: string; label: string; icon: string; hint?: string }> = [
  { id: "statement", label: "Δήλωση", icon: "📢", hint: "Επίσημη, δομή Self/Us/Now" },
  { id: "facebook", label: "Facebook", icon: "📘", hint: "Ζεστό, τοπικό" },
  { id: "instagram", label: "Instagram", icon: "📸", hint: "+ τι εικόνα" },
  { id: "twitter", label: "X / Twitter", icon: "🐦", hint: "Αιχμηρό tweet" },
  { id: "tiktok", label: "TikTok", icon: "🎬", hint: "Σενάριο βίντεο" },
  { id: "sms", label: "SMS / Viber", icon: "📱", hint: "Προσωπικό μήνυμα" },
  { id: "press", label: "Δελτίο Τύπου", icon: "📧", hint: "Θεσμικό, για ΜΜΕ" },
  { id: "radio", label: "Ραδιόφωνο", icon: "📻", hint: "Talking points" },
  { id: "speech", label: "Πολιτικός Λόγος", icon: "🎤", hint: "Ανά κοινό" },
];

// Κοινα για τον λογο/ποστ (audience)
const AUDIENCES = ["Γενικό κοινό", "Αγρότες", "Επιχειρηματίες", "Νέοι / φοιτητές", "Εργαζόμενοι", "Πλατεία / λαϊκή συγκέντρωση"];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#060a14] px-4 py-6 text-zinc-100">
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );
}

function phaseLabel(p: Phase): { text: string; color: string } {
  if (p === "campaign") return { text: "Προεκλογική", color: GOLD };
  if (p === "term") return { text: "Θητεία", color: CYAN_L };
  return { text: "Ετοιμασία", color: "#94a3b8" };
}

export default function PsDashboard() {
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  // εισαγωγη γεγονοτος
  const [eventTitle, setEventTitle] = useState("");
  const [eventSummary, setEventSummary] = useState("");

  // αναλυση
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState("");
  const [selectedMove, setSelectedMove] = useState<number | null>(null);

  // ποστ
  const [audience, setAudience] = useState(AUDIENCES[0]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [posts, setPosts] = useState<Record<string, string>>({});
  const [postLoading, setPostLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // --- φορτωσε ποιος ειμαι (district/party/phase) ---
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/onboarding", { cache: "no-store" });
        if (r.ok) {
          const p = await r.json();
          setMe({
            name: String(p?.representative_name || ""),
            district: String(p?.district || ""),
            party: String(p?.party_key || ""),
            phase: (p?.phase || "") as Phase,
          });
        }
      } catch {
        /* αγνοειται */
      } finally {
        setLoadingMe(false);
      }
    })();
  }, []);

  async function runAnalysis() {
    if (!eventTitle.trim()) return;
    setAnalyzing(true);
    setAnalyzeErr("");
    setAnalysis(null);
    setMoves([]);
    setSelectedMove(null);
    setPosts({});
    setActiveChannel(null);
    try {
      const r = await fetch("/api/ps/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "analysis", eventTitle, eventSummary }),
      });
      const j = await r.json();
      if (j?.ok) {
        setAnalysis(j.analysis || {});
        setMoves(Array.isArray(j.moves) ? j.moves : []);
      } else {
        setAnalyzeErr("Δεν βγήκε ανάλυση — δοκίμασε ξανά." + (j?.error ? ` (${String(j.error).slice(0, 50)})` : ""));
      }
    } catch (e: any) {
      setAnalyzeErr(e?.name === "AbortError" ? "Άργησε — δοκίμασε ξανά." : "Σφάλμα σύνδεσης.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function makePost(channelId: string) {
    setActiveChannel(channelId);
    if (posts[channelId]) return; // ηδη το εχουμε
    setPostLoading(channelId);
    try {
      const moveContext =
        selectedMove != null && moves[selectedMove]
          ? `${moves[selectedMove].title} — ${moves[selectedMove].detail} (${moves[selectedMove].stance})`
          : "";
      const r = await fetch("/api/ps/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "post",
          channel: channelId,
          eventTitle,
          eventSummary,
          audience: channelId === "speech" ? audience : "",
          moveContext,
        }),
      });
      const j = await r.json();
      if (j?.ok && j.text) {
        setPosts((prev) => ({ ...prev, [channelId]: j.text }));
      } else {
        setPosts((prev) => ({ ...prev, [channelId]: "⚠️ Δεν βγήκε — δοκίμασε ξανά." }));
      }
    } catch {
      setPosts((prev) => ({ ...prev, [channelId]: "⚠️ Σφάλμα σύνδεσης." }));
    } finally {
      setPostLoading(null);
    }
  }

  function copyPost(channelId: string) {
    const txt = posts[channelId];
    if (!txt) return;
    navigator.clipboard?.writeText(txt).then(() => {
      setCopied(channelId);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const ph = useMemo(() => phaseLabel(me?.phase || ""), [me?.phase]);

  if (loadingMe) {
    return (
      <Shell>
        <div className="pt-24 text-center text-zinc-500">Φόρτωση…</div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* HEADER */}
      <div className="mb-6">
        <div className="text-[11px] tracking-[0.2em]" style={{ color: CYAN_L }}>
          NORAYA PS
        </div>
        <h1 className="mt-1 text-2xl font-bold text-white">
          {me?.name ? `Καλημέρα, ${me.name}` : "Το κέντρο σου"}
        </h1>
        <div className="mt-1 flex items-center gap-2 text-[13px] text-zinc-400">
          {me?.district && <span>{me.district}</span>}
          {me?.district && <span className="text-zinc-600">·</span>}
          <span style={{ color: ph.color }}>{ph.text}</span>
        </div>
      </div>

      {/* 1. ΓΕΓΟΝΟΣ */}
      <div className="rounded-2xl border border-white/10 bg-[#0e1626] p-4">
        <div className="text-[12px] font-semibold tracking-wide" style={{ color: CYAN_L }}>
          🎯 ΤΟ ΘΕΜΑ ΤΗΣ ΗΜΕΡΑΣ
        </div>
        <p className="mt-1 text-[13px] text-zinc-400">
          Γράψε τι συμβαίνει — ο Noraya PS θα το αναλύσει με βάση τον τόπο, το κόμμα και το προφίλ σου.
        </p>
        <input
          value={eventTitle}
          onChange={(e) => setEventTitle(e.target.value)}
          placeholder="π.χ. Κλείνει κλινική στο νοσοκομείο"
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[14px] outline-none transition focus:border-cyan-300/40"
        />
        <textarea
          value={eventSummary}
          onChange={(e) => setEventSummary(e.target.value)}
          placeholder="(προαιρετικό) λεπτομέρειες, ή επικόλλησε απόσπασμα είδησης…"
          rows={2}
          className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[13px] outline-none transition focus:border-cyan-300/40"
        />
        <button
          onClick={runAnalysis}
          disabled={analyzing || !eventTitle.trim()}
          className="mt-3 w-full rounded-xl px-5 py-3 text-[14px] font-semibold text-slate-950 transition disabled:opacity-40"
          style={{ background: CYAN }}
        >
          {analyzing ? "Αναλύει…" : "Ανάλυσέ το →"}
        </button>
        {analyzeErr && <div className="mt-2 text-[12px]" style={{ color: RED }}>{analyzeErr}</div>}
      </div>

      {/* 2. ΑΝΑΛΥΣΗ */}
      {analysis && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#0e1626] p-4">
          <div className="text-[12px] font-semibold tracking-wide" style={{ color: CYAN_L }}>
            📊 Η ΑΝΑΛΥΣΗ
          </div>
          <div className="mt-3 space-y-3">
            {analysis.what && (
              <Field label="Τι γίνεται" text={analysis.what} />
            )}
            {analysis.whyYou && (
              <Field label="Γιατί σε αφορά" text={analysis.whyYou} color={CYAN_L} />
            )}
            {analysis.publicPulse && (
              <Field label="Τι λέει ο κόσμος" text={analysis.publicPulse} />
            )}
            {analysis.attackRisk && (
              <div className="rounded-xl border p-3" style={{ borderColor: RED + "40", background: RED + "0c" }}>
                <div className="text-[11px] font-semibold tracking-wide" style={{ color: RED }}>
                  ⚠️ ΠΟΥ ΘΑ ΣΟΥ ΤΗΝ ΠΕΣΟΥΝ
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-200">{analysis.attackRisk}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. ΚΙΝΗΣΕΙΣ */}
      {moves.length > 0 && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#0e1626] p-4">
          <div className="text-[12px] font-semibold tracking-wide" style={{ color: CYAN_L }}>
            🎯 ΤΙ ΝΑ ΚΑΝΕΙΣ
          </div>
          <p className="mt-1 text-[12px] text-zinc-500">Διάλεξε γραμμή — τα έτοιμα ποστ θα την ακολουθήσουν.</p>
          <div className="mt-3 space-y-2">
            {moves.map((m, i) => {
              const isDiff = (m.stance || "").includes("διαφορ");
              const active = selectedMove === i;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedMove(active ? null : i)}
                  className="w-full rounded-xl border p-3 text-left transition"
                  style={{
                    borderColor: active ? CYAN + "88" : "rgba(255,255,255,0.08)",
                    background: active ? CYAN + "12" : "rgba(0,0,0,0.2)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[14px] font-semibold text-zinc-100">{m.title}</div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        color: isDiff ? GOLD : GREEN,
                        background: (isDiff ? GOLD : GREEN) + "1a",
                      }}
                    >
                      {isDiff ? "Διαφοροποίηση" : "Ενωτικός"}
                    </span>
                  </div>
                  {m.detail && <p className="mt-1 text-[12.5px] text-zinc-400">{m.detail}</p>}
                  {m.why && <p className="mt-1 text-[11.5px] italic text-zinc-500">Γιατί: {m.why}</p>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. ΕΤΟΙΜΑ ΠΟΣΤ */}
      {analysis && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#0e1626] p-4">
          <div className="text-[12px] font-semibold tracking-wide" style={{ color: CYAN_L }}>
            📱 ΕΤΟΙΜΑ — ΕΝΑ ΚΛΙΚ
          </div>
          <p className="mt-1 text-[12px] text-zinc-500">
            Πάτα κανάλι → βγαίνει έτοιμο, στο ύφος σου, δεμένο με τον τόπο σου.
          </p>

          {/* κοινο (μονο για λογο) */}
          {activeChannel === "speech" && (
            <div className="mt-3">
              <div className="mb-1 text-[11px] text-zinc-500">Σε ποιο κοινό;</div>
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCES.map((a) => (
                  <button
                    key={a}
                    onClick={() => {
                      setAudience(a);
                      setPosts((prev) => {
                        const n = { ...prev };
                        delete n.speech;
                        return n;
                      });
                      makePost("speech");
                    }}
                    className="rounded-full border px-2.5 py-1 text-[11px] transition"
                    style={{
                      borderColor: audience === a ? CYAN + "88" : "rgba(255,255,255,0.1)",
                      color: audience === a ? CYAN_L : "#a1a1aa",
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* πλεγμα καναλιων */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {CHANNELS.map((c) => {
              const active = activeChannel === c.id;
              const done = !!posts[c.id];
              return (
                <button
                  key={c.id}
                  onClick={() => makePost(c.id)}
                  className="flex flex-col items-center rounded-xl border p-2.5 text-center transition"
                  style={{
                    borderColor: active ? CYAN + "88" : done ? GREEN + "44" : "rgba(255,255,255,0.08)",
                    background: active ? CYAN + "12" : "rgba(0,0,0,0.2)",
                  }}
                >
                  <span className="text-[18px]">{c.icon}</span>
                  <span className="mt-0.5 text-[11px] font-medium text-zinc-200">{c.label}</span>
                  {done && <span className="text-[9px]" style={{ color: GREEN }}>✓ έτοιμο</span>}
                </button>
              );
            })}
          </div>

          {/* αποτελεσμα ενεργου καναλιου */}
          {activeChannel && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[12px] font-semibold text-zinc-300">
                  {CHANNELS.find((c) => c.id === activeChannel)?.icon}{" "}
                  {CHANNELS.find((c) => c.id === activeChannel)?.label}
                </div>
                {posts[activeChannel] && !postLoading && (
                  <button
                    onClick={() => copyPost(activeChannel)}
                    className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-white/30"
                  >
                    {copied === activeChannel ? "✓ Αντιγράφηκε" : "Αντιγραφή"}
                  </button>
                )}
              </div>
              {postLoading === activeChannel ? (
                <div className="py-6 text-center text-[13px] text-zinc-500">Γράφει…</div>
              ) : (
                <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-zinc-100">
                  {posts[activeChannel]}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* κενη κατασταση */}
      {!analysis && !analyzing && (
        <div className="mt-6 text-center text-[12px] text-zinc-600">
          Γράψε ένα γεγονός πάνω και πάτα «Ανάλυσέ το» — όλα ξεκινούν από εκεί.
        </div>
      )}
    </Shell>
  );
}

function Field({ label, text, color }: { label: string; text: string; color?: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold tracking-wide" style={{ color: color || "#71717a" }}>
        {label}
      </div>
      <p className="mt-0.5 text-[13.5px] leading-relaxed text-zinc-200">{text}</p>
    </div>
  );
}
