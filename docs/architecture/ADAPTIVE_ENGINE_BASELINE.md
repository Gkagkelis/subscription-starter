# Adaptive Synthetic Research Engine v2.0 — Baseline πριν από την αναβάθμιση (εσωτερικό)

Ημερομηνία: 2026-10-31. Commit βάσης: `678220c` (branch `claude/synthetic-research-lab`).

## 1. Υπάρχουσα αρχιτεκτονική

| Επίπεδο | Τεχνολογία | Τοποθεσία | Ρόλος |
|---|---|---|---|
| Web εφαρμογή | Next.js 14, TypeScript, Supabase, Stripe | `app/`, `components/`, `utils/` | UI του Lab, API routes |
| Πυρήνας Lab (production) | TypeScript | `lib/synthetic-lab/` | Πληθυσμός, persona engine (`pie-*`), survey engine, guardrails, αναφορές |
| Πληθυσμός | TypeScript | `lib/synthetic-lab/population/` | GLOPOP-S (5.000 ενσωματωμένες εγγραφές) + raking σε Eurostat/ΕΛΣΤΑΤ 2025 (`store.ts`, `calibration.ts`, `sampling.ts`) |
| Persona Engine | TypeScript + Python offline | `lib/synthetic-lab/persona/`, `scripts/synthetic-lab/persona/` | Απαντήσεις από μικροδεδομένα (diaNEOsis, CSES, ESS κ.ά.), IQGE, evidence tiers |
| Survey engine / LLM | TypeScript | `lib/synthetic-lab/engine/` (`survey.ts`, `llm-responder.ts`, `evidence-responder.ts`, `guardrails.ts`), `lib/synthetic-lab/ai/` | Εκτέλεση ερωτηματολογίων· live AI απενεργοποιημένο από προεπιλογή (`SYNTHETIC_LAB_LIVE_AI`) |
| Data lake | Python + SQLite | `scripts/synthetic-lab/lake/`, `.synthetic-lab-data/lake/` | Eurostat, Eurobarometer, αποθετήρια· μεταδεδομένα και τιμές |
| Consumer Choice Engine (CCE 0.1) | Python (numpy/scipy) | `models/consumer-choice-engine/` | CL/MXL σε πραγματικά DCE (CH, US), πύλη εφαρμοσιμότητας, `experimental_transfer_mode` |
| Μελέτες / αναφορές | Python + Node (Playwright) | `scripts/synthetic-lab/*`, `models/consumer-choice-engine/studies/`, `docs/synthetic-lab/*` | CSV, HTML, PDF (Chromium) |

## 2. Generators συνθετικών προφίλ

- **`lib/synthetic-lab/population/store.ts`**
  - `loadPopulation()`: φορτώνει το GLOPOP-S 2015 (ενσωματωμένο δείγμα 5.000) και το βαθμονομεί (raking) σε Eurostat `demo_r_pjangroup` 2025 (περιφέρεια × ηλικία × φύλο) και `edat_lfs_9901` 2025 (εκπαίδευση).
  - `selectRespondents()`: στρωματοποίηση ανά περιφέρεια (SRS, persona_weight, PPS).
  - **Περιορισμοί:**
    - μέγιστο πλαίσιο 5.000 εγγραφών, άρα στοχευμένα δείγματα (π.χ. γυναίκες 25–54 Αττικής ≈ 400 εγγραφές) δεν φτάνουν για 750 μοναδικά προφίλ·
    - η ηλικία έχει ζώνη 15–24, οπότε το 18+ δεν διαχωρίζεται ακριβώς·
    - δεν υπάρχει μεταβλητή απασχόλησης.
- **Πλήρη αρχεία GLOPOP-S** (10.625.742 εγγραφές, 13 περιφέρειες): `.synthetic-lab-data/raw/glopop/GRC/*.dat.gz` (gitignored).
- **Παλαιότερα πάνελ μελετών** (π.χ. `docs/synthetic-lab/consumer-decision-study/SYNTHETIC_CONSUMERS.csv`, 500 προφίλ) παρήχθησαν από τον TS πληθυσμό και διατηρούνται αμετάβλητα.

## 3. Πραγματικά datasets και εκπαιδευμένα μοντέλα

| Πόρος | Τοποθεσία | Άδεια | Σημείωση |
|---|---|---|---|
| GLOPOP-S v5.0 (Ελλάδα) | `.synthetic-lab-data/raw/glopop/`, `lib/synthetic-lab/data/populations/` | CC BY 4.0 | Έτος αναφοράς 2015 |
| Eurostat πληθυσμός / εκπαίδευση / SILC / ICT 2025 | `lib/synthetic-lab/data/official/*.json` | CC BY 4.0 | Στόχοι βαθμονόμησης |
| EC BCS (καταναλωτική εμπιστοσύνη) | `lib/synthetic-lab/data/official/ec-bcs-consumer-greece.json` | επαναχρησιμοποίηση ΕΕ | Συγκεντρωτικά |
| Persona engine (pie-0.7, pie-hbs-0.1) | `scripts/synthetic-lab/persona/`, `.synthetic-lab-data/persona/` | ανά πηγή (diaNEOsis κ.ά.) | Production `pie-0.2` — **δεν αγγίζεται** |
| CCE 0.1 artifacts | `models/consumer-choice-engine/artifacts/` | CC BY 4.0 (CH), **CC BY-NC (refurbished US)**, MIT (delivery), GPL (electricity) | Ελληνική επικύρωση: καμία |
| Data lake (Eurobarometer, Eurostat) | `.synthetic-lab-data/lake/` | ανά πηγή | Συγκεντρωτικά |
| Metron/GPO (Phase 7A) | ιδιωτικά | μόνο εσωτερική αξιολόγηση | Όχι αναδημοσίευση |

