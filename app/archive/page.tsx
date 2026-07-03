"use client";

import { useEffect, useState } from "react";
import TopNav from "../../components/TopNav";
import { IBM_Plex_Sans } from "next/font/google";

const plex = IBM_Plex_Sans({
  subsets: ["greek", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

type ArchiveItem = {
  id: string;
  created_at: string;
  updated_at?: string;
  title: string;
  kind: string;
  content?: string | null;
  event_id?: string | null;
  event_title?: string | null;
};

const KIND_LABEL: Record<string, string> = {
  note: "Σημείωση",
  analysis: "Ανάλυση",
  scenario: "Σενάριο",
};

function kindTone(kind: string): string {
  if (kind === "analysis") return "border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-100";
  if (kind === "scenario") return "border-amber-300/25 bg-amber-300/[0.06] text-amber-100";
  return "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-100";
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " · " +
      d.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return "";
  }
}

export default function ArchivePage() {
  const [partyLabel, setPartyLabel] = useState("ΕΛΑΣ");
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      await load(pk);
    })();
  }, []);

  async function load(pk: string) {
    setLoading(true);
    try {
      const r = await fetch(`/api/archive?party=${encodeURIComponent(pk)}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) setItems(Array.isArray(j.items) ? j.items : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  function askAdvisor(item: ArchiveItem) {
    const text = item.content ? `${item.title}\n\n${item.content}` : item.title;
    try {
      sessionStorage.setItem("noraya_advisor_prefill", text);
    } catch {
      /* ignore */
    }
    window.location.href = "/strategy-room";
  }

  function startRename(item: ArchiveItem) {
    setEditingId(item.id);
    setEditTitle(item.title);
  }

  async function saveRename(id: string) {
    const title = editTitle.trim();
    setEditingId(null);
    if (!title) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, title } : it)));
    try {
      await fetch("/api/archive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title }),
      });
    } catch {
      /* ignore */
    }
  }

  async function remove(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Να διαγραφεί οριστικά αυτό το αρχείο;")) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
    try {
      await fetch(`/api/archive?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={`${plex.className} min-h-screen bg-[#060a14] text-zinc-200`}>
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
          <div className="rounded-2xl border border-[#1a2640] bg-[#0c1220] px-3 py-2 text-[11px] text-zinc-400">
            {partyLabel}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 py-8">
        <section className="mb-6">
          <div className="text-xs font-medium text-cyan-300/70">Αρχεία</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
            Οι αποθηκευμένες αναλύσεις & σημειώσεις
          </h1>
          <p className="mt-2 text-sm text-zinc-500">Ό,τι σώζεις μένει εδώ — για όλη την ομάδα, μόνιμα.</p>
        </section>

        {loading ? (
          <div className="text-sm text-zinc-500">Φόρτωση…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-[#1a2640] bg-[#0a111f] p-8 text-center">
            <div className="text-sm text-zinc-400">Δεν έχεις αποθηκεύσει τίποτα ακόμα.</div>
            <div className="mt-1 text-[12px] text-zinc-600">
              Από τη «Στρατηγική εικόνα», τα «Σενάρια» ή τις σημειώσεις σε ένα γεγονός, πάτα «Αποθήκευση στο Αρχείο».
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-[#1a2640] bg-[#0a111f] p-4 transition hover:border-[#243049]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-medium ${kindTone(item.kind)}`}>
                        {KIND_LABEL[item.kind] || item.kind}
                      </span>
                      <span className="text-[11px] text-zinc-600">{fmtDate(item.created_at)}</span>
                    </div>
                    {editingId === item.id ? (
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(item.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={() => saveRename(item.id)}
                        className="w-full rounded-lg border border-cyan-300/40 bg-black/30 px-2 py-1 text-[15px] font-semibold text-zinc-50 outline-none"
                      />
                    ) : (
                      <div className="text-[15px] font-semibold leading-snug text-zinc-50">{item.title}</div>
                    )}
                    {item.event_title ? (
                      <div className="mt-1 text-[12px] text-zinc-500">Γεγονός: {item.event_title}</div>
                    ) : null}
                    {item.content ? (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                          className="text-[11px] text-cyan-300/80 transition hover:text-cyan-200"
                        >
                          {expandedId === item.id ? "Απόκρυψη" : "Προβολή περιεχομένου"}
                        </button>
                        {expandedId === item.id ? (
                          <p className="mt-2 whitespace-pre-wrap rounded-xl border border-white/[0.05] bg-black/20 p-3 text-[13px] leading-relaxed text-zinc-300">
                            {item.content}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => askAdvisor(item)}
                      title="Ρώτα τον Σύμβουλο"
                      className="rounded-lg border border-cyan-300/20 px-2 py-1 text-[12px] text-cyan-200/80 transition hover:bg-cyan-300/10 hover:text-cyan-100"
                    >
                      💬
                    </button>
                    <button
                      type="button"
                      onClick={() => startRename(item)}
                      title="Μετονομασία"
                      className="rounded-lg border border-[#1a2640] px-2 py-1 text-[12px] text-zinc-400 transition hover:text-zinc-100"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      title="Διαγραφή"
                      className="rounded-lg border border-red-400/20 px-2 py-1 text-[12px] text-red-300/80 transition hover:bg-red-400/10 hover:text-red-200"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
