# Adaptive Synthetic Research Engine (ASE v2.0) — Οδηγός χρήσης

> Η παρούσα μελέτη βασίζεται σε συνθετικά καταναλωτικά προφίλ και προσομοιωμένες απαντήσεις. Δεν αποτελεί δειγματοληπτική έρευνα με συνεντεύξεις πραγματικών καταναλωτών.
> (Η πρόταση αυτή μπαίνει αυτόματα, αυτούσια, σε κάθε αναφορά πελάτη.)

Ο ASE είναι ένας γενικός μηχανισμός. Δουλεύει με οποιοδήποτε ερωτηματολόγιο, πελάτη, κλάδο, μέγεθος δείγματος και κοινό-στόχο. Ο κώδικας μένει ίδιος από μελέτη σε μελέτη. Αλλάζουν μόνο δύο αρχεία της μελέτης: `config.yaml` και `questionnaire.yaml`.

Κώδικας: `research-engine/` · Μελέτες: `studies/<study_id>/` · Tests: `python3 -I research-engine/tests/run_tests.py`

---

## 1. Γρήγορη εκκίνηση

```bash
# 0) Μία φορά ανά περιβάλλον: πλαίσιο δειγματοληψίας (GLOPOP-S, βαθμονομημένο σε Eurostat/ΕΛΣΤΑΤ 2025)
npx tsx scripts/synthetic-lab/import-glopop.ts            # λήψη των αρχείων GLOPOP-S (CC BY 4.0), αν λείπουν
python3 -I research-engine/ase_cli.py build-frame          # 250.000 εγγραφές → .synthetic-lab-data/ase/frames/

# 1) Νέα μελέτη από πρότυπο
python3 -I research-engine/ase_cli.py init-study studies/supermarket_2027 --id supermarket_2027 \
    --title "Συνήθειες αγορών στο σούπερ μάρκετ" --client "Πελάτης Α" --sample-size 1500

# 2) Επεξεργασία των studies/supermarket_2027/config.yaml και questionnaire.yaml, και μετά:
python3 -I research-engine/ase_cli.py validate studies/supermarket_2027     # τύποι, skip logic, intents
python3 -I research-engine/ase_cli.py panel    studies/supermarket_2027     # πάνελ + έλεγχος quotas
python3 -I research-engine/ase_cli.py context  studies/supermarket_2027     # ερευνητικό πλαίσιο (μία φορά ανά μελέτη)

# 3) Κόστος και δοκιμή ΠΡΙΝ από οποιαδήποτε πληρωμένη εκτέλεση
python3 -I research-engine/ase_cli.py estimate studies/supermarket_2027 --provider anthropic --model claude-haiku-5-5
python3 -I research-engine/ase_cli.py dry-run  studies/supermarket_2027 --n 15                    # mock, δωρεάν
python3 -I research-engine/ase_cli.py dry-run  studies/supermarket_2027 --n 15 --provider anthropic --model claude-haiku-5-5

# 4) Πλήρης εκτέλεση: ΜΟΝΟ με ρητό όριο κόστους και επιβεβαίωση
python3 -I research-engine/ase_cli.py run studies/supermarket_2027 --provider anthropic --model claude-haiku-5-5 \
    --budget-usd 30 --confirm

# 5) Αποτελέσματα, αναφορά, εξαγωγή μόνο των παραδοτέων
python3 -I research-engine/ase_cli.py report studies/supermarket_2027 --run <RUN_ID>
python3 -I research-engine/ase_cli.py export studies/supermarket_2027 /path/για/τον/πελάτη
```

Αν μια εκτέλεση διακοπεί (σφάλμα δικτύου, όριο κόστους, Ctrl-C), συνεχίζει από εκεί που σταμάτησε:
`run ... --resume <RUN_ID>`. Το `run_id` τυπώνεται στην αρχή κάθε εκτέλεσης.

---

## 2. Παραδείγματα μελετών (αλλάζει μόνο το config)

