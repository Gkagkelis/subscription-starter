"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// ============================================================
// NORAYA — Pilot στο browser:
// 1) πιάνει κεντρικά τις απαντήσεις «όριο ημέρας» / «χρειάζεται κωδικός» από
//    ΟΠΟΙΑΔΗΠΟΤΕ σελίδα και δείχνει καθαρό μήνυμα (χωρίς αλλαγές στις σελίδες),
// 2) δείχνει μετρητή «Χρήση σήμερα» (π.χ. Σενάρια 2/3),
// 3) κουμπί «Πλήρες ξεκλείδωμα ημέρας».
// ============================================================

type Category = { key: string; label: string; used: number; limit: number };
type Usage = {
  ok: boolean;
  enabled: boolean;
  day_pass: boolean;
  day_pass_eur: number;
  categories: Category[];
};
type Notice = {
  kind: "limit" | "invite" | "info" | "soft";
  message: string;
  dayPassAvailable?: boolean;
  eur?: number;
};

const HIDDEN_PREFIXES = ["/signin", "/choose-role", "/invite", "/demo", "/about", "/terms", "/privacy", "/auth"];

declare global {
  interface Window {
    __norayaPilotPatched?: boolean;
  }
}

export default function PilotGuard() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hidden = pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const loadUsage = useCallback(async () => {
    try {
      const r = await fetch("/api/pilot/usage", { cache: "no-store" });
      if (!r.ok) {
        setUsage(null);
        return;
      }
      setUsage(await r.json());
    } catch {
      /* αγνοείται */
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(loadUsage, 1500);
  }, [loadUsage]);

  // Κεντρικό "πιάσιμο" απαντήσεων ορίου από όλες τις σελίδες.
  useEffect(() => {
    if (typeof window === "undefined" || window.__norayaPilotPatched) return;
    window.__norayaPilotPatched = true;
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await original(input, init);
      try {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
        if (!url.includes("/api/") || url.includes("/api/pilot/")) return res;
        if (res.status === 429 || res.status === 403) {
          const data = await res.clone().json().catch(() => null);
          if (data?.limit_reached || data?.invite_required) {
            window.dispatchEvent(new CustomEvent("noraya-pilot-notice", { detail: data }));
          }
        } else if (res.ok && (init?.method || "GET").toUpperCase() === "POST") {
          window.dispatchEvent(new Event("noraya-pilot-refresh"));
        } else if (res.status >= 500) {
          // Καταγραφή λάθους server για τη σελίδα admin / email ειδοποίηση.
          const detail = await res.clone().text().catch(() => "");
          original("/api/pilot/report-error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url,
              status: res.status,
              detail: detail.slice(0, 1500),
              page: window.location.pathname
            })
          }).catch(() => {});
        }
      } catch {
        /* ποτέ δεν χαλάμε την κανονική απάντηση */
      }
      return res;
    };
  }, []);

  useEffect(() => {
    const onNotice = (e: Event) => {
      const d: any = (e as CustomEvent).detail || {};
      if (d.invite_required) {
        setNotice({ kind: "invite", message: d.error || "Η πρόσβαση γίνεται με κωδικό πρόσκλησης." });
      } else if (d.category === "auto" && !d.demo) {
        // Αυτόματες αναλύσεις (τρέχουν μόνες τους): ήπια ειδοποίηση, όχι παράθυρο.
        setNotice({
          kind: "soft",
          message: d.error || "Φτάσατε το ημερήσιο όριο αυτόματων αναλύσεων.",
          dayPassAvailable: Boolean(d.day_pass_available),
          eur: d.day_pass_eur
        });
      } else {
        setNotice({
          kind: "limit",
          message: d.error || "Φτάσατε το ημερήσιο όριο.",
          dayPassAvailable: Boolean(d.day_pass_available),
          eur: d.day_pass_eur
        });
      }
      loadUsage();
    };
    const onRefresh = () => scheduleRefresh();
    window.addEventListener("noraya-pilot-notice", onNotice);
    window.addEventListener("noraya-pilot-refresh", onRefresh);
    return () => {
      window.removeEventListener("noraya-pilot-notice", onNotice);
      window.removeEventListener("noraya-pilot-refresh", onRefresh);
    };
  }, [loadUsage, scheduleRefresh]);

  useEffect(() => {
    if (!hidden) loadUsage();
  }, [pathname, hidden, loadUsage]);

  // Επιστροφή από την πληρωμή.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const dp = params.get("daypass");
    if (dp === "ok") {
      setNotice({ kind: "info", message: "Ευχαριστούμε! Το πλήρες ξεκλείδωμα για σήμερα ενεργοποιείται σε λίγα δευτερόλεπτα." });
      setTimeout(loadUsage, 3000);
      setTimeout(loadUsage, 10000);
    } else if (dp === "cancel") {
      setNotice({ kind: "info", message: "Η πληρωμή ακυρώθηκε. Δεν έγινε καμία χρέωση." });
    }
  }, [loadUsage]);

  async function buyDayPass() {
    setBusy(true);
    try {
      const r = await fetch("/api/pilot/day-pass", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (d?.url) {
        window.location.href = d.url;
        return;
      }
      setNotice({ kind: "info", message: d?.message || d?.error || "Κάτι πήγε στραβά. Δοκιμάστε ξανά." });
      loadUsage();
    } finally {
      setBusy(false);
    }
  }

  const showWidget = !hidden && usage?.ok && usage.enabled;

  return (
    <>
      {showWidget ? (
        <div className="fixed bottom-4 right-4 z-[60] text-xs">
          {open ? (
            <div className="w-72 rounded-2xl border border-white/10 bg-[#0b1220]/95 p-4 text-zinc-200 shadow-2xl backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-semibold text-white">Χρήση σήμερα</span>
                <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white">
                  ✕
                </button>
              </div>
              {usage!.day_pass ? (
                <div className="mb-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-emerald-200">
                  Πλήρες ξεκλείδωμα ενεργό για σήμερα
                </div>
              ) : null}
              <ul className="space-y-1.5">
                {usage!.categories.map((c) => (
                  <li key={c.key} className="flex items-center justify-between">
                    <span className="text-zinc-400">{c.label}</span>
                    <span className={c.used >= c.limit ? "text-amber-300" : "text-zinc-200"}>
                      {usage!.day_pass ? c.used : `${c.used}/${c.limit}`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-zinc-500">Τα όρια ανανεώνονται κάθε μέρα στις 00:00.</p>
              {!usage!.day_pass ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={buyDayPass}
                  className="mt-3 w-full rounded-lg bg-cyan-300 px-3 py-2 font-medium text-black hover:bg-cyan-200 disabled:opacity-60"
                >
                  Πλήρες ξεκλείδωμα ημέρας — €{usage!.day_pass_eur}
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full border border-white/10 bg-[#0b1220]/90 px-3 py-2 text-zinc-300 shadow-lg backdrop-blur hover:text-white"
            >
              Χρήση σήμερα
            </button>
          )}
        </div>
      ) : null}

      {notice && notice.kind === "soft" ? (
        <div className="fixed bottom-16 right-4 z-[65] w-80 rounded-2xl border border-amber-300/30 bg-[#0b1220]/95 p-4 text-xs text-zinc-200 shadow-2xl">
          <p className="leading-5">{notice.message}</p>
          <div className="mt-3 flex justify-end gap-2">
            {notice.dayPassAvailable ? (
              <button
                type="button"
                disabled={busy}
                onClick={buyDayPass}
                className="rounded-lg bg-cyan-300 px-3 py-1.5 font-medium text-black hover:bg-cyan-200 disabled:opacity-60"
              >
                Ξεκλείδωμα — €{notice.eur ?? usage?.day_pass_eur ?? 40}
              </button>
            ) : null}
            <button type="button" onClick={() => setNotice(null)} className="rounded-lg border border-white/15 px-3 py-1.5">
              OK
            </button>
          </div>
        </div>
      ) : null}

      {notice && notice.kind !== "soft" ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1220] p-6 text-sm text-zinc-200 shadow-2xl">
            <p className="leading-6">{notice.message}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {notice.kind === "invite" ? (
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    router.push("/invite");
                  }}
                  className="rounded-lg bg-cyan-300 px-4 py-2 font-medium text-black hover:bg-cyan-200"
                >
                  Εισαγωγή κωδικού
                </button>
              ) : null}
              {notice.kind === "limit" && notice.dayPassAvailable ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={buyDayPass}
                  className="rounded-lg bg-cyan-300 px-4 py-2 font-medium text-black hover:bg-cyan-200 disabled:opacity-60"
                >
                  Πλήρες ξεκλείδωμα ημέρας — €{notice.eur ?? usage?.day_pass_eur ?? 40}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="rounded-lg border border-white/15 px-4 py-2 text-zinc-300 hover:text-white"
              >
                Κλείσιμο
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
