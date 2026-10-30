"""Brügge, Gomm & Bernauer (2024) — πείραμα επιλογής κυκλικών προϊόντων, Ελβετία (Swiss Environmental Panel, κύμα 8,
Δεκ. 2021–Φεβ. 2022). Κάθε ερωτώμενος βλέπει ΕΝΑ προϊόν (smartphone / TV / πλυντήριο), 4 γύρους × 2 προφίλ, αναγκαστική επιλογή.
Πηγή: Zenodo 10.5281/zenodo.18260332 (CC BY 4.0), αρχεία w8_conjoint.csv (ετικέτες επιπέδων) και wtp_data_ce.csv (κωδικοί).
Paper: Journal of Cleaner Production (2024), https://doi.org/10.1016/j.jclepro.2024.143968.
Κωδικοποίηση τιμών/διάρκειας: οι ετικέτες «a / b / c» αντιστοιχούν σε smartphone / TV / πλυντήριο (w8_conjoint.csv· οι τιμές
πλυντηρίου 470/890/1650/3200 CHF επιβεβαιώνονται στο wtp_analysis_washing_machines.R των συγγραφέων).
Γράφει ένα dataset ανά προϊόν (διαφορετικά εύρη τιμών → ξεχωριστά μοντέλα).
    python3 -I cce_cli.py adapters.brugge2024_swiss_ce <raw_dir> <out_dir>
"""
import sys
from pathlib import Path

import pandas as pd

from ..ingest import _finish
from ..schema import DatasetManifest

PRODUCTS = {"Smartphone": ("smartphone", 0), "TV": ("tv", 1), "Washing machine": ("washing_machine", 2)}
REPAIR = {"Not repairable at all": (0, 0), "Repairable to a limited degree": (1, 0), "Repairable": (0, 1)}
RECY = {"Not recyclable": (0, 0), "Limited recyclable": (1, 0), "Recyclable": (0, 1)}
ENV = {"Very low": (0, 0), "Medium": (1, 0), "Very high": (0, 1)}
EFF = {"G": (0, 0, 0), "E": (1, 0, 0), "C": (0, 1, 0), "A": (0, 0, 1)}
ATTRS = ["price_100chf", "life_years", "repair_limited", "repair_full", "recy_limited", "recy_full", "env_impact_medium", "env_impact_very_high",
         "energy_E", "energy_C", "energy_A"]


def _level(label, k):
    return float(label.split(" / ")[k].split()[0])


def run(raw_dir, out_dir):
    raw = Path(raw_dir)
    a = pd.read_csv(raw / "w8_conjoint.csv")
    b = pd.read_csv(raw / "wtp_data_ce.csv")
    # διασταύρωση ετικετών και κωδικών (ίδιες γραμμές, ίδια επιλογή)
    m = a.merge(b[["PubId", "product", "round", "choice", "price", "rep"]], on=["PubId", "product", "round"], suffixes=("", "_code"))
    assert len(m) == len(a) == len(b) and (m["choice"] == m["choice_code"]).all()
    out = []
    for ptype, (pid, k) in PRODUCTS.items():
        d = m[m["product_type"] == ptype]
        rows = []
        for r in d.itertuples(index=False):
            lab = dict(zip(a.columns, r))
            rl, rf = REPAIR[lab["Repairability"]]
            yl, yf = RECY[lab["Recyclability"]]
            em, eh = ENV[lab["Env. production impact"]]
            e1, e2, e3 = EFF[lab["Energy efficiency"]]
            rows.append({"respondent_id": f"CH{lab['PubId']}", "situation_id": f"CH{lab['PubId']}_{lab['round']}", "alt_id": "A" if lab["product"] == 1 else "B",
                         "chosen": int(lab["choice"]), "round": int(lab["round"]),
                         "price_100chf": _level(lab["Price"], k) / 100, "life_years": _level(lab["Functional duration"], k),
                         "repair_limited": rl, "repair_full": rf, "recy_limited": yl, "recy_full": yf, "env_impact_medium": em, "env_impact_very_high": eh,
                         "energy_E": e1, "energy_C": e2, "energy_A": e3})
        df = pd.DataFrame(rows)
        man = DatasetManifest(
            dataset_id=f"brugge2024_swiss_ce_{pid}",
            title=f"Circular products choice experiment, Switzerland — {ptype}",
            source_url="https://doi.org/10.5281/zenodo.18260332 (w8_conjoint.csv, wtp_data_ce.csv)", licence="CC BY 4.0",
            country="CH", years="2021-2022", population="Swiss Environmental Panel, κύμα 8 (online panel ενηλίκων κατοίκων Ελβετίας· η μέθοδος στρατολόγησης δεν επαληθεύτηκε εδώ)",
            collection="stated_preference_dce",
            unit=f"αναγκαστική επιλογή μεταξύ δύο ΚΑΙΝΟΥΡΓΙΩΝ {ptype} (χωρίς επιλογή «κανένα», χωρίς επισκευή/refurbished ως εναλλακτική)",
            alt_attributes={"price_100chf": {"unit": "100 CHF", "levels": sorted({_level(x, k) for x in a['Price'].unique()})},
                            "life_years": {"unit": "έτη λειτουργικής διάρκειας", "levels": sorted({_level(x, k) for x in a['Functional duration'].unique()})},
                            "repair_limited / repair_full": {"unit": "dummy", "base": "μη επισκευάσιμο"},
                            "recy_limited / recy_full": {"unit": "dummy", "base": "μη ανακυκλώσιμο"},
                            "env_impact_medium / env_impact_very_high": {"unit": "dummy", "base": "πολύ χαμηλό αποτύπωμα παραγωγής"},
                            "energy_E / energy_C / energy_A": {"unit": "dummy", "base": "ενεργειακή κλάση G"}},
            respondent_covariates={},
            notes=["Οι συγγραφείς έχουν ήδη αφαιρέσει μη ολοκληρωμένες απαντήσεις (data_structuring_wtp_ce_paper.R: filter all >= 0).",
                   "Ετικέτες επιπέδων διασταυρωμένες 1:1 με τους αριθμητικούς κωδικούς του wtp_data_ce.csv.",
                   "Covariates ερωτώμενου (w7_w8_subgroups.csv) δεν χρησιμοποιούνται: το codebook (SWISSUbase) δεν επαληθεύτηκε."],
            greek_relevance="Μέτρια: ίδιες κατηγορίες συσκευών με το λιανεμπόριο ηλεκτρικών ειδών και χαρακτηριστικά επισκευασιμότητας/διάρκειας· αλλά πληθυσμός και επίπεδο τιμών Ελβετίας.",
            transfer_limits="Ελβετικές τιμές CHF 2021-22 και ελβετικό εισόδημα· επιλογή αγοράς μεταξύ δύο νέων προϊόντων — ΔΕΝ μοντελοποιεί απόφαση επισκευής έναντι αντικατάστασης, trade-in, refurbished, εγγύηση ή κανάλι.")
        out.append(_finish(df, [raw / "w8_conjoint.csv", raw / "wtp_data_ce.csv"], out_dir, man, ATTRS, []))
    return out


if __name__ == "__main__":
    for d in run(sys.argv[1], sys.argv[2]):
        print(d.shape, d["respondent_id"].nunique(), d["situation_id"].nunique(), d.groupby("alt_id").chosen.mean().round(3).to_dict())
