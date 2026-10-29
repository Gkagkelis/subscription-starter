"""
PHASE4: τελικές παράμετροι IQGE από την ανάπτυξη (PHASE4_PREREGISTRATION, Τροποποίηση Β).

  1. επιλογή L2 με διασταυρωμένη εκπαίδευση δύο κυμάτων (2022→2024, 2024→2022)· κριτήριο: μέσο MAE εκτός δείγματος·
  2. κάρτα ταιριάσματος στο σύνολο 2022+2024 με την επιλεγμένη L2·
  3. αναμενόμενο MAE ανά βαθμίδα = μέσος όρος των ΕΚΤΟΣ δείγματος MAE των δύο κατευθύνσεων (όχι in-sample)·
  4. 80% διάστημα ανά βαθμίδα: ποσοστημόριο 0,8 του |σφάλματος| ανά επιλογή στις εκτός δείγματος προβλέψεις·
  5. εξασθένιση σειράς ανά βαθμίδα (analyze_assoc) στο σύνολο 2022+2024.
Τα H1–H7 δεν χρησιμοποιούνται σε κανένα βήμα.

  python3 scripts/synthetic-lab/persona/fit_iqge_params.py --dev22 dev22.json lat22.npz --dev24 dev24.json lat24.npz --out config/synthetic-lab/persona/iqge/params.json
"""
import argparse
import hashlib
import json
import os
import sys
import time
from multiprocessing import Pool

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze_assoc as AA  # noqa: E402
import analyze_unseen as A  # noqa: E402

L2_GRID = (0.03, 0.1, 0.3)


def rows(p):
    return [r for r in json.load(open(p)) if "lev" in r]


def _fit(args):
    fr, l2 = args
    return A.fit_card(fr, l2=l2)


def oos(th, er):
    return {t: [A.mae(A.card_level(r, np.array(th)), r["truth"]) for r in er if r["tier"] == t] for t in A.TIERS}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dev22", nargs=2, required=True)
    ap.add_argument("--dev24", nargs=2, required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    R22, R24 = rows(a.dev22[0]), rows(a.dev24[0])
    jobs = [(R22, l2) for l2 in L2_GRID] + [(R24, l2) for l2 in L2_GRID]
    with Pool(3) as pool:
        ths = pool.map(_fit, jobs)
    cv = {}
    for k, l2 in enumerate(L2_GRID):
        th22, th24 = ths[k], ths[k + len(L2_GRID)]
        e24, e22 = oos(th22, R24), oos(th24, R22)
        allerr = [x for t in A.TIERS for x in e24[t] + e22[t]]
        cv[l2] = {"meanOOS": float(np.mean(allerr)), "th22": th22, "th24": th24, "e22": e22, "e24": e24}
        print(f"L2={l2}: μέσο MAE εκτός δείγματος {cv[l2]['meanOOS']:.3f}")
    l2 = min(cv, key=lambda k: cv[k]["meanOOS"])
    best = cv[l2]
    th = A.fit_card(R22 + R24, l2=l2)
    exp_mae = {t: round(float(np.mean(best["e22"][t] + best["e24"][t])), 2) for t in A.TIERS}
    q80, cov = {}, {}
    for t in A.TIERS:
        errs = [abs(x) for th_, rs in ((best["th24"], R22), (best["th22"], R24)) for r in rs if r["tier"] == t
                for x in (A.card_level(r, np.array(th_)) * 100 - np.array(r["truth"]))]
        q80[t] = round(float(np.quantile(errs, 0.8)), 2)
    # βάσεις στα ίδια σύνολα (για την αναφορά)
    base = {t: round(float(np.mean([A.mae(A.base(r)[0], r["truth"]) for r in R22 + R24 if r["tier"] == t])), 2) for t in A.TIERS}
    D = AA.load(*a.dev22)
    D24 = AA.load(*a.dev24)
    D.update({k + "#24": v for k, v in D24.items()})
    alpha = AA.fit(D)
    params = {"version": "iqge-1", "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "l2": l2, "card": [float(x) for x in th],
              "cardFeatures": list(A.FEATS) + ["base", "unif", "lex0", "lexConf"], "q80": q80, "alpha": alpha,
              "tiers": {t: {"cardFitMAE": exp_mae[t], "baseMAE": base[t], "n": sum(1 for r in R22 + R24 if r["tier"] == t)} for t in A.TIERS},
              "tierThresholds": {"paraphrase": 0.85, "related": 0.65},
              "cv": {str(k): round(v["meanOOS"], 3) for k, v in cv.items()},
              "trainedOn": ["dn2022a", "dn2022b", "dn2022s", "dn2024a", "dn2024b", "dn2024c"], "protocol": "leave-one-family-out + αποκλεισμός αρχείου-στόχου",
              "devInputsSha256": {os.path.basename(p): hashlib.sha256(open(p, "rb").read()).hexdigest() for p in (a.dev22[0], a.dev24[0])},
              "note": "Μόνο αριθμητικές παράμετροι· κανένα ιδιωτικό δεδομένο. cardFitMAE = αναμενόμενο MAE εκτός δείγματος (διασταυρωμένο)."}
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump(params, open(a.out, "w"), ensure_ascii=False, indent=1)
    print(json.dumps({k: params[k] for k in ("l2", "q80", "alpha", "tiers", "cv")}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
