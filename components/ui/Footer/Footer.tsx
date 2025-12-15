import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mx-auto max-w-[1920px] px-6 bg-zinc-900">
      {/* Top footer area */}
      <div className="grid grid-cols-1 gap-8 py-12 text-white transition-colors duration-150 border-b lg:grid-cols-12 border-zinc-600 bg-zinc-900">
        {/* Brand (NO LOGO) */}
        <div className="col-span-1 lg:col-span-4">
          <Link href="/" className="flex items-center flex-initial md:mr-24">
            <span className="flex flex-col leading-tight">
              <span className="font-bold">Axiprova 2025</span>
              <span className="text-sm font-normal text-zinc-400">
                Your AI advisor for culture &amp; the creative industries
              </span>
            </span>
          </Link>
        </div>

        {/* Links */}
        <div className="col-span-1 lg:col-span-4">
          <p className="font-bold text-white mb-4">Links</p>
          <ul className="flex flex-col gap-3">
            <li>
              <Link
                href="/about"
                className="text-white transition duration-150 ease-in-out hover:text-zinc-200"
              >
                About
              </Link>
            </li>

            <li>
              <Link
                href="/privacy"
                className="text-white transition duration-150 ease-in-out hover:text-zinc-200"
              >
                Privacy Policy
              </Link>
            </li>

            <li>
              <Link
                href="/terms"
                className="text-white transition duration-150 ease-in-out hover:text-zinc-200"
              >
                Terms of Use
              </Link>
            </li>
          </ul>
        </div>

        {/* Contact */}
        <div className="col-span-1 lg:col-span-4 lg:flex lg:justify-end">
          <div className="flex items-start">
            <div>
              <p className="font-bold text-white mb-4">Contact</p>
              <a
                href="mailto:viewscoperesearch@gmail.com"
                className="text-white transition duration-150 ease-in-out hover:text-zinc-200"
              >
                viewscoperesearch@gmail.com
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom footer area */}
      <div className="flex flex-col items-center justify-between py-10 space-y-4 md:flex-row bg-zinc-900">
        <div className="text-sm text-zinc-300">Axiprova 2025</div>

        <div className="text-sm text-zinc-400 text-center">
          Your AI advisor for culture &amp; the creative industries
        </div>

        <div className="text-sm">
          <a
            href="mailto:viewscoperesearch@gmail.com"
            className="text-zinc-300 hover:text-zinc-200 transition"
          >
            viewscoperesearch@gmail.com
          </a>
        </div>
      </div>
    </footer>
  );
}
