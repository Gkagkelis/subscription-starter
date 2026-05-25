"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import NewsFeed from "@/components/ui/NewsFeed/NewsFeed";
type NorayaProfile = {
  organization?: {
    name?: string;
    type?: string;
  };
  themes?: string[];
  issues?: string[];
  events?: string[];
  stakeholders?: {
    ageGroups?: string[];
    socialGroups?: string[];
    professionalGroups?: string[];
    institutions?: string[];
    publicActors?: string[];
  };
  positions?: {
    mission?: string;
    redLines?: string;
    tone?: string;
  };
};

const fallbackProfile: NorayaProfile = {
  organization: {
    name: "Free Preview",
    type: "Γενική πολιτική εικόνα"
  },
  themes: ["Ακρίβεια / κόστος ζωής", "Υγεία", "Αγροτικά", "Στέγαση"],
  issues: ["Ακρίβεια τροφίμων", "Ενοίκια", "ΕΣΥ", "Τέμπη"],
  events: ["Κοινωνικές αντιδράσεις", "Αγροτικές κινητοποιήσεις"],
  stakeholders: {
    ageGroups: ["18-24 / νέοι ενήλικες", "25-34", "35-44"],
    socialGroups: ["Φοιτητές", "Οικογένειες με παιδιά"],
    professionalGroups: ["Δημόσιοι υπάλληλοι", "Μικρομεσαίοι επιχειρηματίες"],
    institutions: ["Βουλή", "Δήμοι"],
    publicActors: ["Κυβέρνηση", "Αντιπολίτευση", "ΜΜΕ"]
  },
  positions: {
    mission: "",
    redLines: "",
    tone: ""
  }
};

const freeIssues = [
  {
    title: "Ακρίβεια",
    icon: "🛒",
    publicShare: "66%",
    status: "Ουδέτερο",
    summary:
      "Το κόστος ζωής παραμένει το πιο σταθερά παρόν θέμα στη δημόσια συζήτηση."
  },
  {
    title: "Υγεία",
    icon: "♡",
    publicShare: "48%",
    status: "Ουδέτερο",
    summary:
      "Οι αναφορές σε νοσοκομεία, ραντεβού και προσωπικό παραμένουν αυξημένες."
  },
  {
    title: "Αγροτικά",
    icon: "🌿",
    publicShare: "41%",
    status: "Ουδέτερο",
    summary:
      "Υπάρχει αυξημένη κινητικότητα σε κόστος παραγωγής και περιφερειακή πίεση."
  }
];

const personalizedIssues = [
  {
    title: "Ακρίβεια",
    icon: "🛒",
    importance: "Πολύ υψηλή σημασία",
    risk: 78,
    fit: 64,
    color: "red",
    why:
      "Συνδέεται με βασικά κοινά και φορείς που δηλώσατε. Επηρεάζει εισόδημα, εμπιστοσύνη και δημόσια πίεση.",
    recommendation:
      "Χρειάζεται τεκμηριωμένη ανάλυση πηγών, κόστους και συνέπειας με τις δηλωμένες θέσεις."
  },
  {
    title: "Υγεία",
    icon: "♡",
    importance: "Υψηλή σημασία",
    risk: 62,
    fit: 54,
    color: "amber",
    why:
      "Οι αναφορές σε αναμονές, ελλείψεις και πρόσβαση σε υπηρεσίες υγείας δείχνουν πιθανή κλιμάκωση.",
    recommendation:
      "Παρακολουθήστε θεσμικές εξελίξεις, τοπικές αναφορές και αντιδράσεις φορέων."
  },
  {
    title: "Αγροτικά",
    icon: "🌿",
    importance: "Μεσαία σημασία",
    risk: 45,
    fit: 43,
    color: "emerald",
    why:
      "Η κινητικότητα στον αγροτικό χώρο λειτουργεί ως signal για περιφερειακή ένταση.",
    recommendation:
      "Συνδέστε το με ενέργεια, κόστος παραγωγής και τοπικές αντιδράσεις."
  },
  {
    title: "Παιδεία",
    icon: "🎓",
    importance: "Μεσαία σημασία",
    risk: 38,
    fit: 41,
    color: "blue",
    why:
      "Φοιτητικά και σχολικά ζητήματα συνδέονται με κοινωνικές ομάδες υψηλής ευαισθησίας.",
    recommendation:
      "Παρακολουθήστε φοιτητικές κινητοποιήσεις, θεσμικές παρεμβάσεις και δημόσιο λόγο."
  }
];

