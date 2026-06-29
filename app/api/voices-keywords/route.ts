import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA — Voices Keywords ("Πρόσωπα & λέξεις-κλειδιά")
// Διαβάζει το προφίλ κόμματος + τον αρχηγό και βγάζει, ΜΕΣΩ AI,
// 6-8 κρίσιμα ΠΡΟΣΩΠΑ/ΟΡΟΥΣ που πρέπει να παρακολουθεί ο σύμβουλος
// στα social — όπως θα σκεφτόταν ένας κορυφαίος σύμβουλος επικοινωνίας.
// Cache 24 ώρες ανά κόμμα (analysis_cache).
// ============================================================

const MODEL = "claude-sonnet-4-6";

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

function cacheKey(partyKey: string) {
  return "voices_keywords_v1__" + partyKey;
}

async function readCache(supabase: ReturnType<typeof svc>, key: string): Promise<string[] | null> {
  try {
    const { data } = await supabase
      .from("analysis_cache")
      .select("result, updated_at")
      .is("situation_id", null)
      .eq("analysis_kind", key)
      .limit(1);
    if (!Array.isArray(data) || !data[0]) return null;
    const result = (data[0] as any).result;
    const updatedAt = new Date((data[0] as any).updated_at || 0).getTime();
    if (Date.now() - updatedAt > 24 * 60 * 60 * 1000) return null;
    const arr = result?.body;
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch {
    return null;
  }
}

async function writeCache(supabase: ReturnType<typeof svc>, key: string, body: string[]) {
  const row = {
    situation_id: null,
    organization_id: null,
    analysis_kind: key,
    input_hash: "v1",
    model_used: MODEL,
    result: { body, generated_at: new Date().toISOString() },
  };
  try {
    const { data: upd } = await supabase
      .from("analysis_cache")
      .update(row)
      .is("situation_id", null)
      .eq("analysis_kind", key)
      .select("analysis_kind");
    if (!upd || upd.length === 0) {
      await supabase.from("analysis_cache").insert(row);
    }
  } catch {
    /* best-effort */
  }
}

async function loadPartyProfile(supabase: ReturnType<typeof svc>, partyKey: string) {
  if (!partyKey) return null;
  try {
    const { data } = await supabase
      .from("political_party_profiles")
      .select("*")
      .eq("party_key", partyKey)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

function parseAiJson(raw: string): any | null {
  let s = (raw || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = (str: string) => {
    try { return JSON.parse(str); } catch { return null; }
  };
  let parsed = tryParse(s);
  if (!parsed) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) parsed = tryParse(m[0]);
  }
  return parsed || null;
}

async function callClaude(prompt: string): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error("Claude API error " + resp.status);
  const data = await resp.json();
  return (data?.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
}

function cleanList(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const t = String(item || "").trim();
    if (t.length < 2 || t.length > 40) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (token !== process.env.CRON_SECRET && token !== "dev") {
      return json({ error: "Unauthorized" }, 401);
    }

    const partyKey = (url.searchParams.get("party") || "elas").trim();
    const force = url.searchParams.get("force") === "1";

    const supabase = svc();
    const key = cacheKey(partyKey);

    if (!force) {
      const cached = await readCache(supabase, key);
      if (cached) return json({ ok: true, keywords: cached, source: "cache" });
    }

    const profile = await loadPartyProfile(supabase, partyKey);
    const partyName = String((profile as any)?.party_name || partyKey);

    const prompt = `Είσαι κορυφαίος σύμβουλος πολιτικής επικοινωνίας. Δουλεύεις για το κόμμα "${partyName}".

ΠΡΟΦΙΛ ΚΟΜΜΑΤΟΣ (JSON):
${JSON.stringify(profile || { party_key: partyKey, party_name: partyName })}

ΣΗΜΑΝΤΙΚΟ ΙΣΤΟΡΙΚΟ (για να μην μπερδευτείς):
- Ο Αλέξης Τσίπρας ηγείται ΤΩΡΑ του νέου κόμματος ΕΛΑΣ (Ελληνική Αριστερή Συμπαράταξη), που ίδρυσε τον Μάιο 2026.
- Ήταν αρχηγός ΣΥΡΙΖΑ έως το 2023. ΣΥΡΙΖΑ ≠ ΕΛΑΣ. Μην τα μπερδέψεις.

ΣΤΟΧΟΣ:
Δώσε 6-8 ΛΕΞΕΙΣ-ΚΛΕΙΔΙΑ / ΠΡΟΣΩΠΑ που ο σύμβουλος ΑΥΤΟΥ του κόμματος πρέπει να παρακολουθεί στα social media (Facebook/Twitter), για να ακούει τι λέει ο κόσμος για το κόμμα και τα πρόσωπά του.
- Συμπερίλαβε: το όνομα του κόμματος, τον αρχηγό, βασικά στελέχη/πρόσωπα, και 1-2 κρίσιμους πολιτικούς αντιπάλους ή όρους που το αφορούν άμεσα.
- Πραγματικά, αναζητήσιμα ονόματα/όροι — ΟΧΙ γενικές έννοιες όπως "οικονομία" ή "δικαιοσύνη".
- Σύντομα (1-3 λέξεις το καθένα), στα ελληνικά.

ΕΠΕΣΤΡΕΨΕ ΜΟΝΟ έγκυρο JSON, χωρίς markdown/fences:
{ "keywords": ["...", "...", "..."] }`;

    let keywords: string[] = [];
    try {
      const raw = await callClaude(prompt);
      const parsed = parseAiJson(raw);
      keywords = cleanList(parsed?.keywords);
    } catch {
      keywords = [];
    }

    // Δίχτυ ασφαλείας: αν το AI αποτύχει, δώσε τουλάχιστον το όνομα του κόμματος.
    if (keywords.length === 0) {
      keywords = cleanList([partyName]);
    }

    if (keywords.length) {
      await writeCache(supabase, key, keywords);
    }

    return json({ ok: true, keywords, source: "generated" });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
