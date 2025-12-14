"use client";

import { useMemo, useState } from "react";

export default function DashboardImpactPage() {
  const [title, setTitle] = useState("Museum Nights");
  const [type, setType] = useState("event series");
  const [location, setLocation] = useState("Athens");
  const [days, setDays] = useState<number>(4);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const [report, setReport] = useState<string>("");
  const [data, setData] = useState<any>(null);

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
    }),
    [title, type, location, days]
  );

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    padding: 24,
    background: "#0b0b0f",
    color: "#f5f5f5",
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: 980,
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

  // IMPORTANT: Always readable inputs (white bg + black text)
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 10,
    background: "#ffffff",
    color: "#111111",
    border: "1px solid #b5b5b5",
    borderRadius: 10,
    outline: "none",
  };

  const buttonStyle: React.CSSProperties = {
    marginTop: 12,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: loading ? "rgba(255,255,255,0.18)" : "#ffffff",
    color: loading ? "#eaeaea" : "#111",
    cursor: loading ? "not-allowed" : "pointer",
    fontWeight: 700,
  };

  const badgeStyle: React.CSSProperties = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    opacity: 0.9,
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

  async function run() {
    setLoading(true);
    setStatus(null);
    setError("");
    setReport("");
    setData(null);

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
      setData(out?.data || null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>
            Axiprova Consultant Report
          </h1>

          <div style={badgeStyle}>
            Status: <b>{status ?? "-"}</b>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
          Συμπλήρωσε τα βασικά και πάτα <b>Generate</b>. Θα πάρεις πίσω report (markdown) + structured data.
        </div>

        <div style={cardStyle}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 140px",
              gap: 12,
            }}
          >
            <label>
              <div style={labelStyle}>Project title</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={inputStyle}
                placeholder="e.g. Museum Nights"
              />
            </label>

            <label>
              <div style={labelStyle}>Project type</div>
              <input
                value={type}
                onChange={(e) => setType(e.target.value)}
                style={inputStyle}
                placeholder="e.g. event series"
              />
            </label>

            <label>
              <div style={labelStyle}>Location</div>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={inputStyle}
                placeholder="e.g. Athens"
              />
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

          <button onClick={run} disabled={loading} style={buttonStyle}>
            {loading ? "Generating..." : "Generate consultant report"}
          </button>

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

        {report && (
          <div style={cardStyle}>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
              Report (Markdown)
            </div>
            <pre style={reportBoxStyle}>{report}</pre>
          </div>
        )}

        {data && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", opacity: 0.9 }}>
              Show structured data (JSON)
            </summary>
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
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
