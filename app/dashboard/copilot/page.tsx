"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  insights?: string[];
  actions?: any[];
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (text?: string) => {
    const message = text || input;
    if (!message.trim()) return;

    const userMessage: Message = { role: "user", content: message };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, language: "auto" }),
      });
      const data = await res.json();
      const assistantMessage: Message = {
        role: "assistant",
        content: data.reply,
        insights: data.insights,
        actions: data.actions,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const suggestions = [
    "Θελω να οργανωσω εκθεση",
    "Πως να προσελκυσω νεο κοινο",
    "Ιδεες για workshops",
    "Βοηθεια με grant application",
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      
      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
        
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-20">
            <img
              src="/axiprova-removebg-preview.png"
              alt="Axiprova"
              className="w-24 h-24 mb-6 opacity-80"
            />
            <h1 className="text-2xl font-light text-zinc-300 mb-2">Axiprova</h1>
            <p className="text-zinc-500 text-center mb-8">
              Ο AI συμβουλος σου για τον πολιτισμο
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(s)}
                  className="px-4 py-2 text-sm bg-zinc-900 text-zinc-400 border border-zinc-800 rounded-full hover:bg-zinc-800 hover:text-white transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="mb-6">
            {msg.role === "user" ? (
              <div className="flex justify-end">
                <div className="bg-zinc-800 text-white px-4 py-3 rounded-2xl rounded-br-md max-w-lg">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <img
                  src="/axiprova-removebg-preview.png"
                  alt="AI"
                  className="w-8 h-8 rounded-full flex-shrink-0 mt-1"
                />
                <div className="flex-1 space-y-4">
                  <div className="text-zinc-200 leading-relaxed">
                    {msg.content}
                  </div>

                  {msg.insights && msg.insights.length > 0 && (
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                      <p className="text-zinc-500 text-xs uppercase mb-2">Insights</p>
                      <ul className="space-y-1">
                        {msg.insights.map((insight, j) => (
                          <li key={j} className="text-zinc-400 text-sm flex items-start">
                            <span className="text-blue-400 mr-2">→</span>
                            {insight}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {msg.actions && msg.actions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {msg.actions.map((action, j) => (
                        <button
                          key={j}
                          onClick={() => handleSubmit(action.label)}
                          className="px-3 py-1.5 text-sm bg-zinc-900 text-zinc-400 border border-zinc-700 rounded-full hover:bg-zinc-800 hover:text-white transition"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 mb-6">
            <img
              src="/axiprova-removebg-preview.png"
              alt="AI"
              className="w-8 h-8 rounded-full flex-shrink-0"
            />
            <div className="text-zinc-500">Σκεφτομαι...</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-zinc-800 bg-black px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Γραψε κατι..."
            className="flex-1 bg-zinc-900 text-white px-4 py-3 rounded-xl border border-zinc-800 focus:outline-none focus:border-zinc-600 placeholder-zinc-600"
          />
          <button
            onClick={() => handleSubmit()}
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Στειλε
          </button>
        </div>
      </div>
    </div>
  );
}
