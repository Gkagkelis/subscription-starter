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
  // Step wizard
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Project fields
  const [title, setTitle] = useState("Museum Nights");
  const [type, setType] = useState("event series");
  const [location, setLocation] = useState("Athens");
  const [days, setDays] = useState<number>(4);

  // Evidence fields (NEW)
  const [publicSourcesText, setPublicSourcesText] = useState(
    "https://example.org/programme\nhttps://example.org/pricing"
  );
  const [internalSourcesText, setInternalSourcesText] = useState(
    "Ticketing export (CSV)\nExit survey draft (Google Form)\nInstagram analytics screenshot"
  );
  const [evidenceNotes, setEvidenceNotes] = useState(
    "We can run an exit survey for 2 days. We have ticketing data and basic social analytics."
  );

  // API state
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [error, setError] = useState<string>("");

  // Response fields (NEW API)
  const [report, setReport] = useState<string>("");
  const [framework, setFramework] = useState<any>(null);
  const [assessment, setAssessment] = useState<any>(null);

  // UI styles
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

  // Always readable inputs
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

  // Build evidence arrays from textareas
  const public_sources = useMemo(
    () =>
      publicSourcesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [publicSourcesText]
  );

  const internal_sources = useMemo(
    () =>
      internalSourcesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [internalSourcesText]
  );

  // Payload to API (NEW evidence fields included)
  const payload = useMemo(
    () => ({
      project: {
        title,
        type,
        location,
        duration_days: Number(days) || 1,
        audience_target: ["18-34"],
        goals: ["deeper experience", "repeat visits", "word-of-mouth"],
        activities: ["guided tour", "micro-performance", "Q&A"],
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

      // NEW API fields:
      setReport(out?.report_markdown || "");
      setFramework(out?.framework || null);
      setAssessment(out?.data || null);

      // jump to results step
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
        {chip(1, "Project")}
        {chip(2, "Evidence")}
        {chip(3, "Results")}
      </div>
    );
  }

  const indicatorMap = useMemo(() => {
    const m = new Map<string, any>();
    if (!framework?.pillars) return m;
    for (const p of framework.pillars) {
      for (const ind of p.indicators || []) {
        m.set(ind.id, ind);
      }
    }
    return m;
  }, [framework]);

  const assessmentsByPillar = useMemo(() => {
    const by: Record<string, any[]> = {};
    if (!framework?.pillars || !assessment?.indicator_assessments) return by;

    // init pillars
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
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>Axiprova — Impact Framework</h1>
          <div style={badgeStyle}>
            Status: <b>{status ?? "-"}</b>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
          Στόχος: να μετατρέψουμε την <b>αξία</b> του project σε <b>δείκτες</b> με τεκμήρια (evidence), ώστε να βγει ένα
          επαγγελματικό report και ένα “to-do list” για pilot / measurement.
        </div>

        <StepHeader />

        {/* STEP 1: Project */}
        {step === 1 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Step 1 — Project</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Γράψε τα βασικά. Το Axiprova θα το χαρτογραφήσει πάνω στο framework (pillars → indicators).
            </div>

            <div style={divider} />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 140px",
                gap: 12,
              }}
            >
              <label>
                <div style={labelStyle}>Project title</div>
                <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
              </label>

              <label>
                <div style={labelStyle}>Project type</div>
                <input value={type} onChange={(e) => setType(e.target.value)} style={inputStyle} />
              </label>

              <label>
                <div style={labelStyle}>Location</div>
                <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
              </label>

              <label>
                <div style={labelStyle}>Days</div>
                <input
                  type="number"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  style={inputStyle}
                  min={1}
                />
              </label>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button style={buttonStyle} onClick={() => setStep(2)}>
                Continue → Evidence
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Evidence */}
        {step === 2 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Step 2 — Evidence</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Εδώ δηλώνεις <b>τι τεκμήρια έχεις</b>. Αυτό ανεβάζει confidence (grey → amber → green) και μειώνει missing
              data.
            </div>

            <div style={divider} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label>
                <div style={labelStyle}>Public sources (one URL per line)</div>
                <textarea
                  value={publicSourcesText}
                  onChange={(e) => setPublicSourcesText(e.target.value)}
                  style={textareaStyle}
                />
              </label>

              <label>
                <div style={labelStyle}>Internal evidence (one item per line)</div>
                <textarea
                  value={internalSourcesText}
                  onChange={(e) => setInternalSourcesText(e.target.value)}
                  style={textareaStyle}
                />
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={labelStyle}>Evidence notes</div>
              <textarea value={evidenceNotes} onChange={(e) => setEvidenceNotes(e.target.value)} style={textareaStyle} />
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={secondaryButton} onClick={() => setStep(1)}>
                ← Back
              </button>

              <button
                onClick={run}
                disabled={loading}
                style={{
                  ...buttonStyle,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Generating..." : "Generate framework report"}
              </button>
            </div>

            {error && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255, 120, 120, 0.35)",
                  background: "rgba(255, 120, 120, 0.10)",
                }}
              >
                <b>Error:</b> {error}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Results */}
        {step === 3 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Step 3 — Results</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Αυτό είναι το αποτέλεσμα του framework: breakdown ανά indicator + missing data + επόμενες ενέργειες.
            </div>

            <div style={divider} />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={secondaryButton} onClick={() => setStep(2)}>
                ← Back to Evidence
              </button>
              <button style={buttonStyle} onClick={run} disabled={loading}>
                {loading ? "Generating..." : "Re-run"}
              </button>
            </div>

            {error && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255, 120, 120, 0.35)",
                  background: "rgba(255, 120, 120, 0.10)",
                }}
              >
                <b>Error:</b> {error}
              </div>
            )}

            {framework && (
              <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Framework used</div>
                <div style={{ fontSize: 14, fontWeight: 900 }}>
                  {framework.name} — v{framework.version}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                  Pillars: {(framework.pillars || []).map((p: any) => p.name).join(" · ")}
                </div>
              </div>
            )}

            {report && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>Consultant report (Markdown)</div>
                <pre style={reportBoxStyle}>{report}</pre>
              </div>
            )}

            {/* Indicator Checklist */}
            {framework?.pillars && assessment?.indicator_assessments && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>Indicator checklist</div>

                {(framework.pillars || []).map((p: any) => {
                  const items = assessmentsByPillar[p.id] || [];
                  return (
                    <div key={p.id} style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)" }}>
                      <div style={{ fontSize: 14, fontWeight: 900 }}>
                        {p.name} <span style={{ opacity: 0.7, fontWeight: 700 }}>({p.weight_points} pts)</span>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{p.description}</div>

                      <div style={divider} />

                      {!items.length && <div style={{ fontSize: 12, opacity: 0.8 }}>No indicators returned for this pillar.</div>}

                      {items.map(({ ia, ind }: any) => (
                        <div
                          key={ia.indicator_id}
                          style={{
                            padding: 12,
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background: "rgba(255,255,255,0.03)",
                            marginBottom: 10,
                          }}
                        >
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
                              Confidence: <b>{ia.confidence}</b>
                            </div>
                          </div>

                          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Missing data</div>
                              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
                                {(ia.missing_data || []).length
                                  ? (ia.missing_data || []).map((x: string, i: number) => (
                                      <div key={i}>- {x}</div>
                                    ))
                                  : "- (none)"}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Next actions</div>
                              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
                                {(ia.recommended_next_actions || []).length
                                  ? (ia.recommended_next_actions || []).map((x: string, i: number) => (
                                      <div key={i}>- {x}</div>
                                    ))
                                  : "- (none)"}
                              </div>
                            </div>
                          </div>

                          {ia.notes && (
                            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
                              <b>Notes:</b> {ia.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}

                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer", opacity: 0.9 }}>Show raw JSON (assessment)</summary>
                  <pre
                    style={{
                      marginTop: 10,
                      whiteSpace: "pre-wrap",
                      borderRadius: 12,
                      padding: 14,
                      background: "#0f1117",
                      border: "1px solid rgba(255,255,255,0.10)",
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    {JSON.stringify(assessment, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        )}

        {/* default first-load: show step 1 if nothing else */}
        {step !== 1 && step !== 2 && step !== 3 && (
          <div style={cardStyle}>Invalid step.</div>
        )}
      </div>
    </div>
  );
}
