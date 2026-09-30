import { NextResponse } from "next/server";
import { logPilotError, pilotAuth } from "@/lib/noraya/pilot";

export const dynamic = "force-dynamic";

// Ο browser αναφέρει εδώ κάθε λάθος server (5xx) που είδε ο χρήστης, ώστε να
// καταγράφεται στη σελίδα admin και να φεύγει email — χωρίς αλλαγές σε κάθε σελίδα.
export async function POST(req: Request) {
  const auth = await pilotAuth("/api/pilot/report-error", "auto");
  if (auth.response) return NextResponse.json({ ok: false });
  const body = await req.json().catch(() => ({}));
  const url = String(body?.url || "").slice(0, 300);
  let route = "—";
  try {
    route = new URL(url, "http://x").pathname;
  } catch {
    /* αγνοείται */
  }
  await logPilotError(
    route,
    `HTTP ${Number(body?.status) || 0}: ${String(body?.detail || "").slice(0, 1500)}`,
    { page: String(body?.page || "").slice(0, 300), email: auth.caller.email },
    auth.caller.userId
  );
  return NextResponse.json({ ok: true });
}
