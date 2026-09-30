// ============================================================
// NORAYA — Pilot: πρόσβαση με κωδικό, ημερήσια όρια ανά κατηγορία,
// ξεκλείδωμα ημέρας, καταγραφή κόστους AI, όριο κόστους για τα crons,
// καταγραφή λαθών και email ειδοποιήσεις.
//
// Όλες οι ρυθμίσεις είναι μεταβλητές περιβάλλοντος στο Vercel, ώστε να
// αλλάζουν χωρίς αλλαγή κώδικα (βλ. docs/NORAYA_PILOT_SETUP.md).
//
// Αν οι πίνακες της βάσης λείπουν (δεν έτρεξε ακόμα το SQL), ΔΕΝ μπλοκάρουμε
// τη λειτουργία (fail-open) — απλώς γράφουμε το λάθος στα logs.
// ============================================================

import { NextResponse } from "next/server";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createUserClient } from "@/utils/supabase/server";

// ------------------------------------------------------------
// Ρυθμίσεις
// ------------------------------------------------------------

function envNum(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name: string, fallback: boolean) {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

export const pilotConfig = {
  limitsEnabled: () => envBool("NORAYA_LIMITS_ENABLED", true),
  inviteRequired: () => envBool("NORAYA_INVITE_REQUIRED", true),
  // Λογαριασμοί που δημιουργήθηκαν ΠΡΙΝ από αυτή την ημερομηνία δεν χρειάζονται
  // κωδικό (για να μη χάσει κανείς υπάρχων χρήστης την πρόσβαση).
  inviteCutoff: () => process.env.NORAYA_INVITE_CUTOFF || "2026-09-29T20:00:00Z",
  dailyLimit: () => envNum("NORAYA_DAILY_LIMIT", 3),
  passCap: () => envNum("NORAYA_PASS_CAP", 10),
  autoDailyLimit: () => envNum("NORAYA_AUTO_DAILY_LIMIT", 60),
  autoPassCap: () => envNum("NORAYA_AUTO_PASS_CAP", 120),
  scopeDailyUsdCap: () => envNum("NORAYA_SCOPE_DAILY_USD_CAP", 15),
  passDailyUsdCap: () => envNum("NORAYA_PASS_DAILY_USD_CAP", 25),
  demoDailyCalls: () => envNum("NORAYA_DEMO_DAILY_CALLS", 40),
  dayPassEur: () => envNum("NORAYA_DAY_PASS_EUR", 40),
  // Δύο ξεχωριστά όρια για τα crons, ώστε οι ακριβές συμβουλές να μη σταματούν
  // ποτέ τη φθηνή (και απαραίτητη) ταξινόμηση ειδήσεων.
  cronDailyUsd: () => envNum("NORAYA_CRON_DAILY_USD", 3),
  classifyDailyUsd: () => envNum("NORAYA_CLASSIFY_DAILY_USD", 3),
  demoDailyUsd: () => envNum("NORAYA_DEMO_DAILY_USD", 3),
  adminEmails: () =>
    (process.env.NORAYA_ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  alertEmail: () =>
    (process.env.NORAYA_ALERT_EMAIL || "").trim() || pilotConfig.adminEmails()[0] || ""
};

export const INVITE_COOKIE = "noraya_invite";

// ------------------------------------------------------------
// Κατηγορίες
// ------------------------------------------------------------

export type PilotCategory =
  | "scenario"
  | "chat"
  | "attacks"
  | "analysis"
  | "voices"
  | "architect"
  | "data"
  | "auto";

export const CATEGORY_LABELS: Record<PilotCategory, string> = {
  scenario: "Σενάρια",
  chat: "Σύμβουλος / Chat",
  attacks: "Επιθέσεις",
  analysis: "Ανάλυση link",
  voices: "Φωνές",
  architect: "Agenda architect",
  data: "Ανάγνωση δεδομένων",
  auto: "Αυτόματες αναλύσεις"
};

// Οι κατηγορίες που βλέπει ο χρήστης με μετρητή "x/3".
export const VISIBLE_CATEGORIES: PilotCategory[] = [
  "scenario",
  "chat",
  "attacks",
  "analysis",
  "voices",
  "architect",
  "data"
];

// ------------------------------------------------------------
// Βοηθητικά
// ------------------------------------------------------------

let _svc: SupabaseClient<any, "public", any> | null = null;
export function pilotDb(): SupabaseClient<any, "public", any> {
  if (!_svc) {
    _svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return _svc;
}

/** Η σημερινή μέρα σε ώρα Ελλάδας, "YYYY-MM-DD". Τα όρια μηδενίζονται 00:00 Αθήνα. */
export function athensDay(d: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
  return parts; // en-CA => YYYY-MM-DD
}

function isMissingTable(error: any) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  return code === "42P01" || code === "PGRST205" || /does not exist|Could not find the table/i.test(msg);
}

function json(status: number, body: Record<string, any>) {
  return NextResponse.json({ ok: false, ...body }, { status });
}

// ------------------------------------------------------------
// Κόστος (τιμές Anthropic, $ ανά 1 εκατ. tokens)
// ------------------------------------------------------------

function modelPrices(model: string): { input: number; output: number } {
  const m = (model || "").toLowerCase();
  if (m.includes("haiku")) return { input: 1, output: 5 };
  if (m.includes("sonnet")) return { input: 3, output: 15 };
  if (m.includes("opus")) return { input: 5, output: 25 };
  if (m.includes("gpt-4o-mini")) return { input: 0.15, output: 0.6 };
  if (m.includes("gpt-4o")) return { input: 2.5, output: 10 };
  // Άγνωστο μοντέλο: υπολογίζουμε με την ακριβότερη τιμή, για να μην υποτιμηθεί.
  return { input: 5, output: 25 };
}

export type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number } | null;
  // OpenAI
  prompt_tokens?: number;
  completion_tokens?: number;
} | null | undefined;

