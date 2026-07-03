"use client";

import { useEffect, useMemo, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import SaveToArchiveButton from "../../components/SaveToArchiveButton";
import TopNav from "../../components/TopNav";
import { buildAgendaMap, type ProbeV4Response, type AgendaMapItem } from "../../lib/noraya/strategy-room-intelligence";
import { IBM_Plex_Sans } from "next/font/google";

const plex = IBM_Plex_Sans({ subsets: ["greek", "latin"], weight: ["400", "500", "600", "700"], display: "swap" });

type Foresight = { label: string; path: string; probability: number; rationale: string; signals: string[]; window: string };
type Move = { label: string; move: string; best_for_path: string; upside: string; downside: string; who_gains: string; who_loses: string; opponent_counter: string; risk: string };
type Scenarios = {
  situation: { headline: string; where_it_stands: string };
  foresight: Foresight[];
  moves: Move[];
  connection: string;
  recommendation: { move_label: string; because: string; watch: string[] };
};

// Ένα γεγονός μέσα σε μια θεματική (επίπεδο 2)
type AgendaEventItem = {
  id: string;
  title: string;
  score: number;
};
// Μια θεματική (επίπεδο 1) που ανοίγει σε γεγονότα
type AgendaThemeItem = {
  clusterId: string;
  topic: string;
  score: number;
  events: AgendaEventItem[];
};

function num(v: unknown, f = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : f;
}

function pathMeta(path: string): { label: string; color: string; glyph: string } {
  const p = String(path || "").toLowerCase();
  if (p === "escalate") return { label: "Κλιμάκωση", color: "#f87171", glyph: "▲" };
  if (p === "deescalate") return { label: "Εκτόνωση", color: "#34d399", glyph: "▼" };
  if (p === "pivot") return { label: "Στροφή", color: "#fbbf24", glyph: "↘" };
  return { label: "Λίμνασμα", color: "#64748b", glyph: "—" };
}

function riskMeta(risk: string): { label: string; cls: string } {
  const r = String(risk || "").toLowerCase();
  if (r === "high") return { label: "Υψηλό ρίσκο", cls: "text-red-200 border-red-400/40 bg-red-400/10" };
  if (r === "medium") return { label: "Μεσαίο ρίσκο", cls: "text-amber-200 border-amber-300/30 bg-amber-300/10" };
  return { label: "Χαμηλό ρίσκο", cls: "text-emerald-200 border-emerald-300/25 bg-emerald-300/10" };
}

// ---------- EXPORT PDF (designed, branded) ----------
function escHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function pdfPathColor(path: string): string {
  const p = String(path || "").toLowerCase();
  if (p === "escalate") return "#dc2626";
  if (p === "deescalate") return "#059669";
  if (p === "pivot") return "#d97706";
  return "#475569";
}
function pdfRisk(risk: string): { label: string; bg: string; fg: string } {
  const r = String(risk || "").toLowerCase();
  if (r === "high") return { label: "Υψηλό ρίσκο", bg: "#fee2e2", fg: "#b91c1c" };
  if (r === "medium") return { label: "Μεσαίο ρίσκο", bg: "#fef3c7", fg: "#b45309" };
  return { label: "Χαμηλό ρίσκο", bg: "#d1fae5", fg: "#047857" };
}

function exportScenarioPdf(sc: Scenarios, partyLabel: string, title: string) {
  if (!sc) return;
  const today = new Date().toLocaleDateString("el-GR", { day: "2-digit", month: "long", year: "numeric" });

  const foresightHtml = (sc.foresight || [])
    .map((f) => {
      const c = pdfPathColor(f.path);
      const prob = Math.max(0, Math.min(100, Math.round(num(f.probability))));
      const pm = pathMeta(f.path);
      const signals =
        Array.isArray(f.signals) && f.signals.length
          ? `<ul class="sig">${f.signals.map((x) => `<li>${escHtml(x)}</li>`).join("")}</ul>`
          : "";
      return `
      <div class="fc" style="border-left-color:${c}">
        <div class="fc-top">
          <span class="fc-label" style="color:${c}">${escHtml(pm.label)}</span>
          <span class="fc-prob" style="color:${c}">${prob}%</span>
        </div>
        <div class="bar"><span style="width:${prob}%;background:${c}"></span></div>
        ${f.window ? `<div class="win">Παράθυρο: ${escHtml(f.window)}</div>` : ""}
        <p class="rat">${escHtml(f.rationale)}</p>
        ${signals}
      </div>`;
    })
    .join("");

  const movesHtml = (sc.moves || [])
    .map((mv) => {
      const rk = pdfRisk(mv.risk);
      const pm = pathMeta(mv.best_for_path);
      return `
      <div class="mv">
        <div class="mv-top">
          <span class="mv-label">${escHtml(mv.label)}</span>
          <span class="risk" style="background:${rk.bg};color:${rk.fg}">${rk.label}</span>
        </div>
        ${mv.best_for_path ? `<div class="mv-fit">Ταιριάζει αν: <b style="color:${pdfPathColor(mv.best_for_path)}">${escHtml(pm.label)}</b></div>` : ""}
        ${mv.upside ? `<div class="kv"><span class="k up">Κέρδος</span><span class="v">${escHtml(mv.upside)}</span></div>` : ""}
        ${mv.downside ? `<div class="kv"><span class="k dn">Κόστος</span><span class="v">${escHtml(mv.downside)}</span></div>` : ""}
        ${mv.who_gains ? `<div class="kv"><span class="k">Κερδίζει</span><span class="v">${escHtml(mv.who_gains)}</span></div>` : ""}
        ${mv.who_loses ? `<div class="kv"><span class="k">Χάνει</span><span class="v">${escHtml(mv.who_loses)}</span></div>` : ""}
        ${mv.opponent_counter ? `<div class="kv"><span class="k">Αντίδραση αντιπάλου</span><span class="v">${escHtml(mv.opponent_counter)}</span></div>` : ""}
      </div>`;
    })
    .join("");

  const watchHtml =
    Array.isArray(sc.recommendation?.watch) && sc.recommendation.watch.length
      ? `<div class="watch"><div class="watch-t">Τι να παρακολουθείς</div><ul>${sc.recommendation.watch
          .map((w) => `<li>${escHtml(w)}</li>`)
          .join("")}</ul></div>`
      : "";

  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8">
<title>${escHtml(title)} — Noraya</title>
<style>
@page { size: A4; margin: 15mm 14mm 18mm; }
* { box-sizing: border-box; }
html,body { margin:0; padding:0; }
body { font-family: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif; color:#0c1220; background:#fff;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; font-size:11px; line-height:1.55; }
.wrap { max-width: 720px; margin: 0 auto; }
header { display:flex; align-items:flex-end; justify-content:space-between; border-bottom:2px solid #06b6d4; padding-bottom:10px; }
.brand { font-size:20px; font-weight:700; letter-spacing:.14em; color:#0c1220; }
.brand small { display:block; font-size:8px; letter-spacing:.28em; color:#0891b2; font-weight:600; margin-top:2px; }
.meta { text-align:right; font-size:9px; color:#475569; }
.meta b { color:#0c1220; font-size:11px; }
.kicker { text-transform:uppercase; letter-spacing:.18em; font-size:8.5px; color:#0891b2; font-weight:700; margin:18px 0 4px; }
h1 { font-size:18px; margin:0 0 4px; color:#0c1220; }
.stand { font-size:11.5px; color:#334155; margin:0 0 4px; }
.section-t { font-size:12px; font-weight:700; color:#0c1220; margin:20px 0 8px; padding-bottom:4px; border-bottom:1px solid #e2e8f0; }
.fgrid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
.fc { border:1px solid #e2e8f0; border-left:3px solid #475569; border-radius:8px; padding:9px 10px; background:#f8fafc; page-break-inside:avoid; }
.fc-top { display:flex; justify-content:space-between; align-items:center; }
.fc-label { font-weight:700; font-size:11px; }
.fc-prob { font-weight:700; font-size:13px; }
.bar { height:5px; border-radius:3px; background:#e2e8f0; margin:6px 0; overflow:hidden; }
.bar span { display:block; height:100%; }
.win { font-size:8.5px; color:#64748b; margin-bottom:4px; }
.rat { font-size:9.5px; color:#334155; margin:4px 0 0; }
.sig { margin:5px 0 0; padding-left:14px; }
.sig li { font-size:8.5px; color:#475569; margin-bottom:1px; }
.connection { background:#f1f5f9; border-radius:8px; padding:11px 13px; font-size:11px; color:#1e293b; }
.mv { border:1px solid #e2e8f0; border-radius:9px; padding:11px 13px; margin-bottom:9px; page-break-inside:avoid; }
.mv-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
.mv-label { font-weight:700; font-size:12px; color:#0c1220; }
.risk { font-size:8px; font-weight:700; padding:2px 8px; border-radius:999px; }
.mv-fit { font-size:9px; color:#64748b; margin-bottom:6px; }
.kv { display:flex; gap:8px; margin:3px 0; font-size:9.5px; }
.kv .k { flex:0 0 92px; font-weight:600; color:#64748b; }
.kv .k.up { color:#047857; } .kv .k.dn { color:#b91c1c; }
.kv .v { color:#334155; }
.rec { background:linear-gradient(180deg,#ecfeff,#fff); border:1.5px solid #06b6d4; border-radius:11px; padding:15px 17px; margin-top:8px; page-break-inside:avoid; }
.rec-k { text-transform:uppercase; letter-spacing:.16em; font-size:8.5px; color:#0891b2; font-weight:700; }
.rec-m { font-size:17px; font-weight:700; color:#0c1220; margin:3px 0 5px; }
.rec-b { font-size:11px; color:#334155; margin:0; }
.watch { margin-top:10px; }
.watch-t { font-size:8.5px; color:#0891b2; font-weight:700; }
.watch ul { margin:4px 0 0; padding-left:15px; }
.watch li { font-size:9.5px; color:#334155; margin-bottom:2px; }
footer { margin-top:16px; border-top:1px solid #e2e8f0; padding-top:7px; font-size:8px; color:#94a3b8; display:flex; justify-content:space-between; }
</style></head>
<body><div class="wrap">
  <header>
    <div class="brand">NORAYA<small>POLITICAL INTELLIGENCE</small></div>
    <div class="meta"><b>${escHtml(partyLabel)}</b><br>Ανάλυση Σεναρίων<br>${escHtml(today)}</div>
  </header>

  <div class="kicker">Πού στέκεται</div>
  <h1>${escHtml(sc.situation?.headline)}</h1>
  <p class="stand">${escHtml(sc.situation?.where_it_stands)}</p>

  <div class="section-t">Πιθανές εξελίξεις</div>
  <div class="fgrid">${foresightHtml}</div>

  ${sc.connection ? `<div class="section-t">Ο συλλογισμός</div><div class="connection">${escHtml(sc.connection)}</div>` : ""}

  <div class="section-t">Πιθανές κινήσεις</div>
  ${movesHtml}

  <div class="section-t">Η σύσταση</div>
  <div class="rec">
    <div class="rec-k">Προτεινόμενη κίνηση</div>
    <div class="rec-m">${escHtml(sc.recommendation?.move_label)}</div>
    <p class="rec-b">${escHtml(sc.recommendation?.because)}</p>
    ${watchHtml}
  </div>

  <footer><span>Noraya — Εμπιστευτικό · Στρατηγική ανάλυση</span><span>${escHtml(today)}</span></footer>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},350);};</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Επέτρεψε τα pop-ups για να γίνει export σε PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}

function scenarioToText(sc: Scenarios): string {
  const lines: string[] = [];
  if (sc?.situation?.headline) lines.push(sc.situation.headline);
  if (sc?.situation?.where_it_stands) lines.push("", "Πού στέκεται:", sc.situation.where_it_stands);
  if (Array.isArray(sc?.foresight) && sc.foresight.length) {
    lines.push("", "Πιθανές εξελίξεις:");
    sc.foresight.forEach((f) => {
      lines.push(`• ${f.label} (${Math.round(num(f.probability))}%${f.window ? ", " + f.window : ""})`);
      if (f.rationale) lines.push(`  ${f.rationale}`);
    });
  }
  if (sc?.connection) lines.push("", "Σύνδεση:", sc.connection);
  if (Array.isArray(sc?.moves) && sc.moves.length) {
    lines.push("", "Κινήσεις:");
    sc.moves.forEach((mv) => {
      lines.push(`• ${mv.label}: ${mv.move}`);
      if (mv.upside) lines.push(`  Κέρδος: ${mv.upside}`);
      if (mv.downside) lines.push(`  Ρίσκο: ${mv.downside}`);
    });
  }
  if (sc?.recommendation) {
    lines.push("", "Πρόταση:", sc.recommendation.move_label || "");
    if (sc.recommendation.because) lines.push(sc.recommendation.because);
    if (Array.isArray(sc.recommendation.watch) && sc.recommendation.watch.length) {
      lines.push("Πρόσεχε:");
      sc.recommendation.watch.forEach((w) => lines.push(`• ${w}`));
    }
  }
  return lines.join("\n").trim();
}

export default function ScenariosPage() {
  // Θεματικές (επίπεδο 1) από τον Χάρτη ατζέντας (agenda-probe), ίδια σειρά/score με το «Σήμερα».
  const [themes, setThemes] = useState<AgendaThemeItem[]>([]);
  const [party, setParty] = useState("elas");
  const [partyLabel, setPartyLabel] = useState("ΕΛΑΣ");
  const [loadingList, setLoadingList] = useState(true);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Scenarios | null>(null);
  const [generating, setGenerating] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [customLink, setCustomLink] = useState("");
  const [customFiles, setCustomFiles] = useState<{ name: string; media_type: string; data: string }[]>([]);
  const [mode, setMode] = useState<"event" | "custom">("event");

  useEffect(() => {
    (async () => {
      let pk = "elas";
      try {
        const pr = await fetch("/api/onboarding", { cache: "no-store" });
        if (pr.ok) {
          const pj = await pr.json();
          if (pj?.party_key) pk = String(pj.party_key);
          if (pj?.party_name) setPartyLabel(String(pj.party_name));
        }
      } catch {
        /* default */
      }
      setParty(pk);
      // Πηγή = ο ΙΔΙΟΣ Χάρτης ατζέντας με το «Σήμερα»: agenda-probe → buildAgendaMap.
      try {
        const r = await fetch(
          `/api/situation-engine/agenda-probe?token=dev&hours=168&party=${encodeURIComponent(pk)}`,
          { cache: "no-store" }
        );
        if (r.ok) {
          const probe = (await r.json()) as ProbeV4Response;
          const map: AgendaMapItem[] = probe?.success ? buildAgendaMap(probe) : [];
          const built: AgendaThemeItem[] = map.slice(0, 12).map((item) => ({
            clusterId: item.id,
            topic: item.title,
            score: Math.round(num(item.score)),
            events: (item.events || [])
              .filter((ev) => ev.id) // χρειαζόμαστε event_id για την ανάλυση
              .map((ev) => ({
                id: String(ev.id),
                title: ev.title || item.title,
                score: Math.round(num(ev.event_score, item.score)),
              })),
          })).filter((t) => t.events.length > 0);
          setThemes(built);
        }
      } catch {
        /* ignore */
      }
      setLoadingList(false);
    })();
  }, []);

  // Το επιλεγμένο γεγονός (για τίτλο/headline στο panel).
  const selectedEvent = useMemo(() => {
    for (const t of themes) {
      const ev = t.events.find((e) => e.id === selectedEventId);
      if (ev) return { ...ev, topic: t.topic };
    }
    return null;
  }, [themes, selectedEventId]);

  async function generateCustom() {
    if (!customText && !customLink && customFiles.length === 0) {
      setErrMsg("Δώσε πρώτα δεδομένα (link, κείμενο ή αρχείο).");
      return;
    }
    setScenarios(null);
    setErrMsg(null);
    setGenerating(true);
    try {
      const r = await fetch(`/api/scenarios?token=dev&party=${encodeURIComponent(party)}&standalone=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_text: customText, custom_link: customLink, custom_files: customFiles }),
        cache: "no-store",
      });
      const j = await r.json();
      if (r.ok && j?.scenarios) {
        setScenarios(j.scenarios as Scenarios);
      } else {
        setErrMsg("Η ανάλυση δεν ολοκληρώθηκε. Δοκίμασε ξανά σε λίγο.");
      }
    } catch {
      setErrMsg("Κάτι πήγε στραβά στην ανάλυση. Δοκίμασε ξανά.");
    } finally {
      setGenerating(false);
    }
  }

  async function generate(eventId: string) {
    setScenarios(null);
    setErrMsg(null);
    setGenerating(true);
    try {
      const r = await fetch(`/api/scenarios?token=dev&party=${encodeURIComponent(party)}&event_id=${encodeURIComponent(eventId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_text: customText, custom_link: customLink, custom_files: customFiles }),
        cache: "no-store",
      });
      const j = await r.json();
      if (r.ok && j?.scenarios) {
        setScenarios(j.scenarios as Scenarios);
      } else if (j?.error === "event_not_found") {
        setErrMsg("Δεν υπάρχει ζωντανό γεγονός γι' αυτή την κατάσταση αυτή τη στιγμή.");
      } else if (j?.error === "ai_unavailable") {
        setErrMsg("Η ανάλυση σεναρίων δεν ολοκληρώθηκε. Δοκίμασε ξανά σε λίγο.");
      } else {
        setErrMsg("Κάτι πήγε στραβά στη δημιουργία σεναρίων. Δοκίμασε ξανά.");
      }
    } catch {
      setErrMsg("Πρόβλημα σύνδεσης. Δοκίμασε ξανά.");
    }
    setGenerating(false);
  }

  function pickEvent(eventId: string) {
    setSelectedEventId(eventId);
    setScenarios(null);
    setErrMsg(null);
  }

  return (
    <div className={`${plex.className} min-h-screen bg-[#060a14] text-zinc-200`}>
      <style>{`
        @keyframes scIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
        @keyframes scPulse{0%,100%{opacity:1}50%{opacity:.55}}
        @keyframes scFlow{from{stroke-dashoffset:120}to{stroke-dashoffset:0}}
      `}</style>

      <header className="sticky top-0 z-20 border-b border-[#101a30] bg-[#060a14]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-300 to-cyan-600" />
            <div>
              <div className="text-sm font-semibold tracking-wide text-zinc-100">NORAYA</div>
              <div className="text-[10px] tracking-wide text-zinc-600">Πολιτική ευφυΐα</div>
            </div>
          </div>
          <TopNav />
          <div className="rounded-2xl border border-[#1a2640] bg-[#0c1220] px-3 py-2 text-[11px] text-zinc-400">{partyLabel}</div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-8">
        <section className="mb-6">
          <div className="text-xs font-medium text-cyan-300/70">Δωμάτιο σεναρίων</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">Πού πάει — και τι κάνεις</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Διάλεξε θεματική από τον Χάρτη ατζέντας, άνοιξε το γεγονός. Ο Noraya προβλέπει πού μπορεί να πάει και προσομοιώνει κάθε κίνηση, ενωμένα σε έναν συλλογισμό για {partyLabel}.</p>
        </section>

        {/* Διακόπτης πηγής */}
        <div className="mb-5 inline-flex rounded-2xl border border-[#1a2640] bg-[#0c1220] p-1 text-xs">
          <button type="button" onClick={() => { setMode("event"); setScenarios(null); setErrMsg(null); }} className={`rounded-xl px-4 py-2 transition ${mode === "event" ? "bg-cyan-300/15 text-cyan-100" : "text-zinc-400 hover:text-zinc-200"}`}>Από τον Χάρτη ατζέντας</button>
          <button type="button" onClick={() => { setMode("custom"); setScenarios(null); setErrMsg(null); setSelectedEventId(null); }} className={`rounded-xl px-4 py-2 transition ${mode === "custom" ? "bg-cyan-300/15 text-cyan-100" : "text-zinc-400 hover:text-zinc-200"}`}>Τα δικά μου δεδομένα</button>
        </div>

        <div className={`grid gap-5 ${mode === "event" ? "lg:grid-cols-[340px_1fr]" : "grid-cols-1"}`}>
          {/* Picker: Χάρτης ατζέντας — θεματική → ανοίγει → γεγονότα (ίδιο με «Σήμερα») */}
          {mode === "event" ? (
          <aside className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-3">
            <div className="mb-2 px-1 text-xs font-medium text-zinc-400">Χάρτης ατζέντας</div>
            {loadingList ? (
              <div className="grid gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div>
            ) : themes.length === 0 ? (
              <div className="px-1 py-6 text-center text-xs text-zinc-500">Καμία ενεργή θεματική αυτή τη στιγμή.</div>
            ) : (
              <div className="grid max-h-[72vh] gap-2 overflow-y-auto pr-1">
                {themes.map((t, i) => {
                  const tone = t.score >= 70 ? "red" : t.score >= 50 ? "amber" : "emerald";
                  const priorityLabel = t.score >= 70 ? "Υψηλή" : t.score >= 50 ? "Μεσαία" : "Χαμηλή";
                  const isExpanded = expandedTopic === t.topic;
                  const hasActiveChild = t.events.some((e) => e.id === selectedEventId);
                  return (
                    <div
                      key={`${t.clusterId}-${i}`}
                      className={`overflow-hidden rounded-2xl border transition ${
                        hasActiveChild ? "border-cyan-300/40 bg-cyan-300/[0.06]" : "border-[#162236] bg-[#0a0f1c]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedTopic((prev) => (prev === t.topic ? null : t.topic))}
                        className="group flex w-full items-center gap-2 p-3 text-left transition hover:bg-cyan-300/[0.04]"
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                          tone === "red" ? "border-red-400/40 bg-red-400/15 text-red-200"
                          : tone === "amber" ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
                          : "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                        }`}>{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-xs font-medium leading-5 text-zinc-200 group-hover:text-cyan-100">{t.topic}</div>
                          <div className={`mt-0.5 text-[10px] ${tone === "red" ? "text-red-300/80" : tone === "amber" ? "text-amber-300/80" : "text-emerald-300/80"}`}>
                            {priorityLabel} · {t.events.length} {t.events.length === 1 ? "γεγονός" : "γεγονότα"}
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] text-zinc-500">{isExpanded ? "▾" : "▸"}</span>
                      </button>
                      {isExpanded ? (
                        <div className="grid gap-1 border-t border-[#162236] px-2 pb-2 pt-2">
                          {t.events.map((ev) => {
                            const selected = ev.id === selectedEventId;
                            return (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => pickEvent(ev.id)}
                                className={`rounded-xl px-2 py-1.5 text-left text-[11px] leading-4 transition ${
                                  selected ? "bg-cyan-300/15 text-cyan-100" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                                }`}
                              >
                                <span className="line-clamp-2">{ev.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
          ) : null}

          {/* Reasoning panel */}
          <section>
            {(mode === "event" && !selectedEvent) ? (
              <div className="flex h-full min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-[#1a2640] bg-[#0a0f1c]/50 p-8 text-center text-sm text-zinc-500">
                Διάλεξε θεματική από αριστερά, άνοιξέ τη και επίλεξε γεγονός για να δεις πιθανές εξελίξεις και κινήσεις.
              </div>
            ) : !scenarios && !generating && !errMsg ? (
              mode === "custom" ? (
              <div className="rounded-3xl border border-[#1a2640] bg-gradient-to-b from-[#0d1525] to-[#0a0f1c] p-8">
                <div className="text-[11px] uppercase tracking-wide text-cyan-300/70">Τα δικά μου δεδομένα</div>
                <h2 className="mt-1 text-2xl font-semibold text-zinc-50">Ανάλυση από δικά σου στοιχεία</h2>
                <p className="mt-3 max-w-xl text-sm text-zinc-400">Ανέβασε ή επικόλλησε δημοσκόπηση, non-paper, link ή οποιαδήποτε πληροφορία. Ο Noraya θα κάνει σύνθετη στρατηγική ανάλυση για {partyLabel} — χωρίς να διαλέξεις θέμα.</p>
                <CustomInputs
                  customLink={customLink}
                  setCustomLink={setCustomLink}
                  customText={customText}
                  setCustomText={setCustomText}
                  customFiles={customFiles}
                  setCustomFiles={setCustomFiles}
                />
                <button type="button" onClick={generateCustom} className="mt-5 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/20">
                  ▶ Ανάλυσε από τα δεδομένα μου
                </button>
              </div>
              ) : (
              <div className="rounded-3xl border border-[#1a2640] bg-gradient-to-b from-[#0d1525] to-[#0a0f1c] p-8">
                <div className="text-[11px] text-zinc-500">{selectedEvent?.topic}</div>
                <h2 className="mt-1 text-2xl font-semibold text-zinc-50">{selectedEvent?.title}</h2>
                <p className="mt-3 max-w-xl text-sm text-zinc-400">Ο Noraya θα προβλέψει 2-3 πιθανές εξελίξεις και θα προσομοιώσει τις κινήσεις σου, με βάση τα πραγματικά στοιχεία του γεγονότος και το προφίλ σου.</p>

                <button type="button" onClick={() => selectedEvent && generate(selectedEvent.id)} className="mt-5 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/20">
                  ▶ Ανάλυσε σενάρια
                </button>
              </div>
              )
            ) : generating ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl border border-cyan-300/20 bg-[#0a0f1c] p-8 text-center">
                <div className="mb-4 flex gap-1.5">
                  {[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-cyan-300" style={{ animation: "scPulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />)}
                </div>
                <div className="text-sm text-zinc-300">Χτίζω τα σενάρια…</div>
                <div className="mt-1 text-[11px] text-zinc-600">Προβλέψεις, προσομοίωση κινήσεων, σύσταση</div>
              </div>
            ) : errMsg ? (
              <div className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-8 text-center">
                <div className="text-sm text-zinc-300">{errMsg}</div>
                <button type="button" onClick={() => selectedEvent && generate(selectedEvent.id)} className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs text-cyan-100 transition hover:bg-cyan-300/20">Δοκίμασε ξανά</button>
              </div>
            ) : scenarios ? (
              <div className="grid gap-5">
                {/* Export PDF */}
                <div className="flex items-center justify-end gap-2">
                  <SaveToArchiveButton
                    kind="scenario"
                    content={scenarioToText(scenarios)}
                    defaultTitle={scenarios.situation?.headline || "Ανάλυση Σεναρίων"}
                    eventTitle={selectedEvent?.title || scenarios.situation?.headline || null}
                    eventId={selectedEventId}
                  />
                  <button
                    type="button"
                    onClick={() => exportScenarioPdf(scenarios, partyLabel, scenarios.situation?.headline || "Ανάλυση Σεναρίων")}
                    className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/20"
                  >
                    ⬇ Export PDF
                  </button>
                </div>
                {/* Where it stands */}
                <div className="rounded-3xl border border-[#1a2640] bg-gradient-to-b from-[#0d1525] to-[#0a0f1c] p-5" style={{ animation: "scIn .4s ease both" }}>
                  <div className="text-[11px] uppercase tracking-wide text-cyan-300/60">Πού στέκεται</div>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-50">{scenarios.situation.headline}</h2>
                  <p className="mt-1.5 text-sm leading-6 text-zinc-300">{scenarios.situation.where_it_stands}</p>
                </div>

                {/* Foresight */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-200">Πιθανές εξελίξεις</h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    {scenarios.foresight.map((f, i) => {
                      const m = pathMeta(f.path);
                      const prob = Math.max(0, Math.min(100, Math.round(num(f.probability))));
                      return (
                        <div key={i} className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-4" style={{ animation: "scIn .45s ease both", animationDelay: `${i * 80}ms` }}>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: m.color }}>
                              <span>{m.glyph}</span> {f.label || m.label}
                            </span>
                            <span className="text-sm font-semibold text-zinc-200">{prob}%</span>
                          </div>
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                            <div className="h-full rounded-full" style={{ background: m.color, width: `${prob}%`, transformOrigin: "left", animation: "scBar .9s ease forwards" }} />
                          </div>
                          <p className="mt-3 text-[12px] leading-5 text-zinc-300">{f.rationale}</p>
                          {Array.isArray(f.signals) && f.signals.length > 0 ? (
                            <div className="mt-3 grid gap-1">
                              {f.signals.slice(0, 4).map((sig, k) => (
                                <div key={k} className="flex items-start gap-1.5 text-[11px] text-zinc-400">
                                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ background: m.color }} />
                                  <span>{sig}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {f.window ? <div className="mt-3 inline-block rounded-full border border-[#243049] bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400">Παράθυρο: {f.window}</div> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Connection */}
                <div className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.04] p-5" style={{ animation: "scIn .5s ease both" }}>
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-cyan-300/70">
                    <svg width="46" height="12" viewBox="0 0 46 12"><line x1="2" y1="6" x2="44" y2="6" stroke="#22d3ee" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" style={{ animation: "scFlow 1.2s linear" }} /><polygon points="40,2 46,6 40,10" fill="#22d3ee" /></svg>
                    Ο συλλογισμός: από το «πού πάει» στο «τι κάνεις»
                  </div>
                  <p className="mt-2 text-[13px] leading-6 text-zinc-100">{scenarios.connection}</p>
                </div>

                {/* Moves */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-200">Αν κάνεις…</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {scenarios.moves.map((mv, i) => {
                      const pm = pathMeta(mv.best_for_path);
                      const rk = riskMeta(mv.risk);
                      return (
                        <div key={i} className="rounded-2xl border border-[#1a2640] bg-[#0c1220] p-4" style={{ animation: "scIn .45s ease both", animationDelay: `${i * 70}ms` }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-[15px] font-semibold text-zinc-50">{mv.label}</div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${rk.cls}`}>{rk.label}</span>
                          </div>
                          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: pm.color + "55", color: pm.color }}>
                            <span>{pm.glyph}</span> Ταιριάζει αν: {pm.label}
                          </div>
                          <Row tone="emerald" label="Κέρδος" text={mv.upside} />
                          <Row tone="red" label="Κόστος" text={mv.downside} />
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded-xl bg-white/[0.03] px-2 py-1.5"><div className="text-zinc-600">Κερδίζει</div><div className="mt-0.5 text-zinc-300">{mv.who_gains}</div></div>
                            <div className="rounded-xl bg-white/[0.03] px-2 py-1.5"><div className="text-zinc-600">Χάνει</div><div className="mt-0.5 text-zinc-300">{mv.who_loses}</div></div>
                          </div>
                          <div className="mt-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-2 py-1.5 text-[11px]">
                            <div className="text-amber-300/70">Η αντίδραση του αντιπάλου</div>
                            <div className="mt-0.5 text-zinc-300">{mv.opponent_counter}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recommendation */}
                <div className="rounded-3xl border border-cyan-300/30 bg-gradient-to-b from-cyan-300/[0.08] to-[#0a0f1c] p-6" style={{ animation: "scIn .55s ease both" }}>
                  <div className="text-[11px] uppercase tracking-wide text-cyan-300/70">Η σύστασή μου</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-50">{scenarios.recommendation.move_label}</div>
                  <p className="mt-2 text-sm leading-6 text-zinc-200">{scenarios.recommendation.because}</p>
                  {Array.isArray(scenarios.recommendation.watch) && scenarios.recommendation.watch.length > 0 ? (
                    <div className="mt-4">
                      <div className="text-[11px] text-cyan-300/60">Τι να παρακολουθείς</div>
                      <div className="mt-1.5 grid gap-1">
                        {scenarios.recommendation.watch.map((w, i) => (
                          <div key={i} className="flex items-start gap-2 text-[12px] text-zinc-300"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-300" />{w}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <button type="button" onClick={() => selectedEvent && generate(selectedEvent.id)} className="mt-5 rounded-xl border border-[#243049] bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-400 transition hover:text-zinc-200">↻ Νέα ανάλυση</button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}

function CustomInputs(props: {
  customLink: string;
  setCustomLink: Dispatch<SetStateAction<string>>;
  customText: string;
  setCustomText: Dispatch<SetStateAction<string>>;
  customFiles: { name: string; media_type: string; data: string }[];
  setCustomFiles: Dispatch<SetStateAction<{ name: string; media_type: string; data: string }[]>>;
}): ReactNode {
  const { customLink, setCustomLink, customText, setCustomText, customFiles, setCustomFiles } = props;
  return (
                <div className="mt-5 rounded-2xl border border-[#1a2640] bg-[#0a0f1c]/60 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-cyan-300/60">Δικά μου στοιχεία (προαιρετικά)</div>
                  <p className="mt-1 text-[12px] text-zinc-500">Δώσε δική σου δημοσκόπηση/ανάλυση και το σενάριο θα θεμελιωθεί σε αυτά.</p>
                  <input
                    type="url"
                    value={customLink}
                    onChange={(e) => setCustomLink(e.target.value)}
                    placeholder="Link ανάλυσης/δημοσκόπησης (π.χ. εφημερίδα)"
                    className="mt-3 w-full rounded-xl border border-[#243049] bg-[#0c1220] px-3 py-2 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-cyan-300/40"
                  />
                  <textarea
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="Ή επικόλλησε εδώ τα στοιχεία/ευρήματα (ποσοστά, συμπεράσματα, κείμενο δημοσκόπησης)…"
                    rows={4}
                    className="mt-2 w-full rounded-xl border border-[#243049] bg-[#0c1220] px-3 py-2 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-cyan-300/40"
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <label className="cursor-pointer rounded-lg border border-[#243049] bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-300 transition hover:text-zinc-100">
                      📎 CSV/TXT
                      <input
                        type="file"
                        accept=".csv,.txt,text/csv,text/plain"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            const txt = String(reader.result || "").slice(0, 8000);
                            setCustomText((prev) => (prev ? prev + "\n\n" : "") + `[${f.name}]\n` + txt);
                          };
                          reader.readAsText(f);
                        }}
                      />
                    </label>
                    <label className="cursor-pointer rounded-lg border border-[#243049] bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-300 transition hover:text-zinc-100">
                      🖼️ PDF / Εικόνα δημοσκόπησης
                      <input
                        type="file"
                        accept=".pdf,application/pdf,image/png,image/jpeg,image/webp"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          files.forEach((f: File) => {
                            if (f.size > 4_000_000) {
                              alert(`Το «${f.name}» είναι >4MB. Δοκίμασε μικρότερο αρχείο/εικόνα.`);
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                              const result = String(reader.result || "");
                              const base64 = result.includes(",") ? result.split(",")[1] : "";
                              if (!base64) return;
                              const mt = f.type || (f.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
                              setCustomFiles((prev) => [...prev, { name: f.name, media_type: mt, data: base64 }].slice(0, 3));
                            };
                            reader.readAsDataURL(f);
                          });
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {(customText || customLink || customFiles.length) ? (
                      <button type="button" onClick={() => { setCustomText(""); setCustomLink(""); setCustomFiles([]); }} className="text-[11px] text-zinc-500 transition hover:text-zinc-300">Καθαρισμός</button>
                    ) : null}
                  </div>
                  {customFiles.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {customFiles.map((cf, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[11px] text-cyan-100">
                          {cf.media_type === "application/pdf" ? "📄" : "🖼️"} {cf.name}
                          <button type="button" onClick={() => setCustomFiles((prev) => prev.filter((_, j) => j !== i))} className="text-cyan-300/60 hover:text-cyan-100">✕</button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 text-[10px] text-zinc-600">Υποστηρίζονται: link, κείμενο, CSV/TXT, και PDF/εικόνα δημοσκόπησης (το AI τα διαβάζει). Για Excel: αποθήκευσε ως CSV ή κάνε copy-paste.</p>
                </div>
  );
}

function Row({ tone, label, text }: { tone: "emerald" | "red"; label: string; text: string }): ReactNode {
  const cls = tone === "emerald" ? "text-emerald-300/80" : "text-red-300/80";
  const dot = tone === "emerald" ? "#34d399" : "#f87171";
  return (
    <div className="mt-2 flex items-start gap-2 text-[12px]">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
      <span className={`shrink-0 ${cls}`}>{label}:</span>
      <span className="text-zinc-300">{text}</span>
    </div>
  );
}
