"use client";

import { useEffect, useMemo, useState } from "react";
import { themes } from "@/lib/noraya/taxonomy";

// ============================================================
// NORAYA — Σελίδα «Δεδομένα» (v4, premium dark)
// ============================================================

type Trend = [number, number][];
interface OutRow { key: string; label: string; recent: number; n_recent: number; low_sample: boolean; trend: Trend; }
interface DimBlock { key: string; label: string; groups: OutRow[]; }
interface TrustRow { key: string; label: string; recent: number; low_sample: boolean; }
interface MatchResult {
  ok: boolean; matched: boolean; kind?: "survey" | "noraya_only"; message?: string;
  match?: { topic_key: string | null; topic_label: string | null; umbrella?: string | null; method: string };
  input?: { theme: string; event_title: string };
  data?: {
    recent_window: [number, number]; year_range: [number, number];
    overall_salience_recent: number | null; trend: Trend; dimensions: DimBlock[];
    trust_government_by_occupation: TrustRow[]; noraya_note: string;
  };
}
interface Analysis {
  headline?: string; deep_read?: string; who_to_mobilize?: string; trust_angle?: string;
  opening?: string; risk?: string; adjacent?: string; next_move?: string;
  interpretation?: string; groups_affected?: string; trust_read?: string; bars_note?: string;
  web_findings?: string; left_right?: string; data_note?: string; has_internal_data?: boolean;
  sources?: { title?: string; url?: string }[];
}

function barColor(v: number, max: number): string {
  const r = max > 0 ? v / max : 0;
  return r >= 0.66 ? "#e0613a" : r >= 0.33 ? "#d98a6a" : "#caa493";
}

