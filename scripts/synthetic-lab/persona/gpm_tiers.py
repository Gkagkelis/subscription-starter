"""
PHASE6 Part J — βαθμίδες τεκμηρίωσης και αποχή, βαθμονομημένες σε ΠΡΑΓΜΑΤΙΚΑ σφάλματα ήδη βαθμολογημένων holdouts.

Πηγές σφαλμάτων (όλες ήδη αποκαλυμμένες· χρησιμοποιούνται ΜΟΝΟ για βαθμονόμηση κανόνων, όχι ως νέα επικύρωση):
  Tier 1  ίδια ερώτηση, ελληνικά δεδομένα προηγούμενου κύματος → διαΝΕΟσις 2024 «repeated» (PIE, persona final)
  Tier 2  σχετική ελληνική ερώτηση (IQGE paraphrase/related, sim ≥ 0,65) → Phase 4 H1–H7
  Tier 3  ισοδύναμη διεθνής ερώτηση (B5) → Phase 5 S1 τελικό (2.567)
  Tier 4  πειραματική συμπερασματολογία (IQGE weak· S2 παραλλαγή C) → Phase 4 H1–H7 weak, Phase 5 S2 τελικό
Για κάθε βαθμίδα: MAE, διάμεσος, RMSE, 90ό εκατοστημόριο (χειρότερο δέκατο), μεροληψία έναντι ομοιόμορφης, κάλυψη 80%.
Κανόνας αποχής: απάντηση μόνο όταν το ΑΝΑΜΕΝΟΜΕΝΟ πλεονέκτημα έναντι της ομοιόμορφης κατανομής (εκτιμημένο με isotonic
regression σε σήμα κινδύνου που υπάρχει τη στιγμή της πρόβλεψης) είναι ≥ δ π.μ.· το δ και το σήμα επιλέγονται με διασταυρούμενη
προσαρμογή ανά έρευνα (leave-one-survey-out), όχι αυθαίρετα. Καμπύλες επιλεκτικού κινδύνου (risk–coverage).

  python3 -I scripts/synthetic-lab/persona/gpm_tiers.py --root . --out <json>
"""
import argparse
import json
import os
import time

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression


def load_rows(root):
    rows = []
    b = json.load(open(os.path.join(root, ".synthetic-lab-data", "persona", "benchmarks", "final-fix-selected.json")))
    for f, v in b["files"].items():
        for it in v["items"]:
            if it.get("kind") == "repeated" and it.get("PIE") is not None:
                rows.append({"tier": 1, "src": "persona_final_dn2024", "survey": f, "item": it["item"], "err": it["PIE"], "unif": it["B_unif"], "risk": 0.0, "K": it["K"]})
    p4 = json.load(open(os.path.join(root, ".synthetic-lab-data", "persona", "phase4", "final", "predictions.json")))["holdouts"]
    sim = {it["id"]: it.get("sim1") for h in p4.values() for it in h["items"]}
    sc = json.load(open(os.path.join(root, ".synthetic-lab-data", "persona", "phase4", "final", "scores.json")))["rows"]
    for r in sc:
        t = 2 if r["tier"] in ("paraphrase", "related") else 4
        rows.append({"tier": t, "src": "phase4_iqge", "survey": r["holdout"], "item": r["id"], "err": r["iqge"], "unif": r["unif"], "risk": -(sim.get(r["id"]) or 0.0), "K": r["K"],
                     "cov80": r.get("cov80")})
    gd = os.path.join(root, ".synthetic-lab-data", "global-behavior-evidence", "v1")
    pf = json.load(open(os.path.join(gd, "predictions-final.json")))["surveys"]
    dis = {}
    for s, v in pf.items():
        for it in v["items"]:
            dis[it["item"]] = float(np.mean(np.abs(np.array(it["pred"]) - np.array(it["pool"]))))
    for r in json.load(open(os.path.join(gd, "scores-final.json")))["rows"]:
        rows.append({"tier": 3, "src": "phase5_s1_B5", "survey": r["survey"], "item": r["item"], "err": r["pred"], "unif": r["unif"], "risk": dis.get(r["item"], 0.0), "K": r["K"],
                     "domain": r["domain"], "cov80": r.get("cov80")})
    for r in json.load(open(os.path.join(gd, "s2-scores-final.json")))["rows"]:
        rows.append({"tier": 4, "src": "phase5_s2_C", "survey": r["survey"], "item": r["item"], "err": r["C"], "unif": r["unif"], "risk": 0.0, "K": None})
    return pd.DataFrame(rows)


def summary(d):
    e = d.err.values
    return {"n": int(len(d)), "MAE": round(float(e.mean()), 2), "median": round(float(np.median(e)), 2), "RMSE": round(float(np.sqrt((e ** 2).mean())), 2),
            "p90": round(float(np.quantile(e, 0.9)), 2), "uniformMAE": round(float(d.unif.mean()), 2), "gainVsUniform": round(float((d.unif - d.err).mean()), 2),
            "shareWorseThanUniform": round(float((d.err > d.unif).mean()), 3), "cover80": round(float(d.cov80.dropna().mean()), 3) if "cov80" in d and d.cov80.notna().any() else None}


