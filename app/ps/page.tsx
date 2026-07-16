"use client";

import { useEffect, useMemo, useState } from "react";
import { districtByName } from "../../lib/noraya/electoral-districts";

// ============================================================
// NORAYA PS — Η ΚΑΡΔΙΑ: ΤΟΠΙΚΗ ΑΤΖΕΝΤΑ (agenda-setting) -> αναλυση -> 9 καναλια
// Route: /ps  ·  ΟΛΑ συνδεδεμενα.
// Θεματα ταξινομημενα κατα ΕΝΤΑΣΗ (ογκος=προτεραιοτητα, McCombs).
// «💡 δικο σου θεμα» = issue ownership (Budge). Κλικ σε θεμα -> αναλυση ολης της σωρου.
// ============================================================

const CYAN = "#22d3ee";
const CYAN_L = "#67e8f9";
const GOLD = "#fbbf24";
const RED = "#f87171";
const GREEN = "#34d399";

type Phase = "campaign" | "term" | "prep" | "";
type Me = { name: string; district: string; party: string; phase: Phase };
type Topic = { label: string; count: number; headlines: string[]; heat: "hot" | "rising" | "steady"; mine: boolean };
type Analysis = { what?: string; whyYou?: string; publicPulse?: string; attackRisk?: string };
type Move = { title?: string; detail?: string; stance?: string; why?: string };

const CHANNELS: Array<{ id: string; label: string; icon: string }> = [
  { id: "statement", label: "Δήλωση", icon: "📢" },
  { id: "facebook", label: "Facebook", icon: "📘" },
  { id: "instagram", label: "Instagram", icon: "📸" },
  { id: "twitter", label: "X", icon: "🐦" },
  { id: "tiktok", label: "TikTok", icon: "🎬" },
  { id: "sms", label: "SMS/Viber", icon: "📱" },
  { id: "press", label: "Δελτίο Τύπου", icon: "📧" },
  { id: "radio", label: "Ραδιόφωνο", icon: "📻" },
  { id: "speech", label: "Λόγος", icon: "🎤" },
];

const AUDIENCES = ["Γενικό κοινό", "Αγρότες", "Επιχειρηματίες", "Νέοι/φοιτητές", "Εργαζόμενοι", "Πλατεία"];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#060a14] px-4 py-6 text-zinc-100">
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );
}

function phaseLabel(p: Phase) {
  if (p === "campaign") return { text: "Προεκλογική", color: GOLD };
  if (p === "term") return { text: "Θητεία", color: CYAN_L };
  return { text: "Ετοιμασία", color: "#94a3b8" };
}

// ενταση -> ετικετα + χρωμα
function heatBadge(heat: Topic["heat"]) {
  if (heat === "hot") return { text: "🔥 ΒΡΑΖΕΙ", color: RED };
  if (heat === "rising") return { text: "📈 Ανεβαίνει", color: GOLD };
  return { text: "Σταθερό", color: "#94a3b8" };
}

