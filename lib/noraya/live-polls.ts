// NORAYA — ΑΝΑΓΝΩΣΤΗΣ ΖΩΝΤΑΝΩΝ ΔΗΜΟΣΚΟΠΗΣΕΩΝ (dimoskopiseis.gr)
// Διαβάζει τα ΠΡΑΓΜΑΤΙΚΑ δεδομένα από τα γραφήματα Flourish (όχι banner, όχι εικόνα).
// Πηγή: homepage → flourish ids → _Flourish_data (καθαρό JSON).

export type PollRow = {
  pollster: string; // π.χ. "ALCO"
  date: string; // π.χ. "13/06/26"
  parties: Record<string, number | null>; // { "ΝΔ": 23.3, "ΕΛΑΣ": 14.2, ... }
};

export type PollsSnapshot = {
  ok: boolean;
  source: string;
  prothesi_update?: string; // ημερομηνία ενημέρωσης γραφήματος πρόθεσης
  latest?: PollRow; // η πιο πρόσφατη μέτρηση (κατά ημερομηνία)
  average?: PollRow; // ο Μέσος Όρος (MO)
  recent?: PollRow[]; // οι τελευταίες μετρήσεις (έως 6)
  parties_order?: string[];
  fetched_at: string;
  note?: string;
};

const UA = { "User-Agent": "Mozilla/5.0 (compatible; NorayaBot/1.0)" };
const HOME = "https://dimoskopiseis.gr/";

// απλό in-memory cache (ανά serverless instance)
let _cache: { at: number; data: PollsSnapshot } | null = null;
const TTL_MS = 1000 * 60 * 30; // 30 λεπτά

// Μετατρέπει "dd/mm/yy ..." -> συγκρίσιμο αριθμό (yyyymmdd) για ταξινόμηση.
function dateKey(raw: string): number {
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{2})/);
  if (!m) return 0;
  const [, dd, mm, yy] = m;
  return parseInt(`20${yy}${mm}${dd}`, 10);
}

// Από "25/05/26 - Realpolls" -> { date:"25/05/26", pollster:"Realpolls" }
function splitLabel(label: string): { date: string; pollster: string } {
  const dateMatch = label.match(/\d{2}\/\d{2}\/\d{2}/);
  const date = dateMatch ? dateMatch[0] : "";
  let pollster = label.replace(/\d{2}\/\d{2}\/\d{2}/, "").replace(/^[\s\-–·]+/, "").trim();
  if (!pollster) pollster = label.trim();
  return { date, pollster };
}

// Βρίσκει το block "VAR = {...}" και επιστρέφει το JSON string (ισορροπώντας {}).
function extractAssignment(text: string, varName: string): string | null {
  const start = text.indexOf(varName);
  if (start < 0) return null;
  const brace = text.indexOf("{", start);
  if (brace < 0) return null;
  let depth = 0;
  for (let i = brace; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(brace, i + 1);
    }
  }
  return null;
}

function parseFlourish(embedText: string): { columns: string[]; rows: PollRow[] } | null {
  const colJson = extractAssignment(embedText, "_Flourish_data_column_names");
  const dataJson = extractAssignment(embedText, "_Flourish_data =");
  if (!colJson || !dataJson) return null;

  let columns: string[] = [];
  try {
    const cn = JSON.parse(colJson);
    columns = cn?.data?.value || [];
  } catch {
    return null;
  }

  let rows: PollRow[] = [];
  try {
    const d = JSON.parse(dataJson);
    const arr = d?.data || [];
    rows = arr.map((r: any) => {
      const { date, pollster } = splitLabel(String(r.label ?? r.filter ?? ""));
      const parties: Record<string, number | null> = {};
      const vals: any[] = Array.isArray(r.value) ? r.value : [];
      columns.forEach((c, i) => {
        const v = vals[i];
        parties[c] = typeof v === "number" ? v : v == null ? null : Number(v);
      });
      return { pollster, date, parties };
    });
  } catch {
    return null;
  }

  return { columns, rows };
}

