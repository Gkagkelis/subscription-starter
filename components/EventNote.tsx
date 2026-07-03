"use client";

import { useState } from "react";

/**
 * «Γρήγορη καταγραφή» — αληθινή σημείωση, δεμένη στο ανοιχτό γεγονός.
 * Αυτόνομο: το κόμμα το βρίσκει μόνο του από το /api/onboarding.
 * Σώζει στο /api/archive με kind="note" → φαίνεται στα «Αρχεία».
 * Αν δεν υπάρχει ανοιχτό γεγονός, σώζεται ως γενική σημείωση.
 */

type Phase = "idle" | "saving" | "done" | "error";

export default function EventNote({
  eventId = null,
  eventTitle = null,
}: {
  eventId?: string | null;
  eventTitle?: string | null;
}) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");

  async function save() {
    const bodyText = text.trim();
    if (!bodyText) return;
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

    const firstLine = bodyText.split("\n")[0].trim();
    const title = firstLine ? firstLine.slice(0, 80) : "Σημείωση";

    try {
      const r = await fetch("/api/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          party,
          kind: "note",
          title,
          content: bodyText,
          event_id: eventId,
          event_title: eventTitle,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) {
        setPhase("done");
        setText("");
        setTimeout(() => setPhase("idle"), 2400);
      } else {
        setPhase("error");
        setTimeout(() => setPhase("idle"), 3000);
      }
    } catch {
      setPhase("error");
      setTimeout(() => setPhase("idle"), 3000);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="text-[10px] leading-4 text-zinc-500">
        {eventTitle ? (
          <>
            Σημείωση για: <span className="text-zinc-300">{eventTitle}</span>
          </>
        ) : (
          "Γενική σημείωση"
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Γράψε μια σκέψη, μια οδηγία, κάτι να θυμάσαι…"
        rows={3}
        className="w-full resize-none rounded-2xl border border-[#1a2640] bg-[#0c1220] px-3 py-2 text-[11px] leading-5 text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/30"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] leading-4 text-zinc-600">
          {phase === "done"
            ? "Αποθηκεύτηκε ✓ — δες το στα «Αρχεία»"
            : phase === "error"
              ? "Κάτι πήγε στραβά"
              : ""}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={phase === "saving" || !text.trim()}
          className="shrink-0 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-[11px] font-medium text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-40"
        >
          {phase === "saving" ? "Αποθήκευση…" : "Κράτα σημείωση"}
        </button>
      </div>
    </div>
  );
}
