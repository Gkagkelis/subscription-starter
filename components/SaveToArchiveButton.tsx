"use client";

import { useState } from "react";

/**
 * Κουμπί «Αποθήκευση στο Αρχείο».
 * Αυτόνομο — δεν χρειάζεται props από τη «μηχανή».
 * Πατάς → ζητάει τίτλο → σώζει στο /api/archive (πίνακας noraya_archives).
 * Το κόμμα το βρίσκει μόνο του από το /api/onboarding (ίδιο μοτίβο με τη σελίδα Αρχεία).
 */

type Kind = "note" | "analysis" | "scenario";
type Phase = "idle" | "editing" | "saving" | "done" | "error";

export default function SaveToArchiveButton({
  kind,
  content,
  defaultTitle = "",
  eventTitle = null,
  eventId = null,
  className = "",
  label = "Αποθήκευση στο Αρχείο",
}: {
  kind: Kind;
  content: string;
  defaultTitle?: string;
  eventTitle?: string | null;
  eventId?: string | null;
  className?: string;
  label?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [title, setTitle] = useState("");

  function begin() {
    setTitle((defaultTitle || eventTitle || "").slice(0, 120));
    setPhase("editing");
  }

  async function save() {
    const t = title.trim();
    if (!t) return;
    setPhase("saving");

    let party = "elas";
    try {
      const pr = await fetch("/api/onboarding", { cache: "no-store" });
      if (pr.ok) {
        const pj = await pr.json();
        if (pj?.party_key) party = String(pj.party_key);
      }
    } catch {
      /* μένει το default */
    }

    try {
      const r = await fetch("/api/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          party,
          title: t,
          kind,
          content: content || "",
          event_id: eventId,
          event_title: eventTitle,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) {
        setPhase("done");
        setTimeout(() => setPhase("idle"), 2600);
      } else {
        setPhase("error");
        setTimeout(() => setPhase("idle"), 3200);
      }
    } catch {
      setPhase("error");
      setTimeout(() => setPhase("idle"), 3200);
    }
  }

  if (phase === "editing") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setPhase("idle");
          }}
          placeholder="Τίτλος για το αρχείο…"
          className="w-56 rounded-lg border border-cyan-300/40 bg-black/30 px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        <button
          type="button"
          onClick={save}
          className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1.5 text-[12px] font-medium text-cyan-100 transition hover:bg-cyan-300/20"
        >
          Αποθήκευση
        </button>
        <button
          type="button"
          onClick={() => setPhase("idle")}
          className="rounded-lg px-2 py-1.5 text-[12px] text-zinc-500 transition hover:text-zinc-300"
        >
          Άκυρο
        </button>
      </div>
    );
  }

  if (phase === "saving") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[12px] text-zinc-400 ${className}`}
      >
        Αποθήκευση…
      </span>
    );
  }

  if (phase === "done") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1.5 text-[12px] font-medium text-emerald-200 ${className}`}
      >
        Αποθηκεύτηκε ✓
      </span>
    );
  }

  if (phase === "error") {
    return (
      <button
        type="button"
        onClick={begin}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-400/10 px-2.5 py-1.5 text-[12px] font-medium text-red-200 transition hover:bg-red-400/20 ${className}`}
      >
        Ξαναπροσπάθησε
      </button>
    );
  }

  // idle
  return (
    <button
      type="button"
      onClick={begin}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-[#1a2640] bg-white/[0.02] px-2.5 py-1.5 text-[12px] text-zinc-300 transition hover:border-cyan-300/30 hover:text-cyan-100 ${className}`}
    >
      <span className="text-[13px] leading-none">＋</span>
      {label}
    </button>
  );
}
