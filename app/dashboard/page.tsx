"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
    type: "Γενική εικόνα"
  },
  themes: ["Ακρίβεια / κόστος ζωής", "Υγεία", "Στέγαση"],
  issues: ["Ακρίβεια τροφίμων", "Ενοίκια", "ΕΣΥ"],
  events: ["Κοινωνικές αντιδράσεις"],
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

const issueCards = [
  {
    title: "Ακρίβεια",
    theme: "Ακρίβεια / κόστος ζωής",
    icon: "🛒",
    status: "Υψηλή προσοχή",
    trend: "Ανοδική",
    risk: 78,
    relevance: 86,
    color: "red",
    summary:
      "Η πίεση παραμένει υψηλή σε τρόφιμα, ενέργεια και καθημερινό κόστος. Το θέμα συνδέεται με εισόδημα, εμπιστοσύνη και κοινωνική ένταση."
  },
  {
    title: "Στέγαση",
    theme: "Στέγαση",
    icon: "🏠",
    status: "Αναδυόμενο ρίσκο",
    trend: "Ανοδική",
    risk: 69,
    relevance: 74,
    color: "amber",
    summary:
      "Τα ενοίκια, η φοιτητική στέγη και η βραχυχρόνια μίσθωση εμφανίζουν αυξημένη ένταση στον δημόσιο λόγο."
  },
  {
    title: "Υγεία",
    theme: "Υγεία",
    icon: "♡",
    status: "Πιθανή κλιμάκωση",
    trend: "Σταθερή",
    risk: 62,
    relevance: 71,
    color: "amber",
    summary:
      "Αυξάνονται οι αναφορές σε αναμονές, ελλείψεις προσωπικού και πρόσβαση σε υπηρεσίες υγείας."
  },
  {
    title: "Αγροτικά",
    theme: "Αγροτικά",
    icon: "🌿",
    status: "Σήμα κινητικότητας",
    trend: "Ανοδική",
    risk: 55,
    relevance: 61,
    color: "emerald",
    summary:
      "Η κινητικότητα στον αγροτικό χώρο δείχνει ανάγκη παρακολούθησης κόστους παραγωγής, ενέργειας και περιφερειακής πίεσης."
  }
];

const kpis = [
  {
    label: "Δημόσιο κλίμα",
    value: "+12",
    sub: "μεταβολή 24ώρου"
  },
  {
    label: "Ενεργά αφηγήματα",
    value: "48",
    sub: "σε δημόσιες πηγές"
  },
  {
    label: "Risk alerts",
    value: "4",
    sub: "χρειάζονται έλεγχο"
  },
  {
    label: "Πηγές",
    value: "500+",
    sub: "ΜΜΕ / Βουλή / ανοικτά δεδομένα"
  }
];

function getColorClasses(color: string) {
  if (color === "red") {
    return {
      badge: "border-red-400/30 bg-red-400/10 text-red-100",
      panel: "border-red-400/20 bg-red-400/10",
      text: "text-red-100"
    };
  }

  if (color === "amber") {
    return {
      badge: "border-amber-400/30 bg-amber-400/10 text-amber-100",
      panel: "border-amber-400/20 bg-amber-400/10",
      text: "text-amber-100"
    };
  }

  return {
    badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    panel: "border-emerald-400/20 bg-emerald-400/10",
    text: "text-emerald-100"
  };
}

