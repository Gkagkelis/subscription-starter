"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Tone = "neutral" | "poetic" | "professional" | "accessible" | "funder_ready";

const AUDIENCE_OPTIONS = [
  "General public",
  "Clients",
  "Institutions",
  "Collectors",
  "Community",
  "Students",
  "Professionals",
];

const CONTEXT_OPTIONS = ["Website", "Open call", "Email", "Social", "Press", "Portfolio"];

const INTENTION_OPTIONS = ["Explain clearly", "Convince to collaborate", "Present professionally", "Make it compelling"];

const IMPACT_OPTIONS = ["Cultural", "Social", "Educational", "Economic", "Environmental"];

function toggle(arr: string[], v: string) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export default function NewProjectWizard() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 1
  const [raw, setRaw] = useState("");

  // Step 2
  const [field, setField] = useState<string>("");
  const [format, setFormat] = useState<string>("");
  const [audience, setAudience] = useState<string[]>([]);
  const [contexts, setContexts] = useState<string[]>([]);

  // Step 3
  const [intention, setIntention] = useState<string[]>([]);
  const [tone, setTone] = useState<Tone>("neutral");

  // Step 4
  const [impactSignals, setImpactSignals] = useState<string[]>([]);
  const [accessibility, setAccessibility] = useState("");

  // Step 5
  const [evidence, setEvidence] = useState("");

  const canNext = useMemo(() => {
    if (step === 1) return raw.trim().length >= 5; // για να μην “κολλάει” το Next
    return true;
  }, [step, raw]);

  const stepTitle = useMemo(() => {
    switch (step) {
      case 1:
        return "1) In 2–4 lines, what is this project?";
      case 2:
        return "2) Who is it for — and where will they encounter it?";
      case 3:
        return "3) What should this description do?";
      case 4:
        return "4) What changes because this project exists?";
      case 5:
        return "5) Any proof / assets to support it?";
      default:
        return "";
    }
  }, [step]);

  const onCreate = async () => {
    setBusy(true);
    setErrorMsg(null);

    try {
      // 1) Create Project
      const titleGuess =
        raw
          .split("\n")
          .find((l) => l.trim())
          ?.trim()
          .slice(0, 80) || "New Project";

      const pRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleGuess }),
      });

      if (!pRes.ok) {
        const t = await safeText(pRes);
        throw new Error(`Create project failed (${pRes.status}): ${t}`);
      }

      const project = await pRes.json();

      // 2) Generate Project DNA (IMPORTANT: flat payload that matches /api/ai/project-dna)
      const aiRes = await fetch("/api/ai/project-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });

      if (!aiRes.ok) {
        const t = await safeText(aiRes);
        throw new Error(`Generate Project DNA failed (${aiRes.status}): ${t}`);
      }

      const ai = await aiRes.json();
      // expected: { title, dna, derivatives: [{format, content}] }

      if (!ai?.dna || typeof ai.dna !== "string") {
        throw new Error("Generate Project DNA failed: missing dna in response");
      }

      // 3) Save DNA asset
      const dnaRes = await fetch("/api/project-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          kind: "dna",
          format: "dna",
          title: ai.title ?? titleGuess,
          content: ai.dna,
          tone,
          version: 1,
        }),
      });

      if (!dnaRes.ok) {
        const t = await safeText(dnaRes);
        throw new Error(`Save DNA failed (${dnaRes.status}): ${t}`);
      }

      // 4) Save derivatives (if provided)
      if (Array.isArray(ai.derivatives)) {
        for (const d of ai.derivatives) {
          if (!d?.format || !d?.content) continue;

          const derRes = await fetch("/api/project-assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: project.id,
              kind: "derivative",
              format: d.format,
              title: d.format,
              content: d.content,
              tone,
              version: 1,
            }),
          });

          if (!derRes.ok) {
            const t = await safeText(derRes);
            throw new Error(`Save derivative failed (${derRes.status}): ${t}`);
          }
        }
      }

      // 5) Go to Output screen
      router.push(`/dashboard/projects/${project.id}`);
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : "Something went wrong";
      setErrorMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold">Describe a New Project</h1>
            <p className="text-zinc-400 mt-2">5 guided steps → Project DNA → 1-click formats.</p>
          </div>
          <div className="text-sm text-zinc-500">Step {step}/5</div>
        </div>

        {errorMsg && (
          <div className="mt-6 border border-red-900 bg-red-950/40 text-red-200 rounded-2xl p-4 text-sm">
            {errorMsg}
          </div>
        )}

        <div className="mt-8 border border-zinc-800 rounded-2xl p-6 bg-zinc-950">
          <div className="text-zinc-200 font-medium">{stepTitle}</div>

          {step === 1 && (
            <>
              <div className="text-zinc-500 text-sm mt-2">Explain it to a friend who doesn’t know your field.</div>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                className="mt-4 w-full min-h-[150px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-zinc-600"
                placeholder="Example: A ceramic collection exploring memory through everyday objects…"
              />
              <p className="text-xs text-zinc-500 mt-2">
                {raw.trim().length < 5 ? "Write a couple of lines to continue." : "Looks good — click Next."}
              </p>
            </>
          )}

          {step === 2 && (
            <>
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
                {AUDIENCE_OPTIONS.map((x) => (
                  <button
                    key={x}
                    type="button"
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
                {CONTEXT_OPTIONS.map((x) => (
                  <button
                    key={x}
                    type="button"
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
              <div className="text-zinc-500 text-sm mt-2">Pick 1–2.</div>

              <div className="mt-4">
                {INTENTION_OPTIONS.map((x) => (
                  <button
                    key={x}
                    type="button"
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
                {(["neutral", "professional"]()
