"use client";

import { useState } from "react";
import Button from "@/components/ui/Button/Button";

export default function DataPage() {
  const [kind, setKind] = useState("review");
  const [source, setSource] = useState("Google");
  const [content, setContent] = useState("");
  const [rating, setRating] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/data/snippets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          source,
          content,
          rating: rating ? parseInt(rating) : null,
        }),
      });
      if (res.ok) {
        setSuccess(true);
        setContent("");
        setRating("");
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Εισαγωγη Δεδομενων</h1>
          <p className="text-gray-600 mt-2">
            Προσθεσε reviews, trends, και παρατηρησεις για το AI
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 space-y-5">
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Τυπος
            </label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="review">Review (Κριτικη)</option>
              <option value="trend">Trend (Ταση)</option>
              <option value="competitor">Competitor (Ανταγωνιστης)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Πηγη
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="Google">Google Reviews</option>
              <option value="TripAdvisor">TripAdvisor</option>
              <option value="Facebook">Facebook</option>
              <option value="TikTok">TikTok</option>
              <option value="Instagram">Instagram</option>
              <option value="Observation">Προσωπικη Παρατηρηση</option>
              <option value="Other">Αλλο</option>
            </select>
          </div>

          {kind === "review" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Βαθμολογια (1-5)
              </label>
              <select
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">Χωρις βαθμολογια</option>
                <option value="5">5 - Αριστο</option>
                <option value="4">4 - Πολυ καλο</option>
                <option value="3">3 - Μετριο</option>
                <option value="2">2 - Κακο</option>
                <option value="1">1 - Πολυ κακο</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Περιεχομενο
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Επικολλησε το review, trend ή παρατηρηση εδω..."
              rows={5}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
          </div>

          <Button onClick={handleSubmit} disabled={loading || !content.trim()}>
            {loading ? "Αποθηκευση..." : "Προσθηκη"}
          </Button>

          {success && (
            <div className="bg-green-50 text-green-700 p-3 rounded-lg text-center">
              Αποθηκευτηκε επιτυχως!
            </div>
          )}
        </div>

        <div className="bg-purple-50 rounded-xl p-6 border border-purple-100">
          <h3 className="font-semibold text-purple-900 mb-3">Συμβουλες</h3>
          <ul className="space-y-2 text-purple-800 text-sm">
            <li>→ Προσθεσε reviews απο Google, TripAdvisor κλπ</li>
            <li>→ Σημειωσε trends που βλεπεις στα social media</li>
            <li>→ Καταγραψε τι κανουν οι ανταγωνιστες σου</li>
            <li>→ Οσο περισσοτερα δεδομενα, τοσο καλυτερες συμβουλες!</li>
          </ul>
        </div>

      </div>
    </div>
  );
}