export default function PsDashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [selectedPile, setSelectedPile] = useState<string[]>([]);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState("");
  const [selectedMove, setSelectedMove] = useState<number | null>(null);

  const [audience, setAudience] = useState(AUDIENCES[0]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [posts, setPosts] = useState<Record<string, string>>({});
  const [postLoading, setPostLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // ποιος ειμαι
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
      } catch {}
      finally { setLoadingMe(false); }
    })();
  }, []);

  // τοπικη ατζεντα (στελνει ΚΑΙ το search απο electoral-districts για σωστο φιλτρο)
  useEffect(() => {
    if (loadingMe || !me?.district) { if (!loadingMe) setNewsLoading(false); return; }
    (async () => {
      setNewsLoading(true);
      try {
        const d = districtByName(me.district);
        const qs = new URLSearchParams({ district: me.district });
        if (d?.search) qs.set("search", d.search);
        const r = await fetch(`/api/ps/local-news?${qs.toString()}`, { cache: "no-store" });
        const j = await r.json();
        if (j?.ok && Array.isArray(j.topics)) setTopics(j.topics);
      } catch {}
      finally { setNewsLoading(false); }
    })();
  }, [loadingMe, me?.district]);

  // πατας ΘΕΜΑ -> αναλυση ΟΛΗΣ της σωρου
  async function analyzeTopic(topic: Topic) {
    const eventTitle = topic.label;
    const pile = topic.headlines;
    setSelectedEvent(eventTitle);
    setSelectedPile(pile);
    setAnalyzing(true);
    setAnalyzeErr("");
    setAnalysis(null);
    setMoves([]);
    setSelectedMove(null);
    setPosts({});
    setActiveChannel(null);
    setTimeout(() => document.getElementById("ps-analysis")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    try {
      const r = await fetch("/api/ps/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "analysis",
          eventTitle,
          eventSummary: pile.join(" · "), // ΟΛΗ η σωρος γεγονοτων
        }),
      });
      const j = await r.json();
      if (j?.ok) {
        setAnalysis(j.analysis || {});
        setMoves(Array.isArray(j.moves) ? j.moves : []);
      } else {
        setAnalyzeErr("Δεν βγήκε ανάλυση — δοκίμασε ξανά." + (j?.error ? ` (${String(j.error).slice(0, 40)})` : ""));
      }
    } catch (e: any) {
      setAnalyzeErr(e?.name === "AbortError" ? "Άργησε — δοκίμασε ξανά." : "Σφάλμα σύνδεσης.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function makePost(channelId: string) {
    setActiveChannel(channelId);
    if (posts[channelId]) return;
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
          eventTitle: selectedEvent || "",
          eventSummary: selectedPile.join(" · "),
          audience: channelId === "speech" ? audience : "",
          moveContext,
        }),
      });
      const j = await r.json();
      setPosts((prev) => ({ ...prev, [channelId]: j?.ok && j.text ? j.text : "⚠️ Δεν βγήκε — δοκίμασε ξανά." }));
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
    return <Shell><div className="pt-24 text-center text-zinc-500">Φόρτωση…</div></Shell>;
  }

  return (
    <Shell>
      {/* HEADER */}
      <div className="mb-5">
        <div className="text-[11px] tracking-[0.2em]" style={{ color: CYAN_L }}>NORAYA PS</div>
        <h1 className="mt-1 text-2xl font-bold text-white">
          {me?.name ? `Καλημέρα, ${me.name}` : "Το κέντρο σου"}
        </h1>
        <div className="mt-1 flex items-center gap-2 text-[13px] text-zinc-400">
          {me?.district && <span>{me.district}</span>}
          {me?.district && <span className="text-zinc-600">·</span>}
          <span style={{ color: ph.color }}>{ph.text}</span>
        </div>
      </div>

      {/* ΤΟΠΙΚΗ ΑΤΖΕΝΤΑ */}
      <div className="rounded-2xl border border-white/10 bg-[#0e1626] p-4">
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-semibold tracking-wide" style={{ color: CYAN_L }}>
            📊 Η ΑΤΖΕΝΤΑ ΤΟΥ ΤΟΠΟΥ ΣΟΥ
          </div>
          <div className="text-[10px] text-zinc-600">τι βράζει τώρα</div>
        </div>
        <p className="mt-1 text-[12px] text-zinc-500">
          Ταξινομημένα κατά ένταση. Πάτα ένα θέμα → ανάλυση όλης της είδησης + έτοιμα ποστ.
        </p>

        {newsLoading ? (
          <div className="py-8 text-center text-[13px] text-zinc-500">Διαβάζω την ατζέντα του τόπου σου…</div>
        ) : topics.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-zinc-500">Ήρεμη μέρα — δεν βράζει κάτι τοπικά αυτή τη στιγμή.</div>
        ) : (
          <div className="mt-3 space-y-2.5">
            {topics.map((t, ti) => {
              const hb = heatBadge(t.heat);
              return (
                <button
                  key={ti}
                  onClick={() => analyzeTopic(t)}
                  className="w-full rounded-xl border border-white/[0.08] bg-black/20 p-3 text-left transition hover:border-cyan-300/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-zinc-100">{t.label}</span>
                      {t.mine && (
                        <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ color: GOLD, background: GOLD + "1a" }}>
                          💡 ΔΙΚΟ ΣΟΥ
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] font-bold" style={{ color: hb.color }}>{hb.text}</span>
                  </div>
                  {/* η σωρος: μια περιληψη των τιτλων */}
                  <div className="mt-1.5 space-y-0.5">
                    {t.headlines.slice(0, 2).map((h, hi) => (
                      <div key={hi} className="text-[11.5px] leading-snug text-zinc-500">
                        <span style={{ color: CYAN }}>·</span> {h}
                      </div>
                    ))}
                    {t.count > 2 && <div className="text-[10px] text-zinc-600">+{t.count - 2} ακόμα</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ΑΝΑΛΥΣΗ */}
      <div id="ps-analysis" />
      {(analyzing || analysis) && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#0e1626] p-4">
          <div className="text-[12px] font-semibold tracking-wide" style={{ color: CYAN_L }}>📊 Η ΑΝΑΛΥΣΗ</div>
          {selectedEvent && <div className="mt-1 text-[13px] font-medium text-zinc-200">{selectedEvent}</div>}
          {analyzing ? (
            <div className="py-8 text-center text-[13px] text-zinc-500">Αναλύω με βάση τον τόπο & το προφίλ σου…</div>
          ) : (
            <div className="mt-3 space-y-3">
              {analysis?.what && <Field label="Τι γίνεται" text={analysis.what} />}
              {analysis?.whyYou && <Field label="Γιατί σε αφορά" text={analysis.whyYou} color={CYAN_L} />}
              {analysis?.publicPulse && <Field label="Τι λέει ο κόσμος" text={analysis.publicPulse} />}
              {analysis?.attackRisk && (
                <div className="rounded-xl border p-3" style={{ borderColor: RED + "40", background: RED + "0c" }}>
                  <div className="text-[11px] font-semibold tracking-wide" style={{ color: RED }}>⚠️ ΠΟΥ ΘΑ ΣΟΥ ΤΗΝ ΠΕΣΟΥΝ</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-zinc-200">{analysis.attackRisk}</p>
                </div>
              )}
              {analyzeErr && <div className="text-[12px]" style={{ color: RED }}>{analyzeErr}</div>}
            </div>
          )}
        </div>
      )}

      {/* ΚΙΝΗΣΕΙΣ */}
      {moves.length > 0 && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#0e1626] p-4">
          <div className="text-[12px] font-semibold tracking-wide" style={{ color: CYAN_L }}>🎯 ΤΙ ΝΑ ΚΑΝΕΙΣ</div>
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
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ color: isDiff ? GOLD : GREEN, background: (isDiff ? GOLD : GREEN) + "1a" }}>
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

      {/* 9 ΚΑΝΑΛΙΑ */}
      {analysis && !analyzing && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#0e1626] p-4">
          <div className="text-[12px] font-semibold tracking-wide" style={{ color: CYAN_L }}>📱 ΕΤΟΙΜΑ — ΕΝΑ ΚΛΙΚ</div>
          <p className="mt-1 text-[12px] text-zinc-500">Πάτα κανάλι → βγαίνει έτοιμο, στο ύφος σου, δεμένο με τον τόπο σου.</p>

          {activeChannel === "speech" && (
            <div className="mt-3">
              <div className="mb-1 text-[11px] text-zinc-500">Σε ποιο κοινό;</div>
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCES.map((a) => (
                  <button key={a}
                    onClick={() => { setAudience(a); setPosts((p) => { const n = { ...p }; delete n.speech; return n; }); makePost("speech"); }}
                    className="rounded-full border px-2.5 py-1 text-[11px] transition"
                    style={{ borderColor: audience === a ? CYAN + "88" : "rgba(255,255,255,0.1)", color: audience === a ? CYAN_L : "#a1a1aa" }}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 grid grid-cols-3 gap-2">
            {CHANNELS.map((c) => {
              const active = activeChannel === c.id;
              const done = !!posts[c.id];
              return (
                <button key={c.id} onClick={() => makePost(c.id)}
                  className="flex flex-col items-center rounded-xl border p-2.5 text-center transition"
                  style={{ borderColor: active ? CYAN + "88" : done ? GREEN + "44" : "rgba(255,255,255,0.08)", background: active ? CYAN + "12" : "rgba(0,0,0,0.2)" }}>
                  <span className="text-[18px]">{c.icon}</span>
                  <span className="mt-0.5 text-[11px] font-medium text-zinc-200">{c.label}</span>
                  {done && <span className="text-[9px]" style={{ color: GREEN }}>✓</span>}
                </button>
              );
            })}
          </div>

          {activeChannel && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[12px] font-semibold text-zinc-300">
                  {CHANNELS.find((c) => c.id === activeChannel)?.icon} {CHANNELS.find((c) => c.id === activeChannel)?.label}
                </div>
                {posts[activeChannel] && postLoading !== activeChannel && (
                  <button onClick={() => copyPost(activeChannel)}
                    className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-white/30">
                    {copied === activeChannel ? "✓ Αντιγράφηκε" : "Αντιγραφή"}
                  </button>
                )}
              </div>
              {postLoading === activeChannel ? (
                <div className="py-6 text-center text-[13px] text-zinc-500">Γράφει…</div>
              ) : (
                <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-zinc-100">{posts[activeChannel]}</p>
              )}
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function Field({ label, text, color }: { label: string; text: string; color?: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold tracking-wide" style={{ color: color || "#71717a" }}>{label}</div>
      <p className="mt-0.5 text-[13.5px] leading-relaxed text-zinc-200">{text}</p>
    </div>
  );
}
