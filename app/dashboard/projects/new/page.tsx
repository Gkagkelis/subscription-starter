"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Tone = "neutral" | "poetic" | "professional" | "accessible" | "funder_ready";

const AUDIENCES = ["General public", "Clients", "Institutions", "Collectors", "Community", "Students", "Professionals"];
const CONTEXTS = ["Website", "Open call", "Email", "Social", "Press", "Portfolio"];
const INTENTIONS = ["Explain clearly", "Convince to collaborate", "Present professionally", "Make it compelling"];
const IMPACTS = ["Cultural", "Social", "Educational", "Economic", "Environmental"];

function toggle(arr: string[], v: string) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export default function NewProjectWizard() {
  const router = useRouter();

  const [step, setStep] = useState<number>(1);
  const [busy, setBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Step data
  const [raw, setRaw] = useState<string>("");
  const [field, setField] = useState<string>("");
  const [format, setFormat] = useState<string>("");
  const [audience, setAudience] = useState<string[]>([]);
  const [contexts, setContexts] = useState<string[]>([]);
  const [intention, setIntention] = useState<string[]>([]);
  const [tone, setTone] = useState<Tone>("neutral");
  const [impactSignals, setImpactSignals] = useState<string[]>([]);
  const [accessibilityNotes, setAccessibilityNotes] = useState<string>("");
  const [evidence, setEvidence] = useState<string>("");

  const canNext = useMemo(() => {
    if (step === 1) return raw.trim().length >= 5;
    return true;
  }, [step, raw]);

  const title = useMemo(() => {
    const firstLine = raw.split("\n").find((l) => l.trim())?.trim() ?? "";
    return firstLine.slice(0, 80) || "New Project";
  }, [raw]);

  async function onCreate() {
    setBusy(true);
    setErrorMsg("");

    try {
      // 1) Create project
      const pRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!pRes.ok) {
        const txt = await pRes.text();
        throw new Error(`Create project failed (${pRes.status}): ${txt}`);
      }

      const project = await pRes.json();

      // 2) Generate Project DNA (flat payload that matches /api/ai/project-dna)
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
          accessibility_notes: accessibilityNotes,
          evidence,
        }),
      });

      if (!aiRes.ok) {
        const txt = await aiRes.text();
        throw new Error(`Generate Project DNA failed (${aiRes.status}): ${txt}`);
      }

      const ai = await aiRes.json();

      if (!ai?.dna || typeof ai.dna !== "string") {
        throw new Error("Generate Project DNA failed: missing dna in response");
      }

      // 3) Save DNA
      const dnaRes = await fetch("/api/project-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          kind: "dna",
          format: "dna",
          title: ai.title ?? title,
          content: ai.dna,
          tone,
          version: 1,
        }),
      });

      if (!dnaRes.ok) {
        const txt = await dnaRes.text();
        throw new Error(`Save DNA failed (${dnaRes.status}): ${txt}`);
      }

      // 4) Save derivatives (optional)
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
            const txt = await derRes.text();
            throw new Error(`Save derivative failed (${derRes.status}): ${txt}`);
          }
        }
      }

      // 5) Go to output
      router.push(`/dashboard/projects/${project.id}`);
    } catch (e: any) {
      setErrorMsg(e?.message ? String(e.message) : "Something went wrong");
      setBusy(false);
      return;
    }

    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold">Describe a New Project</h1>
            <p className="text-zinc-400 mt-2">5 steps → Project DNA → derivatives.</p>
          </div>
          <div className="text-sm text-zinc-500">Step {step}/5</div>
        </div>

        {errorMsg ? (
          <div className="mt-6 border border-red-900 bg-red-950/40 text-red-200 rounded-2xl p-4 text-sm">
            {errorMsg}
          </div>
        ) : null}

        <div className="mt-8 border border-zinc-800 rounded-2xl p-6 bg-zinc-950">
          {step === 1 && (
            <>
              <div className="text-zinc-200 font-medium">1) What is this project?</div>
              <div className="text-zinc-500 text-sm mt-2">Write 2–4 lines.</div>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                className="mt-4 w-full min-h-[160px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-zinc-600"
                placeholder="Example: A ceramic collection exploring…"
              />
              <p className="text-xs text-zinc-500 mt-2">
                {raw.trim().length < 5 ? "Write a couple of lines to continue." : "OK — click Next."}
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <div className="text-zinc-200 font-medium">2) Who is it for & where will it appear?</div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-500">Field</label>
                  <input
                    value={field}
                    onChange={(e) => setField(e.target.value)}
                    className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-zinc-600"
                    placeholder="e.g., Craft, Visual Arts…"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Format</label>
                  <input
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-zinc-600"
                    placeholder="e.g., Exhibition, Product line…"
                  />
                </div>
              </div>

              <div className="mt-5">
                <div className="text-xs text-zinc-500 mb-2">Audience</div>
                {AUDIENCES.map((x) => (
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
                <div className="text-xs text-zinc-500 mb-2">Contexts</div>
                {CONTEXTS.map((x) => (
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
              <div className="text-zinc-200 font-medium">3) What should this description do?</div>
              <div className="text-zinc-500 text-sm mt-2">Pick 1–2.</div>

              <div className="mt-4">
                {INTENTIONS.map((x) => (
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
                {(["neutral", "professional", "accessible", "poetic", "funder_ready"] as Tone[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={`mr-2 mb-2 px-3 py-1.5 rounded-full text-sm border transition ${
                      tone === t
                        ? "bg-white text-black border-white"
                        : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
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
              <div className="text-zinc-200 font-medium">4) What changes because it exists?</div>
              <div className="text-zinc-500 text-sm mt-2">Choose up to 3.</div>

              <div className="mt-4">
                {IMPACTS.map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => {
                      const next = toggle(impactSignals, x);
                      if (next.length <= 3) setImpactSignals(next);
                    }}
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
                  value={accessibilityNotes}
                  onChange={(e) => setAccessibilityNotes(e.target.value)}
                  className="w-full min-h-[120px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-zinc-600"
                  placeholder="Captions, access, language, pricing…"
                />
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <div className="text-zinc-200 font-medium">5) Proof / assets (optional)</div>
              <div className="text-zinc-500 text-sm mt-2">Links, press, portfolio, collaborators…</div>
              <textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                className="mt-4 w-full min-h-[160px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-zinc-600"
                placeholder="Paste links or short notes…"
              />
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || busy}
            className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-50"
          >
            Back
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={() => (canNext ? setStep((s) => s + 1) : null)}
              disabled={!canNext || busy}
              className="px-5 py-2 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
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
