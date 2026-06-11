"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { IBM_Plex_Sans } from "next/font/google";

const plex = IBM_Plex_Sans({ subsets: ["greek", "latin"], weight: ["400", "500", "600", "700"], display: "swap" });

type Situation = Record<string, unknown>;
type Quote = { text: string; name: string; source: string; likes: number; followers: number | null; influence: number };
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

const navTabs: { label: string; href: string | null }[] = [
  { label: "Σήμερα", href: "/strategy-room" },
  { label: "Ατζέντα", href: "/agenda" },
  { label: "Καταστάσεις", href: "/situations" },
  { label: "Σενάρια", href: "/scenarios" },
  { label: "Πρόσωπα", href: "/people" },
  { label: "Αρχεία", href: null },
  { label: "Δεδομένα", href: null },
];

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
  if (String(src).toLowerCase() === "twitter") return { label: "Twitter · πειραματικό", cls: "text-sky-200 border-sky-300/25 bg-sky-300/10" };
  return { label: "YouTube", cls: "text-red-200 border-red-300/20 bg-red-400/10" };
}

export default function PeoplePage() {
  const [situations, setSituations] = useState<Situation[]>([]);
  const [party, setParty] = useState("elas");
  const [partyLabel, setPartyLabel] = useState("ΕΛΑΣ");
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
          id: String(s["id"] ?? s["topic"] ?? ""),
          title: String(s["title"] ?? s["topic"] ?? "Χωρίς τίτλο"),
          topic: String(s["topic"] ?? s["category"] ?? ""),
          score: Math.round(num(s["priority_score"] ?? s["strategic_index_score"] ?? s["event_score"])),
        }))
        .filter((s) => s.id)
        .sort((a, b) => b.score - a.score),
    [situations]
  );

  const selected = useMemo(() => list.find((s) => s.id === selectedId) || null, [list, selectedId]);

  async function listen(topic: string, title: string) {
    setData(null);
    setErrMsg(null);
    setListening(true);
    try {
      const r = await fetch(`/api/voices?token=dev&party=${encodeURIComponent(party)}&topic=${encodeURIComponent(topic)}&q=${encodeURIComponent(title)}`, { cache: "no-store" });
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

  function pick(id: string) {
    setSelectedId(id);
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
        const r = await fetch(`/api/voices?token=dev&party=${encodeURIComponent(party)}&topic=${encodeURIComponent(selected.topic)}&q=${encodeURIComponent(selected.title)}&feed_only=1`, { cache: "no-store" });
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
          <nav className="flex items-center gap-1">
            {navTabs.map((tab) => {
              const active = tab.label === "Πρόσωπα";
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
          <div className="text-xs font-medium text-cyan-300/70">Φωνές πολιτών</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">Τι λέει ο κόσμος</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Πραγματικά σχόλια από YouTube και Twitter, με δείκτη δυναμικής ανά φωνή, συνθεμένα σε εικόνα κοινής γνώμης για {partyLabel}.</p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-3">
            <div className="mb-2 px-1 text-xs font-medium text-zinc-400">Θέματα</div>
            {loadingList ? (
              <div className="grid gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div>
            ) : list.length === 0 ? (
              <div className="px-1 py-6 text-center text-xs text-zinc-500">Καμία ενεργή κατάσταση αυτή τη στιγμή.</div>
            ) : (
              <div className="grid max-h-[70vh] gap-1.5 overflow-y-auto pr-1">
                {list.map((s) => (
                  <button key={s.id} type="button" onClick={() => pick(s.id)} className={`rounded-2xl border p-2.5 text-left transition ${selectedId === s.id ? "border-cyan-300/40 bg-cyan-300/10" : "border-[#162236] bg-[#0a0f1c] hover:border-cyan-300/20 hover:bg-white/[0.03]"}`}>
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

          <section>
            {!selected ? (
              <div className="flex h-full min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-[#1a2640] bg-[#0a0f1c]/50 p-8 text-center text-sm text-zinc-500">
                Διάλεξε ένα θέμα από αριστερά για να ακούσεις τι λέει ο κόσμος.
              </div>
            ) : !data && !listening && !errMsg ? (
              <div className="rounded-3xl border border-[#1a2640] bg-gradient-to-b from-[#0d1525] to-[#0a0f1c] p-8">
                <div className="text-[11px] text-zinc-500">{selected.topic}</div>
                <h2 className="mt-1 text-2xl font-semibold text-zinc-50">{selected.title}</h2>
                <p className="mt-3 max-w-xl text-sm text-zinc-400">Ο Noraya θα μαζέψει πραγματικά σχόλια πολιτών, θα μετρήσει τη δυναμική κάθε φωνής (likes + followers) και θα τα συνθέσει σε θεματικές.</p>
                <button type="button" onClick={() => listen(selected.topic, selected.title)} className="mt-5 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/20">▶ Άκου τον κόσμο</button>
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
                <button type="button" onClick={() => selected && listen(selected.topic, selected.title)} className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs text-cyan-100 transition hover:bg-cyan-300/20">Δοκίμασε ξανά</button>
              </div>
            ) : data?.empty ? (
              <div className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-8 text-center text-sm text-zinc-400">{data.message || "Δεν βρέθηκαν σχόλια πολιτών γι' αυτό το θέμα αυτή τη στιγμή."}</div>
            ) : v ? (
              <div className="grid gap-5">
                <div className="overflow-hidden rounded-3xl border p-6" style={{ borderColor: em.color + "40", background: `linear-gradient(180deg, ${em.soft}, #0a0f1c)`, animation: "pvIn .4s ease both" }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-zinc-500">Κυρίαρχο συναίσθημα</div>
                      <div className="mt-1 text-3xl font-semibold" style={{ color: em.color }}>{v.summary.emotion_label}</div>
                    </div>
                    <div className="flex h-9 items-end gap-1">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <span key={i} className="w-1 rounded-full" style={{ height: `${30 + ((i * 37) % 70)}%`, background: em.color, opacity: 0.7, transformOrigin: "bottom", animation: "pvWave 1.4s ease-in-out infinite", animationDelay: `${i * 0.12}s` }} />)}
                    </div>
                  </div>
                  <p className="mt-3 text-[15px] leading-6 text-zinc-100">{v.summary.one_liner}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${docMeta(data!.documentation_level).cls}`}>{docMeta(data!.documentation_level).label}</span>
                    <span className="rounded-full border border-red-300/20 bg-red-400/10 px-2 py-0.5 text-[10px] text-red-200">YouTube: {data!.counts.youtube}</span>
                    {data!.counts.twitter > 0 ? <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-0.5 text-[10px] text-sky-200">Twitter: {data!.counts.twitter} · πειραματικό</span> : null}
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
                        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-red-200/80"><span className="h-1.5 w-1.5 rounded-full bg-red-400" /> YouTube</div>
                        <div className="grid gap-2">
                          {feedYt.slice(win * PER, win * PER + PER).map((q, k) => <QuoteBubble key={`yt-${win}-${k}`} q={q} fullNames={fullNames} />)}
                          {feedYt.slice(win * PER, win * PER + PER).length === 0 ? <div className="rounded-2xl border border-dashed border-[#162236] py-4 text-center text-[11px] text-zinc-600">—</div> : null}
                        </div>
                      </div>
                      {feedTw.length > 0 ? (
                        <div>
                          <div className="mb-2 flex items-center gap-1.5 text-[11px] text-sky-200/80"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Twitter · πειραματικό</div>
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
                  <div className="text-[11px] uppercase tracking-wide text-cyan-300/70">Τι σημαίνει για {partyLabel}</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <ForCard tone="emerald" title="Τι αγγίζει τον κόσμο" text={v.for_party?.resonates} />
                    <ForCard tone="red" title="Τι να αποφύγεις" text={v.for_party?.avoid} />
                    <ForCard tone="cyan" title="Πού είναι η ευκαιρία" text={v.for_party?.opportunity} />
                  </div>
                  <button type="button" onClick={() => selected && listen(selected.topic, selected.title)} className="mt-4 rounded-xl border border-[#243049] bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-400 transition hover:text-zinc-200">↻ Νέα ακρόαση</button>
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
      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-zinc-600">
        <span>♥ {formatNum(q.likes)}</span>
        {q.followers != null ? <span>{formatNum(q.followers)} followers</span> : null}
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
