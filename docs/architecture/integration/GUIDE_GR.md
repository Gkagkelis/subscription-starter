# Ενοποιημένο Greek Synthetic Research Lab — αρχιτεκτονική και οδηγός χρήσης

**ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ.** Ό,τι παράγει το σύστημα είναι προσομοίωση με συνθετικά προφίλ. Δεν αντικαθιστά δειγματοληπτική έρευνα.

Εκδόσεις: ASE `ase-2.1.0` · prompt `ase-prompt-1.3` · γέφυρα Lab `lab-bridge-1` · PIE `pie-0.7` (staged· το production `pie-0.2` δεν αλλάζει).

---

## 1. Πώς δένουν τα κομμάτια

```
ερωτηματολόγιο (YAML) ─► ερμηνεία ερώτησης (ase/evidence/interpret.py: έννοιες, μάρκα, μέτρηση, χρονικός ορίζοντας)
                           │
     ┌─────────────────────┼──────────────────────────────┬───────────────────────────────┐
     ▼                     ▼                              ▼                               ▼
 Lab (TS) μέσω γέφυρας   ευρετήριο ελληνικού lake      δηλωμένες σχέσεις μέτρησης     διεθνές επίπεδο
 route/anchors/answer    (ase/evidence/lake_index.py)  (studies/<id>/evidence_map.yaml) (ase/global_evidence, ase/transport)
     │                     │ πύλη καταλληλότητας          │ πύλη καταλληλότητας            │ LOCO επικύρωση
     └──────────┬──────────┴───────────────┬──────────────┴───────────────┬───────────────┘
                ▼                          ▼                              ▼
         Σχέδιο τεκμηρίωσης ανά ερώτηση/επιλογή (ase/evidence/plan.py → internal/evidence_plan.json)
                                           │
                                           ▼
         Ενορχηστρωτής (ase/respond/orchestrator.py) μέσα στον runner (ase/respond/runner.py)
           A_EMPIRICAL · C_EVIDENCE_CONSTRAINED · C_EVIDENCE_INFORMED · D_AI · PROFILE · SKIP
                                           │
                                           ▼
         audit ανά γραμμή (inference_mode, evidence_components, brand_dependent) → QC → αναφορά/εξαγωγές
```

### Κοινή ταυτότητα ερωτώμενου
- Το ASE είναι η **μόνη πηγή αλήθειας**: `respondent_id`, εγγραφή πλαισίου GLOPOP (`frame_record`), δημογραφικά, ιστορικό απαντήσεων.
- Η γέφυρα (`scripts/synthetic-lab/bridge/lab_bridge.ts`, Python: `research-engine/ase/lab/bridge.py`) καλεί τη `generateAnchors` του Lab με τα δημογραφικά του ASE. Επιστρέφει τις άγκυρες PIE: απασχόληση, εισόδημα, οικονομική κατάσταση, τάξη, ιδεολογία κ.λπ.
- Οι άγκυρες αποθηκεύονται ανά (respondent_id, frame_record) στο `internal/respondent_state/lab_anchors_pie-0_7` και μπαίνουν ως στήλες `lab_*` στο προφίλ.
- Το AI βλέπει τρεις από αυτές (`lab.prompt_anchors`, προεπιλογή: emp, econ4, class3) ως «Εκτιμώμενα χαρακτηριστικά … ΟΧΙ γνωστά στοιχεία».
- Όταν μια ερώτηση απαντάται από το Lab, απαντά **το ίδιο πρόσωπο** με τις ίδιες άγκυρες.

