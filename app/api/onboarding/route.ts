import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const GUEST_COOKIE_NAME = "noraya_guest_profile";

function readGuestProfileCookie() {
  const raw = cookies().get(GUEST_COOKIE_NAME)?.value;

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

function compactPartyProfile(profile: any) {
  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    party_key: profile.party_key,
    party_name: profile.party_name,
    short_name: profile.short_name,
    ideological_family: profile.ideological_family,
    strategic_positioning: profile.strategic_positioning,
    default_tone: profile.default_tone,
    core_themes: profile.core_themes,
    core_audiences: profile.core_audiences,
    known_positions: profile.known_positions,
    red_lines: profile.red_lines,
    opportunity_frame: profile.opportunity_frame,
    risk_frame: profile.risk_frame,
    competitor_frame: profile.competitor_frame,
    advisor_instructions: profile.advisor_instructions,
  };
}

function buildProfile(body: any, partyProfile: any, isGuest: boolean) {
  const partySnapshot = compactPartyProfile(partyProfile);

  const orgName =
    body.organization?.name?.trim() ||
    partySnapshot?.party_name ||
    "Πολιτικό κόμμα";

  const orgType = body.organization?.type || "Πολιτικό κόμμα";

  return {
    role_type: orgType,

    org_name: orgName,
    org_type: orgType,

    party_key: partySnapshot?.party_key || body.partyKey || body.organization?.partyKey || null,
    selected_party_profile_id: partySnapshot?.id || null,
    party_profile_snapshot: partySnapshot,

    profile_source: isGuest
      ? "guest"
      : partySnapshot
        ? "party_profile_registry"
        : "manual_onboarding",

    profile_review_status: isGuest
      ? "demo"
      : partySnapshot
        ? "starter_requires_user_review"
        : "user_editable",

    themes:
      body.themes && body.themes.length > 0
        ? body.themes
        : partySnapshot?.core_themes || [],

    issues:
      body.issues && body.issues.length > 0
        ? body.issues
        : partySnapshot?.known_positions || [],

    events: body.events || [],

    stakeholders:
      body.stakeholders || {
        ageGroups: [],
        socialGroups: partySnapshot?.core_audiences || [],
        professionalGroups: [],
        institutions: [],
        publicActors: [],
      },

    mission:
      body.positions?.mission?.trim() ||
      partySnapshot?.strategic_positioning ||
      "",

    red_lines:
      body.positions?.redLines?.trim() ||
      body.positions?.red_lines?.trim() ||
      (Array.isArray(partySnapshot?.red_lines)
        ? partySnapshot.red_lines.join("\n")
        : ""),

    tone:
      body.positions?.tone?.trim() ||
      partySnapshot?.default_tone ||
      "",

    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  };
}

/**
 * GET /api/onboarding
 * Returns the current user's organization profile.
 * If there is no signed-in user, returns guest profile from cookie.
 */
export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const guestProfile = readGuestProfileCookie();
    return NextResponse.json(guestProfile || null);
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
 * For MVP/demo, also works without login by saving guest profile in cookie.
 */
export async function POST(req: Request) {
  const supabase = createClient();
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  /**
   * GUEST / FREE USER PATH
   * No login. No Unauthorized.
   * Save profile in cookie so /api/advisor/agenda-brief can read it.
   */
  if (!user) {
    const guestProfile = buildProfile(body, partyProfile, true);

    const response = NextResponse.json({
      success: true,
      profile: guestProfile,
    });

    response.cookies.set(
      GUEST_COOKIE_NAME,
      encodeURIComponent(JSON.stringify(guestProfile)),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      }
    );

    return response;
  }

  /**
   * AUTHENTICATED USER PATH
   * Keep normal Supabase organization save.
   */
  const profile = buildProfile(body, partyProfile, false);

  const { role_type, ...row } = profile;

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

    return NextResponse.json({
      success: true,
      profile: data,
    });
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

  return NextResponse.json({
    success: true,
    profile: data,
  });
}
