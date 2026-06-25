import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ArticleRow = { topic: string | null; published_at: string | null };
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
async function fetchAgendaProbeScores(request: Request, token: string): Promise<Map<string, number> | null> {
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
    const byParent = new Map<string, number>();
    for (const c of clusters) {
      const score = typeof c?.score === "number" ? c.score : null;
      if (score === null) continue;
      // Κάθε cluster μπορεί να αγγίζει πολλά parent topics.
      const parents: string[] = Array.isArray(c?.parent_topics) && c.parent_topics.length
        ? c.parent_topics
        : c?.parent_topic
        ? [c.parent_topic]
        : [];
      for (const p of parents) {
        const key = String(p).trim();
        if (!key) continue;
        const prev = byParent.get(key) ?? 0;
        if (score > prev) byParent.set(key, score);
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

  // ── Πραγματικά άρθρα τελευταίων N ημερών (ταξινομημένα, πολιτικά) ──
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  let articles: ArticleRow[] = [];
  try {
    const { data } = await supabase
      .from("articles")
      .select("topic, published_at")
      .gte("published_at", sinceIso)
      .not("topic", "is", null)
      .eq("is_political", true)
      .limit(8000);
    articles = Array.isArray(data) ? (data as ArticleRow[]) : [];
  } catch {
    articles = [];
  }

  // ── Ημερήσια buckets ανά θέμα ──
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dayKeys.push(dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000)));
  }
  const idxOf = new Map(dayKeys.map((k, i) => [k, i]));
  const groups = new Map<string, TopicAgg>();

  for (const a of articles) {
    const topic = (a.topic || "").trim();
    if (!topic || topic === "Μη ταξινομημένο") continue;
    if (!a.published_at) continue;
    const k = String(a.published_at).slice(0, 10);
    const di = idxOf.get(k);
    if (di === undefined) continue;
    let g = groups.get(topic);
    if (!g) {
      g = { topic, total: 0, daily: new Array(days).fill(0), last7: 0, prev7: 0 };
      groups.set(topic, g);
    }
    g.daily[di] += 1;
    g.total += 1;
    if (di >= days - 7) g.last7 += 1;
    else if (di >= days - 14) g.prev7 += 1;
  }

  // ── agenda_score ανά θέμα: ΠΡΟΤΕΡΑΙΟΤΗΤΑ στο ζωντανό agenda-probe (ίδια πηγή με Strategy Room) ──
  // Fallback: η παλιά πηγή v_advisor_agenda_briefs_recent, αν το probe δεν απαντήσει.
  const scoreByTopic = new Map<string, number>();
  const probeScores = await fetchAgendaProbeScores(request, token);
  if (probeScores) {
    probeScores.forEach((v, k) => scoreByTopic.set(k, v));
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

  const topics = Array.from(groups.values())
    .map((g) => {
      const change7d = g.last7 - g.prev7;
      const changePct = g.prev7 > 0 ? Math.round(((g.last7 - g.prev7) / g.prev7) * 100) : g.last7 > 0 ? 100 : 0;
      return {
        topic: g.topic,
        total: g.total,
        last7: g.last7,
        prev7: g.prev7,
        change_7d: change7d,
        change_pct: changePct,
        trend: change7d > 1 ? "up" : change7d < -1 ? "down" : "flat",
        agenda_score: scoreByTopic.get(g.topic) ?? null,
        daily: g.daily,
        stance: "neutral" as "opportunity" | "threat" | "neutral",
        angle: "",
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
    days,
    generated_at: new Date().toISOString(),
    has_party_profile: !!partyProfile,
    agenda_score_source: probeScores ? "agenda_probe_live" : "advisor_briefs_fallback",
    day_keys: dayKeys,
    topics,
  });
}