function readProfile(): NorayaProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem("noraya_org_profile");
    return stored ? (JSON.parse(stored) as NorayaProfile) : null;
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<NorayaProfile | null>(null);

  useEffect(() => {
    setProfile(readProfile());
  }, []);

  const isPersonalized = Boolean(profile);
  const activeProfile = profile ?? fallbackProfile;

  const organizationName =
    activeProfile.organization?.name || fallbackProfile.organization?.name || "Free Preview";

  const organizationType =
    activeProfile.organization?.type || fallbackProfile.organization?.type || "Γενική εικόνα";

  const selectedThemes = activeProfile.themes ?? fallbackProfile.themes ?? [];
  const selectedIssues = activeProfile.issues ?? fallbackProfile.issues ?? [];
  const selectedEvents = activeProfile.events ?? fallbackProfile.events ?? [];

  const selectedStakeholders = useMemo(() => {
    const stakeholders = activeProfile.stakeholders ?? fallbackProfile.stakeholders ?? {};

    return [
      ...(stakeholders.ageGroups ?? []),
      ...(stakeholders.socialGroups ?? []),
      ...(stakeholders.professionalGroups ?? []),
      ...(stakeholders.institutions ?? []),
      ...(stakeholders.publicActors ?? [])
    ];
  }, [activeProfile]);

  const visibleCards = useMemo(() => {
    const filtered = issueCards.filter((card) => selectedThemes.includes(card.theme));
    return filtered.length > 0 ? filtered : issueCards.slice(0, 3);
  }, [selectedThemes]);

  return (
    <div className="min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(34,211,238,0.18),transparent_32%),radial-gradient(circle_at_85%_20%,rgba(16,185,129,0.10),transparent_28%),radial-gradient(circle_at_50%_80%,rgba(59,130,246,0.08),transparent_32%)]" />

      <div className="relative mx-auto grid max-w-7xl gap-6 px-5 py-8 lg:grid-cols-[250px_minmax(0,1fr)_380px]">
        <aside className="rounded-3xl border border-cyan-300/10 bg-white/[0.035] p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-lg font-semibold text-cyan-100">
              N
            </div>
            <div>
              <div className="tracking-[0.32em] text-zinc-100">NORAYA</div>
              <div className="text-xs text-zinc-500">Political Intelligence</div>
            </div>
          </div>

          <nav className="space-y-2 text-sm">
            {["Σήμερα", "Θέματα", "Υποθέσεις", "Σενάρια", "Αναφορές"].map(
              (item, index) => (
                <div
                  key={item}
                  className={`rounded-2xl px-4 py-3 ${
                    index === 0
                      ? "border border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                  }`}
                >
                  {item}
                </div>
              )
            )}
          </nav>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Οργανισμός
            </div>
            <div className="mt-2 font-medium text-zinc-100">{organizationName}</div>
            <div className="mt-1 text-xs text-zinc-500">{organizationType}</div>

            <Link
              href="/onboarding"
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-cyan-300/20 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-300/10"
            >
              {isPersonalized ? "Αλλαγή προσαρμογής" : "Προσαρμογή οργανισμού"}
            </Link>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Κατάσταση
            </div>
            <div
              className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs ${
                isPersonalized
                  ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                  : "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
              }`}
            >
              {isPersonalized ? "Προσωποποιημένο" : "Free Preview"}
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-cyan-950/10 backdrop-blur">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="mb-3 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                  {isPersonalized
                    ? "Με προσαρμογή οργανισμού"
                    : "Δωρεάν γενική εικόνα"}
                </div>

                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  {isPersonalized
                    ? `Σήμερα για ${organizationName}`
                    : "Γενική εικόνα σήμερα"}
                </h1>

                <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                  {isPersonalized
                    ? "Το Noraya συνδέει δημόσια δεδομένα, θεματικές, γεγονότα, κοινά και δηλωμένες θέσεις για να δώσει καθαρή εικόνα ρίσκου και προτεραιοτήτων."
                    : "Αυτή είναι η γενική εικόνα του πολιτικού περιβάλλοντος. Με προσαρμογή οργανισμού, το dashboard αποκτά δικές σας θεματικές, υποθέσεις και έλεγχο συνέπειας θέσεων."}
                </p>
              </div>

              {!isPersonalized && (
                <Link
                  href="/onboarding"
                  className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-200"
                >
                  Προσαρμογή τώρα →
                </Link>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {kpis.map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="text-xs text-zinc-500">{kpi.label}</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {kpi.value}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{kpi.sub}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  {isPersonalized ? "Κρίσιμα ζητήματα για εσάς" : "Κύρια ζητήματα σήμερα"}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {isPersonalized
                    ? "Ταξινόμηση με βάση τις θεματικές και τα ζητήματα που δηλώσατε."
                    : "Γενική ταξινόμηση χωρίς προφίλ οργανισμού."}
                </p>
              </div>

              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">
                Ενημερώθηκε τώρα
              </span>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {visibleCards.map((card) => {
                const colors = getColorClasses(card.color);

                return (
                  <article
                    key={card.title}
                    className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 transition hover:border-cyan-300/30"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl">
                          {card.icon}
                        </div>

                        <div>
                          <h3 className="text-lg font-semibold">{card.title}</h3>
                          <div
                            className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-[11px] ${colors.badge}`}
                          >
                            {card.status}
                          </div>
                        </div>
                      </div>

                      <div className="text-right text-xs text-zinc-500">
                        Τάση
                        <div className="mt-1 text-sm text-cyan-100">{card.trend}</div>
                      </div>
                    </div>

                    <p className="mt-5 min-h-[72px] text-sm leading-6 text-zinc-400">
                      {card.summary}
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div className={`rounded-2xl border p-3 ${colors.panel}`}>
                        <div className="text-zinc-400">Risk score</div>
                        <div className={`mt-1 text-lg font-semibold ${colors.text}`}>
                          {card.risk}/100
                        </div>
                      </div>

                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                        <div className="text-zinc-400">
                          {isPersonalized ? "Συνάφεια" : "Δημόσια ένταση"}
                        </div>
                        <div className="mt-1 text-lg font-semibold text-emerald-100">
                          {card.relevance}%
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button className="rounded-xl bg-white px-4 py-2 text-xs font-medium text-slate-950">
                        Δες ανάλυση
                      </button>

                      <button className="rounded-xl border border-white/10 px-4 py-2 text-xs text-zinc-300">
                        Δες πρόβλεψη
                      </button>

                      <button className="rounded-xl border border-cyan-300/20 px-4 py-2 text-xs text-cyan-100">
                        Έλεγχος συνέπειας
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[0.04] p-6 backdrop-blur">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  {isPersonalized
                    ? "AI σύνοψη για τον οργανισμό σας"
                    : "AI σύνοψη γενικής εικόνας"}
                </h2>

                <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                  {isPersonalized
                    ? `Το προφίλ σας περιλαμβάνει ${selectedThemes.length} θεματικές, ${selectedIssues.length} ζητήματα και ${selectedStakeholders.length} ομάδες ή φορείς. Το Noraya μπορεί να αρχίσει να ταξινομεί τι έχει μεγαλύτερη σημασία για εσάς.`
                    : "Η γενική εικόνα δείχνει αυξημένη ένταση σε κόστος ζωής, στέγαση και υπηρεσίες υγείας. Για πιο ακριβή αξιολόγηση χρειάζεται προσαρμογή οργανισμού."}
                </p>

                {isPersonalized && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedThemes.slice(0, 8).map((theme) => (
                      <span
                        key={theme}
                        className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs text-cyan-100"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <Link
                href="/onboarding"
                className="rounded-2xl border border-cyan-300/30 px-5 py-3 text-sm text-cyan-100 transition hover:bg-cyan-300/10"
              >
                {isPersonalized ? "Ενημέρωση προφίλ" : "Ξεκλείδωσε προσαρμογή"}
              </Link>
            </div>
          </section>
        </main>

        <aside className="rounded-3xl border border-cyan-300/20 bg-slate-950/90 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                AI Σύμβουλος
              </div>
              <h2 className="mt-2 text-xl font-semibold">
                Σύμβουλος Ανάλυσης
              </h2>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
              ✦
            </div>
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
                  ? `Το Noraya βλέπει αυξημένη συνάφεια στα ζητήματα: ${selectedIssues
                      .slice(0, 3)
                      .join(", ")}. Αυτά πρέπει να παρακολουθούνται μαζί με πηγές, θεσμούς και γεγονότα.`
                  : "Σε γενικό επίπεδο, το πολιτικό περιβάλλον δείχνει ένταση γύρω από κόστος ζωής, στέγαση και υγεία."
              }
            />

            <AdvisorSection
              icon="!"
              title="Κίνδυνοι"
              text="Υπάρχει ρίσκο να ληφθούν αποφάσεις με αποσπασματική εικόνα, χωρίς σύνδεση με δεδομένα, θεσμικό πλαίσιο και προηγούμενες θέσεις."
            />

            <AdvisorSection
              icon="✓"
              title="Συνέπεια θέσεων"
              text={
                isPersonalized && activeProfile.positions?.mission
                  ? `Η βασική γραμμή που δηλώσατε είναι: ${activeProfile.positions.mission}`
                  : "Για πλήρη έλεγχο συνέπειας, προσθέστε αποστολή, κόκκινες γραμμές και αργότερα αρχεία θέσεων."
              }
            />

            <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4">
              <div className="mb-2 text-sm font-semibold text-cyan-100">
                Προτεινόμενο επόμενο βήμα
              </div>
              <p className="text-sm leading-6 text-zinc-200">
                Ανοίξτε ένα Issue Room για το πιο κρίσιμο θέμα και ελέγξτε:
                πηγές, αφήγημα, θεσμικές εξελίξεις, ρίσκο και συνέπεια με τις
                δηλωμένες θέσεις.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300">
              Εξαγωγή
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