| Μελέτη | `panel` στο config.yaml |
|---|---|
| Retailer ηλεκτρικών, 500, πανελλαδικά | `sample_size: 500`, `geography: nationwide` |
| Σούπερ μάρκετ, 1.500, πανελλαδικά | `sample_size: 1500`, `geography: nationwide` |
| Τράπεζες, γυναίκες 25–54 στην Αττική, 750 | `sample_size: 750`, `geography: {regions: [Αττική]}`, `filters: {gender: [female], age_band: [25-34, 35-44, 45-54]}` |

Το μέγεθος δείγματος δεν είναι γραμμένο κάπου στον κώδικα. Έχουν δοκιμαστεί τα 500, 750 (στοχευμένο), 1.500 και 5.000.

### Πλήρες `config.yaml`

```yaml
study_id: kotsovolos_trust_2026          # μοναδικό· καθορίζει IDs και seeds
country: GR
questionnaire: questionnaire.yaml
study:
  title: "…"
  subtitle: "…"
  client: "…"
  topic: "…"                             # σύντομη περιγραφή για το μοντέλο (ελέγχεται για εντολές-στόχους)
  instructions_to_model: ""              # προαιρετικό· απορρίπτεται αν ορίζει αποτελέσματα («κάνε το 65% …»)
panel:
  population: adults_18_plus
  sample_size: 500
  geography: nationwide                  # ή {regions: [Αττική, Κεντρική Μακεδονία]}
  filters: {}                            # π.χ. {gender: [female], age_band: [25-34, 35-44]}
  sampling:
    strategy: demographic_quota
    variables: [age, gender, region, household_type, education, income_band]
    tolerance_pp: 2                      # ανοχή quota σε ποσοστιαίες μονάδες
  random_seed: 20261031
  avoid_overlap: true                    # διαφορετικά προφίλ από άλλες μελέτες (εκτός αν reuse_panel_from)
  extensions: []                         # κλαδικά χαρακτηριστικά — βλ. §3
research:
  search_terms_en: [trust, retail, delivery]
  search_terms_el: [εμπιστοσύνη, παράδοση]
  use_lake: true                         # εσωτερικός κατάλογος μελετών (μόνο ανάγνωση)
  use_official: true                     # επίσημα στατιστικά του Lab
  web: {enabled: false}                  # web research μόνο αν ενεργοποιηθεί ρητά
  min_relevance: 2
  max_sources: 40
  per_question: 3
llm:
  max_tokens: 1500
hybrid_weight: 0.5                       # MODE C: βάρος εμπειρικού μοντέλου
reference_distributions: []              # ποσοστά αναφοράς (π.χ. Brand Intelligence) για τον έλεγχο μη αντιγραφής
calibration_version: null                # π.χ. v1 — μόνο αφού περάσει έλεγχο σε holdout (§8)
report:
  key_questions: [Q4, Q7]
  crosstab_questions: [Q7]
  implications: []                       # γράφονται από τον ερευνητή μετά την ανάγνωση των αποτελεσμάτων
  conclusions: []
```

---

## 3. Συνθετικό πάνελ

- **Πλαίσιο:** GLOPOP-S v5.0 (CC BY 4.0), 250.000 εγγραφές. Είναι βαθμονομημένο (raking) σε Eurostat 2025 (περιφέρεια × ηλικία × φύλο) και στην εκπαίδευση 25–64. Οι παραδοχές A1–A6 είναι στο manifest του πλαισίου.
- **Επιλογή:**
  - στρώματα περιφέρεια × ηλικία × φύλο·
  - σταθμισμένη επιλογή χωρίς επανάθεση·
  - εξισορρόπηση των υπόλοιπων quotas με ανταλλαγές μέσα στο ίδιο στρώμα.

  Κάθε προφίλ είναι πραγματική εγγραφή του πλαισίου. Γι' αυτό δεν προκύπτουν αδύνατοι συνδυασμοί (π.χ. «νοικοκυριό 1 ατόμου με παιδιά»).
- **IDs:** `R00001…`. Ίδιο seed και ίδιο `study_id` δίνουν ίδιο πάνελ. Άλλη μελέτη δίνει διαφορετικά προφίλ.
- **Έλεγχος quotas:** `internal/panel_report.json` (στόχος, επιτευχθέν, απόκλιση, σημαία).

  | Δείγμα | Μέγιστη απόκλιση |
  |---|---|
  | 500 | 0,64 μον. |
  | 1.500 | 0,15 μον. |
  | 750 στοχευμένο | 0,08 μον. |
