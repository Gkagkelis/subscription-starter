export const metadata = {
  title: "Privacy Policy | Axiprova",
  description: "How Axiprova collects and uses data.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold">Privacy Policy</h1>
        <p className="mt-3 text-zinc-400">Last updated: 2025</p>

        <p className="mt-8 text-zinc-300 leading-relaxed">
          This Privacy Policy explains how Axiprova (“we”, “us”, “our”) collects, uses, and protects
          information when you use our service (the “Service”).
        </p>

        <h2 className="mt-10 text-xl font-semibold">1. Information we process</h2>
        <ul className="mt-3 space-y-2 text-zinc-300 list-disc pl-6">
          <li>
            <b>Account information:</b> such as your email address and authentication identifiers
            needed to sign in.
          </li>
          <li>
            <b>Chat content:</b> messages you submit and responses you receive, including any files
            or text you choose to provide.
          </li>
          <li>
            <b>Technical data:</b> logs and device/browser data used for security, troubleshooting,
            and service reliability.
          </li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold">2. How we use information</h2>
        <ul className="mt-3 space-y-2 text-zinc-300 list-disc pl-6">
          <li>To operate the Service (authentication, storing chats where enabled, user experience).</li>
          <li>To generate AI responses and support workflows.</li>
          <li>To prevent abuse, maintain security, and debug issues.</li>
          <li>To communicate important updates about the beta/pilot.</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold">3. AI processing (OpenAI API)</h2>
        <p className="mt-3 text-zinc-300 leading-relaxed">
          To generate responses, the content you submit may be sent to OpenAI via API. Do not submit
          sensitive personal data unless you are comfortable doing so.
        </p>

        <h2 className="mt-10 text-xl font-semibold">4. Sharing</h2>
        <p className="mt-3 text-zinc-300 leading-relaxed">
          We share data only as needed to run the Service, for example with hosting/infrastructure
          providers and AI providers (OpenAI via API). We do not sell your personal data.
        </p>

        <h2 className="mt-10 text-xl font-semibold">5. Data retention</h2>
        <p className="mt-3 text-zinc-300 leading-relaxed">
          We retain information only as long as necessary to operate the Service, comply with legal
          obligations, and maintain security. During beta, we may periodically delete data as part
          of testing and iteration.
        </p>

        <h2 className="mt-10 text-xl font-semibold">6. Your rights & contact</h2>
        <p className="mt-3 text-zinc-300 leading-relaxed">
          You can request access, correction, or deletion of your data (where applicable). Contact:
          {" "}
          <a className="underline hover:text-zinc-200" href="mailto:viewscoperesearch@gmail.com">
            viewscoperesearch@gmail.com
          </a>
        </p>

        <p className="mt-10 text-zinc-400 text-sm">
          Note: This policy is provided for beta use and is not legal advice. Consider legal review
          before a public production launch.
        </p>
      </div>
    </main>
  );
}
