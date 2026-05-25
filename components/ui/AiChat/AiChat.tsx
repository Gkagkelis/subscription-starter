"use client";

import { useState } from "react";

type Mode = "analysis" | "scenario" | "stance";

const MODES: { id: Mode; label: string; icon: string; placeholder: string }[] = [
  {
    id: "analysis",
    label: "Ανάλυση",
    icon: "🔍",
    placeholder: "π.χ. Τι γίνεται με την ακρίβεια; Πώς αντιδρά η αντιπολίτευση;",
  },
  {
    id: "scenario",
    label: "Σενάριο",
    icon: "🎯",
    placeholder: "π.χ. Αν ψηφίσουμε υπέρ του νομοσχεδίου για τη στέγαση, τι θα γίνει;",
  },
  {
    id: "stance",
    label: "Συνέπεια",
    icon: "✅",
    placeholder: 'π.χ. Αυτή η δήλωση "θα μειώσουμε τον ΦΠΑ" συνάδει με τις θέσεις μας;',
  },
];

interface Message {
  role: "user" | "assistant";
  content: string;
  mode?: Mode;
  model?: string;
}

export default function AiChat() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("analysis");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const currentMode = MODES.find((m) => m.id === mode)!;

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question, mode }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, mode }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response, mode, model: data.model },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Σφάλμα: ${data.error}` },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Σφάλμα σύνδεσης. Δοκιμάστε ξανά." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-300/20 transition hover:bg-cyan-200 hover:scale-105 active:scale-95"
      >
        {open ? (
          <span className="text-xl">✕</span>
        ) : (
          <span className="text-xl">🤖</span>
        )}
      </button>

      {/* Chat modal */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#0a0f1e] shadow-2xl shadow-black/50 flex flex-col" style={{ maxHeight: "70vh" }}>
          {/* Header */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">AI Σύμβουλος</h3>
                <p className="text-[10px] text-zinc-500">Noraya Political Intelligence</p>
              </div>
            </div>

            {/* Mode switcher */}
            <div className="flex gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`flex-1 rounded-xl px-2 py-2 text-[11px] transition ${
                    mode === m.id
                      ? "bg-cyan-300/15 border border-cyan-300/30 text-cyan-100"
                      : "border border-white/10 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <span className="mr-1">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ minHeight: "200px", maxHeight: "400px" }}>
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="text-3xl mb-3">{currentMode.icon}</div>
                <p className="text-sm text-zinc-400 mb-2">
                  {mode === "analysis" && "Ρωτήστε οτιδήποτε για την πολιτική επικαιρότητα"}
                  {mode === "scenario" && "Περιγράψτε ένα σενάριο — τι γίνεται αν..."}
                  {mode === "stance" && "Ελέγξτε αν μια θέση συνάδει με τον οργανισμό σας"}
                </p>
                <p className="text-xs text-zinc-600">{currentMode.placeholder}</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    msg.role === "user"
                      ? "bg-cyan-300/15 text-cyan-50"
                      : "bg-white/[0.05] text-zinc-300"
                  }`}
                >
                  {msg.role === "assistant" && msg.mode && (
                    <div className="flex items-center gap-2 mb-2 text-[10px] text-zinc-500">
                      <span>{MODES.find((m) => m.id === msg.mode)?.icon}</span>
                      <span>{MODES.find((m) => m.id === msg.mode)?.label}</span>
                      {msg.model && (
                        <span className="rounded-full border border-white/10 px-2 py-0.5">
                          {msg.model.includes("opus") ? "Opus 4.6" : "Sonnet 4.6"}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-white/[0.05] px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-cyan-300" />
                    {mode === "scenario" ? "Ανάλυση σεναρίου με Opus 4.6..." : "Σκέφτομαι..."}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-white/10">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={currentMode.placeholder}
                className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none transition focus:border-cyan-300/40 placeholder:text-zinc-700"
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-30"
              >
                →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
