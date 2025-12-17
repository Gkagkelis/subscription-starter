"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";

type Project = { id: string; title: string; updated_at: string };

export default function DashboardHome() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/projects");
      if (res.ok) setProjects(await res.json());
    })();
  }, []);

  const last = projects[0];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold">Your Projects</h1>
            <p className="text-zinc-400 mt-2">
              Create a <span className="text-zinc-200">Project DNA</span> once — reuse it everywhere.
            </p>
          </div>
          <Link href="/dashboard/projects/new" className="px-5 py-3 rounded-xl bg-white text-black font-medium">
            + Describe a New Project
          </Link>
        </div>

        {last && (
          <div className="mt-8 border border-zinc-800 rounded-2xl p-5">
            <div className="text-xs text-zinc-500">Continue</div>
            <div className="flex items-center justify-between mt-2">
              <div>
                <div className="text-zinc-200 font-medium">{last.title}</div>
                <div className="text-zinc-500 text-sm">
                  Last updated: {new Date(last.updated_at).toLocaleString()}
                </div>
              </div>
              <Link href={`/dashboard/projects/${last.id}`} className="px-4 py-2 rounded-lg bg-zinc-800 text-sm">
                Open
              </Link>
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((p) => (
            <Link key={p.id} href={`/dashboard/projects/${p.id}`} className="border border-zinc-800 rounded-2xl p-5">
              <div className="text-zinc-200 font-medium">{p.title}</div>
              <div className="text-zinc-500 text-sm mt-2">
                Updated: {new Date(p.updated_at).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
