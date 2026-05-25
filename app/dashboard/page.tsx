"use client";

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

interface Article {
  id: string;
  title: string;
  description: string | null;
  link: string;
  image_url?: string | null;
  source_name: string;
  category: string | null;
  author?: string | null;
  published_at: string | null;
}

type ThemeSignal = {
  theme: string;
  count: number;
  priority: "high" | "medium" | "low" | "none";
  signal: string;
  why: string;
  action: string;
  latestTitle: string;
  affectedGroups: string[];
};

type AdvisorMode = "analysis" | "scenario" | "stance";

const DEFAULT_THEMES = [
  "Ακρίβεια / κόστος ζωής",
  "Υγεία",
  "Στέγαση"
];

const THEME_KEYWORDS: Record<string, string[]> = {
  "Ακρίβεια / κόστος ζωής": [
    "ακρίβεια",
    "τιμ",
    "κόστος",
    "πληθωρισμ",
    "τρόφιμ",
    "καύσιμ",
    "σούπερ μάρκετ",
    "καταναλωτ",
    "φπα",
    "ρεύμα",
    "λογαριασμ"
  ],
  "Οικονομία": [
    "οικονομ",
    "ανάπτυξ",
    "αεπ",
    "επενδύ",
    "χρέος",
    "αγορές",
    "δημοσιονομ"
  ],
  "Φορολογία": [
    "φόρο",
    "φορολογ",
    "φπα",
    "ενφια",
    "φοροδιαφυγ",
    "εισόδημα",
    "τεκμήρια"
  ],
  "Στέγαση": [
    "στέγασ",
    "ενοίκι",
    "κατοικ",
    "ακίνητ",
    "airbnb",
    "στεγαστικ",
    "φοιτητική στέγη"
  ],
  "Εργασία": [
    "εργασ",
    "μισθ",
    "ανεργ",
    "εργαζόμεν",
    "συλλογικ",
    "απεργ",
    "απασχόλησ"
  ],
  "Υγεία": [
    "υγεί",
    "νοσοκομ",
    "εσυ",
    "γιατρ",
    "φαρμακ",
    "ασθεν",
    "κλινικ",
    "νοσηλευ"
  ],
  "Παιδεία": [
    "παιδεί",
    "σχολ",
    "εκπαίδευ",
    "μαθητ",
    "καθηγητ",
    "πανελλαδικ"
  ],
  "Πανεπιστήμια": [
    "πανεπιστήμ",
    "φοιτητ",
    "αει",
    "πτυχ",
    "ιδιωτικά πανεπιστήμια"
  ],
  "Μεταναστευτικό": [
    "μεταναστ",
    "πρόσφυγ",
    "άσυλο",
    "frontex",
    "σύνορα",
    "προσφυγ"
  ],
  "Ασφάλεια / εγκληματικότητα": [
    "αστυνομ",
    "εγκλημ",
    "ασφάλεια",
    "δολοφον",
    "ληστε",
    "ναρκωτ"
  ],
  "Δικαιοσύνη": [
    "δικαιοσύν",
    "δικαστ",
    "εισαγγελ",
    "δίκη",
    "καταδίκ",
    "ποινικ"
  ],
  "Θεσμοί / διαφάνεια": [
    "θεσμ",
    "διαφάνει",
    "βουλή",
    "νομοσχέδ",
    "εξεταστική",
    "ανεξάρτητη αρχή"
  ],
  "Άμυνα": [
    "άμυν",
    "στρατ",
    "εξοπλισμ",
    "ένοπλες",
    "αμυντικ"
  ],
  "Γεωπολιτική": [
    "τουρκία",
    "αιγαίο",
    "κύπρος",
    "νατο",
    "ουκρανία",
    "μέση ανατολή",
    "γεωπολιτικ"
  ],
  "Ενέργεια": [
    "ενέργεια",
    "ρεύμα",
    "δεη",
    "φυσικό αέριο",
    "πετρέλαιο",
    "ανανεώσιμ"
  ],
  "Περιβάλλον / κλιματική κρίση": [
    "περιβάλλον",
    "κλιματ",
    "πλημμύρ",
    "πυρκαγι",
    "ρύπ",
    "ανακύκλω"
  ],
  "Αγροτικά": [
    "αγρότ",
    "αγροτ",
    "κτηνοτροφ",
    "καλλιέργ",
    "παραγωγ",
    "ελγα",
    "μπλόκα"
  ],
  "Υποδομές / μεταφορές": [
    "υποδομ",
    "μεταφορ",
    "τρένο",
    "σιδηρόδρομ",
    "τέμπη",
    "μετρό",
    "οδική"
  ],
  "Ευρωπαϊκή πολιτική": [
    "ευρωπαϊκ",
    "ευρωβουλ",
    "κομισιόν",
    "ευρωκοινοβούλιο",
    "βρυξέλλες"
  ],
  "Ανθρώπινα δικαιώματα": [
    "δικαιώμα",
    "ελευθερ",
    "διάκρισ",
    "ρατσισμ",
    "μειονότη"
  ],
  "Ισότητα / συμπερίληψη": [
    "ισότητα",
    "συμπερίληψη",
    "λοατκι",
    "έμφυλ",
    "γυναίκες"
  ],
  "Πολιτική προστασία": [
    "πολιτική προστασία",
    "112",
    "πυροσβεσ",
    "σεισμ",
    "πλημμύρ",
    "εμακ"
  ]
};

