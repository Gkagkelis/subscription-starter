"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useRouter } from "next/navigation";

type Mode = "chat" | "projects" | "grants" | "impact" | "trends";

interface Message {
  role: "user" | "assistant";
  content: string;
  insights?: string[];
  actions?: Array<{ label: string; [key: string]: any }>;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

export default function CopilotPage() {
  const router = useRouter();

  const [chats, setChats] = useState<Chat[]>([]);
  const chatsRef = useRef<Chat[]>([]);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ The key change: tools are MODES inside the same chat UI
  const [mode, setMode] = useState<Mode>("chat");

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentChat = chats.find((c) => c.id === activeChat);
  const messages = currentChat?.messages || [];

  useEffect(() => {
    loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const modeLabel: Record<Mode, string> = {
    chat: "Copilot",
    projects: "Projects Mode",
    grants: "Grant Finder Mode",
    impact: "Impact Predictor Mode",
    trends: "Trend Radar Mode",
  };

  const modeHint: Record<Mode, string> = {
    chat: "Γράψε ελεύθερα — ο Copilot θα σε βοηθήσει.",
    projects: "Οργάνωση project: στόχος, κοινό, timeline, συνεργάτες, budget notes.",
    grants: "Χρηματοδοτήσεις: eligibility, shortlist, checklist, sections αίτησης.",
    impact: "Impact & KPIs: theory of change, δείκτες, evaluation plan.",
    trends: "Trends: signals → ιδέες → πώς γίνονται project/ευκαιρία.",
  };

  const quickTools: Record<Mode, Array<{ label: string; prompt: string }>> = {
    chat: [
      { label: "Σύνοψη", prompt: "Summarize our conversation so far in bullet points." },
      { label: "Επόμενο βήμα", prompt: "Suggest the next best action and why." },
    ],
    projects: [
      { label: "Project outline", prompt: "Create a structured project outline (goal, audience, partners, timeline, budget notes)." },
      { label: "Project description", prompt: "Write a grant-ready project description (200-300 words)." },
      { label: "Timeline", prompt: "Create a simple timeline with milestones and deliverables." },
      { label: "Partner email", prompt: "Draft a professional partnership outreach email for this project." },
    ],
    grants: [
      { label: "Find grants", prompt: "Ask me 3 questions to find suitable grants, then propose a shortlist format." },
      { label: "Eligibility check", prompt: "Create an eligibility checklist and tell me what info is missing." },
      { label: "Application checklist", prompt: "Create a grant application checklist for this project." },
      { label: "Draft section", prompt: "Draft a strong application section (Objectives, Activities, Audience, Partners)." },
    ],
    impact: [
      { label: "KPIs", prompt: "Propose KPIs and a measurement plan for this project (outputs/outcomes/impact)." },
      { label: "Theory of Change", prompt: "Create a short Theory of Change (inputs → activities → outputs → outcomes → impact)." },
      { label: "Evaluation plan", prompt: "Write a concise evaluation plan suitable for a grant application." },
      { label: "Risks & mitigation", prompt: "List key risks and mitigation strategies for this project." },
    ],
    trends: [
      { label: "Trend scan", prompt: "Give me 5 relevant trends for culture & creative industries and how to use them in a project." },
      { label: "3 ideas", prompt: "Generate 3 project ideas aligned with current trends, including audience and partners." },
      { label: "Audience fit", prompt: "Suggest target audiences and engagement tactics aligned with these trends." },
      { label: "Project angle", prompt: "Propose 3 compelling project angles that improve relevance and fundability." },
    ],
  };

  const suggestions = useMemo(() => {
    // Small, friendly starter prompts (Greek UI, English output can be handled server-side if you want)
    switch (mode) {
      case "projects":
        return ["Θέλω να οργανώσω έκθεση", "Φτιάξε μου project outline", "Γράψε περιγραφή project", "Βοήθησέ με με timeline"];
      case "grants":
        return ["Βρες μου grants", "Φτιάξε eligibility checklist", "Γράψε grant summary", "Τι χρειάζομαι για αίτηση;"];
      case "impact":
        return ["Πρόβλεψε το impact", "Δώσε KPIs", "Φτιάξε evaluation plan", "Theory of Change"];
      case "trends":
        return ["Τι είναι trending;", "Δώσε μου 5 trends", "Φτιάξε 3 ιδέες", "Πώς συνδέεται με grants;"];
      default:
        return ["Θέλω να οργανώσω έκθεση", "Βρες μου grants", "Ανάλυσε τα reviews μου", "Πρόβλεψε το impact"];
    }
  }, [mode]);

  const menuItems: Array<
    | { id: Mode; icon: string; label: string; kind: "mode" }
    | { id: "data"; icon: string; label: string; kind: "link"; href: string }
  > = [
    { id: "chat", icon: "/chat_logo.png", label: "Copilot", kind: "mode" },
    { id: "data", icon: "/my_data_logo.png", label: "My Data", kind: "link", href: "/dashboard/data" },
    { id: "projects", icon: "/project_logo.png", label: "Projects", kind: "mode" },
    { id: "grants", icon: "/Grand_Finder.png", label: "Grant Finder", kind: "mode" },
    { id: "impact", icon: "/Impact_Predictor_logo.png", label: "Impact Predictor", kind: "mode" },
    { id: "trends", icon: "/Trend_Radar_logo.png", label: "Trend Radar", kind: "mode" },
  ];

  const loadChats = async () => {
    try {
      const res = await fetch("/api/chats");
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (error) {
      console.error("Failed to load chats:", error);
    }
  };

  const createNewChat = async () => {
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Νέο Chat", messages: [] }),
      });
      if (res.ok) {
        const newChat = await res.json();
        setChats((prev) => [newChat, ...prev]);
        setActiveChat(newChat.id);
        // stay in chat UI; mode remains whatever user selected
      }
    } catch (error) {
      console.error("Failed to create chat:", error);
    }
  };

  const updateChat = async (chatId: string, title: string, messages: Message[]) => {
    try {
      await fetch("/api/chats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chatId, title, messages }),
      });
    } catch (error) {
      console.error("Failed to update chat:", error);
    }
  };

