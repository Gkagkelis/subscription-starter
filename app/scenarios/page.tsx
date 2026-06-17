"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { IBM_Plex_Sans } from "next/font/google";

const plex = IBM_Plex_Sans({ subsets: ["greek", "latin"], weight: ["400", "500", "600", "700"], display: "swap" });

type Situation = Record<string, unknown>;

type Foresight = { label: string; path: string; probability: number; rationale: string; signals: string[]; window: string };
type Move = { label: string; move: string; best_for_path: string; upside: string; downside: string; who_gains: string; who_loses: string; opponent_counter: string; risk: string };
type Scenarios = {
  situation: { headline: string; where_it_stands: string };
  foresight: Foresight[];
  moves: Move[];
  connection: string;
  recommendation: { move_label: string; because: string; watch: string[] };
};

const navTabs: { label: string; href: string | null }[] = [
  { label: "Σήμερα", href: "/strategy-room" },
  { label: "Ατζέντα", href: "/agenda" },
  { label: "Καταστάσεις", href: "/situations" },
  { label: "Σενάρια", href: "/scenarios" },
  { label: "Πρόσωπα", href: null },
  { label: "Αρχεία", href: null },
  { label: "Δεδομένα", href: null },
];

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

export default function ScenariosPage() {
  const [situations, setSituations] = useState<Situation[]>([]);
  const [party, setParty] = useState("elas");
  const [partyLabel, setPartyLabel] = useState("ΕΛΑΣ");
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Scenarios | null>(null);
  const [generating, setGenerating] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [customLink, setCustomLink] = useState("");

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
      try {
        const r = await fetch(`/api/situation-engine?token=dev&party=${encodeURIComponent(pk)}`, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j?.situations)) setSituations(j.situations as Situation[]);
        }
      } catch {
        /* ignore */
      }
      setLoadingList(false);
    })();
  }, []);

  const list = useMemo(
    () =>
      situations
        .map((s) => ({
          id: String(s["id"] ?? ""),
          title: String(s["title"] ?? s["topic"] ?? "Χωρίς τίτλο"),
          topic: String(s["topic"] ?? s["category"] ?? ""),
          score: Math.round(num(s["priority_score"] ?? s["strategic_index_score"] ?? s["event_score"])),
        }))
        .filter((s) => s.id)
        .sort((a, b) => b.score - a.score),
    [situations]
  );

  const selected = useMemo(() => list.find((s) => s.id === selectedId) || null, [list, selectedId]);

  async function generate(id: string) {
    setScenarios(null);
    setErrMsg(null);
    setGenerating(true);
    try {
      const r = await fetch(`/api/scenarios?token=dev&party=${encodeURIComponent(party)}&event_id=${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_text: customText, custom_link: customLink }),
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

  function pick(id: string) {
    setSelectedId(id);
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
          <nav className="flex items-center gap-1">
            {navTabs.map((tab) => {
              const active = tab.label === "Σενάρια";
              const base = "rounded-2xl px-3 py-2 text-xs transition";
              if (tab.href) {
                return (
                  <Link key={tab.label} href={tab.href} className={`${base} ${active ? "border border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"}`}>
                    {tab.label}
                  </Link>
                );
              }
              return <span key={tab.label} className={`${base} cursor-not-allowed text-zinc-700`}>{tab.label}</span>;
            })}
          </nav>
          <div className="rounded-2xl border border-[#1a2640] bg-[#0c1220] px-3 py-2 text-[11px] text-zinc-400">{partyLabel}</div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-8">
        <section className="mb-6">
          <div className="text-xs font-medium text-cyan-300/70">Δωμάτιο σεναρίων</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">Πού πάει — και τι κάνεις</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Διάλεξε μια κατάσταση. Ο Noraya προβλέπει πού μπορεί να πάει και προσομοιώνει κάθε κίνηση, ενωμένα σε έναν συλλογισμό για {partyLabel}.</p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          {/* Picker */}
          <aside className="rounded-3xl border border-[#1a2640] bg-[#0c1220] p-3">
            <div className="mb-2 px-1 text-xs font-medium text-zinc-400">Καταστάσεις</div>
            {loadingList ? (
              <div className="grid gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div>
            ) : list.length === 0 ? (
              <div className="px-1 py-6 text-center text-xs text-zinc-500">Καμία ενεργή κατάσταση αυτή τη στιγμή.</div>
            ) : (
              <div className="grid max-h-[70vh] gap-1.5 overflow-y-auto pr-1">
                {list.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pick(s.id)}
                    className={`rounded-2xl border p-2.5 text-left transition ${selectedId === s.id ? "border-cyan-300/40 bg-cyan-300/10" : "border-[#162236] bg-[#0a0f1c] hover:border-cyan-300/20 hover:bg-white/[0.03]"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] text-zinc-500">{s.topic || "—"}</span>
                      <span className="shrink-0 text-[10px] text-zinc-500">{s.score}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-4 text-zinc-100">{s.title}</div>
                  </button>
                ))}
              </div>
            )}
          </aside>

          {/* Reasoning panel */}
          <section>
            {!selected ? (
              <div className="flex h-full min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-[#1a2640] bg-[#0a0f1c]/50 p-8 text-center text-sm text-zinc-500">
                Διάλεξε μια κατάσταση από αριστερά για να δεις πιθανές εξελίξεις και κινήσεις.
              </div>
            ) : !scenarios && !generating && !errMsg ? (
              <div className="rounded-3xl border border-[#1a2640] bg-gradient-to-b from-[#0d1525] to-[#0a0f1c] p-8">
                <div className="text-[11px] text-zinc-500">{selected.topic}</div>
                <h2 className="mt-1 text-2xl font-semibold text-zinc-50">{selected.title}</h2>
                <p className="mt-3 max-w-xl text-sm text-zinc-400">Ο Noraya θα προβλέψει 2-3 πιθανές εξελίξεις και θα προσομοιώσει τις κινήσεις σου, με βάση τα πραγματικά στοιχεία του γεγονότος και το προφίλ σου.</p>

                {/* Δικά μου στοιχεία (Φάση 1: link + κείμενο/CSV) */}
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
                      📎 Ανέβασε CSV/TXT
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
                    {(customText || customLink) ? (
                      <button type="button" onClick={() => { setCustomText(""); setCustomLink(""); }} className="text-[11px] text-zinc-500 transition hover:text-zinc-300">Καθαρισμός</button>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[10px] text-zinc-600">PDF/Excel αρχεία & εικόνες δημοσκοπήσεων: έρχονται στη Φάση 2. Προς το παρόν, αντιγραφή-επικόλληση ή CSV/TXT.</p>
                </div>

                <button type="button" onClick={() => generate(selected.id)} className="mt-5 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/20">
                  ▶ Ανάλυσε σενάρια{(customText || customLink) ? " (με τα στοιχεία μου)" : ""}
                </button>
              </div>
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
                <button type="button" onClick={() => selected && generate(selected.id)} className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs text-cyan-100 transition hover:bg-cyan-300/20">Δοκίμασε ξανά</button>
              </div>
            ) : scenarios ? (
              <div className="grid gap-5">
                {/* Export PDF */}
                <div className="flex items-center justify-end">
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
                  <button type="button" onClick={() => selected && generate(selected.id)} className="mt-5 rounded-xl border border-[#243049] bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-400 transition hover:text-zinc-200">↻ Νέα ανάλυση</button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>
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
