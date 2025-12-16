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
    chat: "Axiprova Advisor",
    projects: "Projects",
    grants: "Grants",
    impact: "Impact",
    trends: "Trends",
  };

  const modeHint: Record<Mode, string> = {
    chat: "Γράψε ελεύθερα — το Axiprova θα σε βοηθήσει.",
    projects: "Οργάνωση project: στόχος, κοινό, timeline, συνεργάτες, budget notes.",
    grants: "Χρηματοδοτήσεις: eligibility, shortlist, checklist, sections αίτησης.",
    impact: "Impact & KPIs: theory of change, δείκτες, evaluation plan.",
    trends: "Trends: signals → ιδέες → πώς γίνονται project/ευκαιρία.",
  };

  const suggestions = useMemo(() => {
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
    { id: "chat", icon: "/chat_logo.png", label: "Advisor", kind: "mode" },
    { id: "data", icon: "/my_data_logo.png", label: "My Data", kind: "link", href: "/dashboard/data" },
    { id: "projects", icon: "/project_logo.png", label: "Projects", kind: "mode" },
    { id: "grants", icon: "/Grand_Finder.png", label: "Grant_
