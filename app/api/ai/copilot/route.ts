"use client";

import React, { useEffect, useRef, useState } from "react";
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

const MODE_CONFIG: Record<
  Mode,
  {
    label: string;
    hint: string;
    suggestions: string[];
    wizardTitle: string;
    wizardQuestions: Array<{ key: string; label: string; placeholder: string }>;
  }
> = {
  chat: {
    label: "Axiprova Advisor",
    hint: "Γράψε ελεύθερα — το Axiprova θα σε βοηθήσει.",
    suggestions: ["Θέλω να οργανώσω έκθεση", "Βρες μου grants", "Ανάλυσε τα reviews μου", "Πρόβλεψε το impact"],
    wizardTitle: "Quick setup (Advisor)",
    wizardQuestions: [
      { key: "goal", label: "Τι θες να πετύχεις;", placeholder: "π.χ. αύξηση επισκεψιμότητας, νέο project, grants..." },
      { key: "context", label: "Λίγο context;", placeholder: "π.χ. είμαι κεραμίστας/μουσείο/φεστιβάλ..." },
      { key: "constraint", label: "Τι σε περιορίζει;", placeholder: "π.χ. χρόνος, budget, ομάδα, deadline..." },
    ],
  },
  projects: {
    label: "Projects",
    hint: "Από ιδέα → σε project plan (στόχος, κοινό, timeline, ρόλοι, resources).",
    suggestions: ["Φτιάξε μου project outline", "Γράψε concept note 1 σελίδα", "Βγάλε μου timeline 8 εβδομάδων", "Ρόλοι & συνεργάτες"],
    wizardTitle: "Start a Project",
    wizardQuestions: [
      { key: "project", label: "Τι project είναι;", placeholder: "π.χ. έκθεση, φεστιβάλ, residency..." },
      { key: "audience", label: "Για ποιο κοινό;", placeholder: "π.χ. νέοι 18–30, οικογένειες, τουρίστες..." },
      { key: "deadline", label: "Πότε το θες έτοιμο;", placeholder: "π.χ. σε 6 εβδομάδες / 15 Μαρτίου" },
    ],
  },
  grants: {
    label: "Grant Finder",
    hint: "Από ανάγκη → shortlist ευκαιριών + checklist αίτησης + draft κείμενα.",
    suggestions: ["Βρες μου grants για το project μου", "Φτιάξε eligibility checklist", "Γράψε summary αίτησης", "Τι έγγραφα χρειάζομαι;"],
    wizardTitle: "Find Grants",
    wizardQuestions: [
      { key: "country", label: "Περιοχή/Χώρα;", placeholder: "π.χ. Ελλάδα, EU, Αθήνα..." },
      { key: "topic", label: "Θέμα/Τομέας;", placeholder: "π.χ. σύγχρονη τέχνη, μουσεία, εκπαίδευση..." },
      { key: "window", label: "Χρονικό παράθυρο;", placeholder: "π.χ. deadlines 1–3 μήνες / φέτος" },
    ],
  },
  impact: {
    label: "Impact Predictor",
    hint: "KPIs + Theory of Change + plan μέτρησης (πρακτικό, όχι ακαδημαϊκό).",
    suggestions: ["Δώσε KPIs για το έργο μου", "Φτιάξε Theory of Change", "Φτιάξε evaluation plan", "Τι data να μαζεύω;"],
    wizardTitle: "Plan Impact",
    wizardQuestions: [
      { key: "activity", label: "Τι δράση κάνεις;", placeholder: "π.χ. εργαστήρια, έκθεση, εκπαιδευτικό πρόγραμμα..." },
      { key: "outcome", label: "Τι αλλαγή θες να δεις;", placeholder: "π.χ. αύξηση συμμετοχής, μάθηση, ένταξη..." },
      { key: "data", label: "Τι δεδομένα έχεις/μπορείς;", placeholder: "π.χ. εισιτήρια, surveys, socials, interviews..." },
    ],
  },
  trends: {
    label: "Trend Radar",
    hint: "Trends → 3 ιδέες → 1 γρήγορο test αυτή την εβδομάδα.",
    suggestions: ["Είμαι κεραμίστας — τι ποτήρια να φτιάξω;", "Δώσε μου 5 trends", "Φτιάξε 3 ιδέες συλλογής", "Πώς να τεστάρω ζήτηση γρήγορα;"],
    wizardTitle: "Explore Trends",
    wizardQuestions: [
      { key: "role", label: "Τι κάνεις;", placeholder: "π.χ. κεραμίστας, μουσικός, curator..." },
      { key: "market", label: "Πού πουλάς;", placeholder: "π.χ. Instagram, αγορές, e-shop, galleries..." },
      { key: "price", label: "Τι τιμές θες;", placeholder: "π.χ. low / mid / premium (ή εύρος €)" },
    ],
  },
};

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

  const [mode, setMode] = useState<Mode>("chat");

  // ✅ Smart Assist session context
  const [sessionContext, setSessionContext] = useState<Record<string, any>>({});

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

  const menuItems: Array<
    | { id: Mode; icon: string; label: string; kind: "mode" }
    | { id: "data"; icon: string; label: string; kind: "link"; href: string }
  > = [
    { id: "chat", icon: "/chat_logo.png", label: "Advisor", kind: "mode" },
    { id: "data", icon: "/my_data_logo.png", label: "My Data", kind: "link", href: "/dashboard/data" },
    { id: "projects", icon: "/project_logo.png", label: "Projects", kind: "mode" },
    { id: "grants", icon: "/Grand_Finder.png", label: "Grant Finder", kind: "mode" },
    { id: "impact", icon: "/Impact_Predictor_logo.png", label: "Impact Predictor", kind: "mode" },
    { id: "trends", icon: "/Trend_Radar_logo.png", label: "Trend Radar", kind: "mode" },
  ];

  const loadChats = async () => {
    try {
      const res = await fetch("/api/chats");
      if (res.ok) setChats(await res.json());
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
        setChats((prev) => prev.map((c) => (c.id === editingChatId ? { ...c, title: nextTitle } : c)));
      }
    }
    setEditingChatId(null);
    setEditingTitle("");
  };

  // Save button under assistant messages
  const saveArtifact = async (content: string) => {
    try {
      const title = content.split("\n").find((l) => l.trim())?.slice(0, 60) || "Saved";
      await fetch("/api/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, title, content }),
      });
    } catch (e) {
      console.error("Save failed", e);
    }
  };

  const getLastAssistantText = () => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    return last?.content ?? "";
  };

  const handleActionClick = async (action: { type?: string; label: string; payload?: any }) => {
    setLoading(true);

    // ✅ Smart Assist: update context BEFORE request when chip is set_context
    const nextContext =
      action?.type === "set_context" ? { ...sessionContext, ...(action.payload ?? {}) } : sessionContext;

    if (action?.type === "set_context") {
      setSessionContext(nextContext);
    }

    try {
      // Ensure we have a chat to append to (same behavior as handleSubmit)
      let chatId = activeChat;
      let baseMessages: Message[] = messages;

      if (!chatId) {
        const createRes = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: action.label.slice(0, 25), messages: [] }),
        });
        if (createRes.ok) {
          const newChat = await createRes.json();
          setChats((prev) => [newChat, ...prev]);
          setActiveChat(newChat.id);
          chatId = newChat.id;
          baseMessages = [];
        }
      }

      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: action.label, // human click text
          language: "auto",
          mode,
          sessionContext: nextContext,
          action: {
            type: action.type ?? "generic",
            label: action.label,
            payload: action.payload ?? {},
          },
          context: {
            lastAssistantMessage: getLastAssistantText(),
          },
        }),
      });

      const data = await res.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data?.reply ?? "",
        insights: Array.isArray(data?.insights) ? data.insights : [],
        actions: Array.isArray(data?.actions) ? data.actions : [],
      };

      const userMessage: Message = { role: "user", content: action.label };
      const updated = [...baseMessages, userMessage, assistantMessage];

      if (chatId) {
        setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, messages: updated } : c)));
        const chatNow = chatsRef.current.find((c) => c.id === chatId);
        await updateChat(chatId, chatNow?.title || "Chat", updated);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message) return;

    let chatId = activeChat;
    let isNewChat = false;

    if (!chatId) {
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
    }

    const userMessage: Message = { role: "user", content: message };
    const updatedMessages = [...(isNewChat ? [] : messages), userMessage];

    setChats((prev) => prev.map((chat) => (chat.id === chatId ? { ...chat, messages: updatedMessages } : chat)));

    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, language: "auto", mode, sessionContext }),
      });

      const data = await res.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data?.reply ?? "",
        insights: Array.isArray(data?.insights) ? data.insights : [],
        actions: Array.isArray(data?.actions) ? data.actions : [],
      };

      const finalMessages = [...updatedMessages, assistantMessage];

      setChats((prev) => prev.map((chat) => (chat.id === chatId ? { ...chat, messages: finalMessages } : chat)));

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
            const isActive = item.kind === "mode" ? mode === item.id : false;
            return (
              <button
                key={item.label}
                onClick={() => {
                  if (item.kind === "link") return router.push(item.href);
                  setMode(item.id);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg mb-1 flex items-center gap-3 transition ${
                  isActive ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
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
                      onKeyDown={(e) => e.key === "Enter" && saveEditingChat()}
                      autoFocus
                      className="w-full px-3 py-2 bg-zinc-800 text-white rounded-lg text-sm border border-zinc-600 focus:outline-none"
                    />
                  ) : (
                    <div className="flex items-center">
                      <button
                        onClick={() => setActiveChat(chat.id)}
                        onDoubleClick={() => startEditingChat(chat.id, chat.title)}
                        className={`flex-1 text-left px-3 py-2 rounded-lg text-sm truncate transition ${
                          activeChat === chat.id ? "bg-zinc-800 text-white" : "text-zinc-500 hover:bg-zinc-900"
                        }`}
                      >
                        {chat.title}
                      </button>
                      <button
                        onClick={() => deleteChat(chat.id)}
                        className="opacity-0 group-hover:opacity-100 px-2 text-zinc-600 hover:text-red-500 transition"
                        aria-label="Delete chat"
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

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Mode header */}
        <div className="border-b border-zinc-800 bg-zinc-950 px-6 py-4">
          <div className="max-w-2xl mx-auto">
            <div className="text-sm text-zinc-300">
              <span className="text-zinc-500">Mode:</span> {MODE_CONFIG[mode].label}
            </div>
            <div className="text-xs text-zinc-500 mt-1">{MODE_CONFIG[mode].hint}</div>
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <img src="/axiprova-icon.png" alt="Axiprova" className="w-20 h-20 mb-4" />
            <h1 className="text-xl font-light text-zinc-300 mb-1">Axiprova</h1>
            <p className="text-zinc-500 text-center mb-6">
              Ο AI σύμβουλός σου για τον πολιτισμό & τη δημιουργική βιομηχανία
            </p>

            <div className="flex flex-wrap justify-center gap-2 mb-6 max-w-2xl">
              {MODE_CONFIG[mode].suggestions.map((s, i) => (
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
              <div className="max-w-2xl mx-auto">
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
                        <img src="/axiprova-icon.png" alt="AI" className="w-8 h-8 flex-shrink-0 mt-1" />
                        <div className="flex-1 space-y-3">
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

                          <div className="flex gap-2">
                            <button
                              onClick={() => saveArtifact(msg.content)}
                              className="px-3 py-1.5 text-sm bg-zinc-900 text-zinc-300 border border-zinc-700 rounded-full hover:bg-zinc-800 hover:text-white transition"
                            >
                              Save
                            </button>
                          </div>

                          {msg.actions && msg.actions.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {msg.actions.map((action, j) => (
                                <button
                                  key={j}
                                  onClick={() => handleActionClick(action)}
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
            </div>

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
