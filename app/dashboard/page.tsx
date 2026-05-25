"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import NewsFeed from "@/components/ui/NewsFeed/NewsFeed";
import AiChat from "@/components/ui/AiChat/AiChat";

/* ───── types ───── */

type NorayaProfile = {
  organization?: { name?: string; type?: string };
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
  positions?: { mission?: string; redLines?: string; tone?: string };
};

interface Article {
  id: string;
  title: string;
  description: string | null;
  link: string;
  source_name: string;
  category: string | null;
  published_at: string | null;
}

/* ───── keyword map: theme → search terms ───── */

const THEME_KEYWORDS: Record<string, string[]> = {
  "Ακρίβεια / κόστος ζωής": [
    "ακρίβεια",
    "τιμ",
    "κόστος",
    "πληθωρισμ",
    "αγορά",
    "καταναλωτ",
    "σούπερ μάρκετ",
    "καύσιμ",
    "ρεύμα",
  ],
  "Οικονομία": [
    "οικονομ",
    "ΑΕΠ",
    "ανάπτυξ",
    "επένδυσ",
    "χρέος",
    "δημοσιονομ",
    "προϋπολογισμ",
  ],
  "Φορολογία": [
    "φόρο",
    "φορολο",
    "ΕΝΦΙΑ",
    "ΦΠΑ",
    "εισόδημα",
    "φοροδιαφυγ",
  ],
  "Στέγαση": [
    "στέγασ",
    "ενοίκι",
    "κατοικ",
    "ακίνητ",
    "Airbnb",
    "πλειστηριασμ",
  ],
  "Εργασία": [
    "εργασ",
    "μισθ",
    "ανεργ",
    "απασχόλ",
    "συνδικ",
    "απεργ",
    "εργαζόμεν",
  ],
  "Ασφαλιστικό / συντάξεις": [
    "σύνταξ",
    "ασφαλιστικ",
    "ΕΦΚΑ",
    "συνταξιούχ",
  ],
  "Υγεία": [
    "υγεί",
    "νοσοκομεί",
    "ΕΣΥ",
    "γιατρ",
    "φάρμακ",
    "κλινικ",
    "ασθεν",
    "πανδημ",
  ],
  "Παιδεία": [
    "παιδεί",
    "σχολεί",
    "εκπαίδευσ",
    "μαθητ",
    "δάσκαλ",
    "καθηγητ",
  ],
  "Πανεπιστήμια": [
    "πανεπιστήμι",
    "φοιτητ",
    "ΑΕΙ",
    "ακαδημ",
    "πτυχί",
  ],
  "Νεολαία": ["νέο", "νεολαί", "brain drain", "γενιά"],
  "Μεταναστευτικό": [
    "μεταναστ",
    "πρόσφυγ",
    "άσυλο",
    "προσφυγικ",
    "Frontex",
    "μετανάστ",
  ],
  "Ασφάλεια / εγκληματικότητα": [
    "αστυνομ",
    "εγκλημ",
    "ασφάλει",
    "δολοφον",
    "κλοπ",
    "ναρκωτ",
  ],
  "Δικαιοσύνη": [
    "δικαστ",
    "δικαιοσύν",
    "εισαγγελ",
    "ποινικ",
    "δίκη",
    "καταδίκ",
  ],
  "Θεσμοί / διαφάνεια": [
    "διαφάνει",
    "θεσμ",
    "Βουλή",
    "κοινοβουλ",
    "νομοσχέδι",
    "ψηφοφορ",
  ],
  "Άμυνα": [
    "αμυν",
    "στρατ",
    "ένοπλ",
    "θωρακισμ",
    "εξοπλισμ",
  ],
  "Γεωπολιτική": [
    "γεωπολιτικ",
    "NATO",
    "ΝΑΤΟ",
    "Τουρκία",
    "Ουκρανία",
    "πόλεμ",
  ],
  "Εξωτερική πολιτική": [
    "εξωτερικ",
    "διπλωματ",
    "πρεσβ",
    "ΟΗΕ",
    "ΕΕ",
    "Ευρωπαϊκ",
  ],
  "Ενέργεια": [
    "ενέργει",
    "ΔΕΗ",
    "φυσικό αέριο",
    "ηλεκτρ",
    "ανανεώσιμ",
    "πετρέλαι",
  ],
  "Περιβάλλον / κλιματική κρίση": [
    "περιβάλλον",
    "κλιματ",
    "ρύπ",
    "ανακύκλωσ",
    "πλημμύρ",
    "φωτι",
  ],
  "Αγροτικά": [
    "αγροτ",
    "αγρότ",
    "καλλιέργει",
    "κτηνοτροφ",
    "ΕΛΓΑ",
    "επιδοτ",
  ],
  "Υποδομές / μεταφορές": [
    "υποδομ",
    "μεταφορ",
    "αυτοκινητόδρομ",
    "μετρό",
    "σιδηρόδρομ",
    "Τέμπη",
  ],
  "Ψηφιακή πολιτική / τεχνολογία": [
    "ψηφιακ",
    "τεχνολογ",
    "AI",
    "gov.gr",
    "ηλεκτρονικ",
  ],
  "Πολιτισμός": [
    "πολιτισμ",
    "μουσεί",
    "θέατρο",
    "κινηματογράφ",
  ],
  "Αθλητισμός": [
    "αθλητ",
    "ολυμπιακ",
    "ποδοσφαίρ",
    "μπάσκετ",
    "γήπεδ",
  ],
  "Τοπική αυτοδιοίκηση": [
    "δήμο",
    "δημοτικ",
    "περιφέρει",
    "αυτοδιοίκησ",
  ],
  "Ευρωπαϊκή πολιτική": [
    "Ευρωπαϊκ",
    "Ευρωκοινοβούλι",
    "Κομισιόν",
    "Ευρωζών",
  ],
  "Ανθρώπινα δικαιώματα": [
    "δικαιώματ",
    "ελευθερί",
    "ρατσισμ",
    "διάκρισ",
  ],
  "Ισότητα / συμπερίληψη": [
    "ισότητ",
    "φεμινισμ",
    "ΛΟΑΤΚΙ",
    "συμπερίληψ",
    "έμφυλ",
  ],
  "Πολιτική προστασία": [
    "πολιτική προστασία",
    "σεισμ",
    "πυρκαγι",
    "πλημμύρ",
    "112",
    "ΕΜΑΚ",
  ],
};

