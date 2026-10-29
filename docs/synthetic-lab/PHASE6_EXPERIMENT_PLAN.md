# Phase 6 — Σχέδιο πειραμάτων και σειρά υλοποίησης (Part M)

Κάθε στάδιο έχει **κανόνα απόφασης**. Ένα στάδιο προχωρά μόνο αν το προηγούμενο το δικαιολογεί.

| Στάδιο | Πείραμα | Σενάριο | Κανόνας απόφασης | Αποτέλεσμα |
|---|---|---|---|---|
| 0 | Έλεγχος repository και δεδομένων | `PHASE6_BASELINE_AUDIT.md`, `gpm_matrix.py` | επαλήθευση ισχυρισμών | ορισμένοι αριθμοί δεν επιβεβαιώθηκαν (4,6 εκατ. → 3,36 εκατ.) |
| 0 | Ταυτοποιησιμότητα | `gpm_identify.py` | κοινός χώρος μόνο όπου ταυτοποιείται | **μερικός** χώρος· αλυσίδες αναξιόπιστες |
| 0 | Καθαρό holdout | `gpm_holdout_fetch.py` | μόνο δεδομένα εκτός λίμνης/PDF | H6: 9 έρευνες, 509 ερωτήσεις |
| 1 | Personas A/B/C/D (Πρόβλημα 2) | `gpm_personas.py` | GPM στον runtime αν σφάλμα συσχετίσεων −10% χωρίς χειροτέρευση περιθωρίων > 0,5 π.μ. | **δεν ικανοποιήθηκε** |
| 1 | Υβριδικό δείγμα πελάτη | `gpm_hybrid.py` | GPM αν −10% έναντι rake/MRP | **δεν ικανοποιήθηκε**· σύσταση: rake/MRP |
| 2 | Διεθνής μεταφορά έναντι B5 | `gpm_transfer.py` | νέα μέθοδος αν −0,2 π.μ. με άνω όριο 80% < 0 | **δεν ικανοποιήθηκε** (−0,03) |
| 3 | Πολιτικό χρονικό μοντέλο | `polit_ssm.py` | διαστήματα αν κάλυψη 70–90%· σημεία αν MAE ≤ απλού μέσου | **μόνο διαστήματα** |
| 3 | Καταναλωτικό επίπεδο | `PHASE6_CONSUMER_GAPS.md` | κάλυψη μόνο όπου υπάρχουν ελληνικά δεδομένα | αποχή για μάρκες, συνδρομές, churn |
| 4 | Βαθμίδες και αποχή | `gpm_tiers.py`, `evidence-tier.ts` | κατώφλια από πραγματικά σφάλματα, όχι αυθαίρετα | Tier 2 (ελληνικά συγγενή) **μη επικυρωμένο** → αποχή |
| 4 | Runtime μικτού ερωτηματολογίου | `evidence-tier.ts`, `survey.ts`, `e2e_phase6.ts` | ακριβές N, σπόρος, κανόνες παράλειψης, συνέπεια προσώπου | `PHASE6_RESULTS.md` §H |
| 5 | Τυφλό τελικό H6 | `gpm_h6_predict.py` → κλείδωμα → `gpm_h6_score.py` | υποθέσεις H6.1–H6.4 (προκαταχώριση §5) | `PHASE6_RESULTS.md` §F |
| 6 | Πρόγραμμα πεδίου | `PHASE6_FIELDWORK_BLUEPRINT.md` | καμία ανάθεση χωρίς έγκριση | σχέδιο |

## Αναπαραγωγή

```bash
# Stage 0
python3 -I scripts/synthetic-lab/persona/gpm_matrix.py --root .
python3 -I scripts/synthetic-lab/persona/gpm_identify.py --root . --out .synthetic-lab-data/gpm/v1/identify.json
# Stage 1–3 (ανάπτυξη)
python3 -I scripts/synthetic-lab/persona/gpm_personas.py --root . --out .synthetic-lab-data/gpm/v1/personas-dev.json
python3 -I scripts/synthetic-lab/persona/gpm_hybrid.py   --root . --out .synthetic-lab-data/gpm/v1/hybrid-dev.json --reps 8 --targets 30
python3 -I scripts/synthetic-lab/persona/gpm_transfer.py --root . --out .synthetic-lab-data/gpm/v1/transfer-dev.json
python3 -I scripts/synthetic-lab/persona/polit_ssm.py    --root . --out .synthetic-lab-data/gpm/v1/polit-ssm.json
python3 -I scripts/synthetic-lab/persona/gpm_tiers.py    --root . --out .synthetic-lab-data/gpm/v1/tiers.json   # γράφει και την πολιτική runtime
# Stage 5 (μία εκτέλεση)
python3 -I scripts/synthetic-lab/persona/gpm_holdout_fetch.py --root .
python3 -I scripts/synthetic-lab/persona/gpm_h6_predict.py    --root .
python3 -I scripts/synthetic-lab/persona/gpm_h6_score.py      --root .
# Runtime
npx vitest run && npx tsc --noEmit -p .
npx tsx scripts/synthetic-lab/persona/e2e_phase6.ts
```

**Σπόροι:** σταθεροί μέσα σε κάθε σενάριο (π.χ. 0–4 για σταθερότητα, 100+ για personas, 9 για bootstrap).

**Περιβάλλον:** Python 3.13 (numpy, scipy, pandas, scikit-learn, openpyxl, onnxruntime), Node + tsx.

**Δεδομένα:** ιδιωτικά στο `.synthetic-lab-data/` (gitignored). Δεν δημοσιεύονται.
