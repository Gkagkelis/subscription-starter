"use client";

import { useEffect, useMemo, useState } from "react";

type Scenario = {
  name?: string;
  move?: string;
  likely_gain?: string;
  likely_risk?: string;
  audience_effect?: string;
  opponent_response?: string;
  media_response?: string;
  recommendation?: "prefer" | "acceptable" | "avoid" | string;
};

type StrategicBrief = {
  issue?: {
    topic?: string;
    plain_title?: string;
    agenda_status?: string;
    urgency?: string;
    dominant_frame?: string;
    priming_risk?: string;
    political_risk?: string;
    opportunity?: string;
    affected_audiences?: string[];
    documentation_level?: string;
  };
  daily_brief?: {
    headline?: string;
    what_is_happening?: string;
    why_it_matters_now?: string;
    immediate_recommendation?: string;
    avoid_today?: string;
  };
  strategic_diagnosis?: {
    agenda_reading?: string;
    framing_diagnosis?: string;
    priming_risk?: string;
    audience_reading?: string;
    persuasion_reading?: string;
    strategic_opportunity?: string;
    strategic_risk?: string;
    recommended_posture?: string;
    recommended_posture_explanation?: string;
  };
  scenarios?: Scenario[];
  message_package?: {
    central_line?: string;
    institutional_version?: string;
    human_version?: string;
    sharp_version?: string;
    social_post?: string;
    answer_if_attacked?: string;
    words_to_use?: string[];
    words_to_avoid?: string[];
  };
  action_plan?: {
    now?: string[];
    next_24h?: string[];
    next_48h?: string[];
    this_week?: string[];
    owner_suggestion?: string;
  };
  monitoring_plan?: {
    watch_topics?: string[];
    watch_actors?: string[];
    watch_media?: string[];
    escalation_triggers?: string[];
  };
  evidence?: {
    basis?: string;
    data_points?: string[];
    uncertainty?: string;
    documentation_level?: string;
  };
};

type ApiResponse = {
  profile?: any;
  strategic_brief?: StrategicBrief;
  source?: string;
};

type TabId = "today" | "diagnosis" | "scenarios" | "messages" | "plan";

const tabs: Array<{ id: TabId; label: string; description: string }> = [
  {
    id: "today",
    label: "Σήμερα",
    description: "Η άμεση πολιτική ανάγνωση."
  },
  {
    id: "diagnosis",
    label: "Διάγνωση",
    description: "Τι σημαίνει στρατηγικά."
  },
  {
    id: "scenarios",
    label: "Σενάρια",
    description: "Τι γίνεται αν κινηθούμε διαφορετικά."
  },
  {
    id: "messages",
    label: "Μηνύματα",
    description: "Τι μπορούμε να πούμε δημόσια."
  },
  {
    id: "plan",
    label: "Πλάνο",
    description: "Τι κάνουμε τώρα και μετά."
  }
];