export function usageCostUsd(model: string, usage: TokenUsage) {
  const p = modelPrices(model);
  const u = usage || {};
  const input = Number(u.input_tokens ?? u.prompt_tokens ?? 0) || 0;
  const output = Number(u.output_tokens ?? u.completion_tokens ?? 0) || 0;
  const cacheWrite = Number(u.cache_creation_input_tokens || 0) || 0;
  const cacheRead = Number(u.cache_read_input_tokens || 0) || 0;
  const searches = Number(u.server_tool_use?.web_search_requests || 0) || 0;
  const cost =
    (input * p.input +
      output * p.output +
      cacheWrite * p.input * 1.25 +
      cacheRead * p.input * 0.1) /
      1_000_000 +
    searches * 0.01;
  return { cost, input, output, cacheWrite, cacheRead, searches };
}

// ------------------------------------------------------------
// Ποιος καλεί
// ------------------------------------------------------------

export type PilotCaller = {
  userId: string | null;
  email: string | null;
  scope: string; // "group:<key>" | "user:<id>" | "anon"
  isAdmin: boolean;
  category: PilotCategory;
  route: string;
  /** Κράτηση χρήσης από το pilotAllow (συμπληρώνεται με το κόστος στο pilotRecord). */
  reservationId?: number | null;
};

async function resolveScope(userId: string): Promise<{ scope: string; hasAccess: boolean }> {
  try {
    const { data, error } = await pilotDb()
      .from("noraya_access")
      .select("group_key")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (!isMissingTable(error)) console.error("[pilot] noraya_access read failed", error);
      return { scope: `user:${userId}`, hasAccess: false };
    }
    const g = (data as any)?.group_key;
    return g ? { scope: `group:${g}`, hasAccess: true } : { scope: `user:${userId}`, hasAccess: false };
  } catch (e) {
    console.error("[pilot] resolveScope", e);
    return { scope: `user:${userId}`, hasAccess: false };
  }
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  return pilotConfig.adminEmails().includes(email.toLowerCase());
}

/** Ο χρήστης είναι "παλιός" (πριν τον κωδικό πρόσκλησης) ή δεν απαιτείται κωδικός. */
export function isGrandfathered(createdAt: string | null | undefined) {
  if (!pilotConfig.inviteRequired()) return true;
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  const cutoff = new Date(pilotConfig.inviteCutoff()).getTime();
  return Number.isFinite(created) && Number.isFinite(cutoff) && created < cutoff;
}

