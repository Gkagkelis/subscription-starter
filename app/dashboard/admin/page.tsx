"use client";

import { useState } from "react";

export default function AdminPage() {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("museum_management");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  const handleSubmit = async () => {
    if (!content || !title) {
      setResult("Συμπλήρωσε τίτλο και περιεχόμενο!");
      return;
    }

    setLoading(true);
    setResult("");

    try {
      const res = await fetch("/api/knowledge/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          title,
          source: "manual",
          category,
        }),
      });

      const data = await res.json();
      
      if (data.success) {
        setResult(`✅ Επιτυχία! Προστέθηκαν ${data.inserted} κομμάτια γνώσης.`);
        setContent("");
        setTitle("");
      } else {
        setResult(`❌ Σφάλμα: ${data.error}`);
      }
    } catch (error: any) {
      setResult(`❌ Σφάλμα: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Knowledge Base Admin</h1>
        <p className="text-zinc-400 mb-8">Πρόσθεσε γνώση για το AI</p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Τίτλος</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="π.χ. Museum Collection Management Guide"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Κατηγορία</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none focus:border-zinc-500"
            >
              <option value="museum_management">Museum Management</option>
              <option value="exhibition_planning">Exhibition Planning</option>
              <option value="audience_development">Audience Development</option>
              <option value="funding_grants">Funding & Grants</option>
              <option value="marketing">Marketing & Communications</option>
              <option value="cultural_policy">Cultural Policy</option>
              <option value="nonprofit_management">Nonprofit Management</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Περιεχόμενο</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Κάνε paste το κείμενο από PDF, guide, ή οποιαδήποτε πηγή..."
              rows={15}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none focus:border-zinc-500"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition"
          >
            {loading ? "Φόρτωση..." : "Προσθήκη στο Knowledge Base"}
          </button>

          {result && (
            <div className={`p-4 rounded-lg ${result.includes("✅") ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}`}>
              {result}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
