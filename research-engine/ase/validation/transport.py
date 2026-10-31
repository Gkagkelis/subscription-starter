"""Ανεξάρτητη επικύρωση της μεταφοράς μεταξύ χωρών (leave-one-country-out) σε πραγματικά δεδομένα Eurostat.

Για κάθε δείκτη × μονάδα × έτος × οικογένεια υποομάδων: σφάλμα (μονάδες %) της μεθόδου PP-logit και των μεθόδων αναφοράς B0/B1,
για όλες τις χώρες και ξεχωριστά για την Ελλάδα. Απόφαση χρήσης ανά δείκτη/οικογένεια: η PP-logit εγκρίνεται μόνο αν το
μέσο απόλυτο σφάλμα της είναι μικρότερο από ΚΑΙ τις δύο μεθόδους αναφοράς στο σύνολο των χωρών. Καμία τιμή-στόχος της
χώρας που ελέγχεται δεν χρησιμοποιείται στην πρόβλεψή της (εκτός από το εθνικό σύνολο, που θεωρείται γνωστό εκ σχεδιασμού)."""
from __future__ import annotations

import pandas as pd

from ..global_evidence.eurostat import load
from ..paths import ASE_DATA
from ..transport.pooling import FAMILIES, loco
from ..util import now_iso, write_json

SPECS = [("isoc_ec_ibgs", "I_BEEQU1", "PC_IND"), ("isoc_ec_ibgs", "I_BHARD1", "PC_IND"), ("isoc_ec_iprb21", "I_BSPD1", "PC_IND_BUY3"),
         ("isoc_ec_iprb21", "I_BWDN1", "PC_IND_BUY3"), ("isoc_ec_iprb21", "I_BCR1", "PC_IND_BUY3"), ("isoc_ci_ac_i", "I_IUIF", "PC_IND"),
         ("isoc_ci_ac_i", "I_IUCHAT1", "PC_IND")]


def run(years=(2023, 2024, 2025)) -> dict:
    allr = []
    for ds, ind, unit in SPECS:
        try:
            df = load(ds)
        except Exception as e:  # noqa: BLE001
            allr.append(pd.DataFrame([{"indicator": ind, "error": str(e)}]))
            continue
        for y in years:
            for fam in FAMILIES:
                allr.append(loco(df, ind, unit, y, fam))
    R = pd.concat([r for r in allr if len(r)], ignore_index=True)
    R = R.dropna(subset=["observed"]) if "observed" in R else R
    for m in ("pp", "b0", "b1"):
        R[f"ae_{m}"] = (R[m] - R["observed"]).abs()
    summary, decisions = [], {}
    for (ind, unit, fam), g in R.groupby(["indicator", "unit", "family"]):
        s = {"indicator": ind, "unit": unit, "family": fam, "n": len(g), "mae_pp": round(g["ae_pp"].mean(), 2), "mae_b0": round(g["ae_b0"].mean(), 2),
             "mae_b1": round(g["ae_b1"].mean(), 2)}
        gr = g[g["geo"] == "EL"]
        s.update(n_greece=len(gr), mae_pp_greece=round(gr["ae_pp"].mean(), 2) if len(gr) else None, mae_b0_greece=round(gr["ae_b0"].mean(), 2) if len(gr) else None,
                 mae_b1_greece=round(gr["ae_b1"].mean(), 2) if len(gr) else None)
        s["approved"] = bool(s["mae_pp"] < s["mae_b0"] and s["mae_pp"] < s["mae_b1"])
        summary.append(s)
        decisions[f"{ind}|{unit}|{fam}"] = {"approved": s["approved"], "mae_pp": s["mae_pp"], "mae_greece": s["mae_pp_greece"]}
    out = {"created_at": now_iso(), "method": "PP-logit (similarity-weighted subgroup log-odds deviation)", "design": "leave-one-country-out, EU-27, Eurostat",
           "summary": summary, "decisions": decisions, "rows": len(R)}
    p = ASE_DATA / "validation" / "transport_loco.json"
    write_json(p, out)
    R.to_csv(ASE_DATA / "validation" / "transport_loco_rows.csv.gz", index=False, compression="gzip")
    return out


def decisions() -> dict:
    from ..util import read_json
    p = ASE_DATA / "validation" / "transport_loco.json"
    return read_json(p)["decisions"] if p.exists() else {}
