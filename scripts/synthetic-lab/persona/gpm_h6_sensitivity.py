"""
PHASE6 — ΑΝΑΛΥΣΗ ΕΥΑΙΣΘΗΣΙΑΣ ΜΕΤΑ ΤΗΝ ΑΠΟΚΑΛΥΨΗ (post hoc, όχι προκαταχωρισμένη).
Ο προκαταχωρισμένος κανόνας «δημογραφικών» (κείμενο: region/household/which of the following best describes…) αποδείχθηκε
υπερβολικά ευρύς (288/506). Εδώ: δημογραφικά = ΜΟΝΟ κωδικοί φύλλου D…/SD…/DX… (gpm_h6_predict.DEMO_RE). Οι ίδιες κλειδωμένες
προβλέψεις (UNIF/POOL/B5)· IQGE δεν υπολογίστηκε για τις ερωτήσεις που είχαν αποκλειστεί.

  python3 -I scripts/synthetic-lab/persona/gpm_h6_sensitivity.py --root .
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gpm_h6_predict import DEMO_RE  # noqa: E402
from gpm_h6_score import cluster_ci, summ  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    a = ap.parse_args()
    hd = os.path.join(os.path.abspath(a.root), ".synthetic-lab-data", "gpm", "holdout-h6")
    rows = json.load(open(os.path.join(hd, "scores.json")))["rows"]
    import pandas as pd

    d = pd.DataFrame(rows)
    d["demo2"] = [bool(DEMO_RE.match(i.split("::")[1])) for i in d.id]
    # διορθωμένη ανίχνευση πολλαπλής απάντησης: μερικοί πίνακες (FL563, FL570) δίνουν ποσοστά 0–100 αντί για αναλογίες
    raw = {}
    for f in os.listdir(os.path.join(hd, "visible")):
        for it in json.load(open(os.path.join(hd, "visible", f)))["items"]:
            sums = [sum(x or 0 for x in v) for c, v in it["values"].items() if c not in ("EU27", "EA", "EA20", "DEW", "DEE")]
            s_ = float(np.mean(sums)) if sums else 0.0
            raw[it["id"]] = s_ / 100 if s_ > 2 else s_
    d["multi2"] = [raw.get(i, 0) > 1.08 for i in d.id]
    out0 = {"reclassified": {"demo_preregistered": int(d.demo.sum()), "demo_sheetOnly": int(d.demo2.sum()), "multi_preregistered": int(d.multi.sum()), "multi_corrected": int(d.multi2.sum())}}
    m = d[~d.demo2 & ~d.multi2]
    out = {"note": "POST HOC — όχι προκαταχωρισμένη", **out0, "n": int(len(m)), "nSurveys": int(m.survey.nunique()),
           **{x: summ(m[x]) for x in ("UNIF", "POOL", "B5")}}
    x = (m.B5 - m.POOL).values
    out["B5_minus_POOL"] = {"diff": round(float(x.mean()), 3), "ci80": cluster_ci(x, m.survey.values)}
    out["B5_cover80"] = round(float(m.cov80.mean()), 3)
    out["bySurvey"] = {s: {k: round(float(g[k].mean()), 2) for k in ("UNIF", "POOL", "B5")} | {"n": int(len(g))} for s, g in m.groupby("survey")}
    json.dump(out, open(os.path.join(hd, "scores-sensitivity-posthoc.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
