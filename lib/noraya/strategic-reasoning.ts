export type UserPoliticalProfile = {
  org_name?: string | null;
  org_type?: string | null;
  role_type?: string | null;
  party_key?: string | null;
  selected_party_profile_id?: string | null;
  party_profile_snapshot?: unknown;
  profile_source?: string | null;
  profile_review_status?: string | null;
  themes?: unknown;
  issues?: unknown;
  events?: unknown;
  stakeholders?: unknown;
  mission?: string | null;
  red_lines?: string | null;
  tone?: string | null;
};

export function buildNorayaStrategicSystemPrompt() {
  return `
Είσαι ο Noraya, AI Political Strategy Advisor.

Δεν είσαι απλό news dashboard.
Δεν είσαι data analyst που δείχνει raw metrics.
Δεν είσαι γενικό chatbot.

Είσαι πολιτικός σύμβουλος στρατηγικής.

Η αποστολή σου είναι να μετατρέπεις την τρέχουσα πολιτική ατζέντα σε:
- πολιτική διάγνωση,
- σενάρια,
- στρατηγική γραμμή,
- μηνύματα,
- πλάνο δράσης,
- βάση τεκμηρίωσης.

ΣΚΕΦΤΕΣΑΙ ΠΑΝΤΑ ΜΕ ΑΥΤΗ ΤΗΝ ΑΛΥΣΙΔΑ:

Agenda → Framing → Priming → Audience → Persuasion → Scenarios → Mobilization → Recommendation

Δηλαδή απαντάς:
1. Τι ανεβαίνει;
2. Πώς πλαισιώνεται;
3. Με ποιο κριτήριο θα κριθεί ο πολιτικός / οργανισμός;
4. Ποιο κοινό αφορά;
5. Τι μήνυμα και τι τόνος ταιριάζει;
6. Ποια σενάρια υπάρχουν;
7. Τι πρέπει να γίνει πρακτικά;
8. Τι πρέπει να αποφευχθεί;

ΚΑΝΟΝΕΣ:
- Μη δείχνεις raw metrics στον τελικό χρήστη ως κύριο προϊόν.
- Μην αναφέρεις τεχνικούς όρους όπως agenda_score, documentation_level, JSON, fallback ή model errors.
- Μη γράφεις σαν dashboard.
- Μη γράφεις σαν ακαδημαϊκή εργασία.
- Μη λες γενικόλογα.
- Μη βγάζεις ψευδή βεβαιότητα.
- Κάθε απάντηση πρέπει να καταλήγει σε καθαρή σύσταση.
- Πρώτα δίνεις απόφαση, μετά εξήγηση, μετά τεκμηρίωση.
- Αν η τεκμηρίωση είναι περιορισμένη, το λες καθαρά.
- Δεν κάνεις προπαγάνδα, παραπληροφόρηση ή κατασκευή γεγονότων.
- Δεν εφευρίσκεις δημοσκοπικά ποσοστά.
- Δεν ισχυρίζεσαι ότι γνωρίζεις πραγματική πρόθεση ψηφοφόρων χωρίς δεδομένα.
- Προσαρμόζεις τη σύσταση στο προφίλ του χρήστη, στο κόμμα, στις κόκκινες γραμμές και στον τόνο του.

ΓΛΩΣΣΑ:
- Ελληνικά.
- Καθαρή, δυνατή, ανθρώπινη γλώσσα.
- Σαν έμπειρος πολιτικός σύμβουλος.
- Όχι database language.
- Όχι φλυαρία.
- Όχι υπερβολική τεχνικότητα.
`;
}

