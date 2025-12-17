"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Asset = {
  id: string;
  project_id: string;
  kind: string;
  format: string;
  title: string | null;
  content: string;
  tone: string | null;
  version: number;
  created_at: string;
};

const DERIVATIVES = [
  { format: "social_post", label: "Social Post" },
  { format: "website_blurb", label: "Website Blurb" },
  { format: "email_pitch", label: "Email Pitch" },
  { format: "application_version", label: "Application Version" },
  { format: "short_bio", label: "Short Bio" },
  { format: "press_snippet", label: "Press Snippet" },
] as const;

export default function ProjectOutput() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const [dnaDraft, setDnaDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [selectedFormat, setSelectedFormat] = useState<(typeof DERIVATIVES)[number]["format"]>("social_post");
  const [generated, setGenerated] = useState<string>("");
  const [genBusy, setGenBusy] = useState(false);

  const dnaAsset = useMemo(() => assets.find((a) => a.kind === "dna" && a.format === "dna"), [assets]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/project-assets?project_id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setAssets(data);
      }
      setLoading(false);
    })();
  }, [projectId]);

  useEffect(() => {
    if (dnaAsset) setDnaDraft(dnaAsset.content);
  }, [dnaAsset]);

  const saveDna = async () => {
    if (!dnaAsset) return;
    setSaving(true);
    try {
      const res = await fetch("/api/project-assets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dnaAsset.id, content: dnaDraft }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      }
    } finally {
      setSaving(false);
    }
  };

  const generateDerivative = async () => {
    if (!dnaDraft.trim()) return;
    setGenBusy(true);
    setGenerated("");
    try {
      const res = await fetch("/api/ai/project-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "generate_derivative",
          dna: dnaDraft,
          format: selectedFormat,
          tone: "neutral",
        }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      setGenerated(data.content);
    } catch (e: any) {
      alert(e?.message ?? "Generation error");
    } finally {
      setGenBusy(false);
    }
  };

  const saveDerivative = async () => {
    if (!generated.trim()) return;
    const label = DERIVATIVES.find((d) => d.format === selectedFormat)?.label ?? selectedFormat;
    const res = await fetch("/api/project-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        kind: "derivative",
        format: selectedFormat,
        title: label,
        content: generated,
        tone: "neutral",
        version: 1,
      }),
    });
    if (res.ok) {
      const saved = await res.json();
      setAssets((prev) => [saved, ...prev]);
      alert("Saved to library.");
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(generated);
    alert("Copied.");
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 text-white p-10">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-zinc-400 text-sm">Project</div>
            <h1 className="text-2xl font-semibold">{dnaAsset?.title ?? "Project"}</h1>
            <p className="text-zinc-500 mt-2">Left = Project DNA. Right = 1-click formats.</p>
          </div>

          <button
            onClick={saveDna}
            disabled={saving || !dnaAsset}
            className="px-4 py-2 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save DNA"}
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* LEFT: DNA */}
          <div className="border border-zinc-800 rounded-2xl p-5 bg-zinc-950">
            <div className="flex items-center justify-between">
              <div className="text-zinc-200 font-medium">Project DNA</div>
              <div className="text-xs text-zinc-500">Editable</div>
            </div>

            <textarea
              value={dnaDraft}
              onChange={(e) => setDnaDraft(e.target.value)}
              className="mt-4 w-full min-h-[360px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-zinc-600"
            />
          </div>

          {/* RIGHT: Derivatives */}
          <div className="border border-zinc-800 rounded-2xl p-5 bg-zinc-950">
            <div className="text-zinc-200 font-medium">1-Click Derivatives</div>
            <div className="text-zinc-500 text-sm mt-2">Pick a format → Generate → Save.</div>

            <div className="mt-4 flex flex-wrap gap-2">
              {DERIVATIVES.map((d) => (
                <button
                  key={d.format}
                  onClick={() => setSelectedFormat(d.format)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition ${
                    selectedFormat === d.format
                      ? "bg-white text-black border-white"
                      : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={generateDerivative}
                disabled={genBusy}
                className="px-4 py-2 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 disabled:opacity-50"
              >
                {genBusy ? "Generating…" : "Generate"}
              </button>

              <button
                onClick={saveDerivative}
                disabled={!generated.trim()}
                className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-50"
              >
                Save
              </button>

              <button
                onClick={copy}
                disabled={!generated.trim()}
                className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-50"
              >
                Copy
              </button>
            </div>

            <textarea
              value={generated}
              onChange={(e) => setGenerated(e.target.value)}
              className="mt-4 w-full min-h-[260px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-zinc-600"
              placeholder="Generated output will appear here…"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
