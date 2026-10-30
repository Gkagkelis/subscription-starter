"""Train «Electricity» — δηλωμένες επιλογές προμηθευτή ηλεκτρισμού (ΗΠΑ, τέλη 1990)· 361 ερωτώμενοι, 4 εναλλακτικές.
Πηγή αρχείου: https://raw.githubusercontent.com/arteagac/xlogit/master/examples/data/electricity_long.csv (xlogit, GPL-3)·
ίδια δεδομένα στο R mlogit (GPL >= 2), αρχική πηγή: σελίδα K. Train· Huber & Train (2001), Revelt & Train (2000).
Χρήση στην CCE: ΜΟΝΟ μεθοδολογικό benchmark (panel mixed logit με πραγματικές επιλογές)· όχι για προβλέψεις της μελέτης.
    python3 -I cce_cli.py adapters.train_electricity <raw_dir> <out_dir>
"""
import sys
from pathlib import Path

import pandas as pd

from ..ingest import _finish
from ..schema import DatasetManifest


def run(raw_dir, out_dir):
    raw = Path(raw_dir)
    d = pd.read_csv(raw / "electricity_long.csv")
    df = pd.DataFrame({"respondent_id": d["id"].astype(str), "situation_id": d["chid"].astype(str), "alt_id": d["alt"].astype(str), "chosen": d["choice"].astype(int),
                       "price_fixed": d["pf"], "contract_years": d["cl"], "local": d["loc"], "well_known": d["wk"], "tod": d["tod"], "seasonal": d["seas"]})
    m = DatasetManifest(
        dataset_id="train_electricity", title="Electricity supplier stated preference (Train)", source_url="https://raw.githubusercontent.com/arteagac/xlogit/master/examples/data/electricity_long.csv",
        licence="GPL-3 (xlogit)· GPL (>= 2) στο R mlogit", country="US", years="τέλη 1990 (μη επαληθευμένο)", population="Νοικοκυριά ΗΠΑ", collection="stated_preference_dce",
        unit="επιλογή μεταξύ 4 προσφορών προμηθευτή ηλεκτρισμού", alt_attributes={"price_fixed": {"unit": "c/kWh"}, "contract_years": {"unit": "έτη, με ποινή αποχώρησης"},
        "local": {}, "well_known": {}, "tod": {}, "seasonal": {}}, notes=["Μόνο μεθοδολογικό benchmark της CCE."],
        greek_relevance="Καμία άμεση (υπηρεσία κοινής ωφέλειας, ΗΠΑ).", transfer_limits="Δεν χρησιμοποιείται για ελληνικές προβλέψεις.")
    return _finish(df, [raw / "electricity_long.csv"], out_dir, m, ["price_fixed", "contract_years", "local", "well_known", "tod", "seasonal"], [])


if __name__ == "__main__":
    d = run(sys.argv[1], sys.argv[2])
    print(d.shape, d["respondent_id"].nunique(), d["situation_id"].nunique())
