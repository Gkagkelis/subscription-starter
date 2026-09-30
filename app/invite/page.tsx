"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Σελίδα κωδικού πρόσκλησης. Η πρόσβαση στο Noraya (pilot) γίνεται μόνο με κωδικό.
// - Χωρίς σύνδεση: ελέγχει τον κωδικό και οδηγεί στην εγγραφή.
// - Με σύνδεση: εξαργυρώνει τον κωδικό και οδηγεί στο onboarding.
export default function InvitePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/invite/status", { cache: "no-store" });
        const d = await r.json();
        if (cancelled) return;
        setLoggedIn(Boolean(d?.logged_in));
        if (d?.logged_in && d?.has_access) {
          // Πλήρης φόρτωση ώστε να μη χρησιμοποιηθεί παλιά (cached) ανακατεύθυνση του router.
          window.location.replace(d?.onboarded ? "/strategy-room" : "/onboarding");
          return;
        }
        if (d?.logged_in) {
          // Αν ο κωδικός δόθηκε κατά την εγγραφή, εξαργυρώνεται αυτόματα.
          const rr = await fetch("/api/invite/redeem", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}"
          });
          if (!cancelled && rr.ok) window.location.replace("/onboarding");
        }
      } catch {
        if (!cancelled) setLoggedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setError("Συμπληρώστε τον κωδικό πρόσκλησης.");
      return;
    }
    setBusy(true);
    try {
      const endpoint = loggedIn ? "/api/invite/redeem" : "/api/invite/check";
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) {
        setError(d?.error || "Ο κωδικός δεν είναι έγκυρος.");
        return;
      }
      if (loggedIn) {
        window.location.assign("/onboarding");
      } else {
        router.push(`/signin/signup?role=political_party&next=/onboarding&invite=${encodeURIComponent(clean)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-16 text-white">
      <div className="mx-auto max-w-md">
        <p className="mb-4 text-center text-xs uppercase tracking-[0.25em] text-zinc-500">Noraya</p>
        <h1 className="mb-3 text-center text-3xl font-light">Πρόσβαση με πρόσκληση</h1>
        <p className="mb-8 text-center text-sm text-zinc-500">
          Το Noraya βρίσκεται σε πιλοτική λειτουργία. Εισάγετε τον κωδικό πρόσκλησης που σας δόθηκε.
        </p>

        <form onSubmit={submit} className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
          <label htmlFor="invite-code" className="mb-2 block text-sm text-zinc-400">
            Κωδικός πρόσκλησης
          </label>
          <input
            id="invite-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="π.χ. ABCD-2026"
            className="w-full rounded-md bg-zinc-800 p-3 tracking-widest text-white"
          />
          {error ? <p className="mt-3 text-sm text-amber-300">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || loggedIn === null}
            className="mt-5 w-full rounded-md bg-white px-4 py-3 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
          >
            {busy ? "Έλεγχος…" : "Συνέχεια"}
          </button>
        </form>

        {!loggedIn ? (
          <div className="mt-8 text-center">
            <Link href="/signin/password_signin" className="text-sm text-zinc-500 transition hover:text-white">
              Έχετε ήδη λογαριασμό; Είσοδος
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