- **Τι ΔΕΝ περιέχει το πάνελ:** απασχόληση, επάγγελμα, προσωπικό ιστορικό αγορών, σχέσεις με brands. Αυτά δηλώνονται ως άγνωστα στο μοντέλο.
- **Κλαδικά χαρακτηριστικά (`extensions`):** απαιτούν τεκμηριωμένη πηγή ή ρητή παραδοχή με αιτιολόγηση. Χωρίς αυτά, το πάνελ ΔΕΝ δημιουργείται.

```yaml
extensions:
  - name: x_has_credit_card
    conditional_on: income_quintile
    table: {"1": {"yes": 0.3, "no": 0.7}, "2": {...}, ...}
    source: {title: "…", url: "https://…", year: 2024}
  # ή
  - name: x_online_shopper
    levels: {"yes": 0.6, "no": 0.4}
    status: assumption
    justification: "Ενδεικτική παραδοχή για δοκιμή· να αντικατασταθεί από Eurostat isoc_ec_ib20"
```

> Η δημογραφική ομοιότητα του πάνελ με τον πληθυσμό ΔΕΝ αποδεικνύει ότι οι προσομοιωμένες απαντήσεις αντιστοιχούν σε πραγματικές συμπεριφορές.

---

## 4. Ερωτηματολόγιο (YAML ή JSON)

```yaml
questionnaire_id: kotsovolos_trust_v1
title: "…"
language: el
randomize_questions: false
consistency_rules:
  - {id: C1, when: "Q4 == '5' and num(Q5) <= 2"}         # αντιφατικός συνδυασμός → σημαία στο QC
blocks:
  - id: B1
    title: "…"
    questions:
      - id: S1
        text: "Έχετε αγοράσει … τους τελευταίους 24 μήνες;"
        type: single_choice
        options: ["Ναι", "Όχι"]
        screening: {terminate_if: ["2"]}
      - id: D1
        text: "Φύλο"
        type: single_choice
        intent: demographic
        profile_field: gender
        options: [{code: "1", label: "Άνδρας"}, {code: "2", label: "Γυναίκα"}]
        profile_map: {male: "1", female: "2"}
      - id: Q4
        text: "Πόσο εμπιστεύεστε …;"
        type: likert
        scale: {points: 5, labels: {1: "Καθόλου", 5: "Απόλυτα"}}
      - id: Q5
        text: "…"
        type: numeric
        numeric: {min: 0, max: 10, integer: true}
        condition: "Q4 == '1'"
      - id: Q6
        text: "…"
        type: multiple_choice
        options: ["…", "…", {code: "9", label: "Κανένα", exclusive: true}]
        min_choices: 1
        max_choices: 3
        randomize_options: true
        anchor: ["9"]
      - id: Q7
        text: "Κατατάξτε …"
        type: ranking
        rank_k: 3
        options: [...]
      - id: Q8
        text: "…"
        type: open
        max_chars: 600
      - id: SC1a
        text: "…"
        type: scenario
        scenario: {text: "…"}
        sensitivity_group: SC1
        variant_label: "με ενημέρωση"
        options: [...]
      - id: Q17
        text: "Ποια προσφορά θα επιλέγατε;"
        type: dce
        dce:
          alternatives: [{id: A, label: "Α"}, {id: B, label: "Β"}]
          attributes: {Τιμή: ["549 €", "599 €"], Παράδοση: ["1 ημέρα", "5 ημέρες"]}
          none_option: true
```

- **Τύποι:** `single_choice`, `multiple_choice`, `likert`, `numeric`, `ranking`, `open`, `scenario`, `dce`. Επίσης υποστηρίζονται blocks, screening, skip logic, τυχαιοποίηση επιλογών (με anchors) και DCE (τυχαιοποιημένα χαρακτηριστικά με seed).
- **Συνθήκες (skip logic):**
  - μόνο ασφαλείς εκφράσεις, π.χ. `Q1 == '2'`, `contains(Q6, '3')`, `count(Q6) >= 2`, `num(Q5) > 7`, `answered(Q3)`, `profile.gender == 'female'`·
  - αναφορές μόνο σε προηγούμενες ερωτήσεις·
  - κώδικας Python απορρίπτεται.
