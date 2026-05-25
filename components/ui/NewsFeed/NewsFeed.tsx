"use client";

import { useEffect, useState } from "react";

interface Article {
  id: string;
  title: string;
  description: string | null;
  link: string;
  image_url: string | null;
  source_name: string;
  category: string | null;
  author: string | null;
  published_at: string | null;
}

const SOURCE_COLORS: Record<string, string> = {
  "Καθημερινή": "border-blue-400/30 bg-blue-400/10 text-blue-200",
  "Τα Νέα": "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "Το Βήμα": "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  "Αυγή": "border-red-400/30 bg-red-400/10 text-red-200",
  "Εφ.Συν.": "border-purple-400/30 bg-purple-400/10 text-purple-200",
  "Documento": "border-orange-400/30 bg-orange-400/10 text-orange-200",
  "Kontra News": "border-pink-400/30 bg-pink-400/10 text-pink-200",
  "Protothema": "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  "SKAI": "border-sky-400/30 bg-sky-400/10 text-sky-200",
  "Euro2day": "border-teal-400/30 bg-teal-400/10 text-teal-200",
  "Newsbomb": "border-yellow-400/30 bg-yellow-400/10 text-yellow-200",
  "Ethnos": "border-indigo-400/30 bg-indigo-400/10 text-indigo-200",
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "μόλις τώρα";
  if (diffMin < 60) return `${diffMin} λεπτά πριν`;
  if (diffHr < 24) return `${diffHr} ώρ${diffHr === 1 ? "α" : "ες"} πριν`;
  return `${diffDay} ημέρ${diffDay === 1 ? "α" : "ες"} πριν`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim();
}

export default function NewsFeed() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchArticles();
  }, [activeSource]);

  const fetchArticles = async () => {
    setLoading(true);
    try {
      let url = "/api/articles?limit=50";
      if (activeSource) url += `&source=${encodeURIComponent(activeSource)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles || []);
      }
    } catch (err) {
      console.error("Failed to fetch articles:", err);
    } finally {
      setLoading(false);
    }
  };

  const sources = [...new Set(articles.map((a) => a.source_name))].sort();

  const filtered = searchQuery
    ? articles.filter(
        (a) =>
          a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (a.description || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : articles;

  const sourceCounts: Record<string, number> = {};
  for (const a of articles) {
    sourceCounts[a.source_name] = (sourceCounts[a.source_name] || 0) + 1;
  }

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-cyan-950/10 backdrop-blur">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
            Live · {articles.length} άρθρα
          </div>
          <h2 className="text-2xl font-semibold">Ροή ΜΜΕ</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Πραγματικά άρθρα από ελληνικά μέσα ενημέρωσης
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Αναζήτηση..."
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white outline-none transition focus:border-cyan-300/40 placeholder:text-zinc-600"
          />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveSource(null)}
          className={`rounded-full border px-3 py-1.5 text-xs transition ${
            !activeSource
              ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
              : "border-white/10 text-zinc-500 hover:border-white/20"
          }`}
        >
          Όλες ({articles.length})
        </button>
        {Object.entries(sourceCounts).map(([source, count]) => (
          <button
            key={source}
            onClick={() => setActiveSource(activeSource === source ? null : source)}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              activeSource === source
                ? SOURCE_COLORS[source] || "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                : "border-white/10 text-zinc-500 hover:border-white/20"
            }`}
          >
            {source} ({count})
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-cyan-300" />
          <span className="ml-3 text-sm text-zinc-500">Φόρτωση άρθρων...</span>
        </div>
      )}

      {!loading && (
        <div className="space-y-3">
          {filtered.slice(0, 20).map((article) => (
            
              key={article.id}
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl border border-white/10 bg-slate-950/60 p-4 transition hover:border-white/20 hover:bg-slate-950/80"
            >
              <div className="flex gap-4">
                <div className="flex-1 min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        SOURCE_COLORS[article.source_name] ||
                        "border-zinc-500/30 bg-zinc-500/10 text-zinc-300"
                      }`}
                    >
                      {article.source_name}
                    </span>
                    {article.category && (
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-500">
                        {article.category}
                      </span>
                    )}
                    {article.published_at && (
                      <span className="text-[10px] text-zinc-600">
                        {timeAgo(article.published_at)}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-medium leading-snug text-zinc-100">
                    {article.title}
                  </h3>

                  {article.description && (
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                      {stripHtml(article.description).substring(0, 200)}
                    </p>
                  )}

                  {article.author && (
                    <p className="mt-2 text-[10px] text-zinc-600">
                      {article.author}
                    </p>
                  )}
                </div>

                {article.image_url && (
                  <div className="hidden sm:block shrink-0">
                    <img
                      src={article.image_url}
                      alt=""
                      className="h-20 w-28 rounded-xl object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
              </div>
            </a>
          ))}

          {filtered.length > 20 && (
            <div className="py-3 text-center text-xs text-zinc-600">
              +{filtered.length - 20} ακόμα άρθρα
            </div>
          )}

          {filtered.length === 0 && !loading && (
            <div className="py-12 text-center text-sm text-zinc-600">
              Δεν βρέθηκαν άρθρα
              {searchQuery && ` για "${searchQuery}"`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
