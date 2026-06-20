import "server-only";
import fs from "node:fs";
import path from "node:path";

export const RESEARCH_CONTEXT_VERSION = "research_context_v1_public_opinion_leaders_vote";

type CsvRow = Record<string, string>;

export type AgendaResearchContextInput = {
  microAgendaId?: string | null;
  microAgenda?: string | null;
  parentTopic?: string | null;
  eventTitle?: string | null;
  eventText?: string | null;
  partyKey?: string | null;
};

export type AgendaResearchContext = {
  version: string;
  source_files: string[];
  micro_agenda_id: string;
  micro_agenda: string;
  parent_topic: string;
  research_frame: string;
  social_basis: string;
  audience_reading: string;
  strategic_meaning: string;
  party_relevance: string;
  leader_trait_hint: string;
  recommended_language: string[];
  evidence_lines: string[];
  evidence_points: Array<{
    source: "public_opinion" | "leader_traits" | "vote_intention";
    label: string;
    group?: string;
    value?: number;
    period?: string;
    confidence?: string;
  }>;
};

type ResearchProfile = {
  frame: string;
  socialBasis: string;
  audienceReading: string;
  strategicMeaning: string;
  partyRelevance: string;
  leaderTraitHint: string;
  recommendedLanguage: string[];
  publicOpinionMetrics: string[];
  audienceGroups: Array<{ group_type: string; group: string; label: string }>;
  leaderTraitNames: string[];
};

const DATA_DIR = path.join(process.cwd(), "public", "noraya-data");
const PUBLIC_OPINION = "public_opinion.csv";
const LEADER_TRAITS = "leader_traits.csv";
const VOTE_INTENTION = "vote_intention.csv";

let publicOpinionCache: CsvRow[] | null = null;
let leaderTraitsCache: CsvRow[] | null = null;
let voteIntentionCache: CsvRow[] | null = null;

function readCsvFile(fileName: string): CsvRow[] {
  try {
    const fullPath = path.join(DATA_DIR, fileName);
    const raw = fs.readFileSync(fullPath, "utf8");
    return parseCsv(raw);
  } catch {
    return [];
  }
}

function publicOpinionRows(): CsvRow[] {
  if (!publicOpinionCache) publicOpinionCache = readCsvFile(PUBLIC_OPINION);
  return publicOpinionCache;
}

function leaderTraitRows(): CsvRow[] {
  if (!leaderTraitsCache) leaderTraitsCache = readCsvFile(LEADER_TRAITS);
  return leaderTraitsCache;
}

function voteIntentionRows(): CsvRow[] {
  if (!voteIntentionCache) voteIntentionCache = readCsvFile(VOTE_INTENTION);
  return voteIntentionCache;
}

function parseCsv(raw: string): CsvRow[] {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  out.push(current);
  return out;
}

