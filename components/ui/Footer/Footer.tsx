import Link from "next/link";
import Logo from "@/components/icons/Logo";

export default function Footer() {
  return (
    <footer className="mx-auto max-w-[1920px] px-6 bg-zinc-900">
      <div className="grid grid-cols-1 gap-8 py-12 text-white border-b lg:grid-cols-12 border-zinc-600 bg-zinc-900">
        <div className="col-span-1 lg:col-span-4">
          <Link href="/" className="flex items-center font-bold">
            <span className="mr-2 border rounded-full border-zinc-700">
              <Logo />
            </span>
            <span>Axiprova</span>
          </Link>

          <p className="mt-3 text-sm text-zinc-300 max-w-sm">
            Ο AI σύμβουλός σου για τον πολιτισμό & τη δημιουργική βιομηχανία.
          </p>
        </div>

        <div className="col-span-1 lg:col-span-4">
          <p className="font-bold text-white mb-4">Links</p>
          <ul className="flex flex-col gap-3">
            <li>
              <Link href="/about" className="text-white hover:text-zinc-200 transition">
                About
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-white hover:text-zinc-200 transition">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="text-white hover:text-zinc-200 transition">
                Terms of Use
              </Link>
            </li>
          </ul>
        </div>

        <div className="col-span-1 lg:col-span-4 lg:flex lg:justify-end">
          <div className="flex items-center h-10">
            <a
              href="mailto:hello@axiprova.com"
              className="text-white hover:text-zinc-200 transition"
            >
              hello@axiprova.com
            </a>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-between py-8 space-y-3 md:flex-row bg-zinc-900">
        <span className="text-sm text-zinc-300">
          &copy; {new Date().getFullYear()} Axiprova. All rights reserved.
        </span>

        <span className="text-sm text-zinc-400">Beta — pilot release.</span>
      </div>
    </footer>
  );
}
