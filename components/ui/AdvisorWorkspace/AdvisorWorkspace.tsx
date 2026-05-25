"use client";

import { useEffect, useMemo, useState } from "react";

type AdvisorActionType =
  | "analysis"
  | "scenario"
  | "social_map"
  | "stance"
  | "wording"
  | "custom";

type AdvisorMode = "analysis" | "scenario" | "stance";

type AdvisorThread = {
  id: string;
  title: string;
  topic: string | null;
  created_at: string;
  updated_at: string;
};

type AdvisorMessage = {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  action_type: AdvisorActionType | null;
  content: string;
  created_at: string;
};

type AdvisorAction = {
  title: string;
  description: string;
  mode: AdvisorMode;
  actionType: AdvisorActionType;
  buildQuestion: (topic: string) => string;
};

const actions: AdvisorAction[] = [
  {
    title: "Ανάλυση",
    description: "Τι συμβαίνει, γιατί έχει σημασία και τι χρειάζεται προσοχή.",
    mode: "analysis",
    actionType: "analysis",
    buildQuestion: (topic) =>
      `Κάνε μου καθαρή ανάλυση για το θέμα: ${topic}. Τι συμβαίνει, γιατί έχει σημασία και τι χρειάζεται προσοχή;`
  },
  {
    title: "Σενάριο",
    description: "Αν πάρουμε αυτή τη στάση ή απόφαση, τι μπορεί να γίνει;",
    mode: "scenario",
    actionType: "scenario",
    buildQuestion: (topic) =>
      `Αν κινηθούμε πολιτικά πάνω στο θέμα "${topic}", τι σενάρια ανοίγονται, ποιο είναι το ρίσκο και ποια είναι η ασφαλέστερη στάση;`
  },
  {
    title: "Κοινωνικός χάρτης",
    description: "Ποιες ομάδες επηρεάζονται και πώς.",
    mode: "analysis",
    actionType: "social_map",
    buildQuestion: (topic) =>
      `Φτιάξε κοινωνικό χάρτη για το θέμα: ${topic}. Ποιες κοινωνικές ομάδες επηρεάζονται περισσότερο και με ποιον τρόπο;`
  },
  {
    title: "Συνέπεια",
    description: "Ταιριάζει με τη γραμμή, τις θέσεις και τις κόκκινες γραμμές μας;",
    mode: "stance",
    actionType: "stance",
    buildQuestion: (topic) =>
      `Έλεγξε τη συνέπεια της πιθανής στάσης μας για το θέμα "${topic}" με το προφίλ, τις θέσεις και τις κόκκινες γραμμές μας.`
  },
  {
    title: "Διατύπωση",
    description: "Βρες ανθρώπινη, θεσμική και ασφαλή γραμμή.",
    mode: "stance",
    actionType: "wording",
    buildQuestion: (topic) =>
      `Πρότεινε μια ανθρώπινη, θεσμική και πολιτικά ασφαλή διατύπωση για το θέμα: ${topic}.`
  }
];

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("el-GR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function actionLabel(actionType?: AdvisorActionType | null) {
  if (actionType === "scenario") return "Σενάριο";
  if (actionType === "social_map") return "Κοινωνικός χάρτης";
  if (actionType === "stance") return "Συνέπεια";
  if (actionType === "wording") return "Διατύπωση";
  if (actionType === "analysis") return "Ανάλυση";
  return "Ερώτηση";
}