const THEME_ICONS: Record<string, string> = {
  "Ακρίβεια / κόστος ζωής": "🏷️",
  "Οικονομία": "📊",
  "Φορολογία": "🧾",
  "Στέγαση": "🏠",
  "Εργασία": "💼",
  "Υγεία": "🏥",
  "Παιδεία": "📚",
  "Πανεπιστήμια": "🎓",
  "Μεταναστευτικό": "🌍",
  "Ασφάλεια / εγκληματικότητα": "🛡️",
  "Δικαιοσύνη": "⚖️",
  "Θεσμοί / διαφάνεια": "🏛️",
  "Άμυνα": "🎖️",
  "Γεωπολιτική": "🌐",
  "Ενέργεια": "⚡",
  "Περιβάλλον / κλιματική κρίση": "🌿",
  "Αγροτικά": "🌾",
  "Υποδομές / μεταφορές": "🚆",
  "Ευρωπαϊκή πολιτική": "🇪🇺",
  "Ανθρώπινα δικαιώματα": "✊",
  "Ισότητα / συμπερίληψη": "🤝",
  "Πολιτική προστασία": "🚨"
};

function matchTheme(article: Article, keywords: string[]) {
  const text = `${article.title || ""} ${article.description || ""} ${
    article.category || ""
  }`.toLowerCase();

  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function readLocalProfile(): NorayaProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem("noraya_org_profile");
    return stored ? (JSON.parse(stored) as NorayaProfile) : null;
  } catch {
    return null;
  }
}

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

function priorityFromCount(count: number): ThemeSignal["priority"] {
  if (count >= 6) return "high";
  if (count >= 2) return "medium";
  if (count >= 1) return "low";
  return "none";
}

function priorityLabel(priority: ThemeSignal["priority"]) {
  if (priority === "high") return "Υψηλή προσοχή";
  if (priority === "medium") return "Παρακολούθηση";
  if (priority === "low") return "Χαμηλό σήμα";
  return "Χωρίς ισχυρό σήμα";
}

function priorityClasses(priority: ThemeSignal["priority"]) {
  if (priority === "high") {
    return "border-red-400/30 bg-red-400/10 text-red-100";
  }

  if (priority === "medium") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  }

  if (priority === "low") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100";
  }

  return "border-zinc-400/20 bg-zinc-400/10 text-zinc-400";
}

