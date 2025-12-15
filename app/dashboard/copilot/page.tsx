"use client";

import { useState } from "react";
import Button from "@/components/ui/Button/Button";

export default function CopilotPage() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, language: "auto" }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (action: any) => {
    setMessage(action.label);
    setResponse(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const suggestions = [
    "Θελω να οργανωσω εκθεση φωτογραφιας",
    "Πως να προσελκυσω νεο κοινο 18-25",
    "Ιδεες για εκπαιδευτικα προγραμματα",
    "Βοηθεια με grant application",
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-purple-900">Axiprova</h1>
          <p className="text-purple-600 mt-2 text-lg">
            Ο AI συμβουλος σου για τον πολιτισμο
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 border border-purple-100">
          <textarea
            placeholder="Περιεγραψε τι σχεδιαζεις ή τι προκληση αντιμετωπιζεις..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={4}
            className="w-full px-4 py-3 text-gray-800 bg-purple-50 border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-lg placeholder-purple-300"
          />
          <div className="flex justify-between items-center mt-4">
            <p className="text-sm text-purple-400">Enter για αποστολη</p>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Σκεφτομαι..." : "Ρωτησε το Axiprova"}
            </Button>
          </div>
        </div>

        {response && (
          <div className="bg-white rounded-2xl shadow-xl p-6 border border-purple-100 space-y-5">
            <div className="prose max-w-none">
              <p className="text-gray-800 text-lg leading-relaxed whitespace-pre-wrap">
                {response.reply}
              </p>
            </div>

            {response.insights && response.insights.length > 0 && (
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-5 rounded-xl border border-purple-100">
                <h3 className="font-semibold text-purple-900 mb-3">Insights</h3>
                <ul className="space-y-2">
                  {response.insights.map((insight: string, i: number) => (
                    <li key={i} className="flex items-start text-purple-800">
                      <span className="mr-3 text-purple-500">→</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {response.actions && response.actions.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Επομενα βηματα</h3>
                <div className="flex flex-wrap gap-2">
                  {response.actions.map((action: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => handleAction(action)}
                      className="px-4 py-2 bg-purple-100 border border-purple-200 rounded-full text-purple-700 hover:bg-purple-200 transition-all text-sm font-medium"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!response && !loading && (
          <div className="text-center py-6">
            <p className="text-gray-500 mb-4">Ή δοκιμασε κατι απο αυτα:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setMessage(s)}
                  className="px-4 py-2 text-sm bg-white border border-purple-200 text-purple-600 rounded-full hover:bg-purple-50 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
