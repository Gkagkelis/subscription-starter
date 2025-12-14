"use client";

import { useMemo, useState } from "react";

export default function DashboardImpactPage() {
  const [title, setTitle] = useState("Museum Nights");
  const [type, setType] = useState("event series");
  const [location, setLocation] = useState("Athens");
  const [days, setDays] = useState(4);

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
        setLoading(false);
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
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Axiprova Consultant Report</h1>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Status: {status ?? "-"}</div>
      </div>

      <div style={{ marginTop: 16, padding: 16, border: "1px solid #eee", borderRadius: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 120px", gap: 12 }}>
          <label>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Project title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", padding: 10 }} />
          </label>

          <label>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Project type</div>
            <input value={type} onChange={(e) => setType(e.target.value)} style={{ width: "100%", padding: 10 }} />
          </label>

          <label>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Location</div>
            <input value={location} onChange={(e) => setLocation(e.target.value)} style={{ width: "100%", padding: 10 }} />
          </label>

          <label>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Days</div>
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{ width: "100%", padding: 10 }}
            />
          </label>
        </div>

        <button
          onClick={run}
          disabled={loading}
          style={{
            marginTop: 12,
            padding: "10px 14px",
            border: "1px solid #ccc",
            borderRadius: 10,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Generating..." : "Generate consultant report"}
        </button>

        {error && (
          <div style={{ marginTop: 12, padding: 12, border: "1px solid #f3caca", borderRadius: 10 }}>
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      {report && (
        <div style={{ marginTop: 16, padding: 16, border: "1px solid #eee", borderRadius: 12 }}>
          <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>Report (Markdown)</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.5 }}>{report}</pre>
        </div>
      )}

      {data && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer" }}>Show structured data (JSON)</summary>
          <pre style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{JSON.stringify(data, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