function getThemeWhy(theme: string, count: number) {
  if (count === 0) {
    return "Δεν υπάρχει ακόμα αρκετή σχετική κάλυψη στα σημερινά δεδομένα.";
  }

  if (theme.includes("Ακρίβεια")) {
    return "Συνδέεται άμεσα με κόστος ζωής, νοικοκυριά και πολιτική πίεση γύρω από τιμές.";
  }

  if (theme.includes("Υγεία")) {
    return "Αφορά καθημερινή πρόσβαση σε υπηρεσίες, εμπιστοσύνη στο κράτος και κοινωνική ασφάλεια.";
  }

  if (theme.includes("Στέγαση")) {
    return "Επηρεάζει νέους, οικογένειες, φοιτητές και μεσαία τάξη.";
  }

  if (theme.includes("Μεταναστευτικό")) {
    return "Συνδέεται με σύνορα, κοινωνική συνοχή, ευρωπαϊκή πολιτική και τοπικές πιέσεις.";
  }

  if (theme.includes("Γεωπολιτική") || theme.includes("Άμυνα")) {
    return "Μπορεί να επηρεάσει δημόσιο αίσθημα ασφάλειας, διεθνείς σχέσεις και πολιτική ατζέντα.";
  }

  return "Υπάρχει σχετική δημόσια αναφορά που χρειάζεται ταξινόμηση και παρακολούθηση.";
}

function getThemeAction(theme: string, count: number) {
  if (count === 0) {
    return "Κρατήστε το σε παρακολούθηση. Δεν χρειάζεται άμεση ενέργεια σήμερα.";
  }

  if (theme.includes("Ακρίβεια")) {
    return "Ζητήστε από τον Noraya σενάριο για ΦΠΑ, τιμές και μετακύλιση στο ράφι.";
  }

  if (theme.includes("Υγεία")) {
    return "Ελέγξτε αν υπάρχει τοπική ή θεσμική διάσταση πριν από δημόσια τοποθέτηση.";
  }

  if (theme.includes("Στέγαση")) {
    return "Συνδέστε το με κοινωνικές ομάδες: νέοι, φοιτητές, οικογένειες, ενοικιαστές.";
  }

  return "Ανοίξτε ανάλυση και δείτε τις πηγές πριν διαμορφωθεί θέση.";
}

function getAffectedGroups(theme: string) {
  if (theme.includes("Ακρίβεια")) {
    return ["νοικοκυριά", "συνταξιούχοι", "εργαζόμενοι", "οικογένειες"];
  }

  if (theme.includes("Υγεία")) {
    return ["ασθενείς", "ηλικιωμένοι", "υγειονομικοί", "οικογένειες"];
  }

  if (theme.includes("Στέγαση")) {
    return ["νέοι", "φοιτητές", "ενοικιαστές", "νέες οικογένειες"];
  }

  if (theme.includes("Αγροτικά")) {
    return ["αγρότες", "κτηνοτρόφοι", "περιφέρεια", "καταναλωτές"];
  }

  if (theme.includes("Μεταναστευτικό")) {
    return ["τοπικές κοινωνίες", "πρόσφυγες", "μετανάστες", "δήμοι"];
  }

  return ["πολίτες", "φορείς", "θεσμοί"];
}

