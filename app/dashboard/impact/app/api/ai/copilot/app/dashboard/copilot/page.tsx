"use client";

import { useMemo, useState } from "react";

type Mode = "plan" | "insights" | "content" | "funding";
type Lang = "auto" | "el" | "en";

type CopilotResponse = {
  assistant_message: string;
  followup_questions: string[];
  suggested_actions: { label: string; payload: string; kind: "ask" | "draft" | "analyze" | "plan" }[];
  evidence_used: string[];
  meta: { language: "el" | "en"; mode: Mode };
};

type Msg = { role: "user" | "assistant"; text: string };

export default function CopilotPage() {
  const [orgId, setOrgId] = useState(""); // βάλε εδώ το org_id από Supabase
  const [mode, setMode] = useState<Mode>("plan");
  const [lang, setLang] = useState<Lang>("auto");

  const [input, setInput] = useState("Σχεδιάζω μια έκθεση για την αρχαία ελληνική κεραμική.");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);

  const [last, setLast] = useState<CopilotResponse | null>(null);
  const [error, setError] = useState("");

  const canRun = useMemo(() => input.trim().length > 0, [input]);

  const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "#0b0b0f", color: "#f5f5f5" };
  const wrap: React.CSSProperties = { maxWidth: 1100, margin: "0 auto" };
  const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 16 };
  const inputStyle: React.CSSProperties = { width: "100%", padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)", background: "#0f1117", color: "#f5f5f5" };
  const btn: React.CSSProperties = { padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "#fff", color: "#111", fontWeight: 800, cursor: "pointer" };
  const btn2: React.CSSProperties = { padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "#f5f5f5", fontWeight: 700, cursor: "pointer" };

  const bubble = (role: "user" | "assistant"): React.CSSProperties => ({
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: role === "user" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
  });

  async function send(text: string) {
    setError("");
    setLoading(true);
    setLast(null);

    setMessages((m) => [...m, { role: "user", text }]);

    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId || undefined, mode, language: lang, message: text }),
      });

      const out = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        setError(out?.details || out?.error || `HTTP ${res.status}`);
        return;
      }

      setLast(out as CopilotResponse);
      setMessages((m) => [...m, { role: "assistant", text: out.assistant_message }]);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  function onRun() {
    if (!canRun || loading) return;
    const text = input.trim();
    setInput("");
    void send(text);
  }

  return (
    <div style={page}>
      <div style={wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Axiprova Copilot</h1>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Mode: <b>{mode}</b>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
          Γράψε τι σχεδιάζεις. Το Copilot θα απαντήσει σαν σύμβουλος και θα σου δώσει κουμπιά για επόμενες κινήσεις.
        </div>

        <div style={{ marginTop: 14, ...card }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 12 }}>
            <label>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>org_id (από Supabase org_profiles)</div>
              <input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="π.χ. 3d6f..." style={inputStyle} />
            </label>

            <label>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Mode</div>
              <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} style={inputStyle}>
                <option value="plan">Plan (ιδέες/σχεδιασμός)</option>
                <option value="insights">Insights (μοτίβα/alerts)</option>
                <option value="content">Content (συν-γραφή)</option>
                <option value="funding">Funding (grant-ready)</option>
              </select>
            </label>

            <label>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Language</div>
              <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} style={inputStyle}>
                <option value="auto">Auto</option>
                <option value="el">Ελληνικά</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="π.χ. Σχεδιάζω μια έκθεση για..."
              style={{ ...inputStyle, minHeight: 92, resize: "vertical" }}
            />
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={onRun} style={{ ...btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
              {loading ? "Σκέφτομαι..." : "Send"}
            </button>
            <button onClick={() => { setMessages([]); setLast(null); setError(""); }} style={btn2}>
              Clear
            </button>
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(255, 120, 120, 0.35)", background: "rgba(255, 120, 120, 0.10)" }}>
              <b>Error:</b> {error}
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, ...card }}>
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 10 }}>Conversation</div>
          <div style={{ display: "grid", gap: 10 }}>
            {messages.length === 0 && <div style={{ opacity: 0.7, fontSize: 13 }}>Δεν υπάρχει ακόμα μήνυμα. Στείλε ένα prompt.</div>}
            {messages.map((m, i) => (
              <div key={i} style={bubble(m.role)}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{m.role === "user" ? "You" : "Axiprova"}</div>
                {m.text}
              </div>
            ))}
          </div>
        </div>

        {last && (
          <div style={{ marginTop: 14, ...card }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
              <div style={{ fontSize: 13, fontWeight: 900 }}>Next actions</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Lang: <b>{last.meta.language}</b> • Mode: <b>{last.meta.mode}</b>
              </div>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {(last.suggested_actions || []).map((a, idx) => (
                <button key={idx} onClick={() => send(a.payload)} style={btn2}>
                  {a.label}
                </button>
              ))}
            </div>

            {(last.followup_questions || []).length > 0 && (
              <>
                <div style={{ marginTop: 14, fontSize: 13, fontWeight: 900 }}>Questions to clarify</div>
                <ul style={{ marginTop: 8, opacity: 0.9 }}>
                  {last.followup_questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </>
            )}

            <details style={{ marginTop: 12, opacity: 0.9 }}>
              <summary style={{ cursor: "pointer" }}>Evidence used</summary>
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
                {(last.evidence_used || []).length ? last.evidence_used.map((x, i) => <div key={i}>- {x}</div>) : <div>- (none)</div>}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
