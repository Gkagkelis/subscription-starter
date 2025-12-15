"use client";

import { useState } from "react";
import Button from "@/components/ui/Button/Button";
import Card from "@/components/ui/Card/Card";

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
    const actionMessage = `[Ενέργεια: ${action.label}]`;
    setMessage(actionMessage);
  };

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI Copilot</h1>
        <p className="text-gray-500">
          Ο καθημερινός σύμβουλός σου για πολιτιστικά projects
        </p>
      </div>

      <Card className="p-6">
        <textarea
          placeholder="Γράψε τι σχεδιάζεις σήμερα... π.χ. 'Θέλω να οργανώσω workshop φωτογραφίας για εφήβους'"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 mb-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? "Σκέφτομαι..." : "Στείλε"}
        </Button>
      </Card>

      {response && (
        <Card className="p-6 space-y-4">
          <div>
            <p className="whitespace-pre-wrap">{response.reply}</p>
          </div>

          {response.insights && response.insights.length > 0 && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">💡 Insights:</h3>
              <ul className="list-disc list-inside space-y-1">
                {response.insights.map((insight: string, i: number) => (
                  <li key={i}>{insight}</li>
                ))}
              </ul>
            </div>
          )}

          {response.actions && response.actions.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">⚡ Επόμενα βήματα:</h3>
              <div className="flex flex-wrap gap-2">
                {response.actions.map((action: any, i: number) => (
                  <Button
                    key={i}
                    variant="flat"
                    onClick={() => handleAction(action)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
