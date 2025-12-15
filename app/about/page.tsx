export const metadata = {
  title: "About | Axiprova",
  description: "Axiprova is your AI advisor for culture & the creative industries.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold">About Axiprova</h1>

        <p className="mt-6 text-zinc-300 leading-relaxed">
          Axiprova is an AI advisor for professionals, teams, and leaders working in culture and the
          creative industries. We help you move faster from ideas to plans, from drafts to polished
          text, and from questions to structured decisions.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Beta / Pilot</h2>
        <p className="mt-3 text-zinc-300 leading-relaxed">
          Axiprova is currently in beta. Our goal is to test real workflows, gather feedback, and
          improve reliability and usefulness. Features may change, be added, or be removed during
          the pilot period.
        </p>

        <h2 className="mt-10 text-xl font-semibold">AI Technology</h2>
        <p className="mt-3 text-zinc-300 leading-relaxed">
          Axiprova uses AI models via the OpenAI API to generate responses and support your
          workflows.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Contact</h2>
        <p className="mt-3 text-zinc-300">
          <a className="underline hover:text-zinc-200" href="mailto:viewscoperesearch@gmail.com">
            viewscoperesearch@gmail.com
          </a>
        </p>
      </div>
    </main>
  );
}