### Τρόποι εξαγωγής απάντησης (ανά ερώτηση και ανά επιλογή)
| Τρόπος | Πότε | Τι κάνει |
|---|---|---|
| `A_EMPIRICAL` | Το Lab δίνει βαθμίδα 1–4 χωρίς αποχή | Απάντηση PIE για το συγκεκριμένο πρόσωπο |
| `C_EVIDENCE_CONSTRAINED` | Δηλωμένο `lower_bound` / `lower_bound_union` με κλάση DIRECT_EMPIRICAL | Πρώτα κρίνει το AI. Μετά εφαρμόζεται ελάχιστο εμπειρικό όριο ανά πρόσωπο με την ελάχιστη αλλαγή, και καταγράφονται οι τιμές πριν/μετά. |
| `C_EVIDENCE_INFORMED` | Δηλωμένο `proxy` | Στο prompt μπαίνει η τιμή της ομάδας του προσώπου, ως «συγγενής μέτρηση — μην τη μετατρέπεις σε πιθανότητα» |
| `D_AI` | Κανένα κατάλληλο τεκμήριο | Το AI κρίνει από το προφίλ, το ιστορικό και το σενάριο |
| `PROFILE` / `SKIP` | Δημογραφικά / skip logic | Χωρίς AI |

**Καμία σταθερή στάθμιση AI–δεδομένων.** Η ποσοτική μείξη (`C_HYBRID` / `E_VALIDATED_HYBRID`) επιτρέπεται μόνο αν το config έχει `hybrid: {weight, validation_ref}` και το αρχείο επικύρωσης υπάρχει. Διαφορετικά, τα δεδομένα μπαίνουν μόνο ως όριο ή ως πλαίσιο.

### Ανάκτηση από το ελληνικό lake
- Ευρετήριο SQLite/FTS5: `.synthetic-lab-data/ase/lake_index.sqlite` (~570 MB). Κάνει δική του κανονικοποίηση, γιατί το FTS5 δεν αφαιρεί τους ελληνικούς τόνους. Πρόσβαση με ευρετήριο, χωρίς να φορτώνεται όλο το lake στη μνήμη.
- Η αναζήτηση γίνεται **ανά έννοια**, όχι ανά λέξη: `research-engine/config/constructs.yaml` έχει ελληνικούς/αγγλικούς όρους και «πτυχές» που πρέπει να ταιριάζουν όλες.
- **Πύλη καταλληλότητας** (`ase/evidence/suitability.py`). Ελέγχει:
  - κοινή κύρια έννοια·
  - μονάδα/τύπο μέτρησης·
  - χρονικό ορίζοντα και επικαιρότητα·
  - πληθυσμό/παρονομαστή·
  - μάρκα·
  - προέλευση.

  Η αυτόματη ανάκτηση φτάνει **το πολύ** σε CONTEXTUAL_EVIDENCE. Εμπειρική χρήση γίνεται μόνο με ρητή σχέση στο `evidence_map.yaml`.
- Κλάσεις: DIRECT_EMPIRICAL · TRANSPORTABLE_EMPIRICAL · CONTEXTUAL_EVIDENCE · INSUFFICIENT_EVIDENCE · RETRIEVAL_ERROR · UNAVAILABLE_SOURCE. Η αποτυχία ανάκτησης **δεν** σημαίνει απουσία τεκμηρίων: καταγράφεται ως σφάλμα (`LakeUnavailable` → `lake_error`).
- Ερώτηση μάρκας (`brand_terms` στο `constructs.yaml`): **ποτέ** δεν κληρονομεί γενικό ποσοστό. Χρησιμοποιείται ανάλυση ευαισθησίας.

### Διεθνές επίπεδο και μεταφορά
- Κατάλογος: `research-engine/config/global_sources.yaml`, με άδεια, πρόσβαση, προτεραιότητα και κατάσταση (ingested / queued / blocked με αιτιολογία).
- Λήψη Eurostat (JSON-stat, EU-27, 2021–2025): `ase/global_evidence/eurostat.py` → `.synthetic-lab-data/ase/global/eurostat/<dataset>/` με manifest, συνέχιση λήψης και έλεγχο δίσκου.
- Μεταφορά (`ase/transport/pooling.py`, PP-logit): η απόκλιση της υποομάδας από το εθνικό σύνολο, σε logit, σταθμίζεται κατά την ομοιότητα των χωρών.
- Επικύρωση (`ase/validation/transport.py`): leave-one-country-out σε όλη την ΕΕ-27, έναντι B0 (εθνικό σύνολο) και B1 (μέσος όρος άλλων χωρών).
  - Μια οικογένεια (ηλικία / φύλο / εκπαίδευση) εγκρίνεται **μόνο αν είναι καλύτερη και από τις δύο**.
  - Αποτελέσματα: `.synthetic-lab-data/ase/validation/transport_loco.json`.
  - Απορρίφθηκαν: I_BSPD1, I_BWDN1 και I_IUIF για το φύλο.
