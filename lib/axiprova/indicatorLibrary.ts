export type ConfidenceFlag = "grey" | "amber" | "green";

export type Indicator = {
  id: string; // e.g. B1
  name: string;
  pillar_id: string; // e.g. TRANSPARENCY
  weight_points: number; // points (sum total = 100)
  definition: string;
  measures: string[]; // what is measured
  evidence_examples: string[]; // what counts as evidence
  scoring_rubric_0_to_1: {
    score_0: string;
    score_0_5: string;
    score_1: string;
  };
};

export type Pillar = {
  id: string;
  name: string;
  weight_points: number;
  description: string;
  indicators: Indicator[];
};

export type Framework = {
  id: string;
  name: string;
  version: string;
  total_points: 100;
  pillars: Pillar[];
  rules: {
    missing_data_rule: string;
    confidence_flags: Record<ConfidenceFlag, string>;
    ratings: { min: number; max: number; label: string }[];
  };
};

/**
 * Axiprova v0.1 — “Cultural Impact Certified™” (5 pillars)
 * Συνθέτει:
 * - Democracy Index pillars (E&D, Transparency, Access, Participation) ως indicators
 * - + Experience/Engagement pillar για “εμπειρία” (που θες να μετράς)
 *
 * Για v0.1: το library ορίζει τί μετράμε/με ποια τεκμήρια/με τι rubrics.
 * Στο v0.2: θα κάνουμε αυτόματο scoring engine.
 */
