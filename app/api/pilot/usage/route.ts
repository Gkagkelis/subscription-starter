import { NextResponse } from "next/server";
import {
  CATEGORY_LABELS,
  VISIBLE_CATEGORIES,
  athensDay,
  categoryLimit,
  getScopeUsage,
  pilotAuth,
  pilotConfig
} from "@/lib/noraya/pilot";

export const dynamic = "force-dynamic";

// Μετρητές χρήσης της ημέρας για τον συνδεδεμένο χρήστη ("Σενάρια 2/3").
export async function GET() {
  const auth = await pilotAuth("/api/pilot/usage", "auto");
  if (auth.response) return auth.response;
  const caller = auth.caller;

  const usage = await getScopeUsage(caller.scope, athensDay());
  const pass = Boolean(usage?.pass);
  const categories = VISIBLE_CATEGORIES.map((c) => ({
    key: c,
    label: CATEGORY_LABELS[c],
    used: usage?.byCategory[c] || 0,
    limit: categoryLimit(c, pass)
  }));
  const enabled = pilotConfig.limitsEnabled() && !caller.isAdmin;

  return NextResponse.json({
    ok: true,
    enabled,
    is_admin: caller.isAdmin,
    // Τι βλέπει ο πελάτης: ο Σύμβουλος μόνο με ξεκλείδωμα· οι υπόλοιπες καρτέλες
    // (Ατζέντα, Καταστάσεις, Πρόσωπα, Αρχεία, Δεδομένα) και τα εργαλεία admin μόνο για admin.
    features: {
      advisor: !enabled || pass,
      admin_tools: !enabled
    },
    day: athensDay(),
    day_pass: pass,
    day_pass_eur: pilotConfig.dayPassEur(),
    categories
  });
}
