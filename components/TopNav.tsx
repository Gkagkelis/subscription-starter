"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Κοινή μπάρα πλοήγησης (μόνο τα tabs).
 * Χρησιμοποιείται από όλες τις σελίδες ώστε η πλοήγηση να είναι ίδια παντού:
 * από οποιαδήποτε σελίδα μπορείς να πας σε οποιαδήποτε άλλη.
 *
 * - Τα ενεργά tabs έχουν href και είναι clickable.
 * - Τα «Αρχεία» / «Δεδομένα» δεν έχουν ακόμη σελίδα → μένουν ανενεργά (γκρι).
 * - Το ενεργό tab εντοπίζεται αυτόματα από το τρέχον path.
 */

type NavTab = { label: string; href: string | null };

const NAV_TABS: NavTab[] = [
  { label: "Σήμερα", href: "/strategy-room" },
  { label: "Ατζέντα", href: "/agenda" },
  { label: "Καταστάσεις", href: "/situations" },
  { label: "Σενάρια", href: "/scenarios" },
  { label: "Πρόσωπα", href: "/people" },
  { label: "Επιθέσεις", href: "/attacks" },
  { label: "Αρχεία", href: "/archive" },
  { label: "Δεδομένα", href: null },
];

export default function TopNav({ className = "" }: { className?: string }) {
  const pathname = usePathname() || "";

  const isActive = (href: string | null) => {
    if (!href) return false;
    // Ενεργό αν το τρέχον path ξεκινά με το href του tab.
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav className={`flex items-center gap-1 ${className}`}>
      {NAV_TABS.map((tab) => {
        const active = isActive(tab.href);
        const base = "rounded-2xl px-3 py-2 text-xs transition";

        if (tab.href) {
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`${base} ${
                active
                  ? "border border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
                  : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
              }`}
            >
              {tab.label}
            </Link>
          );
        }

        // Ανενεργό tab (δεν υπάρχει ακόμη σελίδα).
        return (
          <span
            key={tab.label}
            className={`${base} cursor-not-allowed text-zinc-700`}
            title="Σύντομα διαθέσιμο"
          >
            {tab.label}
          </span>
        );
      })}
    </nav>
  );
}
