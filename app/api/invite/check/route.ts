import { NextResponse } from "next/server";
import { INVITE_COOKIE, pilotConfig, pilotDb } from "@/lib/noraya/pilot";

export const dynamic = "force-dynamic";

// Έλεγχος κωδικού πρόσκλησης ΠΡΙΝ την εγγραφή. Αν είναι έγκυρος, κρατάμε τον
// κωδικό σε cookie ώστε να "εξαργυρωθεί" μόλις ο χρήστης συνδεθεί.
export async function POST(req: Request) {
  let code = "";
  try {
    const body = await req.json();
    code = String(body?.code || "").trim().toUpperCase();
  } catch {
    /* κενό σώμα */
  }
  if (!code) {
    // Αν ο κωδικός δεν απαιτείται (NORAYA_INVITE_REQUIRED=false), η εγγραφή προχωρά.
    if (!pilotConfig.inviteRequired()) return NextResponse.json({ ok: true, not_required: true });
    return NextResponse.json({ ok: false, error: "Συμπληρώστε τον κωδικό πρόσκλησης." }, { status: 400 });
  }

  const { data, error } = await pilotDb()
    .from("noraya_invite_codes")
    .select("code, label, active, uses, max_uses, org_type, party_key")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("[invite/check]", error);
    return NextResponse.json(
      { ok: false, error: "Ο έλεγχος κωδικού δεν είναι διαθέσιμος αυτή τη στιγμή. Δοκιμάστε σε λίγο." },
      { status: 503 }
    );
  }
  const row = data as any;
  if ((!row || !row.active || Number(row.uses) >= Number(row.max_uses)) && !pilotConfig.inviteRequired()) {
    return NextResponse.json({ ok: true, not_required: true });
  }
  if (!row || !row.active || Number(row.uses) >= Number(row.max_uses)) {
    return NextResponse.json({ ok: false, error: "Ο κωδικός δεν είναι έγκυρος ή έχει λήξει." }, { status: 404 });
  }

  const res = NextResponse.json({
    ok: true,
    label: row.label || null,
    org_type: row.org_type,
    party_key: row.party_key || null
  });
  res.cookies.set(INVITE_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });
  return res;
}
