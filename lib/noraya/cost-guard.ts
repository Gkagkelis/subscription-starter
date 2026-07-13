// ============================================================
// NORAYA — Φρενο κοστους (cost guard)
// Εμποδιζει ΑΚΡΙΒΑ endpoints να τρεχουν πολλες φορες στη σειρα (χειροκινητα ή κατα λαθος).
// Χρησιμοποιει τον υπαρχοντα πινακα analysis_cache ως «κλειδαρια» — καμια νεα δομη.
// Fail-safe: αν κατι παει στραβα στον ελεγχο, ΕΠΙΤΡΕΠΕΙ (δεν μπλοκαρει τη λειτουργια).
// ============================================================

import { createClient } from "@supabase/supabase-js";

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export type GuardResult = { allowed: true } | { allowed: false; retry_in_minutes: number; last_run: string };

/**
 * Ελεγχει αν επιτρεπεται να τρεξει τωρα μια ακριβη λειτουργια.
 * @param key      μοναδικο ονομα λειτουργιας (π.χ. "recover")
 * @param minutes  ελαχιστο διαστημα μεταξυ δυο εκτελεσεων
 * @param isCron   true = κληση απο cron (ΠΑΝΤΑ επιτρεπεται, δεν πειραζει την κλειδαρια)
 */
export async function checkCostGuard(key: string, minutes: number, isCron = false): Promise<GuardResult> {
  if (isCron) return { allowed: true };
  try {
    const sb = svc();
    const kind = "cost_guard__" + key;
    const { data } = await sb
      .from("analysis_cache")
      .select("updated_at")
      .is("situation_id", null)
      .eq("analysis_kind", kind)
      .maybeSingle();

    const last = data?.updated_at ? new Date(data.updated_at).getTime() : 0;
    const elapsedMin = (Date.now() - last) / 60000;

    if (last && elapsedMin < minutes) {
      return {
        allowed: false,
        retry_in_minutes: Math.max(1, Math.ceil(minutes - elapsedMin)),
        last_run: new Date(last).toISOString(),
      };
    }

    // σφραγισε τον χρονο εκτελεσης
    const row = {
      situation_id: null,
      organization_id: null,
      analysis_kind: kind,
      input_hash: "guard",
      model_used: "none",
      result: { last_run: new Date().toISOString() },
    };
    const { data: upd } = await sb
      .from("analysis_cache")
      .update(row)
      .is("situation_id", null)
      .eq("analysis_kind", kind)
      .select("analysis_kind");
    if (!upd || upd.length === 0) await sb.from("analysis_cache").insert(row);

    return { allowed: true };
  } catch {
    return { allowed: true }; // fail-safe: ποτε δεν μπλοκαρουμε λογω σφαλματος
  }
}

/** Ελληνικο μηνυμα για μπλοκαρισμενη κληση. */
export function guardMessage(key: string, g: Extract<GuardResult, { allowed: false }>) {
  return {
    ok: false,
    blocked_by_cost_guard: true,
    message: `Η λειτουργία «${key}» είναι ακριβή και έτρεξε πρόσφατα. Ξαναδοκίμασε σε ~${g.retry_in_minutes} λεπτά (ή πρόσθεσε &force=1 αν είναι απολύτως απαραίτητο).`,
    last_run: g.last_run,
  };
}