/* ───── helpers ───── */

function matchTheme(article: Article, keywords: string[]): boolean {
  const text = (
    (article.title || "") +
    " " +
    (article.description || "") +
    " " +
    (article.category || "")
  ).toLowerCase();

  return keywords.some((kw) => text.includes(kw.toLowerCase()));
}

function dbRowToProfile(row: any): NorayaProfile {
  return {
    organization: {
      name: row.org_name || "",
      type: row.org_type || "",
    },
    themes: row.themes || [],
    issues: row.issues || [],
    events: row.events || [],
    stakeholders: row.stakeholders || {
      ageGroups: [],
      socialGroups: [],
      professionalGroups: [],
      institutions: [],
      publicActors: [],
    },
    positions: {
      mission: row.mission || "",
      redLines: row.red_lines || "",
      tone: row.tone || "",
    },
  };
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

/* ───── theme icon map ───── */

const THEME_ICONS: Record<string, string> = {
  "Ακρίβεια / κόστος ζωής": "🏷️",
  "Οικονομία": "📊",
  "Φορολογία": "🧾",
  "Στέγαση": "🏠",
  "Εργασία": "💼",
  "Ασφαλιστικό / συντάξεις": "🏦",
  "Υγεία": "🏥",
  "Παιδεία": "📚",
  "Πανεπιστήμια": "🎓",
  "Νεολαία": "🧑‍🎓",
  "Μεταναστευτικό": "🌍",
  "Ασφάλεια / εγκληματικότητα": "🛡️",
  "Δικαιοσύνη": "⚖️",
  "Θεσμοί / διαφάνεια": "🏛️",
  "Άμυνα": "🎖️",
  "Γεωπολιτική": "🌐",
  "Εξωτερική πολιτική": "🤝",
  "Ενέργεια": "⚡",
  "Περιβάλλον / κλιματική κρίση": "🌿",
  "Αγροτικά": "🌾",
  "Υποδομές / μεταφορές": "🚆",
  "Ψηφιακή πολιτική / τεχνολογία": "💻",
  "Πολιτισμός": "🎭",
  "Αθλητισμός": "⚽",
  "Τοπική αυτοδιοίκηση": "🏘️",
  "Ευρωπαϊκή πολιτική": "🇪🇺",
  "Ανθρώπινα δικαιώματα": "✊",
  "Ισότητα / συμπερίληψη": "🤝",
  "Πολιτική προστασία": "🚨",
};

/* ───── component ───── */

export default function DashboardPage() {
  const [profile, setProfile] = useState<NorayaProfile | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let prof: NorayaProfile | null = null;

      try {
        const res = await fetch("/api/onboarding");

        if (res.ok) {
          const data = await res.json();

          if (data && data.onboarding_completed) {
            prof = dbRowToProfile(data);
          }
        }
      } catch {}

      if (!prof) prof = readLocalProfile();

      setProfile(prof);

      try {
        const res = await fetch("/api/articles?limit=100");

        if (res.ok) {
          const data = await res.json();
          setArticles(data.articles || []);
        }
      } catch {}

      setLoading(false);
    })();
  }, []);

  const themeCounts: Record<string, { count: number; latestTitle: string }> = {};
  const userThemes = profile?.themes || [];

  for (const theme of userThemes) {
    const keywords = THEME_KEYWORDS[theme] || [];
    const matched = articles.filter((a) => matchTheme(a, keywords));

    themeCounts[theme] = {
      count: matched.length,
      latestTitle: matched[0]?.title || "Δεν βρέθηκαν ακόμα άρθρα",
    };
  }

  const sportsKeywords = THEME_KEYWORDS["Αθλητισμός"] || [];
  const politicalArticles = articles.filter((a) => !matchTheme(a, sportsKeywords));

  const orgName = profile?.organization?.name || "Noraya";
  const orgType = profile?.organization?.type || "";
  const hasProfile = !!profile?.organization?.name;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-cyan-300 rounded-full animate-spin" />
          <span className="text-zinc-500 text-sm">Φόρτωση dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.08),transparent_28%)]" />

      <div className="relative mx-auto max-w-6xl px-5 py-8">
        {/* ═══ Header ═══ */}
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <img src="/noraya-eye.png" alt="" className="h-10 w-10" />
              <div>
                <div className="text-xs tracking-[0.2em] text-cyan-300/70 uppercase">
                  NORAYA
                </div>
                <div className="text-xs text-zinc-600">
                  Political Intelligence
                </div>
              </div>
            </div>

            <h1 className="text-2xl font-semibold mt-4">
              {hasProfile ? orgName : "Γενική εικόνα"}
            </h1>

            <p className="text-sm text-zinc-500 mt-1">
              {hasProfile
                ? `${orgType} · ${articles.length} άρθρα σε παρακολούθηση · ${userThemes.length} θεματικές`
                : "Δωρεάν preview — ρυθμίστε τον οργανισμό σας για προσωποποιημένη ανάλυση"}
            </p>
          </div>

          <div className="flex gap-3">
            {!hasProfile && (
              <Link
                href="/onboarding"
                className="rounded-2xl bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                Ρύθμιση οργανισμού →
              </Link>
            )}

            {hasProfile && (
              <Link
                href="/onboarding"
                className="rounded-2xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
              >
                Ρυθμίσεις
              </Link>
            )}
          </div>
        </header>

        {/* ═══ Stats bar ═══ */}
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Πηγές" value="7" sub="ελληνικά ΜΜΕ" />
          <StatCard label="Άρθρα" value={String(articles.length)} sub="στη βάση" />
          <StatCard
            label="Θεματικές"
            value={String(userThemes.length || "—")}
            sub={hasProfile ? "σε παρακολούθηση" : "ρυθμίστε πρώτα"}
          />
          <StatCard
            label="Πολιτικά"
            value={String(politicalArticles.length)}
            sub="χωρίς αθλητικά"
          />
        </div>

        {/* ═══ Theme cards ═══ */}
        {hasProfile && userThemes.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Τα θέματά σας</h2>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {userThemes.map((theme) => {
                const data = themeCounts[theme] || {
                  count: 0,
                  latestTitle: "",
                };
                const icon = THEME_ICONS[theme] || "📌";

                return (
                  <div
                    key={theme}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl">{icon}</span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-medium truncate">
                            {theme}
                          </h3>

                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              data.count > 5
                                ? "bg-red-400/10 text-red-300 border border-red-400/20"
                                : data.count > 0
                                  ? "bg-amber-400/10 text-amber-300 border border-amber-400/20"
                                  : "bg-zinc-400/10 text-zinc-500 border border-zinc-400/20"
                            }`}
                          >
                            {data.count} άρθρα
                          </span>
                        </div>

                        <p className="text-xs text-zinc-500 mt-2 line-clamp-2 leading-5">
                          {data.latestTitle}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ═══ No profile CTA ═══ */}
        {!hasProfile && (
          <section className="mb-8 rounded-2xl border border-dashed border-cyan-300/25 bg-cyan-300/[0.04] p-8 text-center">
            <div className="text-3xl mb-3">🏛️</div>

            <h2 className="text-lg font-semibold mb-2">
              Ρυθμίστε τον οργανισμό σας
            </h2>

            <p className="text-sm text-zinc-500 mb-5 max-w-md mx-auto">
              Πείτε μας ποιοι είστε, ποια θέματα σας ενδιαφέρουν, και ποιες
              είναι οι θέσεις σας. Το Noraya θα προσαρμόσει την ανάλυση στη
              δική σας οπτική.
            </p>

            <Link
              href="/onboarding"
              className="inline-block rounded-2xl bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Ξεκινήστε τη ρύθμιση →
            </Link>
          </section>
        )}

        {/* ═══ News Feed ═══ */}
        <section className="mb-8">
          <NewsFeed />
        </section>

        {/* ═══ Coming soon: AI features ═══ */}
        <section className="mb-8 grid gap-3 md:grid-cols-3">
          <ComingSoonCard
            icon="🤖"
            title="AI Σύμβουλος"
            description="Ρωτήστε οτιδήποτε — σε ελληνικά, με context τον οργανισμό σας."
          />

          <ComingSoonCard
            icon="🎯"
            title="Σενάρια & Ρίσκο"
            description="Τι γίνεται αν ψηφίσουμε υπέρ; Θεωρία παιγνίων & κόστος/όφελος."
          />

          <ComingSoonCard
            icon="📄"
            title="Reports & Alerts"
            description="Αυτόματο εβδομαδιαίο report + morning brief + risk alerts."
          />
        </section>
      </div>

      <AiChat />
    </div>
  );
}

/* ═══ Sub-components ═══ */

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
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 mb-1">
        {label}
      </div>

      <div className="text-2xl font-semibold">{value}</div>

      <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>
    </div>
  );
}

function ComingSoonCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 opacity-60">
      <div className="text-xl mb-2">{icon}</div>

      <h3 className="text-sm font-medium mb-1">{title}</h3>

      <p className="text-xs text-zinc-600 leading-5">{description}</p>

      <div className="mt-3 inline-block rounded-full border border-zinc-800 px-3 py-1 text-[10px] text-zinc-600">
        Σύντομα
      </div>
    </div>
  );
}
