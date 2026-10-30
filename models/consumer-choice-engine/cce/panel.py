"""CCE — σύνδεση με το συνθετικό πάνελ του Lab (500 καταναλωτές της μελέτης «Repair, Replace or Upgrade?»).

Το πάνελ δίνει ΜΟΝΟ τα χαρακτηριστικά των προφίλ (φύλο, ηλικία κ.λπ.)· κανένα ποσοστό στόχος δεν διαβάζεται και καμία
βαθμονόμηση δεν γίνεται. Κάθε καταναλωτής κρατά το σταθερό του ID, άρα τους ίδιους ατομικούς συντελεστές και τα ίδια
τυχαία σφάλματα σε κάθε σενάριο (ChoiceEngine.simulate_panel). Ο πληθυσμός-στόχος δηλώνεται GR: όλα τα σημερινά
artifacts επιστρέφουν transfer = SOURCE_POPULATION_ONLY, δηλαδή τα αποτελέσματα ΔΕΝ είναι ελληνικά ευρήματα.
"""
from __future__ import annotations

import csv
from pathlib import Path

PANEL_CSV = Path(__file__).resolve().parents[3] / "docs" / "synthetic-lab" / "consumer-decision-study" / "SYNTHETIC_CONSUMERS.csv"


def load_greek_panel(path=PANEL_CSV):
    out = []
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            out.append({**r, "respondent_id": r["consumer_id"], "population": "GR",
                        # αντιστοίχιση στις μεταβλητές που χρησιμοποιούν τα μοντέλα (ίδιοι ορισμοί ηλικιακών ομάδων)
                        "age_band": r["age_band"].replace("–", "-"), "female": int(r["gender"] == "Γυναίκα")})
    return out
