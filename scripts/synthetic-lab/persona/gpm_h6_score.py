"""
PHASE6 — βαθμολόγηση του τυφλού holdout H6 (μόνο ΜΕΤΑ το κλείδωμα των προβλέψεων· προκαταχώριση §5–§6).

  python3 -I scripts/synthetic-lab/persona/gpm_h6_score.py --root .
"""
import argparse
import hashlib
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gpm_h6_predict import volume_c_gaps  # noqa: E402


def cluster_ci(x, cl, B=4000, seed=9):
    rng = np.random.default_rng(seed)
    u = np.unique(cl)
    idx = {c: np.where(cl == c)[0] for c in u}
    bs = [np.concatenate([x[idx[c]] for c in rng.choice(u, len(u))]).mean() for _ in range(B)]
    return [round(float(np.quantile(bs, 0.1)), 3), round(float(np.quantile(bs, 0.9)), 3)]


def summ(e):
    e = np.asarray(e)
    return {"n": int(len(e)), "MAE": round(float(e.mean()), 2), "median": round(float(np.median(e)), 2), "RMSE": round(float(np.sqrt((e ** 2).mean())), 2),
            "p90": round(float(np.quantile(e, 0.9)), 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    hd = os.path.join(root, ".synthetic-lab-data", "gpm", "holdout-h6")
    P = json.load(open(os.path.join(hd, "predictions.json")))
    lock = P.pop("lockSha256")
    if hashlib.sha256(json.dumps(P, sort_keys=True, ensure_ascii=False).encode()).hexdigest() != lock:
        sys.exit("Το κλείδωμα των προβλέψεων δεν επαληθεύεται.")
    truth = {}
    for f in os.listdir(os.path.join(hd, "locked")):
        if f.endswith(".EL.json"):
            for it in json.load(open(os.path.join(hd, "locked", f)))["items"]:
                truth[it["id"]] = it
    rows = []
    rng = np.random.default_rng(1)
    for it in P["items"]:
        t = truth.get(it["id"])
        if not t or t["EL"] is None:
            continue
        v = np.array([t["EL"][i] if t["EL"][i] is not None else np.nan for i in it["substIdx"]], dtype=float)
        if np.isnan(v).any() or v.sum() <= 0:
            continue
        y = v / v.sum() * 100
        n = t.get("nEL") if isinstance(t.get("nEL"), (int, float)) and t.get("nEL") else 1000
        # κατώτατο αναμενόμενο σφάλμα: δειγματοληψία (deff 1,5) + στρογγυλοποίηση στο 1%
        sims = rng.multinomial(int(n / 1.5), y / 100, size=200) / int(n / 1.5) * 100
        floor = float(np.mean(np.abs(np.round(sims) - y)))
        r = {"id": it["id"], "survey": it["survey"], "domain": it["domain"], "demo": it["demo"], "multi": it["multi"], "K": it["K"], "floor": floor,
             "dis": it["disagreement"], "catA": "PERSIST" in it}
        for m in ("UNIF", "POOL", "B5", "PERSIST", "IQGE", "IQGE_C"):
            if m in it:
                p = np.array(it[m], dtype=float)
                r[m] = float(np.mean(np.abs(p - y)))
                if m == "B5":
                    lo, hi = np.array(it["B5_int80"]).T
                    r["cov80"] = float(np.mean((y >= lo) & (y <= hi)))
                    r["width80"] = float(np.mean(hi - lo))
                    r["xent"] = float(-(y / 100 * np.log(np.clip(p / 100, 1e-4, 1))).sum())
                    r["biasFirst"] = float(p[0] - y[0])
                    r["biasLast"] = float(p[-1] - y[-1])
        r["iqgeTier"] = it.get("IQGE_tier")
        rows.append(r)
    import pandas as pd

    d = pd.DataFrame(rows)
    main_ = d[~d.demo & ~d.multi]
    out = {"scoredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "predictionsLockSha256": lock, "nScored": int(len(d)), "nMain": int(len(main_)),
           "nMulti": int((d.multi & ~d.demo).sum()), "nDemo": int(d.demo.sum()), "noiseFloorMAE": round(float(main_.floor.mean()), 2)}
    for m in ("UNIF", "POOL", "B5", "IQGE", "IQGE_C"):
        out[f"main_{m}"] = summ(main_[m].dropna())
    cl = main_.survey.values
    x1 = (main_.B5 - main_.POOL).values
    out["H6.1_B5_minus_POOL"] = {"diff": round(float(x1.mean()), 3), "ci80": cluster_ci(x1, cl)}
    out["H6.1_pass"] = bool(out["H6.1_B5_minus_POOL"]["diff"] <= -0.5 and out["H6.1_B5_minus_POOL"]["ci80"][1] < 0)
    cov = float(main_.cov80.mean())
    out["H6.2"] = {"B5_MAE": round(float(main_.B5.mean()), 2), "limit": 8.9, "cover80": round(cov, 3), "width80": round(float(main_.width80.mean()), 2)}
    out["H6.2_pass"] = bool(main_.B5.mean() <= 8.9 and 0.65 <= cov <= 0.95)
    x3 = (main_.IQGE - main_.UNIF).values
    out["H6.3_IQGE_minus_UNIF"] = {"diff": round(float(x3.mean()), 3), "ci80": cluster_ci(x3, cl)}
    out["H6.3_pass_abstention_justified"] = not bool(out["H6.3_IQGE_minus_UNIF"]["diff"] <= -1.0 and out["H6.3_IQGE_minus_UNIF"]["ci80"][1] < 0)
    x4 = (main_.IQGE_C - main_.UNIF).values
    out["H6.4_IQGEC_minus_UNIF"] = {"diff": round(float(x4.mean()), 3), "ci80": cluster_ci(x4, cl)}
    out["H6.4_pass"] = bool(out["H6.4_IQGEC_minus_UNIF"]["diff"] <= -1.0 and out["H6.4_IQGEC_minus_UNIF"]["ci80"][1] < 0)
    A = main_[main_.catA]
    if len(A):
        out["H6.5_catA"] = {"n": int(len(A)), "PERSIST": round(float(A.PERSIST.mean()), 2), "B5": round(float(A.B5.mean()), 2), "POOL": round(float(A.POOL.mean()), 2),
                            "UNIF": round(float(A.UNIF.mean()), 2)}
    out["bySurvey"] = {s: {m: round(float(g[m].mean()), 2) for m in ("UNIF", "POOL", "B5", "IQGE", "IQGE_C")} | {"n": int(len(g))} for s, g in main_.groupby("survey")}
    out["byDomain"] = {s: {m: round(float(g[m].mean()), 2) for m in ("UNIF", "POOL", "B5", "IQGE", "IQGE_C")} | {"n": int(len(g))} for s, g in main_.groupby("domain")}
    out["byIqgeTier"] = {s: {m: round(float(g[m].mean()), 2) for m in ("UNIF", "IQGE", "IQGE_C")} | {"n": int(len(g))} for s, g in main_.groupby("iqgeTier")}
    out["B5_bias_firstOption_pp"] = round(float(main_.biasFirst.mean()), 2)
    out["B5_bias_lastOption_pp"] = round(float(main_.biasLast.mean()), 2)
    out["B5_crossEntropy"] = round(float(main_.xent.mean()), 4)
    o = main_.sort_values("dis")
    cum = np.cumsum(o.B5.values) / np.arange(1, len(o) + 1)
    out["B5_riskCoverage"] = [{"coverage": c, "MAE": round(float(cum[max(int(c * len(o)) - 1, 0)]), 2)} for c in (0.25, 0.5, 0.75, 0.9, 1.0)]
    mu = d[d.multi & ~d.demo]
    if len(mu):
        out["multi"] = {m: round(float(mu[m].mean()), 2) for m in ("UNIF", "POOL", "B5")} | {"n": int(len(mu))}
    out["PIE07_policy"] = {"categoryB_answeredTier3": int(len(main_)), "categoryC_default_answered": 0,
                           "categoryC_if_experimental_MAE": round(float(main_.IQGE_C.mean()), 2), "categoryC_if_experimental_UNIF": round(float(main_.UNIF.mean()), 2)}
    # H6.6 διαφορές υποομάδων
    sub = {}
    for sid, sp in P.get("subgroup", {}).items():
        fl = [f for f in os.listdir(os.path.join(hd, "locked")) if f.startswith(f"{sid}.volumeC.EL")]
        if not fl:
            continue
        tg = volume_c_gaps(open(os.path.join(hd, "locked", fl[0]), "rb").read(), set(sp["meanGap"]))
        e_m, e_0 = [], []
        for s, g in sp["meanGap"].items():
            for k, pv in g.items():
                tv = (tg.get(s) or {}).get(k)
                if tv is None:
                    continue
                e_m.append(abs(pv - tv))
                e_0.append(abs(tv))
        if e_m:
            sub[sid] = {"pairs": len(e_m), "err_meanOtherCountries": round(float(np.mean(e_m)), 4), "err_zero": round(float(np.mean(e_0)), 4),
                        "reduction": round(float(1 - np.mean(e_m) / np.mean(e_0)), 3)}
    out["H6.6_subgroups"] = sub
    json.dump({"summary": out, "rows": rows}, open(os.path.join(hd, "scores.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
