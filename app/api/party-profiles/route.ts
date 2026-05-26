import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing Supabase server environment variables." },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("political_party_profiles")
    .select(
      `
      id,
      party_key,
      party_name,
      short_name,
      country_code,
      profile_type,
      profile_version,
      is_active,
      documentation_level,
      verification_status,
      ideological_family,
      strategic_positioning,
      default_tone,
      core_themes,
      core_audiences,
      known_positions,
      red_lines,
      opportunity_frame,
      risk_frame,
      competitor_frame,
      advisor_instructions,
      sources,
      updated_at
      `
    )
    .eq("is_active", true)
    .order("party_name", { ascending: true });

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        source: "political_party_profiles",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    count: data?.length || 0,
    profiles: data || [],
  });
}