## 4. Consumer Choice Engine: περιορισμοί

- **Εκπαίδευση:** μόνο σε ξένα δεδομένα (Ελβετία 2021-22, ΗΠΑ 2019/2022).
- **Μεταφορά σε ελληνικό πληθυσμό:** μόνο μέσω `experimental_transfer_mode`, με σήμανση `EXPERIMENTAL_CROSS_COUNTRY_TRANSFER`.
- **Κάλυψη:** δεν καλύπτει επισκευή ή αντικατάσταση, trade-in, εγγύηση, δόσεις, κανάλι, παράδοση συσκευών, ούτε εμπιστοσύνη ή εξυπηρέτηση πελατών.
- **Το μοντέλο refurbished (CC BY-NC)** δεν επιτρέπεται σε εμπορικά παραδοτέα.

## 5. Pipelines εκτέλεσης ερωτηματολογίων

- **TS `runSurvey`** (`lib/synthetic-lab/engine/survey.ts`):
  - responders `demo`, `evidence`, `persona` (pie), `llm`·
  - guardrails και planner.
  - Τα ερωτηματολόγια είναι TS objects ή JSON του UI· δεν υποστηρίζεται YAML.
- **Python (ad hoc ανά μελέτη):**
  - `scripts/synthetic-lab/consumer-decision/`·
  - `models/consumer-choice-engine/studies/greece500/`.
  - Κάθε μελέτη έχει δικό της runner· δεν υπάρχει γενικός μηχανισμός ερωτηματολογίου, skip logic ή checkpoint.

## 6. Μηχανισμοί αναφορών

- **CSV:** `lib/synthetic-lab/csv.ts` και pandas ανά μελέτη.
- **HTML → PDF:** Python generators με SVG γραφήματα και Playwright Chromium:
  - `scripts/synthetic-lab/consumer-decision/cd_report.py`·
  - `models/consumer-choice-engine/studies/greece500/report.py`·
  - `render_pdf.cjs`.
  - Τα CSS είναι επαναχρησιμοποιήσιμα (`report.css`).

## 7. Εξαρτήσεις και περιβάλλον

| Στοιχείο | Κατάσταση |
|---|---|
| Python | 3.13: numpy, scipy, pandas, pyyaml, jsonschema, requests. **Όχι** pyarrow, fastparquet, anthropic, openai, google-genai. |
| Node | Playwright + Chromium (προεγκατεστημένα), vitest, `@anthropic-ai/sdk`, `openai` (npm) |
| API keys | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`: **δεν έχουν οριστεί** |
| Δίκτυο | Διαθέσιμο μέσω proxy (Eurostat, World Bank προσβάσιμα) |

**Συνέπειες για την υλοποίηση**

- Το Parquet γράφεται μόνο αν εγκατασταθεί pyarrow. Μέχρι τότε χρησιμοποιείται συμπιεσμένο CSV με το ίδιο schema, και το manifest καταγράφει τη μορφή.
- Οι πραγματικοί LLM providers ενεργοποιούνται μόλις εγκατασταθεί το SDK τους και οριστεί το key. Τα tests και τα dry runs χρησιμοποιούν mock provider.

## 8. Baseline tests (πριν από κάθε αλλαγή)

| Σουίτα | Εντολή | Αποτέλεσμα |
|---|---|---|
| Lab (TypeScript) | `npx vitest run` | **15 αρχεία, 149/149 PASS** (24,1 s) |
| CCE 0.1 | `python3 -I models/consumer-choice-engine/tests/run_tests.py` | **9/9 PASS** |

## 9. Αναφορά Brand Intelligence Κωτσόβολου

Αναζητήθηκε στο repository και στο σύστημα αρχείων (`κωτσόβολ`, `kotsovolos`, `brand intelligence`). **Δεν βρέθηκε.**

Το πιλοτικό ερωτηματολόγιο βασίζεται μόνο στις ερευνητικές ενότητες του αιτήματος. Δεν χρησιμοποιείται κανένα ποσοστό sentiment. Ο μηχανισμός ελέγχου «μη αντιγραφής» (QC) δέχεται τέτοια ποσοστά ως είσοδο, όταν η αναφορά προστεθεί.

## 10. Αρχιτεκτονική απόφαση για την v2.0

Νέο, ανεξάρτητο Python package **`research-engine/ase/`**. Πλεονεκτήματα:

- αξιοποιεί τα πλήρη αρχεία GLOPOP-S, τους ίδιους επίσημους στόχους και τους ίδιους ορισμούς μεταβλητών με τον TS πληθυσμό·
- καλεί την CCE μέσω της υπάρχουσας πύλης της·
- δεν τροποποιεί κανένα υπάρχον module.

Οι μελέτες αποθηκεύονται στο `studies/<study_id>/` με διαχωρισμό `internal/` και `deliverables/`.