def selective(d, deltas=(0.0, 1.0, 2.0)):
    """Leave-one-survey-out: isotonic πρόβλεψη του πλεονεκτήματος (unif − err) από το σήμα κινδύνου· απάντηση όταν ≥ δ."""
    out = {}
    for delta in deltas:
        keep = np.zeros(len(d), dtype=bool)
        for s in d.survey.unique():
            tr, te = d.survey != s, d.survey == s
            if tr.sum() < 30 or d[tr].risk.nunique() < 2:
                keep[te.values] = (d[tr].unif - d[tr].err).mean() >= delta
                continue
            iso = IsotonicRegression(increasing=False, out_of_bounds="clip").fit(d[tr].risk, d[tr].unif - d[tr].err)
            keep[te.values] = iso.predict(d[te].risk) >= delta
        k = d[keep]
        out[str(delta)] = {"coverage": round(float(keep.mean()), 3), "MAE_answered": round(float(k.err.mean()), 2) if len(k) else None,
                           "uniform_answered": round(float(k.unif.mean()), 2) if len(k) else None,
                           "MAE_abstained": round(float(d[~keep].err.mean()), 2) if (~keep).any() else None}
    # καμπύλη κινδύνου–κάλυψης (ταξινόμηση κατά σήμα)
    o = d.sort_values("risk")
    cum = np.cumsum(o.err.values) / np.arange(1, len(o) + 1)
    curve = [{"coverage": round(c, 2), "MAE": round(float(cum[max(int(c * len(o)) - 1, 0)]), 2)} for c in (0.1, 0.25, 0.5, 0.75, 0.9, 1.0)]
    return out, curve


LABELS = {"1": "Άμεσο ελληνικό τεκμήριο", "2": "Επικυρωμένο σχετικό ελληνικό τεκμήριο", "3": "Επικυρωμένη διεθνής μεταφορά",
          "4": "Πειραματική συμπερασματολογία", "5": "Ανεπαρκές τεκμήριο"}


def export_policy(root, rep):
    """Πολιτική runtime (config/synthetic-lab/persona/gpm/evidence-tiers.json) από τα βαθμονομημένα σφάλματα."""
    T = rep["tiers"]
    src = {"1": "persona final (διαΝΕΟσις 2024, ίδια ερώτηση)", "2": "Phase 4 H1–H7 (IQGE paraphrase/related)", "3": "Phase 5 S1 τελικό (B5)", "4": "Phase 4 weak + Phase 5 S2 C"}
    tiers = {}
    for k in ("1", "2", "3", "4"):
        v = T[k]
        # επικυρωμένη = σαφές πλεονέκτημα έναντι της ομοιόμορφης (≥ 5 π.μ.) και ≤ 20% χειρότερες από αυτήν
        valid = v["gainVsUniform"] >= 5 and v["shareWorseThanUniform"] <= 0.2
        tiers[k] = {"label": LABELS[k], "validated": bool(valid), "expectedMAE": v["MAE"], "medianAE": v["median"], "p90": v["p90"], "cover80": v["cover80"],
                    "uniformMAE": v["uniformMAE"], "n": v["n"], "source": src[k]}
    tiers["5"] = {"label": LABELS["5"], "validated": False, "expectedMAE": None, "medianAE": None, "p90": None, "cover80": None, "uniformMAE": None, "n": 0, "source": "—"}
    pol = {"version": "evidence-1", "calibratedAt": rep["createdAt"][:10], "tiers": tiers,
           "rules": {"greekRelatedOnly": "abstain" if not tiers["2"]["validated"] else "experimental", "relatedEquivalentLink": "abstain", "driftYears": 4, "voteCurrentMonths": 3},
           "note": "Βαθμίδες = κατηγορίες τεκμηρίου, όχι εγγύηση ακρίβειας. Βαθμονόμηση σε ήδη βαθμολογημένα holdouts (gpm_tiers.py)."}
    p = os.path.join(root, "config", "synthetic-lab", "persona", "gpm", "evidence-tiers.json")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(pol, open(p, "w"), ensure_ascii=False, indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    d = load_rows(root)
    rep = {"createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "tiers": {}, "bySource": {}}
    for t, g in d.groupby("tier"):
        rep["tiers"][str(t)] = summary(g)
        sel, curve = selective(g)
        rep["tiers"][str(t)]["selective"] = sel
        rep["tiers"][str(t)]["riskCoverage"] = curve
    for s, g in d.groupby("src"):
        rep["bySource"][s] = summary(g)
    if "domain" in d:
        rep["tier3ByDomain"] = {k: summary(g) for k, g in d[d.tier == 3].groupby("domain")}
    rep["tier4BySurvey"] = {k: summary(g) for k, g in d[d.tier == 4].groupby("survey")}
    json.dump(rep, open(a.out, "w"), ensure_ascii=False, indent=1)
    export_policy(root, rep)
    for t, v in rep["tiers"].items():
        print("Tier", t, {k: v[k] for k in ("n", "MAE", "median", "p90", "uniformMAE", "gainVsUniform", "shareWorseThanUniform", "cover80")}, v["selective"])


if __name__ == "__main__":
    main()
