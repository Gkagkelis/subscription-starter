import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { signal_type, project_id, asset_id, format, metadata } = body;

    if (!signal_type) {
      return NextResponse.json({ error: "Missing signal_type" }, { status: 400 });
    }

    // Valid signal types
    const validSignals = ["save", "regenerate", "edit", "copy", "delete"];
    if (!validSignals.includes(signal_type)) {
      return NextResponse.json({ error: "Invalid signal_type" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_feedback")
      .insert({
        user_id: user.id,
        project_id: project_id || null,
        asset_id: asset_id || null,
        signal_type,
        format: format || null,
        metadata: metadata || {},
      })
      .select("*")
      .single();

    if (error) {
      console.error("Feedback tracking error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error("Feedback API error:", e);
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// Optional: GET to retrieve user's feedback patterns
export async function GET(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");

    const { data, error } = await supabase
      .from("user_feedback")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Aggregate patterns
    const patterns = {
      total: data?.length || 0,
      by_signal: {} as Record<string, number>,
      by_format: {} as Record<string, number>,
      most_saved_format: null as string | null,
      most_regenerated_format: null as string | null,
    };

    data?.forEach((f) => {
      patterns.by_signal[f.signal_type] = (patterns.by_signal[f.signal_type] || 0) + 1;
      if (f.format) {
        patterns.by_format[f.format] = (patterns.by_format[f.format] || 0) + 1;
      }
    });

    // Find most saved/regenerated formats
    const saves = data?.filter((f) => f.signal_type === "save" && f.format) || [];
    const regens = data?.filter((f) => f.signal_type === "regenerate" && f.format) || [];

    if (saves.length) {
      const saveCounts: Record<string, number> = {};
      saves.forEach((s) => {
        if (s.format) saveCounts[s.format] = (saveCounts[s.format] || 0) + 1;
      });
      patterns.most_saved_format = Object.keys(saveCounts).sort((a, b) => saveCounts[b] - saveCounts[a])[0];
    }

    if (regens.length) {
      const regenCounts: Record<string, number> = {};
      regens.forEach((r) => {
        if (r.format) regenCounts[r.format] = (regenCounts[r.format] || 0) + 1;
      });
      patterns.most_regenerated_format = Object.keys(regenCounts).sort((a, b) => regenCounts[b] - regenCounts[a])[0];
    }

    return NextResponse.json({ feedback: data, patterns });
  } catch (e: any) {
    console.error("Feedback GET error:", e);
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
