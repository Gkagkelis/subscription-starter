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

  return NextResponse.json({
    ok: true,
    enabled: pilotConfig.limitsEnabled() && !caller.isAdmin,
    is_admin: caller.isAdmin,
    day: athensDay(),
    day_pass: pass,
    day_pass_eur: pilotConfig.dayPassEur(),
    categories
  });
}