- **Πρόθεση (intent):** κάθε ερώτηση ταξινομείται σε μία από 6 κατηγορίες: demographic, experience, knowledge, attitude, hypothetical_choice, intention. Η ταξινόμηση γίνεται ρητά με `intent:` ή αυτόματα, από `profile_field`, τύπο ή ελληνικές φράσεις. Το `validate` δείχνει την ταξινόμηση και πώς προέκυψε.
- **Ερωτήσεις εμπειρίας** (π.χ. «έχετε επιστρέψει προϊόν;»): η απάντηση σημαίνεται `SYNTHETIC_SCENARIO_ATTRIBUTE`. Είναι χαρακτηριστικό του σεναρίου, όχι πραγματικό ιστορικό του προσώπου.

---

## 5. Πώς παράγονται οι απαντήσεις

| Mode | Πότε | Τι κάνει |
|---|---|---|
| `PROFILE` | δημογραφικά με `profile_field` | Τιμή από το συνθετικό προφίλ |
| `A_EMPIRICAL` | εμπειρικό μοντέλο **της ίδιας χώρας**, εντός πεδίου | Κατανομή από το εκπαιδευμένο μοντέλο (CCE) |
| `B_LLM` | κάθε άλλη ερώτηση | Το LLM εκτιμά **κατανομή** για το συγκεκριμένο προφίλ (με το ερευνητικό πλαίσιο και τις προηγούμενες απαντήσεις)· η απάντηση **κληρώνεται** με σταθερό seed |
| `C_HYBRID` | εμπειρικό μοντέλο **άλλης χώρας** | Μείξη εμπειρικής και LLM κατανομής (`hybrid_weight`) — σημαίνεται `EXPERIMENTAL_CROSS_COUNTRY_TRANSFER`, ποτέ «επικυρωμένο» |
| `B_LLM_CALIBRATED` | αν έχει ενεργοποιηθεί έκδοση βαθμονόμησης | Διόρθωση από πραγματικά δεδομένα, που έχει ελεγχθεί σε holdout |
| `SKIP_LOGIC` | συνθήκη ψευδής | Η ερώτηση δεν εμφανίζεται |

Ένα ξένο μοντέλο δεν γίνεται ποτέ αυτόματα MODE A. Για να γίνει, χρειάζεται ρητό `allow_cross_country_mode_a: true` στο config.

Η κλήρωση από κατανομή εξηγεί δύο ιδιότητες:
- Δεν παίρνουμε 500 ίδιες απαντήσεις: κάθε προφίλ έχει δική του κατανομή και κληρώνεται χωριστά.
- Δεν προσθέτουμε τεχνητή ποικιλία: η διασπορά προέρχεται από την εκτιμώμενη κατανομή, όχι από τυχαίο θόρυβο.

Ίδιο seed σημαίνει ίδια αποτελέσματα, ανεξάρτητα από τον παραλληλισμό ή από τυχόν διακοπή και συνέχεια της εκτέλεσης.

Το μοντέλο επιστρέφει δομημένο JSON (JSON schema ανά ερώτηση):
- κατανομή·
- για ανοιχτές ερωτήσεις, κείμενο σε φυσικά ελληνικά·
- σύντομη αιτιολόγηση.

Ιδιωτική συλλογιστική του μοντέλου δεν αποθηκεύεται.

**Οδηγίες-στόχοι απαγορεύονται.** Κείμενα όπως «κάνε το 65% αρνητικό» ή «επιβεβαίωσε την αναφορά Brand Intelligence» απορρίπτονται πριν από την εκτέλεση.

---

## 6. Πάροχοι LLM, κόστος, ασφάλειες