  const deleteChat = async (chatId: string) => {
    try {
      await fetch("/api/chats", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chatId }),
      });
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (activeChat === chatId) setActiveChat(null);
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  };

  const startEditingChat = (chatId: string, currentTitle: string) => {
    setEditingChatId(chatId);
    setEditingTitle(currentTitle);
  };

  const saveEditingChat = async () => {
    if (editingChatId && editingTitle.trim()) {
      const chat = chatsRef.current.find((c) => c.id === editingChatId);
      if (chat) {
        const nextTitle = editingTitle.trim();
        await updateChat(editingChatId, nextTitle, chat.messages);
        setChats((prev) =>
          prev.map((c) => (c.id === editingChatId ? { ...c, title: nextTitle } : c))
        );
      }
    }
    setEditingChatId(null);
    setEditingTitle("");
  };

  const handleSubmit = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message) return;

    let chatId = activeChat;
    let isNewChat = false;

    // Create a chat if none active
    if (!chatId) {
      try {
        const res = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: message.slice(0, 25), messages: [] }),
        });
        if (res.ok) {
          const newChat = await res.json();
          setChats((prev) => [newChat, ...prev]);
          setActiveChat(newChat.id);
          chatId = newChat.id;
          isNewChat = true;
        }
      } catch (error) {
        console.error("Failed to create chat:", error);
        return;
      }
    }

    const userMessage: Message = { role: "user", content: message };
    const updatedMessages = [...(isNewChat ? [] : messages), userMessage];

    // Optimistic UI update
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, messages: updatedMessages } : chat))
    );

    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ✅ send mode so backend can be specialized
        body: JSON.stringify({ message, language: "auto", mode }),
      });

      const data = await res.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data?.reply ?? "",
        insights: Array.isArray(data?.insights) ? data.insights : [],
        actions: Array.isArray(data?.actions) ? data.actions : [],
      };

      const finalMessages = [...updatedMessages, assistantMessage];

      setChats((prev) =>
        prev.map((chat) => (chat.id === chatId ? { ...chat, messages: finalMessages } : chat))
      );

      const chatNow = chatsRef.current.find((c) => c.id === chatId);
      await updateChat(chatId!, chatNow?.title || message.slice(0, 25), finalMessages);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="h-screen bg-zinc-950 text-white flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-black border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <button
            onClick={createNewChat}
            className="w-full py-2 px-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
          >
            + Νέο Chat
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {menuItems.map((item) => {
            const isActive =
              item.kind === "mode" ? mode === item.id : false;

            return (
              <button
                key={item.label}
                onClick={() => {
                  if (item.kind === "link") {
                    router.push(item.href);
                    return;
                  }
                  setMode(item.id);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg mb-1 flex items-center gap-3 transition ${
                  isActive
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                }`}
              >
                <img
                  src={item.icon}
                  alt=""
                  className="w-5 h-5"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <span className="text-sm">{item.label}</span>
              </button>
            );
          })}

          {chats.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <p className="text-xs text-zinc-600 px-3 mb-2">RECENT CHATS</p>

              {chats.map((chat) => (
                <div key={chat.id} className="relative group">
                  {editingChatId === chat.id ? (
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={saveEditingChat}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEditingChat();
                      }}
                      autoFocus
                      className="w-full px-3 py-2 bg-zinc-800 text-white rounded-lg text-sm border border-zinc-600 focus:outline-none"
                    />
                  ) : (
                    <div className="flex items-center">
                      <button
                        onClick={() => setActiveChat(chat.id)}
                        onDoubleClick={() => startEditingChat(chat.id, chat.title)}
                        className={`flex-1 text-left px-3 py-2 rounded-lg text-sm truncate transition ${
                          activeChat === chat.id
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-500 hover:bg-zinc-900"
                        }`}
                      >
                        {chat.title}
                      </button>

                      <button
                        onClick={() => deleteChat(chat.id)}
                        className="opacity-0 group-hover:opacity-100 px-2 text-zinc-600 hover:text-red-500 transition"
                        aria-label="Delete chat"
                        title="Delete chat"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </nav>
      </div>

      {/* Main Chat Area (always chat UI) */}
      <div className="flex-1 flex flex-col">
        {/* Mode header */}
        <div className="border-b border-zinc-800 bg-zinc-950 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-zinc-300">
                <span className="text-zinc-500">Mode:</span> {modeLabel[mode]}
              </div>
              <div className="text-xs text-zinc-500 mt-1">{modeHint[mode]}</div>
            </div>

            {/* Quick tools for mobile/tablet (simple & friendly) */}
            <div className="flex gap-2 flex-wrap justify-end">
              {quickTools[mode].slice(0, 2).map((t, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSubmit(t.prompt)}
                  className="px-3 py-2 text-xs bg-zinc-900 text-zinc-300 border border-zinc-800 rounded-lg hover:bg-zinc-800 hover:text-white transition"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <img src="/axiprova-icon.png" alt="Axiprova" className="w-20 h-20 mb-4" />
            <h1 className="text-xl font-light text-zinc-300 mb-1">Axiprova</h1>
            <p className="text-zinc-500 text-center mb-6">
              Ο AI σύμβουλός σου για τον πολιτισμό & τη δημιουργική βιομηχανία
            </p>

            <div className="flex flex-wrap justify-center gap-2 mb-6 max-w-2xl">
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

            <div className="w-full max-w-2xl flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ρώτησε οτιδήποτε..."
                className="flex-1 bg-zinc-900 text-white px-4 py-3 rounded-xl border border-zinc-800 focus:outline-none focus:border-zinc-600 placeholder-zinc-600"
              />
              <button
                onClick={() => handleSubmit()}
                disabled={loading || !input.trim()}
                className="px-6 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition"
              >
                Στείλε
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="max-w-6xl mx-auto flex gap-6">
                {/* Left: Messages */}
                <div className="flex-1 max-w-2xl">
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
                            src="/axiprova-icon.png"
                            alt="AI"
                            className="w-8 h-8 flex-shrink-0 mt-1"
                          />
                          <div className="flex-1 space-y-4">
                            <div className="text-zinc-200 leading-relaxed prose prose-invert prose-sm max-w-none">
                              <ReactMarkdown
                                components={{
                                  a: ({ href, children, ...props }) => (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:text-blue-300 underline"
                                      {...props}
                                    >
                                      {children}
                                    </a>
                                  ),
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
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
                      <img src="/axiprova-icon.png" alt="AI" className="w-8 h-8 flex-shrink-0" />
                      <div className="text-zinc-500">Σκέφτομαι...</div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Right: Tool Panel (desktop only) */}
                <div className="w-80 hidden lg:block">
                  <div className="sticky top-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <p className="text-zinc-500 text-xs uppercase mb-3">Quick Tools</p>
                      <div className="space-y-2">
                        {quickTools[mode].map((t, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSubmit(t.prompt)}
                            className="w-full text-left px-3 py-2 text-sm bg-zinc-950 text-zinc-300 border border-zinc-800 rounded-lg hover:bg-zinc-800 hover:text-white transition"
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Input */}
            <div className="border-t border-zinc-800 bg-zinc-950 px-6 py-4">
              <div className="max-w-2xl mx-auto flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ρώτησε οτιδήποτε..."
                  className="flex-1 bg-zinc-900 text-white px-4 py-3 rounded-xl border border-zinc-800 focus:outline-none focus:border-zinc-600 placeholder-zinc-600"
                />
                <button
                  onClick={() => handleSubmit()}
                  disabled={loading || !input.trim()}
                  className="px-6 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition"
                >
                  Στείλε
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