type AuthOptions = {
  /** Επιτρέπεται χωρίς σύνδεση (σελίδες demo) — με κοινό ημερήσιο όριο. */
  allowAnon?: boolean;
  /** Μόνο για admin (π.χ. παλιές λειτουργίες Axiprova). */
  adminOnly?: boolean;
};

/**
 * Βήμα 1 (στην αρχή του route): ποιος καλεί και αν έχει δικαίωμα πρόσβασης.
 * Επιστρέφει είτε { caller } είτε { response } (401/403) για να επιστραφεί αμέσως.
 */
export type PilotAuthResult =
  | { caller: PilotCaller; response?: undefined }
  | { caller?: undefined; response: NextResponse };

export async function pilotAuth(
  route: string,
  category: PilotCategory,
  opts: AuthOptions = {}
): Promise<PilotAuthResult> {
  let user: any = null;
  try {
    const supabase = createUserClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  } catch {
    user = null;
  }

  if (!user) {
    if (opts.allowAnon && !opts.adminOnly) {
      return {
        caller: { userId: null, email: null, scope: "anon", isAdmin: false, category, route }
      };
    }
    return { response: json(401, { error: "Απαιτείται σύνδεση για αυτή τη λειτουργία.", login_required: true }) };
  }

  const email = (user.email as string) || null;
  const isAdmin = isAdminEmail(email);

  if (opts.adminOnly && !isAdmin) {
    return { response: json(403, { error: "Η λειτουργία δεν είναι διαθέσιμη σε αυτόν τον λογαριασμό." }) };
  }

  const { scope, hasAccess } = await resolveScope(user.id);

  if (!isAdmin && !hasAccess && !isGrandfathered(user.created_at)) {
    return {
      response: json(403, {
        error: "Η πρόσβαση γίνεται με κωδικό πρόσκλησης.",
        invite_required: true,
        invite_url: "/invite"
      })
    };
  }

  return { caller: { userId: user.id, email, scope, isAdmin, category, route } };
}

// ------------------------------------------------------------
// Ημερήσια όρια
// ------------------------------------------------------------

