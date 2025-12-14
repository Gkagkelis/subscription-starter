"use client";

import { useState } from "react";

export default function ImpactTestPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [result, setResult] = useState<string>("");

  async function run() {
    setLoading(true);
    setStatus(null);
    setResult("");

    const payload = {
      project: {
        title: "Test",
        type: "event series",
        location: "Athens",
        duration_days: 1,
        audience_target: ["18-34"],
        goals: ["test"],
        activities: ["test"],
      },
      constraints: {
        budget_eur: 1000,
        team_size: 1,
        data_available: ["none"],
      },
    };

    try {
      const res = await fetch("/api/ai/impact-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setStatus(res.status);
      const text = await res.text();
      setResult(text);
    } catch (e: any) {
      setResult(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Axiprova — Impact API Test</h1>

      <button
        onClick={run}
        disabled={loading}
        style={{ marginTop: 12, padding: "10px 14px", border: "1px solid #ccc", borderRadius: 8 }}
      >
        {loading ? "Running..." : "Run test"}
      </button>

      <div style={{ marginTop: 12 }}>
        <strong>Status:</strong> {status ?? "-"}
      </div>

      <pre style={{ marginTop: 12, whiteSpace: "pre-wrap", padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
        {result || "(no output yet)"}
      </pre>
    </div>
  );
}