export default function DataPage() {
  const [query, setQuery] = useState("");
  const [activeEvent, setActiveEvent] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeDim, setActiveDim] = useState("occupation_group");
  const [showAllThemes, setShowAllThemes] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  function analysisInput(m: MatchResult) {
    const d = m.data;
    const top = (dimKey: string, n: number) => {
      const dim = d?.dimensions.find((x) => x.key === dimKey);
      return dim ? dim.groups.slice(0, n).map((g) => ({ label: g.label, recent: g.recent })) : [];
    };
    return {
      topic_key: m.match?.topic_key ?? null,
      topic_label: m.match?.umbrella || m.match?.topic_label || "θέμα",
      kind: m.kind || "survey",
      event_title: activeEvent || m.input?.event_title || "",
      data: d
        ? {
            overall_recent: d.overall_salience_recent,
            occupation: top("occupation_group", 4),
            age: top("age_group", 3),
            social_class: top("social_class_group", 3),
            trust_occupation: d.trust_government_by_occupation.map((t) => ({ label: t.label, recent: t.recent })),
            trend: d.trend,
            recent_window: d.recent_window,
          }
        : {},
    };
  }

  async function fetchAnalysis(m: MatchResult) {
    setAnalysis(null);
    setAnalysisLoading(true);
    try {
      const res = await fetch("/api/data/noraya-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analysisInput(m)),
      });
      const j = await res.json();
      if (j?.ok && j.analysis) setAnalysis(j.analysis);
    } catch {
      // σιωπηλά
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function runMatch(theme: string, eventTitle = "") {
    if (!theme.trim()) return;
    setLoading(true);
    setError("");
    setAnalysis(null);
    try {
      const res = await fetch("/api/data/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme, event_title: eventTitle }),
      });
      const data: MatchResult = await res.json();
      setResult(data);
      if (data.kind === "survey" && data.data && data.data.dimensions.length) {
        const hasOcc = data.data.dimensions.some((x) => x.key === "occupation_group");
        setActiveDim(hasOcc ? "occupation_group" : data.data.dimensions[0].key);
      }
      if (data.matched) fetchAnalysis(data);
    } catch (err: any) {
      setError("Σφάλμα σύνδεσης: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const theme = p.get("theme") || "";
    const ev = p.get("event") || "";
    if (theme) { setQuery(theme); setActiveEvent(ev); runMatch(theme, ev); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dimBlock = useMemo(() => result?.data?.dimensions.find((d) => d.key === activeDim), [result, activeDim]);
  const dimMax = useMemo(() => (dimBlock ? dimBlock.groups.reduce((m, g) => Math.max(m, g.recent), 0) : 0), [dimBlock]);
  const fullTrend = useMemo(() => (result?.data ? result.data.trend : []), [result]);
  const trendMax = useMemo(() => fullTrend.reduce((m, p) => Math.max(m, p[1]), 0), [fullTrend]);
  const visibleThemes = showAllThemes ? themes : themes.slice(0, 10);

  const card = "rounded-[1.5rem] border border-white/[0.07] bg-[#0a111f] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
  const pill = "text-xs px-3 py-1 rounded-full border transition";

  function exploreBlock(compact: boolean) {
    return (
      <div className={card + " p-4 space-y-3"}>
        <div className="text-[10px] font-semibold tracking-tight text-cyan-100/80">
          {compact ? "ή εξερεύνησε άλλο θέμα" : "Διάλεξε ένα θέμα"}
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setActiveEvent(""); runMatch(query); } }}
            placeholder="Γράψε θέμα ή γεγονός (π.χ. φωτιές, ακρίβεια)…"
            className="flex-1 px-3 py-2 text-zinc-100 bg-white/[0.04] border border-white/10 rounded-xl text-sm placeholder-zinc-500 focus:ring-2 focus:ring-cyan-400/40 outline-none"
          />
          <button onClick={() => { setActiveEvent(""); runMatch(query); }} disabled={loading}
            className="px-4 py-2 bg-cyan-400/90 text-[#06121a] rounded-xl text-sm font-semibold hover:bg-cyan-300 disabled:opacity-60">
            {loading ? "…" : "Δες"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleThemes.map((c) => (
            <button key={c} onClick={() => { setQuery(c); setActiveEvent(""); runMatch(c); }}
              className={pill + " border-white/10 text-zinc-400 hover:border-cyan-300/40 hover:text-cyan-100"}>
              {c}
            </button>
          ))}
          {!showAllThemes && themes.length > 10 ? (
            <button onClick={() => setShowAllThemes(true)} className={pill + " border-transparent text-cyan-300/80 hover:text-cyan-200"}>
              +{themes.length - 10} ακόμη
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function analysisCard() {
    if (analysisLoading) {
      return (
        <div className={card + " p-5"}>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.8)]" />
            <div className="text-[12px] font-semibold tracking-tight text-cyan-100/85">Ανάλυση Noraya</div>
          </div>
          <div className="text-sm text-zinc-500">Ο Noraya σκέφτεται…</div>
          <div className="mt-3 space-y-2">
            <div className="h-3 bg-white/[0.05] rounded w-3/4 animate-pulse" />
            <div className="h-3 bg-white/[0.05] rounded w-full animate-pulse" />
            <div className="h-3 bg-white/[0.05] rounded w-2/3 animate-pulse" />
          </div>
        </div>
      );
    }
    if (!analysis) return null;
    const cells: Array<[string, string]> = ([
      ["Ποιες ομάδες αφορά", analysis.groups_affected],
      ["Τι πιστεύουν", analysis.trust_read],
    ].filter((c) => c[1] && c[1] !== "—") as Array<[string, string]>);
    return (
      <div className="rounded-[1.5rem] border border-cyan-300/20 bg-gradient-to-b from-cyan-300/[0.05] to-[#0a111f] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-2 mb-2">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.8)]" />
          <div className="text-[12px] font-semibold tracking-tight text-cyan-100/85">Ανάλυση Noraya</div>
        </div>
        {analysis.data_note ? (
          <div className="mb-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2 text-[11px] leading-relaxed text-amber-100/80">
            {analysis.data_note}
          </div>
        ) : null}
        {analysis.headline ? <div className="text-[15px] font-semibold text-zinc-50 leading-snug">{analysis.headline}</div> : null}
        {analysis.interpretation ? (
          <div className="mt-3">
            <div className="text-[11px] font-medium text-cyan-100/70 mb-1">Ερμηνεία</div>
            <p className="text-sm text-zinc-300 leading-relaxed">{analysis.interpretation}</p>
          </div>
        ) : null}
        {cells.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
            {cells.map(([label, val]) => (
              <div key={label} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
                <div className="text-[11px] font-medium text-cyan-100/65 mb-1">{label}</div>
                <div className="text-[13px] text-zinc-200 leading-relaxed">{val}</div>
              </div>
            ))}
          </div>
        ) : null}
        {(analysis.web_findings && analysis.web_findings !== "—") ||
        (analysis.left_right && analysis.left_right !== "—") ||
        (Array.isArray(analysis.sources) && analysis.sources.length) ? (
          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              <div className="text-[12px] font-semibold tracking-tight text-emerald-100/85">Ζωντανή αναζήτηση</div>
            </div>
            {analysis.web_findings && analysis.web_findings !== "—" ? (
              <p className="text-[13px] text-zinc-200 leading-relaxed">{analysis.web_findings}</p>
            ) : null}
            {analysis.left_right && analysis.left_right !== "—" ? (
              <div className="mt-3">
                <div className="text-[11px] font-medium text-emerald-100/70 mb-1">Αριστερά–δεξιά</div>
                <p className="text-[13px] text-zinc-200 leading-relaxed">{analysis.left_right}</p>
              </div>
            ) : null}
            {Array.isArray(analysis.sources) && analysis.sources.length ? (
              <div className="mt-3">
                <div className="text-[11px] font-medium text-zinc-400 mb-1.5">Πηγές</div>
                <div className="flex flex-col gap-1">
                  {analysis.sources.map((sourceItem, i) => (
                    <a key={i} href={sourceItem?.url || "#"} target="_blank" rel="noopener noreferrer" className="text-[12px] text-cyan-300 hover:text-cyan-200 underline decoration-cyan-300/30 truncate">
                      {sourceItem?.title || sourceItem?.url}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function numbersSections() {
    const d = result?.data;
    if (!d) return null;
    return (
      <div className="space-y-5">
        <div className="text-[10px] font-semibold tracking-tight text-zinc-400 px-1">Τα δεδομένα από κάτω</div>
        {analysis?.bars_note ? (
          <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] px-3 py-2 text-[11px] leading-relaxed text-cyan-100/75">
            {analysis.bars_note}
          </div>
        ) : null}

        {fullTrend.length > 1 ? (
          <div className={card + " p-5"}>
            <div className="text-sm font-medium text-zinc-200 mb-1">Πόσο «καίει» το θέμα στον χρόνο</div>
            <div className="text-xs text-zinc-500 mb-4">% που το βάζουν στα κορυφαία προβλήματα της χώρας · {d.year_range[0]}–{d.year_range[1]}</div>
            <div className="flex items-end gap-1 h-28 border-b border-white/[0.06]">
              {fullTrend.map((p) => {
                const h = trendMax > 0 ? Math.round((p[1] / trendMax) * 100) : 0;
                return (
                  <div key={p[0]} className="flex-1 flex flex-col items-center justify-end h-full" title={p[0] + ": " + Math.round(p[1]) + "%"}>
                    <div style={{ height: h + "%", background: barColor(p[1], trendMax) }} className="w-full max-w-[22px] rounded-t" />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1 mt-1">
              {fullTrend.map((p) => <div key={p[0]} className="flex-1 text-center text-[9px] text-zinc-600">{"'" + String(p[0]).slice(2)}</div>)}
            </div>
          </div>
        ) : null}

        <div className={card + " p-5"}>
          <div className="text-sm font-medium text-zinc-200 mb-3">Ποιον αφορά — διάλεξε πώς να κόψεις τον κόσμο</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {d.dimensions.map((dim) => (
              <button key={dim.key} onClick={() => setActiveDim(dim.key)}
                className={pill + (dim.key === activeDim ? " bg-cyan-300/10 border-cyan-300/40 text-cyan-100" : " border-white/10 text-zinc-400 hover:border-white/20")}>
                {dim.label}
              </button>
            ))}
          </div>
          <div className="space-y-2.5">
            {dimBlock?.groups.map((g) => {
              const w = dimMax > 0 ? Math.round((g.recent / dimMax) * 100) : 0;
              return (
                <div key={g.key} className="flex items-center gap-3">
                  <div className="w-40 text-[13px] text-zinc-300">{g.label}</div>
                  <div className="flex-1 h-4 bg-white/[0.05] rounded overflow-hidden">
                    <div style={{ width: w + "%", background: barColor(g.recent, dimMax) }} className="h-full rounded" />
                  </div>
                  <div className="w-9 text-right text-[13px] font-semibold text-zinc-100">{g.recent}%</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-[11px] text-zinc-600 px-1 leading-relaxed">
          Πηγή: έρευνες Ευρωβαρόμετρου, {d.year_range[0]}–{d.year_range[1]}. Η ιστορική τάση καλύπτει όλα τα έτη· η εικόνα «ποιον αφορά» δείχνει την πιο πρόσφατη περίοδο, γιατί το ποιον νοιάζει αλλάζει στον χρόνο.
        </div>
      </div>
    );
  }

  function topicHeader() {
    const m = result?.match;
    if (!m) return null;
    const shown = m.umbrella || m.topic_label;
    const gray = result?.kind === "noraya_only";
    const proxy = result?.kind === "survey" && m.umbrella && m.topic_label && m.umbrella !== m.topic_label ? m.topic_label : "";
    return (
      <div className="flex items-center gap-2 flex-wrap px-1">
        <span className={"text-xs px-2.5 py-0.5 rounded-full border " + (gray ? "border-white/15 text-zinc-400" : "border-cyan-300/30 text-cyan-100 bg-cyan-300/[0.06]")}>
          θέμα: {shown}
        </span>
        {proxy ? <span className="text-[11px] text-zinc-500">δεδομένα βάσει: {proxy}</span> : null}
      </div>
    );
  }

  function bodySection() {
    if (!result) return null;
    if (!result.matched) {
      return <div className={card + " p-5 text-sm text-zinc-400"}>Δεν ταίριαξε κάποιο θέμα. Δοκίμασε ένα κουμπί ή άλλη λέξη.</div>;
    }
    return (
      <div className="space-y-5">
        {topicHeader()}
        {analysisCard()}
        {result.kind === "noraya_only" ? (
          <div className="text-[11px] text-zinc-600 px-1">
            Δεν υπάρχει σκληρή έρευνα Ευρωβαρόμετρου γι' αυτό το θέμα — η παραπάνω είναι ανάγνωση του Noraya.
          </div>
        ) : (
          numbersSections()
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060b16] py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Δεδομένα</h1>
          <p className="text-zinc-500 mt-1 text-sm">Ποιον αφορά ένα θέμα και τι πιστεύει — από έρευνες Ευρωβαρόμετρου.</p>
        </div>

        {activeEvent ? (
          <>
            <div className={card + " p-5"}>
              <div className="text-[10px] font-semibold tracking-tight text-cyan-100/80 mb-1">Ανάλυση γεγονότος</div>
              <div className="text-lg font-semibold text-zinc-50">«{activeEvent}»</div>
              <div className="text-sm text-zinc-400 mt-1">Δες ποιον αγγίζει και τι πιστεύει ήδη ο κόσμος.</div>
            </div>
            {error ? <div className="rounded-xl border border-red-400/20 bg-red-500/10 text-red-200 p-3 text-sm">{error}</div> : null}
            {loading && !result ? <div className="text-sm text-zinc-500 px-1">Φόρτωση…</div> : null}
            {bodySection()}
            {exploreBlock(true)}
          </>
        ) : (
          <>
            {exploreBlock(false)}
            {error ? <div className="rounded-xl border border-red-400/20 bg-red-500/10 text-red-200 p-3 text-sm">{error}</div> : null}
            {loading && !result ? <div className="text-sm text-zinc-500 px-1">Φόρτωση…</div> : null}
            {bodySection()}
            {!result && !loading ? <div className="text-sm text-zinc-500 px-1">Διάλεξε ένα θέμα πιο πάνω για να ξεκινήσεις.</div> : null}
          </>
        )}
      </div>
    </div>
  );
}