export async function hasDayPass(scope: string, day = athensDay()) {
  try {
    const { data, error } = await pilotDb()
      .from("noraya_day_passes")
      .select("id")
      .eq("scope", scope)
      .eq("day", day)
      .limit(1);
    if (error) {
      if (!isMissingTable(error)) console.error("[pilot] day pass read failed", error);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

export function categoryLimit(category: PilotCategory, pass: boolean) {
  if (category === "auto") return pass ? pilotConfig.autoPassCap() : pilotConfig.autoDailyLimit();
  return pass ? pilotConfig.passCap() : pilotConfig.dailyLimit();
}

export type ScopeUsage = {
  day: string;
  pass: boolean;
  costUsd: number;
  byCategory: Record<string, number>;
};

export async function getScopeUsage(scope: string, day = athensDay()): Promise<ScopeUsage | null> {
  try {
    const { data, error } = await pilotDb()
      .from("noraya_ai_usage")
      .select("category, cost_usd, counted, model, created_at")
      .eq("scope", scope)
      .eq("day", day)
      .limit(1000);
    if (error) {
      if (!isMissingTable(error)) console.error("[pilot] usage read failed", error);
      return null;
    }
    const byCategory: Record<string, number> = {};
    let costUsd = 0;
    const staleBefore = Date.now() - 10 * 60 * 1000;
    for (const row of (data || []) as any[]) {
      costUsd += Number(row.cost_usd || 0);
      // Κράτηση χωρίς αποτέλεσμα για >10 λεπτά = η κλήση AI απέτυχε· δεν μετράει.
      const staleReservation = row.model === "reserved" && new Date(row.created_at).getTime() < staleBefore;
      if (row.counted && !staleReservation) byCategory[row.category] = (byCategory[row.category] || 0) + 1;
    }
    const pass = await hasDayPass(scope, day);
    return { day, pass, costUsd, byCategory };
  } catch (e) {
    console.error("[pilot] getScopeUsage", e);
    return null;
  }
}

/**
 * Βήμα 2 (ακριβώς ΠΡΙΝ την κλήση στο AI, μετά τον έλεγχο cache):
 * επιστρέφει null αν επιτρέπεται, αλλιώς μια απάντηση 429 με ελληνικό μήνυμα.
 */
export async function pilotAllow(caller: PilotCaller): Promise<NextResponse | null> {
  if (!pilotConfig.limitsEnabled()) return null;
  if (caller.isAdmin) return null;

  const day = athensDay();

  if (caller.scope === "anon") {
    const r = await reserve(caller, day, null, pilotConfig.demoDailyCalls(), pilotConfig.demoDailyUsd(), "demo");
    if (r === "denied") {
      return json(429, {
        error: "Το ημερήσιο όριο της επίδειξης εξαντλήθηκε. Δοκιμάστε ξανά αύριο.",
        limit_reached: true,
        category: caller.category,
        demo: true
      });
    }
    return null;
  }

  const pass = await hasDayPass(caller.scope, day);
  const limit = categoryLimit(caller.category, pass);
  const usdCap = pass ? pilotConfig.passDailyUsdCap() : pilotConfig.scopeDailyUsdCap();

  const r = await reserve(caller, day, caller.category, limit, usdCap, "user");
  if (r === "ok") return null;

  let usage: ScopeUsage | null = null;
  if (r === "unavailable") {
    // Η ατομική κράτηση δεν είναι διαθέσιμη (π.χ. δεν έτρεξε ακόμα το SQL):
    // απλός έλεγχος — και fail-open αν ούτε αυτός απαντά.
    usage = await getScopeUsage(caller.scope, day);
    if (!usage) return null;
    const usedNow = usage.byCategory[caller.category] || 0;
    if (usage.costUsd < usdCap && usedNow < limit) return null;
  } else {
    usage = (await getScopeUsage(caller.scope, day)) || { day, pass, costUsd: usdCap, byCategory: {} };
  }

  const used = usage.byCategory[caller.category] || 0;
  const label = CATEGORY_LABELS[caller.category];
  const eur = pilotConfig.dayPassEur();
  const overCost = usage.costUsd >= usdCap;
  let error: string;
  if (pass) {
    error = overCost
      ? "Φτάσατε το ανώτατο όριο χρήσης για σήμερα. Για επιπλέον χρήση επικοινωνήστε μαζί μας."
      : `Φτάσατε το ανώτατο όριο για «${label}» σήμερα (${used}/${limit}). Για επιπλέον χρήση επικοινωνήστε μαζί μας.`;
  } else if (caller.category === "auto" || overCost) {
    error = `Φτάσατε το ημερήσιο όριο χρήσης. Τα όρια ανανεώνονται αύριο στις 00:00. Για απεριόριστη χρήση όλων των λειτουργιών σήμερα: Πλήρες ξεκλείδωμα ημέρας — €${eur}.`;
  } else {
    error = `Ολοκληρώσατε τα ${limit} «${label}» της ημέρας. Οι υπόλοιπες λειτουργίες παραμένουν διαθέσιμες. Τα όρια ανανεώνονται αύριο στις 00:00. Για απεριόριστη χρήση όλων των λειτουργιών σήμερα: Πλήρες ξεκλείδωμα ημέρας — €${eur} (κάλυψη κόστους επεξεργασίας με προηγμένα μοντέλα AI).`;
  }

  if (pass) {
    await sendAlert(
      `pass-cap:${caller.scope}:${day}`,
      `Noraya: ο πελάτης έφτασε το όριο ασφαλείας (${caller.scope})`,
      `<p>Ο λογαριασμός <b>${caller.scope}</b> έχει ξεκλείδωμα ημέρας και έφτασε το όριο ασφαλείας.</p>
       <p>Κατηγορία: ${label} — ${used}/${limit}. Κόστος σήμερα: $${usage.costUsd.toFixed(2)}.</p>
       <p>Αν θέλεις να τους δώσεις κι άλλο, άνοιξε τη σελίδα /admin/pilot.</p>`
    );
  }

  return json(429, {
    error,
    limit_reached: true,
    category: caller.category,
    category_label: label,
    used,
    limit,
    day_pass: pass,
    day_pass_available: !pass,
    day_pass_eur: eur
  });
}

/** Ατομική κράτηση μιας χρήσης (βλ. noraya_reserve στο SQL). */
async function reserve(
  caller: PilotCaller,
  day: string,
  countCategory: string | null,
  limit: number,
  usdCap: number,
  source: string
): Promise<"ok" | "denied" | "unavailable"> {
  try {
    const { data, error } = await pilotDb().rpc("noraya_reserve", {
      p_scope: caller.scope,
      p_day: day,
      p_category: caller.category,
      p_count_category: countCategory,
      p_limit: limit,
      p_usd_cap: usdCap,
      p_user: caller.userId,
      p_source: source,
      p_route: caller.route
    });
    if (error) {
      if (!isMissingTable(error) && String(error.code) !== "PGRST202") console.error("[pilot] reserve failed", error);
      return "unavailable";
    }
    if (data === null || data === undefined) return "denied";
    caller.reservationId = Number(data);
    return "ok";
  } catch (e) {
    console.error("[pilot] reserve", e);
    return "unavailable";
  }
}

/**
 * Βήμα 3 (μετά από ΕΠΙΤΥΧΗΜΕΝΗ κλήση στο AI): καταγραφή κόστους και χρήσης.
 * Δεν πετάει ποτέ λάθος — η καταγραφή δεν πρέπει να χαλάσει την απάντηση.
 */
export async function pilotRecord(
  caller: PilotCaller,
  model: string,
  usage: TokenUsage,
  opts: { counted?: boolean } = {}
) {
  // Η πρώτη καταγραφή συμπληρώνει την κράτηση του pilotAllow· οι επόμενες
  // (π.χ. δεύτερη προσπάθεια) γράφονται ως νέες γραμμές.
  if (caller.reservationId) {
    const id = caller.reservationId;
    caller.reservationId = null;
    try {
      const c = usageCostUsd(model, usage);
      const { error } = await pilotDb()
        .from("noraya_ai_usage")
        .update({
          model,
          input_tokens: c.input,
          output_tokens: c.output,
          cache_read_tokens: c.cacheRead,
          cache_write_tokens: c.cacheWrite,
          web_searches: c.searches,
          cost_usd: Number(c.cost.toFixed(6)),
          counted: opts.counted !== false
        })
        .eq("id", id);
      if (!error) return;
      console.error("[pilot] reservation update failed", error);
    } catch (e) {
      console.error("[pilot] reservation update", e);
    }
  }
  await recordUsageRow({
    scope: caller.scope,
    userId: caller.userId,
    source: caller.scope === "anon" ? "demo" : caller.scope === "cron" ? "cron" : "user",
    category: caller.category,
    route: caller.route,
    model,
    usage,
    counted: opts.counted !== false
  });
}

async function recordUsageRow(row: {
  scope: string;
  userId: string | null;
  source: string;
  category: string;
  route: string;
  model: string;
  usage: TokenUsage;
  counted: boolean;
}) {
  try {
    const c = usageCostUsd(row.model, row.usage);
    const { error } = await pilotDb().from("noraya_ai_usage").insert({
      day: athensDay(),
      scope: row.scope,
      user_id: row.userId,
      source: row.source,
      category: row.category,
      route: row.route,
      model: row.model,
      input_tokens: c.input,
      output_tokens: c.output,
      cache_read_tokens: c.cacheRead,
      cache_write_tokens: c.cacheWrite,
      web_searches: c.searches,
      cost_usd: Number(c.cost.toFixed(6)),
      counted: row.counted
    });
    if (error && !isMissingTable(error)) console.error("[pilot] usage insert failed", error);
  } catch (e) {
    console.error("[pilot] recordUsageRow", e);
  }
}

// ------------------------------------------------------------
// Crons: έλεγχος εξουσιοδότησης, ώρες λειτουργίας, ημερήσιο όριο κόστους
// ------------------------------------------------------------

/**
 * Κλήση από cron; Το Vercel στέλνει "Authorization: Bearer <CRON_SECRET>" όταν
 * υπάρχει η μεταβλητή CRON_SECRET στο project. Δεχόμαστε και ?token=<CRON_SECRET>.
 * ΜΕΤΑΒΑΤΙΚΑ: αν δεν έχει οριστεί καθόλου CRON_SECRET, δεχόμαστε όπως πριν το
 * "?token=dev" και το user-agent του Vercel cron, ώστε τα crons να μη σταματήσουν
 * πριν οριστεί το secret. Μόλις οριστεί, ισχύει ΜΟΝΟ το secret.
 */
export function isCronRequest(req: Request) {
  const rawSecret = process.env.CRON_SECRET || "";
  const secret = rawSecret.trim();
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const auth = req.headers.get("authorization") || "";
  if (secret) {
    return (
      auth === `Bearer ${secret}` ||
      auth === `Bearer ${rawSecret}` ||
      token === secret ||
      token === rawSecret
    );
  }
  const ua = req.headers.get("user-agent") || "";
  if (token === "dev" || ua.includes("vercel-cron/1.0")) {
    console.warn("[pilot] CRON_SECRET δεν έχει οριστεί — δεκτή η παλιά πρόσβαση. Όρισε CRON_SECRET στο Vercel.");
    return true;
  }
  return false;
}

/** Αυστηρό: μόνο με το πραγματικό CRON_SECRET (όχι το παλιό "dev"). */
export function isCronSecretRequest(req: Request) {
  if (!(process.env.CRON_SECRET || "").trim()) return false;
  return isCronRequest(req);
}

/**
 * Όπως το pilotAuth, αλλά μια κλήση με το πραγματικό CRON_SECRET περνάει χωρίς
 * όρια (καταγράφεται ως κόστος cron).
 */
export async function pilotAuthRequest(
  req: Request,
  route: string,
  category: PilotCategory,
  opts: AuthOptions = {}
): Promise<PilotAuthResult> {
  if (isCronSecretRequest(req)) {
    return {
      caller: { userId: null, email: null, scope: "cron", isAdmin: true, category, route } as PilotCaller
    };
  }
  return pilotAuth(route, category, opts);
}

/** Cron ή συνδεδεμένος admin. */
export async function isCronOrAdmin(req: Request) {
  if (isCronRequest(req)) return true;
  try {
    const supabase = createUserClient();
    const { data } = await supabase.auth.getUser();
    return isAdminEmail(data?.user?.email);
  } catch {
    return false;
  }
}

/**
 * Ώρες (UTC) που τρέχουν τα ακριβά crons. Προεπιλογή "4,10,16" = 07:00, 13:00,
 * 19:00 ώρα Ελλάδας (χειμώνας: 06, 12, 18). Προεκλογικά: "4,7,10,13,16,19" ή "all".
 */
export function cronHourAllowed(envName = "NORAYA_AI_CRON_HOURS_UTC", fallback = "4,10,16") {
  const raw = (process.env[envName] || fallback).trim().toLowerCase();
  if (!raw || raw === "all") return true;
  const hours = raw.split(",").map((h) => Number(h.trim())).filter((n) => Number.isFinite(n));
  const now = new Date();
  const h = now.getUTCHours();
  if (hours.indexOf(h) >= 0) return true;
  // Ανοχή: ένα cron που ξεκίνησε με καθυστέρηση λίγο μετά την αλλαγή ώρας.
  return now.getUTCMinutes() < 20 && hours.indexOf((h + 23) % 24) >= 0;
}

// ------------------------------------------------------------
// Καταγραφή τρεξιμάτων των crons της ατζέντας (πίνακας noraya_cron_runs)
// ------------------------------------------------------------

const STALE_HOURS = 6;

/** Ώρες από το τελευταίο τρέξιμο που έκανε πραγματική δουλειά. null = ποτέ / άγνωστο. */
export async function hoursSinceLastWork(route: string): Promise<number | null> {
  try {
    const { data, error } = await pilotDb()
      .from("noraya_cron_runs")
      .select("started_at")
      .eq("route", route)
      .eq("did_work", true)
      .order("started_at", { ascending: false })
      .limit(1);
    if (error || !Array.isArray(data) || !data.length) return null;
    return (Date.now() - new Date(String((data[0] as any).started_at)).getTime()) / 36e5;
  } catch {
    return null;
  }
}

/**
 * Να τρέξει τώρα ένα ακριβό cron; Ναι στις ώρες λειτουργίας (NORAYA_AI_CRON_HOURS_UTC)
 * ή αν έχουν περάσει ≥6 ώρες από το τελευταίο πραγματικό τρέξιμο — ώστε η ατζέντα να
 * μη μένει ποτέ πίσω αν χαθεί ένα προγραμματισμένο τρέξιμο.
 */
export async function aiCronDue(route: string): Promise<boolean> {
  if (cronHourAllowed()) return true;
  // Αν το τελευταίο τρέξιμο άφησε δουλειά στη μέση (π.χ. θεματικές που δεν πρόλαβε),
  // το επόμενο ωριαίο τη συνεχίζει — το ημερήσιο όριο κόστους ισχύει κανονικά.
  if (await lastRunLeftWork(route)) return true;
  const h = await hoursSinceLastWork(route);
  return h === null || h >= STALE_HOURS;
}

async function lastRunLeftWork(route: string): Promise<boolean> {
  try {
    const { data, error } = await pilotDb()
      .from("noraya_cron_runs")
      .select("did_work, detail")
      .eq("route", route)
      .eq("did_work", true)
      .order("started_at", { ascending: false })
      .limit(1);
    if (error || !Array.isArray(data) || !data.length) return false;
    const d = (data[0] as any).detail || {};
    if (d.remaining_event) return true;
    if (!d.remaining_topic) return false;
    // Θεματική που ξαναγίνεται «διαθέσιμη» κάθε 30' δεν μετράει ως εκκρεμότητα: συνεχίζουμε μόνο
    // αν η επόμενη θεματική δεν έχει αναλυθεί τις τελευταίες 6 ώρες (δηλ. ο κύκλος δεν τελείωσε).
    const { data: t } = await pilotDb()
      .from("agenda_topics")
      .select("events_detected_at")
      .is("organization_id", null)
      .eq("name", String(d.remaining_topic))
      .limit(1);
    const at = Array.isArray(t) && t[0] ? (t[0] as any).events_detected_at : null;
    return !at || Date.now() - new Date(String(at)).getTime() >= STALE_HOURS * 36e5;
  } catch {
    return false;
  }
}

/** Γράφει ένα τρέξιμο. Ποτέ δεν σπάει τη ροή. */
export async function logCronRun(
  route: string,
  startedAt: Date,
  httpStatus: number,
  body: any
) {
  try {
    const outcome =
      String(body?.mode || body?.skipped || body?.source || (httpStatus >= 400 ? "error" : "ok")).slice(0, 60);
    // «Δουλειά» = παρήγαγε κάτι: γεγονότα, αναλύσεις ή νέο brief. Ένα τρέξιμο χωρίς
    // αποτέλεσμα δεν μετράει, ώστε να μην καθυστερεί την επόμενη προσπάθεια.
    const produced =
      Number(body?.topics_processed ?? body?.analyzed ?? NaN) > 0 ||
      body?.stored === true ||
      body?.mode === "ran";
    const idle = ["off_hours", "budget_reached", "cache_unchanged"].includes(outcome) || !produced;
    await pilotDb().from("noraya_cron_runs").insert({
      route,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      http_status: httpStatus,
      outcome,
      did_work: httpStatus < 400 && !idle,
      detail:
        body && typeof body === "object"
          ? JSON.stringify(body).length <= 20000
            ? body
            : { truncated: true, keys: Object.keys(body) }
          : null,
    });
  } catch {
    /* η καταγραφή δεν πρέπει ποτέ να χαλάσει το cron */
  }
}

/** Τυλίγει ένα handler: καταγράφει status + σώμα απάντησης. */
export async function withCronLog(route: string, run: () => Promise<Response>): Promise<Response> {
  const startedAt = new Date();
  const res = await run();
  let body: any = null;
  try {
    body = await res.clone().json();
  } catch {
    body = null;
  }
  await logCronRun(route, startedAt, res.status, body);
  return res;
}

/** Πόσα $ έχουν ξοδέψει σήμερα τα crons. null αν η βάση δεν απαντά. */
export type CronBucket = "cron" | "classify";

export async function cronSpentToday(bucket: CronBucket = "cron"): Promise<number | null> {
  try {
    const { data, error } = await pilotDb().rpc("noraya_category_cost", {
      p_day: athensDay(),
      p_source: "cron",
      p_category: bucket
    });
    if (error) {
      if (!isMissingTable(error) && String(error.code) !== "PGRST202") console.error("[pilot] cron spend read failed", error);
      return null;
    }
    return Number(data || 0);
  } catch {
    return null;
  }
}

/**
 * true = επιτρέπεται νέα κλήση AI από cron σήμερα. Όταν εξαντληθεί το όριο,
 * οι ειδήσεις συνεχίζουν να μαζεύονται· η ανάλυση συνεχίζει αύριο.
 */
export async function cronBudgetOk(route: string, bucket: CronBucket = "cron") {
  const spent = await cronSpentToday(bucket);
  if (spent === null) return true; // fail-open
  const budget = bucket === "classify" ? pilotConfig.classifyDailyUsd() : pilotConfig.cronDailyUsd();
  if (spent < budget) return true;
  const day = athensDay();
  const envName = bucket === "classify" ? "NORAYA_CLASSIFY_DAILY_USD" : "NORAYA_CRON_DAILY_USD";
  await sendAlert(
    `cron-budget:${bucket}:${day}`,
    `Noraya: ${bucket === "classify" ? "η ταξινόμηση ειδήσεων" : "τα crons ανάλυσης"} έφτασαν το ημερήσιο όριο ($${budget})`,
    `<p>Σήμερα (${day}) η αυτόματη ανάλυση ειδήσεων ξόδεψε $${spent.toFixed(2)} και σταμάτησε στο όριο των $${budget}.</p>
     <p>Οι ειδήσεις συνεχίζουν να μαζεύονται. Η ανάλυσή τους θα συνεχιστεί αύριο.</p>
     <p>Αν η μέρα είναι σημαντική, ανέβασε τη μεταβλητή <b>${envName}</b> στο Vercel.</p>
     <p>Πρώτο route που σταμάτησε: ${route}</p>`
  );
  return false;
}

export async function recordCronCall(route: string, model: string, usage: TokenUsage, bucket: CronBucket = "cron") {
  await recordUsageRow({
    scope: "cron",
    userId: null,
    source: "cron",
    category: bucket,
    route,
    model,
    usage,
    counted: false
  });
}

// ------------------------------------------------------------
// Λάθη & ειδοποιήσεις
// ------------------------------------------------------------

export async function logPilotError(route: string, error: unknown, detail?: any, userId?: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const { error: dbErr } = await pilotDb().from("noraya_error_log").insert({
      route,
      message: message.slice(0, 2000),
      detail: detail ?? null,
      user_id: userId ?? null
    });
    if (dbErr && !isMissingTable(dbErr)) console.error("[pilot] error log insert failed", dbErr);
  } catch {
    /* ποτέ δεν πετάμε από εδώ */
  }
  await sendAlert(
    `error:${route}:${athensDay()}:${new Date().getUTCHours()}`,
    `Noraya: λάθος στο ${route}`,
    `<p><b>${route}</b></p><pre style="white-space:pre-wrap">${escapeHtml(message.slice(0, 1500))}</pre>
     <p>Όλα τα λάθη: σελίδα /admin/pilot</p>`
  );
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Email στον ιδιοκτήτη. Το key εξασφαλίζει ότι το ίδιο μήνυμα φεύγει μία φορά
 * (π.χ. "cron-budget:2026-10-01"). Χωρίς RESEND_API_KEY ή email, δεν κάνει τίποτα.
 */
export async function sendAlert(key: string, subject: string, html: string) {
  const to = pilotConfig.alertEmail();
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !apiKey) return;
  try {
    const { error } = await pilotDb().from("noraya_alerts_sent").insert({ key });
    if (error) {
      // unique violation = έχει ήδη σταλεί
      if (String(error.code) === "23505") return;
      if (!isMissingTable(error)) console.error("[pilot] alert dedupe failed", error);
      return;
    }
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.NORAYA_ALERT_FROM || "Noraya <onboarding@resend.dev>",
        to: [to],
        subject,
        html
      })
    });
  } catch (e) {
    console.error("[pilot] sendAlert", e);
  }
}
