"use client";

import type React from "react";
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

type AdvisorFile = {
  id: string;
  thread_id: string;
  file_name: string;
  file_type: string | null;
  extracted_text: string | null;
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
  const [files, setFiles] = useState<AdvisorFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [topic, setTopic] = useState(initialTopic || "");
  const [customQuestion, setCustomQuestion] = useState("");
  const [supportingText, setSupportingText] = useState("");
  const [savedSupportingText, setSavedSupportingText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [error, setError] = useState("");

  const visibleMessages = useMemo(
    () =>
      messages
        .filter((message) => message.role === "assistant")
        .slice()
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
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
        await loadFiles(nextThreads[0].id);
      }
    } catch {
      setError("Υπήρξε σφάλμα στη φόρτωση συζητήσεων.");
    } finally {
      setLoadingThreads(false);
    }
  };

  const loadFiles = async (threadId: string) => {
    setLoadingFiles(true);

    try {
      const res = await fetch(`/api/advisor/files?threadId=${threadId}`);

      if (!res.ok) {
        setError("Δεν μπόρεσε να φορτωθεί το υλικό της συζήτησης.");
        return;
      }

      const data = await res.json();
      setFiles(data.files || []);
    } catch {
      setError("Υπήρξε σφάλμα στη φόρτωση υλικού.");
    } finally {
      setLoadingFiles(false);
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
    setFiles([]);

    return thread;
  };

  const startNewThread = () => {
    setActiveThread(null);
    setMessages([]);
    setFiles([]);
    setTopic("");
    setCustomQuestion("");
    setSupportingText("");
    setSavedSupportingText("");
    setUploadedFileName("");
    setError("");
  };

  const selectThread = async (thread: AdvisorThread) => {
    setActiveThread(thread);
    setTopic(thread.topic || thread.title || "");
    setCustomQuestion("");
    setSupportingText("");
    setSavedSupportingText("");
    setUploadedFileName("");
    setError("");
    await loadMessages(thread.id);
    await loadFiles(thread.id);
  };

  const handleTextFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError(
        "Προς το παρόν υποστηρίζεται μόνο αρχείο .txt. Τα PDF/DOCX θα μπουν στο επόμενο βήμα."
      );
      event.target.value = "";
      return;
    }

    try {
      const text = await file.text();

      if (!text.trim()) {
        setError("Το αρχείο φαίνεται κενό.");
        event.target.value = "";
        return;
      }

      setSupportingText(text);
      setUploadedFileName(file.name);
      setError("");
    } catch {
      setError("Δεν μπόρεσε να διαβαστεί το αρχείο.");
    } finally {
      event.target.value = "";
    }
  };

  const saveSupportingText = async (threadId: string, text: string) => {
    const cleanText = text.trim();

    if (!cleanText || cleanText === savedSupportingText) {
      return;
    }

    const title =
      uploadedFileName ||
      (cleanText.length > 80
        ? `${cleanText.substring(0, 80)}...`
        : cleanText);

    const res = await fetch("/api/advisor/files", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        threadId,
        fileName: title || "Επικολλημένο κείμενο",
        fileType: "pasted_text",
        extractedText: cleanText
      })
    });

    if (res.ok) {
      setSavedSupportingText(cleanText);
      await loadFiles(threadId);
    }
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

      await saveSupportingText(thread.id, cleanSupportingText);

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
      await loadFiles(thread.id);
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
    const lowerQuestion = cleanQuestion.toLowerCase();

    if (!cleanQuestion && !cleanTopic) {
      setError("Γράψε ένα θέμα ή μια ερώτηση.");
      return;
    }

    if (
      ["ανάλυση", "αναλυση", "analysis"].includes(lowerQuestion) &&
      cleanTopic
    ) {
      askNoraya(
        `Κάνε μου καθαρή ανάλυση για το θέμα: ${cleanTopic}. Τι συμβαίνει, γιατί έχει σημασία και τι χρειάζεται προσοχή;`,
        "analysis",
        "analysis"
      );
      return;
    }

    if (
      ["σενάριο", "σεναριο", "scenario"].includes(lowerQuestion) &&
      cleanTopic
    ) {
      askNoraya(
        `Αν κινηθούμε πολιτικά πάνω στο θέμα "${cleanTopic}", τι σενάρια ανοίγονται, ποιο είναι το ρίσκο και ποια είναι η ασφαλέστερη στάση;`,
        "scenario",
        "scenario"
      );
      return;
    }

    if (
      [
        "κοινωνικός χάρτης",
        "κοινωνικος χαρτης",
        "κοινωνικός",
        "κοινωνικος",
        "social map"
      ].includes(lowerQuestion) &&
      cleanTopic
    ) {
      askNoraya(
        `Φτιάξε κοινωνικό χάρτη για το θέμα: ${cleanTopic}. Ποιες κοινωνικές ομάδες επηρεάζονται περισσότερο και με ποιον τρόπο;`,
        "analysis",
        "social_map"
      );
      return;
    }

    if (
      ["συνέπεια", "συνεπεια", "stance"].includes(lowerQuestion) &&
      cleanTopic
    ) {
      askNoraya(
        `Έλεγξε τη συνέπεια της πιθανής στάσης μας για το θέμα "${cleanTopic}" με το προφίλ, τις θέσεις και τις κόκκινες γραμμές μας.`,
        "stance",
        "stance"
      );
      return;
    }

    if (
      ["διατύπωση", "διατυπωση", "wording"].includes(lowerQuestion) &&
      cleanTopic
    ) {
      askNoraya(
        `Πρότεινε μια ανθρώπινη, θεσμική και πολιτικά ασφαλή διατύπωση για το θέμα: ${cleanTopic}.`,
        "stance",
        "wording"
      );
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

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/15">
                Ανέβασμα TXT
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={handleTextFileUpload}
                  className="hidden"
                />
              </label>

              <div className="text-xs text-zinc-600">
                Μπορείς επίσης να επικολλήσεις κείμενο χειροκίνητα.
              </div>
            </div>

            <textarea
              value={supportingText}
              onChange={(event) => setSupportingText(event.target.value)}
              rows={5}
              placeholder="Επικόλλησε εδώ το κείμενο που θέλεις να αναλύσει ο Noraya..."
              className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300/40"
            />

            {supportingText.trim() && (
              <div className="mt-2 text-xs text-emerald-300">
                {uploadedFileName
                  ? `Το αρχείο “${uploadedFileName}” διαβάστηκε και θα αποθηκευτεί στη συζήτηση.`
                  : "Το κείμενο θα χρησιμοποιηθεί και θα αποθηκευτεί στη συζήτηση."}
              </div>
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-600">
                  Υλικό συζήτησης
                </div>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Κείμενα ή αρχεία που έχεις δώσει στον Noraya για αυτή τη
                  συζήτηση.
                </p>
              </div>

              {loadingFiles && (
                <div className="text-xs text-zinc-600">Φόρτωση...</div>
              )}
            </div>

            {files.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-xs leading-5 text-zinc-500">
                Δεν έχει προστεθεί ακόμη υλικό σε αυτή τη συζήτηση.
              </div>
            )}

            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-zinc-100">
                        {file.file_name || "Επικολλημένο κείμενο"}
                      </div>

                      <div className="text-[11px] text-zinc-600">
                        {formatDate(file.created_at)}
                      </div>
                    </div>

                    {file.extracted_text && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                        {file.extracted_text}
                      </p>
                    )}
                  </div>
                ))}
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
              Γράψε ελεύθερα ή δώσε σύντομη εντολή
            </label>

            <textarea
              value={customQuestion}
              onChange={(event) => setCustomQuestion(event.target.value)}
              rows={3}
              placeholder={
                recommendedQuestion ||
                "π.χ. σενάριο, συνέπεια, διατύπωση ή γράψε ελεύθερα την ερώτησή σου..."
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