function text(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function list(values: unknown): string[] {
  return Array.isArray(values)
    ? values.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function recommendationLabel(value?: string) {
  if (value === "prefer") return "Προτεινόμενο";
  if (value === "acceptable") return "Αποδεκτό";
  if (value === "avoid") return "Να αποφευχθεί";
  return "Σενάριο";
}

function recommendationClass(value?: string) {
  if (value === "prefer") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (value === "acceptable") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (value === "avoid") return "border-red-300/25 bg-red-300/10 text-red-100";
  return "border-white/10 bg-white/[0.04] text-zinc-200";
}

export default function StrategyRoomPage() {
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadStrategy() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/advisor/strategy-brief", {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Strategy brief API error: ${response.status}`);
      }

      const json = (await response.json()) as ApiResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStrategy();
  }, []);

  const brief = data?.strategic_brief || {};
  const issue = brief.issue || {};
  const daily = brief.daily_brief || {};
  const diagnosis = brief.strategic_diagnosis || {};
  const messages = brief.message_package || {};
  const actionPlan = brief.action_plan || {};
  const monitoring = brief.monitoring_plan || {};
  const evidence = brief.evidence || {};

  const profileName = useMemo(() => {
    const profile = data?.profile;
    return (
      profile?.org_name ||
      profile?.party_profile_snapshot?.party_name ||
      profile?.party_key ||
      "Πολιτικός οργανισμός"
    );
  }, [data]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-5 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-5 text-sm text-zinc-300">
          Ο Noraya ετοιμάζει το Strategy Room...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#020617] px-5 py-8 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-400/25 bg-red-400/10 p-6">
          <h1 className="text-xl font-semibold">Δεν φορτώθηκε το Strategy Room</h1>
          <p className="mt-3 text-sm text-red-100">{error}</p>
          <button
            type="button"
            onClick={loadStrategy}
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
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.15),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(245,158,11,0.10),transparent_28%)]" />

      <div className="relative mx-auto max-w-7xl">
        <header className="mb-8">
          <div className="mb-5 flex items-center gap-3">
            <img src="/noraya-eye.png" alt="Noraya" className="h-11 w-11 object-contain" />
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-cyan-300">
                NORAYA
              </div>
              <div className="text-xs text-zinc-500">
                Political Strategy Room
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
                {text(issue.urgency, "watch").toUpperCase()}
              </div>

              <h1 className="max-w-5xl text-4xl font-semibold tracking-tight md:text-5xl">
                {text(
                  daily.headline,
                  text(issue.plain_title, "Στρατηγική ανάγνωση της πολιτικής ατζέντας")
                )}
              </h1>

              <p className="mt-4 max-w-4xl text-base leading-7 text-zinc-400">
                {text(
                  daily.what_is_happening,
                  "Ο Noraya διαβάζει την τρέχουσα ατζέντα και τη μετατρέπει σε στρατηγική, σενάρια, μήνυμα και πλάνο δράσης."
                )}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                Προφίλ
              </div>
              <div className="mt-2 text-lg font-semibold text-zinc-100">
                {profileName}
              </div>
              <a
                href="/onboarding"
                className="mt-4 inline-flex rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200 hover:bg-white/[0.06]"
              >
                Αλλαγή προφίλ
              </a>
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <HeroDecision
            label="Τι κάνουμε"
            textValue={text(
              daily.immediate_recommendation,
              "Κρατάμε καθαρή στρατηγική γραμμή και αποφεύγουμε βιαστική κλιμάκωση."
            )}
            tone="positive"
          />

          <HeroDecision
            label="Τι αποφεύγουμε"
            textValue={text(
              daily.avoid_today,
              "Αποφεύγουμε απόλυτη δημόσια θέση χωρίς επαρκή τεκμηρίωση."
            )}
            tone="negative"
          />
        </section>

        <section className="mb-8 rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.045] p-5">
          <div className="grid gap-3 md:grid-cols-5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  activeTab === tab.id
                    ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-50"
                    : "border-white/10 bg-black/20 text-zinc-400 hover:bg-white/[0.05]"
                }`}
              >
                <div className="font-semibold">{tab.label}</div>
                <div className="mt-1 text-xs leading-5 opacity-80">{tab.description}</div>
              </button>
            ))}
          </div>
        </section>

        {activeTab === "today" && (
          <section className="grid gap-5 lg:grid-cols-3">
            <Card title="Γιατί έχει σημασία τώρα">
              {text(
                daily.why_it_matters_now,
                "Το θέμα μπορεί να επηρεάσει το κριτήριο με το οποίο θα αξιολογηθεί ο οργανισμός."
              )}
            </Card>

            <Card title="Κυρίαρχο framing">
              {text(
                issue.dominant_frame,
                "Το framing χρειάζεται περαιτέρω ανάλυση πριν γίνει πλήρης στρατηγική κλιμάκωση."
              )}
            </Card>

            <Card title="Βασικό ρίσκο">
              {text(
                issue.political_risk,
                "Το βασικό ρίσκο είναι βιαστική τοποθέτηση χωρίς επαρκή τεκμηρίωση."
              )}
            </Card>
          </section>
        )}

        {activeTab === "diagnosis" && (
          <section className="grid gap-5 lg:grid-cols-2">
            <Card title="Ανάγνωση ατζέντας">
              {text(diagnosis.agenda_reading, text(issue.agenda_status, "Δεν υπάρχει αρκετή στρατηγική ανάγνωση ακόμη."))}
            </Card>

            <Card title="Framing diagnosis">
              {text(diagnosis.framing_diagnosis, "Το framing χρειάζεται περαιτέρω ανάλυση.")}
            </Card>

            <Card title="Priming risk">
              {text(diagnosis.priming_risk, text(issue.priming_risk, "Δεν έχει υπολογιστεί ακόμη priming risk."))}
            </Card>

            <Card title="Στρατηγική στάση">
              <p>
                {text(
                  diagnosis.recommended_posture_explanation,
                  "Προτιμάται προσεκτική, θεσμική στάση μέχρι να ισχυροποιηθεί το σήμα."
                )}
              </p>
              <div className="mt-4 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                {text(diagnosis.recommended_posture, "institutional")}
              </div>
            </Card>

            <Card title="Ποια κοινά επηρεάζονται">
              <BulletList
                items={list(issue.affected_audiences)}
                fallback={["Βάση οργανισμού", "Μετριοπαθές κοινό", "Πολιτικά ενεργό κοινό"]}
              />
            </Card>

            <Card title="Ευκαιρία">
              {text(
                diagnosis.strategic_opportunity,
                text(issue.opportunity, "Υπάρχει ευκαιρία για σοβαρή και προετοιμασμένη στάση.")
              )}
            </Card>
          </section>
        )}

        {activeTab === "scenarios" && (
          <section className="grid gap-5">
            {(brief.scenarios || []).map((scenario, index) => (
              <article
                key={`${scenario.name}-${index}`}
                className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5"
              >
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold">
                      {text(scenario.name, `Σενάριο ${index + 1}`)}
                    </h2>
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-400">
                      {text(scenario.move, "Δεν υπάρχει περιγραφή κίνησης.")}
                    </p>
                  </div>

                  <div className={`w-fit rounded-full border px-3 py-1 text-xs ${recommendationClass(scenario.recommendation)}`}>
                    {recommendationLabel(scenario.recommendation)}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <MiniBox title="Όφελος" textValue={text(scenario.likely_gain, "—")} />
                  <MiniBox title="Ρίσκο" textValue={text(scenario.likely_risk, "—")} />
                  <MiniBox title="Κοινό" textValue={text(scenario.audience_effect, "—")} />
                  <MiniBox title="Αντίδραση" textValue={text(scenario.opponent_response, "—")} />
                </div>
              </article>
            ))}
          </section>
        )}

        {activeTab === "messages" && (
          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.05] p-6">
              <div className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">
                Κεντρική γραμμή
              </div>
              <p className="mt-4 text-2xl font-semibold leading-snug">
                {text(
                  messages.central_line,
                  "Χρειάζεται σοβαρότητα, τεκμηρίωση και θεσμική καθαρότητα."
                )}
              </p>
            </div>

            <Card title="Social post">
              {text(messages.social_post, "Δεν υπάρχει ακόμη προτεινόμενο social post.")}
            </Card>

            <Card title="Θεσμική εκδοχή">
              {text(messages.institutional_version, "Δεν υπάρχει ακόμη θεσμική εκδοχή.")}
            </Card>

            <Card title="Ανθρώπινη εκδοχή">
              {text(messages.human_version, "Δεν υπάρχει ακόμη ανθρώπινη εκδοχή.")}
            </Card>

            <Card title="Sharp εκδοχή">
              {text(messages.sharp_version, "Δεν υπάρχει ακόμη sharp εκδοχή.")}
            </Card>

            <Card title="Αν μας επιτεθούν">
              {text(messages.answer_if_attacked, "Δεν υπάρχει ακόμη απάντηση σε επίθεση.")}
            </Card>

            <Card title="Λέξεις που βοηθούν">
              <BulletList items={list(messages.words_to_use)} fallback={["τεκμηρίωση", "σοβαρότητα", "θεσμική ευθύνη"]} />
            </Card>

            <Card title="Λέξεις που αποφεύγουμε">
              <BulletList items={list(messages.words_to_avoid)} fallback={["υπερβολή", "προσωπική επίθεση", "βεβαιότητα χωρίς στοιχεία"]} />
            </Card>
          </section>
        )}

        {activeTab === "plan" && (
          <section className="grid gap-5 lg:grid-cols-2">
            <Card title="Τώρα">
              <BulletList items={list(actionPlan.now)} fallback={["Κρατήστε έτοιμη σύντομη θεσμική γραμμή."]} />
            </Card>

            <Card title="Επόμενες 24 ώρες">
              <BulletList items={list(actionPlan.next_24h)} fallback={["Παρακολουθήστε αν αλλάζει το framing."]} />
            </Card>

            <Card title="Επόμενες 48 ώρες">
              <BulletList items={list(actionPlan.next_48h)} fallback={["Αποφασίστε αν χρειάζεται κλιμάκωση."]} />
            </Card>

            <Card title="Αυτή την εβδομάδα">
              <BulletList items={list(actionPlan.this_week)} fallback={["Συνδέστε το θέμα με ευρύτερη στρατηγική μόνο αν αποκτήσει ένταση."]} />
            </Card>

            <Card title="Ποιος πρέπει να το σηκώσει">
              {text(actionPlan.owner_suggestion, "Προτιμάται θεσμικό πρόσωπο με ήπιο και αξιόπιστο ύφος.")}
            </Card>

            <Card title="Triggers κλιμάκωσης">
              <BulletList
                items={list(monitoring.escalation_triggers)}
                fallback={[
                  "Αύξηση κάλυψης από μέσα υψηλής βαρύτητας.",
                  "Παρέμβαση βασικού πολιτικού αντιπάλου.",
                  "Μετατόπιση framing σε ευθύνη ή λογοδοσία."
                ]}
              />
            </Card>
          </section>
        )}

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.025] p-5">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-zinc-300">
              Βάση τεκμηρίωσης
            </summary>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card title="Βάση">
                {text(evidence.basis, "Η εκτίμηση βασίζεται στα διαθέσιμα agenda signals.")}
              </Card>
              <Card title="Αβεβαιότητα">
                {text(evidence.uncertainty, "Η ανάλυση χρειάζεται περισσότερα ταξινομημένα δεδομένα.")}
              </Card>
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}

function HeroDecision({
  label,
  textValue,
  tone
}: {
  label: string;
  textValue: string;
  tone: "positive" | "negative";
}) {
  return (
    <div
      className={`rounded-[2rem] border p-6 ${
        tone === "positive"
          ? "border-emerald-300/25 bg-emerald-300/10"
          : "border-red-300/20 bg-red-300/10"
      }`}
    >
      <div className="text-xs uppercase tracking-[0.25em] text-zinc-400">
        {label}
      </div>
      <p className="mt-4 text-lg font-medium leading-8 text-zinc-100">
        {textValue}
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
      <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">
        {title}
      </div>
      <div className="mt-3 text-sm leading-7 text-zinc-300">{children}</div>
    </section>
  );
}

function MiniBox({ title, textValue }: { title: string; textValue: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{textValue}</p>
    </div>
  );
}

function BulletList({ items, fallback }: { items: string[]; fallback: string[] }) {
  const values = items.length > 0 ? items : fallback;

  return (
    <ul className="space-y-2">
      {values.map((item, index) => (
        <li key={`${item}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          {item}
        </li>
      ))}
    </ul>
  );
}