export function buildNorayaStrategicJsonInstruction() {
  return `
Πρέπει να επιστρέψεις ΜΟΝΟ έγκυρο JSON.
Χωρίς markdown.
Χωρίς επεξήγηση έξω από το JSON.

Η δομή πρέπει να είναι ακριβώς:

{
  "model": "v1",
  "issue": {
    "topic": string,
    "plain_title": string,
    "agenda_status": string,
    "urgency": "immediate" | "today" | "watch" | "low",
    "media_signal": string,
    "article_signal": string,
    "locality_signal": string,
    "public_attention_signal": string,
    "dominant_frame": string,
    "priming_risk": string,
    "affected_audiences": string[],
    "political_risk": string,
    "opportunity": string,
    "documentation_level": "initial" | "medium" | "strong"
  },
  "daily_brief": {
    "headline": string,
    "what_is_happening": string,
    "why_it_matters_now": string,
    "immediate_recommendation": string,
    "avoid_today": string
  },
  "strategic_diagnosis": {
    "agenda_reading": string,
    "framing_diagnosis": string,
    "priming_risk": string,
    "audience_reading": string,
    "persuasion_reading": string,
    "strategic_opportunity": string,
    "strategic_risk": string,
    "recommended_posture": "institutional" | "human" | "technocratic" | "values_based" | "assertive" | "defensive" | "silent_watch" | "agenda_shift",
    "recommended_posture_explanation": string
  },
  "scenarios": [
    {
      "name": string,
      "move": string,
      "likely_gain": string,
      "likely_risk": string,
      "audience_effect": string,
      "opponent_response": string,
      "media_response": string,
      "recommendation": "prefer" | "acceptable" | "avoid"
    }
  ],
  "message_package": {
    "central_line": string,
    "institutional_version": string,
    "human_version": string,
    "sharp_version": string,
    "social_post": string,
    "answer_if_attacked": string,
    "words_to_use": string[],
    "words_to_avoid": string[]
  },
  "action_plan": {
    "now": string[],
    "next_24h": string[],
    "next_48h": string[],
    "this_week": string[],
    "owner_suggestion": string
  },
  "monitoring_plan": {
    "watch_topics": string[],
    "watch_actors": string[],
    "watch_media": string[],
    "escalation_triggers": string[]
  },
  "evidence": {
    "basis": string,
    "data_points": string[],
    "uncertainty": string,
    "documentation_level": "initial" | "medium" | "strong"
  }
}
`;
}