| Πάροχος | Κατάσταση | Ρύθμιση |
|---|---|---|
| Anthropic (Claude) | Υλοποιημένος (επίσημο SDK, structured outputs). **Δεν έχει δοκιμαστεί με πραγματικό key σε αυτό το περιβάλλον** | `pip install anthropic` + μεταβλητή περιβάλλοντος `ANTHROPIC_API_KEY` |
| OpenAI | Πειραματικός adapter, μη δοκιμασμένος | `pip install openai` + `OPENAI_API_KEY` + τιμές στο `research-engine/config/llm_pricing.yaml` |
| Google Gemini | Πειραματικός adapter, μη δοκιμασμένος | `pip install google-genai` + `GEMINI_API_KEY` + τιμές στο ίδιο αρχείο |
| mock | Για tests και dry runs | Χωρίς κόστος· **χωρίς ερευνητική αξία** |

`python3 -I research-engine/ase_cli.py providers` δείχνει τι είναι διαθέσιμο.

**Ασφάλειες:**
- Πραγματικός πάροχος σε πλήρη εκτέλεση απαιτεί `--budget-usd` ΚΑΙ `--confirm`.
- Το dry run επιτρέπει έως 20 προφίλ.
- Για μοντέλο χωρίς καταχωρημένη τιμή, η εκτέλεση με όριο κόστους αρνείται να ξεκινήσει.
- Πριν από κάθε κλήση γίνεται κράτηση του εκτιμώμενου κόστους. Η εκτέλεση σταματά πριν ξεπεραστεί το όριο και οι ολοκληρωμένοι ερωτώμενοι μένουν στο checkpoint.
- Rate limit (`--rpm`), retry με εκθετικό backoff (σέβεται το `retry-after`), έλεγχος JSON και σημασιολογικός έλεγχος με επανάληψη, παράλληλη εκτέλεση (`--workers`).
- Το μοντέλο και η έκδοσή του καταγράφονται ανά απάντηση.

### Εκτίμηση κόστους (πιλοτική μελέτη, 34 ερωτήσεις μέσω LLM ανά ερωτώμενο)

| Μοντέλο | 500 προφίλ | 1.500 προφίλ |
|---|---|---|
| claude-haiku-5-5 | 2,3–7,4 USD | 7,0–22,3 USD |
| claude-sonnet-5-5 | 46–148 USD | 139–445 USD |
| claude-opus-5-5 | 93–297 USD | 278–890 USD |

**Παραδοχές:**
- Μία κλήση ανά ερώτηση: 17.000 κλήσεις για τα 500 προφίλ, 51.000 για τα 1.500.
- Input μετρημένο από τα πραγματικά prompts: περίπου 930 tokens/κλήση με 2,5 χαρακτήρες/token για ελληνικό κείμενο.
- Output 40–160 tokens/ερώτηση, συν 0–600 tokens συλλογιστικής/κλήση. Αυτό είναι και το εύρος της εκτίμησης.
- Όλες οι ερωτήσεις θεωρείται ότι εμφανίζονται. Το skip logic και το screening μειώνουν το πραγματικό κόστος.
- Χωρίς prompt caching και χωρίς Batches API (−50%). Κανένα από τα δύο δεν έχει υλοποιηθεί ακόμη.
- Τιμές Anthropic (USD/εκατ. tokens, input/output): Haiku 5.5 0,10/0,50 · Sonnet 5.5 2/10 · Opus 5.5 4/20. Πηγή: πίνακας μοντέλων του claude-api (2026-10). Επαληθεύστε στο https://platform.claude.com/docs/en/about-claude/pricing.md πριν από τον προϋπολογισμό.
- Με `--batching per_block` (μία κλήση ανά block): περίπου 33–69 USD για Sonnet/500, με λιγότερες κλήσεις αλλά μεγαλύτερα prompts. Η ποιότητα αυτής της επιλογής δεν έχει αξιολογηθεί.
- Μετά από dry run με πραγματικό πάροχο, το `estimate` χρησιμοποιεί αυτόματα τα **μετρημένα** tokens ανά κλήση.

---

## 7. Αρχεία μελέτης: εσωτερικά και παραδοτέα

