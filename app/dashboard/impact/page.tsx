"use client";

import { useMemo, useState } from "react";

type Confidence = "grey" | "amber" | "green";

function confidenceBadge(conf: Confidence) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid rgba(255,255,255,0.16)",
  };

  if (conf === "green")
    return { ...base, background: "rgba(36, 212, 128, 0.12)", color: "#bff5d9" };
  if (conf === "amber")
    return { ...base, background: "rgba(255, 193, 7, 0.14)", color: "#ffe7a3" };
  return { ...base, background: "rgba(180, 180, 180, 0.10)", color: "#e6e6e6" };
}

export default function DashboardImpactPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Project
  const [title, setTitle] = useState("Museum Nights");
  const [type, setType] = useState("event series");
  const [location, setLocation] = useState("Athens");
  const [days, setDays] = useState<number>(4);

  // Evidence
  const [publicSourcesText, setPublicSourcesText] = useState(
    "https://example.org/programme\nhttps://example.org/pricing"
  );
  const [internalSourcesText, setInternalSourcesText] = useState(
    "Ticketing export (CSV)\nExit survey draft (Google Form)\nInstagram analytics screenshot"
  );
  const [evidenceNotes, setEvidenceNotes] = useState(
    "EL: Μπορούμε να τρέξουμε exit survey για 2 μέρες. Έχουμε ticketing data και βασικά social analytics. | EN: We can run an exit survey for 2 days. We have ticketing data and basic social analytics."
  );

  // API state
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [error, setError] = useState<string>("");

  // New API fields
  const [report, setReport] = useState<string>("");
  const [framework, setFramework] = useState<any>(null);
  const [assessment, setAssessment] = useState<any>(null);

  // Styles
  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    padding: 24,
    background: "#0b0b0f",
    color: "#f5f5f5",
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: 1100,
    margin: "0 auto",
  };

  const headerRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  };

  const cardStyle: React.CSSProperties = {
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(6px)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.85,
    marginBottom: 6,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 10,
    background: "#ffffff",
    color: "#111111",
    border: "1px solid #b5b5b5",
    borderRadius: 10,
    outline: "none",
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: 84,
    resize: "vertical",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 12,
    lineHeight: 1.5,
  };

  const buttonStyle: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "#ffffff",
    color: "#111",
    cursor: "pointer",
    fontWeight: 800,
  };

  const secondaryButton: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)",
    color: "#f5f5f5",
    cursor: "pointer",
    fontWeight: 700,
  };

  const badgeStyle: React.CSSProperties = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    opacity: 0.92,
  };

  const reportBoxStyle: React.CSSProperties = {
    whiteSpace: "pre-wrap",
    margin: 0,
    lineHeight: 1.55,
    background: "#0f1117",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 12,
    padding: 14,
    fontSize: 13,
    color: "#f5f5f5",
  };

  const divider: React.CSSProperties = {
    height: 1,
    background: "rgba(255,255,255,0.10)",
    margin: "14px 0",
  };

  const public_sources = useMemo(
    () => publicSourcesText.split("\n").map((s) => s.trim()).filter(Boolean),
    [publicSourcesText]
  );

  const internal_sources = useMemo(
    () => internalSourcesText.split("\n").map((s) => s.trim()).filter(Boolean),
    [internalSourcesText]
  );

  const payload = useMemo(
    () => ({
      project: {
        title,
        type,
        location,
        duration_days: Number(days) || 1,
        audience_target: ["18-34"],
        goals: [
          "EL: Πιο ουσιαστική εμπειρία | EN: Deeper experience",
          "EL: Επαναλαμβανόμενες επισκέψεις | EN: Repeat visits",
          "EL: Word-of-mouth | EN: Word-of-mouth",
        ],
        activities: [
          "EL: Ξενάγηση | EN: Guided tour",
          "EL: Μικρή performance | EN: Micro-performance",
          "EL: Συζήτηση Q&A | EN: Q&A",
        ],
      },
      constraints: {
        budget_eur: 12000,
        team_size: 3,
        data_available: ["ticketing", "instagram", "exit survey"],
      },
      evidence: {
        public_sources,
        internal_sources,
        notes: evidenceNotes,
      },
    }),
    [title, type, location, days, public_sources, internal_sources, evidenceNotes]
  );

  async function run() {
    setLoading(true);
    setStatus(null);
    setError("");
    setReport("");
    setFramework(null);
    setAssessment(null);

    try {
      const res = await fetch("/api/ai/impact-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setStatus(res.status);

      const out = await res.json().catch(() => null);

      if (!res.ok) {
        setError(out?.details || out?.error || "Unknown error");
        return;
      }

      setReport(out?.report_markdown || "");
      setFramework(out?.framework || null);
      setAssessment(out?.data || null);
      setStep(3);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  function StepHeader() {
    const chip = (n: 1 | 2 | 3, label: string) => {
      const active = step === n;
      return (
        <div
          onClick={() => setStep(n)}
          style={{
            cursor: "pointer",
            padding: "8px 12px",
            borderRadius: 999,
            border: active ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(255,255,255,0.12)",
            background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
            fontSize: 13,
            fontWeight: active ? 800 : 600,
            opacity: active ? 1 : 0.85,
          }}
        >
          {n}. {label}
        </div>
      );
    };

    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        {chip(1, "Έργο / Project")}
        {chip(2, "Τεκμήρια / Evidence")}
        {chip(3, "Αποτελέσματα / Results")}
      </div>
    );
  }

  const indicatorMap = useMemo(() => {
    const m = new Map<string, any>();
    if (!framework?.pillars) return m;
    for (const p of framework.pillars) for (const ind of p.indicators || []) m.set(ind.id, ind);
    return m;
  }, [framework]);

  const assessmentsByPillar = useMemo(() => {
    const by: Record<string, any[]> = {};
    if (!framework?.pillars || !assessment?.indicator_assessments) return by;
    for (const p of framework.pillars) by[p.id] = [];
    for (const ia of assessment.indicator_assessments) {
      const ind = indicatorMap.get(ia.indicator_id);
      const pillarId = ind?.pillar_id || "OTHER";
      if (!by[pillarId]) by[pillarId] = [];
      by[pillarId].push({ ia, ind });
    }
    return by;
  }, [framework, assessment, indicatorMap]);

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>
            Axiprova — Impact Framework (EL/EN)
          </h1>
          <div style={badgeStyle}>
            Status: <b>{status ?? "-"}</b>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
          EL: Μετατρέπουμε την αξία του project σε δείκτες (pillars → indicators → evidence). | EN: We convert project
          value into indicators (pillars → indicators → evidence).
        </div>

        <StepHeader />

        {step === 1 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
              Step 1 — Έργο / Project
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              EL: Βασικές πληροφορίες έργου. | EN: Basic project information.
            </div>

            <div style={divider} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 140px", gap: 12 }}>
              <label>
                <div style={labelStyle}>Τίτλος / Title</div>
                <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
              </label>

              <label>
                <div style={labelStyle}>Τύπος / Type</div>
                <input value={type} onChange={(e) => setType(e.target.value)} style={inputStyle} />
              </label>

              <label>
                <div style={labelStyle}>Τοποθεσία / Location</div>
                <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
              </label>

              <label>
                <div style={labelStyle}>Ημέρες / Days</div>
                <input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} style={inputStyle} min={1} />
              </label>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button style={buttonStyle} onClick={() => setStep(2)}>
                Συνέχεια → Τεκμήρια / Continue → Evidence
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
              Step 2 — Τεκμήρια / Evidence
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              EL: Πρόσθεσε URLs και εσωτερικά τεκμήρια. Αυτό επηρεάζει confidence + missing data. | EN: Add URLs and internal evidence.
            </div>

            <div style={divider} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label>
                <div style={labelStyle}>Δημόσιες πηγές (URL ανά γραμμή) / Public sources (1 URL per line)</div>
                <textarea value={publicSourcesText} onChange={(e) => setPublicSourcesText(e.target.value)} style={textareaStyle} />
              </label>

              <label>
                <div style={labelStyle}>Εσωτερικά τεκμήρια (1 item ανά γραμμή) / Internal evidence (1 item per line)</div>
                <textarea value={internalSourcesText} onChange={(e) => setInternalSourcesText(e.target.value)} style={textareaStyle} />
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={labelStyle}>Σημειώσεις / Notes</div>
              <textarea value={evidenceNotes} onChange={(e) => setEvidenceNotes(e.target.value)} style={textareaStyle} />
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={secondaryButton} onClick={() => setStep(1)}>
                ← Πίσω / Back
              </button>

              <button
                onClick={run}
                disabled={loading}
                style={{ ...buttonStyle, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "Παράγεται... / Generating..." : "Generate framework report (EL/EN)"}
              </button>
            </div>

            {error && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(255, 120, 120, 0.35)", background: "rgba(255, 120, 120, 0.10)" }}>
                <b>Error:</b> {error}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
              Step 3 — Αποτελέσματα / Results
            </div>

            <div style={divider} />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={secondaryButton} onClick={() => setStep(2)}>
                ← Πίσω στα Τεκμήρια / Back to Evidence
              </button>
              <button style={buttonStyle} onClick={run} disabled={loading}>
                {loading ? "Παράγεται... / Generating..." : "Re-run"}
              </button>
            </div>

            {error && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(255, 120, 120, 0.35)", background: "rgba(255, 120, 120, 0.10)" }}>
                <b>Error:</b> {error}
              </div>
            )}

            {framework && (
              <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Framework / Πλαίσιο</div>
                <div style={{ fontSize: 14, fontWeight: 900 }}>
                  {framework.name} — v{framework.version}
                </div>
              </div>
            )}

            {report && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>Consultant report (Markdown) / Αναφορά</div>
                <pre style={reportBoxStyle}>{report}</pre>
              </div>
            )}

            {framework?.pillars && assessment?.indicator_assessments && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>
                  Indicator checklist / Checklist δεικτών
                </div>

                {(framework.pillars || []).map((p: any) => {
                  const items = assessmentsByPillar[p.id] || [];
                  return (
                    <div key={p.id} style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)" }}>
                      <div style={{ fontSize: 14, fontWeight: 900 }}>
                        {p.name} <span style={{ opacity: 0.7, fontWeight: 700 }}>({p.weight_points} pts)</span>
                      </div>

                      <div style={divider} />

                      {items.map(({ ia, ind }: any) => (
                        <div key={ia.indicator_id} style={{ padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 900 }}>
                                {ia.indicator_id} — {ind?.name || "Indicator"}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                                {ind?.definition || ""}
                              </div>
                            </div>
                            <div style={confidenceBadge(ia.confidence as Confidence)}>
                              Confidence / Βεβαιότητα: <b>{ia.confidence}</b>
                            </div>
                          </div>

                          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
                                Missing data / Τι λείπει
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
                                {(ia.missing_data || []).map((x: string, i: number) => (
                                  <div key={i}>- {x}</div>
                                ))}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
                                Next actions / Επόμενα βήματα
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
                                {(ia.recommended_next_actions || []).map((x: string, i: number) => (
                                  <div key={i}>- {x}</div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {ia.notes && (
                            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
                              <b>Notes / Σημειώσεις:</b> {ia.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
