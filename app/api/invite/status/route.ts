import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isAdminEmail, isGrandfathered, pilotDb } from "@/lib/noraya/pilot";

export const dynamic = "force-dynamic";

// Κατάσταση πρόσβασης του συνδεδεμένου χρήστη (για onboarding/σελίδα κωδικού).
export async function GET() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, logged_in: false });

  let access: any = null;
  let invite: any = null;
  try {
    const db = pilotDb();
    const { data } = await db.from("noraya_access").select("group_key, invite_code").eq("user_id", user.id).maybeSingle();
    access = data || null;
    if (access?.invite_code) {
      const { data: inv } = await db
        .from("noraya_invite_codes")
        .select("org_type, party_key, label")
        .eq("code", access.invite_code)
        .maybeSingle();
      invite = inv || null;
    }
  } catch {
    /* fail-open */
  }

  const isAdmin = isAdminEmail(user.email);
  const grandfathered = isGrandfathered(user.created_at);
  return NextResponse.json({
    ok: true,
    logged_in: true,
    is_admin: isAdmin,
    has_access: Boolean(access) || isAdmin || grandfathered,
    group_key: access?.group_key || null,
    org_type: invite?.org_type || null,
    party_key: invite?.party_key || null,
    label: invite?.label || null
  });
}
