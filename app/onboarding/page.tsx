"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ageGroups,
  eventTypes,
  issueExamples,
  organizationTypes,
  professionalGroups,
  publicActors,
  socialGroups,
  themes,
  institutions
} from "@/lib/noraya/taxonomy";

type StepId =
  | "organization"
  | "themes"
  | "issues"
  | "stakeholders"
  | "positions"
  | "review";

type PartyProfile = {
  id: string;
  party_key: string;
  party_name: string;
  short_name: string;
  documentation_level: string;
  verification_status: string;
  ideological_family: string | null;
  strategic_positioning: string | null;
  default_tone: string | null;
  core_themes: string[];
  core_audiences: string[];
  known_positions: string[];
  red_lines: string[];
  opportunity_frame: string | null;
  risk_frame: string | null;
  competitor_frame: string | null;
  advisor_instructions: string | null;
};

const steps: Array<{ id: StepId; title: string }> = [
  { id: "organization", title: "Οργανισμός" },
  { id: "themes", title: "Θεματικές" },
  { id: "issues", title: "Ζητήματα" },
  { id: "stakeholders", title: "Κοινά & φορείς" },
  { id: "positions", title: "Θέσεις" },
  { id: "review", title: "Επιβεβαίωση" }
];

function toggleValue(
  value: string,
  list: string[],
  setter: (next: string[]) => void
) {
  setter(
    list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value]
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function asTextList(values: string[] | undefined | null) {
  return Array.isArray(values) ? values.filter(Boolean) : [];
}

function Chip({
  value,
  selected,
  onClick
}: {
  value: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-xs transition ${
        selected
          ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100"
          : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
      }`}
    >
      {value}
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();

  const [stepIndex, setStepIndex] = useState(0);
  const [partyProfiles, setPartyProfiles] = useState<PartyProfile[]>([]);
  const [selectedPartyKey, setSelectedPartyKey] = useState("");
  const [loadingParties, setLoadingParties] = useState(false);

  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("Πολιτικό κόμμα");

  const [selectedThemes, setSelectedThemes] = useState<string[]>([
    "Ακρίβεια / κόστος ζωής",
    "Υγεία",
    "Στέγαση"
  ]);

  const [selectedIssues, setSelectedIssues] = useState<string[]>([
    "Ακρίβεια τροφίμων",
    "Ενοίκια",
    "ΕΣΥ"
  ]);

  const [customIssue, setCustomIssue] = useState("");

  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "Τέμπη",
    "Κοινωνικές αντιδράσεις"
  ]);

  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([
    "18-24 / νέοι ενήλικες",
    "25-34",
    "35-44"
  ]);

  const [selectedSocialGroups, setSelectedSocialGroups] = useState<string[]>([
    "Φοιτητές",
    "Οικογένειες με παιδιά"
  ]);

  const [selectedProfessionalGroups, setSelectedProfessionalGroups] = useState<string[]>([
    "Δημόσιοι υπάλληλοι",
    "Μικρομεσαίοι επιχειρηματίες"
  ]);

  const [selectedInstitutions, setSelectedInstitutions] = useState<string[]>([
    "Βουλή",
    "Δήμοι"
  ]);

  const [selectedPublicActors, setSelectedPublicActors] = useState<string[]>([
    "Κυβέρνηση",
    "Αντιπολίτευση",
    "ΜΜΕ"
  ]);

  const [mission, setMission] = useState("");
  const [redLines, setRedLines] = useState("");
  const [tone, setTone] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const currentStep = steps[stepIndex];
  const isPoliticalParty = orgType === "Πολιτικό κόμμα";
  const selectedParty = partyProfiles.find(
    (profile) => profile.party_key === selectedPartyKey
  );

  useEffect(() => {
    async function loadPartyProfiles() {
      setLoadingParties(true);

      try {
        const res = await fetch("/api/party-profiles", {
          cache: "no-store"
        });

        if (!res.ok) {
          return;
        }

        const data = await res.json();
        setPartyProfiles(data.profiles || []);
      } finally {
        setLoadingParties(false);
      }
    }

    loadPartyProfiles();
  }, []);

  const allSelectedStakeholders = useMemo(
    () => [
      ...selectedAgeGroups,
      ...selectedSocialGroups,
      ...selectedProfessionalGroups,
      ...selectedInstitutions,
      ...selectedPublicActors
    ],
    [
      selectedAgeGroups,
      selectedSocialGroups,
      selectedProfessionalGroups,
      selectedInstitutions,
      selectedPublicActors
    ]
  );

  const applyPartyProfile = (partyKey: string) => {
    setSelectedPartyKey(partyKey);

    const profile = partyProfiles.find((item) => item.party_key === partyKey);

    if (!profile) {
      return;
    }

    setOrgName(profile.party_name);
    setSelectedThemes(unique(asTextList(profile.core_themes)));
    setSelectedIssues(unique(asTextList(profile.known_positions)));
    setSelectedSocialGroups(unique(asTextList(profile.core_audiences)));

    setMission(
      [
        profile.strategic_positioning,
        profile.opportunity_frame
          ? `Ευκαιρία: ${profile.opportunity_frame}`
          : "",
        profile.risk_frame ? `Βασικό ρίσκο: ${profile.risk_frame}` : ""
      ]
        .filter(Boolean)
        .join("\n\n")
    );

    setRedLines(asTextList(profile.red_lines).join("\n"));
    setTone(profile.default_tone || "");

    if (profile.advisor_instructions) {
      setTone(
        [profile.default_tone || "", profile.advisor_instructions]
          .filter(Boolean)
          .join("\n\n")
      );
    }
  };

  const addCustomIssue = () => {
    const value = customIssue.trim();

    if (!value) return;

    if (!selectedIssues.includes(value)) {
      setSelectedIssues([...selectedIssues, value]);
    }

    setCustomIssue("");
  };

  const goNext = () => {
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  };

  const goBack = () => {
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");

    const profile = {
      partyKey: selectedPartyKey || null,
      organization: {
        name: orgName.trim() || selectedParty?.party_name || "Οργανισμός Demo",
        type: orgType,
        partyKey: selectedPartyKey || null
      },
      themes: selectedThemes,
      issues: selectedIssues,
      events: selectedEvents,
      stakeholders: {
        ageGroups: selectedAgeGroups,
        socialGroups: selectedSocialGroups,
        professionalGroups: selectedProfessionalGroups,
        institutions: selectedInstitutions,
        publicActors: selectedPublicActors
      },
      positions: {
        mission: mission.trim(),
        redLines: redLines.trim(),
        tone: tone.trim()
      }
    };

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      });

      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error || "Κάτι πήγε στραβά. Δοκιμάστε ξανά.");
        setSaving(false);
        return;
      }

      window.localStorage.setItem("noraya_org_profile", JSON.stringify(profile));
      router.push("/agenda");
    } catch {
      setSaveError("Σφάλμα σύνδεσης. Δοκιμάστε ξανά.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] px-5 py-8 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.12),transparent_28%)]" />

      <form
        onSubmit={submit}
        className="relative mx-auto max-w-6xl rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur md:p-8"
      >
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-cyan-300">
              NORAYA SETUP
            </div>

            <div className="mt-1 text-xs text-zinc-500">
              Political Intelligence Platform
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              Προσαρμογή στον οργανισμό σας
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Επιλέξτε προφίλ οργανισμού. Αν είστε πολιτικό κόμμα, ο Noraya μπορεί
              να φορτώσει έτοιμο starter profile με θέσεις, κοινά, τόνο και κόκκινες
              γραμμές.
            </p>
          </div>

          <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs text-cyan-100">
            Βήμα {stepIndex + 1} από {steps.length}
          </div>
        </div>

        <div className="mb-8 grid gap-2 md:grid-cols-6">
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setStepIndex(index)}
              className={`rounded-2xl border px-3 py-3 text-left text-xs transition ${
                index === stepIndex
                  ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                  : index < stepIndex
                    ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                    : "border-white/10 bg-black/20 text-zinc-500"
              }`}
            >
              <div className="mb-1 text-[10px] uppercase tracking-[0.18em]">
                {String(index + 1).padStart(2, "0")}
              </div>
              {step.title}
            </button>
          ))}
        </div>

        <div className="min-h-[520px] rounded-3xl border border-white/10 bg-slate-950/60 p-5 md:p-7">
          {currentStep.id === "organization" && (
            <section>
              <h2 className="text-2xl font-semibold">Ποιος είστε;</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Ξεκινάμε με τον τύπο οργανισμού. Για πολιτικά κόμματα υπάρχει
                έτοιμο profile registry.
              </p>

              <div className="mt-8 grid gap-5 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-zinc-200">
                    Τι τύπος οργανισμού είστε;
                  </label>
                  <select
                    value={orgType}
                    onChange={(event) => {
                      setOrgType(event.target.value);
                      if (event.target.value !== "Πολιτικό κόμμα") {
                        setSelectedPartyKey("");
                      }
                    }}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
                  >
                    {organizationTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-200">
                    Πώς λέγεται ο οργανισμός σας;
                  </label>
                  <input
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    placeholder="π.χ. ΠΑΣΟΚ Demo"
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
                  />
                </div>
              </div>

              {isPoliticalParty && (
                <div className="mt-7 rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.05] p-5">
                  <div className="text-sm font-semibold text-cyan-100">
                    Επιλέξτε πολιτικό κόμμα
                  </div>

                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Ο Noraya θα γεμίσει αυτόματα ένα starter profile. Μετά μπορείτε
                    να το διορθώσετε πριν αποθηκευτεί.
                  </p>

                  <select
                    value={selectedPartyKey}
                    onChange={(event) => applyPartyProfile(event.target.value)}
                    className="mt-4 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
                  >
                    <option value="">
                      {loadingParties
                        ? "Φόρτωση κομμάτων..."
                        : "Επιλέξτε κόμμα / πολιτικό project"}
                    </option>

                    {partyProfiles.map((profile) => (
                      <option key={profile.party_key} value={profile.party_key}>
                        {profile.party_name}
                      </option>
                    ))}
                  </select>

                  {selectedParty && (
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      <InfoPill
                        label="Προφίλ"
                        value={selectedParty.short_name}
                      />
                      <InfoPill
                        label="Τεκμηρίωση"
                        value={selectedParty.documentation_level}
                      />
                      <InfoPill
                        label="Status"
                        value={selectedParty.verification_status}
                      />
                    </div>
                  )}

                  {selectedParty && (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        Στρατηγική ανάγνωση
                      </div>
                      <p className="mt-2 text-sm leading-6 text-zinc-300">
                        {selectedParty.strategic_positioning}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {currentStep.id === "themes" && (
            <section>
              <h2 className="text-2xl font-semibold">
                Τι θέλετε να παρακολουθείτε;
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Οι θεματικές μπορούν να έρθουν αυτόματα από το κόμμα ή να
                τροποποιηθούν χειροκίνητα.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {unique([...themes, ...selectedThemes]).map((theme) => (
                  <Chip
                    key={theme}
                    value={theme}
                    selected={selectedThemes.includes(theme)}
                    onClick={() => toggleValue(theme, selectedThemes, setSelectedThemes)}
                  />
                ))}
              </div>
            </section>
          )}

          {currentStep.id === "issues" && (
            <section>
              <h2 className="text-2xl font-semibold">
                Ζητήματα, θέσεις και κρίσεις
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Εδώ εμφανίζονται συγκεκριμένα ζητήματα ή γνωστές θέσεις που θα
                χρησιμοποιεί ο Noraya όταν μεταφράζει την ατζέντα για εσάς.
              </p>

              <div className="mt-7">
                <h3 className="mb-3 text-sm font-semibold text-zinc-200">
                  Ζητήματα / γνωστές θέσεις
                </h3>

                <div className="flex flex-wrap gap-2">
                  {unique([...issueExamples, ...selectedIssues]).map((issue) => (
                    <Chip
                      key={issue}
                      value={issue}
                      selected={selectedIssues.includes(issue)}
                      onClick={() => toggleValue(issue, selectedIssues, setSelectedIssues)}
                    />
                  ))}
                </div>

                <div className="mt-5 flex gap-2">
                  <input
                    value={customIssue}
                    onChange={(event) => setCustomIssue(event.target.value)}
                    placeholder="Προσθέστε δικό σας ζήτημα"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
                  />

                  <button
                    type="button"
                    onClick={addCustomIssue}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-medium text-slate-950"
                  >
                    Προσθήκη
                  </button>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="mb-3 text-sm font-semibold text-zinc-200">
                  Γεγονότα / κρίσεις / signals
                </h3>

                <div className="flex flex-wrap gap-2">
                  {eventTypes.map((eventType) => (
                    <Chip
                      key={eventType}
                      value={eventType}
                      selected={selectedEvents.includes(eventType)}
                      onClick={() => toggleValue(eventType, selectedEvents, setSelectedEvents)}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {currentStep.id === "stakeholders" && (
            <section>
              <h2 className="text-2xl font-semibold">
                Ποια κοινά ή φορείς σας ενδιαφέρουν;
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Αυτά είναι τα κοινά που θα εξετάζει ο Advisor όταν λέει πώς
                επηρεάζεται η βάση, οι αναποφάσιστοι, οι νέοι, η μεσαία τάξη κτλ.
              </p>

              <div className="mt-7 space-y-7">
                <Group title="Ηλικιακές ομάδες">
                  {ageGroups.map((item) => (
                    <Chip
                      key={item}
                      value={item}
                      selected={selectedAgeGroups.includes(item)}
                      onClick={() =>
                        toggleValue(item, selectedAgeGroups, setSelectedAgeGroups)
                      }
                    />
                  ))}
                </Group>

                <Group title="Κοινωνικές ομάδες / πολιτικά κοινά">
                  {unique([...socialGroups, ...selectedSocialGroups]).map((item) => (
                    <Chip
                      key={item}
                      value={item}
                      selected={selectedSocialGroups.includes(item)}
                      onClick={() =>
                        toggleValue(item, selectedSocialGroups, setSelectedSocialGroups)
                      }
                    />
                  ))}
                </Group>

                <Group title="Επαγγελματικές ομάδες">
                  {professionalGroups.map((item) => (
                    <Chip
                      key={item}
                      value={item}
                      selected={selectedProfessionalGroups.includes(item)}
                      onClick={() =>
                        toggleValue(
                          item,
                          selectedProfessionalGroups,
                          setSelectedProfessionalGroups
                        )
                      }
                    />
                  ))}
                </Group>

                <Group title="Θεσμοί / φορείς">
                  {institutions.map((item) => (
                    <Chip
                      key={item}
                      value={item}
                      selected={selectedInstitutions.includes(item)}
                      onClick={() =>
                        toggleValue(item, selectedInstitutions, setSelectedInstitutions)
                      }
                    />
                  ))}
                </Group>

                <Group title="Δημόσιοι / πολιτικοί παίκτες">
                  {publicActors.map((item) => (
                    <Chip
                      key={item}
                      value={item}
                      selected={selectedPublicActors.includes(item)}
                      onClick={() =>
                        toggleValue(item, selectedPublicActors, setSelectedPublicActors)
                      }
                    />
                  ))}
                </Group>
              </div>
            </section>
          )}

          {currentStep.id === "positions" && (
            <section>
              <h2 className="text-2xl font-semibold">
                Θέσεις και κόκκινες γραμμές
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Αυτά είναι τα στοιχεία που κάνουν τον Advisor προσωποποιημένο. Ελέγξτε
                τα αυτόματα συμπληρωμένα πεδία και διορθώστε ό,τι δεν ταιριάζει.
              </p>

              <div className="mt-7 grid gap-5">
                <div>
                  <label className="text-sm font-medium text-zinc-200">
                    Βασική αποστολή / στρατηγική γραμμή
                  </label>
                  <textarea
                    value={mission}
                    onChange={(event) => setMission(event.target.value)}
                    rows={5}
                    placeholder="Περιγράψτε τη στρατηγική ταυτότητα του οργανισμού."
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-200">
                    Κόκκινες γραμμές / ευαίσθητα σημεία
                  </label>
                  <textarea
                    value={redLines}
                    onChange={(event) => setRedLines(event.target.value)}
                    rows={5}
                    placeholder="Τι δεν πρέπει να παραβιάζει ο Noraya;"
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-200">
                    Προτιμώμενος τόνος / οδηγίες Advisor
                  </label>
                  <textarea
                    value={tone}
                    onChange={(event) => setTone(event.target.value)}
                    rows={5}
                    placeholder="π.χ. Θεσμικός, καθαρός, κοινωνικά ευαίσθητος."
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
                  />
                </div>
              </div>
            </section>
          )}

          {currentStep.id === "review" && (
            <section>
              <h2 className="text-2xl font-semibold">Επιβεβαίωση</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Αυτή είναι η αρχική εικόνα που θα χρησιμοποιήσει το Noraya για
                personalized party advice.
              </p>

              <div className="mt-7 grid gap-4 md:grid-cols-2">
                <ReviewCard
                  title="Οργανισμός"
                  items={[
                    orgName || selectedParty?.party_name || "Οργανισμός Demo",
                    orgType,
                    selectedParty
                      ? `Party profile: ${selectedParty.short_name}`
                      : "Χωρίς έτοιμο party profile"
                  ]}
                />
                <ReviewCard title="Θεματικές" items={selectedThemes} />
                <ReviewCard title="Ζητήματα / θέσεις" items={selectedIssues} />
                <ReviewCard title="Γεγονότα / κρίσεις" items={selectedEvents} />
                <ReviewCard title="Κοινά & φορείς" items={allSelectedStakeholders} />
                <ReviewCard
                  title="Θέσεις"
                  items={[
                    mission || "Δεν συμπληρώθηκε ακόμη αποστολή.",
                    redLines || "Δεν συμπληρώθηκαν ακόμη κόκκινες γραμμές.",
                    tone || "Δεν συμπληρώθηκε ακόμη τόνος."
                  ]}
                />
              </div>
            </section>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => router.push("/agenda")}
            className="rounded-2xl border border-white/10 px-5 py-3 text-sm text-zinc-300 transition hover:border-white/20"
          >
            Παράλειψη
          </button>

          <div className="flex items-center gap-3">
            {saveError && (
              <span className="text-xs text-red-400">{saveError}</span>
            )}

            <button
              type="button"
              onClick={goBack}
              disabled={stepIndex === 0}
              className="rounded-2xl border border-white/10 px-5 py-3 text-sm text-zinc-300 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Πίσω
            </button>

            {stepIndex < steps.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                Συνέχεια →
              </button>
            ) : (
              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50"
              >
                {saving ? "Αποθήκευση..." : "Δημιουργία προφίλ →"}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-zinc-100">{value}</div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-zinc-200">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function ReviewCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <h3 className="mb-3 text-sm font-semibold text-cyan-100">{title}</h3>

      <div className="flex flex-wrap gap-2">
        {items.slice(0, 18).map((item) => (
          <span
            key={item}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300"
          >
            {item}
          </span>
        ))}

        {items.length > 18 && (
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-500">
            +{items.length - 18} ακόμα
          </span>
        )}
      </div>
    </div>
  );
}
