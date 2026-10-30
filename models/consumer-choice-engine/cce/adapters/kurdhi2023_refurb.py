"""Kurdhi, Dabadghao & Fransoo (2023) — πείραμα επιλογής νέου έναντι refurbished smartphone (Apple, Motorola), ΗΠΑ, MTurk, 2019.
Πηγή: DataverseNL doi:10.34894/MAB6HO, αρχεία DataApple.txt / DataMotorola.txt, άδεια CC BY-NC 4.0 (ΜΟΝΟ μη εμπορική χρήση).
Paper: Flexible Services and Manufacturing Journal (2023).
Σχεδιασμός (αρχεία Ngene των συγγραφέων): 3 εναλλακτικές — refurbished A, refurbished B, νέο (σταθερή τιμή $600 Apple / $480 Motorola)·
20 σετ επιλογής, ένα block (όλοι βλέπουν τα ίδια σετ).
Κωδικοποίηση (επιβεβαιωμένη από τα σετ 1 και 2 του ερωτηματολογίου Apple έναντι των γραμμών 1–2 των δεδομένων):
  coa/cob: 1 = used, 2 = refurbished, 3 = open box
  sa/sb:   1 = μη εξουσιοδοτημένος τρίτος, 2 = εξουσιοδοτημένος τρίτος, 3 = κατασκευαστής (OEM)
  da/db:   έκπτωση ως κλάσμα της τιμής νέου· τιμή refurbished = τιμή νέου × (1 − έκπτωση)
  choice:  1 = refurbished A, 2 = refurbished B, 3 = νέο
    python3 -I cce_cli.py adapters.kurdhi2023_refurb <raw_dir> <out_dir>
"""
import sys
from pathlib import Path

import pandas as pd

from ..ingest import _finish
from ..schema import DatasetManifest

BRANDS = {"apple": ("DataApple.txt", 600.0, "APL"), "motorola": ("DataMotorola.txt", 480.0, "MOT")}
ATTRS = ["price_100usd", "cond_refurbished", "cond_open_box", "seller_authorized", "seller_oem", "discount"]


def _alt(cond, seller, disc, new_price):
    return {"price_100usd": round(new_price * (1 - disc) / 100, 4), "cond_refurbished": int(cond == 2), "cond_open_box": int(cond == 3),
            "seller_authorized": int(seller == 2), "seller_oem": int(seller == 3), "discount": float(disc)}


def run(raw_dir, out_dir):
    raw = Path(raw_dir)
    rows = []
    for brand, (fn, new_price, pre) in BRANDS.items():
        d = pd.read_csv(raw / fn, sep="\t")
        d["task"] = d.groupby("id").cumcount() + 1
        for r in d.itertuples(index=False):
            rid = f"{pre}{r.id}"
            common = {"respondent_id": rid, "situation_id": f"{rid}_{r.task}", "brand": brand, "task": int(r.task)}
            rows.append({**common, "alt_id": "refurb_A", "chosen": int(r.choice == 1), **_alt(r.coa, r.sa, r.da, new_price)})
            rows.append({**common, "alt_id": "refurb_B", "chosen": int(r.choice == 2), **_alt(r.cob, r.sb, r.db, new_price)})
            # νέο: ίδιος κατασκευαστής, χωρίς έκπτωση· οι ψευδομεταβλητές κατάστασης μένουν 0 (η σταθερά asc_new απορροφά «νέο έναντι used»)
            rows.append({**common, "alt_id": "new", "chosen": int(r.choice == 3), "price_100usd": new_price / 100, "cond_refurbished": 0, "cond_open_box": 0,
                         "seller_authorized": 0, "seller_oem": 1, "discount": 0.0})
    df = pd.DataFrame(rows)
    m = DatasetManifest(
        dataset_id="kurdhi2023_refurb_smartphone", title="New vs refurbished smartphone choice experiment (Apple, Motorola), US MTurk",
        source_url="https://doi.org/10.34894/MAB6HO (DataApple.txt, DataMotorola.txt)", licence="CC BY-NC 4.0 — μόνο μη εμπορική χρήση",
        country="US", years="2019", population="Εργαζόμενοι MTurk στις ΗΠΑ (≥100 εγκεκριμένα HITs, έγκριση >95%)· μη πιθανοτικό δείγμα",
        collection="stated_preference_dce",
        unit="επιλογή μεταξύ δύο refurbished/used/open-box κινητών και του νέου μοντέλου του ίδιου κατασκευαστή (χωρίς «κανένα»)",
        alt_attributes={"price_100usd": {"unit": "100 USD", "levels": "τιμή νέου × (1 − έκπτωση)· νέο $600 (Apple) / $480 (Motorola)"},
                        "discount": {"unit": "κλάσμα", "levels": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]},
                        "cond_refurbished / cond_open_box": {"unit": "dummy", "base": "used"},
                        "seller_authorized / seller_oem": {"unit": "dummy", "base": "μη εξουσιοδοτημένος τρίτος πωλητής"}},
        respondent_covariates={"brand": "κατασκευαστής του σεναρίου (πλαίσιο· κάθε ερωτώμενος είδε ένα brand)"},
        notes=["Η σελίδα του dataset αναφέρει 1.014 εργαζόμενους MTurk· τα δημοσιευμένα αρχεία επιλογών περιέχουν 103 (Apple) + 99 (Motorola) ερωτώμενους. Η διαφορά δεν εξηγείται στο αποθετήριο.",
               "Όλοι οι ερωτώμενοι ενός brand είδαν τα ίδια 20 σετ (ένα block)."],
        greek_relevance="Μέτρια: η μόνη ανοιχτή πηγή ατομικών επιλογών refurbished έναντι νέου με μεταβαλλόμενη έκπτωση/κατάσταση/πωλητή· αλλά ΗΠΑ, MTurk, μικρό N.",
        transfer_limits="Πληθυσμός MTurk ΗΠΑ 2019, μόνο smartphones, τιμές USD· όχι συσκευές οικιακής χρήσης, όχι εγγύηση, όχι trade-in, όχι επισκευή. Άδεια NC: δεν επιτρέπεται χρήση σε εμπορική/ανατεθείσα μελέτη χωρίς άδεια των δημιουργών.")
    return _finish(df, [raw / "DataApple.txt", raw / "DataMotorola.txt"], out_dir, m, ATTRS, [])


if __name__ == "__main__":
    d = run(sys.argv[1], sys.argv[2])
    print(d.shape, d["respondent_id"].nunique(), d["situation_id"].nunique(), d.groupby("alt_id").chosen.mean().round(3).to_dict())
