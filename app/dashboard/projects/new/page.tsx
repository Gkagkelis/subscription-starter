"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Tone = "neutral" | "poetic" | "professional" | "accessible" | "funder_ready";

const IMPACT = ["Cultural", "Social", "Educational", "Economic", "Environmental"];

export default function NewProjectWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const [raw, setRaw] = useState("");
  const [field, setField] = useState<string>("");
  const [format, setFormat] = useState<string>("");
  const [audience, setAudience] = useState<string[]>([]);
  const [contexts, setContexts] = useState<string[]>([]);
  const [tone, setTone] = useState<Tone>("neutral");
  const [intention, setIntention] = useState<string[]>([]);
  const [impactSignals, setImpactSignals] = useState<string[]>([]);
  const [accessibility, setAccessibility] = useState("");
  const [evidence, setEvidence] = useState("");

  const canNext = useMemo(() => {
    if (step === 1) return raw.trim().length >= 20;
    return true;
  }, [step, raw]);

  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const onCreate = async () => {
    setBusy(true);
    try {
      // 1) Create project first (title from first line)
      const titleGuess = raw.split("\n").find((l) => l.trim())?.slice(0, 60) || "New Project";
      const pRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleGuess }),
      });
      if (!pRes.ok) throw new Error("Failed to create project");
      const project = await pRes.json();

      // 2) Generate DNA + defaults
      const aiRes = await fetch("/api/ai/project-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "create_dna",
          answers: {
            raw_description: raw,
            field,
            format,
            audience,
            contexts,
            tone,
            intention,
            impact_signals: impactSignals,
            accessibility_notes: accessibility,
            evidence,
          },
        }),
      });
      if (!aiRes.ok) throw new Error("Failed to generate Project DNA");
      const ai = await aiRes.json();

      // 3) Save DNA asset
      const dnaRes = await fetch("/api/project-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          kind: "dna",
          format: "dna",
          title: ai.title,
          content: ai.dna,
          tone,
          version: 1,
        }),
      });
      if (!dnaRes.ok) throw new Error("Failed to save DNA");

      // 4) Save derivative assets
      for (const d of ai.derivatives ?? []) {
        await fetch("/api/project-assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.id,
            kind: "derivative",
            format: d.format,
            title: d.title ?? null,
            content: d.content,
            tone,
            version: 1,
          }),
        });
      }

      router.push(`/dashboard/projects/${project.id}`);
    } catch (e: any) {
      alert(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Describe a New Project</h1>
            <p className="text-zinc-400 mt-2">5 guided steps → Project DNA → 1-click formats.</p>
          </div>
          <div className="text-sm text-zinc-500">Step {step}/5</div>
        </div>

        <div className="mt-8 border border-zinc-800 rounded-2xl p-6 bg-zinc-950">
          {step === 1 && (
            <>
              <div className="text-zinc-200 font-medium">1) In 2–4 lines, what is this project?</div>
              <div className="text-zinc-500 text-sm mt-2">
                Explain it to a friend who doesn’t know your field.
              </div>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                className="mt-4 w-full min-h-[140px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-zinc-600"
                placeholder="Example: A ceramic collection exploring…"
              />
            </>
          )}

          {step === 2 && (
            <>
              <div className="text-zinc-200 font-medium">2) Who is it for — and where will they encounter it?</div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-500">Field</label>
                  <input
                    value={field}
                    onChange={(e) => setField(e.target.value)}
                    className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-zinc-600"
                    placeholder="e.g., Craft, Visual Arts, Design…"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Format</label>
                  <input
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-zinc-600"
                    placeholder="e.g., Exhibition, Product line, Workshop…"
                  />
                </div>
              </div>

              <div className="mt-5">
                <div className="text-xs text-zinc-500 mb-2">Audience (pick any)</div>
                {["General public", "Clients", "Institutions", "Collectors", "Community", "Students", "Professionals"].map((x) => (
                  <button
                    key={x}
                    onClick={() => setAudience(toggle(audience, x))}
                    className={`mr-2 mb-2 px-3 py-1.5 rounded-full text-sm border transition ${
                      audience.includes(x)
                        ? "bg-white text-black border-white"
                        : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
                    }`}
                  >
                    {x}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                <div className="text-xs text-zinc-500 mb-2">Contexts (where it will be used)</div>
                {["Website", "Open call", "Email", "Social", "Press", "Portfolio"].map((x) => (
                  <button
                    key={x}
                    onClick={() => setContexts(toggle(contexts, x))}
                    className={`mr-2 mb-2 px-3 py-1.5 rounded-full text-sm border transition ${
                      contexts.includes(x)
                        ? "bg-white text-black border-white"
                        : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
                    }`}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="text-zinc-200 font-medium">3) What should this description do?</div>
              <div className="text-zinc-500 text-sm mt-2">Pick 1–2.</div>
              <div className="mt-4">
                {["Explain clearly", "Convince to collaborate", "Present professionally", "Make it compelling"].map((x) => (
                  <button
                    key={x}
                    onClick={() => setIntention(toggle(intention, x))}
                    className={`mr-2 mb-2 px-3 py-1.5 rounded-full text-sm border transition ${
                      intention.includes(x)
                        ? "bg-white text-black border-white"
                        : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
                    }`}
                  >
                    {x}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                <div className="text-xs text-zinc-500 mb-2">Tone</div>
                {(["neutral","professional","accessible","poetic","funder_ready"] as Tone[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    className={`mr-2 mb-2 px-3 py-1.5 rounded-full text-sm border transition ${
                      tone === t ? "bg-white text-black border-white" : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="text-zinc-200 font-medium">4) What changes because this project exists?</div>
              <div className="text-zinc-500 text-sm mt-2">Choose up to 3 signals.</div>
              <div className="mt-4">
                {IMPACT.map((x) => (
                  <button
                    key={x}
                    onClick={() => setImpactSignals(toggle(impactSignals, x))}
                    className={`mr-2 mb-2 px-3 py-1.5 rounded-full text-sm border transition ${
                      impactSignals.includes(x)
                        ? "bg-white text-black border-white"
                        : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
                    }`}
                  >
                    {x}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                <div className="text-xs text-zinc-500 mb-2">Accessibility notes (optional)</div>
                <textarea
                  value={accessibility}
                  onChange={(e) => setAccessibility(e.target.value)}
                  className="w-full min-h-[110px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-zinc-600"
                  placeholder="e.g., captions, physical access, language, pricing…"
                />
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <div className="text-zinc-200 font-medium">5) Any proof / assets to support it?</div>
              <div className="text-zinc-500 text-sm mt-2">
                Links, reviews, press, portfolio, collaborators — anything.
              </div>
              <textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                className="mt-4 w-full min-h-[140px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-zinc-600"
                placeholder="Paste links or short notes…"
              />
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || busy}
            className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-50"
          >
            Back
          </button>

          {step < 5 ? (
            <button
              onClick={() => canNext && setStep((s) => s + 1)}
              disabled={!canNext || busy}
              className="px-5 py-2 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              onClick={onCreate}
              disabled={busy}
              className="px-5 py-2 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create Project DNA"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
