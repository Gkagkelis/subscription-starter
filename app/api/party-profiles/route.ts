import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PartyProfile = Record<string, any>;

function sanitizeProfile(profile: PartyProfile): PartyProfile {
  if (
    profile.party_key === "el_as" ||
    profile.party_key === "elas" ||
    String(profile.party_name || "").includes("Σώματα Ασφαλείας")
  ) {
    return {
      ...profile,
      party_key: "elas",
      party_name: "ΕΛΑΣ",
      short_name: "ΕΛΑΣ",
      profile_type: "political_party",
      ideological_family: "κεντροαριστερά / προοδευτικός χώρος",
      strategic_positioning:
        "Πολιτικό κόμμα / project του Αλέξη Τσίπρα με στόχο την προοδευτική ανασύνθεση, την κυβερνητική εναλλακτική και την κοινωνική πλειοψηφία.",
      default_tone: "προοδευτικός, θεσμικός, κυβερνητικός, ενωτικός",
      core_themes: [
        "Προοδευτική διακυβέρνηση",
        "Θεσμοί",
        "Κοινωνικό κράτος",
        "Οικονομία",
        "Ακρίβεια",
        "Δικαιοσύνη",
        "Δημοκρατική ανασύνθεση",
      ],
      core_audiences: [
        "προοδευτικοί ψηφοφόροι",
        "κεντροαριστερά",
        "απογοητευμένοι ψηφοφόροι",
        "μεσαία τάξη",
        "νέοι",
        "εργαζόμενοι",
      ],
      known_positions: [
        "Προοδευτική ανασύνθεση",
        "Κοινωνική δικαιοσύνη",
        "Θεσμική αξιοπιστία",
        "Πολιτική αλλαγή",
        "Κυβερνητική εναλλακτική",
      ],
      red_lines: [
        "Εικόνα επιστροφής στο παρελθόν",
        "Προσωποκεντρικότητα χωρίς νέο σχέδιο",
        "Ασάφεια κυβερνησιμότητας",
        "Καταγγελτική γλώσσα χωρίς πρόταση",
      ],
      opportunity_frame:
        "Να εμφανίζεται ως σοβαρή προοδευτική κυβερνητική εναλλακτική.",
      risk_frame:
        "Κίνδυνος να παρουσιαστεί ως ανακύκλωση παλιού πολιτικού κύκλου.",
      competitor_frame:
        "Οι αντίπαλοι θα το πλαισιώνουν ως επιστροφή Τσίπρα ή διάσπαση του προοδευτικού χώρου.",
      advisor_instructions:
        "Να δίνεις συμβουλές με θεσμικό, κυβερνητικό και ενωτικό τόνο. Κάθε μήνυμα πρέπει να δείχνει αλλαγή, αξιοπιστία και συγκεκριμένο σχέδιο.",
    };
  }

  if (profile.party_key === "elpida_dimokratia") {
    return {
      ...profile,
      profile_type: "political_party",
      ideological_family: "δημοκρατικό / κοινωνικό / αντισυστημικό κέντρο",
      strategic_positioning:
        "Πολιτικό κόμμα της Μαρίας Καρυστιανού με έμφαση στη δικαιοσύνη, τη λογοδοσία, τη δημοκρατία, τη διαφάνεια και την αξιοπρέπεια των πολιτών.",
      default_tone: "ηθικός, δημοκρατικός, ανθρώπινος, θεσμικός",
      core_themes: [
        "Δικαιοσύνη",
        "Θεσμική λογοδοσία",
        "Δημοκρατία",
        "Διαφάνεια",
        "Αξιοπρέπεια",
        "Αλήθεια",
        "Κοινωνική εμπιστοσύνη",
      ],
      core_audiences: [
        "πολίτες απογοητευμένοι από το πολιτικό σύστημα",
        "οικογένειες",
        "νέοι",
        "κοινωνία πολιτών",
        "ψηφοφόροι διαμαρτυρίας",
      ],
      known_positions: [
        "Απόδοση δικαιοσύνης",
        "Θεσμική λογοδοσία",
        "Αντιμετώπιση συγκάλυψης",
        "Διαφάνεια",
        "Αποκατάσταση εμπιστοσύνης στους θεσμούς",
      ],
      red_lines: [
        "Να εμφανιστεί ως μονοθεματικό",
        "Να θεωρηθεί ασαφές κυβερνητικά",
        "Να χαθεί η ηθική αξιοπιστία μέσα σε κομματική τακτική",
      ],
      opportunity_frame:
        "Να χτίζει αφήγημα δικαιοσύνης, αξιοπρέπειας και δημοκρατικής αναγέννησης.",
      risk_frame:
        "Κίνδυνος να θεωρηθεί μονοθεματικό αν δεν αναπτύξει πλήρες πολιτικό πλαίσιο.",
      competitor_frame:
        "Οι αντίπαλοι θα το παρουσιάζουν ως συναισθηματικό, μονοθεματικό ή ασαφές πολιτικά.",
      advisor_instructions:
        "Να δίνεις συμβουλές με ανθρώπινη, ηθική και θεσμική γλώσσα. Να συνδέεις δικαιοσύνη, αλήθεια και πρακτική πολιτική λύση.",
    };
  }

  return profile;
}

function dedupeProfiles(profiles: PartyProfile[]): PartyProfile[] {
  const map = new Map<string, PartyProfile>();

  for (const profile of profiles.map(sanitizeProfile)) {
    map.set(profile.party_key, profile);
  }

  return Array.from(map.values()).sort((a, b) =>
    String(a.party_name || "").localeCompare(String(b.party_name || ""), "el")
  );
}

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing Supabase server environment variables." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const activeResult = await supabase
    .from("political_party_profiles")
    .select("*")
    .eq("is_active", true)
    .order("party_name", { ascending: true });

  if (activeResult.error) {
    return json(
      {
        error: activeResult.error.message,
        source: "political_party_profiles_active",
      },
      500
    );
  }

  if ((activeResult.data || []).length > 0) {
    const profiles = dedupeProfiles(activeResult.data || []);

    return json({
      count: profiles.length,
      source: "active_profiles",
      fallback_used: false,
      sanitized: true,
      profiles,
    });
  }

  const fallbackResult = await supabase
    .from("political_party_profiles")
    .select("*")
    .order("party_name", { ascending: true });

  if (fallbackResult.error) {
    return json(
      {
        error: fallbackResult.error.message,
        source: "political_party_profiles_all",
      },
      500
    );
  }

  const profiles = dedupeProfiles(fallbackResult.data || []);

  return json({
    count: profiles.length,
    source: "all_profiles",
    fallback_used: true,
    sanitized: true,
    profiles,
  });
}
