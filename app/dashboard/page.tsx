"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Project = { id: string; title: string; updated_at: string };

export default function DashboardHome() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const data = await res.json();
          setProjects(Array.isArray(data) ? data : []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // optional: κάνε σιγουριά ότι το "Continue" είναι το πιο πρόσφατο
  const sorted = useMemo(() => {
    return [...projects].sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [projects]);

  const last = sorted[0];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold">Your Projects</h1>
            <p className="text-zinc-400 mt-2">
              Create a <span className="text-zinc-200">Project DNA</span> once —
              reuse it everywhere.
            </p>
          </div>

          {/* ✅ ΒΗΜΑ 2: διπλό κουμπί */}
          <div className="flex gap-3">
            <Link
              href="/dashboard/projects/new"
              className="px-5 py-3 rounded-xl bg-white text-black font-medium"
            >
              + Describe a New Project
            </Link>

            <Link
              href="/dashboard/copilot?from=nav"
              className="px-5 py-3 rounded-xl bg-zinc-900 text-white border border-zinc-700 font-medium"
            >
              Open Copilot
            </Link>
          </div>
        </div>

        {loading && <div className="mt-10 text-zinc-500">Loading…</div>}

        {!loading && last && (
          <div className="mt-8 border border-zinc-800 rounded-2xl p-5">
            <div className="text-xs text-zinc-500">Continue</div>
            <div className="flex items-center justify-between mt-2">
              <div>
                <div className="text-zinc-200 font-medium">{last.title}</div>
                <div className="text-zinc-500 text-sm">
                  Last updated: {new Date(last.updated_at).toLocaleString()}
                </div>
              </div>

              <Link
                href={`/dashboard/projects/${last.id}`}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-sm"
              >
                Open
              </Link>
            </div>
          </div>
        )}

        {!loading && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {sorted.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/projects/${p.id}`}
                className="border border-zinc-800 rounded-2xl p-5 hover:bg-zinc-900/40 transition"
              >
                <div className="text-zinc-200 font-medium">{p.title}</div>
                <div className="text-zinc-500 text-sm mt-2">
                  Updated: {new Date(p.updated_at).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
