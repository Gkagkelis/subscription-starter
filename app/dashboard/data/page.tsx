"use client";

import { useEffect, useMemo, useState } from "react";
import { themes } from "@/lib/noraya/taxonomy";

// ============================================================
// NORAYA — Σελίδα «Δεδομένα» (v2, γεγονός-κεντρική)
//
// Δύο πόρτες:
//  - Με γεγονός (?theme=&event=): το γεγονός είναι ο ήρωας, η εξερεύνηση από κάτω.
//  - Σκέτος: εξερεύνηση πάνω (chips από τα 30 θέματα + αναζήτηση).
//
// kind:"survey" -> νούμερα έρευνας. kind:"noraya_only" -> ανάγνωση Noraya
// (placeholder τώρα· AI στο επόμενο βήμα).
// ============================================================

type Trend = [number, number][];
interface OutRow { key: string; label: string; recent: number; n_recent: number; low_sample: boolean; trend: Trend; }
interface DimBlock { key: string; label: string; groups: OutRow[]; }
interface TrustRow { key: string; label: string; recent: number; low_sample: boolean; }
interface MatchResult {
  ok: boolean;
  matched: boolean;
  kind?: "survey" | "noraya_only";
  message?: string;
  match?: { topic_key: string | null; topic_label: string | null; method: string };
  data?: {
    recent_window: [number, number];
    year_range: [number, number];
    overall_salience_recent: number | null;
    trend: Trend;
    dimensions: DimBlock[];
    trust_government_by_occupation: TrustRow[];
    noraya_note: string;
  };
}

function barColor(v: number, max: number): string {
  const r = max > 0 ? v / max : 0;
  if (r >= 0.66) return "#D85A30";
  if (r >= 0.33) return "#F0997B";
  return "#F5C4B3";
}

