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
        body: JSON.stringify({
          message,
          language: "auto",
        }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: any) => {
    setMessage(action.label);
    setResponse(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Culture Copilot</h1>
          <p className="text-gray-600 mt-2">
            Ο AI συμβουλος σου για πολιτιστικα projects
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <textarea
            placeholder="Γραψε τι σχεδιαζεις..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={4}
            className="w-full px-4 py-3 text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-lg"
          />
          <div className="flex justify-between items-center mt-4">
            <p className="text-sm text-gray-500">Tip: Πατα Enter για αποστολη</p>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Σκεφτομαι..." : "Στειλε"}
            </Button>
          </div>
        </div>

        {response && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 space-y-6">
            <div>
              <p className="text-gray-800 text-lg leading-relaxed whitespace-pre-wrap">{response.reply}</p>
            </div>

            {response.insights && response.insights.length > 0 && (
              <div className="bg-blue-50 p-5 rounded-xl border border-blue-100">
                <h3 className="font-semibold text-blue-900 mb-3">Insights</h3>
                <ul className="space-y-2">
                  {response.insights.map((insight: string, i: number) => (
                    <li key={i} className="text-blue-800">- {insight}</li>
                  ))}
                </ul>
              </div>
            )}

            {response.actions && response.actions.length > 0 && (
              <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-3">Επομενα βηματα</h3>
                <div className="flex flex-wrap gap-3">
                  {response.actions.map((action: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => handleAction(action)}
                      className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
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
          <div className="text-center py-8">
            <p className="text-gray-500">Ρωτησε με οτιδηποτε για το project σου!</p>
          </div>
        )}

      </div>
    </div>
  );
}