export async function fetchPollsSnapshot(force = false): Promise<PollsSnapshot> {
  const now = Date.now();
  if (!force && _cache && now - _cache.at < TTL_MS) return _cache.data;

  const snap: PollsSnapshot = { ok: false, source: HOME, fetched_at: new Date().toISOString() };

  try {
    const home = await fetch(HOME, { headers: UA, cache: "no-store" });
    const html = await home.text();

    // id του γραφήματος ΠΡΟΘΕΣΗΣ = το 1ο flourish id στη σελίδα
    const ids = Array.from(
      new Set((html.match(/flo\.uri\.sh\/visualisation\/(\d+)/g) || []).map((s) => s.split("/").pop() as string))
    );
    if (!ids.length) {
      snap.note = "Δεν βρέθηκαν γραφήματα Flourish στη σελίδα.";
      _cache = { at: now, data: snap };
      return snap;
    }

    // ημερομηνία ενημέρωσης πρόθεσης (από τον τίτλο)
    const upd = html.match(/ΠΡΟΘΕΣΗΣ ΨΗΦΟΥ[^|]*\|\s*Ενημέρωση\s*(\d{2}\/\d{2}\/\d{2})/);
    if (upd) snap.prothesi_update = upd[1];

    const fid = ids[0];
    const emb = await fetch(`https://flo.uri.sh/visualisation/${fid}/embed`, { headers: UA, cache: "no-store" });
    const embText = await emb.text();
    const parsed = parseFlourish(embText);
    if (!parsed) {
      snap.note = "Βρέθηκε γράφημα αλλά δεν διαβάστηκαν τα δεδομένα του.";
      _cache = { at: now, data: snap };
      return snap;
    }

    snap.parties_order = parsed.columns;

    // Ξεχώρισε τον Μέσο Όρο (MO) από τις μετρήσεις
    const avg = parsed.rows.find((r) => /^(MO|ΜΟ)\b/i.test(r.pollster) || r.pollster === "MO");
    const polls = parsed.rows.filter((r) => r !== avg && /\d{2}\/\d{2}\/\d{2}/.test(r.date));

    // Ταξινόμησε κατά ημερομηνία (νεότερη πρώτη)
    polls.sort((a, b) => dateKey(b.date) - dateKey(a.date));

    snap.ok = true;
    snap.average = avg;
    snap.latest = polls[0];
    snap.recent = polls.slice(0, 6);

    _cache = { at: now, data: snap };
    return snap;
  } catch (e: any) {
    snap.note = "Σφάλμα ανάγνωσης: " + (e?.message || String(e));
    return snap;
  }
}

// Συμπαγές κείμενο για το prompt του συμβούλου (έτοιμο, με πηγή+ημερομηνία).
export function formatPollsForPrompt(snap: PollsSnapshot): string {
  if (!snap.ok || !snap.latest) {
    return "ΖΩΝΤΑΝΕΣ ΔΗΜΟΣΚΟΠΗΣΕΙΣ: δεν διαθέσιμες αυτή τη στιγμή.";
  }
  const fmtRow = (r: PollRow) =>
    snap.parties_order!
      .map((p) => `${p} ${r.parties[p] ?? "—"}`)
      .join(" · ");

  const lines: string[] = [];
  lines.push(`ΖΩΝΤΑΝΕΣ ΔΗΜΟΣΚΟΠΗΣΕΙΣ (πηγή: dimoskopiseis.gr, ενημ. ${snap.prothesi_update || snap.latest.date}):`);
  lines.push(`• Τελευταία μέτρηση — ${snap.latest.pollster} (${snap.latest.date}): ${fmtRow(snap.latest)}`);
  if (snap.average) lines.push(`• Μέσος όρος (MO): ${fmtRow(snap.average)}`);
  if (snap.recent && snap.recent.length > 1) {
    lines.push("• Πρόσφατες:");
    for (const r of snap.recent.slice(0, 5)) lines.push(`   - ${r.pollster} ${r.date}: ΝΔ ${r.parties["ΝΔ"] ?? "—"}, ΕΛΑΣ ${r.parties["ΕΛΑΣ"] ?? "—"}, ΠΑΣΟΚ ${r.parties["ΠΑΣΟΚ"] ?? "—"}, ΕΛΠΙΔΑ ${r.parties["ΕΛΠΙΔΑ"] ?? "—"}`);
  }
  lines.push("Πρόθεση ψήφου (όχι εκτίμηση). Είναι ΤΡΕΧΟΥΣΑ εικόνα — χρησιμοποίησέ τη με αναφορά εταιρείας+ημερομηνίας.");
  return lines.join("\n");
}