export function createFallbackStrategicBrief(params: {
  profile: UserPoliticalProfile | null;
  topic: string;
  processingStatus?: string;
}) {
  const topic = params.topic || "Τρέχουσα πολιτική ατζέντα";

  return {
    model: "v1",
    profile: params.profile,
    issue: {
      topic,
      plain_title: topic,
      agenda_status:
        "Υπάρχει σήμα στην τρέχουσα ατζέντα, αλλά χρειάζεται προσεκτική ανάγνωση πριν γίνει πλήρης στρατηγική κίνηση.",
      urgency: "watch",
      media_signal:
        "Το σήμα βασίζεται στα διαθέσιμα πρόσφατα άρθρα και στις διαθέσιμες πηγές.",
      article_signal:
        "Δεν υπάρχει ακόμη πλήρης διαφοροποίηση μεταξύ πρωτογενούς κάλυψης και αναπαραγωγών.",
      locality_signal:
        "Η τοπική διάσταση δεν έχει αποτιμηθεί πλήρως στο fallback brief.",
      public_attention_signal: "Δεν υπάρχει ακόμη πλήρες public attention signal.",
      dominant_frame: "Το dominant framing χρειάζεται περαιτέρω ανάλυση.",
      priming_risk:
        "Το θέμα μπορεί να επηρεάσει το κριτήριο με το οποίο θα αξιολογηθεί ο οργανισμός, αλλά η ένταση δεν είναι ακόμη ασφαλής.",
      affected_audiences: [
        "Βάση οργανισμού",
        "Μετριοπαθές κοινό",
        "Πολιτικά ενεργό κοινό",
      ],
      political_risk:
        "Το βασικό ρίσκο είναι βιαστική τοποθέτηση χωρίς επαρκή τεκμηρίωση.",
      opportunity:
        "Υπάρχει ευκαιρία για σοβαρή, θεσμική και προετοιμασμένη στάση.",
      documentation_level: "initial",
    },
    daily_brief: {
      headline: `Το θέμα «${topic}» χρειάζεται παρακολούθηση πριν γίνει κεντρική πολιτική κίνηση.`,
      what_is_happening:
        "Ο Noraya βλέπει σήμα στην τρέχουσα ατζέντα, αλλά δεν υπάρχει ακόμη πλήρης στρατηγική βεβαιότητα.",
      why_it_matters_now:
        "Αν το θέμα αποκτήσει ένταση, μπορεί να επηρεάσει τη δημόσια αξιολόγηση του οργανισμού.",
      immediate_recommendation:
        "Κρατήστε προετοιμασμένη γραμμή, χωρίς βιαστική κλιμάκωση.",
      avoid_today:
        "Αποφύγετε απόλυτη δημόσια θέση, προσωπική επίθεση ή υπερβολική βεβαιότητα.",
    },
    strategic_diagnosis: {
      agenda_reading:
        "Το θέμα βρίσκεται σε κατάσταση παρακολούθησης και χρειάζεται καλύτερη τεκμηρίωση.",
      framing_diagnosis:
        "Το framing δεν είναι ακόμη αρκετά καθαρό για πλήρη επικοινωνιακή κλιμάκωση.",
      priming_risk:
        "Μπορεί να γίνει κριτήριο αξιολόγησης αξιοπιστίας ή επάρκειας, ανάλογα με την εξέλιξη.",
      audience_reading:
        "Η βάση θα περιμένει καθαρή γραμμή, ενώ οι μετριοπαθείς θα αξιολογήσουν κυρίως τόνο και σοβαρότητα.",
      persuasion_reading:
        "Προτιμάται θεσμικός και προσεκτικός τόνος μέχρι να ισχυροποιηθεί το σήμα.",
      strategic_opportunity:
        "Να εμφανιστεί ο οργανισμός σοβαρός και προετοιμασμένος.",
      strategic_risk:
        "Να φανεί ότι αντιδρά μηχανικά ή εργαλειοποιεί το θέμα.",
      recommended_posture: "institutional",
      recommended_posture_explanation:
        "Η θεσμική στάση μειώνει το ρίσκο και αφήνει χώρο για μελλοντική κλιμάκωση.",
    },
    scenarios: [
      {
        name: "Θεσμική προετοιμασία",
        move: "Κρατάμε έτοιμη σύντομη, σοβαρή γραμμή χωρίς άμεση επίθεση.",
        likely_gain: "Αξιοπιστία και χαμηλό ρίσκο.",
        likely_risk: "Μικρότερη ορατότητα.",
        audience_effect: "Καλή επίδραση σε μετριοπαθή και θεσμικά κοινά.",
        opponent_response:
          "Δύσκολο να παρουσιαστεί ως υπερβολική ή ανεύθυνη στάση.",
        media_response:
          "Πιθανή ουδέτερη ή συγκρατημένα θετική ανάγνωση.",
        recommendation: "prefer",
      },
      {
        name: "Επιθετική απάντηση",
        move: "Ανεβάζουμε τον τόνο και χρεώνουμε ευθύνη.",
        likely_gain: "Μεγαλύτερη ορατότητα και συσπείρωση βάσης.",
        likely_risk: "Μπορεί να φανεί βιαστικό ή εργαλειακό.",
        audience_effect:
          "Πιθανή θετική επίδραση στη βάση, αλλά ρίσκο στους μετριοπαθείς.",
        opponent_response:
          "Ο αντίπαλος μπορεί να κατηγορήσει τον οργανισμό για εκμετάλλευση.",
        media_response: "Πιθανή πόλωση του framing.",
        recommendation: "avoid",
      },
      {
        name: "Σιωπή και παρακολούθηση",
        move: "Δεν τοποθετούμαστε ακόμη δημόσια.",
        likely_gain: "Αποφυγή άμεσης έκθεσης.",
        likely_risk: "Απώλεια πρωτοβουλίας αν το θέμα ανέβει.",
        audience_effect:
          "Η βάση μπορεί να θεωρήσει ότι δεν υπάρχει καθαρή γραμμή.",
        opponent_response:
          "Άλλοι παίκτες μπορεί να καταλάβουν τον χώρο.",
        media_response:
          "Η απουσία θέσης δεν θα καταγραφεί άμεσα, εκτός αν το θέμα κλιμακωθεί.",
        recommendation: "acceptable",
      },
    ],
    message_package: {
      central_line:
        "Χρειάζεται σοβαρότητα, τεκμηρίωση και θεσμική καθαρότητα πριν από κάθε δημόσια κίνηση.",
      institutional_version:
        "Το θέμα πρέπει να αντιμετωπιστεί με θεσμική ευθύνη, καθαρά στοιχεία και σεβασμό στους πολίτες.",
      human_version:
        "Οι πολίτες χρειάζονται καθαρές απαντήσεις, όχι θόρυβο και βιαστικές αντιδράσεις.",
      sharp_version:
        "Η σοβαρότητα δεν είναι αδυναμία. Είναι προϋπόθεση για αξιόπιστη πολιτική στάση.",
      social_post:
        "Σε κρίσιμα θέματα χρειάζονται καθαρές απαντήσεις, τεκμηρίωση και θεσμική ευθύνη. Όχι θόρυβος, όχι βιασύνη.",
      answer_if_attacked:
        "Η στάση μας είναι καθαρή: πρώτα στοιχεία, μετά θέση, πάντα με θεσμική σοβαρότητα.",
      words_to_use: [
        "τεκμηρίωση",
        "θεσμική ευθύνη",
        "καθαρές απαντήσεις",
        "σοβαρότητα",
      ],
      words_to_avoid: [
        "βεβαιότητα χωρίς στοιχεία",
        "προσωπική επίθεση",
        "υπερβολή",
        "επικοινωνιακός θόρυβος",
      ],
    },
    action_plan: {
      now: [
        "Κρατήστε έτοιμη σύντομη θεσμική γραμμή.",
        "Παρακολουθήστε αν το θέμα εμφανίζεται σε νέα μέσα ή από πολιτικούς αντιπάλους.",
      ],
      next_24h: [
        "Ελέγξτε αν το framing γίνεται πιο επιθετικό ή πιο θεσμικό.",
        "Προετοιμάστε μία δημόσια δήλωση χαμηλού ρίσκου.",
      ],
      next_48h: [
        "Αποφασίστε αν χρειάζεται κλιμάκωση ή παραμονή σε στάση παρακολούθησης.",
      ],
      this_week: [
        "Συνδέστε το θέμα με ευρύτερη στρατηγική γραμμή μόνο αν αποκτήσει σταθερή ένταση.",
      ],
      owner_suggestion:
        "Η πρώτη τοποθέτηση πρέπει να γίνει από θεσμικό πρόσωπο ή εκπρόσωπο με ήπιο και αξιόπιστο ύφος.",
    },
    monitoring_plan: {
      watch_topics: [topic],
      watch_actors: [
        "Κυβέρνηση",
        "Αντιπολίτευση",
        "βασικά πολιτικά πρόσωπα",
      ],
      watch_media: [
        "εθνικά μέσα",
        "τοπικά μέσα όπου υπάρχει συνάφεια",
        "opinion leaders",
      ],
      escalation_triggers: [
        "Αύξηση κάλυψης από μέσα υψηλής βαρύτητας.",
        "Παρέμβαση βασικού πολιτικού αντιπάλου.",
        "Μετατόπιση framing σε ευθύνη ή λογοδοσία.",
      ],
    },
    evidence: {
      basis:
        "Fallback strategic brief βασισμένο στα διαθέσιμα agenda signals και στο προφίλ χρήστη.",
      data_points: [
        params.processingStatus ||
          "Το σύστημα χρειάζεται περισσότερη τεκμηρίωση για πλήρη στρατηγική ανάλυση.",
      ],
      uncertainty:
        "Η ανάλυση είναι αρχική και πρέπει να επιβεβαιωθεί με περισσότερα ταξινομημένα άρθρα, framing και media weight.",
      documentation_level: "initial",
    },
  };
}
