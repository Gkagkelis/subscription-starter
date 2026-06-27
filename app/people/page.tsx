"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import TopNav from "../../components/TopNav";
import { buildAgendaMap, type ProbeV4Response, type AgendaMapItem } from "../../lib/noraya/strategy-room-intelligence";
import { IBM_Plex_Sans } from "next/font/google";

const plex = IBM_Plex_Sans({ subsets: ["greek", "latin"], weight: ["400", "500", "600", "700"], display: "swap" });

type Quote = { text: string; name: string; source: string; likes: number; followers: number | null; influence: number; retweets?: number; quotes?: number; replies?: number };
type Theme = { label: string; gist: string; share_hint: string; quotes: Quote[] };
type Voices = {
  summary: { dominant_emotion: string; emotion_label: string; one_liner: string };
  themes: Theme[];
  demands: string[];
  for_party: { resonates: string; avoid: string; opportunity: string };
  note?: string;
};
type VoicesResponse = {
  success: boolean;
  counts: { youtube: number; twitter: number; total: number };
  documentation_level: string;
  voices?: Voices;
  feed?: { youtube: Quote[]; twitter: Quote[] };
  empty?: boolean;
  message?: string;
};

const PER = 10;
function quoteKey(q: Quote): string {
  return `${q.name || ""}|${(q.text || "").slice(0, 40)}`;
}

// Ένα γεγονός μέσα σε μια θεματική (επίπεδο 2)
type AgendaEventItem = {
  id: string;
  title: string;
  score: number;
};
// Μια θεματική (επίπεδο 1) που ανοίγει σε γεγονότα
type AgendaThemeItem = {
  clusterId: string;
  topic: string;
  score: number;
  events: AgendaEventItem[];
};

function num(v: unknown, f = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : f;
}

function anonymize(raw: string): string {
  const n = String(raw || "").replace(/^@+/, "").trim();
  if (!n) return "Πολίτης";
  const p = n.split(/\s+/).filter(Boolean);
  if (p.length >= 2 && p[1].length) return `${p[0]} ${p[1][0]}…`;
  const t = p[0];
  if (/\d{2,}/.test(t)) return "Πολίτης";
  return t.length <= 4 ? t : `${t.slice(0, 3)}…`;
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".0", "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".0", "") + "k";
  return String(n);
}

function emotionMeta(e: string): { color: string; soft: string } {
  const k = String(e || "").toLowerCase();
  if (k === "anger") return { color: "#f87171", soft: "rgba(248,113,113,0.12)" };
  if (k === "frustration") return { color: "#fb923c", soft: "rgba(251,146,60,0.12)" };
  if (k === "worry") return { color: "#fbbf24", soft: "rgba(251,191,36,0.12)" };
  if (k === "support") return { color: "#34d399", soft: "rgba(52,211,153,0.12)" };
  if (k === "hope") return { color: "#22d3ee", soft: "rgba(34,211,238,0.12)" };
  return { color: "#94a3b8", soft: "rgba(148,163,184,0.12)" };
}

function influenceMeta(n: number): { label: string; color: string; glow: string } {
  if (n >= 75) return { label: "Πολύ δυνατή φωνή", color: "#22d3ee", glow: "0 0 22px rgba(34,211,238,0.35)" };
  if (n >= 50) return { label: "Δυνατή φωνή", color: "#34d399", glow: "0 0 14px rgba(52,211,153,0.22)" };
  if (n >= 25) return { label: "Μέτρια φωνή", color: "#fbbf24", glow: "none" };
  return { label: "Χαμηλή απήχηση", color: "#64748b", glow: "none" };
}

function docMeta(d: string): { label: string; cls: string } {
  const k = String(d || "").toLowerCase();
  if (k === "strong") return { label: "Τεκμηρίωση: Ισχυρή", cls: "text-emerald-200 border-emerald-300/25 bg-emerald-300/10" };
  if (k === "medium") return { label: "Τεκμηρίωση: Μεσαία", cls: "text-amber-200 border-amber-300/30 bg-amber-300/10" };
  return { label: "Τεκμηρίωση: Αρχική", cls: "text-zinc-300 border-[#243049] bg-white/[0.03]" };
}

