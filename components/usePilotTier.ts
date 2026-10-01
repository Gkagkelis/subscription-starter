"use client";

import { useEffect, useState } from "react";

// Τι βλέπει ο συνδεδεμένος χρήστης (δωρεάν / ξεκλείδωμα ημέρας / admin).
// Μία κλήση στο /api/pilot/usage ανά φόρτωση σελίδας, κοινή για όλα τα components.
export type PilotTier = {
  loaded: boolean;
  isAdmin: boolean;
  dayPass: boolean;
  /** Σύμβουλος (chat): μόνο με ξεκλείδωμα ημέρας (ή admin). */
  advisor: boolean;
  /** Ατζέντα, Καταστάσεις, Πρόσωπα, Αρχεία, Δεδομένα, ανάλυση link: μόνο admin. */
  adminTools: boolean;
  /** Μετράμε τα θέματα που ανοίγει (δωρεάν εκδοχή). */
  limited: boolean;
};

const LOCKED: PilotTier = {
  loaded: false,
  isAdmin: false,
  dayPass: false,
  advisor: false,
  adminTools: false,
  limited: true
};

let pending: Promise<PilotTier> | null = null;

function fetchTier(): Promise<PilotTier> {
  if (!pending) {
    pending = fetch("/api/pilot/usage", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        if (!d?.ok) return { ...LOCKED, loaded: true };
        return {
          loaded: true,
          isAdmin: Boolean(d.is_admin),
          dayPass: Boolean(d.day_pass),
          advisor: Boolean(d.features?.advisor),
          adminTools: Boolean(d.features?.admin_tools),
          limited: Boolean(d.enabled)
        };
      })
      .catch(() => ({ ...LOCKED, loaded: true }));
  }
  return pending;
}

/** Ξαναδιαβάζει την εκδοχή (π.χ. μετά από ενεργοποίηση ξεκλειδώματος). */
export function refreshPilotTier() {
  pending = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("noraya-tier-refresh"));
}

export function usePilotTier(): PilotTier {
  const [tier, setTier] = useState<PilotTier>(LOCKED);
  useEffect(() => {
    let alive = true;
    const load = () => fetchTier().then((t) => alive && setTier(t));
    load();
    window.addEventListener("noraya-tier-refresh", load);
    return () => {
      alive = false;
      window.removeEventListener("noraya-tier-refresh", load);
    };
  }, []);
  return tier;
}

/**
 * Δωρεάν εκδοχή: πριν ανοίξει ένα θέμα στο «Σήμερα», ρωτάμε τον server αν
 * επιτρέπεται (έως 3 θέματα/ημέρα). Αν όχι, εμφανίζεται το μήνυμα ξεκλειδώματος.
 */
export async function requestTopicOpen(tier: PilotTier, key: string): Promise<boolean> {
  if (!tier.limited || tier.dayPass || !key) return true;
  try {
    const r = await fetch("/api/pilot/open-topic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });
    if (r.ok) {
      window.dispatchEvent(new Event("noraya-pilot-refresh"));
      return true;
    }
    const d = await r.json().catch(() => null);
    if (d?.limit_reached || d?.invite_required) {
      window.dispatchEvent(new CustomEvent("noraya-pilot-notice", { detail: d }));
      return false;
    }
    // Άλλο σφάλμα (δίκτυο/server): δεν μπλοκάρουμε τον πελάτη.
    return true;
  } catch {
    return true;
  }
}
