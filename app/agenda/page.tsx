"use client";

import { useEffect, useState } from "react";

type MainSignal = {
  topic?: string;
  plain_title?: string;
  priority_label?: string;
  risk_label?: string;
  confidence_label?: string;
};

type BriefBody = {
  headline?: string;
  decision_summary?: string;
  what_it_means_for_you?: string;
  why_it_matters_now?: string;
  recommended_move?: string;
  avoid?: string;
  opportunity?: string;
  main_risk?: string;
  confidence?: string;
};

type Audience = {
  name?: string;
  reading?: string;
  move?: string;
};

type SecondarySignal = {
  topic?: string;
  plain_label?: string;
  why_watch?: string;
};

type AdvisorBrief = {
  main_signal?: MainSignal | null;
  brief?: BriefBody;
  audiences?: Audience[];
  talking_points?: string[];
  advisor_questions?: string[];
  secondary_signals?: SecondarySignal[];
  evidence_note?: string;
  processing_status?: string;
};

type AgendaBriefResponse = {
  profile?: any;
  brief?: AdvisorBrief;
  agenda_used?: any[];
  processing_status?: string;
  warning?: string;
  model?: string;
};

function fallbackText(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return fallback;
}

export default function AgendaPage() {
  const [data, setData] = useState<AgendaBriefResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadBrief() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/advisor/agenda-brief", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Advisor brief API error: ${response.status}`);
      }

      const json = (await response.json()) as AgendaBriefResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBrief();
  }, []);

  const profile = data?.profile || null;
  const brief = data?.brief || null;
  const mainSignal = brief?.main_signal || null;
  const body = brief?.brief || {};

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-5 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-5 text-sm text-zinc-300 shadow-2xl shadow-cyan-950/20">
          Ο Noraya ετοιμάζει την πολιτική σύσταση...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#020617] px-5 py-8 text-white">
        <div className="mx-auto max-w-4xl rounded-3xl border border-red-400/30 bg-red-400/10 p-6">
          <h1 className="text-xl font-semibold">Σφάλμα φόρτωσης</h1>
          <p className="mt-3 text-sm text-red-100">{error}</p>

          <button
            type="button"
            onClick={loadBrief}
            className="mt-5 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950"
          >
            Δοκίμασε ξανά
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] px-5 py-8 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.10),transparent_28%)]" />

      <div className="relative mx-auto max-w-6xl">
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
                AI Political Advisor
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Τι πρέπει να προσέξετε σήμερα
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                Ο Noraya μεταφράζει την τρέχουσα πολιτική ατζέντα σε πρακτική
                σύσταση, με βάση το προφίλ που επιλέξατε στο onboarding.
              </p>
            </div>

            <button
              type="button"
              onClick={loadBrief}
              className="w-fit rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/15"
            >
              Ανανέωση σύστασης
            </button>
          </div>
        </header>

        {profile ? (
          <section className="mb-6 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              Προφίλ χρήστη
            </div>

            <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-lg font-semibold text-zinc-100">
                  {profile.org_name ||
                    profile.party_profile_snapshot?.party_name ||
                    "Πολιτικό κόμμα"}
                </div>

                <div className="mt-1 text-sm text-zinc-400">
                  {profile.profile_source === "guest"
                    ? "Δωρεάν / guest προφίλ για MVP δοκιμή"
                    : "Αποθηκευμένο προφίλ οργανισμού"}
                </div>
              </div>

              <a
                href="/onboarding"
                className="w-fit rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200 transition hover:bg-white/[0.06]"
              >
                Αλλαγή προφίλ
              </a>
            </div>
          </section>
        ) : (
          <section className="mb-6 rounded-[1.5rem] border border-amber-300/25 bg-amber-300/10 p-5">
            <div className="text-sm font-medium text-amber-100">
              Δεν βρέθηκε προφίλ.
            </div>
            <p className="mt-2 text-sm text-amber-100/80">
              Πηγαίνετε στο onboarding και δημιουργήστε δωρεάν προφίλ.
            </p>
            <a
              href="/onboarding"
              className="mt-4 inline-flex rounded-2xl bg-amber-200 px-4 py-3 text-sm font-semibold text-slate-950"
            >
              Πήγαινε στο onboarding
            </a>
          </section>
        )}

        <section className="mb-6 rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.05] p-6 shadow-2xl shadow-cyan-950/20">
          <div className="mb-4 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
            Κύρια πολιτική σύσταση
          </div>

          <h2 className="text-2xl font-semibold leading-tight md:text-3xl">
            {fallbackText(
              body.headline,
              mainSignal?.plain_title ||
                mainSignal?.topic ||
                "Ο Noraya δεν έχει ακόμη ασφαλές κύριο σήμα."
            )}
          </h2>

          <p className="mt-4 max-w-4xl text-base leading-7 text-zinc-300">
            {fallbackText(
              body.decision_summary,
              "Χρειάζεται περισσότερη ταξινόμηση πριν υπάρξει ασφαλής πολιτική σύσταση."
            )}
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <DecisionBox
              title="Τι να κάνετε"
              text={fallbackText(
                body.recommended_move,
                "Κρατήστε προετοιμασμένη, καθαρή και θεσμική στάση μέχρι να υπάρξει πιο ασφαλής εικόνα."
              )}
              strong
            />

            <DecisionBox
              title="Τι να αποφύγετε"
              text={fallbackText(
                body.avoid,
                "Αποφύγετε βιαστική δημόσια θέση που δεν στηρίζεται σε αρκετά δεδομένα."
              )}
            />
          </div>
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-3">
          <InfoCard
            title="Γιατί σας αφορά"
            text={fallbackText(
              body.what_it_means_for_you,
              "Το θέμα μπορεί να επηρεάσει την πολιτική εικόνα σας, ανάλογα με το πώς θα πλαισιωθεί δημόσια."
            )}
          />

          <InfoCard
            title="Γιατί έχει σημασία τώρα"
            text={fallbackText(
              body.why_it_matters_now,
              "Η συζήτηση βρίσκεται σε εξέλιξη και το framing μπορεί να παγιωθεί γρήγορα."
            )}
          />

          <InfoCard
            title="Βασικό ρίσκο"
            text={fallbackText(
              body.main_risk,
              mainSignal?.risk_label ||
                "Το ρίσκο είναι να απαντήσετε με λάθος τόνο ή χωρίς αρκετή τεκμηρίωση."
            )}
          />
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <Panel title="Ποια κοινά επηρεάζονται">
            <div className="space-y-3">
              {(brief?.audiences || []).length > 0 ? (
                brief?.audiences?.map((audience, index) => (
                  <div
                    key={`${audience.name}-${index}`}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="font-medium text-zinc-100">
                      {audience.name || "Κοινό"}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      {audience.reading || "Δεν υπάρχει διαθέσιμη ανάγνωση."}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-cyan-100">
                      {audience.move || "Δεν υπάρχει διαθέσιμη κίνηση."}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-400">
                  Δεν υπάρχουν ακόμη αρκετά στοιχεία για κοινά.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Προτεινόμενα talking points">
            <div className="space-y-2">
              {(brief?.talking_points || []).length > 0 ? (
                brief?.talking_points?.map((point, index) => (
                  <div
                    key={`${point}-${index}`}
                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-200"
                  >
                    {point}
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-400">
                  Δεν υπάρχουν ακόμη talking points.
                </p>
              )}
            </div>
          </Panel>
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <Panel title="Ρώτα τον Advisor">
            <div className="grid gap-2">
              {(brief?.advisor_questions || []).length > 0 ? (
                brief?.advisor_questions?.map((question, index) => (
                  <button
                    key={`${question}-${index}`}
                    type="button"
                    className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-left text-sm text-cyan-50 transition hover:bg-cyan-300/15"
                  >
                    {question}
                  </button>
                ))
              ) : (
                <p className="text-sm text-zinc-400">
                  Ο Advisor δεν έχει ακόμη προτεινόμενες ερωτήσεις.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Άλλα θέματα προς παρακολούθηση">
            <div className="space-y-3">
              {(brief?.secondary_signals || []).length > 0 ? (
                brief?.secondary_signals?.map((signal, index) => (
                  <div
                    key={`${signal.topic}-${index}`}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="font-medium text-zinc-100">
                      {signal.plain_label || signal.topic || "Θέμα"}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      {signal.why_watch ||
                        "Χρειάζεται παρακολούθηση τις επόμενες ώρες."}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-400">
                  Δεν υπάρχουν δευτερεύοντα σήματα αυτή τη στιγμή.
                </p>
              )}
            </div>
          </Panel>
        </section>

        <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
          <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">
            Βάση εκτίμησης
          </div>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            {brief?.evidence_note ||
              "Η εκτίμηση βασίζεται στα διαθέσιμα agenda signals και στα πρόσφατα άρθρα."}
          </p>

          {data?.processing_status ? (
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              {data.processing_status}
            </p>
          ) : null}

          {data?.warning ? (
            <p className="mt-3 text-xs leading-5 text-amber-200">
              {data.warning}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function DecisionBox({
  title,
  text,
  strong = false,
}: {
  title: string;
  text: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-5 ${
        strong
          ? "border-emerald-300/25 bg-emerald-300/10"
          : "border-red-300/20 bg-red-300/10"
      }`}
    >
      <div className="text-xs uppercase tracking-[0.22em] text-zinc-400">
        {title}
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-100">{text}</p>
    </div>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">
        {title}
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">{text}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
      <h2 className="mb-4 text-lg font-semibold text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}