function sourceBadge(src: string): { label: string; cls: string } {
  // Η αριστερή στήλη (πηγή «youtube») εμφανίζεται ως Facebook, η δεξιά ως Twitter.
  const k = String(src || "").toLowerCase();
  if (k === "twitter") return { label: "Twitter", cls: "text-sky-200 border-sky-300/25 bg-sky-300/10" };
  return { label: "Facebook", cls: "text-blue-200 border-blue-300/25 bg-blue-300/10" };
}

export default function PeoplePage() {
  // Θεματικές (επίπεδο 1) από τον Χάρτη ατζέντας (agenda-probe), ίδια σειρά/score με το «Σήμερα».
  const [themes, setThemes] = useState<AgendaThemeItem[]>([]);
  const [party, setParty] = useState("elas");
  const [partyLabel, setPartyLabel] = useState("ΕΛΑΣ");
  const [loadingList, setLoadingList] = useState(true);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [data, setData] = useState<VoicesResponse | null>(null);
  const [listening, setListening] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [fullNames, setFullNames] = useState(true);
  const [feedYt, setFeedYt] = useState<Quote[]>([]);
  const [feedTw, setFeedTw] = useState<Quote[]>([]);
  const [win, setWin] = useState(0);
  const [refilling, setRefilling] = useState(false);

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
      // Πηγή = ο ΙΔΙΟΣ Χάρτης ατζέντας με το «Σήμερα»: agenda-probe → buildAgendaMap.
      try {
        const r = await fetch(
          `/api/situation-engine/agenda-probe?token=dev&hours=168&party=${encodeURIComponent(pk)}`,
          { cache: "no-store" }
        );
        if (r.ok) {
          const probe = (await r.json()) as ProbeV4Response;
          const map: AgendaMapItem[] = probe?.success ? buildAgendaMap(probe) : [];
          const built: AgendaThemeItem[] = map.slice(0, 12).map((item) => ({
            clusterId: item.id,
            topic: item.title,
            score: Math.round(num(item.score)),
            events: (item.events || [])
              .filter((ev) => ev.id)
              .map((ev) => ({
                id: String(ev.id),
                title: ev.title || item.title,
                score: Math.round(num(ev.event_score, item.score)),
              })),
          })).filter((t) => t.events.length > 0);
          setThemes(built);
        }
      } catch {
        /* ignore */
      }
      setLoadingList(false);
    })();
  }, []);

  // Το επιλεγμένο γεγονός — θέλουμε topic (θεματική) + title + id για το listen().
  const selected = useMemo(() => {
    for (const t of themes) {
      const ev = t.events.find((e) => e.id === selectedEventId);
      if (ev) return { id: ev.id, title: ev.title, topic: t.topic };
    }
    return null;
  }, [themes, selectedEventId]);

  async function listen(topic: string, title: string, eventId: string) {
    setData(null);
    setErrMsg(null);
    setListening(true);
    try {
      const r = await fetch(`/api/voices?token=dev&party=${encodeURIComponent(party)}&topic=${encodeURIComponent(topic)}&q=${encodeURIComponent(title)}&event_id=${encodeURIComponent(eventId)}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok && j?.success) {
        setData(j as VoicesResponse);
        setFeedYt(Array.isArray(j?.feed?.youtube) ? j.feed.youtube : []);
        setFeedTw(Array.isArray(j?.feed?.twitter) ? j.feed.twitter : []);
        setWin(0);
      }
      else if (j?.error === "ai_unavailable") setErrMsg("Βρέθηκαν σχόλια αλλά η σύνθεση δεν ολοκληρώθηκε. Δοκίμασε ξανά.");
      else setErrMsg("Κάτι πήγε στραβά. Δοκίμασε ξανά σε λίγο.");
    } catch {
      setErrMsg("Πρόβλημα σύνδεσης. Δοκίμασε ξανά.");
    }
    setListening(false);
  }

  function pickEvent(eventId: string) {
    setSelectedEventId(eventId);
    setData(null);
    setErrMsg(null);
    setFeedYt([]);
    setFeedTw([]);
    setWin(0);
  }

  async function showMore() {
    const nextStart = (win + 1) * PER;
    const exhausted = nextStart >= feedYt.length && nextStart >= feedTw.length;
    if (exhausted && selected) {
      setRefilling(true);
      try {
        const r = await fetch(`/api/voices?token=dev&party=${encodeURIComponent(party)}&topic=${encodeURIComponent(selected.topic)}&q=${encodeURIComponent(selected.title)}&event_id=${encodeURIComponent(selected.id)}&feed_only=1`, { cache: "no-store" });
        const j = await r.json();
        if (j?.feed) {
          setFeedYt((prev) => {
            const seen = new Set(prev.map(quoteKey));
            return [...prev, ...(((j.feed.youtube as Quote[]) || []).filter((q) => !seen.has(quoteKey(q))))];
          });
          setFeedTw((prev) => {
            const seen = new Set(prev.map(quoteKey));
            return [...prev, ...(((j.feed.twitter as Quote[]) || []).filter((q) => !seen.has(quoteKey(q))))];
          });
        }
      } catch {
        /* ignore */
      }
      setRefilling(false);
    }
    setWin((w) => w + 1);
  }

  const v = data?.voices || null;
  const em = emotionMeta(v?.summary?.dominant_emotion || "");

  return (
    <div className={`${plex.className} min-h-screen bg-[#060a14] text-zinc-200`}>
      <style>{`
        @keyframes pvIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pvWave{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
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
          <div className="rounded-2xl border border-[#1a2640] bg-[#0c1220] px-3 py-2 text-[11px] text-zinc-400">{partyLabel}</div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-8">
        <section className="mb-6">
          <div className="text-xs font-medium text-cyan-300/70">Φωνές πολιτών</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">Τι λέει ο κόσμος</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Πραγματικά σχόλια από Facebook &amp; Twitter, με δείκτη δυναμικής ανά φωνή, συνθεμένα σε εικόνα κοινής γνώμης για {partyLabel}.</p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          {/* Picker: Χάρτης ατζέντας — θεματική → ανοίγει → γεγονότα (ίδιο με «Σήμερα») */}
          <aside className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-3">
            <div className="mb-2 px-1 text-xs font-medium text-zinc-400">Χάρτης ατζέντας</div>
            {loadingList ? (
              <div className="grid gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div>
            ) : themes.length === 0 ? (
              <div className="px-1 py-6 text-center text-xs text-zinc-500">Καμία ενεργή θεματική αυτή τη στιγμή.</div>
            ) : (
              <div className="grid max-h-[72vh] gap-2 overflow-y-auto pr-1">
                {themes.map((t, i) => {
                  const tone = t.score >= 70 ? "red" : t.score >= 50 ? "amber" : "emerald";
                  const priorityLabel = t.score >= 70 ? "Υψηλή" : t.score >= 50 ? "Μεσαία" : "Χαμηλή";
                  const isExpanded = expandedTopic === t.topic;
                  const hasActiveChild = t.events.some((e) => e.id === selectedEventId);
                  return (
                    <div
                      key={`${t.clusterId}-${i}`}
                      className={`overflow-hidden rounded-2xl border transition ${
                        hasActiveChild ? "border-cyan-300/40 bg-cyan-300/[0.06]" : "border-[#162236] bg-[#0a0f1c]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedTopic((prev) => (prev === t.topic ? null : t.topic))}
                        className="group flex w-full items-center gap-2 p-3 text-left transition hover:bg-cyan-300/[0.04]"
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                          tone === "red" ? "border-red-400/40 bg-red-400/15 text-red-200"
                          : tone === "amber" ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
                          : "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                        }`}>{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-xs font-medium leading-5 text-zinc-200 group-hover:text-cyan-100">{t.topic}</div>
                          <div className={`mt-0.5 text-[10px] ${tone === "red" ? "text-red-300/80" : tone === "amber" ? "text-amber-300/80" : "text-emerald-300/80"}`}>
                            {priorityLabel} · {t.events.length} {t.events.length === 1 ? "γεγονός" : "γεγονότα"}
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] text-zinc-500">{isExpanded ? "▾" : "▸"}</span>
                      </button>
                      {isExpanded ? (
                        <div className="grid gap-1 border-t border-[#162236] px-2 pb-2 pt-2">
                          {t.events.map((ev) => {
                            const selectedChild = ev.id === selectedEventId;
                            return (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => pickEvent(ev.id)}
                                className={`rounded-xl px-2 py-1.5 text-left text-[11px] leading-4 transition ${
                                  selectedChild ? "bg-cyan-300/15 text-cyan-100" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                                }`}
                              >
                                <span className="line-clamp-2">{ev.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </aside>

          <section>
            {!selected ? (
              <div className="flex h-full min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-[#1a2640] bg-[#0a0f1c]/50 p-8 text-center text-sm text-zinc-500">
                Διάλεξε θεματική από αριστερά, άνοιξέ τη και επίλεξε γεγονός για να ακούσεις τι λέει ο κόσμος.
              </div>
            ) : !data && !listening && !errMsg ? (
              <div className="rounded-3xl border border-[#1a2640] bg-gradient-to-b from-[#0d1525] to-[#0a0f1c] p-8">
                <div className="text-[11px] text-zinc-500">{selected.topic}</div>
                <h2 className="mt-1 text-2xl font-semibold text-zinc-50">{selected.title}</h2>
                <p className="mt-3 max-w-xl text-sm text-zinc-400">Ο Noraya θα μαζέψει πραγματικά σχόλια πολιτών, θα μετρήσει τη δυναμική κάθε φωνής (likes + followers) και θα τα συνθέσει σε θεματικές.</p>
                <button type="button" onClick={() => listen(selected.topic, selected.title, selected.id)} className="mt-5 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/20">▶ Άκου τον κόσμο</button>
              </div>
            ) : listening ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl border border-cyan-300/20 bg-[#0a0f1c] p-8 text-center">
                <div className="mb-4 flex h-10 items-end gap-1.5">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i} className="w-1.5 rounded-full bg-cyan-300" style={{ height: "100%", transformOrigin: "bottom", animation: "pvWave 1s ease-in-out infinite", animationDelay: `${i * 0.1}s` }} />)}
                </div>
                <div className="text-sm text-zinc-300">Ακούω τον κόσμο…</div>
                <div className="mt-1 text-[11px] text-zinc-600">Μαζεύω σχόλια, μετράω δυναμική, ομαδοποιώ</div>
              </div>
            ) : errMsg ? (
              <div className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-8 text-center">
                <div className="text-sm text-zinc-300">{errMsg}</div>
                <button type="button" onClick={() => selected && listen(selected.topic, selected.title, selected.id)} className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs text-cyan-100 transition hover:bg-cyan-300/20">Δοκίμασε ξανά</button>
              </div>
            ) : data?.empty ? (
              <div className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-8 text-center text-sm text-zinc-400">{data.message || "Δεν βρέθηκαν σχόλια πολιτών γι' αυτό το θέμα αυτή τη στιγμή."}</div>
            ) : v ? (
              <div className="grid gap-5">
                <div className="overflow-hidden rounded-3xl border p-6" style={{ borderColor: em.color + "40", background: `linear-gradient(180deg, ${em.soft}, #0a0f1c)`, animation: "pvIn .4s ease both" }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] tracking-wide text-zinc-500">Κυρίαρχο συναίσθημα</div>
                      <div className="mt-1 text-3xl font-semibold" style={{ color: em.color }}>{v.summary.emotion_label}</div>
                    </div>
                    <div className="flex h-9 items-end gap-1">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <span key={i} className="w-1 rounded-full" style={{ height: `${30 + ((i * 37) % 70)}%`, background: em.color, opacity: 0.7, transformOrigin: "bottom", animation: "pvWave 1.4s ease-in-out infinite", animationDelay: `${i * 0.12}s` }} />)}
                    </div>
                  </div>
                  <p className="mt-3 text-[15px] leading-6 text-zinc-100">{v.summary.one_liner}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${docMeta(data!.documentation_level).cls}`}>{docMeta(data!.documentation_level).label}</span>
                    <span className="rounded-full border border-blue-300/25 bg-blue-300/10 px-2 py-0.5 text-[10px] text-blue-200">Facebook: {data!.counts.youtube}</span>
                    <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-0.5 text-[10px] text-sky-200">Twitter: {data!.counts.twitter}</span>
                    <span className="text-[10px] text-zinc-600">{data!.counts.total} σχόλια</span>
                  </div>
                  {v.note ? <p className="mt-2 text-[11px] text-zinc-500">{v.note}</p> : null}
                </div>

                {/* Names toggle + privacy note */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#1a2640] bg-[#0c1220] px-4 py-2.5">
                  <div className="text-[11px] text-zinc-500">Δημόσια σχόλια. Για συμμόρφωση (GDPR — πολιτικές απόψεις) μπορείς να εμφανίζεις ανωνυμοποιημένα ονόματα.</div>
                  <div className="flex items-center gap-1 rounded-full border border-[#1a2640] p-0.5">
                    <button type="button" onClick={() => setFullNames(true)} className={`rounded-full px-3 py-1 text-[11px] ${fullNames ? "bg-cyan-300/15 text-cyan-100" : "text-zinc-400"}`}>Πλήρη</button>
                    <button type="button" onClick={() => setFullNames(false)} className={`rounded-full px-3 py-1 text-[11px] ${!fullNames ? "bg-cyan-300/15 text-cyan-100" : "text-zinc-400"}`}>Ανωνυμοποιημένα</button>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-200">Τι λέει ο κόσμος</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {v.themes.map((t, i) => (
                      <div key={i} className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-4" style={{ animation: "pvIn .45s ease both", animationDelay: `${i * 70}ms` }}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[15px] font-semibold text-zinc-50">{t.label}</div>
                          {t.share_hint ? <span className="shrink-0 rounded-full border border-[#243049] bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400">{t.share_hint}</span> : null}
                        </div>
                        <p className="mt-1.5 text-[12px] leading-5 text-zinc-300">{t.gist}</p>
                        <div className="mt-3 grid gap-2">
                          {(t.quotes || []).slice(0, 3).map((q, k) => <QuoteBubble key={k} q={q} fullNames={fullNames} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {(feedYt.length > 0 || feedTw.length > 0) ? (
                  <div className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-200">Όλες οι φωνές</h3>
                        <div className="text-[11px] text-zinc-600">Τυχαίο δείγμα 10 + 10 · ταξινομημένο κατά δυναμική</div>
                      </div>
                      <button type="button" onClick={showMore} disabled={refilling} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-[11px] text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-50">
                        {refilling ? "Ανανέωση…" : (win + 1) * PER < Math.max(feedYt.length, feedTw.length) ? "Δείξε άλλες 10" : "Ανανέωση φωνών"}
                      </button>
                    </div>
                    <div className={`grid gap-4 ${feedTw.length > 0 ? "md:grid-cols-2" : ""}`}>
                      <div>
                        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-blue-200/80"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Facebook</div>
                        <div className="grid gap-2">
                          {feedYt.slice(win * PER, win * PER + PER).map((q, k) => <QuoteBubble key={`yt-${win}-${k}`} q={q} fullNames={fullNames} />)}
                          {feedYt.slice(win * PER, win * PER + PER).length === 0 ? <div className="rounded-2xl border border-dashed border-[#162236] py-4 text-center text-[11px] text-zinc-600">—</div> : null}
                        </div>
                      </div>
                      {feedTw.length > 0 ? (
                        <div>
                          <div className="mb-2 flex items-center gap-1.5 text-[11px] text-sky-200/80"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Twitter</div>
                          <div className="grid gap-2">
                            {feedTw.slice(win * PER, win * PER + PER).map((q, k) => <QuoteBubble key={`tw-${win}-${k}`} q={q} fullNames={fullNames} />)}
                            {feedTw.slice(win * PER, win * PER + PER).length === 0 ? <div className="rounded-2xl border border-dashed border-[#162236] py-4 text-center text-[11px] text-zinc-600">—</div> : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {Array.isArray(v.demands) && v.demands.length > 0 ? (
                  <div className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-5">
                    <h3 className="mb-2 text-sm font-semibold text-zinc-200">Τι ζητάει ο κόσμος</h3>
                    <div className="grid gap-1.5">
                      {v.demands.map((d, i) => <div key={i} className="flex items-start gap-2 text-[13px] text-zinc-200"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />{d}</div>)}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-3xl border border-cyan-300/25 bg-cyan-300/[0.04] p-5" style={{ animation: "pvIn .5s ease both" }}>
                  <div className="text-[11px] tracking-wide text-cyan-300/70">Τι σημαίνει για {partyLabel}</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <ForCard tone="emerald" title="Τι αγγίζει τον κόσμο" text={v.for_party?.resonates} />
                    <ForCard tone="red" title="Τι να αποφύγεις" text={v.for_party?.avoid} />
                    <ForCard tone="cyan" title="Πού είναι η ευκαιρία" text={v.for_party?.opportunity} />
                  </div>
                  <button type="button" onClick={() => selected && listen(selected.topic, selected.title, selected.id)} className="mt-4 rounded-xl border border-[#243049] bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-400 transition hover:text-zinc-200">↻ Νέα ακρόαση</button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}

function QuoteBubble({ q, fullNames }: { q: Quote; fullNames: boolean }): ReactNode {
  const sb = sourceBadge(q.source);
  const inf = influenceMeta(q.influence);
  const display = fullNames ? q.name || "Πολίτης" : anonymize(q.name);
  const initial = display.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="rounded-2xl border bg-[#0a0f1c] p-2.5" style={{ borderColor: q.influence >= 50 ? inf.color + "40" : "#162236", boxShadow: inf.glow }}>
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: inf.color + "22", color: inf.color }}>{initial}</div>
        <span className="truncate text-[11px] font-medium text-zinc-200">{display}</span>
        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] ${sb.cls}`}>{sb.label}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: inf.color + "1f", color: inf.color }} title="Δείκτης δυναμικής (likes + followers)">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: inf.color }} />
          {q.influence}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-5 text-zinc-200">«{q.text}»</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-zinc-600">
        {String(q.source).toLowerCase() === "twitter" ? (
          <>
            <span>↻ {formatNum(q.retweets || 0)}</span>
            {(q.quotes || 0) > 0 ? <span>❝ {formatNum(q.quotes || 0)}</span> : null}
            {(q.replies || 0) > 0 ? <span>💬 {formatNum(q.replies || 0)}</span> : null}
          </>
        ) : (
          <>
            <span>♥ {formatNum(q.likes)}</span>
            {q.followers != null ? <span>{formatNum(q.followers)} followers</span> : null}
          </>
        )}
        <span style={{ color: inf.color }}>{inf.label}</span>
      </div>
    </div>
  );
}

function ForCard({ tone, title, text }: { tone: "emerald" | "red" | "cyan"; title: string; text?: string }): ReactNode {
  const cls = tone === "emerald" ? "text-emerald-300/80" : tone === "red" ? "text-red-300/80" : "text-cyan-300/80";
  return (
    <div className="rounded-2xl bg-white/[0.03] p-3">
      <div className={`text-[11px] ${cls}`}>{title}</div>
      <p className="mt-1 text-[12px] leading-5 text-zinc-200">{text || "—"}</p>
    </div>
  );
}
