"""
PHASE7A — βαθμολόγηση (ΜΟΝΟ μετά το κλείδωμα και το commit των προβλέψεων· προκαταχώριση: PHASE7A_PREREGISTRATION.md).
Τρέχει ως root (μόνο αυτή διαβάζει τα sealed/ μέσω p7a_seal.open_sealed).

  python3 -I scripts/synthetic-lab/p7a/p7a_score.py --root .

Σύγκριση ανά ερώτηση:
  - κλίμακα «ουσιαστικές επιλογές»: πρόβλεψη και πραγματικό κανονικοποιούνται στις μη ΔΞ/ΔΑ επιλογές (προεπιλογή)·
  - ή «όπως δημοσιεύθηκε» όπου το mapping το ορίζει (π.χ. πρόθεση ψήφου με αναποφάσιστους/αποχή).
Μετρικές: MAE (π.μ., μέσος ανά επιλογή), διάμεσος, RMSE, μεροληψία, μέγιστο, 90ό εκατ., ανά έρευνα/τομέα/βαθμίδα/τύπο,
κάλυψη 80/90/95% (διάστημα = πρόβλεψη ± z·1,25·αναμενόμενο MAE της βαθμίδας, συν δειγματοληπτικό σφάλμα της αλήθειας),
αποχή (κάλυψη, MAE απαντημένων, MAE που θα είχαν οι ερωτήσεις αποχής), συγκρίσεις κοινών ερωτήσεων, cluster bootstrap ανά έρευνα,
κατώτατο αναμενόμενο σφάλμα λόγω δειγματοληψίας της αλήθειας.
"""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import p7a_seal  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
P = os.path.join(ROOT, ".synthetic-lab-data", "p7a")
DK_RE = re.compile(r"(δεν ξέρω|δε ξέρω|δξ|δα|δεν απαντ|αρνησ|ξ/ΔΑ|don.?t know|no answer)", re.I)
METHODS = ["pie-0.2", "pie-0.6", "pie-0.7", "pie-0.7x", "IQGE", "UNIF", "POLL_AVG", "PREV_POLLSTER", "PREV_SAME"]
Z = {"80": 1.2816, "90": 1.6449, "95": 1.96}


def cluster_ci(x, cl, B=4000, seed=9):
    if len(set(cl)) < 2:
        return [None, None]
    rng = np.random.default_rng(seed)
    u = np.unique(cl)
    idx = {c: np.where(cl == c)[0] for c in u}
    bs = [np.concatenate([x[idx[c]] for c in rng.choice(u, len(u))]).mean() for _ in range(B)]
    return [round(float(np.quantile(bs, 0.1)), 2), round(float(np.quantile(bs, 0.9)), 2)]


