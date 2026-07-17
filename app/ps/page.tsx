"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { districtByName } from "../../lib/noraya/electoral-districts";

// ============================================================
// NORAYA PS — COCKPIT (δυναμικο, ανα συνδεδεμενο χρηστη). Route: /ps

// Πραγματικη εθνικη + ΤΟΠΙΚΗ ατζεντα + πραγματικο AI.
// ============================================================

type Topic = { topic: string; score: number; change: number };
type LocalItem = { label: string; count: number; headlines: string[] };

const GREEN = "#22a45a";
const GREEN_L = "#4ade80";

function Card(props: { children: React.ReactNode; className?: string }) {
  return (
    <div className={"rounded-2xl border border-white/[0.07] bg-[#0e1626] p-5 " + (props.className || "")}>
      {props.children}
    </div>
  );
}

type Me = { name: string; party: string; district: string; phase: string };

export default function PsCockpit() {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [local, setLocal] = useState<LocalItem[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [daily, setDaily] = useState("");
  const [dailyLoading, setDailyLoading] = useState(true);
  const [plan, setPlan] = useState<{ day: string; move: string; why: string }[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [redTeam, setRedTeam] = useState<{ attacker: string; attack: string; response: string; risk_level: string }[]>([]);
  const [redTeamLoading, setRedTeamLoading] = useState(false);
  const [deliverables, setDeliverables] = useState<Record<string, { loading: boolean; text: string }>>({});

  const themeNames = useMemo(() => topics.slice(0, 8).map((t) => t.topic), [topics]);

  const daysToElection = useMemo(() => {
    const target = new Date("2026-11-08T00:00:00").getTime();
    return Math.max(0, Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24)));
  }, []);

  // Ποιος ειμαι (ονομα/κομμα/περιφερεια/φαση)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/onboarding", { cache: "no-store" });
        if (r.ok) {
          const pd = await r.json();
          setMe({
            name: String(pd?.representative_name || ""),
            party: String(pd?.party_key || ""),
            district: String(pd?.district || ""),
            phase: String(pd?.phase || ""),
          });
        }
      } catch {}
      finally { setMeLoading(false); }
    })();
  }, []);

  // Εθνικη ατζεντα (πραγματικη)
  useEffect(() => {
    if (meLoading) return;
    (async () => {
      try {
        const pk = me?.party || "";
        const r = await fetch(`/api/agenda/timeline?token=dev${pk ? "&party=" + encodeURIComponent(pk) : ""}`, { cache: "no-store" });
        const j = await r.json();
        const raw = Array.isArray(j?.topics) ? j.topics : [];
        const mapped: Topic[] = raw
          .map((t: any) => ({
            topic: String(t.topic || t.name || "—"),
            score: Math.round(Number(t.agenda_score ?? t.score ?? 0)) || 0,
            change: Math.round(Number(t.change_pct ?? t.change ?? 0)) || 0,
          }))
          .filter((t: Topic) => t.topic && t.topic !== "—")
          .sort((a: Topic, b: Topic) => b.score - a.score)
          .slice(0, 8);
        setTopics(mapped);
      } catch {
        setTopics([]);
      } finally {
        setAgendaLoading(false);
      }
    })();
  }, []);

  // Τοπικη ατζεντα (δυναμικη — φιλτραρισμενη ανα περιφερεια)
  useEffect(() => {
    if (meLoading || !me?.district) { if (!meLoading) setLocalLoading(false); return; }
    (async () => {
      try {
        const d = districtByName(me?.district || "");
        const qs = new URLSearchParams({ district: me?.district || "" });
        if (d?.search) qs.set("search", d.search);
        const r = await fetch(`/api/ps/local-news?${qs.toString()}`, { cache: "no-store" });
        const j = await r.json();
        // ps/local-news επιστρεφει {topics:[{label,count,headlines,...}]}
        setLocal(Array.isArray(j?.topics) ? j.topics : []);
      } catch {
        setLocal([]);
      } finally {
        setLocalLoading(false);
      }
    })();
  }, []);

  // AI ημερησια αναγνωση (αφου ερθουν εθνικα + τοπικα)
  useEffect(() => {
    if (agendaLoading || localLoading) return;
    (async () => {
      setDailyLoading(true);
      try {
        const r = await fetch("/api/ps/cockpit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "daily", themes: themeNames, local }),
        });
        const j = await r.json();
        setDaily(j?.text || "");
      } catch {
        setDaily("");
      } finally {
        setDailyLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaLoading, localLoading]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  async function postJson(bodyObj: any, ms = 45000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch("/api/ps/cockpit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
        signal: ctrl.signal,
      });
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  async function makeWeekPlan() {
    setPlanLoading(true);
    setPlanError("");
    try {
      const j = await postJson({ mode: "week", themes: themeNames, local });
      const days = Array.isArray(j?.plan) ? j.plan : [];
      setPlan(days);
      if (days.length === 0) setPlanError("Δεν βγηκε σχεδιο αυτη τη φορα — δοκιμασε ξανα.");
    } catch (e: any) {
      setPlan([]);
      setPlanError(e?.name === "AbortError" ? "Αργησε πολυ — δοκιμασε ξανα." : "Σφαλμα — δοκιμασε ξανα.");
    } finally {
      setPlanLoading(false);
    }
  }

  async function genRedTeam() {
    setRedTeamLoading(true);
    try {
      const r = await fetch("/api/ps/cockpit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "redteam", themes: themeNames, local }),
      });
      const j = await r.json();
      setRedTeam(Array.isArray(j?.red_team) ? j.red_team : []);
    } catch {
      setRedTeam([]);
    } finally {
      setRedTeamLoading(false);
    }
  }

  async function genDeliverable(label: string, headlines: string[], kind: "statement" | "post") {
    const key = label + "::" + kind;
    setDeliverables((d) => ({ ...d, [key]: { loading: true, text: "" } }));
    try {
      const r = await fetch("/api/ps/cockpit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "deliverable", topic: label, headlines, kind }),
      });
      const j = await r.json();
      setDeliverables((d) => ({ ...d, [key]: { loading: false, text: j?.text || "—" } }));
    } catch {
      setDeliverables((d) => ({ ...d, [key]: { loading: false, text: "Σφαλμα." } }));
    }
  }

  async function sendChat() {
    const q = input.trim();
    if (!q || chatLoading) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setInput("");
    setChatLoading(true);
    try {
      const r = await fetch("/api/ps/cockpit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat", question: q, themes: themeNames, local, history: next }),
      });
      const j = await r.json();
      setMessages([...next, { role: "assistant", content: j?.text || "…" }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Σφαλμα συνδεσης." }]);
    } finally {
      setChatLoading(false);
    }
  }

  function barColor(score: number) {
    if (score >= 68) return "#ef4444";
    if (score >= 45) return "#f59e0b";
    return "#22d3ee";
  }

  return (
    <div className="min-h-screen bg-[#060a14] text-zinc-100">
      <div className="mx-auto max-w-6xl px-5 py-6">
        {/* Identity */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl text-[15px] font-bold text-slate-950"
              style={{ background: GREEN }}
            >
              {(me?.name || "N").trim().charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-[17px] font-semibold">{me?.name || "—"}</div>
              <div className="text-[12px] text-zinc-400">
                Υποψηφιος/α Βουλευτης · <span style={{ color: GREEN_L }}>{me?.party || "—"}</span>{me?.district ? " · " + me.district : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[22px] font-bold" style={{ color: GREEN_L }}>
                {daysToElection}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">ημερες για εκλογες</div>
            </div>
            <div className="text-[11px] tracking-[0.15em] text-cyan-200/70">NORAYA</div>
          </div>
        </div>

        {/* AI daily read */}
        <Card className="mb-5">
          <div className="mb-2 text-[11px] tracking-[0.08em]" style={{ color: GREEN_L }}>
            Η ΜΑΧΗ ΣΟΥ ΣΗΜΕΡΑ
          </div>
          {dailyLoading ? (
            <div className="text-[13px] text-zinc-500">Ο Noraya διαβαζει τα τοπικα{me?.district ? " της " + me.district : ""}…</div>
          ) : (
            <p className="whitespace-pre-line text-[14px] leading-[1.7] text-zinc-200">{daily || "—"}</p>
          )}
        </Card>

        {/* ΤΟΠΙΚΗ ατζεντα (πρωταγωνιστης) */}
        <Card className="mb-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] tracking-[0.08em]" style={{ color: GREEN_L }}>
ΤΟΠΙΚΗ ΑΤΖΕΝΤΑ{me?.district ? " — " + me.district.toUpperCase() : ""}
            </div>
            <div className="text-[10px] text-zinc-500">πραγματικα τοπικα πρωτοσελιδα</div>
          </div>
          {localLoading ? (
            <div className="text-[13px] text-zinc-500">Φορτωση τοπικων ειδησεων…</div>
          ) : local.length === 0 ? (
            <div className="text-[13px] text-zinc-500">Δεν ηρθαν τοπικες ειδησεις αυτη τη στιγμη.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {local.map((l, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-[#0a1120] p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-[13px] font-semibold text-zinc-100">{l.label}</div>
                    <div
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: GREEN + "1f", color: GREEN_L }}
                    >
                      {l.count} ειδ.
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {l.headlines.map((h, k) => (
                      <li key={k} className="text-[11.5px] leading-snug text-zinc-400">
                        · {h}
                      </li>
                    ))}
                    {l.headlines.length === 0 && <li className="text-[11.5px] text-zinc-600">—</li>}
                  </ul>
                  <div className="mt-2.5 flex gap-2">
                    {(["statement", "post"] as const).map((kind) => (
                      <button
                        key={kind}
                        onClick={() => genDeliverable(l.label, l.headlines, kind)}
                        className="rounded-lg border px-2 py-1 text-[11px] font-medium transition"
                        style={{ borderColor: GREEN + "44", color: GREEN_L, background: GREEN + "10" }}
                      >
                        {kind === "statement" ? "Δηλωση" : "Ποστ"}
                      </button>
                    ))}
                  </div>
                  {(["statement", "post"] as const).map((kind) => {
                    const d = deliverables[l.label + "::" + kind];
                    if (!d) return null;
                    return (
                      <div key={kind} className="mt-2 rounded-lg border border-white/[0.07] bg-[#060c16] p-2.5">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wider" style={{ color: GREEN_L }}>
                            {kind === "statement" ? "Δηλωση" : "Ποστ"}
                          </span>
                          {!d.loading && d.text && (
                            <button
                              onClick={() => navigator.clipboard?.writeText(d.text)}
                              className="text-[10px] text-zinc-500 hover:text-zinc-300"
                            >
                              Αντιγραφη
                            </button>
                          )}
                        </div>
                        <div className="whitespace-pre-line text-[11.5px] leading-relaxed text-zinc-300">
                          {d.loading ? "Γραφεται…" : d.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
          {/* Εθνικη ατζεντα (context) */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] tracking-[0.08em] text-cyan-200/70">ΕΘΝΙΚΗ ΑΤΖΕΝΤΑ (πλαισιο) · 7 ημερες</div>
              <div className="text-[10px] text-zinc-500">πραγματικα δεδομενα</div>
            </div>
            {agendaLoading ? (
              <div className="text-[13px] text-zinc-500">Φορτωση ατζεντας…</div>
            ) : topics.length === 0 ? (
              <div className="text-[13px] text-zinc-500">Δεν ηρθαν δεδομενα.</div>
            ) : (
              <div className="space-y-2.5">
                {topics.map((t, i) => (
                  <div key={t.topic + i} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">{t.topic}</div>
                    <div className="h-[5px] w-[72px] shrink-0 overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: Math.min(100, t.score) + "%", background: barColor(t.score) }}
                      />
                    </div>
                    <div className="w-7 shrink-0 text-right text-[12px] font-semibold text-zinc-200">{t.score}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Σταυροδοσια */}
          <Card>
            <div className="mb-3 text-[11px] tracking-[0.08em]" style={{ color: GREEN_L }}>
              ΠΩΣ ΞΕΧΩΡΙΖΕΙΣ (ΣΤΑΥΡΟΔΟΣΙΑ)
            </div>
            <ul className="space-y-2.5 text-[13px] text-zinc-300">
              <li className="flex gap-2">
                <span style={{ color: GREEN_L }}>›</span> Παρε <b>δικη σου γραμμη</b> (π.χ. στεγαση &amp; νεοι) — να μη σε μπερδευουν με συνυποψηφιους.
              </li>
              <li className="flex gap-2">
                <span style={{ color: GREEN_L }}>›</span> <b>Τοπικη παρουσια</b>: γειτονιες Δυτικης &amp; κεντρου, οχι μονο πλατφορμες.
              </li>
              <li className="flex gap-2">
                <span style={{ color: GREEN_L }}>›</span> <b>Προσωπικο αφηγημα</b> δεμενο με τη γραμμη {me?.party ? "του " + me.party : "του κομματος σου"}.
              </li>
            </ul>
          </Card>
        </div>

        {/* Red Team (AI) */}
        <Card className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] tracking-[0.08em]" style={{ color: "#fca5a5" }}>
              RED TEAM — ΠΩΣ ΘΑ ΣΟΥ ΕΠΙΤΕΘΟΥΝ
            </div>
            <button
              onClick={genRedTeam}
              disabled={redTeamLoading}
              className="rounded-xl border border-red-300/30 bg-red-400/10 px-3 py-1.5 text-[12px] font-medium text-red-200 transition disabled:opacity-50"
            >
              {redTeamLoading ? "Αναλυει…" : redTeam.length ? "Ξανα" : "Δες τις επιθεσεις"}
            </button>
          </div>
          {redTeam.length === 0 ? (
            <div className="text-[13px] text-zinc-500">
              Πατα «Δες τις επιθεσεις» — ο Noraya βγαζει τις πιθανες επιθεσεις (συνυποψηφιοι ΙΔΙΟΥ κομματος + αντιπαλοι) με ετοιμη απαντηση.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {redTeam.map((rt, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-[#0a1120] p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-200">{rt.attacker}</span>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[9px] uppercase " +
                        (rt.risk_level === "high"
                          ? "bg-red-400/15 text-red-300"
                          : rt.risk_level === "low"
                          ? "bg-zinc-400/10 text-zinc-400"
                          : "bg-amber-400/15 text-amber-300")
                      }
                    >
                      {rt.risk_level}
                    </span>
                  </div>
                  <div className="text-[12px] italic leading-snug text-zinc-300">«{rt.attack}»</div>
                  <div className="mt-2 border-t border-white/[0.06] pt-2">
                    <div className="text-[9px] uppercase tracking-wider text-emerald-300/80">Απαντηση</div>
                    <div className="mt-0.5 text-[12px] leading-snug text-zinc-200">{rt.response}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Week plan */}
        <Card className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] tracking-[0.08em]" style={{ color: GREEN_L }}>
              ΤΟ ΣΧΕΔΙΟ ΤΗΣ ΕΒΔΟΜΑΔΑΣ ΣΟΥ
            </div>
            <button
              onClick={makeWeekPlan}
              disabled={planLoading || agendaLoading || localLoading}
              className="rounded-xl border px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-50"
              style={{ borderColor: GREEN + "55", color: GREEN_L, background: GREEN + "12" }}
            >
              {planLoading ? "Φτιαχνεται…" : plan.length ? "Ξανα" : "Φτιαξε μου το σχεδιο"}
            </button>
          </div>
          {plan.length === 0 ? (
            <div className="text-[13px] text-zinc-500">
              {planError || "Πατα «Φτιαξε μου το σχεδιο» — ο Noraya βγαζει προγραμμα κινησεων καμπανιας για τη βδομαδα, με βαση εθνικη + τοπικη ατζεντα."}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plan.map((d, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-[#0a1120] p-3">
                  <div className="text-[12px] font-semibold" style={{ color: GREEN_L }}>
                    {d.day}
                  </div>
                  <div className="mt-1 text-[13px] text-zinc-200">{d.move}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">{d.why}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Chat */}
        <Card className="mt-5">
          <div className="mb-3 text-[11px] tracking-[0.08em]" style={{ color: GREEN_L }}>
            ΣΥΜΒΟΥΛΟΣ ΕΚΣΤΡΑΤΕΙΑΣ
          </div>
          <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <div className="text-[13px] text-zinc-500">
                Ρωτησε με για την καμπανια σου. Π.χ. «Πως απανταω στην ακριβεια τοπικα;» η «Δωσε 3 ιδεες για reel».
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <div
                  className={
                    "inline-block max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed " +
                    (m.role === "user" ? "bg-cyan-300/15 text-cyan-50" : "bg-white/[0.05] text-zinc-200")
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && <div className="text-[12px] text-zinc-500">Ο Συμβουλος σκεφτεται…</div>}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder="Γραψε την ερωτηση σου…"
              className="flex-1 rounded-xl border border-white/10 bg-[#0a1120] px-3.5 py-2.5 text-[13px] text-zinc-100 outline-none focus:border-cyan-300/40"
            />
            <button
              onClick={sendChat}
              disabled={chatLoading || !input.trim()}
              className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-950 transition disabled:opacity-50"
              style={{ background: GREEN }}
            >
              Στειλε
            </button>
          </div>
        </Card>

        <div className="mt-6 text-center text-[11px] text-zinc-600">
          Noraya · demo προφιλ υποψηφιου — δεν συνδεεται με το βασικο dashboard
        </div>
      </div>
    </div>
  );
}
