import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TopicAgg = {
  topic: string;
  total: number;
  daily: number[]; // N τιμές, παλιότερο → νεότερο
  last7: number;
  prev7: number;
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Φέρνει το ζωντανό score ανά parent_topic από το agenda-probe (η ΙΔΙΑ πηγή με το Strategy Room) ──
// Επιστρέφει Map<parent_topic, maxScore>. Αν αποτύχει, επιστρέφει null (ώστε να πέσουμε σε fallback).
type ProbeSignals = {
  score: number;
  search_interest_score: number | null;
  editorial_prominence_score: number | null;
  source_count: number | null;
  article_count: number | null;
};

async function fetchAgendaProbeScores(request: Request, token: string): Promise<Map<string, ProbeSignals> | null> {
  try {
    const origin = new URL(request.url).origin;
    const r = await fetch(
      `${origin}/api/situation-engine/agenda-probe?token=${encodeURIComponent(token)}&hours=48&view=brief`,
      { cache: "no-store" }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const clusters: any[] = Array.isArray(j?.agenda_clusters) ? j.agenda_clusters : [];
    if (clusters.length === 0) return null;

    // Μέγιστο score ανά parent_topic (ένα parent μπορεί να έχει πολλά micro-agenda).
    const byParent = new Map<string, ProbeSignals>();
    const num = (v: any): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    for (const c of clusters) {
      const score = num(c?.score);
      if (score === null) continue;
      const sig: ProbeSignals = {
        score,
        search_interest_score: num(c?.search_interest_score ?? c?.real_trend_score),
        editorial_prominence_score: num(c?.editorial_prominence_score ?? c?.frontpage_score),
        source_count: num(c?.source_count),
        article_count: num(c?.article_count),
      };
      // Καθε cluster μπορει να αγγιζει πολλα parent topics.
      const parents: string[] = Array.isArray(c?.parent_topics) && c.parent_topics.length
        ? c.parent_topics
        : c?.parent_topic
        ? [c.parent_topic]
        : [];
      for (const p of parents) {
        const key = String(p).trim();
        if (!key) continue;
        const prev = byParent.get(key);
        if (!prev || score > prev.score) byParent.set(key, sig);
      }
    }
    return byParent.size > 0 ? byParent : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (token !== process.env.CRON_SECRET && token !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const party = (searchParams.get("party") || "elas").trim();
  const days = Math.min(60, Math.max(7, Number(searchParams.get("days") || 30)));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });
  }
  const supabase = createServiceClient(supabaseUrl, serviceRoleKey);

  // ── Προφίλ κόμματος (best-effort) — για στοχευμένη ανάγνωση, ΟΧΙ generic ──
  let partyProfile: any = null;
  try {
    const { data } = await supabase
      .from("political_party_profiles")
      .select("*")
      .eq("party_key", party)
      .maybeSingle();
    partyProfile = data || null;
  } catch {
    partyProfile = null;
  }

  // ── Ημερήσια counts ανά θέμα από τη βάση (group by στη βάση, χωρίς όρια άρθρων) ──
  type CountRow = { topic: string; day: string; n: number };
  let countRows: CountRow[] = [];
  try {
    const { data } = await supabase.rpc("agenda_daily_counts", { p_days: days });
    countRows = Array.isArray(data) ? (data as CountRow[]) : [];
  } catch {
    countRows = [];
  }

  // ── Ημερήσια buckets ανά θέμα ──
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dayKeys.push(dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000)));
  }
  const idxOf = new Map(dayKeys.map((k, i) => [k, i]));
  const groups = new Map<string, TopicAgg>();

  for (const row of countRows) {
    const topic = (row.topic || "").trim();
    if (!topic || topic === "Μη ταξινομημένο") continue;
    const k = String(row.day).slice(0, 10);
    const di = idxOf.get(k);
    if (di === undefined) continue;
    const n = Number(row.n) || 0;
    let g = groups.get(topic);
    if (!g) {
      g = { topic, total: 0, daily: new Array(days).fill(0), last7: 0, prev7: 0 };
      groups.set(topic, g);
    }
    g.daily[di] += n;
    g.total += n;
    if (di >= days - 7) g.last7 += n;
    else if (di >= days - 14) g.prev7 += n;
  }

  // ── agenda_score ανά θέμα: ΠΡΟΤΕΡΑΙΟΤΗΤΑ στο ζωντανό agenda-probe (ίδια πηγή με Strategy Room) ──
  // Fallback: η παλιά πηγή v_advisor_agenda_briefs_recent, αν το probe δεν απαντήσει.
  const scoreByTopic = new Map<string, number>();
  const signalsByTopic = new Map<string, ProbeSignals>();
  const probeScores = await fetchAgendaProbeScores(request, token);
  if (probeScores) {
    probeScores.forEach((v, k) => {
      scoreByTopic.set(k, v.score);
      signalsByTopic.set(k, v);
    });
  } else {
    try {
      const { data } = await supabase
        .from("v_advisor_agenda_briefs_recent")
        .select("topic, agenda_score")
        .limit(200);
      if (Array.isArray(data)) {
        for (const r of data as any[]) {
          if (r?.topic && typeof r.agenda_score === "number") scoreByTopic.set(String(r.topic), r.agenda_score);
        }
      }
    } catch {
      /* αγνοούμε */
    }
  }

  // «Γιατι;»: τα 3 κορυφαια γεγονοτα ανα θεμα (7 ημερων) — τεκμηριωση χωρις AI.
  const topEventsByTopic = new Map<string, { title: string; article_count: number }[]>();
  try {
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: evRows } = await supabase
      .from("v_political_events_live")
      .select("topic,title,event_score,article_count,last_article_at")
      .gte("last_article_at", since7)
      .order("event_score", { ascending: false })
      .limit(300);
    for (const ev of (Array.isArray(evRows) ? evRows : []) as any[]) {
      const tp = String(ev?.topic || "").trim();
      if (!tp) continue;
      const list = topEventsByTopic.get(tp) || [];
      if (list.length < 3) {
        list.push({ title: String(ev.title || ""), article_count: Number(ev.article_count) || 0 });
        topEventsByTopic.set(tp, list);
      }
    }
  } catch {
    /* προαιρετικο — αν αποτυχει, απλα δεν δειχνουμε οδηγους */
  }

  const topics = Array.from(groups.values())
    .map((g) => {
      const change7d = g.last7 - g.prev7;
      // Ποσοστό μεταβολής με «καπάκι»: αποφεύγουμε τερατώδη νούμερα όταν η προηγούμενη
      // εβδομάδα έχει αραιά/ελλιπή ιστορικά δεδομένα. Όριο: -100% έως +200%.
      let changePct: number;
      if (g.prev7 > 0) {
        const raw = Math.round(((g.last7 - g.prev7) / g.prev7) * 100);
        changePct = Math.max(-100, Math.min(200, raw));
      } else {
        changePct = g.last7 > 0 ? 200 : 0;
      }
      return {
        topic: g.topic,
        total: g.total,
        last7: g.last7,
        prev7: g.prev7,
        change_7d: change7d,
        change_pct: changePct,
        trend: change7d > 1 ? "up" : change7d < -1 ? "down" : "flat",
        agenda_score: scoreByTopic.get(g.topic) ?? null,
        daily: g.daily.slice(-7),
        stance: "neutral" as "opportunity" | "threat" | "neutral",
        angle: "",
        top_events: topEventsByTopic.get(g.topic) ?? [],
        why_signals: signalsByTopic.get(g.topic) ?? null,
      };
    })
    // Κατάταξη: πρώτα όσα έχουν ζωντανό agenda-probe score (ίδια σειρά με Strategy Room),
    // μετά τα υπόλοιπα κατά όγκο.
    .sort((a, b) => (b.agenda_score ?? -1) - (a.agenda_score ?? -1) || b.total - a.total)
    .slice(0, 14);

  // ── Στοχευμένη ανάγνωση ανά κόμμα (1 φθηνή κλήση Haiku, batched, guarded) ──
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && topics.length > 0) {
    try {
      const list = topics
        .slice(0, 12)
        .map((t) => `- ${t.topic} (όγκος 7ημ: ${t.last7}, μεταβολή: ${t.change_7d >= 0 ? "+" : ""}${t.change_7d}, score: ${t.agenda_score ?? "—"})`)
        .join("\n");
      const sys =
        `Είσαι ο προσωπικός πολιτικός σύμβουλος του κόμματος με key "${party}". ` +
        `Κρίνεις ΑΠΟ ΤΗ ΣΚΟΠΙΑ ΑΥΤΟΥ ΤΟΥ ΚΟΜΜΑΤΟΣ, σεβόμενος θέση/τόνο/κόκκινες γραμμές του προφίλ. ` +
        (partyProfile ? `ΠΡΟΦΙΛ (JSON): ${JSON.stringify(partyProfile)}` : `Δεν υπάρχει αναλυτικό προφίλ — κρίνε συντηρητικά.`);
      const usr =
        `Για ΚΑΘΕ θέμα παρακάτω, πες αν είναι ΕΥΚΑΙΡΙΑ (opportunity), ΑΠΕΙΛΗ (threat) ή ΟΥΔΕΤΕΡΟ (neutral) ΓΙΑ ΤΟ ΚΟΜΜΑ, ` +
        `και μία πρόταση γωνία (≤14 λέξεις, στα ελληνικά). ` +
        `Θέματα:\n${list}\n\n` +
        `Επέστρεψε ΜΟΝΟ JSON array, χωρίς markdown: [{"topic":"...","stance":"opportunity|threat|neutral","angle":"..."}]`;
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1200,
          system: sys,
          messages: [{ role: "user", content: usr }],
        }),
      });
      if (resp.ok) {
        const j = await resp.json();
        const raw = Array.isArray(j?.content)
          ? j.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
          : "";
        const clean = String(raw).replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          const byTopic = new Map<string, any>();
          for (const p of parsed) if (p?.topic) byTopic.set(String(p.topic).trim(), p);
          for (const t of topics) {
            const m = byTopic.get(t.topic);
            if (m) {
              const s = String(m.stance || "").toLowerCase();
              t.stance = s === "opportunity" || s === "threat" ? (s as any) : "neutral";
              t.angle = String(m.angle || "").slice(0, 160);
            }
          }
        }
      }
    } catch {
      /* αν αποτύχει το AI, επιστρέφουμε τις πραγματικές τάσεις χωρίς στόχευση */
    }
  }

  return NextResponse.json({
    success: true,
    party,
    days: 7,
    generated_at: new Date().toISOString(),
    has_party_profile: !!partyProfile,
    agenda_score_source: probeScores ? "agenda_probe_live" : "advisor_briefs_fallback",
    day_keys: dayKeys,
    topics,
  });
}