- Μεταφερμένο κελί χρησιμοποιείται μόνο όταν λείπει το ελληνικό κελί και η οικογένεια έχει εγκριθεί. Μειώνεται κατά το MAE της επικύρωσης και καταγράφεται ως «εκτίμηση μεταφοράς».

### Εμπειρικά όρια ανά πρόσωπο
- `ase/evidence/bounds.py`: τα ελληνικά περιθώρια (ηλικία, φύλο, εκπαίδευση) μετατρέπονται σε μοντέλο ανά πρόσωπο. Η μέθοδος είναι IPF με απόσβεση, πάνω σε αθροισμένα κελιά του πλαισίου.
- Το μοντέλο χρησιμοποιείται μόνο αν το μέγιστο σφάλμα περιθωρίων είναι ≤ 1,5 μονάδα. Διαφορετικά υποβαθμίζεται και δεν εφαρμόζεται.

---

## 2. Εντολές (όλες από τη ρίζα του repo)

| Σκοπός | Εντολή |
|---|---|
| Ευρετήριο lake (μία φορά· ξαναχτίζεται αν αλλάξει το lake) | `python3 -I research-engine/ase_cli.py evidence-index [--force]` |
| Λήψη διεθνών πηγών | `python3 -I research-engine/ase_cli.py global-ingest` |
| Επικύρωση μεταφοράς | `python3 -I research-engine/ase_cli.py validate-transport` |
| Σχέδιο τεκμηρίωσης μελέτης | `python3 -I research-engine/ase_cli.py evidence-plan studies/<id> [--no-lab]` |
| Έλεγχος ερωτηματολογίου | `python3 -I research-engine/ase_cli.py validate studies/<id>` |
| Εκτίμηση όγκου | `python3 -I research-engine/ase_cli.py estimate studies/<id> --provider claude_session --batching per_block` |
| Δοκιμαστική εκτέλεση (preview) | `python3 -I research-engine/ase_cli.py dry-run studies/<id> --provider claude_session --n 15 --batching per_block --resume <run_id>` |
| Πλήρης εκτέλεση | `python3 -I research-engine/ase_cli.py run studies/<id> --provider claude_session --batching per_block --resume <run_id>` |
| Κατάσταση / εισαγωγή απαντήσεων συνεδρίας | `… session-status studies/<id> --run <run_id>` · `… session-import studies/<id> --run <run_id>` |
| Αναφορά + CSV + PDF + κάλυψη + ευαισθησία | `python3 -I research-engine/ase_cli.py report studies/<id> --run <run_id>` |
| Ευαισθησία μόνο | `python3 -I research-engine/ase_cli.py sensitivity studies/<id> --run <run_id>` |
| Εξαγωγή παραδοτέων | `python3 -I research-engine/ase_cli.py export studies/<id> <φάκελος>` |
| Tests | `python3 -I research-engine/tests/run_tests.py` και `npx vitest run` |

### Κύκλος συνεδρίας (πάροχος `claude_session`, χωρίς API)
1. Η `dry-run`/`run` γράφει αιτήματα στο `internal/runs/<run_id>/session/pending/` και σταματά με «ΑΝΑΜΟΝΗ» (exit 3).
2. Η συνεδρία Claude Code γράφει απαντήσεις στο `session/inbox/<key>.json`, ελέγχοντάς τες με το schema κάθε αιτήματος.
3. Το `session-import` τις ελέγχει. Οι λανθασμένες πάνε στο `rejected/` και ξαναζητούνται.
4. Ξανά η ίδια εντολή με `--resume <run_id>`. Επαναλαμβάνεται μέχρι να μη μένουν αιτήματα (~1 γύρος ανά block).

