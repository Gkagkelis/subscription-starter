import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { INVITE_COOKIE, logPilotError, pilotDb } from "@/lib/noraya/pilot";

export const dynamic = "force-dynamic";

// Εξαργύρωση κωδικού από συνδεδεμένο χρήστη: τον συνδέει με τον λογαριασμό
// πελάτη (group) του κωδικού. Ο κωδικός έρχεται από το σώμα ή από το cookie
// που έβαλε το /api/invite/check κατά την εγγραφή.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Συνδεθείτε πρώτα." }, { status: 401 });
  }

  let code = "";
  try {
    const body = await req.json();
    code = String(body?.code || "").trim().toUpperCase();
  } catch {
    /* κενό σώμα */
  }
  if (!code) code = String(cookies().get(INVITE_COOKIE)?.value || "").trim().toUpperCase();

  const db = pilotDb();

  // Ήδη συνδεδεμένος με λογαριασμό πελάτη;
  const existing = await db.from("noraya_access").select("group_key, invite_code").eq("user_id", user.id).maybeSingle();
  if (existing.data) {
    const res = NextResponse.json({ ok: true, already: true, group_key: (existing.data as any).group_key });
    res.cookies.delete(INVITE_COOKIE);
    return res;
  }

  if (!code) {
    return NextResponse.json({ ok: false, error: "Συμπληρώστε τον κωδικό πρόσκλησης." }, { status: 400 });
  }

  const { data: redeemed, error } = await db.rpc("noraya_redeem_invite", { p_code: code });
  if (error) {
    await logPilotError("/api/invite/redeem", error.message, { code }, user.id);
    return NextResponse.json(
      { ok: false, error: "Η εξαργύρωση δεν είναι διαθέσιμη αυτή τη στιγμή. Δοκιμάστε σε λίγο." },
      { status: 503 }
    );
  }
  const row = Array.isArray(redeemed) ? (redeemed[0] as any) : (redeemed as any);
  if (!row) {
    return NextResponse.json({ ok: false, error: "Ο κωδικός δεν είναι έγκυρος ή έχει λήξει." }, { status: 404 });
  }

  const { error: insErr } = await db
    .from("noraya_access")
    .insert({ user_id: user.id, group_key: row.group_key, invite_code: row.code });
  if (insErr && String(insErr.code) !== "23505") {
    await logPilotError("/api/invite/redeem", insErr.message, { code }, user.id);
    return NextResponse.json({ ok: false, error: "Κάτι πήγε στραβά. Δοκιμάστε ξανά." }, { status: 500 });
  }

  const res = NextResponse.json({
    ok: true,
    group_key: row.group_key,
    org_type: row.org_type,
    party_key: row.party_key || null
  });
  res.cookies.delete(INVITE_COOKIE);
  return res;
}
