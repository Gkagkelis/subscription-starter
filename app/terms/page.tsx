export const metadata = {
  title: "Terms of Use | Axiprova",
  description: "Terms for using Axiprova.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold">Terms of Use</h1>
        <p className="mt-3 text-zinc-400">Last updated: 2025</p>

        <p className="mt-8 text-zinc-300 leading-relaxed">
          By using Axiprova (the “Service”), you agree to these Terms of Use. If you do not agree,
          do not use the Service.
        </p>

        <h2 className="mt-10 text-xl font-semibold">1. Beta service</h2>
        <p className="mt-3 text-zinc-300 leading-relaxed">
          The Service may be provided as a beta/pilot. Features may change, be removed, or become
          unavailable. The Service is provided “as is” without warranties.
        </p>

        <h2 className="mt-10 text-xl font-semibold">2. AI outputs</h2>
        <p className="mt-3 text-zinc-300 leading-relaxed">
          AI-generated responses may be inaccurate, incomplete, or inappropriate for your specific
          context. Axiprova does not provide legal, financial, or professional advice. You remain
          responsible for decisions and actions taken based on the Service.
        </p>

        <h2 className="mt-10 text-xl font-semibold">3. Acceptable use</h2>
        <ul className="mt-3 space-y-2 text-zinc-300 list-disc pl-6">
          <li>Do not use the Service for unlawful purposes.</li>
          <li>Do not submit content that violates third-party rights.</li>
          <li>Do not attempt to bypass security, abuse the system, or disrupt the Service.</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold">4. Your content</h2>
        <p className="mt-3 text-zinc-300 leading-relaxed">
          You retain rights to the content you submit. You grant us a limited license to process
          your content solely to operate and provide the Service.
        </p>

        <h2 className="mt-10 text-xl font-semibold">5. Contact</h2>
        <p className="mt-3 text-zinc-300">
          <a className="underline hover:text-zinc-200" href="mailto:viewscoperesearch@gmail.com">
            viewscoperesearch@gmail.com
          </a>
        </p>
      </div>
    </main>
  );
}