### Συνέχεια μετά από διακοπή
- Κάθε run έχει `checkpoint.jsonl` και `execution_manifest.json`. Η ίδια εντολή με `--resume <run_id>` συνεχίζει χωρίς διπλές ολοκληρώσεις (test `test_resume_after_interruption_matches_uninterrupted`).
- Η γέφυρα Lab κάνει cache στο `.synthetic-lab-data/ase/cache/lab/`, με κλειδί το αποτύπωμα κώδικα/μοντέλου/πολιτικής/εισόδου. Όταν αλλάξει κάτι, το cache ακυρώνεται μόνο του.

---

## 3. Συνήθεις εργασίες

### Νέο ερωτηματολόγιο
1. `python3 -I research-engine/ase_cli.py init-study studies/<id> --id <id> --title "…" --sample-size <N>`
2. Γράψτε το `questionnaire.yaml` (τύποι: single_choice, multiple_choice, likert, numeric, ranking, open, scenario, dce· skip logic με `condition`· screening με `terminate_if`).
3. `validate` → `evidence-plan` → διαβάστε το `internal/evidence_plan.json`. Ο τρόπος ανά ερώτηση δεν είναι απόφαση του ερευνητή: είναι συνέπεια των τεκμηρίων.
4. (Προαιρετικά) `evidence_map.yaml` μόνο για **τεκμηριωμένες** σχέσεις μέτρησης, με αιτιολόγηση.
5. Μικρό `dry-run` → έλεγχος QC/κάλυψης → απόφαση για τη βάση δείγματος (`sample_size_basis`) → `run`.

### Νέο εμπειρικό dataset
- **Ελληνικό, μέσα στο lake**: προσθέστε το στο lake με τα υπάρχοντα εργαλεία του lake και ξαναχτίστε με `evidence-index --force`. Το αποτύπωμα αλλάζει, οπότε τα σχέδια ξαναχτίζονται.
- **Διεθνές, μέσω Eurostat API**: προσθέστε εγγραφή στο `config/global_sources.yaml` (`access: eurostat_api`, dataset, indicators, units, licence) και τρέξτε `global-ingest`.
- **Πηγή που απαιτεί εγγραφή ή όρους** (ESS, WVS, ICPSR): `status: blocked` με αιτιολογία. Δεν γίνεται παράκαμψη.
- Για χρήση σε μελέτη: συνιστώσα στο `evidence_map.yaml`. Θα περάσει από την πύλη. Αν απορριφθεί, ο λόγος γράφεται στο σχέδιο.

### Επικύρωση νέας έννοιας
- Για μεταφορά μεταξύ χωρών: προσθέστε `(dataset, indicator, unit)` στο `SPECS` του `ase/validation/transport.py` και τρέξτε `validate-transport`. Η έγκριση είναι αυτόματη μόνο αν το PP-logit νικά και τη B0 και τη B1.
- Για απαντήσεις AI: απαιτούνται πραγματικά δεδομένα έρευνας με ίδια ερώτηση (`import-real` → `compare` → `calibrate`, με ελάχιστο n). Χωρίς αυτά, η έννοια μένει **μη επικυρωμένη** και δηλώνεται έτσι.

### Αναπαραγωγή της πιλοτικής Κωτσόβολου
Βλ. `studies/kotsovolos_trust_2026/internal/runs/pilot_int_15/PILOT_REPORT.md`. Οι απαντήσεις της συνεδρίας είναι αποθηκευμένες στο `session/answers/`, οπότε το `--resume pilot_int_15` αναπαράγει το run χωρίς νέες κλήσεις.

---

## 4. Ερμηνεία, αβεβαιότητα και όρια

