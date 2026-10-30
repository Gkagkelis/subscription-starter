# Consumer Choice Engine (CCE 0.1)

Ανεξάρτητο module του Greek Synthetic Research Lab. Προβλέπει επιλογές καταναλωτών μεταξύ εναλλακτικών με χαρακτηριστικά (τιμή, κόστος επισκευής, εγγύηση, trade-in, παράδοση, επισκευασιμότητα κ.λπ.) **μόνο από μοντέλα εκπαιδευμένα σε πραγματικές ατομικές επιλογές**.

Δεν αγγίζει το `pie-0.2`, το υπόλοιπο Lab ή τα αποτελέσματα προηγούμενων μελετών.

**Κατάσταση: κανένα μοντέλο δεν είναι READY για ελληνικές προβλέψεις.** Όλα τα artifacts είναι εκπαιδευμένα σε μη ελληνικά δεδομένα και επιστρέφουν `transfer = SOURCE_POPULATION_ONLY`. Η μηχανή αρνείται (`NOT_SUPPORTED`) σενάρια επισκευής ή αντικατάστασης, trade-in και εγγύησης, γιατί δεν υπάρχουν πραγματικά δεδομένα γι' αυτά. Βλ. `docs/synthetic-lab/consumer-choice-engine/VALIDATION_REPORT.md`.

## Περιεχόμενα

| Διαδρομή | Περιεχόμενο |
|---|---|
| `cce/schema.py` | Κανονική μορφή long, έλεγχοι εγκυρότητας, manifest, πίνακας σχεδιασμού |
| `cce/ingest.py` | Εισαγωγή πραγματικών δεδομένων (`long_csv`, `wide_tasks` για δεδομένα πεδίου με QC και test-retest) |
| `cce/adapters/` | Adapters δημόσιων datasets: Swiss CE (Brügge 2024), refurbished κινητά (Kurdhi 2023), παράδοση (Berke 2023), ηλεκτρισμός (Train) |
| `cce/models.py` | Μερίδια πλειοψηφίας, conditional logit, panel mixed logit (δικοί μας εκτιμητές, numpy/scipy) |
| `cce/evaluate.py` | Split ανά ερωτώμενο, log loss / Brier / accuracy / ECE / βαθμονόμηση, bootstrap ανά ερωτώμενο |
| `cce/train.py` | Pipeline εκπαίδευσης: baselines, candidate, επιλογή στο validation, μία αξιολόγηση στο test, artifact |
| `cce/engine.py` | API πρόβλεψης `ChoiceEngine`: πύλη εφαρμοσιμότητας, πιθανότητες, προσομοίωση πάνελ με κοινούς τυχαίους αριθμούς, CIs Krinsky–Robb |
| `cce/behavior.py`, `cce/check.py` | Έλεγχοι συμπεριφοράς A–F· έλεγχοι μετά την εκπαίδευση στο συνθετικό πάνελ των 500 |
| `cce/panel.py` | Σύνδεση με τους 500 συνθετικούς καταναλωτές του Lab (μόνο προφίλ, κανένα ποσοστό στόχος) |
| `cce/design.py` | Ελάχιστο ελληνικό πείραμα: σχεδιασμός, μέγεθος δείγματος από τον σχεδιασμό, προσομοίωση ισχύος |
| `cce/transfer_check.py` | Εμπειρικός έλεγχος μεταφοράς μεταξύ κατηγοριών (πραγματικά δεδομένα) |
| `cce/summarize.py` | Πίνακες επικύρωσης από τα artifacts |
| `specs/` | Specs εκπαίδευσης και πειράματος |
| `artifacts/` | Εκπαιδευμένα μοντέλα (JSON: συντελεστές, συνδιακύμανση, πεδίο, μετρικές, manifest με SHA-256), `checks/` |
| `design/` | Σχεδιασμός ελάχιστου πειράματος (CSV, JSON για ingestion, μέγεθος δείγματος) |
| `tests/` | `python3 -I tests/run_tests.py` (ορθότητα κώδικα: εκτιμητές, API, pipeline πεδίου) |

Τα ακατέργαστα και κανονικοποιημένα δεδομένα βρίσκονται **μόνο** στο gitignored `.synthetic-lab-data/cce/` και δεν γίνονται ποτέ commit.

## Χρήση

Όλες οι εντολές τρέχουν από τον φάκελο `models/consumer-choice-engine/`:

```bash
python3 -I cce_cli.py adapters.brugge2024_swiss_ce ../../.synthetic-lab-data/cce/raw/swiss_ce ../../.synthetic-lab-data/cce/data
python3 -I cce_cli.py train specs/cce-0.1-swiss-ce-washing-machine.json
python3 -I cce_cli.py check artifacts/*.json
python3 -I cce_cli.py summarize artifacts/*.json
python3 -I cce_cli.py design specs/gr-min-experiment-washing-machine.json design --simulate 200
python3 -I tests/run_tests.py
```

```python
from cce.engine import ChoiceEngine
from cce.panel import load_greek_panel
e = ChoiceEngine.load("artifacts/cce-0.1-swiss-ce-washing-machine.json")
r = e.predict_proba({"population": "GR"}, {"category": "washing_machine"}, [
    {"alt_id": "A", "price_100chf": 8.9, "life_years": 10, "repair_full": 1, "repair_limited": 0, "recy_limited": 0, "recy_full": 0,
     "env_impact_medium": 0, "env_impact_very_high": 0, "energy_E": 0, "energy_C": 1, "energy_A": 0},
    {"alt_id": "B", "price_100chf": 8.9, "life_years": 10, "repair_full": 0, "repair_limited": 0, "recy_limited": 0, "recy_full": 0,
     "env_impact_medium": 0, "env_impact_very_high": 0, "energy_E": 0, "energy_C": 1, "energy_A": 0}])
# r["status"] == "SUPPORTED", r["transfer"] == "SOURCE_POPULATION_ONLY"  →  όχι ελληνικό εύρημα
```

Τεκμηρίωση: `docs/synthetic-lab/consumer-choice-engine/` (DATA_INVENTORY, DATA_SOURCES, DATA_GAPS, MODEL_DESIGN, VALIDATION_REPORT, CHOICE_EXPERIMENT_DESIGN, MINIMUM_DATA_REQUIREMENTS, NEXT_STEPS).

## Άδειες των δεδομένων εκπαίδευσης

- Swiss CE: CC BY 4.0.
- Παράδοση: MIT + README.
- Ηλεκτρισμός: GPL.
- Refurbished: **CC BY-NC 4.0**. Το artifact `cce-0.1-refurb-smartphone-us2019` φέρει τη σήμανση `EXPERIMENTAL_NONCOMMERCIAL` και δεν χρησιμοποιείται σε εμπορική ή ανατεθείσα μελέτη χωρίς άδεια των δημιουργών.
