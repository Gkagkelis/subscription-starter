# Ενοποίηση Lab + ASE — Manifest εκτέλεσης (ζωντανό αρχείο)

Το αρχείο ενημερώνεται σε κάθε φάση. Αν η εργασία διακοπεί, η συνέχεια ξεκινά από την πρώτη φάση που δεν είναι DONE.
Κάθε φάση γράφει τα δικά της αρχεία, ώστε να μπορεί να ξανατρέξει χωρίς να χαλάσει ό,τι προηγήθηκε.

| Φάση | Περιεχόμενο | Κατάσταση | Παραδοτέα / εντολή συνέχειας |
|---|---|---|---|
| 1 | Έλεγχος repo και δεδομένων | DONE | `docs/architecture/integration/AUDIT.md` |
| 2 | Κοινή ταυτότητα και κατάσταση ερωτώμενου | DONE | `scripts/synthetic-lab/bridge/lab_bridge.ts`, `research-engine/ase/lab/bridge.py`, `Study.with_lab_state` (commit `e67077b`) |
| 3 | Ελληνικό lake στο inference (ευρετήριο, ανάκτηση, πύλη καταλληλότητας) | DONE | `ase/evidence/{lake_index,interpret,suitability,plan}.py` · `ase_cli.py evidence-index` / `evidence-plan` (commit `f1c71c7`) |
| 4 | Υβριδικός ενορχηστρωτής (ερώτηση/επιλογή) | DONE | `ase/respond/orchestrator.py`, `runner.py` (commit `f1c71c7`) |
| 5 | Διεθνές επίπεδο τεκμηρίωσης | DONE (αρχικό σύνολο) | `config/global_sources.yaml`, `ase/global_evidence/eurostat.py` · `ase_cli.py global-ingest` |
| 6 | Μεταφερσιμότητα μεταξύ χωρών | DONE | `ase/transport/pooling.py` (PP-logit) |
| 7 | Επικύρωση και ευαισθησία | DONE (μεταφορά) · BLOCKED (απαντήσεις AI: δεν υπάρχει holdout) | `ase/validation/transport.py` · `ase_cli.py validate-transport` · `ase/analysis/sensitivity.py` |
| 8 | Πιλοτική εκτέλεση Κωτσόβολου | DONE | `studies/kotsovolos_trust_2026/internal/runs/pilot_int_15/PILOT_REPORT.md` |
| 9 | Πλήρης εκτέλεση Κωτσόβολου | **BLOCKED** | Βάση δείγματος μη ορισμένη (`sample_size_basis` μόνο σε σχόλιο) + έγκριση για ~5.300 αιτήματα συνεδρίας. Εντολή συνέχειας στο `PILOT_REPORT.md` |

Αποδοχή: `docs/architecture/integration/ACCEPTANCE.md` (32 κριτήρια). Οδηγός και runbook: `docs/architecture/integration/GUIDE_GR.md`.

**Περιορισμοί περιβάλλοντος**

| Πόρος | Τιμή |
|---|---|
| Ελεύθερος δίσκος | ~6,7 GB |
| Μνήμη | 15 GB |
| Πυρήνες | 4 |
| Πάροχος AI | μόνο η συνεδρία Claude Code, μέσω του αρχειακού bridge `claude_session` |
| API key πληρωμένου παρόχου | δεν υπάρχει και δεν χρησιμοποιείται |
| Δίκτυο | Eurostat API διαθέσιμο (HTTP 200, 2026-10-31) |