function buildThemeSignals(themes: string[], articles: Article[]): ThemeSignal[] {
  return themes.map((theme) => {
    const keywords = THEME_KEYWORDS[theme] || [theme];
    const matched = articles.filter((article) => matchTheme(article, keywords));
    const count = matched.length;
    const priority = priorityFromCount(count);

    return {
      theme,
      count,
      priority,
      signal:
        count > 0
          ? `${count} σχετικές αναφορές στα διαθέσιμα άρθρα`
          : "Δεν εντοπίστηκε ισχυρό σήμα σήμερα",
      why: getThemeWhy(theme, count),
      action: getThemeAction(theme, count),
      latestTitle: matched[0]?.title || "Δεν υπάρχει πρόσφατο σχετικό άρθρο.",
      affectedGroups: getAffectedGroups(theme)
    };
  });
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<NorayaProfile | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [advisorMode, setAdvisorMode] = useState<AdvisorMode>("analysis");
  const [advisorQuestion, setAdvisorQuestion] = useState("");
  const [advisorAnswer, setAdvisorAnswer] = useState("");
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorError, setAdvisorError] = useState("");

  useEffect(() => {
    (async () => {
      let loadedProfile: NorayaProfile | null = null;

      try {
        const res = await fetch("/api/onboarding");

        if (res.ok) {
          const data = await res.json();

          if (data && data.onboarding_completed) {
            loadedProfile = dbRowToProfile(data);
          }
        }
      } catch {
        // fallback below
      }

      if (!loadedProfile) {
        loadedProfile = readLocalProfile();
      }

      setProfile(loadedProfile);

      try {
        const res = await fetch("/api/articles?limit=100");

        if (res.ok) {
          const data = await res.json();
          setArticles(data.articles || []);
        }
      } catch {
        // keep empty
      }

      setLoading(false);
    })();
  }, []);

  const organizationName = profile?.organization?.name || "Noraya";
  const organizationType = profile?.organization?.type || "Γενική εικόνα";

  const activeThemes =
    profile?.themes && profile.themes.length > 0
      ? profile.themes
      : DEFAULT_THEMES;

  const themeSignals = useMemo(
    () => buildThemeSignals(activeThemes, articles),
    [activeThemes, articles]
  );

  const topSignal =
    themeSignals.find((signal) => signal.priority === "high") ||
    themeSignals.find((signal) => signal.priority === "medium") ||
    themeSignals[0];

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const article of articles) {
      counts[article.source_name] = (counts[article.source_name] || 0) + 1;
    }

    return counts;
  }, [articles]);

  const sourceCount = Object.keys(sourceCounts).length;

  const recommendedQuestion = topSignal?.theme.includes("Ακρίβεια")
    ? "Αν προτείνουμε μείωση ΦΠΑ στα τρόφιμα ή στα καύσιμα, τι ρίσκο έχουμε;"
    : `Τι πρέπει να προσέξουμε σήμερα για το θέμα "${topSignal?.theme || "επικαιρότητα"}";`;

  const askAdvisor = async (
    questionOverride?: string,
    modeOverride?: AdvisorMode
  ) => {
    const questionToAsk = (questionOverride || advisorQuestion).trim();
    const modeToUse = modeOverride || advisorMode;

    if (!questionToAsk) {
      setAdvisorError("Γράψε μια ερώτηση ή διάλεξε μία από τις προτεινόμενες κινήσεις.");
      return;
    }

    setAdvisorLoading(true);
    setAdvisorError("");
    setAdvisorAnswer("");

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: questionToAsk,
          mode: modeToUse
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setAdvisorError(data.error || "Ο Noraya δεν μπόρεσε να απαντήσει.");
        return;
      }

      setAdvisorAnswer(data.response || "Δεν ήρθε απάντηση.");
      setAdvisorQuestion(questionToAsk);
      setAdvisorMode(modeToUse);
    } catch {
      setAdvisorError("Υπήρξε σφάλμα σύνδεσης με τον σύμβουλο.");
    } finally {
      setAdvisorLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-cyan-300" />
          <div className="text-sm text-zinc-500">Ο Noraya ετοιμάζει την ημερήσια εικόνα...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.08),transparent_28%)]" />

      <main className="relative mx-auto max-w-6xl px-5 py-8">
        <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
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
                  Daily Political Brief
                </div>
              </div>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight">
              Σήμερα για {organizationName}
            </h1>

            <p className="mt-2 text-sm text-zinc-500">
              {organizationType} · {articles.length} άρθρα · {sourceCount} πηγές ·{" "}
              {activeThemes.length} θεματικές σε παρακολούθηση
            </p>
          </div>

          <Link
            href="/onboarding"
            className="rounded-2xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white"
          >
            Ρύθμιση προφίλ
          </Link>
        </header>

        <section className="mb-6 rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.05] p-6 shadow-2xl shadow-cyan-950/10">
          <div className="mb-3 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
            Ημερήσια εκτίμηση
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <div>
              <h2 className="text-2xl font-semibold">
                {topSignal?.priority === "high"
                  ? `Το βασικό σήμα σήμερα είναι: ${topSignal.theme}`
                  : topSignal?.priority === "medium"
                    ? `Χρειάζεται παρακολούθηση: ${topSignal.theme}`
                    : "Δεν υπάρχει ακόμη ισχυρό σήμα υψηλής προτεραιότητας."}
              </h2>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                {topSignal?.why}
              </p>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Κύρια σύσταση
                </div>

                <p className="text-sm leading-6 text-zinc-100">
                  {topSignal?.action}
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                Τι χρειάζεται τώρα
              </div>

              <div className="mt-4 space-y-3">
                <ActionRow
                  number="1"
                  title="Δες το βασικό θέμα"
                  text={topSignal?.theme || "Επικαιρότητα"}
                />
                <ActionRow
                  number="2"
                  title="Ζήτησε σενάριο"
                  text="Πριν από δημόσια θέση ή ψήφο"
                />
                <ActionRow
                  number="3"
                  title="Έλεγξε συνέπεια"
                  text="Με τις δηλωμένες θέσεις"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-3 md:grid-cols-3">
          <StatCard label="Πηγές" value={String(sourceCount)} sub="ενεργές σήμερα" />
          <StatCard label="Άρθρα" value={String(articles.length)} sub="σε επεξεργασία" />
          <StatCard
            label="Θέματα"
            value={String(activeThemes.length)}
            sub="προσαρμοσμένα στο προφίλ"
          />
        </section>

        <section className="mb-6">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Προτεραιότητες σήμερα</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Ο Noraya δεν σου δείχνει τα πάντα. Σου δείχνει τι χρειάζεται προσοχή.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {themeSignals.map((signal) => (
              <ThemeCard key={signal.theme} signal={signal} />
            ))}
          </div>
        </section>

        <section className="mb-6 rounded-[2rem] border border-white/10 bg-white/[0.035] p-6">
          <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
                Σύμβουλος Noraya
              </div>

              <h2 className="text-xl font-semibold">Επόμενη κίνηση</h2>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Με βάση την ημερήσια εικόνα, διάλεξε τι χρειάζεσαι τώρα ή γράψε δική σου ερώτηση.
                Ο Noraya θα απαντήσει ως σύμβουλος απόφασης, όχι ως απλό chat.
              </p>

              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void askAdvisor(
                      `Τι συμβαίνει σήμερα στο θέμα "${topSignal?.theme || "επικαιρότητα"}" και γιατί έχει σημασία;`,
                      "analysis"
                    )
                  }
                  className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-left transition hover:border-cyan-300/30"
                >
                  <div className="text-sm font-semibold text-cyan-100">Ανάλυση θέματος</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-500">
                    Τι συμβαίνει, γιατί έχει σημασία και τι χρειάζεται προσοχή.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => void askAdvisor(recommendedQuestion, "scenario")}
                  className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-left transition hover:border-cyan-300/30"
                >
                  <div className="text-sm font-semibold text-cyan-100">Σενάριο απόφασης</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-500">
                    Αν πάρουμε αυτή τη στάση, τι μπορεί να γίνει;
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void askAdvisor(
                      `Ποιες κοινωνικές ομάδες επηρεάζονται περισσότερο από το θέμα "${topSignal?.theme || "αυτό"}";`,
                      "analysis"
                    )
                  }
                  className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-left transition hover:border-cyan-300/30"
                >
                  <div className="text-sm font-semibold text-cyan-100">Κοινωνικός χάρτης</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-500">
                    Ποιες ομάδες επηρεάζονται και πώς.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void askAdvisor(
                      "Πώς μπορούμε να τοποθετηθούμε θεσμικά, χωρίς να αυξήσουμε το πολιτικό ρίσκο;",
                      "stance"
                    )
                  }
                  className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-left transition hover:border-cyan-300/30"
                >
                  <div className="text-sm font-semibold text-cyan-100">Ασφαλής διατύπωση</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-500">
                    Βρες ανθρώπινη, θεσμική και ασφαλή γραμμή.
                  </div>
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-300/15 bg-slate-950/70 p-5">
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAdvisorMode("analysis")}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    advisorMode === "analysis"
                      ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                      : "border-white/10 text-zinc-500"
                  }`}
                >
                  Ανάλυση
                </button>

                <button
                  type="button"
                  onClick={() => setAdvisorMode("scenario")}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    advisorMode === "scenario"
                      ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                      : "border-white/10 text-zinc-500"
                  }`}
                >
                  Σενάριο
                </button>

                <button
                  type="button"
                  onClick={() => setAdvisorMode("stance")}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    advisorMode === "stance"
                      ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                      : "border-white/10 text-zinc-500"
                  }`}
                >
                  Συνέπεια
                </button>
              </div>

              <textarea
                value={advisorQuestion}
                onChange={(event) => setAdvisorQuestion(event.target.value)}
                rows={4}
                placeholder="Γράψε εδώ την ερώτησή σου προς τον Noraya..."
                className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300/40"
              />

              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-zinc-600">
                  Παράδειγμα: {recommendedQuestion}
                </div>

                <button
                  type="button"
                  onClick={() => void askAdvisor()}
                  disabled={advisorLoading}
                  className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {advisorLoading ? "Ο Noraya σκέφτεται..." : "Ρώτα τον Noraya"}
                </button>
              </div>

              {advisorError && (
                <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
                  {advisorError}
                </div>
              )}

              {advisorAnswer && (
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-5">
                  <div className="mb-3 text-xs uppercase tracking-[0.2em] text-cyan-300">
                    Απάντηση Noraya
                  </div>

                  <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">
                    {advisorAnswer}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mb-8 rounded-[2rem] border border-white/10 bg-white/[0.025] p-5">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Πηγές που χρησιμοποιούνται</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Η ροή ΜΜΕ μένει ως evidence layer. Η ανάλυση χτίζεται από πάνω της.
            </p>
          </div>

          <NewsFeed />
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{sub}</div>
    </div>
  );
}

function ActionRow({
  number,
  title,
  text
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-cyan-300/20 text-xs text-cyan-100">
        {number}
      </div>

      <div>
        <div className="text-sm font-medium text-zinc-100">{title}</div>
        <div className="mt-0.5 text-xs text-zinc-500">{text}</div>
      </div>
    </div>
  );
}

function ThemeCard({ signal }: { signal: ThemeSignal }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-cyan-300/25 hover:bg-white/[0.05]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-black/20 text-xl">
            {THEME_ICONS[signal.theme] || "📌"}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              {signal.theme}
            </h3>

            <div
              className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-[11px] ${priorityClasses(
                signal.priority
              )}`}
            >
              {priorityLabel(signal.priority)}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xl font-semibold">{signal.count}</div>
          <div className="text-[11px] text-zinc-600">άρθρα</div>
        </div>
      </div>

      <p className="min-h-[48px] text-sm leading-6 text-zinc-400">
        {signal.why}
      </p>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-600">
          Επηρεάζονται
        </div>

        <div className="flex flex-wrap gap-1.5">
          {signal.affectedGroups.map((group) => (
            <span
              key={group}
              className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-zinc-400"
            >
              {group}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3">
        <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-cyan-300/80">
          Προτεινόμενη κίνηση
        </div>

        <p className="text-xs leading-5 text-zinc-300">
          {signal.action}
        </p>
      </div>
    </article>
  );
}
