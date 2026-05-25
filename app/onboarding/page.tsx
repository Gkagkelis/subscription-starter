"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
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

  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState(organizationTypes[0]);

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

  const currentStep = steps[stepIndex];

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

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");

    const profile = {
      organization: {
        name: orgName.trim() || "Οργανισμός Demo",
        type: orgType
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

      // Also keep in localStorage as fallback for non-logged-in preview
      window.localStorage.setItem("noraya_org_profile", JSON.stringify(profile));
      router.push("/dashboard");
    } catch (err) {
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
              Το Noraya χρειάζεται λίγα στοιχεία για να μετατρέψει τη γενική δημόσια εικόνα
              σε προσαρμοσμένη πολιτική πληροφόρηση για τον δικό σας οργανισμό.
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
                Ξεκινάμε με τα βασικά στοιχεία του οργανισμού.
              </p>

              <div className="mt-8 grid gap-5 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-zinc-200">
                    Πώς λέγεται ο οργανισμός σας;
                  </label>
                  <input
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    placeholder="π.χ. Οργανισμός Demo"
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-200">
                    Τι τύπος οργανισμού είστε;
                  </label>
                  <select
                    value={orgType}
                    onChange={(event) => setOrgType(event.target.value)}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
                  >
                    {organizationTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          )}

          {currentStep.id === "themes" && (
            <section>
              <h2 className="text-2xl font-semibold">Τι θέλετε να παρακολουθείτε;</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Επιλέξτε μεγάλες θεματικές περιοχές. Αυτές είναι τα μόνιμα "ράφια"
                του Noraya.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {themes.map((theme) => (
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
              <h2 className="text-2xl font-semibold">Ζητήματα, υποθέσεις και κρίσεις</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Εδώ μπαίνουν πιο συγκεκριμένα ζητήματα ή γεγονότα: Τέμπη, στέγαση,
                ακρίβεια τροφίμων, κινητοποιήσεις, νομοσχέδια υψηλής έντασης.
              </p>

              <div className="mt-7">
                <h3 className="mb-3 text-sm font-semibold text-zinc-200">
                  Συγκεκριμένα ζητήματα
                </h3>

                <div className="flex flex-wrap gap-2">
                  {issueExamples.map((issue) => (
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
                    placeholder="Προσθέστε δικό σας ζήτημα, π.χ. φοιτητικές κινητοποιήσεις"
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
                Δεν είναι απλή λίστα "target groups". Είναι ο χάρτης των ομάδων,
                φορέων και παικτών που επηρεάζονται ή εμφανίζονται στον δημόσιο λόγο.
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

                <Group title="Κοινωνικές ομάδες / κατάσταση ζωής">
                  {socialGroups.map((item) => (
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
              <h2 className="text-2xl font-semibold">Θέσεις και κόκκινες γραμμές</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Αυτό είναι το πρώτο βήμα για να μπορεί το Noraya αργότερα να ελέγχει
                συνέπεια θέσεων και να απαντά με βάση το δικό σας πλαίσιο.
              </p>

              <div className="mt-7 grid gap-5">
                <div>
                  <label className="text-sm font-medium text-zinc-200">
                    Βασική αποστολή / γραμμή
                  </label>
                  <textarea
                    value={mission}
                    onChange={(event) => setMission(event.target.value)}
                    rows={4}
                    placeholder="π.χ. Θέλουμε τεκμηριωμένες δημόσιες παρεμβάσεις με έμφαση στη διαφάνεια, την κοινωνική επίδραση και τον θεσμικό λόγο."
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
                    rows={4}
                    placeholder="π.χ. Θέσεις που δεν πρέπει να παραβιαστούν, θέματα υψηλής ευαισθησίας, σημεία που θέλουν προσοχή."
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-200">
                    Προτιμώμενος τόνος
                  </label>
                  <textarea
                    value={tone}
                    onChange={(event) => setTone(event.target.value)}
                    rows={3}
                    placeholder="π.χ. Θεσμικός, τεκμηριωμένος, ήρεμος, χωρίς υπερβολές."
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-cyan-300/40"
                  />
                </div>

                <div className="rounded-2xl border border-dashed border-cyan-300/25 bg-cyan-300/[0.04] p-5">
                  <div className="text-sm font-medium text-cyan-100">
                    Upload θέσεων / προγράμματος
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Θα το ενεργοποιήσουμε στο επόμενο στάδιο. Εδώ θα μπαίνουν PDF, DOCX,
                    ομιλίες, δελτία τύπου και policy papers.
                  </p>
                </div>
              </div>
            </section>
          )}

          {currentStep.id === "review" && (
            <section>
              <h2 className="text-2xl font-semibold">Επιβεβαίωση</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Αυτή είναι η αρχική εικόνα που θα χρησιμοποιήσει το Noraya για να
                προσαρμόσει το dashboard.
              </p>

              <div className="mt-7 grid gap-4 md:grid-cols-2">
                <ReviewCard title="Οργανισμός" items={[orgName || "Οργανισμός Demo", orgType]} />
                <ReviewCard title="Θεματικές" items={selectedThemes} />
                <ReviewCard title="Ζητήματα" items={selectedIssues} />
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
            onClick={() => router.push("/dashboard")}
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
