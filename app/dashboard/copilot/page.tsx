"use client";

import React, { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  insights?: string[];
  actions?: any[];
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

export default function CopilotPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentChat = chats.find((c) => c.id === activeChat);
  const messages = currentChat?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: "Νεο Chat",
      messages: [],
    };
    setChats((prev) => [newChat, ...prev]);
    setActiveChat(newChat.id);
    setActiveSection("chat");
  };

  const handleSubmit = async (text?: string) => {
    const message = text || input;
    if (!message.trim()) return;

    let chatId = activeChat;
    if (!chatId) {
      const newChat: Chat = {
        id: Date.now().toString(),
        title: message.slice(0, 30),
        messages: [],
      };
      setChats((prev) => [newChat, ...prev]);
      setActiveChat(newChat.id);
      chatId = newChat.id;
    }

    const userMessage: Message = { role: "user", content: message };
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? { ...chat, messages: [...chat.messages, userMessage] }
          : chat
      )
    );
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
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? { ...chat, messages: [...chat.messages, assistantMessage] }
            : chat
        )
      );
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
    "Βρες μου grants",
    "Αναλυσε τα reviews μου",
    "Προβλεψε το impact",
  ];

  const menuItems = [
    { id: "chat", icon: "💬", label: "Chat" },
    { id: "data", icon: "📊", label: "My Data" },
    { id: "projects", icon: "📁", label: "Projects" },
    { id: "grants", icon: "🎯", label: "Grant Finder" },
    { id: "impact", icon: "🔮", label: "Impact Predictor" },
    { id: "trends", icon: "👁", label: "Trend Radar" },
  ];

  const renderChatSection = () => (
    <React.Fragment>
      <div className="flex-1 overflow-y-auto px-6 py-8">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto">
            <img src="/axiprova-removebg-preview.png" alt="Axiprova" className="w-32 h-32 mb-6" />
            <h1 className="text-xl font-light text-zinc-300 mb-1">Axiprova</h1>
            <p className="text-zinc-500 text-center mb-8">Ο AI συμβουλος σου για τον πολιτισμο</p>
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
        ) : (
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
                    <img src="/axiprova-removebg-preview.png" alt="AI" className="w-8 h-8 rounded-full flex-shrink-0 mt-1" />
                    <div className="flex-1 space-y-4">
                      <div className="text-zinc-200 leading-relaxed">{msg.content}</div>
                      {msg.insights && msg.insights.length > 0 && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                          <p className="text-zinc-500 text-xs uppercase mb-2">Insights</p>
                          <ul className="space-y-1">
                            {msg.insights.map((insight, j) => (
                              <li key={j} className="text-zinc-400 text-sm flex items-start">
                                <span className="text-blue-400 mr-2">→</span>{insight}
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
                <img src="/axiprova-removebg-preview.png" alt="AI" className="w-8 h-8 rounded-full flex-shrink-0" />
                <div className="text-zinc-500">Σκεφτομαι...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      <div className="border-t border-zinc-800 bg-zinc-950 px-6 py-4">
        <div className="max-w-2xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ρωτησε οτιδηποτε..."
            className="flex-1 bg-zinc-900 text-white px-4 py-3 rounded-xl border border-zinc-800 focus:outline-none focus:border-zinc-600 placeholder-zinc-600"
          />
          <button
            onClick={() => handleSubmit()}
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition"
          >
            Στειλε
          </button>
        </div>
      </div>
    </React.Fragment>
  );

  const renderPlaceholder = (icon: string, title: string, desc: string, link?: string) => (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <span className="text-6xl mb-4 block">{icon}</span>
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        <p className="text-zinc-500 mb-6">{desc}</p>
        {link ? (
          <a href={link} className="px-6 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 transition inline-block">
            Ανοιξε
          </a>
        ) : (
          <span className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-full text-sm">Coming Soon</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-zinc-950 text-white flex overflow-hidden">
      <div className="w-64 bg-black border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <button
            onClick={createNewChat}
            className="w-full py-2 px-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
          >
            + Νεο Chat
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full text-left px-3 py-2 rounded-lg mb-1 flex items-center gap-3 transition ${
                activeSection === item.id
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              <span>{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
          {chats.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <p className="text-xs text-zinc-600 px-3 mb-2">RECENT CHATS</p>
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => {
                    setActiveChat(chat.id);
                    setActiveSection("chat");
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg mb-1 text-sm truncate transition ${
                    activeChat === chat.id
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-500 hover:bg-zinc-900"
                  }`}
                >
                  {chat.title}
                </button>
              ))}
            </div>
          )}
        </nav>
      </div>

      <div className="flex-1 flex flex-col">
        {activeSection === "chat" && renderChatSection()}
        {activeSection === "data" && renderPlaceholder("📊", "My Data", "Διαχειρισου τα reviews σου", "/dashboard/data")}
        {activeSection === "projects" && renderPlaceholder("📁", "Projects", "Οργανωσε τα projects σου")}
        {activeSection === "grants" && renderPlaceholder("🎯", "Grant Finder", "Βρες χρηματοδοτησεις")}
        {activeSection === "impact" && renderPlaceholder("🔮", "Impact Predictor", "Προβλεψε την επιτυχια σου")}
        {activeSection === "trends" && renderPlaceholder("👁", "Trend Radar", "Δες τι ειναι trending")}
      </div>
    </div>
  );
}