```
studies/<id>/
  config.yaml, questionnaire.yaml, sources.yaml (προαιρετικό: επιμελημένες πηγές)
  internal/                              ← ΔΕΝ εξάγεται ποτέ στον πελάτη
    respondents.csv.gz, panel_report.json, evidence_registry.json, assumptions.md
    runs/<run_id>/
      individual_responses.(parquet|csv.gz)   ← όλα τα πεδία audit ανά απάντηση
      respondent_status.json, model_provenance.json, execution_manifest.json
      quality_checks.json, validation_report.md, checkpoint.jsonl
      preview/                            ← αναφορά dry/mock run (σημασμένη ΠΡΟΕΠΙΣΚΟΠΗΣΗ)
    real_data/<import_id>/                ← πραγματικά δεδομένα (gitignored)
    calibrations/vN.json
  deliverables/                           ← results.csv, crosstabs.csv, executive_report.html/.pdf
```

**Πεδία audit ανά απάντηση:**

| Ομάδα | Πεδία |
|---|---|
| Ταυτότητα | study, run, respondent, question, intent |
| Απάντηση | response, answer_nature, engine_mode, validation |
| Μοντέλο | provider, model, model_version, prompt_version, seed |
| Τεκμηρίωση | evidence_refs, source_country, assumptions, empirical_support |
| Λεπτομέρειες κλήσης | κατανομή, σύντομη αιτιολόγηση, attempts/retries, tokens, request_id, timestamp |

Το `export` αντιγράφει **μόνο** τα 4 παραδοτέα αρχεία. Αν ο φάκελος προορισμού περιέχει άλλο αρχείο, η εξαγωγή σταματά. Δεν επιτρέπεται εξαγωγή από τον φάκελο `internal/`. Οι mock και dry εκτελέσεις δεν παράγουν ποτέ παραδοτέα πελάτη.

**Η αναφορά πελάτη (HTML + PDF, στα ελληνικά) περιέχει:**
- την υποχρεωτική δήλωση στο εξώφυλλο και στη μεθοδολογία·
- σύνοψη, ευρήματα ανά ενότητα, σύγκριση σεναρίων, διασταυρώσεις, ομάδες καταναλωτών·
- επιπτώσεις και συμπεράσματα (από τον ερευνητή), μεθοδολογία.

Δεν αναφέρεται στατιστικό περιθώριο σφάλματος. Κάθε ράβδος γραφήματος φέρει `data-pct` που ελέγχεται αυτόματα έναντι του `results.csv`.

**Έλεγχοι ποιότητας** (`quality_checks.json`):
- εγκυρότητα ανά τύπο, skip logic, IDs, διπλοεγγραφές, quotas·
- αντιφάσεις, υπερβολική ομοιομορφία, ευαισθησία σεναρίων, επαναληψιμότητα, διαφορές παρόχων·
- μη αντιγραφή ποσοστών αναφοράς, εμπειρική στήριξη.

Τα προβλήματα **σημαίνονται**· δεν διορθώνονται σιωπηρά.

---

## 8. Τριμηνιαία μάθηση από πραγματικά δεδομένα

```bash
python3 -I research-engine/ase_cli.py import-real studies/X data.csv metadata.yaml mapping.yaml
python3 -I research-engine/ase_cli.py compare     studies/X --run <RUN_ID> --import <IMPORT_ID> --dashboard
python3 -I research-engine/ase_cli.py calibrate   studies/X --run <RUN_ID> --import <IMPORT_ID> --min-n 200
```

- **Δεδομένα:** CSV ή Parquet (το Parquet απαιτεί `pip install pyarrow`).
  - Υποχρεωτικές στήλες: `respondent_id`, `questionnaire_id`, `fieldwork_date`.
  - Προαιρετικές: `weight` και δημογραφικά.
- **metadata.yaml:**
  - `source`, `sample_design`, `fieldwork_start`, `fieldwork_end`, `licence`·
  - `consent_status` ∈ {consented_research_use, licensed_commercial, open_licence}. Οτιδήποτε άλλο απορρίπτεται.
