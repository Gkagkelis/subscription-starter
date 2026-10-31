# Tests αποδοχής (ενότητα 17 του αιτήματος) — κατάσταση με αποδείξεις

Εκτέλεση: `python3 -I research-engine/tests/run_tests.py` → **53/53 πέρασαν** · `npx vitest run` → **149/149** (2026-10-31).
Τα tests που χρειάζονται ιδιωτικά δεδομένα (lake, PIE, λήψεις Eurostat) δηλώνουν BLOCKED αν λείπουν· εδώ τα δεδομένα υπήρχαν, οπότε έτρεξαν πραγματικά. Δεν πρόκειται για mocks.
Αρχεία: `research-engine/tests/test_integration.py` (ενοποίηση), `test_e2e.py`, `test_completes.py`, `test_llm_runtime.py`, `test_questionnaire.py`, `test_sources.py`, `test_panel.py`, `test_calibration.py`.

| # | Κριτήριο | Κατάσταση | Απόδειξη |
|---|---|---|---|
| 1 | Κοινή ταυτότητα και ιστορικό TS–Python | **PASS** | `test_shared_identity_lab_and_ai_in_same_study`: στην ίδια μελέτη το Lab απαντά E1 = άγκυρα econ4 του ίδιου προσώπου και το AI βλέπει την ίδια κατάσταση στο prompt |
| 2 | Πραγματικές τιμές από το lake | **PASS** | `test_lake_values_are_real_and_crosschecked`: τιμή lake = τιμή επίσημου API (π.χ. 8,78%)· στο σχέδιο Κωτσόβολου `lake_crosscheck` = MATCH για I_BEEQU1/I_BHARD1. Σημείωση: η τιμή που εφαρμόζεται έρχεται από τη λήψη Eurostat· το lake χρησιμοποιείται για ανάκτηση υποψηφίων και διασταύρωση |
| 3 | Γενική ερώτηση μέσα σε ερωτηματολόγιο μάρκας βρίσκει γενικά τεκμήρια | **PASS** | `test_kotsovolos_plan_generic_vs_brand_and_option_level` (S1, Q1, Q10, Q13, Q28, Q29 με συνιστώσες) |
| 4 | Ερώτηση εμπιστοσύνης μάρκας δεν κληρονομεί γενικό ποσοστό | **PASS** | ίδιο test (Q6–Q9, Q22, Q25: `brand_dependent`, χωρίς εμπειρικές συνιστώσες)· πιλοτική: 0 εμπειρικές γραμμές σε ερωτήσεις μάρκας |
| 5 | Πηγή Eurostat εκτός PIE ανακαλύπτεται | **PASS** | `test_missed_eurostat_discoverable_and_false_matches_rejected` |
| 6 | Ψευδείς σημασιολογικές ταυτίσεις απορρίπτονται με λόγο | **PASS** | ίδιο test· `lake_candidates[].reason` στο σχέδιο |
| 7 | Μία ερώτηση με εμπειρική και AI συνιστώσα | **PASS** | Q1: επιλογές 2/3/4/7 περιορίζονται εμπειρικά, οι υπόλοιπες μένουν AI (`option_modes`)· test #3 και πιλοτική |
| 8 | Κατανομές single choice συνεκτικές και κανονικοποιημένες | **PASS** | `test_bounds_keep_coherent_distributions` |
| 9 | Εξαρτήσεις και περιορισμοί πολλαπλής επιλογής | **PASS** | `test_conditions_and_validation` (αποκλειστική επιλογή, min/max)· `test_full_pipeline_and_audit_completeness` |
| 10 | Κατάταξη, αριθμητική, ανοιχτή, DCE | **PASS** | `test_full_pipeline_and_audit_completeness`· πιλοτική (Q4 κατάταξη, Q3/Q15/Q22 αριθμητικές, Q26 ανοιχτή, Q17 DCE) |
| 11 | Ασυμφωνία πληθυσμού/χρόνου υποβαθμίζει ή απορρίπτει | **PASS** | `test_suitability_downgrades_and_error_semantics` |
| 12 | Διεθνή στοιχεία όχι ως ελληνικά χωρίς αξιολόγηση μεταφοράς | **PASS** | `test_transport_validated_and_international_not_greek` |
| 13 | Γνήσια μοντελοποίηση διεθνούς σχέσης | **PASS** | PP-logit με LOCO σε ΕΕ-27 (`transport_loco.json`)· π.χ. I_BEEQU1/ηλικία MAE 1,70 έναντι 4,02 (B0) και 4,02 (B1)· τα μεταφερμένα κελιά (75+) μπαίνουν στο μοντέλο ανά πρόσωπο |
| 14 | Μη υποστηριζόμενες υποθέσεις μεταφοράς εμφανίζονται | **PASS** | `validate-transport`: ΑΠΟΡΡΙΨΗ για I_BSPD1, I_BWDN1, I_IUIF (φύλο)· `transported_cells` και απορρίψεις στο σχέδιο |
| 15 | Η ελλείπουσα βάση μάρκας δεν επινοείται | **PASS** | `brand.baseline_evidence: none` στο `evidence_map.yaml`· `test_synthetic_label_on_every_output_and_brand_sensitivity_in_report`· `sensitivity.json` της πιλοτικής |
| 16 | Καμία μη επικυρωμένη σταθερή στάθμιση | **PASS** | `test_no_default_fixed_hybrid_weight`· `test_cce_adapter_modes` (C_HYBRID μόνο με `validation_ref`) |
| 17 | Λογική συνέπεια του ίδιου προσώπου | **PASS** | QC «Αντιφατικές απαντήσεις» PASS στην πιλοτική· κανόνες συνέπειας στο ερωτηματολόγιο· ιστορικό με κείμενο ερώτησης (`test_history_shows_question_text`, διόρθωση από την πιλοτική) |
| 18 | Screening και quotas | **PASS** | `test_skip_logic_screening_and_answer_nature`, `test_panel_*`, `test_general_population_replaces_within_same_cell` |
| 19 | Ολοκληρωμένα ≠ αρχικά προφίλ ≠ αποκλεισμοί | **PASS** | `test_natural_incidence_reaches_exact_completes_with_replacements`· πιλοτική: 15 προφίλ, 13 COMPLETE, 2 SCREENED_OUT |
| 20 | Αποτυχία ανάκτησης ≠ απουσία τεκμηρίων | **PASS** | `test_retrieval_failure_is_not_absence` |
| 21 | Ελλείποντα δεδομένα και μη διαθέσιμες πηγές με ρητή συμπεριφορά | **PASS** | `test_suitability_downgrades_and_error_semantics` (UNAVAILABLE_SOURCE / RETRIEVAL_ERROR)· `global-ingest`: ESS/WVS «blocked» με αιτιολογία |
| 22 | Checkpoint/resume χωρίς διπλές ολοκληρώσεις | **PASS** | `test_resume_after_interruption_matches_uninterrupted`, `test_completes_with_session_provider_survive_pending_rounds`· πιλοτική με 12 διαδοχικά resume |
| 23 | Ακύρωση cache σε αλλαγή δεδομένων/μοντέλου/config | **PASS** | `test_bridge_cache_keys_and_typed_errors` (κλειδί από αποτύπωμα κώδικα/μοντέλου/πολιτικής)· το ευρετήριο lake έχει αποτύπωμα (`meta.fingerprint`), αλλά η ανακατασκευή του δεν καλύπτεται από ξεχωριστό test |
| 24 | Η γέφυρα συνεδρίας δίνει έγκυρες απαντήσεις και χειρίζεται λάθη | **PASS** | `test_claude_session_provider_rounds_import_and_history`, `test_invalid_schema_then_valid_is_retried_and_logged`· πιλοτική: 158/158 έγκυρες, 0 απορρίψεις |
| 25 | Λειτουργεί χωρίς πληρωμένο API key | **PASS** | πιλοτική μέσω `claude_session` (κόστος `null`)· όλα τα tests χωρίς key· `test_paid_provider_requires_confirmation_and_budget_stops_run` |
| 26 | Η επικύρωση holdout δεν διαρρέει στόχους | **PASS (μεταφορά) / BLOCKED (απαντήσεις AI)** | Στη LOCO η χώρα-στόχος αποκλείεται από την εκτίμηση. Για το επίπεδο AI του Κωτσόβολου δεν υπάρχει ανεξάρτητο holdout με ίδιες ερωτήσεις· τα P7A είναι εκτεθειμένα σε διαρροή (δημοσιευμένα αποτελέσματα πριν από την ημερομηνία γνώσης του μοντέλου) και δεν χρησιμοποιήθηκαν |
| 27 | Οι αναφορές επικύρωσης δεν επινοούν μετρικές | **PASS** | οι μετρικές μεταφοράς υπολογίζονται από τα αρχεία (`transport_loco_rows.csv.gz`)· όπου δεν υπάρχει benchmark, η έννοια δηλώνεται «μη επικυρωμένη» (GUIDE_GR §4) |
| 28 | Οι αναφορές δεν παρουσιάζονται ως πραγματική έρευνα | **PASS** | `test_report_disclosure_charts_and_export_isolation`, `test_synthetic_label_on_every_output_and_brand_sensitivity_in_report` (ετικέτα σε HTML, CSV, ατομικές γραμμές, manifest, ευαισθησία· υποσέλιδο PDF) |
| 29 | Δεν αντικαθίστανται υπάρχουσες λειτουργίες και πιλοτικές | **PASS** | `test_session_ai_15_milestone_intact`· νέο run_id `pilot_int_15`· production `pie-0.2` αμετάβλητο· vitest 149/149 |
| 30 | Ο Κωτσόβολος εκτελείται από άκρη σε άκρη σε πιλοτική | **PASS** | `studies/kotsovolos_trust_2026/internal/runs/pilot_int_15/` + `PILOT_REPORT.md` |
| 31 | Εξαγωγές/αναφορές με πλήρη προέλευση και περιορισμούς | **PASS** | εσωτερικά: `inference_mode` / `evidence_components` / `brand_dependent` ανά γραμμή, `evidence_coverage.csv`, `evidence_plan_used.json`, `sensitivity.json`. Πελάτη: μεθοδολογία και ενότητα ευαισθησίας, χωρίς ετικέτες ανά ερώτηση (απόφαση του χρήστη) |
| 32 | Regression tests μετά την ενοποίηση | **PASS** | 53/53 + 149/149 |

## Τι ΔΕΝ ολοκληρώθηκε

- **Πλήρης εκτέλεση Κωτσόβολου: BLOCKED.** Η βάση δείγματος (αρχικά προφίλ ή ολοκληρωμένα) δεν έχει οριστεί στο config· την είχε κρατήσει ο χρήστης για τον εαυτό του. Επιπλέον, ~5.300 αιτήματα συνεδρίας είναι μεγάλη λειτουργία που θέλει έγκριση. Λεπτομέρειες και εντολή συνέχειας στο `PILOT_REPORT.md`.
- **Επικύρωση απαντήσεων AI έναντι πραγματικών δεδομένων: BLOCKED.** Δεν υπάρχει ανεξάρτητο holdout για τις έννοιες της μελέτης.
- **EC Consumer Conditions Survey: queued.** Χειροκίνητη λήψη· θα έδινε στενότερα όρια για παράδοση και παράπονα.
- **ESS / WVS / ICPSR: blocked.** Απαιτούν εγγραφή ή αποδοχή όρων· δεν γίνεται παράκαμψη.
