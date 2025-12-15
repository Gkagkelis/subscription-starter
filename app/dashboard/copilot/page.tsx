"use client";

import { useMemo, useState } from "react";

type CopilotAction = {
  id: string;
  label: string;
  hint: string;
  payload: Record<string, any>;
};

type CopilotResponse = {
  language: "el" | "en";
  assistant_message: string;
  next_questions: string[];
  actions: CopilotAction[];
  assumptions: string[];
  missing_data: string[];
  risks: string[];
};

export default function DashboardCopilotPage() {
  const [orgId, setOrgId] = useState("");
  const [language, setLanguage] = useState<"auto" | "el" | "en">("auto");
  const [message, setMessage] = useState(
    "Σχεδιάζω μια έκθεση για την αρχαία ελληνική κεραμική."
  );

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [out, setOut] = useState<CopilotResponse | null>(null);

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

  const buttonStyle: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: loading ? "rgba(255,255,255,0.18)" : "#ffffff",
    color: loading ? "#eaeaea" : "#111",
    cursor: loading ? "not-allowed" : "pointer",
    fontWeight: 800,
  };

  const smallButtonStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "#f5f5f5",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
    textAlign: "left",
  };

  const badgeStyle: React.CSSProperties = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    opacity: 0.9,
  };

  const helperText = useMemo(() => {
    return language === "el"
      ? "Γράψε τι σχεδιάζεις — το Axiprova θα σου απαντήσει σαν καθημερινός σύμβουλος και θα σου δώσει κουμπιά/επόμενα βήματα."
      : language === "en"
      ? "Write what you are planning — Axiprova replies like a daily consultant and gives you action buttons / next steps."
      : "Γράψε όπως θες (EL/EN). Θα απαντήσει στη γλώσσα σου.";
  }, [language]);

  async function run(action?: { id: string; payload: Record<string, any> }) {
    setLoading(true);
    setStatus(null);
    setError("");

    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId || "demo-org",
          message,
          meta: { language },
          action: action ? action : { id: "", payload: {} },
        }),
      });

      setStatus(res.status);
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.details || json?.error || "Unknown error");
        return;
      }

      setOut(json);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  function clickAction(a: CopilotAction) {
    run({ id: a.id, payload: a.payload });
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>Axiprova — Daily Co-Pilot</h1>
          <div style={badgeStyle}>
            Status: <b>{status ?? "-"}</b>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>{helperText}</div>

        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 12 }}>
            <label>
              <div style={labelStyle}>org_id (προς το παρόν μπορεί demo)</div>
              <input
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                style={inputStyle}
                placeholder="π.χ. org_123 (ή άστο κενό για demo)"
              />
            </label>

            <label>
              <div style={labelStyle}>Language / Γλώσσα</div>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as any)}
                style={inputStyle}
              >
                <option value="auto">auto (αυτόματο)</option>
                <option value="el">el (Ελληνικά)</option>
                <option value="en">en (English)</option>
              </select>
            </label>
          </div>

          <label style={{ display: "block", marginTop: 12 }}>
            <div style={labelStyle}>Message / Μήνυμα</div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
              placeholder="Γράψε τι σχεδιάζεις…"
            />
          </label>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={() => run()} disabled={loading} style={buttonStyle}>
              {loading ? "Thinking..." : "Ask Axiprova"}
            </button>

            <button
              onClick={() => {
                setOut(null);
                setError("");
                setStatus(null);
              }}
              disabled={loading}
              style={{ ...buttonStyle, background: "rgba(255,255,255,0.06)", color: "#f5f5f5" }}
            >
              Clear
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

        {out && (
          <div style={cardStyle}>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
              Reply ({out.language})
            </div>

            <div style={{ fontSize: 15, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
              {out.assistant_message}
            </div>

            <hr style={{ margin: "14px 0", border: 0, borderTop: "1px solid rgba(255,255,255,0.10)" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                  Suggested actions / Κουμπιά
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {out.actions.map((a) => (
                    <button key={a.id} onClick={() => clickAction(a)} style={smallButtonStyle}>
                      <div style={{ fontWeight: 900 }}>{a.label}</div>
                      <div style={{ opacity: 0.85, fontWeight: 600, marginTop: 4 }}>{a.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                  Next questions / Επόμενες ερωτήσεις
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
                  {out.next_questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            </div>

            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: "pointer", opacity: 0.9 }}>
                Method notes (assumptions / missing data / risks)
              </summary>
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Assumptions</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {out.assumptions.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Missing data</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {out.missing_data.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Risks</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {out.risks.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
