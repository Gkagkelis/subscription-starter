import { NextRequest, NextResponse } from "next/server";
import { createClient as naAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// NORAYA PS — ΠΡΟΦΙΛ ΠΕΡΙΦΕΡΕΙΑΣ (αυτοματο, cached ΜΙΑ φορα ανα νομο)
// «Βαθια γνωση» καθε εκλογικης περιφερειας: διαχρονικα προβληματα, κλαδοι,
// δημογραφικο, υποδομες, τοπικες ευαισθησιες. Ο βουλευτης ΔΕΝ κανει τιποτα —
// μονο διαλεγει περιφερεια στο onboarding.
//
// ΟΙΚΟΝΟΜΙΑ: το προφιλ φτιαχνεται 1 φορα/περιφερεια (απο τη γνωση του AI για
// πηγες) και αποθηκευεται στο analysis_cache. Ολοι οι επομενοι βουλευτες ιδιας
// περιφερειας το παιρνουν ΔΩΡΕΑΝ. ~59 κλησεις συνολικα, ποτε ξανα.
// ============================================================

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

function svc() {
  return naAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function jsonOut(p: unknown, s = 200) {
  return NextResponse.json(p, { status: s });
}

function parseJsonLoose(raw: string): any | null {
  let s = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(s); } catch {}
  // Αν το JSON κοπηκε (δεν εχει τελικο }), προσπαθησε να «μπαλωσεις» τα ανοιχτα strings/braces
  const firstBrace = s.indexOf("{");
  if (firstBrace >= 0 && s.lastIndexOf("}") < firstBrace) {
    let patch = s.slice(firstBrace);
    // κλεισε τυχον ανοιχτο string
    const quotes = (patch.match(/(?<!\\)"/g) || []).length;
    if (quotes % 2 === 1) patch += '"';
    // κλεισε ανοιχτα arrays/objects
    const openCurly = (patch.match(/{/g) || []).length - (patch.match(/}/g) || []).length;
    const openSq = (patch.match(/\[/g) || []).length - (patch.match(/\]/g) || []).length;
    patch = patch.replace(/,\s*$/, "");
    for (let i = 0; i < openSq; i++) patch += "]";
    for (let i = 0; i < openCurly; i++) patch += "}";
    try { return JSON.parse(patch); } catch {}
  }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    let cand = s.slice(first, last + 1);
    try { return JSON.parse(cand); } catch {}
    try {
      cand = cand
        .replace(/[\u0000-\u001F]+/g, " ")
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");
      return JSON.parse(cand);
    } catch {}
  }
  return null;
}

// ============================================================
// GET/POST ?district=Σέρρες  ή  ?code=serron
//  - Αν υπαρχει cached -> επιστρεφει αμεσα (δωρεαν)
//  - Αλλιως -> το χτιζει (γνωση AI), το κανει cache, επιστρεφει
//  - &force=1 -> ξαναχτιζει (για update)
// ============================================================
async function handle(district: string, force: boolean) {
  const key = `region_profile_v1__${district.trim().toLowerCase().replace(/\s+/g, "_")}`;

  // 1) cache lookup
  if (!force) {
    try {
      const { data: cached } = await svc()
        .from("analysis_cache")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (cached?.value) {
        return jsonOut({ ok: true, cached: true, district, profile: cached.value });
      }
    } catch { /* αγνοειται */ }
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return jsonOut({ ok: false, error: "no_api_key" }, 500);

  // 2) χτισιμο απο τη γνωση του AI (γρηγορο, εντος 60s)
  const system =
    `Εισαι ερευνητικος αναλυτης του Noraya PS. Φτιαχνεις το «Προφιλ Περιφερειας» για Ελληνα ` +
    `βουλευτη/υποψηφιο — μια βαθια, στοχευμενη γνωση του τοπου του ωστε να μιλαει σαν ντοπιος ` +
    `που ξερει καθε γωνια. Βασιζεσαι στη βαθια γνωση σου για τους ελληνικους νομους/περιφερειες.\n\n` +
    `ΚΑΝΟΝΑΣ ΑΞΙΟΠΙΣΤΙΑΣ (χαλαρος αλλα εντιμος): τα νουμερα αρκει να ειναι ΠΕΡΙΠΟΥ σωστα και ` +
    `προσφατα. Οπου εχεις νουμερο, βαλε (περιπου) και συντομη πηγη. Οπου ΔΕΝ ξερεις, μη μαντευεις ` +
    `νουμερο — περιεγραψε ποιοτικα. ΠΟΤΕ εφευρεση γεγονοτων. Ελληνικα.`;

  const user =
    `ΠΕΡΙΦΕΡΕΙΑ: ${district}\n\n` +
    `Απο τη γνωση σου, δωσε ΜΟΝΟ εγκυρο JSON (χωρις σχολια, χωρις fences, ΣΥΝΤΟΜΑ strings μια γραμμη):\n` +
    `{\n` +
    ` "snapshot": "2 προτασεις: τι ειναι αυτος ο τοπος.",\n` +
    ` "economy": ["3-4 κυριοι κλαδοι, μια-δυο λεξεις"],\n` +
    ` "coreProblems": [{"title":"προβλημα 2-4 λεξεις", "detail":"μια συντομη προταση", "severity":"υψηλη|μεση|χαμηλη"}],\n` +
    ` "demographics": "μια προταση: πληθυσμος περιπου + ταση.",\n` +
    ` "sensitivities": ["2-3 τοπικες ευαισθησιες συντομες"],\n` +
    ` "opportunities": ["2-3 ατου συντομα"]\n` +
    `}\n` +
    `coreProblems: ΑΚΡΙΒΩΣ 5 (οικονομια, δημογραφικο, υποδομες, υγεια/παιδεια, τοπικο). ΟΛΑ συντομα.`;

  const payload: any = {
    model: MODEL,
    max_tokens: 1600,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 58000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const t = await response.text().catch(() => "");
      return jsonOut({ ok: false, error: "api " + response.status + " " + t.slice(0, 160) }, 500);
    }

    const data = await response.json();
    const text = (data?.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();

    const parsed = parseJsonLoose(text);
    if (!parsed) return jsonOut({ ok: false, error: "parse", raw: text.slice(0, 300) }, 200);

    const profile = {
      district,
      snapshot: String(parsed.snapshot || ""),
      economy: Array.isArray(parsed.economy) ? parsed.economy.slice(0, 6) : [],
      coreProblems: Array.isArray(parsed.coreProblems) ? parsed.coreProblems.slice(0, 6) : [],
      demographics: String(parsed.demographics || ""),
      sensitivities: Array.isArray(parsed.sensitivities) ? parsed.sensitivities.slice(0, 4) : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 3) : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 8) : [],
      built_at: new Date().toISOString(),
    };

    try {
      await svc().from("analysis_cache").upsert({ key, value: profile }, { onConflict: "key" });
    } catch { /* αγνοειται */ }

    return jsonOut({ ok: true, cached: false, district, profile });
  } catch (err) {
    clearTimeout(timeout);
    return jsonOut({ ok: false, error: String(err) }, 500);
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const district = url.searchParams.get("district") || url.searchParams.get("code") || "";
  const force = url.searchParams.get("force") === "1";
  if (!district) return jsonOut({ ok: false, error: "no_district" }, 400);
  return handle(district, force);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const district = String(body?.district || body?.code || "");
  const force = body?.force === true || body?.force === 1;
  if (!district) return jsonOut({ ok: false, error: "no_district" }, 400);
  return handle(district, force);
}
