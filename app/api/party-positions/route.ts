import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// Χρωματα/συντομογραφιες (cosmetic) ανα κομμα
const META: Record<string, { abbr: string; color: string }> = {
  nd: { abbr: "ΝΔ", color: "#4a90d9" },
  syriza: { abbr: "ΣΥ", color: "#e754a2" },
  pasok: { abbr: "ΠΑ", color: "#2bb673" },
  kke: { abbr: "ΚΚΕ", color: "#d64545" },
  elliniki_lysi: { abbr: "ΕΛ", color: "#3f6fb0" },
  niki: { abbr: "ΝΙ", color: "#8b6db5" },
  spartiates: { abbr: "ΣΠ", color: "#7a7a7a" },
  mera25: { abbr: "ΜεΡΑ", color: "#c0392b" },
  elas: { abbr: "ΕΛΑΣ", color: "#e67e22" },
  elpida_dimokratia: { abbr: "ΕΛΠ", color: "#16a085" },
};

export async function GET() {
  try {
    const { data } = await svc()
      .from("political_party_profiles")
      .select("party_key, party_name, short_name, compass_economic, compass_social");
    const parties = (Array.isArray(data) ? data : [])
      .filter((r: any) => r.compass_economic != null && r.compass_social != null)
      .map((r: any) => ({
        key: r.party_key,
        name: r.short_name || r.party_name || r.party_key,
        abbr: META[r.party_key]?.abbr || (r.short_name || r.party_key).slice(0, 4),
        economic: Number(r.compass_economic),
        social: Number(r.compass_social),
        color: META[r.party_key]?.color || "#8aa0b8",
      }));
    return NextResponse.json({ ok: true, parties });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err), parties: [] }, { status: 500 });
  }
}
