import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ============================================================
// NORAYA — Voices Keywords ("Πρόσωπα & λέξεις-κλειδιά")
//
// ΣΤΑΘΕΡΗ λίστα κόμμα → αρχηγός. ΤΟ AI ΔΕΝ ΜΑΝΤΕΥΕΙ ΠΟΤΕ.
// Ενημερώνεται ΜΟΝΟ εδώ, χειροκίνητα, όταν αλλάζει κάτι πολιτικά.
//
// Επιστρέφει:
//   own        = chips του ΔΙΚΟΥ σου κόμματος (κόμμα + αρχηγός)
//   opponents  = λίστα αντιπάλων (κόμμα + αρχηγός) για το συρτάρι
//
// Κάθε chip έχει:
//   label  = τι βλέπει ο χρήστης στο κουμπί (π.χ. "Τσίπρας")
//   query  = τι ψάχνουμε στα social (π.χ. "Τσίπρας Ελληνική Αριστερή Συμπαράταξη")
//            — το query είναι ξεκάθαρο ώστε να ΜΗ μπερδεύεται (π.χ. ΕΛΑΣ≠Αστυνομία).
// ============================================================

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

type Party = {
  key: string;          // party_key όπως στο προφίλ (πεζά, χωρίς κενά)
  party: string;        // πλήρες όνομα κόμματος
  partySearch: string;  // πώς ψάχνεται το ΚΟΜΜΑ στα social (ξεκάθαρο, χωρίς μπέρδεμα)
  leader: string;       // πλήρες όνομα αρχηγού
  leaderSearch: string; // πώς ψάχνεται ο ΑΡΧΗΓΟΣ στα social
};

// ── Η ΕΠΙΣΗΜΗ ΛΙΣΤΑ (ενημερώνεται μόνο εδώ) ──────────────────
// ΠΡΟΣΟΧΗ: ΕΛΑΣ = το κόμμα του Τσίπρα (Ελληνική Αριστερή Συμπαράταξη),
// ΟΧΙ η Ελληνική Αστυνομία. Γι' αυτό το partySearch λέει ρητά το πλήρες όνομα.
const PARTIES: Party[] = [
  { key: "elas",      party: "ΕΛΑΣ",              partySearch: "Ελληνική Αριστερή Συμπαράταξη Τσίπρας", leader: "Αλέξης Τσίπρας",       leaderSearch: "Αλέξης Τσίπρας" },
  { key: "nd",        party: "Νέα Δημοκρατία",    partySearch: "Νέα Δημοκρατία",                          leader: "Κυριάκος Μητσοτάκης", leaderSearch: "Κυριάκος Μητσοτάκης" },
  { key: "pasok",     party: "ΠΑΣΟΚ",             partySearch: "ΠΑΣΟΚ",                                    leader: "Νίκος Ανδρουλάκης",   leaderSearch: "Νίκος Ανδρουλάκης" },
  { key: "syriza",    party: "ΣΥΡΙΖΑ",            partySearch: "ΣΥΡΙΖΑ",                                   leader: "Σωκράτης Φάμελλος",   leaderSearch: "Σωκράτης Φάμελλος" },
  { key: "dpk",       party: "Δημοκράτες – Προοδευτικό Κέντρο", partySearch: "Δημοκράτες Προοδευτικό Κέντρο Κασσελάκης", leader: "Στέφανος Κασσελάκης", leaderSearch: "Στέφανος Κασσελάκης" },
  { key: "kke",       party: "ΚΚΕ",              partySearch: "ΚΚΕ",                                      leader: "Δημήτρης Κουτσούμπας", leaderSearch: "Δημήτρης Κουτσούμπας" },
  { key: "elliniki_lysi", party: "Ελληνική Λύση", partySearch: "Ελληνική Λύση",                           leader: "Κυριάκος Βελόπουλος", leaderSearch: "Κυριάκος Βελόπουλος" },
  { key: "niki",      party: "Νίκη",             partySearch: "Νίκη κόμμα Νατσιός",                       leader: "Δημήτρης Νατσιός",    leaderSearch: "Δημήτρης Νατσιός" },
  { key: "plefsi",    party: "Πλεύση Ελευθερίας", partySearch: "Πλεύση Ελευθερίας",                       leader: "Ζωή Κωνσταντοπούλου",  leaderSearch: "Ζωή Κωνσταντοπούλου" },
  { key: "nea_aristera", party: "Νέα Αριστερά",  partySearch: "Νέα Αριστερά",                             leader: "Γαβριήλ Σακελλαρίδης", leaderSearch: "Γαβριήλ Σακελλαρίδης" },
  { key: "mera25",    party: "ΜέΡΑ25",           partySearch: "ΜέΡΑ25 Βαρουφάκης",                        leader: "Γιάνης Βαρουφάκης",   leaderSearch: "Γιάνης Βαρουφάκης" },
  { key: "foni_logikis", party: "Φωνή Λογικής",  partySearch: "Φωνή Λογικής Λατινοπούλου",                leader: "Αφροδίτη Λατινοπούλου", leaderSearch: "Αφροδίτη Λατινοπούλου" },
];

// Συνώνυμα/εναλλακτικά κλειδιά για να ταιριάζει το party_key του προφίλ.
const ALIASES: Record<string, string> = {
  elas: "elas", ela: "elas", tsipras: "elas",
  nd: "nd", neadimokratia: "nd", "nea_dimokratia": "nd",
  pasok: "pasok",
  syriza: "syriza",
  dpk: "dpk", kasselakis: "dpk", dimokrates: "dpk",
  kke: "kke",
  elliniki_lysi: "elliniki_lysi", elliniki_lush: "elliniki_lysi",
  niki: "niki",
  plefsi: "plefsi", plefsi_eleftherias: "plefsi",
  nea_aristera: "nea_aristera",
  mera25: "mera25",
  foni_logikis: "foni_logikis",
};

function resolveKey(raw: string): string {
  const k = String(raw || "").toLowerCase().replace(/\s+/g, "_");
  return ALIASES[k] || k;
}

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (token !== process.env.CRON_SECRET && token !== "dev") {
      return json({ error: "Unauthorized" }, 401);
    }

    const rawParty = url.searchParams.get("party") || "elas";
    const myKey = resolveKey(rawParty);

    const me = PARTIES.find((p) => p.key === myKey) || PARTIES[0];
    const opponents = PARTIES.filter((p) => p.key !== me.key);

    // Chips του δικού σου κόμματος: κόμμα + αρχηγός
    const own = [
      { label: me.party,  query: me.partySearch },
      { label: me.leader, query: me.leaderSearch },
    ];

    // Αντίπαλοι: για κάθε κόμμα, κόμμα + αρχηγός
    const opp = opponents.flatMap((p) => [
      { label: p.party,  query: p.partySearch,  group: p.party },
      { label: p.leader, query: p.leaderSearch, group: p.party },
    ]);

    return json({ ok: true, party_key: me.key, party_name: me.party, own, opponents: opp });
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
