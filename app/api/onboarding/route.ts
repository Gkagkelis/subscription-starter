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

  // PGRST116 = no rows found — that's fine, means no org yet
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

  // Map the frontend data shape to the DB columns
  const row = {
    org_name: body.organization?.name?.trim() || "",
    org_type: body.organization?.type || "Πολιτικό κόμμα",
    themes: body.themes || [],
    issues: body.issues || [],
    events: body.events || [],
    stakeholders: body.stakeholders || {
      ageGroups: [],
      socialGroups: [],
      professionalGroups: [],
      institutions: [],
      publicActors: [],
    },
    mission: body.positions?.mission?.trim() || "",
    red_lines: body.positions?.redLines?.trim() || "",
    tone: body.positions?.tone?.trim() || "",
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  };

  // Check if org already exists for this user
  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    // Update existing
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
  } else {
    // Insert new
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
}
