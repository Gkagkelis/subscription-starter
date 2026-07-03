"use client";

import { useEffect, useState } from "react";

type Theme = { topic: string; score: number; events?: number; rising?: boolean };
type ArchitectResult = { title?: string; displayText?: string } | null;

function tierColor(score: number): string {
  if (score >= 68) return "#ef4444";
  if (score >= 45) return "#f59e0b";
  return "#22d3ee";
}

function ThemeRow({ t }: { t: Theme }) {
  const score = Math.max(0, Math.min(100, Math.round(t.score || 0)));
  const color = tierColor(score);
  return (
    <div className="flex items-center gap-2.5 px-0.5 py-[7px]">
      <div className="min-w-0 flex-1 break-words text-[12.5px] text-zinc-200">
        <span className="align-middle">{t.topic}</span>
        {t.events ? (
          <span className="align-middle text-[11px] text-zinc-500"> · {t.events} γεγ.</span>
        ) : null}
        {t.rising ? <span className="align-middle text-cyan-300"> ↑</span> : null}
      </div>
      <div className="h-[5px] w-[84px] shrink-0 overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <div className="w-6 shrink-0 text-right text-[12px] font-semibold text-zinc-100">{score}</div>
    </div>
  );
}

export default function AgendaLandscape({
  themes,
  architectResult = null,
  architectLoading = false,
  architectError = "",
  onRunArchitect,
  onContinueArchitect,
}: {
  themes: Theme[];
  architectResult?: ArchitectResult;
  architectLoading?: boolean;
  architectError?: string;
  onRunArchitect?: () => void;
  onContinueArchitect?: () => void;
}) {
  const [synopsis, setSynopsis] = useState("");
  const [synLoading, setSynLoading] = useState(true);
  const [showTip, setShowTip] = useState(false);

  const sorted = [...themes].sort((a, b) => (b.score || 0) - (a.score || 0));
  const high = sorted.filter((t) => t.score >= 68);
  const mid = sorted.filter((t) => t.score >= 45 && t.score < 68);
  const low = sorted.filter((t) => t.score < 45);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!themes.length) {
        setSynLoading(false);
        return;
      }
      setSynLoading(true);
      let party = "elas";
      let partyName = "το κόμμα";
      let profile: unknown = null;
      try {
        const pr = await fetch("/api/onboarding", { cache: "no-store" });
        if (pr.ok) {
          const pj = await pr.json();
          profile = pj || null;
          if (pj?.party_key) party = String(pj.party_key);
          if (pj?.party_name) partyName = String(pj.party_name);
        }
      } catch {
        /* defaults */
      }
      try {
        const r = await fetch("/api/strategy-room/agenda-synopsis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            party,
            party_name: partyName,
            profile,
            themes: sorted.map((t) => ({
              topic: t.topic,
              score: t.score,
              events: t.events || 0,
              rising: !!t.rising,
            })),
          }),
        });
        const j = await r.json();
        if (!cancel && j?.ok && j.synopsis) setSynopsis(String(j.synopsis));
      } catch {
        /* ignore */
      } finally {
        if (!cancel) setSynLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themes.length]);

  const archText = architectResult?.displayText || "";

  return (
    <section className="rounded-[1.75rem] border border-white/[0.07] bg-[#070c16]/95 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] tracking-[0.08em] text-cyan-100/80">ΣΥΝΟΛΙΚΗ ΕΙΚΟΝΑ</div>
          <div className="mt-1 text-[15px] font-semibold text-zinc-50">
            Όλο το πεδίο της ημέρας{" "}
            <span className="text-[12px] font-normal text-zinc-500">
              · {themes.length} θέματα · κατάταξη ατζέντας
            </span>
          </div>
        </div>
        <div
          className="relative shrink-0"
          onMouseEnter={() => setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}
        >
          <button
            type="button"
            onClick={onRunArchitect}
            disabled={architectLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-red-300/30 bg-red-400/90 px-3.5 py-2 text-[12px] font-semibold text-red-950 transition hover:bg-red-300 disabled:opacity-60"
          >
            {architectLoading ? "Αναλύει το πεδίο…" : archText ? "Ανανέωση" : "Κίνηση Αναδιάταξης"}
            <span
              role="button"
              aria-label="Τι κάνει"
              onClick={(e) => {
                e.stopPropagation();
                setShowTip((v) => !v);
              }}
              className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-red-950/40 text-[10px] leading-none text-red-950/80"
            >
              i
            </span>
          </button>
          {showTip ? (
            <div className="absolute right-0 top-[calc(100%+8px)] z-10 w-64 rounded-xl border border-[#24405f] bg-[#0c1424] p-3 text-[12px] leading-[1.55] text-zinc-300 shadow-xl">
              Τροφοδοτείται από όλα τα θέματα και προτείνει πώς να αλλάξεις τους όρους της ημέρας υπέρ σου: ποιο να ανεβάσεις, πώς να συνδέσεις γεγονότα, ποια η πρώτη κίνηση.
            </div>
          ) : null}
        </div>
      </div>

      {architectError ? (
        <div className="mb-4 rounded-2xl border border-red-300/25 bg-red-300/10 p-3 text-[12px] leading-6 text-red-100">
          {architectError}
        </div>
      ) : null}
      {archText ? (
        <div className="mb-4 rounded-3xl border border-red-400/20 bg-black/25 p-4">
          <div className="text-[10px] tracking-[0.2em] text-zinc-500">
            {architectResult?.title || "ΣΤΡΑΤΗΓΙΚΗ ΑΝΑΔΙΑΤΑΞΗ ΗΜΕΡΑΣ"}
          </div>
          <p className="mt-2 whitespace-pre-line text-[13px] leading-7 text-zinc-200">{archText}</p>
          <button
            type="button"
            onClick={onContinueArchitect}
            className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-[11px] font-medium text-cyan-100 transition hover:bg-cyan-300/15"
          >
            Συνέχισε στο Advisor Chat
          </button>
        </div>
      ) : null}

      <div className="mb-1 rounded-2xl border border-[#1a2640] bg-[#080f1c] p-4">
        {synLoading ? (
          <div className="text-[12px] text-zinc-500">Ο Noraya διαβάζει το πεδίο…</div>
        ) : (
          <p className="text-[12.5px] leading-[1.65] text-zinc-300">{synopsis || "—"}</p>
        )}
      </div>

      {high.length ? (
        <>
          <div className="mb-1 mt-4 text-[10px] tracking-[0.08em] text-red-300">ΨΗΛΑ ΣΤΗΝ ΑΤΖΕΝΤΑ</div>
          {high.map((t) => (
            <ThemeRow key={t.topic} t={t} />
          ))}
        </>
      ) : null}
      {mid.length ? (
        <>
          <div className="mb-1 mt-4 text-[10px] tracking-[0.08em] text-amber-300">ΣΤΟ ΜΕΣΟ</div>
          {mid.map((t) => (
            <ThemeRow key={t.topic} t={t} />
          ))}
        </>
      ) : null}
      {low.length ? (
        <>
          <div className="mb-1 mt-4 text-[10px] tracking-[0.08em] text-cyan-300">ΑΝΕΡΧΟΜΕΝΑ / ΧΑΜΗΛΑ</div>
          {low.map((t) => (
            <ThemeRow key={t.topic} t={t} />
          ))}
        </>
      ) : null}

      {!themes.length ? (
        <div className="mt-2 text-[12px] text-zinc-500">
          Δεν υπάρχουν διαθέσιμες θεματικές αυτή τη στιγμή.
        </div>
      ) : null}
    </section>
  );
}
