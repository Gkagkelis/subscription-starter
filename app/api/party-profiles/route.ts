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

  const activeResult = await supabase
    .from("political_party_profiles")
    .select("*")
    .eq("is_active", true)
    .order("party_name", { ascending: true });

  if (activeResult.error) {
    return NextResponse.json(
      {
        error: activeResult.error.message,
        source: "political_party_profiles_active",
      },
      { status: 500 }
    );
  }

  if ((activeResult.data || []).length > 0) {
    return NextResponse.json({
      count: activeResult.data?.length || 0,
      source: "active_profiles",
      fallback_used: false,
      profiles: activeResult.data || [],
    });
  }

  const fallbackResult = await supabase
    .from("political_party_profiles")
    .select("*")
    .order("party_name", { ascending: true });

  if (fallbackResult.error) {
    return NextResponse.json(
      {
        error: fallbackResult.error.message,
        source: "political_party_profiles_all",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    count: fallbackResult.data?.length || 0,
    source: "all_profiles",
    fallback_used: true,
    profiles: fallbackResult.data || [],
  });
}