export const AXIPROVA_CULTURAL_IMPACT_V01: Framework = {
  id: "axiprova_cultural_impact_v0_1",
  name: "Axiprova Cultural Impact (v0.1)",
  version: "0.1",
  total_points: 100,
  rules: {
    // βασισμένο στη λογική “missing public data => penalty” + αναδιανομή όταν δεν εφαρμόζει :contentReference[oaicite:2]{index=2}
    missing_data_rule:
      "If evidence should exist (publicly or internally) but is missing, mark as missing and treat as low confidence. " +
      "If an indicator is truly not applicable, reallocate its weight within the same pillar (future scoring engine).",
    // confidence flags από το doc :contentReference[oaicite:3]{index=3}
    confidence_flags: {
      green: "Audited / verified with strong evidence",
      amber: "Self-reported / submitted evidence (not fully audited)",
      grey: "Estimated / weak evidence / missing data",
    },
    // ratings 0–100 από το doc :contentReference[oaicite:4]{index=4}
    ratings: [
      { min: 80, max: 100, label: "Leader" },
      { min: 60, max: 79, label: "Progressing" },
      { min: 40, max: 59, label: "Emerging" },
      { min: 0, max: 39, label: "Foundational" },
    ],
  },
  pillars: [
    {
      id: "EXPERIENCE",
      name: "Experience / Engagement",
      weight_points: 25,
      description:
        "How meaningful, engaging, and satisfying the cultural experience is (audience perspective).",
      indicators: [
        {
          id: "E1",
          name: "Audience experience quality",
          pillar_id: "EXPERIENCE",
          weight_points: 10,
          definition: "Perceived quality and meaningfulness of the experience.",
          measures: [
            "Post-event satisfaction (1–7)",
            "Meaningfulness / emotional resonance (1–7)",
            "% who would recommend (NPS-style or simple yes/no)",
          ],
          evidence_examples: [
            "Exit survey summary (anonymized)",
            "Sample questionnaire + results export",
          ],
          scoring_rubric_0_to_1: {
            score_0: "No audience feedback data collected.",
            score_0_5: "Basic feedback collected (small sample or weak instrument).",
            score_1: "Clear survey instrument + adequate sample + results shared internally.",
          },
        },
        {
          id: "E2",
          name: "Depth of engagement",
          pillar_id: "EXPERIENCE",
          weight_points: 8,
          definition: "Signs of active engagement beyond attendance.",
          measures: [
            "Participation in activities (Q&A, workshop, guided tour)",
            "Average dwell time / session completion (if digital)",
            "Qualitative comments showing learning/reflection",
          ],
          evidence_examples: [
            "Attendance + participation counts",
            "Observation notes (structured)",
            "Digital analytics snapshot",
          ],
          scoring_rubric_0_to_1: {
            score_0: "Only attendance; no engagement measures.",
            score_0_5: "Some engagement proxy (e.g., counts) but inconsistent.",
            score_1: "Multiple engagement measures + consistent collection method.",
          },
        },
        {
          id: "E3",
          name: "Return & advocacy intent",
          pillar_id: "EXPERIENCE",
          weight_points: 7,
          definition: "Likelihood of return visits and positive word-of-mouth.",
          measures: ["% likely to return", "% likely to bring a friend", "newsletter/signup conversion (optional)"],
          evidence_examples: ["Survey item results", "Signup analytics (if used)"],
          scoring_rubric_0_to_1: {
            score_0: "No measure of return/advocacy.",
            score_0_5: "One measure collected once.",
            score_1: "Return/advocacy measured consistently + linked to improvements.",
          },
        },
      ],
    },

    {
      id: "ACCESS",
      name: "Access",
      weight_points: 20,
      description: "Affordability + physical/digital access and audience breadth.",
      indicators: [
        // βασισμένο στο Access pillar του doc (C1–C3) :contentReference[oaicite:5]{index=5}
        {
          id: "C1",
          name: "Affordability",
          pillar_id: "ACCESS",
          weight_points: 8,
          definition: "Pricing and concessions that reduce barriers.",
          measures: ["Free days/hours", "Concessions policy", "Ticket price fairness (context-based)"],
          evidence_examples: ["Pricing page", "Concessions policy", "Free entry schedule"],
          scoring_rubric_0_to_1: {
            score_0: "No affordability measures or unclear pricing.",
            score_0_5: "Some measures (e.g., concessions) but limited.",
            score_1: "Clear affordability policy + meaningful free/concession options.",
          },
        },
        {
          id: "C2",
          name: "Accessibility (physical & sensory)",
          pillar_id: "ACCESS",
          weight_points: 6,
          definition: "Accessibility for people with mobility/sensory needs and language access.",
          measures: ["Step-free routes", "Accessible facilities", "Multi-language info", "Assistive services (loops, tours)"],
          evidence_examples: ["Accessibility page", "Venue checklist", "Photos/docs of facilities"],
          scoring_rubric_0_to_1: {
            score_0: "No accessibility information or provisions.",
            score_0_5: "Some provisions but incomplete/unclear.",
            score_1: "Clear accessibility offering + info publicly available.",
          },
        },
        {
          id: "C3",
          name: "Digital reach",
          pillar_id: "ACCESS",
          weight_points: 6,
          definition: "Digital availability that extends reach beyond physical attendance.",
          measures: ["Online content availability", "Captions/archives", "Remote participation options"],
          evidence_examples: ["Links to streams/archives", "Content policy", "Website screenshots"],
          scoring_rubric_0_to_1: {
            score_0: "No digital reach.",
            score_0_5: "Some digital content but limited accessibility (e.g., no captions).",
            score_1: "Consistent digital strategy + accessible formats (captions/archives).",
          },
        },
      ],
    },

    {
      id: "INCLUSIVITY",
      name: "Inclusivity / Equality & Diversity",
      weight_points: 20,
      description: "Representation and fairness in programming and participation.",
      indicators: [
        // βασισμένο στο E&D pillar (A1–A3) :contentReference[oaicite:6]{index=6}
        {
          id: "A1",
          name: "Representation in programme",
          pillar_id: "INCLUSIVITY",
          weight_points: 8,
          definition: "Diversity and representation in the programme lineup.",
          measures: ["Gender balance", "Under-represented groups", "Early-career presence (where relevant)"],
          evidence_examples: ["Programme list with basic breakdown", "Curatorial statement + data appendix"],
          scoring_rubric_0_to_1: {
            score_0: "No data / no reflection on representation.",
            score_0_5: "Some representation aims or partial breakdown.",
            score_1: "Clear representation breakdown + targets or rationale.",
          },
        },
        {
          id: "A2",
          name: "Governance & team fairness (project/team)",
          pillar_id: "INCLUSIVITY",
          weight_points: 6,
          definition: "Fairness and inclusion within the team structure (scaled to project).",
          measures: ["Clear roles & fair pay bands (where possible)", "Inclusion policy/approach", "Safeguarding / reporting path"],
          evidence_examples: ["Team policy doc", "Role descriptions", "Anonymous pulse survey (optional)"],
          scoring_rubric_0_to_1: {
            score_0: "No fairness/inclusion approach stated.",
            score_0_5: "Some statements but no process/evidence.",
            score_1: "Clear process + evidence of implementation.",
          },
        },
        {
          id: "A3",
          name: "Pipeline & support",
          pillar_id: "INCLUSIVITY",
          weight_points: 6,
          definition: "Support opportunities for under-represented creators/participants.",
          measures: ["Open calls targeting inclusion", "Mentorship/residency", "Budget share for inclusion (if applicable)"],
          evidence_examples: ["Open call link", "Mentorship plan", "Budget line item (banded)"],
          scoring_rubric_0_to_1: {
            score_0: "No pipeline/support actions.",
            score_0_5: "Some actions but not systematic.",
            score_1: "Clear inclusion pipeline + resources allocated.",
          },
        },
      ],
    },

    {
      id: "TRANSPARENCY",
      name: "Transparency",
      weight_points: 15,
      description: "How open the selection and decision processes are.",
      indicators: [
        // βασισμένο στο Transparency pillar (B1–B3) :contentReference[oaicite:7]{index=7}
        {
          id: "B1",
          name: "Open calls & clear criteria",
          pillar_id: "TRANSPARENCY",
          weight_points: 6,
          definition: "Clarity of calls, criteria, and timelines.",
          measures: ["Public call availability", "Criteria posted", "Timeline clarity (e.g., ≥8 weeks where relevant)"],
          evidence_examples: ["Call page", "Criteria document", "Timeline screenshot"],
          scoring_rubric_0_to_1: {
            score_0: "No open calls / opaque selection.",
            score_0_5: "Some transparency but incomplete criteria.",
            score_1: "Clear calls + criteria + timeline + eligibility.",
          },
        },
        {
          id: "B2",
          name: "Decision disclosure & conflicts of interest",
          pillar_id: "TRANSPARENCY",
          weight_points: 6,
          definition: "Decision process transparency and conflict-of-interest handling.",
          measures: ["Jury/committee disclosed", "COI policy", "Reasoning documented (at least internally)"],
          evidence_examples: ["Jury list", "COI policy link", "Decision memo (internal)"],
          scoring_rubric_0_to_1: {
            score_0: "No disclosure or policies.",
            score_0_5: "Partial disclosure/policy.",
            score_1: "Clear COI policy + disclosure + documented reasoning.",
          },
        },
        {
          id: "B3",
          name: "Data openness",
          pillar_id: "TRANSPARENCY",
          weight_points: 3,
          definition: "Availability of basic stats and programme/budget bands.",
          measures: ["Basic reporting on participation/applications", "Budget bands (where possible)", "Sponsorship policy visibility"],
          evidence_examples: ["Annual/after-action report", "Budget band summary", "Sponsor policy"],
          scoring_rubric_0_to_1: {
            score_0: "No reporting.",
            score_0_5: "Some reporting but incomplete.",
            score_1: "Consistent reporting + accessible summary.",
          },
        },
      ],
    },

    {
      id: "COMMUNITY",
      name: "Community Impact / Participation",
      weight_points: 20,
      description: "Meaningful co-creation and feedback loops (not just attendance).",
      indicators: [
        // βασισμένο στο Citizen Participation pillar (D1–D4) :contentReference[oaicite:8]{index=8}
        {
          id: "D1",
          name: "Co-design",
          pillar_id: "COMMUNITY",
          weight_points: 6,
          definition: "Evidence that communities co-shape the programme.",
          measures: ["Advisory group participation", "Co-created programme elements", "Community partners involved early"],
          evidence_examples: ["Advisory minutes", "Partner letters", "Co-design workshop notes"],
          scoring_rubric_0_to_1: {
            score_0: "No co-design evidence.",
            score_0_5: "Consultation only (limited co-creation).",
            score_1: "Clear co-design process + artefacts + roles.",
          },
        },
        {
          id: "D2",
          name: "Feedback → change",
          pillar_id: "COMMUNITY",
          weight_points: 5,
          definition: "A feedback loop that leads to concrete improvements.",
          measures: ["Feedback collected", "Changes documented", "Dashboard/summary shared internally or publicly"],
          evidence_examples: ["Feedback summary", "Change log", "Before/after policy note"],
          scoring_rubric_0_to_1: {
            score_0: "No feedback loop.",
            score_0_5: "Feedback collected but no evidence of change.",
            score_1: "Feedback + clear change log + accountability.",
          },
        },
        {
          id: "D3",
          name: "Community benefit",
          pillar_id: "COMMUNITY",
          weight_points: 5,
          definition: "Partnerships and off-site/community-led work that benefits local ecosystems.",
          measures: ["School/NGO partnerships", "% hours off-site/community-led", "Local capacity-building actions"],
          evidence_examples: ["MoUs/partnership list", "Programme calendar", "Community-led session docs"],
          scoring_rubric_0_to_1: {
            score_0: "No partnerships/community benefit evidence.",
            score_0_5: "Some partnerships but limited depth.",
            score_1: "Multiple partnerships + sustained/community-led elements.",
          },
        },
        {
          id: "D4",
          name: "Democratic artistic practice (where relevant)",
          pillar_id: "COMMUNITY",
          weight_points: 4,
          definition: "Artist practices that include transparency/co-creation/open actions.",
          measures: ["Open studios/actions", "Co-creation with audiences", "Transparency about pay (where possible)", "Open licensing/open access"],
          evidence_examples: ["Artist documentation", "Programme notes", "Licensing statements"],
          scoring_rubric_0_to_1: {
            score_0: "No evidence.",
            score_0_5: "Some elements but sporadic.",
            score_1: "Clear practices documented and repeated.",
          },
        },
      ],
    },
  ],
};
