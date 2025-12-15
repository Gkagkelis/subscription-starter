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
          language: "auto", // auto-detect
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
    // When user clicks an action button, append it to conversation
    const actionMessage = `[Ενέργεια: ${action.label}]`;
    setMessage(actionMessage);
    // Optionally auto-submit
    // handleSubmit();
  };

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI Copilot</h1>
        <p className="text-muted-foreground">
          Ο καθημερινός σύμβουλός σου για πολιτιστικά projects
        </p>
      </div>

      {/* Chat Input */}
      <Card className="p-6">
        <Textarea
          placeholder="Γράψε τι σχεδιάζεις σήμερα... π.χ. 'Θέλω να οργανώσω workshop φωτογραφίας για εφήβους'"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="mb-4"
        />
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? "Σκέφτομαι..." : "Στείλε"}
        </Button>
      </Card>

      {/* AI Response */}
      {response && (
        <Card className="p-6 space-y-4">
          {/* Reply */}
          <div className="prose prose-sm">
            <p className="whitespace-pre-wrap">{response.reply}</p>
          </div>

          {/* Insights */}
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

          {/* Actions */}
          {response.actions && response.actions.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">⚡ Επόμενα βήματα:</h3>
              <div className="flex flex-wrap gap-2">
                {response.actions.map((action: any, i: number) => (
                  <Button
                    key={i}
                    variant="outline"
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
