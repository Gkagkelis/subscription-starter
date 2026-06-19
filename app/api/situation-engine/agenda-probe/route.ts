import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    endpoint: "agenda-probe",
    mode: "read_only_test",
    message: "Agenda probe endpoint is alive.",
    generated_at: new Date().toISOString(),
  });
}
