"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useRouter } from "next/navigation";

type Mode = "chat" | "projects" | "grants" | "impact" | "trends";

interface CopilotAction {
  type?: string;
  label: string;
  payload?: any;
  [key: string]: any;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  insights?: string[];
  actions?: CopilotAction[];
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

const UI_TEXT = {
  newChat: "+ New Chat",
  recentChats: "RECENT CHATS",
  askAnything: "Ask anything...",
  send: "Send",
  thinking: "Thinking...",
  modeLabel: "Mode:",
  myData: "My Data",
  advisor: "Advisor",
} as const;

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
    hint: "Type freely — Axiprova will help.",
    suggestions: ["Help me plan an exhibition", "Find relevant grants", "Analyze my reviews", "Estimate my project impact"],
    wizardTitle: "Quick setup (Advisor)",
    wizardQuestions: [
      {
        key: "goal",
        label: "What do you want to achieve?",
        placeholder: "e.g. increase visitors, launch a new project, find grants...",
      },
      {
        key: "context",
        label: "Any context?",
        placeholder: "e.g. I’m a ceramic artist / museum / festival organizer...",
      },
      {
        key: "constraint",
        label: "What constraints do you have?",
        placeholder: "e.g. time, budget, team, deadline...",
      },
    ],
  },
  projects: {
    label: "Projects",
    hint: "From idea → a project plan (goal, audience, timeline, roles, resources).",
    suggestions: ["Create a project outline", "Write a one-page concept note", "Build an 8-week timeline", "Roles & collaborators"],
    wizardTitle: "Start a Project",
    wizardQuestions: [
      { key: "project", label: "What kind of project is it?", placeholder: "e.g. exhibition, festival, residency..." },
      { key: "audience", label: "Who is it for?", placeholder: "e.g. ages 18–30, families, tourists..." },
      { key: "deadline", label: "When do you need it ready?", placeholder: "e.g. in 6 weeks / March 15" },
    ],
  },
  grants: {
    label: "Grant Finder",
    hint: "From need → a shortlist of opportunities + application checklist + draft texts.",
    suggestions: ["Find grants for my project", "Build an eligibility checklist", "Draft the application summary", "What documents do I need?"],
    wizardTitle: "Find Grants",
    wizardQuestions: [
      { key: "country", label: "Region/Country?", placeholder: "e.g. Greece, EU, Athens..." },
      { key: "topic", label: "Topic/Field?", placeholder: "e.g. contemporary art, museums, education..." },
      { key: "window", label: "Time window?", placeholder: "e.g. deadlines in 1–3 months / this year" },
    ],
  },
  impact: {
    label: "Impact Predictor",
    hint: "KPIs + Theory of Change + a practical measurement plan (not academic).",
    suggestions: ["Suggest KPIs for my project", "Create a Theory of Change", "Build an evaluation plan", "What data should I collect?"],
    wizardTitle: "Plan Impact",
    wizardQuestions: [
      { key: "activity", label: "What activity are you running?", placeholder: "e.g. workshops, exhibition, education program..." },
      { key: "outcome", label: "What change do you want to see?", placeholder: "e.g. higher participation, learning, inclusion..." },
      { key: "data", label: "What data do you have/can collect?", placeholder: "e.g. ticketing, surveys, socials, interviews..." },
    ],
  },
  trends: {
    label: "Trend Radar",
    hint: "Trends → 3 ideas → 1 quick test this week.",
    suggestions: ["I'm a ceramic artist — what should I make next?", "Give me 5 trends", "Create 3 collection ideas", "How can I test demand fast?"],
    wizardTitle: "Explore Trends",
    wizardQuestions: [
      { key: "role", label: "What do you do?", placeholder: "e.g. ceramic artist, musician, curator..." },
      { key: "market", label: "Where do you sell?", placeholder: "e.g. Instagram, markets, e-shop, galleries..." },
      { key: "price", label: "What price point?", placeholder: "e.g. low / mid / premium (or € range)" },
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

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ✅ Smart Assist context
  const [sessionContext, setSessionContext] = useState<Record<string, any>>({});

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
    { id: "chat", icon: "/chat_logo.png", label: UI_TEXT.advisor, kind: "mode" },
    { id: "data", icon: "/my_data_logo.png", label: UI_TEXT.myData, kind: "link", href: "/dashboard/data" },
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
        body: JSON.stringify({ title: "New Chat", messages: [] }),
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

  const handleActionClick = async (action: CopilotAction) => {
    setLoading(true);

    // ✅ update context BEFORE request when set_context
    const nextContext =
      action?.type === "set_context" ? { ...sessionContext, ...(action.payload ?? {}) } : sessionContext;

    if (action?.type === "set_context") {
      setSessionContext(nextContext);
    }

    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: action.label, // ok σαν “human click”
          language: "auto",
          mode,
          sessionContext: nextContext, // <- το σημαντικό
          action: {
            type: action.type ?? "generic",
            label: action.label,
            payload: action.payload ?? {},
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

      // append to current chat
      const userMessage: Message = { role: "user", content: action.label };
      const updated = [...messages, userMessage, assistantMessage];

      if (activeChat) {
        setChats((prev) => prev.map((c) => (c.id === activeChat ? { ...c, messages: updated } : c)));
        const chatNow = chatsRef.current.find((c) => c.id === activeChat);
        await updateChat(activeChat, chatNow?.title || "Chat", updated);
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
        // ✅ include sessionContext
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
            {UI_TEXT.newChat}
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
              <p className="text-xs text-zinc-600 px-3 mb-2">{UI_TEXT.recentChats}</p>

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
              <span className="text-zinc-500">{UI_TEXT.modeLabel}</span> {MODE_CONFIG[mode].label}
            </div>
            <div className="text-xs text-zinc-500 mt-1">{MODE_CONFIG[mode].hint}</div>
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <img src="/axiprova-icon.png" alt="Axiprova" className="w-20 h-20 mb-4" />
            <h1 className="text-xl font-light text-zinc-300 mb-1">Axiprova</h1>
            <p className="text-zinc-500 text-center mb-6">Your AI advisor for culture & the creative industries</p>

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
                placeholder={UI_TEXT.askAnything}
                className="flex-1 bg-zinc-900 text-white px-4 py-3 rounded-xl border border-zinc-800 focus:outline-none focus:border-zinc-600 placeholder-zinc-600"
              />
              <button
                onClick={() => handleSubmit()}
                disabled={loading || !input.trim()}
                className="px-6 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition"
              >
                {UI_TEXT.send}
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
                    <div className="text-zinc-500">{UI_TEXT.thinking}</div>
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
                  placeholder={UI_TEXT.askAnything}
                  className="flex-1 bg-zinc-900 text-white px-4 py-3 rounded-xl border border-zinc-800 focus:outline-none focus:border-zinc-600 placeholder-zinc-600"
                />
                <button
                  onClick={() => handleSubmit()}
                  disabled={loading || !input.trim()}
                  className="px-6 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition"
                >
                  {UI_TEXT.send}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