function readLocalProfile(): NorayaProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem("noraya_org_profile");
    return stored ? (JSON.parse(stored) as NorayaProfile) : null;
  } catch {
    return null;
  }
}

/**
 * Convert the Supabase DB row (flat columns) back to the
 * nested shape the dashboard already expects.
 */
function dbRowToProfile(row: any): NorayaProfile {
  return {
    organization: {
      name: row.org_name || "",
      type: row.org_type || ""
    },
    themes: row.themes || [],
    issues: row.issues || [],
    events: row.events || [],
    stakeholders: row.stakeholders || {
      ageGroups: [],
      socialGroups: [],
      professionalGroups: [],
      institutions: [],
      publicActors: []
    },
    positions: {
      mission: row.mission || "",
      redLines: row.red_lines || "",
      tone: row.tone || ""
    }
  };
}

function getRiskColor(color: string) {
  if (color === "red") {
    return {
      border: "border-red-400/30",
      bg: "bg-red-400/10",
      text: "text-red-100",
      badge: "border-red-400/30 bg-red-400/10 text-red-100"
    };
  }

  if (color === "amber") {
    return {
      border: "border-amber-400/30",
      bg: "bg-amber-400/10",
      text: "text-amber-100",
      badge: "border-amber-400/30 bg-amber-400/10 text-amber-100"
    };
  }

  if (color === "emerald") {
    return {
      border: "border-emerald-400/30",
      bg: "bg-emerald-400/10",
      text: "text-emerald-100",
      badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
    };
  }

  return {
    border: "border-cyan-400/30",
    bg: "bg-cyan-400/10",
    text: "text-cyan-100",
    badge: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
  };
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<NorayaProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Try API first (logged-in user with Supabase data)
        const res = await fetch("/api/onboarding");
        if (res.ok) {
          const data = await res.json();
          if (data && data.onboarding_completed) {
            setProfile(dbRowToProfile(data));
            setLoading(false);
            return;
          }
        }
      } catch {
        // API failed — fall through to localStorage
      }

      // Fallback: try localStorage (non-logged-in or pre-migration data)
      setProfile(readLocalProfile());
      setLoading(false);
    })();
  }, []);

  const activeProfile = profile ?? fallbackProfile;
  const isPersonalized = Boolean(profile);

  const organizationName =
    activeProfile.organization?.name || fallbackProfile.organization?.name || "Free Preview";

  const organizationType =
    activeProfile.organization?.type || fallbackProfile.organization?.type || "Γενική εικόνα";

  const selectedThemes = activeProfile.themes ?? [];
  const selectedIssues = activeProfile.issues ?? [];
  const selectedEvents = activeProfile.events ?? [];

  const selectedStakeholders = useMemo(() => {
    const stakeholders = activeProfile.stakeholders ?? {};

    return [
      ...(stakeholders.ageGroups ?? []),
      ...(stakeholders.socialGroups ?? []),
      ...(stakeholders.professionalGroups ?? []),
      ...(stakeholders.institutions ?? []),
      ...(stakeholders.publicActors ?? [])
    ];
  }, [activeProfile]);

  const mission = activeProfile.positions?.mission;
  const redLines = activeProfile.positions?.redLines;
  const tone = activeProfile.positions?.tone;

  return (
    <div className="min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_84%_20%,rgba(16,185,129,0.14),transparent_30%),radial-gradient(circle_at_50%_85%,rgba(59,130,246,0.10),transparent_34%)]" />

      <div className="relative mx-auto grid max-w-[1500px] gap-5 px-5 py-6 xl:grid-cols-[255px_minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <aside className="rounded-[2rem] border border-cyan-300/10 bg-white/[0.035] p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur">
          <div className="mb-8 flex items-center gap-3">
            <Image
              src="/noraya-eye.png"
              alt="Noraya"
              width={90}
              height={46}
              className="h-12 w-auto object-contain"
              priority
            />
            <div>
              <div className="tracking-[0.32em] text-zinc-100">NORAYA</div>
              <div className="text-xs text-zinc-500">Political Intelligence</div>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-semibold leading-tight">
              AI Πολιτική Πληροφόρηση
            </h1>
            <p className="mt-4 text-lg leading-7 text-cyan-300">
              Δωρεάν γενική εικόνα. Με είσοδο, στρατηγική προσαρμοσμένη στον οργανισμό σας.
            </p>
          </div>

          <div className="space-y-5">
            <FeatureItem
              icon="◉"
              title="Γενική παρακολούθηση"
              text="Ολοκληρωμένη εικόνα του δημόσιου πολιτικού περιβάλλοντος."
            />
            <FeatureItem
              icon="◎"
              title="Προσαρμογή σε οργανισμό"
              text="Θεματικές, ζητήματα, κοινά, φορείς και κόκκινες γραμμές."
            />
            <FeatureItem
              icon="◇"
              title="Σενάρια & ρίσκο"
              text="Ανάλυση κινδύνων, ενδείξεων και πιθανής κλιμάκωσης."
            />
            <FeatureItem
              icon="▣"
              title="Ιδιωτική γνώση"
              text="Οι θέσεις του οργανισμού χρησιμοποιούνται για συνέπεια και τεκμηρίωση."
            />
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Τρέχουσα κατάσταση
            </div>

            <div
              className={`mt-3 inline-flex rounded-full border px-3 py-1.5 text-xs ${
                isPersonalized
                  ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                  : "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
              }`}
            >
              {isPersonalized ? "Προσωποποιημένο" : "Free Preview"}
            </div>

            <div className="mt-4 text-sm font-medium text-zinc-100">
              {organizationName}
            </div>
            <div className="mt-1 text-xs text-zinc-500">{organizationType}</div>

            <Link
              href="/onboarding"
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-cyan-300/20 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-300/10"
            >
              {isPersonalized ? "Αλλαγή προσαρμογής" : "Ρύθμιση οργανισμού"}
            </Link>
          </div>
        </aside>

        <main className="space-y-5">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-cyan-950/10 backdrop-blur">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="mb-3 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                  1 · Δωρεάν γενική εικόνα
                </div>

                <h2 className="text-2xl font-semibold">Γενική εικόνα</h2>

                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">
                    Γενικό πολιτικό τοπίο
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">
                    Χωρίς προσαρμογή οργανισμού
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs text-cyan-100">
                Free Preview
              </div>
            </div>
 <NewsFeed />
            <div className="grid gap-3 md:grid-cols-4">
              <Kpi label="Sentiment" value="+8" sub="ουδέτερο" />
              <Kpi label="Narratives" value="52" sub="ενεργά αφηγήματα" />
              <Kpi label="Risk alerts" value="6" sub="μεσαίου ρίσκου" />
              <Kpi label="Βουλή" value="8" sub="ενεργές συζητήσεις" />
            </div>

            <div className="mt-5">
              <h3 className="mb-3 text-sm font-semibold text-zinc-200">
                Κύρια θέματα σήμερα
              </h3>

              <div className="grid gap-3 md:grid-cols-3">
                {freeIssues.map((issue) => (
                  <div
                    key={issue.title}
                    className="rounded-3xl border border-white/10 bg-slate-950/60 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-lg">
                          {issue.icon}
                        </div>
                        <div>
                          <div className="font-semibold">{issue.title}</div>
                          <div className="mt-1 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[11px] text-amber-100">
                            {issue.status}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xl font-semibold">{issue.publicShare}</div>
                        <div className="text-[11px] text-zinc-500">δημόσια αναφορά</div>
                      </div>
                    </div>

                    <p className="mt-4 text-xs leading-5 text-zinc-500">
                      {issue.summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
              <div className="text-sm font-semibold text-cyan-100">
                AI σύνοψη γενικής εικόνας
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Σταθερό πολιτικό κλίμα. Η ακρίβεια παραμένει το κυρίαρχο θέμα,
                ενώ υγεία και αγροτικά εμφανίζουν αυξημένη δημόσια αναφορά.
                Για προσαρμοσμένη ανάλυση απαιτείται ρύθμιση οργανισμού.
              </p>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-cyan-950/10 backdrop-blur">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="mb-3 inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
                  3 · Προσωποποιημένη στρατηγική ανάλυση
                </div>

                <h2 className="text-2xl font-semibold">
                  {isPersonalized
                    ? `Σήμερα για ${organizationName}`
                    : "Σήμερα για τον οργανισμό σας"}
                </h2>

                <p className="mt-2 text-sm text-zinc-500">
                  {isPersonalized
                    ? "Με βάση τις θεματικές, ζητήματα, φορείς και θέσεις που δηλώσατε."
                    : "Συμπληρώστε το onboarding για να ενεργοποιηθεί πλήρως."}
                </p>
              </div>

              <Link
                href="/onboarding"
                className="rounded-2xl border border-cyan-300/25 px-4 py-2 text-xs text-cyan-100 hover:bg-cyan-300/10"
              >
                {isPersonalized ? "Ενημέρωση προφίλ" : "Ρύθμιση οργανισμού"}
              </Link>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <Kpi label="Συνολικό sentiment" value="+19" sub="θετικό" />
              <Kpi label="Narrative fit" value="73%" sub="συνάφεια" />
              <Kpi label="Κύρια ρίσκα" value="4" sub="υψηλής προτερ." />
              <Kpi label="Επίδραση" value="68%" sub="ενεργή" />
              <Kpi label="Ευκαιρίες" value="7" sub="ενεργές" />
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-200">
                  Κρίσιμα θέματα για εσάς
                </h3>
                <span className="text-xs text-zinc-500">
                  Ταξινόμηση: σημασία για εσάς
                </span>
              </div>

              {personalizedIssues.map((issue, index) => {
                const colors = getRiskColor(issue.color);

                if (index === 0) {
                  return (
                    <div
                      key={issue.title}
                      className={`rounded-3xl border ${colors.border} ${colors.bg} p-4`}
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-black/20 text-lg">
                            {issue.icon}
                          </div>
                          <div>
                            <div className="text-lg font-semibold">{issue.title}</div>
                            <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] ${colors.badge}`}>
                              {issue.importance}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm md:min-w-[260px]">
                          <Metric label="Ρίσκο" value={`${issue.risk}/100`} color="text-red-100" />
                          <Metric label="Narrative fit" value={`${issue.fit}%`} color="text-emerald-100" />
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr]">
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="text-xs text-zinc-500">Γιατί μας αφορά</div>
                          <p className="mt-2 text-sm leading-6 text-zinc-300">
                            {issue.why}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="text-xs text-zinc-500">Σύσταση ανάλυσης</div>
                          <p className="mt-2 text-sm leading-6 text-zinc-300">
                            {issue.recommendation}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <button className="rounded-xl border border-cyan-300/25 px-4 py-2 text-xs text-cyan-100 hover:bg-cyan-300/10">
                          Προβολή ανάλυσης →
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={issue.title}
                    className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 md:grid-cols-[1fr_110px_110px_40px]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
                        {issue.icon}
                      </div>
                      <div>
                        <div className="font-medium">{issue.title}</div>
                        <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] ${colors.badge}`}>
                          {issue.importance}
                        </div>
                      </div>
                    </div>

                    <div className="text-sm text-red-100">{issue.risk}/100</div>
                    <div className="text-sm text-emerald-100">{issue.fit}%</div>
                    <div className="text-zinc-500">⌄</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-3xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
              <div className="text-sm font-semibold text-cyan-100">
                AI σύνοψη για τον οργανισμό σας
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {isPersonalized
                  ? `Το προφίλ περιλαμβάνει ${selectedThemes.length} θεματικές, ${selectedIssues.length} ζητήματα, ${selectedEvents.length} γεγονότα και ${selectedStakeholders.length} κοινά ή φορείς. Το Noraya μπορεί να ταξινομεί προτεραιότητες με βάση το δικό σας πλαίσιο.`
                  : "Μετά τη ρύθμιση οργανισμού, εδώ θα εμφανίζεται εξατομικευμένη σύνοψη με βάση θεματικές, γεγονότα, ομάδες, φορείς και θέσεις."}
              </p>

              {isPersonalized && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedThemes.slice(0, 8).map((theme) => (
                    <span
                      key={theme}
                      className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className="grid gap-3 md:grid-cols-3">
            <FlowStep
              number="1"
              title="Δωρεάν γενική εικόνα"
              text="Παρακολουθήστε το γενικό πολιτικό τοπίο."
            />
            <FlowStep
              number="2"
              title="Ρύθμιση οργανισμού"
              text="Πείτε μας ποιοι είστε και τι σας ενδιαφέρει."
            />
            <FlowStep
              number="3"
              title="Προσωποποιημένη ανάλυση"
              text="Λάβετε στοχευμένη εικόνα από τον AI Σύμβουλο."
              active
            />
          </div>
        </main>

        <aside className="rounded-[2rem] border border-cyan-300/20 bg-slate-950/90 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                AI Σύμβουλος
              </div>
              <h2 className="mt-2 text-xl font-semibold">
                Σύμβουλος Ανάλυσης
              </h2>
            </div>

            <Image
              src="/noraya-eye.png"
              alt="Noraya"
              width={110}
              height={60}
              className="h-12 w-auto object-contain opacity-90"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-2 text-xs text-cyan-200">Ερώτηση</div>
            <p className="text-sm leading-6 text-zinc-100">
              Τι χρειάζεται προσοχή σήμερα με βάση το προφίλ μας;
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <AdvisorSection
              icon="→"
              title="Τι σημαίνει"
              text={
                isPersonalized
                  ? `Το Noraya συνδέει τα ζητήματα ${selectedIssues
                      .slice(0, 3)
                      .join(", ")} με τις θεματικές και τους φορείς που δηλώσατε.`
                  : "Σε γενικό επίπεδο, το πολιτικό περιβάλλον δείχνει αυξημένη ένταση σε κόστος ζωής, υγεία και κινητοποιήσεις."
              }
            />

            <AdvisorSection
              icon="!"
              title="Κίνδυνοι"
              text="Υπάρχει κίνδυνος αποσπασματικής εικόνας χωρίς σύνδεση με πηγές, γεγονότα, θεσμούς και προηγούμενες θέσεις."
            />

            <AdvisorSection
              icon="+"
              title="Ευκαιρίες"
              text="Η οργανωμένη παρακολούθηση θεμάτων μπορεί να αποκαλύψει έγκαιρα κλιμάκωση, κενά πληροφόρησης και ανάγκες τεκμηρίωσης."
            />

            <AdvisorSection
              icon="✓"
              title="Συνέπεια θέσεων"
              text={
                isPersonalized && (mission || redLines || tone)
                  ? `Υπάρχει αρχικό πλαίσιο θέσεων. Το επόμενο βήμα είναι να συνδεθούν αρχεία, δηλώσεις και policy papers.`
                  : "Για πλήρη έλεγχο συνέπειας, προσθέστε αποστολή, κόκκινες γραμμές και αργότερα αρχεία θέσεων."
              }
            />

            <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4">
              <div className="mb-2 text-sm font-semibold text-cyan-100">
                Προτεινόμενο επόμενο βήμα
              </div>
              <p className="text-sm leading-6 text-zinc-200">
                Ανοίξτε Issue Room για το σημαντικότερο θέμα και ελέγξτε:
                πηγές, αφήγημα, κλιμάκωση, φορείς και συνέπεια με τις θέσεις.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300">
              Εξαγωγή ανάλυσης
            </button>

            <button className="rounded-xl bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950">
              Νέα ερώτηση
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[10px] text-zinc-500">
            <div className="rounded-xl border border-white/10 p-2">
              Ιδιωτικά δεδομένα
            </div>
            <div className="rounded-xl border border-white/10 p-2">
              Citations
            </div>
            <div className="rounded-xl border border-white/10 p-2">
              Audit-ready
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  text
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{text}</p>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{sub}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  color
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function AdvisorSection({
  icon,
  title,
  text
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <span className="grid h-6 w-6 place-items-center rounded-lg border border-cyan-300/20 text-cyan-200">
          {icon}
        </span>
        {title}
      </div>

      <p className="text-sm leading-6 text-zinc-400">{text}</p>
    </div>
  );
}

function FlowStep({
  number,
  title,
  text,
  active
}: {
  number: string;
  title: string;
  text: string;
  active?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-4 ${
        active
          ? "border-emerald-300/30 bg-emerald-300/10"
          : "border-cyan-300/20 bg-cyan-300/[0.05]"
      }`}
    >
      <div className="mb-3 flex items-center gap-3">
        <div
          className={`grid h-9 w-9 place-items-center rounded-2xl border text-sm ${
            active
              ? "border-emerald-300/40 text-emerald-100"
              : "border-cyan-300/30 text-cyan-100"
          }`}
        >
          {number}
        </div>
        <div className="font-semibold text-zinc-100">{title}</div>
      </div>
      <p className="text-xs leading-5 text-zinc-500">{text}</p>
    </div>
  );
}