- **mapping.yaml:** `questions: {πραγματική_στήλη: {synthetic: Q4, recode: {"ναι": "1"}}}`.
- **Σύγκριση:** TVD, μέγιστη απόκλιση και Jensen–Shannon, ανά ερώτηση και υποομάδα. Υπάρχει και εσωτερικό dashboard HTML.
- **Βαθμονόμηση:**
  - διαχωρισμός 50/50 σε fit και holdout· συντελεστές με shrinkage·
  - **γίνεται δεκτή ανά ερώτηση μόνο αν βελτιώνει το holdout**· αλλιώς μένει η προηγούμενη έκδοση·
  - οι εκδόσεις (v1, v2, …) δεν αντικαθίστανται ποτέ.

  Για να τη χρησιμοποιήσει μια μελέτη: `calibration_version: v1` στο config.

---

## 9. Τι είναι πειραματικό ή περιορισμένο

- Οι adapters OpenAI και Gemini δεν έχουν δοκιμαστεί. Ο Anthropic adapter δεν έχει δοκιμαστεί με πραγματικό key σε αυτό το περιβάλλον.
- Το web research (εργαλείο web_search του Claude) δεν έχει δοκιμαστεί και είναι απενεργοποιημένο από προεπιλογή.
- MODE C (υβριδικό): η μείξη κατανομών δεν είναι στατιστικά επικυρωμένη.
- Η βαθμονόμηση έχει δοκιμαστεί μόνο σε δοκιμαστικά δεδομένα. Δεν υπάρχουν ακόμη πραγματικά δεδομένα πελάτη.
- Οι ομάδες καταναλωτών (k-means στις Likert) είναι περιγραφικές.
- Το mock περνά όλους τους ελέγχους υποδομής, αλλά **δεν αποδεικνύει ότι οι συνθετικές απαντήσεις είναι έγκυρες**. Η εγκυρότητα μπορεί να ελεγχθεί μόνο με σύγκριση με πραγματικά δεδομένα (§8).
- Δεν έχουν υλοποιηθεί ακόμη: Batches API, prompt caching, μοντέλα πληθυσμού εκτός «ενήλικες 18+ Ελλάδα».

---

## 10. Απαντήσεις AI από συνεδρία Claude Code, χωρίς API key (`claude_session`)

Το AI της συνεδρίας παίζει τον ρόλο του API, μέσω αρχείων. Δεν χρειάζεται key και δεν υπάρχει χρέωση API. Καταναλώνεται όμως το όριο χρήσης της συνδρομής Claude.

```bash
S=studies/kotsovolos_trust_2026
# 1) γύρος: η εκτέλεση γράφει αιτήματα στο internal/runs/<RUN>/session/pending/ και σταματά (exit 3 = αναμονή)
python3 -I research-engine/ase_cli.py dry-run $S --provider claude_session --n 15 --batching per_block --resume <RUN>
# 2) το AI της συνεδρίας γράφει απαντήσεις στο session/inbox/<key>.json: {"answered_by": "...", "answer": {...}}
# 3) έλεγχος + εισαγωγή (ίδιο JSON schema και σημασιολογικός έλεγχος με το API)
python3 -I research-engine/ase_cli.py session-import $S --run <RUN>
python3 -I research-engine/ase_cli.py session-status $S --run <RUN>
# 4) επανάληψη του 1 μέχρι να μη μένουν αιτήματα· μετά report
```

- **Ιστορικό:** κάθε προφίλ περνά μία ενότητα ανά γύρο και βλέπει τις προηγούμενες απαντήσεις του.
- **Απαντήσεις που λείπουν:** οι ερωτώμενοι δεν γράφονται ως σφάλματα· απλώς περιμένουν τον επόμενο γύρο.
- **Μη έγκυρες απαντήσεις:** πάνε στο `session/rejected/` με αιτιολογία. Δεν διορθώνονται σιωπηρά.
- **Καταγραφή:** provider `claude_session`, model `claude-code-session`, `mock = false`, και `answered_by` ανά απάντηση.
- **Πρώτη δοκιμή (15 προφίλ):** `studies/kotsovolos_trust_2026/internal/runs/session_ai_15/SESSION_TEST_REPORT.md`.
