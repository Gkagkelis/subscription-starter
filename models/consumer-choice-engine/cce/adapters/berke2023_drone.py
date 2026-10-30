"""Berke et al. (2023) — DCE παράδοσης (ground vs drone), ΗΠΑ, Prolific, 2022.
Πηγή: https://github.com/aberke/drones-consumer-privacy (data/sample-preprocessed.csv)· άδεια αποθετηρίου MIT και ρητή
άδεια επαναχρησιμοποίησης δεδομένων με αναφορά στο README. Paper: Transportation Research Part C 157 (2023) 104391,
https://doi.org/10.1016/j.trc.2023.104391.
Κωδικοποίηση (notebook των συγγραφέων transform-survey-data-for-choice-modeling.ipynb): choice=1 drone, 0 ground· οι δείκτες
gc/gt/dc/dt/dp στο όνομα της στήλης δείχνουν επίπεδα από survey-questions/attributes.py.
    python3 -I cce_cli.py adapters.berke2023_drone <raw_dir> <out_dir>
"""
import sys
from pathlib import Path

import pandas as pd

from ..ingest import _finish
from ..schema import DatasetManifest

VENDORS = ["takeout_food", "prescription_medications", "liquor_store", "last_minute_groceries"]
COST = [[0, 1, 3, 5], [0, 1, 5, 10], [0, 1, 3, 5], [0, 1, 3, 5]]
TIME_MIN = [[15, 20, 30, 45], [30, 120, 360, 1440], [15, 20, 30, 45], [15, 20, 30, 45]]
AGE = {1: "18-24", 2: "25-34", 3: "35-44", 4: "45-54", 5: "55-64", 6: "65+"}


def run(raw_dir, out_dir):
    raw = Path(raw_dir)
    w = pd.read_csv(raw / "sample-preprocessed.csv", low_memory=False)
    qs = [c for c in w.columns if c.startswith("CHOICE_")]
    long = w[["ResponseId", "Q_age", "Q_gender"] + qs].melt(id_vars=["ResponseId", "Q_age", "Q_gender"], value_vars=qs, var_name="QID", value_name="choice").dropna(subset=["choice"])
    for k in ("v", "gc", "gt", "dc", "dt", "dp"):
        long[k] = long["QID"].str.extract(rf"_{k}(\d)")[0].astype(int)
    rows = []
    for i, r in enumerate(long.itertuples(index=False)):
        v = r.v
        sit = f"{r.ResponseId}|{r.QID}"
        common = {"respondent_id": r.ResponseId, "situation_id": sit, "product": VENDORS[v], "age_band": AGE.get(int(r.Q_age), "na"),
                  "female": int(int(r.Q_gender) == 2)}
        rows.append({**common, "alt_id": "ground", "chosen": int(r.choice == 0), "fee_usd": COST[v][r.gc], "wait_hours": TIME_MIN[v][r.gt] / 60, "privacy_risk": 0})
        rows.append({**common, "alt_id": "drone", "chosen": int(r.choice == 1), "fee_usd": COST[v][r.dc], "wait_hours": TIME_MIN[v][r.dt] / 60,
                     "privacy_risk": int(r.dp == 0)})   # dp=0: «NO privacy» → κίνδυνος ιδιωτικότητας
    df = pd.DataFrame(rows)
    m = DatasetManifest(
        dataset_id="berke2023_drone_delivery", title="Drone delivery and the value of customer privacy: a discrete choice experiment with U.S. consumers",
        source_url="https://github.com/aberke/drones-consumer-privacy (data/sample-preprocessed.csv)", licence="MIT (repository) + README: «You are welcome to use our data… Please cite»",
        country="US", years="2022", population="Ενήλικες ΗΠΑ, online panel Prolific (μη πιθανοτικό)", collection="stated_preference_dce",
        unit="επιλογή μεταξύ δύο τρόπων παράδοσης (ground vehicle / drone) για 4 τύπους προϊόντων",
        alt_attributes={"fee_usd": {"unit": "USD", "levels": "0/1/3/5 (φάρμακα 0/1/5/10)"}, "wait_hours": {"unit": "ώρες", "levels": "0,25–0,75 (φάρμακα 0,5–24)"},
                        "privacy_risk": {"unit": "0/1", "description": "μόνο drone: χωρίς προστασία ιδιωτικότητας"}},
        respondent_covariates={"age_band": "Q_age", "female": "Q_gender==2", "product": "τύπος προϊόντος της ερώτησης (πλαίσιο, όχι χαρακτηριστικό ερωτώμενου)"},
        notes=["Οι συγγραφείς έχουν ήδη αφαιρέσει αποτυχίες ελέγχου προσοχής και μη ολοκληρωμένες απαντήσεις (README).",
               "Παραλείπεται το Prolific ID (δεν δημοσιεύεται)· χρησιμοποιείται το ResponseId."],
        greek_relevance="Χαμηλή–μέτρια: μόνο ο συμβιβασμός χρέωσης/χρόνου παράδοσης· όχι συσκευές, όχι ελληνικός πληθυσμός.",
        transfer_limits="ΗΠΑ 2022, παράδοση εντός ημέρας για τρόφιμα/φάρμακα (λεπτά–1 ημέρα)· η παράδοση συσκευών στην Ελλάδα (1–7 ημέρες) είναι εκτός εύρους.")
    return _finish(df, [raw / "sample-preprocessed.csv"], out_dir, m, ["fee_usd", "wait_hours", "privacy_risk"], [])


if __name__ == "__main__":
    d = run(sys.argv[1], sys.argv[2])
    print(d.shape, d["respondent_id"].nunique(), d["situation_id"].nunique())
