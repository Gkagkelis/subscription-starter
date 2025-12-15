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
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentChat = chats.find((c) => c.id === activeChat);
  const messages = currentChat?.messages || [];

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        body: JSON.stringify({ title: "Νεο Chat", messages: [] }),
      });
      if (res.ok) {
        const newChat = await res.json();
        setChats((prev) => [newChat, ...prev]);
        setActiveChat(newChat.id);
        setActiveSection("chat");
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
      if (activeChat === chatId) {
        setActiveChat(null);
      }
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
      const chat = chats.find((c) => c.id === editingChatId);
      if (chat) {
        await updateChat(editingChatId, editingTitle.trim(), chat.messages);
        setChats((prev) =>
          prev.map((c) =>
            c.id === editingChatId ? { ...c, title: editingTitle.trim() } : c
          )
        );
      }
    }
    setEditingChatId(null);
    setEditingTitle("");
  };

  const handleSubmit = async (text?: string) => {
    const message = text || input;
    if (!message.trim()) return;

    let chatId = activeChat;
    let isNewChat = false;

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
    
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId ? { ...chat, messages: updatedMessages } : chat
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
      
      const finalMessages = [...updatedMessages, assistantMessage];
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId ? { ...chat, messages: finalMessages } : chat
        )
      );

      const chat = chats.find((c) => c.id === chatId);
      await updateChat(chatId!, chat?.title || message.slice(0, 25), finalMessages);
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
    { id: "chat", icon: "/chat_logo.png", label: "Chat" },
    { id: "data", icon: "/my_data_logo.png", label: "My Data" },
    { id: "projects", icon: "/project_logo.png", label: "Projects" },
    { id: "grants", icon: "/Grand_Finder.png", label: "Grant Finder" },
    { id: "impact", icon: "/Impact_Predictor_logo.png", label: "Impact Predictor" },
    { id: "trends", icon: "/Trend_Radar_logo.png", label: "Trend Radar" },
  ];

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
              <img src={item.icon} alt={item.label} className="w-5 h-5" />
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
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
                        onClick={() => {
                          setActiveChat(chat.id);
                          setActiveSection("chat");
                        }}
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

      <div className="flex-1 flex flex-col">
        {activeSection === "chat" && (
          <React.Fragment>
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6">
                <img src="/axiprova-icon.png" alt="Axiprova" className="w-20 h-20 mb-4" />
                <h1 className="text-xl font-light text-zinc-300 mb-1">Axiprova</h1>
                <p className="text-zinc-500 text-center mb-6">Ο AI συμβουλος σου για τον πολιτισμο</p>
                <div className="flex flex-wrap justify-center gap-2 mb-6">
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
            ) : (
              <React.Fragment>
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
                        <img src="/axiprova-icon.png" alt="AI" className="w-8 h-8 flex-shrink-0" />
                        <div className="text-zinc-500">Σκεφτομαι...</div>
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
            )}
          </React.Fragment>
        )}

        {activeSection === "data" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <img src="/my_data_logo.png" alt="My Data" className="w-20 h-20 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">My Data</h2>
              <p className="text-zinc-500 mb-6">Διαχειρισου τα reviews σου</p>
              <a href="/dashboard/data" className="px-6 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 transition inline-block">Ανοιξε</a>
            </div>
          </div>
        )}

        {activeSection === "projects" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <img src="/project_logo.png" alt="Projects" className="w-20 h-20 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Projects</h2>
              <p className="text-zinc-500 mb-6">Οργανωσε τα projects σου</p>
              <span className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-full text-sm">Coming Soon</span>
            </div>
          </div>
        )}

        {activeSection === "grants" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <img src="/Grand_Finder.png" alt="Grant Finder" className="w-20 h-20 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Grant Finder</h2>
              <p className="text-zinc-500 mb-6">Βρες χρηματοδοτησεις</p>
              <span className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-full text-sm">Coming Soon</span>
            </div>
          </div>
        )}

        {activeSection === "impact" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <img src="/Impact_Predictor_logo.png" alt="Impact Predictor" className="w-20 h-20 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Impact Predictor</h2>
              <p className="text-zinc-500 mb-6">Προβλεψε την επιτυχια σου</p>
              <span className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-full text-sm">Coming Soon</span>
            </div>
          </div>
        )}

        {activeSection === "trends" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <img src="/Trend_Radar_logo.png" alt="Trend Radar" className="w-20 h-20 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Trend Radar</h2>
              <p className="text-zinc-500 mb-6">Δες τι ειναι trending</p>
              <span className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-full text-sm">Coming Soon</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
