"use client";

import { useEffect, useMemo, useState } from "react";
import { themes } from "@/lib/noraya/taxonomy";

// ============================================================
// NORAYA — Σελίδα «Δεδομένα» (v3, με βαθιά Ανάλυση Noraya)
// ============================================================

type Trend = [number, number][];
interface OutRow { key: string; label: string; recent: number; n_recent: number; low_sample: boolean; trend: Trend; }
interface DimBlock { key: string; label: string; groups: OutRow[]; }
interface TrustRow { key: string; label: string; recent: number; low_sample: boolean; }
interface MatchResult {
  ok: boolean; matched: boolean; kind?: "survey" | "noraya_only"; message?: string;
  match?: { topic_key: string | null; topic_label: string | null; method: string };
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
}

function barColor(v: number, max: number): string {
  const r = max > 0 ? v / max : 0;
  return r >= 0.66 ? "#D85A30" : r >= 0.33 ? "#F0997B" : "#F5C4B3";
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
      topic_label: m.match?.topic_label ?? "θέμα",
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
      // σιωπηλά — η σελίδα δείχνει τα νούμερα ούτως ή άλλως
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
  const recentTrend = useMemo(() => (result?.data ? result.data.trend.filter((p) => p[0] >= 2016) : []), [result]);
  const trendMax = useMemo(() => recentTrend.reduce((m, p) => Math.max(m, p[1]), 0), [recentTrend]);
  const visibleThemes = showAllThemes ? themes : themes.slice(0, 10);

  function exploreBlock(compact: boolean) {
    return (
      <div className={"bg-white rounded-xl border border-gray-200 p-4 space-y-3 " + (compact ? "shadow-none" : "shadow-sm")}>
        {compact
          ? <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">ή εξερεύνησε άλλο θέμα</div>
          : <div className="text-sm font-medium text-gray-700">Διάλεξε ένα θέμα</div>}
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setActiveEvent(""); runMatch(query); } }}
            placeholder="Γράψε θέμα ή γεγονός (π.χ. φωτιές, ακρίβεια)…"
            className="flex-1 px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
          />
          <button onClick={() => { setActiveEvent(""); runMatch(query); }} disabled={loading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60">
            {loading ? "…" : "Δες"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleThemes.map((c) => (
            <button key={c} onClick={() => { setQuery(c); setActiveEvent(""); runMatch(c); }}
              className="text-xs px-3 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-purple-400 hover:text-purple-700">
              {c}
            </button>
          ))}
          {!showAllThemes && themes.length > 10 ? (
            <button onClick={() => setShowAllThemes(true)} className="text-xs px-3 py-1 rounded-full text-purple-600 hover:underline">
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-purple-500 mb-3">Ανάλυση Noraya</div>
          <div className="text-sm text-gray-400">Ο Noraya σκέφτεται…</div>
          <div className="mt-3 space-y-2">
            <div className="h-3 bg-gray-100 rounded w-3/4 animate-pulse" />
            <div className="h-3 bg-gray-100 rounded w-full animate-pulse" />
            <div className="h-3 bg-gray-100 rounded w-2/3 animate-pulse" />
          </div>
        </div>
      );
    }
    if (!analysis) return null;
    const cells: Array<[string, string | undefined]> = [
      ["ποιους να κινητοποιήσεις", analysis.who_to_mobilize],
      ["εμπιστοσύνη", analysis.trust_angle],
      ["το άνοιγμα", analysis.opening],
      ["ο κίνδυνος", analysis.risk],
      ["γειτονικά θέματα", analysis.adjacent],
      ["επόμενη κίνηση", analysis.next_move],
    ].filter((c) => c[1] && c[1] !== "—") as Array<[string, string]>;
    return (
      <div className="bg-white rounded-xl shadow-sm border border-purple-200 p-5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-purple-500 mb-2">Ανάλυση Noraya</div>
        {analysis.headline ? <div className="text-base font-semibold text-gray-900 leading-snug">{analysis.headline}</div> : null}
        {analysis.deep_read ? <p className="text-sm text-gray-700 mt-2 leading-relaxed">{analysis.deep_read}</p> : null}
        {cells.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {cells.map(([label, val]) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{label}</div>
                <div className="text-[13px] text-gray-700 leading-relaxed">{val}</div>
              </div>
            ))}
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
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide px-1">Τα δεδομένα από κάτω</div>

        {recentTrend.length > 1 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="text-sm font-medium text-gray-700 mb-1">Πόσο «καίει» το θέμα στον χρόνο</div>
            <div className="text-xs text-gray-400 mb-4">% που το βάζουν στα κορυφαία προβλήματα της χώρας</div>
            <div className="flex items-end gap-1.5 h-28 border-b border-gray-100">
              {recentTrend.map((p) => {
                const h = trendMax > 0 ? Math.round((p[1] / trendMax) * 100) : 0;
                return (
                  <div key={p[0]} className="flex-1 flex flex-col items-center justify-end h-full" title={p[0] + ": " + Math.round(p[1]) + "%"}>
                    <div style={{ height: h + "%", background: barColor(p[1], trendMax) }} className="w-full max-w-[26px] rounded-t" />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1.5 mt-1">
              {recentTrend.map((p) => <div key={p[0]} className="flex-1 text-center text-[10px] text-gray-400">{"'" + String(p[0]).slice(2)}</div>)}
            </div>
          </div>
        ) : null}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="text-sm font-medium text-gray-700 mb-3">Ποιον αφορά — διάλεξε πώς να κόψεις τον κόσμο</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {d.dimensions.map((dim) => (
              <button key={dim.key} onClick={() => setActiveDim(dim.key)}
                className={"text-xs px-3 py-1 rounded-full border " + (dim.key === activeDim ? "bg-purple-50 border-purple-300 text-purple-700" : "border-gray-200 text-gray-500 hover:border-gray-300")}>
                {dim.label}
              </button>
            ))}
          </div>
          <div className="space-y-2.5">
            {dimBlock?.groups.map((g) => {
              const w = dimMax > 0 ? Math.round((g.recent / dimMax) * 100) : 0;
              return (
                <div key={g.key} className="flex items-center gap-3">
                  <div className="w-40 text-[13px] text-gray-700 flex items-center gap-1">
                    {g.label}{g.low_sample ? <span className="text-[10px] text-amber-600" title="λίγα δεδομένα">⚠</span> : null}
                  </div>
                  <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                    <div style={{ width: w + "%", background: barColor(g.recent, dimMax) }} className="h-full rounded" />
                  </div>
                  <div className="w-9 text-right text-[13px] font-medium text-gray-800">{g.recent}%</div>
                </div>
              );
            })}
          </div>
          <div className="text-[11px] text-amber-600 mt-3">⚠ = λίγα δεδομένα σε αυτή την ομάδα, διάβασέ το με επιφύλαξη.</div>
        </div>

        <div className="text-[11px] text-gray-400 px-1">
          Πηγή: έρευνες Ευρωβαρόμετρου, {d.year_range[0]}–{d.year_range[1]}. Τα ποσοστά «ποιον αφορά» είναι μέσος όρος {d.recent_window[0]}–{d.recent_window[1]}.
        </div>
      </div>
    );
  }

  function topicHeader() {
    if (!result?.match?.topic_label) return null;
    const gray = result.kind === "noraya_only";
    return (
      <span className={"text-xs px-2 py-0.5 rounded-full " + (gray ? "bg-gray-100 text-gray-600" : "bg-orange-100 text-orange-800")}>
        θέμα: {result.match.topic_label}
      </span>
    );
  }

  function body() {
    if (!result) return null;
    if (!result.matched) {
      return <div className="bg-white rounded-xl border border-gray-200 p-5 text-sm text-gray-600">Δεν ταίριαξε κάποιο θέμα. Δοκίμασε ένα κουμπί ή άλλη λέξη.</div>;
    }
    return (
      <div className="space-y-5">
        <div className="px-1">{topicHeader()}</div>
        {analysisCard()}
        {result.kind === "noraya_only" ? (
          <div className="text-[11px] text-gray-400 px-1">
            Δεν υπάρχει σκληρή έρευνα Ευρωβαρόμετρου γι' αυτό το θέμα — η παραπάνω είναι ανάγνωση του Noraya.
          </div>
        ) : (
          numbersSections()
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Δεδομένα</h1>
          <p className="text-gray-500 mt-1 text-sm">Ποιον αφορά ένα θέμα και τι πιστεύει — από έρευνες Ευρωβαρόμετρου.</p>
        </div>

        {activeEvent ? (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="text-xs text-gray-400 mb-1">Ανάλυση γεγονότος</div>
              <div className="text-lg font-semibold text-gray-900">«{activeEvent}»</div>
              <div className="text-sm text-gray-500 mt-1">Δες ποιον αγγίζει και τι πιστεύει ήδη ο κόσμος.</div>
            </div>
            {error ? <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div> : null}
            {loading && !result ? <div className="text-sm text-gray-400 px-1">Φόρτωση…</div> : null}
            {body()}
            {exploreBlock(true)}
          </>
        ) : (
          <>
            {exploreBlock(false)}
            {error ? <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div> : null}
            {loading && !result ? <div className="text-sm text-gray-400 px-1">Φόρτωση…</div> : null}
            {body()}
            {!result && !loading ? <div className="text-sm text-gray-400 px-1">Διάλεξε ένα θέμα πιο πάνω για να ξεκινήσεις.</div> : null}
          </>
        )}
      </div>
    </div>
  );
}