export default function DataPage() {
  const [query, setQuery] = useState("");
  const [activeEvent, setActiveEvent] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeDim, setActiveDim] = useState("occupation_group");
  const [showAllThemes, setShowAllThemes] = useState(false);

  async function runMatch(theme: string, eventTitle = "") {
    if (!theme.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/data/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme, event_title: eventTitle }),
      });
      const data: MatchResult = await res.json();
      setResult(data);
      if (data.kind === "survey" && data.data && data.data.dimensions.length) {
        const hasOcc = data.data.dimensions.some((d) => d.key === "occupation_group");
        setActiveDim(hasOcc ? "occupation_group" : data.data.dimensions[0].key);
      }
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
    if (theme) {
      setQuery(theme);
      setActiveEvent(ev);
      runMatch(theme, ev);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dimBlock = useMemo(
    () => result?.data?.dimensions.find((d) => d.key === activeDim),
    [result, activeDim]
  );
  const dimMax = useMemo(
    () => (dimBlock ? dimBlock.groups.reduce((m, g) => Math.max(m, g.recent), 0) : 0),
    [dimBlock]
  );
  const recentTrend = useMemo(
    () => (result?.data ? result.data.trend.filter((p) => p[0] >= 2016) : []),
    [result]
  );
  const trendMax = useMemo(
    () => recentTrend.reduce((m, p) => Math.max(m, p[1]), 0),
    [recentTrend]
  );

  const visibleThemes = showAllThemes ? themes : themes.slice(0, 10);

  function exploreBlock(compact: boolean) {
    return (
      <div className={"bg-white rounded-xl border border-gray-200 p-4 space-y-3 " + (compact ? "shadow-none" : "shadow-sm")}>
        {compact ? (
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">ή εξερεύνησε άλλο θέμα</div>
        ) : (
          <div className="text-sm font-medium text-gray-700">Διάλεξε ένα θέμα</div>
        )}
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setActiveEvent(""); runMatch(query); } }}
            placeholder="Γράψε θέμα ή γεγονός (π.χ. φωτιές, ακρίβεια)…"
            className="flex-1 px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
          />
          <button
            onClick={() => { setActiveEvent(""); runMatch(query); }}
            disabled={loading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60"
          >
            {loading ? "…" : "Δες"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleThemes.map((c) => (
            <button
              key={c}
              onClick={() => { setQuery(c); setActiveEvent(""); runMatch(c); }}
              className="text-xs px-3 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-purple-400 hover:text-purple-700"
            >
              {c}
            </button>
          ))}
          {!showAllThemes && themes.length > 10 ? (
            <button
              onClick={() => setShowAllThemes(true)}
              className="text-xs px-3 py-1 rounded-full text-purple-600 hover:underline"
            >
              +{themes.length - 10} ακόμη
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function dataSections() {
    if (!result) return null;

    if (result.matched && result.kind === "noraya_only") {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            θέμα: {result.match?.topic_label}
          </span>
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600 leading-relaxed">
            Για αυτό το θέμα δεν υπάρχει σκληρή έρευνα Ευρωβαρόμετρου.{" "}
            <span className="text-gray-400">Εδώ έρχεται η έξυπνη ανάγνωση Noraya (επόμενο βήμα).</span>
          </div>
        </div>
      );
    }

    if (result.matched && result.kind === "survey" && result.data) {
      const d = result.data;
      return (
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
              θέμα: {result.match?.topic_label}
            </span>
            <div className="mt-3 bg-purple-50 border border-purple-100 rounded-lg p-3 text-sm text-purple-900 leading-relaxed">
              {d.noraya_note}
            </div>
          </div>

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
                {recentTrend.map((p) => (
                  <div key={p[0]} className="flex-1 text-center text-[10px] text-gray-400">{"'" + String(p[0]).slice(2)}</div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="text-sm font-medium text-gray-700 mb-3">Ποιον αφορά — διάλεξε πώς να κόψεις τον κόσμο</div>
            <div className="flex flex-wrap gap-2 mb-4">
              {d.dimensions.map((dim) => (
                <button
                  key={dim.key}
                  onClick={() => setActiveDim(dim.key)}
                  className={"text-xs px-3 py-1 rounded-full border " + (dim.key === activeDim ? "bg-purple-50 border-purple-300 text-purple-700" : "border-gray-200 text-gray-500 hover:border-gray-300")}
                >
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
                      {g.label}
                      {g.low_sample ? <span className="text-[10px] text-amber-600" title="λίγα δεδομένα">⚠</span> : null}
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

          {d.trust_government_by_occupation.length ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="text-sm font-medium text-gray-700 mb-3">Εμπιστοσύνη στην κυβέρνηση, ανά επάγγελμα</div>
              <div className="flex flex-wrap gap-2">
                {d.trust_government_by_occupation.map((t) => (
                  <div key={t.key} className="bg-gray-50 rounded-lg px-3 py-2 text-center min-w-[96px]">
                    <div className="text-[11px] text-gray-500">{t.label}</div>
                    <div className="text-lg font-semibold text-gray-800">{t.recent}%</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="text-[11px] text-gray-400 px-1">
            Πηγή: έρευνες Ευρωβαρόμετρου, {d.year_range[0]}–{d.year_range[1]}. Τα ποσοστά «ποιον αφορά» είναι μέσος όρος {d.recent_window[0]}–{d.recent_window[1]}.
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 text-sm text-gray-600">
        Δεν ταίριαξε κάποιο θέμα. Δοκίμασε ένα κουμπί ή άλλη λέξη.
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
            {dataSections()}
            {exploreBlock(true)}
          </>
        ) : (
          <>
            {exploreBlock(false)}
            {error ? <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div> : null}
            {loading && !result ? <div className="text-sm text-gray-400 px-1">Φόρτωση…</div> : null}
            {dataSections()}
            {!result && !loading ? <div className="text-sm text-gray-400 px-1">Διάλεξε ένα θέμα πιο πάνω για να ξεκινήσεις.</div> : null}
          </>
        )}
      </div>
    </div>
  );
}
