import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("token") !== "dev") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  // Αποκωδικοποίηση του JWT για να δω το role (χωρίς να εκθέσω το key)
  let role = "unknown";
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1] || "", "base64").toString()
    );
    role = payload.role || "no_role_field";
  } catch {
    role = "could_not_decode";
  }

  // Test write: παίρνω 1 αταξινόμητο, του βάζω classified_at, ελέγχω αν κράτησε
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: target } = await supabase
    .from("articles")
    .select("id")
    .is("classified_at", null)
    .limit(1);

  let writeWorked = false;
  let writeError: string | null = null;
  let rowsReturned = 0;

  if (target && target[0]) {
    const testId = target[0].id;
    const { data: updated, error } = await supabase
      .from("articles")
      .update({ classified_at: new Date().toISOString() })
      .eq("id", testId)
      .select("id");

    if (error) writeError = error.message;
    rowsReturned = Array.isArray(updated) ? updated.length : 0;
    writeWorked = rowsReturned > 0;
  }

  return NextResponse.json({
    key_role: role,            // ΠΡΕΠΕΙ να είναι "service_role"
    key_length: key.length,
    write_worked: writeWorked, // ΠΡΕΠΕΙ να είναι true
    rows_returned: rowsReturned,
    write_error: writeError,
    diagnosis:
      role !== "service_role"
        ? "ΤΟ ΚΛΕΙΔΙ ΔΕΝ ΕΙΝΑΙ SERVICE_ROLE — αυτό είναι το πρόβλημα"
        : writeWorked
        ? "Όλα ΟΚ — το κλειδί γράφει σωστά"
        : "Service key σωστό αλλά RLS μπλοκάρει το write",
  });
}
