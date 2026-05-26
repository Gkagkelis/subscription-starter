import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/onboarding
 * Returns the current user's organization profile, or null if none exists.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || null);
}

/**
 * POST /api/onboarding
 * Creates or updates the organization profile.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const partyKey = body.partyKey || body.organization?.partyKey || null;

  let partyProfile: any = null;

  if (partyKey) {
    const { data: profile, error: profileError } = await supabase
      .from("political_party_profiles")
      .select("*")
      .eq("party_key", partyKey)
      .eq("is_active", true)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message, source: "political_party_profiles" },
        { status: 500 }
      );
    }

    partyProfile = profile || null;
  }

  const row = {
    org_name:
      body.organization?.name?.trim() ||
      partyProfile?.party_name ||
      "",
    org_type: body.organization?.type || "Πολιτικό κόμμα",

    party_key: partyProfile?.party_key || partyKey,
    selected_party_profile_id: partyProfile?.id || null,
    party_profile_snapshot: partyProfile || null,
    profile_source: partyProfile ? "party_profile_registry" : "manual_onboarding",
    profile_review_status: partyProfile ? "starter_requires_user_review" : "user_editable",

    themes:
      body.themes && body.themes.length > 0
        ? body.themes
        : partyProfile?.core_themes || [],

    issues:
      body.issues && body.issues.length > 0
        ? body.issues
        : partyProfile?.known_positions || [],

    events: body.events || [],

    stakeholders:
      body.stakeholders || {
        ageGroups: [],
        socialGroups: partyProfile?.core_audiences || [],
        professionalGroups: [],
        institutions: [],
        publicActors: [],
      },

    mission:
      body.positions?.mission?.trim() ||
      partyProfile?.strategic_positioning ||
      "",

    red_lines:
      body.positions?.redLines?.trim() ||
      (Array.isArray(partyProfile?.red_lines)
        ? partyProfile.red_lines.join("\n")
        : ""),

    tone:
      body.positions?.tone?.trim() ||
      partyProfile?.default_tone ||
      "",

    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from("organizations")
      .update(row)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from("organizations")
    .insert({
      ...row,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