def summ(e):
    e = np.asarray([x for x in e if x is not None], dtype=float)
    if not len(e):
        return {"n": 0}
    return {"n": int(len(e)), "MAE": round(float(e.mean()), 2), "median": round(float(np.median(e)), 2), "RMSE": round(float(np.sqrt((e ** 2).mean())), 2),
            "max": round(float(e.max()), 2), "p90": round(float(np.quantile(e, 0.9)), 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=ROOT)
    a = ap.parse_args()
    pf = os.path.join(P, "predictions", "predictions.json")
    Pr = json.load(open(pf))
    lock = Pr.pop("lockSha256")
    if hashlib.sha256(json.dumps(Pr, sort_keys=True, ensure_ascii=False).encode()).hexdigest() != lock:
        sys.exit("Το κλείδωμα των προβλέψεων δεν επαληθεύεται.")
    mappings = json.load(open(os.path.join(ROOT, "config", "synthetic-lab", "p7a", "mappings.json")))
    Qs = {}
    for f in os.listdir(os.path.join(P, "questionnaires")):
        q = json.load(open(os.path.join(P, "questionnaires", f)))
        Qs[q["surveyId"]] = q
    rows, gt_rows = [], []
    rng = np.random.default_rng(1)
    for sid, S in Pr["surveys"].items():
        truth = p7a_seal.open_sealed(sid)
        tq = {t["qid"]: t for t in truth["items"]}
        Q = Qs[sid]
        qmeta = {q["qid"]: q for q in Q["questions"]}
        mp = mappings.get(sid, {})
        for it in S["items"]:
            t = tq.get(it["qid"])
            meta = qmeta[it["qid"]]
            if not t or not t.get("shares"):
                rows.append({"survey": sid, "qid": it["qid"], "status": "no_ground_truth"})
                continue
            opts = it["options"]
            scope = mp.get("scoringScope", {}).get(it["qid"], "substantive")
            keep = opts if scope == "as_published" else [o for o in opts if not DK_RE.search(o)]
            y = np.array([float(t["shares"].get(o, np.nan)) for o in keep])
            for o in opts:
                gt_rows.append({"survey": sid, "qid": it["qid"], "option": o, "observed_pct": t["shares"].get(o), "base_n": t.get("base_n"), "denominator": t.get("denominator"),
                                "weighted": t.get("weighted"), "precision": t.get("precision"), "source_page": t.get("sourcePage")})
            if np.isnan(y).any() or y.sum() <= 0:
                rows.append({"survey": sid, "qid": it["qid"], "status": "incomplete_ground_truth"})
                continue
            y = y / y.sum() * 100
            n = float(t.get("base_n") or 1000)
            se = np.sqrt(np.clip(y / 100 * (1 - y / 100), 1e-4, None) / (n / 1.5)) * 100
            sims = rng.multinomial(int(n / 1.5), y / 100, size=300) / int(n / 1.5) * 100
            floor = float(np.mean(np.abs(np.round(sims) - y)))
            base = {"survey": sid, "qid": it["qid"], "category": Q.get("category"), "domain": meta.get("domain") or Q.get("category"), "type": it["type"],
                    "measure": meta.get("measure"), "K": len(keep), "n": n, "floor": round(floor, 3), "status": "scored"}
            for m in METHODS:
                pm = it["predictions"].get(m)
                if not pm or not pm.get("answered") or not pm.get("shares"):
                    base[f"{m}_answered"] = False
                    continue
                p = np.array([float(pm["shares"].get(o, 0.0)) for o in keep])
                if p.sum() <= 0:
                    base[f"{m}_answered"] = False
                    continue
                p = p / p.sum() * 100
                base[f"{m}_answered"] = True
                base[f"{m}_mae"] = float(np.mean(np.abs(p - y)))
                base[f"{m}_bias_first"] = float(p[0] - y[0])
                base[f"{m}_tier"] = pm.get("tier")
                base[f"{m}_abstain"] = pm.get("abstain")
                em = pm.get("expectedMAE")
                if em:
                    sd = 1.25 * float(em)
                    for k, z in Z.items():
                        half = z * np.sqrt(sd ** 2 + se ** 2)
                        base[f"{m}_cov{k}"] = float(np.mean(np.abs(p - y) <= half))
                        base[f"{m}_width{k}"] = float(np.mean(2 * half))
                base[f"{m}_pred"] = {o: round(float(v), 2) for o, v in zip(keep, p)}
            base["observed"] = {o: round(float(v), 2) for o, v in zip(keep, y)}
            rows.append(base)
    import pandas as pd

    d = pd.DataFrame([r for r in rows if r.get("status") == "scored"])
    out = {"scoredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "predictionsLockSha256": lock, "nQuestions": int(len(d)),
           "nNotScored": int(sum(1 for r in rows if r.get("status") != "scored")), "noiseFloorMAE": round(float(d.floor.mean()), 2) if len(d) else None}
    cl = d.survey.values if len(d) else np.array([])
    out["coverage"] = {m: round(float(d.get(f"{m}_answered", pd.Series(False, index=d.index)).fillna(False).mean()), 3) for m in METHODS}
    out["perMethod_ownAnswered"] = {m: summ(d[f"{m}_mae"].dropna()) for m in METHODS if f"{m}_mae" in d}
    for grp in ("category", "survey", "type", "measure"):
        out[f"by_{grp}"] = {str(k): {m: summ(g[f"{m}_mae"].dropna()) for m in METHODS if f"{m}_mae" in g and g[f"{m}_mae"].notna().any()} for k, g in d.groupby(grp)}
    # κοινές ερωτήσεις: όσες απαντούν ΟΛΕΣ οι μέθοδοι ενός ζεύγους
    pairs = {}
    for m1 in METHODS:
        for m2 in METHODS:
            if m1 >= m2 or f"{m1}_mae" not in d or f"{m2}_mae" not in d:
                continue
            c = d[d[f"{m1}_mae"].notna() & d[f"{m2}_mae"].notna()]
            if len(c) >= 3:
                x = (c[f"{m1}_mae"] - c[f"{m2}_mae"]).values
                pairs[f"{m1} − {m2}"] = {"n": int(len(c)), "nSurveys": int(c.survey.nunique()), "diff": round(float(x.mean()), 2), "ci80_cluster": cluster_ci(x, c.survey.values),
                                         m1: round(float(c[f"{m1}_mae"].mean()), 2), m2: round(float(c[f"{m2}_mae"].mean()), 2)}
    out["commonQuestionComparisons"] = pairs
    # κάλυψη διαστημάτων
    out["intervalCoverage"] = {m: {k: round(float(d[f"{m}_cov{k}"].dropna().mean()), 3) for k in Z if f"{m}_cov{k}" in d and d[f"{m}_cov{k}"].notna().any()}
                               for m in METHODS}
    out["intervalWidth"] = {m: {k: round(float(d[f"{m}_width{k}"].dropna().mean()), 2) for k in Z if f"{m}_width{k}" in d and d[f"{m}_width{k}"].notna().any()}
                            for m in METHODS}
    # αποχή της pie-0.7: αφαίρεσε τις χειρότερες προβλέψεις;
    if "pie-0.7_answered" in d and "pie-0.6_mae" in d:
        ab = d[~d["pie-0.7_answered"].fillna(False).astype(bool) & d["pie-0.6_mae"].notna()]
        an = d[d["pie-0.7_answered"].fillna(False).astype(bool) & d["pie-0.6_mae"].notna()]
        out["abstentionCheck"] = {"pie07_answered": int(len(an)), "pie07_abstained": int(len(ab)),
                                  "pie06_MAE_on_pie07_answered": round(float(an["pie-0.6_mae"].mean()), 2) if len(an) else None,
                                  "pie06_MAE_on_pie07_abstained": round(float(ab["pie-0.6_mae"].mean()), 2) if len(ab) else None,
                                  "UNIF_MAE_on_pie07_abstained": round(float(ab["UNIF_mae"].mean()), 2) if len(ab) and "UNIF_mae" in ab else None}
        tiers = {}
        for tval, g in d.groupby(d.get("pie-0.7x_tier")):
            tiers[str(tval)] = summ(g["pie-0.7x_mae"].dropna())
        out["errorByTier_pie07x"] = tiers
    json.dump({"summary": out, "rows": rows}, open(os.path.join(P, "scores.json"), "w"), ensure_ascii=False, indent=1, default=str)
    with open(os.path.join(ROOT, "docs", "synthetic-lab", "PHASE7A_GROUND_TRUTH.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(gt_rows[0].keys()) if gt_rows else ["survey"])
        w.writeheader()
        w.writerows(gt_rows)
    print(json.dumps(out, ensure_ascii=False, indent=1, default=str))


if __name__ == "__main__":
    main()