export default function AdvisorWorkspace({
  initialTopic,
  recommendedQuestion
}: {
  initialTopic?: string;
  recommendedQuestion?: string;
}) {
  const [threads, setThreads] = useState<AdvisorThread[]>([]);
  const [activeThread, setActiveThread] = useState<AdvisorThread | null>(null);
  const [messages, setMessages] = useState<AdvisorMessage[]>([]);
  const [topic, setTopic] = useState(initialTopic || "");
  const [customQuestion, setCustomQuestion] = useState("");
  const [supportingText, setSupportingText] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [error, setError] = useState("");

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.role === "assistant"),
    [messages]
  );

  useEffect(() => {
    loadThreads();
  }, []);

  const loadThreads = async () => {
    setLoadingThreads(true);

    try {
      const res = await fetch("/api/advisor/threads");

      if (!res.ok) {
        setError("Δεν μπόρεσαν να φορτωθούν οι συζητήσεις.");
        return;
      }

      const data = await res.json();
      const nextThreads = data.threads || [];

      setThreads(nextThreads);

      if (!activeThread && nextThreads.length > 0) {
        setActiveThread(nextThreads[0]);
        setTopic(nextThreads[0].topic || nextThreads[0].title || "");
        await loadMessages(nextThreads[0].id);
      }
    } catch {
      setError("Υπήρξε σφάλμα στη φόρτωση συζητήσεων.");
    } finally {
      setLoadingThreads(false);
    }
  };

  const loadMessages = async (threadId: string) => {
    setLoadingMessages(true);

    try {
      const res = await fetch(`/api/advisor/messages?threadId=${threadId}`);

      if (!res.ok) {
        setError("Δεν μπόρεσε να φορτωθεί το ιστορικό.");
        return;
      }

      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      setError("Υπήρξε σφάλμα στη φόρτωση ιστορικού.");
    } finally {
      setLoadingMessages(false);
    }
  };

  const createThread = async (topicValue: string) => {
    const res = await fetch("/api/advisor/threads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        topic: topicValue,
        title: topicValue || "Νέα συζήτηση"
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Δεν μπόρεσε να δημιουργηθεί νέα συζήτηση.");
    }

    const thread = data.thread as AdvisorThread;

    setActiveThread(thread);
    setThreads((current) => [thread, ...current]);
    setMessages([]);

    return thread;
  };

  const startNewThread = () => {
    setActiveThread(null);
    setMessages([]);
    setTopic("");
    setCustomQuestion("");
    setSupportingText("");
    setError("");
  };

  const selectThread = async (thread: AdvisorThread) => {
    setActiveThread(thread);
    setTopic(thread.topic || thread.title || "");
    setCustomQuestion("");
    setSupportingText("");
    setError("");
    await loadMessages(thread.id);
  };

  const askNoraya = async (
    question: string,
    mode: AdvisorMode,
    actionType: AdvisorActionType
  ) => {
    const cleanQuestion = question.trim();
    const cleanSupportingText = supportingText.trim();
    const cleanTopic = topic.trim() || cleanQuestion.substring(0, 100);

    const questionWithContext = cleanSupportingText
      ? `${cleanQuestion}

ΥΛΙΚΟ ΠΟΥ ΕΔΩΣΕ Ο ΧΡΗΣΤΗΣ ΓΙΑ ΑΝΑΛΥΣΗ:
${cleanSupportingText}`
      : cleanQuestion;

    if (!cleanQuestion) {
      setError("Γράψε ένα θέμα ή μια ερώτηση.");
      return;
    }

    setAdvisorLoading(true);
    setError("");

    try {
      const thread = activeThread || (await createThread(cleanTopic));

      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          threadId: thread.id,
          topic: cleanTopic,
          question: questionWithContext,
          mode,
          actionType
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Ο Noraya δεν μπόρεσε να απαντήσει.");
        return;
      }

      await loadMessages(thread.id);
      await loadThreads();
      setCustomQuestion("");
    } catch {
      setError("Υπήρξε σφάλμα σύνδεσης με τον σύμβουλο.");
    } finally {
      setAdvisorLoading(false);
    }
  };

  const runAction = (action: AdvisorAction) => {
    const cleanTopic = topic.trim();

    if (!cleanTopic) {
      setError("Πρώτα γράψε το θέμα που εξετάζουμε.");
      return;
    }

    askNoraya(action.buildQuestion(cleanTopic), action.mode, action.actionType);
  };

  const runCustomQuestion = () => {
    const cleanQuestion = customQuestion.trim();
    const cleanTopic = topic.trim();

    if (!cleanQuestion && !cleanTopic) {
      setError("Γράψε ένα θέμα ή μια ερώτηση.");
      return;
    }

    const question = cleanQuestion || `Κάνε ανάλυση για το θέμα: ${cleanTopic}`;

    askNoraya(question, "analysis", "custom");
  };

  return (
    <section className="mb-6 rounded-[2rem] border border-white/10 bg-white/[0.035] p-4 md:p-6">
      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
          <button
            type="button"
            onClick={startNewThread}
            className="mb-4 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            + Νέα συζήτηση
          </button>

          <div className="mb-3 text-xs uppercase tracking-[0.2em] text-zinc-600">
            Συζητήσεις
          </div>

          {loadingThreads && (
            <div className="rounded-2xl border border-white/10 p-3 text-xs text-zinc-500">
              Φόρτωση...
            </div>
          )}

          {!loadingThreads && threads.length === 0 && (
            <div className="rounded-2xl border border-white/10 p-3 text-xs leading-5 text-zinc-500">
              Δεν υπάρχει ακόμη ιστορικό. Ξεκίνησε με ένα θέμα.
            </div>
          )}

          <div className="space-y-2">
            {threads.map((thread) => {
              const active = activeThread?.id === thread.id;

              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => selectThread(thread)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-cyan-300/30 bg-cyan-300/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <div className="line-clamp-2 text-sm font-medium text-zinc-100">
                    {thread.topic || thread.title || "Νέα συζήτηση"}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-600">
                    {formatDate(thread.updated_at)}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="rounded-3xl border border-cyan-300/15 bg-slate-950/70 p-5">
          <div className="mb-5">
            <div className="mb-3 inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
              Σύμβουλος Noraya
            </div>

            <h2 className="text-xl font-semibold">Τι εξετάζουμε;</h2>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Γράψε ένα θέμα μία φορά και μετά ζήτησε ανάλυση, σενάριο,
              κοινωνικό χάρτη, συνέπεια ή ασφαλή διατύπωση πάνω στο ίδιο θέμα.
            </p>
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-zinc-600">
              Θέμα
            </label>

            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="π.χ. μείωση ΦΠΑ στα τρόφιμα"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300/40"
            />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <label className="text-xs uppercase tracking-[0.18em] text-zinc-600">
              Κείμενο / πρόταση προς ανάλυση
            </label>

            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Προαιρετικό. Επικόλλησε εδώ ανακοίνωση, πρόταση, τροπολογία,
              ομιλία ή κείμενο που θέλεις να λάβει υπόψη ο Noraya.
            </p>

            <textarea
              value={supportingText}
              onChange={(event) => setSupportingText(event.target.value)}
              rows={5}
              placeholder="Επικόλλησε εδώ το κείμενο που θέλεις να αναλύσει ο Noraya..."
              className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300/40"
            />

            {supportingText.trim() && (
              <div className="mt-2 text-xs text-emerald-300">
                Το κείμενο θα χρησιμοποιηθεί στην επόμενη απάντηση του Noraya.
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {actions.map((action) => (
              <button
                key={action.title}
                type="button"
                onClick={() => runAction(action)}
                disabled={advisorLoading}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="text-sm font-semibold text-cyan-100">
                  {action.title}
                </div>
                <div className="mt-2 text-xs leading-5 text-zinc-500">
                  {action.description}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <label className="text-xs uppercase tracking-[0.18em] text-zinc-600">
              Ή γράψε δική σου ερώτηση
            </label>

            <textarea
              value={customQuestion}
              onChange={(event) => setCustomQuestion(event.target.value)}
              rows={3}
              placeholder={
                recommendedQuestion ||
                "Γράψε εδώ την ερώτησή σου προς τον Noraya..."
              }
              className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300/40"
            />

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={runCustomQuestion}
                disabled={advisorLoading}
                className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {advisorLoading ? "Ο Noraya σκέφτεται..." : "Ρώτα τον Noraya"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="mt-6">
            <div className="mb-3 text-xs uppercase tracking-[0.2em] text-zinc-600">
              Ιστορικό ανάλυσης
            </div>

            {loadingMessages && (
              <div className="rounded-2xl border border-white/10 p-4 text-sm text-zinc-500">
                Φόρτωση ιστορικού...
              </div>
            )}

            {!loadingMessages && visibleMessages.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm leading-6 text-zinc-500">
                Δεν υπάρχει ακόμη απάντηση σε αυτή τη συζήτηση. Γράψε ένα θέμα
                και πάτησε μία από τις ενέργειες.
              </div>
            )}

            <div className="space-y-4">
              {visibleMessages.map((message) => (
                <article
                  key={message.id}
                  className="rounded-2xl border border-white/10 bg-black/25 p-5"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                      {actionLabel(message.action_type)}
                    </div>

                    <div className="text-xs text-zinc-600">
                      {formatDate(message.created_at)}
                    </div>
                  </div>

                  <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">
                    {message.content}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
