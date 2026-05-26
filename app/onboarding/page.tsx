"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ageGroups,
  eventTypes,
  issueExamples,
  professionalGroups,
  publicActors,
  socialGroups,
  themes,
  institutions
} from "@/lib/noraya/taxonomy";

type StepId =
  | "identity"
  | "context"
  | "themes"
  | "issues"
  | "stakeholders"
  | "positions"
  | "review";

type IdentityType =
  | "Πολιτικό κόμμα"
  | "Γραφείο Βουλευτή"
  | "Ευρωβουλευτής"
  | "Δημοτική Παράταξη";

type PartyProfile = {
  id: string;
  party_key: string;
  party_name: string;
  short_name: string;
  ideological_family: string | null;
  strategic_positioning: string | null;
  default_tone: string | null;
  core_themes: unknown;
  core_audiences: unknown;
  known_positions: unknown;
  red_lines: unknown;
  opportunity_frame: string | null;
  risk_frame: string | null;
  competitor_frame: string | null;
  advisor_instructions: string | null;
};

const identityTypes: IdentityType[] = [
  "Πολιτικό κόμμα",
  "Γραφείο Βουλευτή",
  "Ευρωβουλευτής",
  "Δημοτική Παράταξη"
];

const steps: Array<{ id: StepId; title: string }> = [
  { id: "identity", title: "Ποιος είστε" },
  { id: "context", title: "Πλαίσιο" },
  { id: "themes", title: "Θεματικές" },
  { id: "issues", title: "Ζητήματα" },
  { id: "stakeholders", title: "Κοινά" },
  { id: "positions", title: "Θέσεις" },
  { id: "review", title: "Επιβεβαίωση" }
];

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function asTextList(values: unknown): string[] {
  if (Array.isArray(values)) {
    return values.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function toggleValue(
  value: string,
  list: string[],
  setter: (next: string[]) => void
) {
  if (list.includes(value)) {
    setter(list.filter((item) => item !== value));
    return;
  }
  setter([...list, value]);
}

export default function OnboardingPage() {
  const router = useRouter();

  const [stepIndex, setStepIndex] = useState(0);
  const [partyProfiles, setPartyProfiles] = useState<PartyProfile[]>([]);
  const [loadingParties, setLoadingParties] = useState(false);

  const [orgType, setOrgType] = useState<IdentityType>("Πολιτικό κόμμα");
  const [selectedPartyKey, setSelectedPartyKey] = useState("");

  const [representativeName, setRepresentativeName] = useState("");
  const [district, setDistrict] = useState("");
  const [euroRepresentativeName, setEuroRepresentativeName] = useState("");
  const [municipalFactionName, setMunicipalFactionName] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [region, setRegion] = useState("");

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

  const [selectedProfessionalGroups, setSelectedProfessionalGroups] =
    useState<string[]>(["Δημόσιοι υπάλληλοι", "Μικρομεσαίοι επιχειρηματίες"]);

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

  const selectedParty = partyProfiles.find(
    (profile) => profile.party_key === selectedPartyKey
  );

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

  useEffect(() => {
    async function loadPartyProfiles() {
      setLoadingParties(true);
      try {
        const response = await fetch("/api/party-profiles", {
          cache: "no-store"
        });
        if (!response.ok) return;
        const data = await response.json();
        setPartyProfiles(
          (data.profiles || []).filter(
            (p: PartyProfile) =>
              p.party_key !== "starter" &&
              !p.party_key.includes("test") &&
              p.party_name !== "starter" &&
              !p.party_name.toLowerCase().includes("requires_review")
          )
        );
      } finally {
        setLoadingParties(false);
      }
    }
    loadPartyProfiles();
  }, []);

  function changeIdentity(type: IdentityType) {
    setOrgType(type);
    setSelectedPartyKey("");
    setRepresentativeName("");
    setDistrict("");
    setEuroRepresentativeName("");
    setMunicipalFactionName("");
    setMunicipality("");
    setRegion("");
  }

  function applyPartyProfile(partyKey: string) {
    setSelectedPartyKey(partyKey);
    const profile = partyProfiles.find((item) => item.party_key === partyKey);
    if (!profile) return;

    setSelectedThemes(unique(asTextList(profile.core_themes)));
    setSelectedIssues(unique(asTextList(profile.known_positions)));
    setSelectedSocialGroups(unique(asTextList(profile.core_audiences)));
    setMission(
      [
        profile.strategic_positioning || "",
        profile.opportunity_frame
          ? `Ευκαιρία: ${profile.opportunity_frame}`
          : "",
        profile.risk_frame ? `Βασικό ρίσκο: ${profile.risk_frame}` : ""
      ]
        .filter(Boolean)
        .join("\n\n")
    );
    setRedLines(asTextList(profile.red_lines).join("\n"));
    setTone(
      [profile.default_tone || "", profile.advisor_instructions || ""]
        .filter(Boolean)
        .join("\n\n")
    );
  }

  function buildOrganizationName() {
    if (orgType === "Πολιτικό κόμμα") {
      return selectedParty?.party_name || "Πολιτικό κόμμα";
    }
    if (orgType === "Γραφείο Βουλευτή") {
      return [
        representativeName.trim() || "Γραφείο Βουλευτή",
        selectedParty?.short_name || "",
        district.trim()
      ]
        .filter(Boolean)
        .join(" - ");
    }
    if (orgType === "Ευρωβουλευτής") {
      return [
        euroRepresentativeName.trim() || "Ευρωβουλευτής",
        selectedParty?.short_name || ""
      ]
        .filter(Boolean)
        .join(" - ");
    }
    return [
      municipalFactionName.trim() || "Δημοτική Παράταξη",
      municipality.trim() ? `Δήμος ${municipality.trim()}` : "",
      region.trim()
    ]
      .filter(Boolean)
      .join(" - ");
  }

  function addCustomIssue() {
    const value = customIssue.trim();
    if (!value) return;
    if (!selectedIssues.includes(value)) {
      setSelectedIssues([...selectedIssues, value]);
    }
    setCustomIssue("");
  }

  function goNext() {
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function goBack() {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");

    const profile = {
      partyKey: selectedPartyKey || null,
      organization: {
        name: buildOrganizationName(),
        type: orgType,
        partyKey: selectedPartyKey || null,
        representativeName: representativeName.trim(),
        district: district.trim(),
        euroRepresentativeName: euroRepresentativeName.trim(),
        municipalFactionName: municipalFactionName.trim(),
        municipality: municipality.trim(),
        region: region.trim()
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
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      });

      if (!response.ok) {
        const data = await response.json();
        setSaveError(data.error || "Κάτι πήγε στραβά. Δοκιμάστε ξανά.");
        setSaving(false);
        return;
      }

      window.localStorage.setItem("noraya_org_profile", JSON.stringify(profile));
      router.push("/strategy-room");
    } catch {
      setSaveError("Σφάλμα σύνδεσης. Δοκιμάστε ξανά.");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#020617] px-5 py-8 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.12),transparent_28%)]" />

      <form
        onSubmit={submit}
        className="relative mx-auto max-w-6xl rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur md:p-8"
      >
        <Header stepIndex={stepIndex} totalSteps={steps.length} />

        <div className="mb-8 grid gap-2 md:grid-cols-7">
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

        <div className="min-h-[560px] rounded-3xl border border-white/10 bg-slate-950/60 p-5 md:p-7">
          {currentStep.id === "identity" && (
            <section>
              <h2 className="text-2xl font-semibold">Ποιος είστε;</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Επιλέξτε τον πολιτικό ρόλο. Στο επόμενο βήμα θα εμφανιστούν
                μόνο τα σχετικά πεδία.
              </p>

              <div className="mt-7 grid gap-3 md:grid-cols-4">
                {identityTypes.map((type) => (
                  <IdentityCard
                    key={type}
                    title={type}
                    selected={orgType === type}
                    onClick={() => changeIdentity(type)}
                  />
                ))}
              </div>
            </section>
          )}

          {currentStep.id === "context" && (
            <section>
              {orgType === "Πολιτικό κόμμα" && (
                <RolePanel
                  title="Ποιο πολιτικό κόμμα;"
                  description="Επιλέξτε κόμμα ή πολιτικό project. Ο Noraya θα φορτώσει αυτόματα αρχικό προφίλ με θέσεις, κοινά, τόνο και κόκκινες γραμμές."
                >
                  <PartySelector
                    profiles={partyProfiles}
                    selectedPartyKey={selectedPartyKey}
                    selectedParty={selectedParty}
                    loading={loadingParties}
                    onChange={applyPartyProfile}
                  />
                </RolePanel>
              )}

              {orgType === "Γραφείο Βουλευτή" && (
                <RolePanel
                  title="Στοιχεία γραφείου βουλευτή"
                  description="Επιλέξτε κόμμα, περιφέρεια και προαιρετικά όνομα. Έτσι ο Noraya θα συνδυάζει κομματική γραμμή και τοπικό πολιτικό πλαίσιο."
                >
                  <PartySelector
                    profiles={partyProfiles}
                    selectedPartyKey={selectedPartyKey}
                    selectedParty={selectedParty}
                    loading={loadingParties}
                    onChange={applyPartyProfile}
                  />

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <Field
                      label="Όνομα βουλευτή / βουλεύτριας"
                      value={representativeName}
                      onChange={setRepresentativeName}
                      placeholder="π.χ. Μαρία Παπαδοπούλου"
                    />
                    <Field
                      label="Εκλογική περιφέρεια"
                      value={district}
                      onChange={setDistrict}
                      placeholder="π.χ. Α΄ Αθήνας, Β΄ Θεσσαλονίκης"
                    />
                  </div>
                </RolePanel>
              )}

              {orgType === "Ευρωβουλευτής" && (
                <RolePanel
                  title="Στοιχεία ευρωβουλευτή"
                  description="Επιλέξτε κόμμα και προαιρετικά όνομα. Στο επόμενο στάδιο θα προσθέσουμε ευρωπαϊκές επιτροπές και ευρωπαϊκή ατζέντα."
                >
                  <PartySelector
                    profiles={partyProfiles}
                    selectedPartyKey={selectedPartyKey}
                    selectedParty={selectedParty}
                    loading={loadingParties}
                    onChange={applyPartyProfile}
                  />

                  <div className="mt-5">
                    <Field
                      label="Όνομα ευρωβουλευτή / ευρωβουλεύτριας"
                      value={euroRepresentativeName}
                      onChange={setEuroRepresentativeName}
                      placeholder="π.χ. Νίκος Παπαδόπουλος"
                    />
                  </div>
                </RolePanel>
              )}

              {orgType === "Δημοτική Παράταξη" && (
                <RolePanel
                  title="Στοιχεία δημοτικής παράταξης"
                  description="Για την αυτοδιοίκηση θα χτίσουμε ξεχωριστό local intelligence layer. Προς το παρόν κρατάμε τα βασικά στοιχεία."
                >
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field
                      label="Όνομα παράταξης"
                      value={municipalFactionName}
                      onChange={setMunicipalFactionName}
                      placeholder="π.χ. Νέα Πόλη"
                    />
                    <Field
                      label="Δήμος"
                      value={municipality}
                      onChange={setMunicipality}
                      placeholder="π.χ. Αθηναίων"
                    />
                    <Field
                      label="Περιφέρεια"
                      value={region}
                      onChange={setRegion}
                      placeholder="π.χ. Αττική"
                    />
                  </div>

                  <div className="mt-6">
                    <div className="mb-2 text-sm font-medium text-zinc-200">
                      Πολιτική συγγένεια / στήριξη, προαιρετικά
                    </div>
                    <PartySelector
                      profiles={partyProfiles}
                      selectedPartyKey={selectedPartyKey}
                      selectedParty={selectedParty}
                      loading={loadingParties}
                      onChange={applyPartyProfile}
                    />
                  </div>
                </RolePanel>
              )}
            </section>
          )}

          {currentStep.id === "themes" && (
            <section>
              <h2 className="text-2xl font-semibold">
                Τι πρέπει να παρακολουθεί ο Noraya;
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Οι θεματικές μπορούν να έρθουν αυτόματα από το πολιτικό προφίλ
                ή να διορθωθούν χειροκίνητα.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {unique([...themes, ...selectedThemes]).map((theme) => (
                  <Chip
                    key={theme}
                    value={theme}
                    selected={selectedThemes.includes(theme)}
                    onClick={() =>
                      toggleValue(theme, selectedThemes, setSelectedThemes)
                    }
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
                Εδώ μπαίνουν συγκεκριμένες θέσεις, ζητήματα ή κρίσεις που θα
                λαμβάνει υπόψη ο Advisor όταν μεταφράζει την ατζέντα.
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
                      onClick={() =>
                        toggleValue(issue, selectedIssues, setSelectedIssues)
                      }
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
                      onClick={() =>
                        toggleValue(eventType, selectedEvents, setSelectedEvents)
                      }
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {currentStep.id === "stakeholders" && (
            <section>
              <h2 className="text-2xl font-semibold">
                Ποια κοινά ή φορείς έχουν σημασία;
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Αυτά είναι τα κοινά που θα σκέφτεται ο Advisor όταν λέει ποιοι
                επηρεάζονται και πώς πρέπει να μιλήσετε.
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
                  {unique([...socialGroups, ...selectedSocialGroups]).map(
                    (item) => (
                      <Chip
                        key={item}
                        value={item}
                        selected={selectedSocialGroups.includes(item)}
                        onClick={() =>
                          toggleValue(
                            item,
                            selectedSocialGroups,
                            setSelectedSocialGroups
                          )
                        }
                      />
                    )
                  )}
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
                        toggleValue(
                          item,
                          selectedInstitutions,
                          setSelectedInstitutions
                        )
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
                        toggleValue(
                          item,
                          selectedPublicActors,
                          setSelectedPublicActors
                        )
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
                Αυτά κάνουν τον Advisor προσωποποιημένο. Ελέγξτε τα αυτόματα
                συμπληρωμένα πεδία και διορθώστε ό,τι δεν ταιριάζει.
              </p>

              <div className="mt-7 grid gap-5">
                <TextAreaField
                  label="Βασική αποστολή / στρατηγική γραμμή"
                  value={mission}
                  onChange={setMission}
                  placeholder="Περιγράψτε τη στρατηγική ταυτότητα."
                />
                <TextAreaField
                  label="Κόκκινες γραμμές / ευαίσθητα σημεία"
                  value={redLines}
                  onChange={setRedLines}
                  placeholder="Τι δεν πρέπει να παραβιάζει ο Noraya;"
                />
                <TextAreaField
                  label="Προτιμώμενος τόνος / οδηγίες Advisor"
                  value={tone}
                  onChange={setTone}
                  placeholder="π.χ. Θεσμικός, καθαρός, κοινωνικά ευαίσθητος."
                />
              </div>
            </section>
          )}

          {currentStep.id === "review" && (
            <section>
              <h2 className="text-2xl font-semibold">Επιβεβαίωση</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Αυτή είναι η αρχική εικόνα που θα χρησιμοποιήσει ο Noraya για
                προσωποποιημένες πολιτικές συστάσεις.
              </p>

              <div className="mt-7 grid gap-4 md:grid-cols-2">
                <ReviewCard
                  title="Ταυτότητα"
                  items={[
                    orgType,
                    buildOrganizationName(),
                    selectedParty
                      ? `Πολιτικό πλαίσιο: ${selectedParty.short_name}`
                      : "Χωρίς έτοιμο κομματικό πλαίσιο"
                  ]}
                />
                <ReviewCard title="Θεματικές" items={selectedThemes} />
                <ReviewCard title="Ζητήματα / θέσεις" items={selectedIssues} />
                <ReviewCard title="Γεγονότα / κρίσεις" items={selectedEvents} />
                <ReviewCard
                  title="Κοινά & φορείς"
                  items={allSelectedStakeholders}
                />
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

function Header({
  stepIndex,
  totalSteps
}: {
  stepIndex: number;
  totalSteps: number;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-cyan-300">
          NORAYA SETUP
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          Political Intelligence Platform
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Προσαρμογή στον πολιτικό σας ρόλο
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Ξεκινάμε από το ποιος είστε. Ο Noraya θα φορτώσει το σωστό πολιτικό
          πλαίσιο ώστε ο Advisor να μιλάει για εσάς και όχι γενικά.
        </p>
      </div>
      <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs text-cyan-100">
        Βήμα {stepIndex + 1} από {totalSteps}
      </div>
    </div>
  );
}

function IdentityCard({
  title,
  selected,
  onClick
}: {
  title: IdentityType;
  selected: boolean;
  onClick: () => void;
}) {
  const descriptions: Record<IdentityType, string> = {
    "Πολιτικό κόμμα": "Κεντρική κομματική στρατηγική και δημόσια γραμμή.",
    "Γραφείο Βουλευτή": "Κομματική γραμμή, περιφέρεια και προσωπικό προφίλ.",
    "Ευρωβουλευτής": "Κομματικό πλαίσιο και ευρωπαϊκή πολιτική ατζέντα.",
    "Δημοτική Παράταξη":
      "Δήμος, τοπική στρατηγική και αυτοδιοικητικά ζητήματα."
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl border p-4 text-left transition ${
        selected
          ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-50"
          : "border-white/10 bg-black/20 text-zinc-300 hover:border-white/20"
      }`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 text-xs leading-5 text-zinc-400">
        {descriptions[title]}
      </div>
    </button>
  );
}

function RolePanel({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.05] p-5">
      <h2 className="text-2xl font-semibold text-cyan-50">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function PartySelector({
  profiles,
  selectedPartyKey,
  selectedParty,
  loading,
  onChange
}: {
  profiles: PartyProfile[];
  selectedPartyKey: string;
  selectedParty?: PartyProfile;
  loading: boolean;
  onChange: (partyKey: string) => void;
}) {
  return (
    <div>
      <select
        value={selectedPartyKey}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
      >
        <option value="">
          {loading ? "Φόρτωση..." : "Επιλέξτε κόμμα / πολιτικό project"}
        </option>
        {profiles.map((profile) => (
          <option key={profile.party_key} value={profile.party_key}>
            {profile.party_name}
          </option>
        ))}
      </select>

      {selectedParty && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Τι ξέρει ήδη ο Noraya
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {selectedParty.strategic_positioning}
          </p>
          <p className="mt-3 text-xs leading-5 text-cyan-100">
            Ο Noraya γέμισε αυτόματα βασικές θέσεις, κοινά, τόνο και κόκκινες
            γραμμές. Μπορείτε να τα διορθώσετε στα επόμενα βήματα.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-zinc-200">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-zinc-200">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        placeholder={placeholder}
        className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
      />
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-zinc-200">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
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

function ReviewCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <h3 className="mb-3 text-sm font-semibold text-cyan-100">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 18).map((item, index) => (
          <span
            key={`${item}-${index}`}
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
