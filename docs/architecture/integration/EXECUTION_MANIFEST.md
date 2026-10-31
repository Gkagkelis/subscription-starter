# Ενοποίηση Lab + ASE — Manifest εκτέλεσης (ζωντανό αρχείο)

Το αρχείο ενημερώνεται σε κάθε φάση. Αν η εργασία διακοπεί, η συνέχεια ξεκινά από την πρώτη φάση που δεν είναι DONE.
Κάθε φάση γράφει τα δικά της αρχεία, ώστε να μπορεί να ξανατρέξει χωρίς να χαλάσει ό,τι προηγήθηκε.

| Φάση | Περιεχόμενο | Κατάσταση | Παραδοτέα / εντολή συνέχειας |
|---|---|---|---|
| 1 | Έλεγχος repo και δεδομένων | DONE | `docs/architecture/integration/AUDIT.md` |
| 2 | Κοινά συμβόλαια, κανονική κατάσταση ερωτώμενου | — | `research-engine/ase/contracts.py` |
| 3 | Ελληνικό lake στο inference (ευρετήριο, ανάκτηση, έλεγχος καταλληλότητας) | — | `research-engine/ase/evidence/lake_index.py`, `suitability.py`, `ase_cli.py evidence-index` |
| 4 | Υβριδικός ενορχηστρωτής (ερώτηση/επιλογή) | — | `research-engine/ase/respond/orchestrator.py` |
| 5 | Διεθνές επίπεδο τεκμηρίωσης | — | `research-engine/ase/global_evidence/`, `ase_cli.py global-ingest` |
| 6 | Μεταφερσιμότητα μεταξύ χωρών | — | `research-engine/ase/transport/` |
| 7 | Επικύρωση | — | `research-engine/ase/validation/`, `ase_cli.py validate-transport` |
| 8 | Πιλοτική εκτέλεση Κωτσόβολου | — | `studies/kotsovolos_trust_2026/internal/runs/<pilot>` |
| 9 | Πλήρης εκτέλεση Κωτσόβολου | — | βλ. πύλες εκτέλεσης |

**Περιορισμοί περιβάλλοντος**

| Πόρος | Τιμή |
|---|---|
| Ελεύθερος δίσκος | ~6,7 GB |
| Μνήμη | 15 GB |
| Πυρήνες | 4 |
| Πάροχος AI | μόνο η συνεδρία Claude Code, μέσω του αρχειακού bridge `claude_session` |
| API key πληρωμένου παρόχου | δεν υπάρχει και δεν χρησιμοποιείται |
| Δίκτυο | Eurostat API διαθέσιμο (HTTP 200, 2026-10-31) |
