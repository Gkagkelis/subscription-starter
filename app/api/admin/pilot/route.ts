import { NextResponse } from "next/server";
import { athensDay, CATEGORY_LABELS, pilotAuth, pilotConfig, pilotDb } from "@/lib/noraya/pilot";

export const dynamic = "force-dynamic";

// Σελίδα admin του pilot: έσοδα, κόστος AI, χρήση, κωδικοί πρόσκλησης, λάθη.
// Μόνο για τα email του NORAYA_ADMIN_EMAILS.

function daysAgo(n: number) {
  return athensDay(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
}

export async function GET() {
  const auth = await pilotAuth("/api/admin/pilot", "auto", { adminOnly: true });
  if (auth.response) return auth.response;

  const db = pilotDb();
  const since = daysAgo(30);
  const today = athensDay();

  const [dailyRes, usageRes, passesRes, codesRes, accessRes, errorsRes] = await Promise.all([
    db.rpc("noraya_usage_daily", { p_since: since }),
    db.rpc("noraya_usage_breakdown", { p_day: today }),
    db.from("noraya_day_passes").select("*").gte("day", since).order("created_at", { ascending: false }).limit(500),
    db.from("noraya_invite_codes").select("*").order("created_at", { ascending: false }).limit(200),
    db.from("noraya_access").select("group_key").limit(10000),
    db.from("noraya_error_log").select("*").order("created_at", { ascending: false }).limit(50)
  ]);

  const missing = [dailyRes, usageRes, passesRes, codesRes, accessRes, errorsRes].find((r) => r.error);
  if (missing?.error) {
    return NextResponse.json({
      ok: false,
      error:
        "Οι πίνακες του pilot δεν βρέθηκαν στη βάση. Τρέξε πρώτα το SQL (supabase/migrations/20260929000100_noraya_pilot_limits.sql) στο Supabase.",
      detail: missing.error.message
    });
  }

  // Ανά μέρα: κόστος (user/cron/demo) και έσοδα.
  const days: Record<string, { day: string; user: number; cron: number; demo: number; revenue: number; passes: number }> = {};
  const ensure = (d: string) => (days[d] ||= { day: d, user: 0, cron: 0, demo: 0, revenue: 0, passes: 0 });
  const todayByScope: Record<string, { scope: string; cost: number; byCategory: Record<string, number> }> = {};
  const todayByRoute: Record<string, number> = {};

  for (const r of (dailyRes.data || []) as any[]) {
    const row = ensure(String(r.day));
    const cost = Number(r.cost_usd || 0);
    if (r.source === "cron") row.cron += cost;
    else if (r.source === "demo") row.demo += cost;
    else row.user += cost;
  }
  for (const r of (usageRes.data || []) as any[]) {
    const cost = Number(r.cost_usd || 0);
    const calls = Number(r.calls || 0);
    todayByRoute[r.route || "—"] = (todayByRoute[r.route || "—"] || 0) + cost;
    if (r.source !== "cron") {
      const s = (todayByScope[r.scope] ||= { scope: r.scope, cost: 0, byCategory: {} });
      s.cost += cost;
      if (r.counted) s.byCategory[r.category] = (s.byCategory[r.category] || 0) + calls;
    }
  }
  for (const p of (passesRes.data || []) as any[]) {
    const row = ensure(p.day);
    row.revenue += Number(p.amount_eur || 0);
    row.passes += 1;
  }

  const usersPerGroup: Record<string, number> = {};
  for (const a of (accessRes.data || []) as any[]) usersPerGroup[a.group_key] = (usersPerGroup[a.group_key] || 0) + 1;

  return NextResponse.json({
    ok: true,
    today,
    usd_to_eur: Number(process.env.NORAYA_USD_TO_EUR) || 0.9,
    config: {
      free_topics: pilotConfig.freeTopics(),
      free_scenarios: pilotConfig.freeScenarios(),
      free_attacks: pilotConfig.freeAttacks(),
      free_auto_calls: pilotConfig.freeAutoCalls(),
      free_usd_cap: pilotConfig.freeUsdCap(),
      pass_safety_usd: pilotConfig.passSafetyUsd(),
      day_pass_eur: pilotConfig.dayPassEur(),
      cron_daily_usd: pilotConfig.cronDailyUsd(),
      classify_daily_usd: pilotConfig.classifyDailyUsd(),
      cron_hours_utc: process.env.NORAYA_AI_CRON_HOURS_UTC || "4,10,16",
      invite_required: pilotConfig.inviteRequired(),
      limits_enabled: pilotConfig.limitsEnabled()
    },
    category_labels: CATEGORY_LABELS,
    days: Object.values(days).sort((a, b) => (a.day < b.day ? 1 : -1)),
    today_by_scope: Object.values(todayByScope).sort((a, b) => b.cost - a.cost),
    today_by_route: Object.entries(todayByRoute)
      .map(([route, cost]) => ({ route, cost }))
      .sort((a, b) => b.cost - a.cost),
    passes: passesRes.data || [],
    codes: ((codesRes.data || []) as any[]).map((c) => ({ ...c, users: usersPerGroup[c.group_key] || 0 })),
    errors: errorsRes.data || []
  });
}

export async function POST(req: Request) {
  const auth = await pilotAuth("/api/admin/pilot", "auto", { adminOnly: true });
  if (auth.response) return auth.response;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const db = pilotDb();

  if (action === "create_code") {
    const code = String(body?.code || "").trim().toUpperCase();
    const groupKey = String(body?.group_key || "").trim().toLowerCase();
    if (!/^[A-Z0-9-]{8,40}$/.test(code)) {
      return NextResponse.json({ ok: false, error: "Ο κωδικός: 8-40 χαρακτήρες, λατινικά κεφαλαία, αριθμοί και παύλα (δύσκολος να μαντευτεί)." }, { status: 400 });
    }
    if (!/^[a-z0-9_-]{2,40}$/.test(groupKey)) {
      return NextResponse.json({ ok: false, error: "Ο λογαριασμός πελάτη (group): λατινικά πεζά, αριθμοί, _ ή -." }, { status: 400 });
    }
    const { error } = await db.from("noraya_invite_codes").insert({
      code,
      label: String(body?.label || "").trim() || null,
      group_key: groupKey,
      org_type: "Πολιτικό κόμμα",
      party_key: String(body?.party_key || "").trim() || null,
      max_uses: Math.max(1, Math.min(500, Number(body?.max_uses) || 5)),
      active: true
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "toggle_code") {
    const code = String(body?.code || "").trim().toUpperCase();
    const { error } = await db.from("noraya_invite_codes").update({ active: Boolean(body?.active) }).eq("code", code);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "grant_pass") {
    const scope = String(body?.scope || "").trim();
    if (!/^(group|user):.+/.test(scope)) {
      return NextResponse.json({ ok: false, error: "Μη έγκυρος λογαριασμός (π.χ. group:elas)." }, { status: 400 });
    }
    const { error } = await db.from("noraya_day_passes").insert({
      scope,
      day: athensDay(),
      user_id: null,
      amount_eur: Math.max(0, Number(body?.amount_eur) || 0),
      source: "manual"
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Άγνωστη ενέργεια." }, { status: 400 });
}
