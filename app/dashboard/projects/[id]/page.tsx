"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Asset = {
  id: string;
  project_id: string;
  user_id: string;
  kind: "dna" | "derivative";
  format: string;
  title?: string | null;
  content: string;
  tone?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

function detectLang(text: string): "el" | "en" {
  return /[\u0370-\u03FF\u1F00-\u1FFF]/.test(text) ? "el" : "en";
}

const FORMATS = [
  "Social Post",
  "Website Blurb",
  "Email Pitch",
  "Application Version",
  "Press Snippet",
  "Short Bio",
];

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id;

  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [err, setErr] = useState<string>("");

  const dnaAsset = useMemo(() => {
    const dnas = assets.filter((a) => a.kind === "dna");
    if (!dnas.length) return null;
    // τελευταία έκδοση / πιο πρόσφατο
    return [...dnas].sort((a, b) => (a.updated_at > b.updated_at ? -1 : 1))[0];
  }, [assets]);

  const uiLang = useMemo(() => {
    const base = dnaAsset?.content || "";
    const d = base ? detectLang(base) : (typeof navigator !== "undefined" && navigator.language.startsWith("el") ? "el" : "en");
    return d;
  }, [dnaAsset]);

  const t = (el: string, en: string) => (uiLang === "el" ? el : en);

  const [dnaDraft, setDnaDraft] = useState("");
  useEffect(() => {
    setDnaDraft(dnaAsset?.content ?? "");
  }, [dnaAsset?.content]);

  const [selectedFormat, setSelectedFormat] = useState<string>(FORMATS[0]);
  const [generated, setGenerated] = useState<string>("");
  const [busyGen, setBusyGen] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [toast, setToast] = useState<string>("");

  const existingDerivative = useMemo(() => {
    const ders = assets.filter((a) => a.kind === "derivative" && a.format === selectedFormat);
    if (!ders.length) return null;
    return [...ders].sort((a, b) => (a.updated_at > b.updated_at ? -1 : 1))[0];
  }, [assets, selectedFormat]);

  async function loadAssets() {
    try {
      setErr("");
      setLoading(true);

      const res = await fetch(`/api/project-assets?project_id=${encodeURIComponent(projectId)}`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Load assets failed (${res.status}): ${txt}`);
      }
      const data = await res.json();
      setAssets(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!projectId) return;
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function saveDNA() {
    try {
      setToast("");
      setBusySave(true);

      const res = await fetch("/api/project-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          kind: "dna",
          format: "dna",
          title: dnaAsset?.title ?? "Project DNA",
          content: dnaDraft,
          tone: dnaAsset?.tone ?? "neutral",
          version: (dnaAsset?.version ?? 0) + 1,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Save DNA failed (${res.status}): ${txt}`);
      }

      setToast(t("Αποθηκεύτηκε ✅", "Saved ✅"));
      await loadAssets();
    } catch (e: any) {
      setToast(e?.message ?? "Save failed");
    } finally {
      setBusySave(false);
      setTimeout(() => setToast(""), 2500);
    }
  }

  async function generateOne(format: string) {
    try {
      setToast("");
      setBusyGen(true);

      const baseDNA = dnaDraft?.trim() || dnaAsset?.content?.trim() || "";
      if (!baseDNA) throw new Error(t("Δεν βρέθηκε Project DNA.", "No Project DNA found."));

      const res = await fetch("/api/ai/derivative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dna: baseDNA,
          format,
          tone: dnaAsset?.tone ?? "neutral",
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Generation failed (${res.status}): ${txt}`);
      }

      const data = await res.json();
      setGenerated(typeof data?.content === "string" ? data.content : "");
      setToast(t("Έτοιμο ✅ Πάτα Save.", "Done ✅ Click Save."));
    } catch (e: any) {
      setToast(e?.message ?? "Generation failed");
    } finally {
      setBusyGen(false);
      setTimeout(() => setToast(""), 3500);
    }
  }

  async function saveDerivative() {
    try {
      setToast("");
      setBusySave(true);

      if (!generated.trim()) {
        setToast(t("Δεν υπάρχει κείμενο για αποθήκευση.", "Nothing to save."));
        return;
      }

      const res = await fetch("/api/project-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          kind: "derivative",
          format: selectedFormat,
          title: selectedFormat,
          content: generated,
          tone: dnaAsset?.tone ?? "neutral",
          version: (existingDerivative?.version ?? 0) + 1,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Save failed (${res.status}): ${txt}`);
      }

      setToast(t("Αποθηκεύτηκε ✅", "Saved ✅"));
      await loadAssets();
    } catch (e: any) {
      setToast(e?.message ?? "Save failed");
    } finally {
      setBusySave(false);
      setTimeout(() => setToast(""), 2500);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(t("Αντιγράφηκε ✅", "Copied ✅"));
      setTimeout(() => setToast(""), 1500);
    } catch {
      setToast(t("Δεν γίνεται αντιγραφή.", "Copy failed."));
      setTimeout(() => setToast(""), 2000);
    }
  }

  // “άρρωστο” one-click pack: βγάζει 5 formats μαζί (για habit)
  async function generatePack() {
    const pack = ["Social Post", "Website Blurb", "Email Pitch", "Press Snippet", "Short Bio"];
    setToast(t("Δημιουργώ πακέτο…", "Generating pack…"));
    for (const f of pack) {
      await generateOne(f);
      // μικρό delay για να μη βαράει σαν τρελό
      await new Promise((r) => setTimeout(r, 250));
      // auto-save μετά από κάθε generate
      if (generated.trim()) {
        await fetch("/api/project-assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            kind: "derivative",
            format: f,
            title: f,
            content: generated,
            tone: dnaAsset?.tone ?? "neutral",
            version: 1,
          }),
        });
      }
    }
    await loadAssets();
    setToast(t("Πακέτο έτοιμο ✅", "Pack ready ✅"));
    setTimeout(() => setToast(""), 2500);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-zinc-400">{t("Φορτώνω…", "Loading…")}</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white p-6">
        <div className="max-w-3xl mx-auto border border-red-900 bg-red-950/40 text-red-200 rounded-2xl p-4">
          {err}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{t("Project DNA", "Project DNA")}</h1>
            <p className="text-zinc-400 mt-2">
              {t(
                "Αυτό είναι το “source of truth”. Από εδώ βγαίνουν όλα τα formats με 1 κλικ.",
                "This is your source of truth. Everything else is generated from here in 1 click."
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveDNA}
              disabled={busySave || !dnaDraft.trim()}
              className="px-4 py-2 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 disabled:opacity-50"
            >
              {busySave ? t("Αποθήκευση…", "Saving…") : t("Save DNA", "Save DNA")}
            </button>
          </div>
        </div>

        {toast ? (
          <div className="mt-4 text-sm text-zinc-300 border border-zinc-800 bg-zinc-900/40 rounded-xl p-3">
            {toast}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: DNA */}
          <div className="border border-zinc-800 rounded-2xl p-5 bg-zinc-950">
            <div className="text-zinc-300 text-sm mb-3">{t("Το Project DNA σου", "Your Project DNA")}</div>
            <textarea
              value={dnaDraft}
              onChange={(e) => setDnaDraft(e.target.value)}
              className="w-full min-h-[420px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-zinc-600"
            />
            <div className="text-xs text-zinc-500 mt-2">
              {t("Tip: Μπορείς να το πειράξεις. Μετά τα formats βγαίνουν πιο σωστά.", "Tip: Edit DNA and formats improve instantly.")}
            </div>
          </div>

          {/* RIGHT: Derivatives */}
          <div className="border border-zinc-800 rounded-2xl p-5 bg-zinc-950">
            <div className="flex items-center justify-between">
              <div className="text-zinc-300 text-sm">{t("1-Click Derivatives", "1-Click Derivatives")}</div>
              <button
                type="button"
                onClick={generatePack}
                disabled={busyGen}
                className="px-3 py-1.5 rounded-full text-sm bg-zinc-900 text-zinc-300 border border-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
              >
                {t("Generate Pack", "Generate Pack")}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setSelectedFormat(f);
                    setGenerated(existingDerivative?.content ?? "");
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm border transition ${
                    selectedFormat === f
                      ? "bg-white text-black border-white"
                      : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => generateOne(selectedFormat)}
                disabled={busyGen}
                className="px-4 py-2 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 disabled:opacity-50"
              >
                {busyGen ? t("Γεννάω…", "Generating…") : t("Generate", "Generate")}
              </button>

              <button
                type="button"
                onClick={saveDerivative}
                disabled={busySave || !generated.trim()}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-zinc-200 border border-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
              >
                {busySave ? t("Αποθήκευση…", "Saving…") : t("Save", "Save")}
              </button>

              <button
                type="button"
                onClick={() => copy(generated)}
                disabled={!generated.trim()}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-zinc-200 border border-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
              >
                {t("Copy", "Copy")}
              </button>
            </div>

            <div className="mt-4">
              <textarea
                value={generated}
                onChange={(e) => setGenerated(e.target.value)}
                className="w-full min-h-[320px] bg-zinc-900 border border-zinc-800 rounded-xl p-4 focus:outline-none focus:border-zinc-600"
                placeholder={t("Το αποτέλεσμα θα εμφανιστεί εδώ…", "Generated output will appear here…")}
              />
              <div className="text-xs text-zinc-500 mt-2">
                {t(
                  "Tip: Πείραξε λίγο το αποτέλεσμα, πάτα Save και έχεις πάντα ιστορικό εκδόσεων.",
                  "Tip: Edit the output, hit Save, and you keep version history."
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