- **Τι σημαίνουν τα ποσοστά**: περιγράφουν το συνθετικό πάνελ. Δεν είναι εκτιμήσεις πληθυσμού και δεν έχουν περιθώριο σφάλματος δειγματοληψίας.
- **Πηγές αβεβαιότητας, ξεχωριστά** (όχι ενιαίο «σκορ»):

| Πηγή | Πώς αποτυπώνεται |
|---|---|
| δειγματοληψία πάνελ | απόκλιση quotas στο `panel_report.json` |
| εμπειρική εκτίμηση | σφάλμα περιθωρίων μοντέλου ανά πρόσωπο |
| μεταφορά | MAE της LOCO ανά οικογένεια |
| ελλείποντα | κελιά που λείπουν ή είναι σημασμένα «u» |
| προδιαγραφή μοντέλου | πύλη χρησιμότητας |
| μεταβλητότητα AI | έλεγχος επαναληψιμότητας στο QC |
| μη ταυτοποιημένη βάση μάρκας | ανάλυση ευαισθησίας ±0,5 / ±1 logit |

- **Ευαισθησία μάρκας**: δείχνει πόσο αλλάζει ένα συμπέρασμα αν η βάση της μάρκας είναι υψηλότερη ή χαμηλότερη. **Δεν** είναι διάστημα εμπιστοσύνης.
- **Πού βρίσκεται η προέλευση**: μόνο στο εσωτερικό audit (`individual_responses`, `evidence_coverage.csv`, `evidence_plan_used.json`). Η αναφορά πελάτη δεν έχει ετικέτες ανά ερώτηση.
- **Ετικέτα**: κάθε έξοδος (HTML/PDF σε κάθε σελίδα, results/crosstabs CSV, ατομικές γραμμές, manifest, κάλυψη, ευαισθησία) γράφει «ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ».

### Πειραματικά ή μη επικυρωμένα
- Οι απαντήσεις AI σε ερωτήσεις Κωτσόβολου: **καμία** δεν έχει επικυρωθεί έναντι πραγματικών δεδομένων.
- Το PIE `pie-0.7` (staged): βαθμίδα 4 = πειραματική.
- Τα όρια `lower_bound_union` υποθέτουν ανεξάρτητες επιλογές (Bernoulli).
- Η μεταφορά έχει επικυρωθεί μόνο για τους 8 δείκτες Eurostat του `SPECS`.

---

## 5. Αντιμετώπιση προβλημάτων

| Σύμπτωμα | Αιτία / λύση |
|---|---|
| `LakeUnavailable` / `lake_error` στο σχέδιο | Λείπει το ευρετήριο → `evidence-index`. Το σχέδιο ΔΕΝ θεωρεί ότι «δεν υπάρχουν τεκμήρια». |
| `LabUnavailable: MODEL_UNAVAILABLE` | Λείπει το μοντέλο PIE στο `.synthetic-lab-data/persona/models/<έκδοση>`. Οι ερωτήσεις A πέφτουν σε AI με καταγραφή στο `lab_errors`. |
| `SourceUnavailable` στη λήψη | Δίκτυο, δίσκος ή Eurostat. Η λήψη συνεχίζει από το manifest με την ίδια εντολή. |
| «ΑΝΑΜΟΝΗ» (exit 3) | Περιμένουν απαντήσεις συνεδρίας: `session-status`, απαντήσεις στο `inbox/`, `session-import`, `--resume`. |
| Απορρίψεις στο `session/rejected/` | Η απάντηση δεν ταιριάζει στο schema. Ξαναζητείται αυτόματα στον επόμενο γύρο. |
| `ValueError: … χρειάζεται ρητό μοντέλο (--model)` | Για παρόχους API δίνετε `--model`. Το `claude_session` δεν χρειάζεται. |
| Δίσκος γεμάτος | Σβήστε caches στο `.synthetic-lab-data/ase/cache/`. Το lake δεν το αγγίζετε. |
