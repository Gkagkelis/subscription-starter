"use client";

import { useEffect, useState } from "react";

type TopSource = {
  source_name: string;
  articles: number;
};

type EvidenceArticle = {
  title: string;
  source_name: string;
  link: string;
  published_at: string | null;
  final_article_score: number | null;
};

type AgendaBrief = {
  topic: string;
  article_count: number;
  source_count: number;
  political_articles: number;
  agenda_score: number | null;
  documentation_level: string | null;
  political_risk_level: string | null;
  framing_summary: string | null;
  recommended_action: string | null;
  avoid_action: string | null;
  top_sources: TopSource[] | null;
  top_evidence_articles: EvidenceArticle[] | null;
  evidence_summary: string | null;
};

type AgendaApiResponse = {
  count: number;
  agenda: AgendaBrief[];
};

function riskLabel(risk: string | null) {
  if (risk === "high") return "Υψηλό ρίσκο";
  if (risk === "medium") return "Μεσαίο ρίσκο";
  if (risk === "low") return "Χαμηλό ρίσκο";
  return "Άγνωστο ρίσκο";
}

function riskClass(risk: string | null) {
  if (risk === "high") return "border-red-400/30 bg-red-400/10 text-red-100";
  if (risk === "medium") return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  if (risk === "low") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100";
  return "border-zinc-400/20 bg-zinc-400/10 text-zinc-300";
}

export default function AgendaPage() {
  const [agenda, setAgenda] = useState<AgendaBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAgenda() {
      try {
        const response = await fetch("/api/agenda?limit=10", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Agenda API error: ${response.status}`);
        }

        const data = (await response.json()) as AgendaApiResponse;
        setAgenda(data.agenda || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadAgenda();
  }, []);

  const topBrief = agenda[0];

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-5 text-sm text-zinc-300">
          Ο Noraya φορτώνει την πολιτική ατζέντα...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#020617] px-5 py-8 text-white">
        <div className="mx-auto max-w-4xl rounded-3xl border border-red-400/30 bg-red-400/10 p-6">
          <h1 className="text-xl font-semibold">Agenda API Error</h1>
          <p className="mt-3 text-sm text-red-100">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] px-5 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <img
              src="/noraya-eye.png"
              alt="Noraya"
              className="h-11 w-11 object-contain"
            />
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-cyan-300">
                NORAYA
              </div>
              <div className="text-xs text-zinc-500">
                Agenda Intelligence
              </div>
            </div>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight">
            Πολιτική Ατζέντα
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Πρώτη κανονική προβολή του Noraya Intelligence Layer: agenda score,
            framing, πολιτικό ρίσκο και προτεινόμενη κίνηση.
          </p>
        </header>

        {topBrief ? (
          <section className="mb-6 rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.05] p-6">
            <div className="mb-3 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
              Κορυφαίο agenda signal
            </div>

            <h2 className="text-2xl font-semibold">{topBrief.topic}</h2>

            <p className="mt-3 text-sm leading-6 text-zinc-300">
              {topBrief.framing_summary || "Δεν υπάρχει διαθέσιμο framing summary."}
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <StatCard
                label="Agenda Score"
                value={String(topBrief.agenda_score ?? "—")}
                sub="τρέχουσα ένταση"
              />
              <StatCard
                label="Πηγές"
                value={String(topBrief.source_count)}
                sub={`${topBrief.article_count} άρθρα`}
              />
              <StatCard
                label="Τεκμηρίωση"
                value={topBrief.documentation_level || "—"}
                sub={riskLabel(topBrief.political_risk_level)}
              />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <InfoBox
                title="Προτεινόμενη κίνηση"
                text={topBrief.recommended_action || "Δεν υπάρχει διαθέσιμη σύσταση."}
              />
              <InfoBox
                title="Να αποφευχθεί"
                text={topBrief.avoid_action || "Δεν υπάρχει διαθέσιμη αποφυγή."}
              />
            </div>
          </section>
        ) : null}

        <section className="grid gap-4">
          {agenda.map((brief) => (
            <article
              key={brief.topic}
              className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{brief.topic}</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {brief.evidence_summary || "Χωρίς evidence summary."}
                  </p>
                </div>

                <div
                  className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs ${riskClass(
                    brief.political_risk_level
                  )}`}
                >
                  {riskLabel(brief.political_risk_level)}
                </div>
              </div>

              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <StatCard
                  label="Agenda"
                  value={String(brief.agenda_score ?? "—")}
                  sub="score"
                />
                <StatCard
                  label="Άρθρα"
                  value={String(brief.article_count)}
                  sub="7 ημέρες"
                />
                <StatCard
                  label="Πηγές"
                  value={String(brief.source_count)}
                  sub="μέσα"
                />
                <StatCard
                  label="Πολιτικά"
                  value={String(brief.political_articles)}
                  sub="relevant"
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <InfoBox
                  title="Framing"
                  text={brief.framing_summary || "Δεν υπάρχει framing summary."}
                />
                <InfoBox
                  title="Recommended Action"
                  text={brief.recommended_action || "Δεν υπάρχει σύσταση."}
                />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Top Sources
                  </div>

                  <div className="space-y-2">
                    {(brief.top_sources || []).slice(0, 6).map((source) => (
                      <div
                        key={source.source_name}
                        className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm"
                      >
                        <span className="text-zinc-200">{source.source_name}</span>
                        <span className="text-zinc-500">{source.articles}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Evidence Articles
                  </div>

                  <div className="space-y-3">
                    {(brief.top_evidence_articles || []).slice(0, 4).map((article) => (
                      <a
                        key={`${article.link}-${article.title}`}
                        href={article.link}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-xl bg-white/[0.03] px-3 py-3 transition hover:bg-white/[0.06]"
                      >
                        <div className="text-sm font-medium text-zinc-100">
                          {article.title}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {article.source_name} · score{" "}
                          {article.final_article_score ?? "—"}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{sub}</div>
    </div>
  );
}

function InfoBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
        {title}
      </div>
      <p className="text-sm leading-6 text-zinc-300">{text}</p>
    </div>
  );
}
