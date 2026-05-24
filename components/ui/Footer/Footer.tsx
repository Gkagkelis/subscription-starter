import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mx-auto max-w-[1920px] px-6 bg-zinc-900">
      <div className="border-t border-zinc-800 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-zinc-500 text-sm">
          <span>Noraya 2026</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-zinc-300 transition">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-300 transition">Terms</Link>
            <a href="mailto:viewscoperesearch@gmail.com" className="hover:text-zinc-300 transition">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