function normalize(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .trim();
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function period(row: CsvRow): string {
  const year = row.survey_year || "";
  const quarter = row.survey_quarter || "";
  return [year, quarter].filter(Boolean).join(" ").trim();
}

function rowTime(row: CsvRow): number {
  const year = Number(row.survey_year || 0);
  const quarter = String(row.survey_quarter || "").match(/Q(\d)/i)?.[1];
  return year * 10 + Number(quarter || 0);
}

function latestRows(rows: CsvRow[]): CsvRow[] {
  const max = rows.reduce((best, row) => Math.max(best, rowTime(row)), 0);
  return rows.filter((row) => rowTime(row) === max);
}

function latestPublicMetric(metric: string, groups: ResearchProfile["audienceGroups"]): CsvRow | null {
  const rows = publicOpinionRows().filter((row) => row.metric === metric && row.data_status !== "excluded");
  if (!rows.length) return null;

  for (const group of groups) {
    const matched = latestRows(rows.filter((row) => row.group_type === group.group_type && row.group === group.group));
    if (matched[0]) return matched[0];
  }

  return latestRows(rows.filter((row) => row.group_type === "all" && row.group === "all"))[0] || latestRows(rows)[0] || null;
}

function latestLeaderTrait(traitNames: string[]): CsvRow | null {
  const normalizedNames = traitNames.map(normalize);
  const rows = leaderTraitRows().filter((row) => {
    const metricName = normalize(row.metric_name);
    return normalizedNames.some((trait) => metricName.includes(trait));
  });
  if (!rows.length) return null;
  return latestRows(rows)[0] || null;
}

function latestVoteSignal(): CsvRow | null {
  const rows = voteIntentionRows().filter((row) => row.group_type === "all" && row.group === "all" && row.include_in_time_trend !== "False");
  return latestRows(rows)[0] || null;
}

function valueBand(value: number | null): string {
  if (value === null) return "υπό ανάγνωση";
  if (value >= 68) return "ισχυρό";
  if (value >= 52) return "σχηματισμένο";
  if (value >= 35) return "πιεσμένο";
  return "χαμηλής εμπιστοσύνης";
}

function pointFromPublic(row: CsvRow | null, label: string, groupLabel?: string): AgendaResearchContext["evidence_points"][number] | null {
  if (!row) return null;
  const value = toNumber(row.value_weighted_0_100);
  return {
    source: "public_opinion",
    label,
    group: groupLabel || row.group,
    value: value ?? undefined,
    period: period(row),
    confidence: row.sample_confidence || undefined,
  };
}

function pointFromLeader(row: CsvRow | null): AgendaResearchContext["evidence_points"][number] | null {
  if (!row) return null;
  const value = toNumber(row.share_weighted_valid);
  return {
    source: "leader_traits",
    label: row.metric_name || "Εικόνα ηγεσίας",
    group: row.group || undefined,
    value: value ?? undefined,
    period: period(row),
    confidence: row.sample_confidence || undefined,
  };
}

function pointFromVote(row: CsvRow | null): AgendaResearchContext["evidence_points"][number] | null {
  if (!row) return null;
  const value = toNumber(row.vote_share_weighted_valid);
  return {
    source: "vote_intention",
    label: `Πρόθεση ψήφου: ${row.party || "κόμμα"}`,
    group: row.group || undefined,
    value: value ?? undefined,
    period: period(row),
    confidence: row.sample_confidence || undefined,
  };
}

function evidenceLine(point: AgendaResearchContext["evidence_points"][number]): string {
  const parts = [point.label];
  if (point.group) parts.push(point.group);
  if (typeof point.value === "number") parts.push(`${Math.round(point.value)} / 100`);
  if (point.period) parts.push(point.period);
  return parts.join(" · ");
}

const DEFAULT_GROUPS: ResearchProfile["audienceGroups"] = [
  { group_type: "all", group: "all", label: "σύνολο κοινού" },
];

const YOUNG_GROUPS: ResearchProfile["audienceGroups"] = [
  { group_type: "age_group", group: "18-24", label: "18–24" },
  { group_type: "age_group", group: "25-39", label: "25–39" },
  { group_type: "all", group: "all", label: "σύνολο κοινού" },
];

const WORK_GROUPS: ResearchProfile["audienceGroups"] = [
  { group_type: "occupation_group", group: "manual_worker", label: "χειρωνακτική εργασία" },
  { group_type: "occupation_group", group: "white_collar", label: "μισθωτοί γραφείου" },
  { group_type: "age_group", group: "25-39", label: "25–39" },
  { group_type: "all", group: "all", label: "σύνολο κοινού" },
];

function profileFor(input: AgendaResearchContextInput): ResearchProfile {
  const id = normalize(input.microAgendaId);
  const text = normalize(`${input.microAgenda} ${input.parentTopic} ${input.eventTitle} ${input.eventText}`);

  if (id.includes("housing") || text.includes("στεγαση") || text.includes("ενοικ")) {
    return {
      frame: "στέγη, προοπτική ζωής και εμπιστοσύνη στις λύσεις",
      socialBasis: "Το γεγονός πατά σε κοινωνική πίεση γύρω από την πρόσβαση σε σπίτι, το διαθέσιμο εισόδημα και την προοπτική της νέας γενιάς.",
      audienceReading: "Η ανάγνωση χρειάζεται να μιλήσει σε νέους, νέα ζευγάρια, οικογένειες και νοικοκυριά που μετρούν το κόστος της καθημερινότητας.",
      strategicMeaning: "Η πολιτική αξία βρίσκεται στη σύνδεση της στέγης με ασφάλεια, αξιοπρέπεια και εφαρμόσιμη λύση, όχι σε μια αφηρημένη συζήτηση αγοράς.",
      partyRelevance: "Κερδίζει όποιος δείξει πρακτική απάντηση, κριτήρια δικαιοσύνης και πραγματική εφαρμογή.",
      leaderTraitHint: "Ο τόνος αρχηγού πρέπει να δείχνει εγγύτητα στους πολίτες και ικανότητα εφαρμογής.",
      recommendedLanguage: ["στέγη", "προοπτική", "νέα γενιά", "οικογένεια", "πρακτική λύση", "δίκαια κριτήρια"],
      publicOpinionMetrics: ["expectation_personal_job", "expectation_national_economy", "trust_national_parliament"],
      audienceGroups: YOUNG_GROUPS,
      leaderTraitNames: ["Κοντά στους πολίτες", "Σταθερότητα χώρας"],
    };
  }

  if (id.includes("wages") || id.includes("unemployment") || text.includes("μισθ") || text.includes("εργασ")) {
    return {
      frame: "εργασία, εισόδημα και αξιοπρέπεια",
      socialBasis: "Το γεγονός πατά στην αγωνία για το αν η εργασία αρκεί για αξιοπρεπή ζωή και σταθερή προοπτική.",
      audienceReading: "Η ανάγνωση χρειάζεται να μιλήσει σε εργαζόμενους, νέους και νοικοκυριά που συνδέουν μισθό, κόστος ζωής και καθημερινή αντοχή.",
      strategicMeaning: "Η πολιτική αξία βρίσκεται στη σύνδεση της ανάπτυξης με το πραγματικό εισόδημα και τη δίκαιη ανταμοιβή της εργασίας.",
      partyRelevance: "Κερδίζει όποιος μεταφέρει τη συζήτηση από τον κλάδο στο ερώτημα ποιος ωφελείται από την οικονομία.",
      leaderTraitHint: "Ο τόνος αρχηγού πρέπει να δείχνει κοινωνική εγγύτητα και καθαρή αίσθηση δικαιοσύνης.",
      recommendedLanguage: ["εργασία", "αξιοπρέπεια", "πραγματικό εισόδημα", "κόστος ζωής", "δίκαιη ανάπτυξη"],
      publicOpinionMetrics: ["expectation_personal_job", "expectation_national_economy", "trust_national_parliament"],
      audienceGroups: WORK_GROUPS,
      leaderTraitNames: ["Κοντά στους πολίτες"],
    };
  }

  if (id.includes("tax") || id.includes("debt") || text.includes("φορο") || text.includes("οφειλ")) {
    return {
      frame: "δίκαιοι κανόνες, κράτος και ανταπόδοση",
      socialBasis: "Το γεγονός πατά στη σχέση πολίτη και κράτους: σταθεροί κανόνες, ίση μεταχείριση και αίσθηση ανταπόδοσης.",
      audienceReading: "Η ανάγνωση χρειάζεται να μιλήσει σε επαγγελματίες, μισθωτούς και νοικοκυριά που μετρούν βάρη, υποχρεώσεις και προβλεψιμότητα.",
      strategicMeaning: "Η πολιτική αξία βρίσκεται στο να συνδεθούν τα δημόσια έσοδα με απλότητα, δικαιοσύνη και εμπιστοσύνη.",
      partyRelevance: "Κερδίζει όποιος εξηγήσει ποιος πληρώνει, με ποιους κανόνες και τι παίρνει πίσω.",
      leaderTraitHint: "Ο τόνος αρχηγού πρέπει να δείχνει σοβαρότητα, σταθερότητα και δίκαιη διαχείριση.",
      recommendedLanguage: ["δίκαιοι κανόνες", "απλότητα", "ανταπόδοση", "σταθερότητα", "ίση μεταχείριση"],
      publicOpinionMetrics: ["trust_national_parliament", "expectation_national_economy", "democracy_satisfaction_country"],
      audienceGroups: DEFAULT_GROUPS,
      leaderTraitNames: ["Σταθερότητα χώρας"],
    };
  }

  if (id.includes("health") || id.includes("nhs") || text.includes("υγεια") || text.includes("νοσοκομ")) {
    return {
      frame: "ασφάλεια, φροντίδα και θεσμική επάρκεια",
      socialBasis: "Το γεγονός πατά στην ανάγκη των πολιτών να αισθάνονται ότι το κράτος μπορεί να προστατεύσει σε κρίσιμες στιγμές.",
      audienceReading: "Η ανάγνωση χρειάζεται να μιλήσει σε οικογένειες, ηλικιωμένους, εργαζόμενους και περιφέρειες που κρίνουν το κράτος από την καθημερινή πρόσβαση σε φροντίδα.",
      strategicMeaning: "Η πολιτική αξία βρίσκεται στη σύνδεση της υγείας με αξιοπιστία υπηρεσιών, ανθρώπινη ασφάλεια και πρακτική βελτίωση.",
      partyRelevance: "Κερδίζει όποιος δείξει επάρκεια, σχέδιο και σεβασμό στον πολίτη που χρειάζεται το σύστημα.",
      leaderTraitHint: "Ο τόνος αρχηγού πρέπει να είναι προστατευτικός, πρακτικός και θεσμικά ώριμος.",
      recommendedLanguage: ["φροντίδα", "πρόσβαση", "ασφάλεια", "επαρκές κράτος", "ανθρώπινη αξιοπρέπεια"],
      publicOpinionMetrics: ["trust_national_parliament", "democracy_satisfaction_country"],
      audienceGroups: DEFAULT_GROUPS,
      leaderTraitNames: ["Κοντά στους πολίτες", "Σταθερότητα χώρας"],
    };
  }

  if (id.includes("education") || id.includes("universit") || text.includes("παιδεια") || text.includes("φοιτη")) {
    return {
      frame: "προοπτική, δεξιότητες και κοινωνική κινητικότητα",
      socialBasis: "Το γεγονός πατά στην αγωνία για το αν η εκπαίδευση ανοίγει πραγματικές διαδρομές ζωής.",
      audienceReading: "Η ανάγνωση χρειάζεται να μιλήσει σε νέους, γονείς, εκπαιδευτικούς και οικογένειες που βλέπουν την παιδεία ως επένδυση προοπτικής.",
      strategicMeaning: "Η πολιτική αξία βρίσκεται στη σύνδεση γνώσης, εργασίας και αξιοκρατικής διαδρομής.",
      partyRelevance: "Κερδίζει όποιος δείξει εφαρμόσιμο σχέδιο για σχολείο, πανεπιστήμιο και σύνδεση με την αγορά χωρίς να χαθεί η κοινωνική δικαιοσύνη.",
      leaderTraitHint: "Ο τόνος αρχηγού πρέπει να δείχνει σχέδιο, εμπιστοσύνη στη νέα γενιά και σοβαρή μεταρρύθμιση.",
      recommendedLanguage: ["προοπτική", "δεξιότητες", "νέα γενιά", "κοινωνική κινητικότητα", "αξιοκρατία"],
      publicOpinionMetrics: ["expectation_personal_job", "trust_national_parliament", "democracy_satisfaction_country"],
      audienceGroups: YOUNG_GROUPS,
      leaderTraitNames: ["Σταθερότητα χώρας", "Κοντά στους πολίτες"],
    };
  }

  if (id.includes("wildfire") || id.includes("disaster") || text.includes("πυρο") || text.includes("καταστροφ")) {
    return {
      frame: "πρόληψη, προστασία και κράτος που λειτουργεί πριν από την κρίση",
      socialBasis: "Το γεγονός πατά στην ανάγκη για έγκαιρη προστασία και καθαρούς κανόνες πριν εμφανιστεί η κρίση.",
      audienceReading: "Η ανάγνωση χρειάζεται να μιλήσει σε κατοίκους, δήμους, περιφέρειες και ιδιοκτήτες που ζητούν σαφή ευθύνη και πρακτική στήριξη.",
      strategicMeaning: "Η πολιτική αξία βρίσκεται στη μεταφορά της συζήτησης από την τιμωρία στην πρόληψη και από την ανακοίνωση στην εφαρμογή.",
      partyRelevance: "Κερδίζει όποιος δείξει οργάνωση, έλεγχο και πρακτική προστασία χωρίς πανικό.",
      leaderTraitHint: "Ο τόνος αρχηγού πρέπει να δείχνει ετοιμότητα, σοβαρότητα και προστασία της καθημερινότητας.",
      recommendedLanguage: ["πρόληψη", "προστασία", "σαφείς κανόνες", "δήμοι", "εφαρμογή", "κρατική ετοιμότητα"],
      publicOpinionMetrics: ["trust_national_parliament", "democracy_satisfaction_country"],
      audienceGroups: DEFAULT_GROUPS,
      leaderTraitNames: ["Σταθερότητα χώρας"],
    };
  }

  if (id.includes("defense") || id.includes("foreign") || id.includes("nato") || text.includes("αμυνα") || text.includes("ελληνοτουρκ")) {
    return {
      frame: "ασφάλεια, σταθερότητα και διεθνής αξιοπιστία",
      socialBasis: "Το γεγονός πατά στην ανάγκη για ασφάλεια και προβλέψιμη εξωτερική στάση σε ένα ασταθές περιβάλλον.",
      audienceReading: "Η ανάγνωση χρειάζεται να μιλήσει σε κοινά που δίνουν βάρος στη σταθερότητα, στην αποτρεπτική ισχύ και στη διεθνή εικόνα της χώρας.",
      strategicMeaning: "Η πολιτική αξία βρίσκεται στη σύνδεση εθνικής ασφάλειας, θεσμικής σοβαρότητας και πρακτικού σχεδίου.",
      partyRelevance: "Κερδίζει όποιος εμφανιστεί αξιόπιστος, προετοιμασμένος και χωρίς επικοινωνιακή υπερβολή.",
      leaderTraitHint: "Ο τόνος αρχηγού πρέπει να δείχνει σταθερότητα χώρας και έλεγχο κατάστασης.",
      recommendedLanguage: ["σταθερότητα", "ασφάλεια", "αξιοπιστία", "προετοιμασία", "σοβαρότητα"],
      publicOpinionMetrics: ["trust_european_union", "left_right_placement", "trust_national_parliament"],
      audienceGroups: DEFAULT_GROUPS,
      leaderTraitNames: ["Σταθερότητα χώρας"],
    };
  }

  if (id.includes("elections") || text.includes("εκλογ") || text.includes("κομμα")) {
    return {
      frame: "κομματικό σύστημα, ρευστότητα και αξιοπιστία ηγεσίας",
      socialBasis: "Το γεγονός πατά στη σχέση εμπιστοσύνης ανάμεσα στους πολίτες, τα κόμματα και την εικόνα ηγεσίας.",
      audienceReading: "Η ανάγνωση χρειάζεται να μιλήσει σε κοινά που μετακινούνται ανάμεσα σε αξιοπιστία, εγγύτητα και αίσθηση κυβερνησιμότητας.",
      strategicMeaning: "Η πολιτική αξία βρίσκεται στο πώς το γεγονός μεταβάλλει την αίσθηση δυναμικής, σοβαρότητας και δυνατότητας εκπροσώπησης.",
      partyRelevance: "Κερδίζει όποιος δώσει καθαρή εικόνα ηγεσίας και λόγο που συνδέεται με πραγματικά κοινωνικά θέματα.",
      leaderTraitHint: "Ο τόνος αρχηγού πρέπει να πατήσει στο ισχυρότερο διαθέσιμο χαρακτηριστικό εικόνας: εγγύτητα, σταθερότητα ή αξιοπιστία.",
      recommendedLanguage: ["αξιοπιστία", "εκπροσώπηση", "σταθερότητα", "κοντά στους πολίτες", "κυβερνησιμότητα"],
      publicOpinionMetrics: ["left_right_placement", "trust_national_parliament", "democracy_satisfaction_country"],
      audienceGroups: DEFAULT_GROUPS,
      leaderTraitNames: ["Κοντά στους πολίτες", "Σταθερότητα χώρας"],
    };
  }

  return {
    frame: "κοινωνική πίεση, θεσμική εμπιστοσύνη και πολιτική χρησιμότητα",
    socialBasis: "Το γεγονός αποκτά αξία όταν συνδέεται με πραγματική κοινωνική πίεση και με το πώς οι πολίτες κρίνουν την αποτελεσματικότητα των θεσμών.",
    audienceReading: "Η ανάγνωση χρειάζεται να εντοπίσει ποιο κοινό επηρεάζεται άμεσα και ποιο πολιτικό ερώτημα ανοίγει.",
    strategicMeaning: "Η πολιτική αξία βρίσκεται στη σύνδεση του γεγονότος με μια καθαρή ατζέντα και μια εφαρμόσιμη γραμμή στάσης.",
    partyRelevance: "Κερδίζει όποιος δώσει συγκεκριμένη ερμηνεία, πρακτική κατεύθυνση και σοβαρό τόνο.",
    leaderTraitHint: "Ο τόνος αρχηγού πρέπει να συνδυάζει εγγύτητα στους πολίτες και αίσθηση ελέγχου.",
    recommendedLanguage: ["σοβαρότητα", "πρακτική λύση", "ευθύνη", "εφαρμογή", "εμπιστοσύνη"],
    publicOpinionMetrics: ["trust_national_parliament", "democracy_satisfaction_country", "expectation_national_economy"],
    audienceGroups: DEFAULT_GROUPS,
    leaderTraitNames: ["Κοντά στους πολίτες", "Σταθερότητα χώρας"],
  };
}

export function buildAgendaResearchContext(input: AgendaResearchContextInput): AgendaResearchContext {
  const profile = profileFor(input);
  const microAgendaId = String(input.microAgendaId || "unknown_micro_agenda");
  const microAgenda = String(input.microAgenda || "Μικρο-ατζέντα");
  const parentTopic = String(input.parentTopic || "Πολιτική ατζέντα");

  const publicPoints = profile.publicOpinionMetrics
    .map((metric) => latestPublicMetric(metric, profile.audienceGroups))
    .map((row, index) => pointFromPublic(row, publicMetricLabel(profile.publicOpinionMetrics[index]), audienceLabel(row, profile)))
    .filter((point): point is AgendaResearchContext["evidence_points"][number] => Boolean(point))
    .slice(0, 4);

  const leaderPoint = pointFromLeader(latestLeaderTrait(profile.leaderTraitNames));
  const votePoint = pointFromVote(latestVoteSignal());
  const evidencePoints = [...publicPoints, leaderPoint, votePoint].filter((point): point is AgendaResearchContext["evidence_points"][number] => Boolean(point)).slice(0, 6);

  const evidenceLines = evidencePoints.map(evidenceLine);
  const strongestPublicPoint = publicPoints[0];
  const signalBand = valueBand(strongestPublicPoint?.value ?? null);

  return {
    version: RESEARCH_CONTEXT_VERSION,
    source_files: [PUBLIC_OPINION, LEADER_TRAITS, VOTE_INTENTION],
    micro_agenda_id: microAgendaId,
    micro_agenda: microAgenda,
    parent_topic: parentTopic,
    research_frame: profile.frame,
    social_basis: profile.socialBasis,
    audience_reading: `${profile.audienceReading} Το ερευνητικό υπόβαθρο δείχνει ${signalBand} πεδίο κοινωνικής ανάγνωσης για αυτή την ατζέντα.`,
    strategic_meaning: profile.strategicMeaning,
    party_relevance: profile.partyRelevance,
    leader_trait_hint: profile.leaderTraitHint,
    recommended_language: profile.recommendedLanguage,
    evidence_lines: evidenceLines,
    evidence_points: evidencePoints,
  };
}

function publicMetricLabel(metric?: string): string {
  const labels: Record<string, string> = {
    democracy_satisfaction_country: "Ικανοποίηση από τη δημοκρατία στη χώρα",
    democracy_satisfaction_eu: "Ικανοποίηση από τη δημοκρατία στην Ευρώπη",
    expectation_national_economy: "Προσδοκία για την εθνική οικονομία",
    expectation_personal_job: "Προσδοκία για προσωπική εργασία",
    trust_national_parliament: "Εμπιστοσύνη στο εθνικό κοινοβούλιο",
    trust_european_union: "Εμπιστοσύνη στην Ευρωπαϊκή Ένωση",
    left_right_placement: "Αυτοτοποθέτηση στον πολιτικό άξονα",
  };
  return labels[metric || ""] || metric || "Δείκτης κοινής γνώμης";
}

function audienceLabel(row: CsvRow | null, profile: ResearchProfile): string | undefined {
  if (!row) return undefined;
  return profile.audienceGroups.find((group) => group.group_type === row.group_type && group.group === row.group)?.label || row.group;
}
