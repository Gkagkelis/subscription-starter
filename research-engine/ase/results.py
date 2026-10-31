"""Συγκέντρωση αποτελεσμάτων από τις ατομικές απαντήσεις (μόνο από τις εγγραφές· κανένα ποσοστό δεν ορίζεται αλλιώς).

results.csv : question_id, block, question, type, option_code, option_label, n_base, n, pct (κληρωμένες απαντήσεις),
              mean_probability_pct (μέσος όρος κατανομών, όπου υπάρχει), stat (για numeric/ranking)
crosstabs.csv: ίδια ανά μεταβλητή προφίλ (ηλικία, φύλο, περιφέρεια, εισόδημα, εκπαίδευση) για κλειστές ερωτήσεις.
Δεν υπολογίζεται περιθώριο σφάλματος δειγματοληψίας (συνθετικό πάνελ)."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from .util import read_table

XT_VARS = ["age_band", "gender", "region", "income_quintile", "education"]
REGION_GROUP = {"Αττική": "Αττική", "Κεντρική Μακεδονία": "Κεντρική Μακεδονία"}


def _labels(q, row=None):
    if q.type == "dce" and row is not None and row.get("dce_task"):
        return {a["id"]: a["label"] for a in json.loads(row["dce_task"])["alternatives"]}
    return {o.code: o.label for o in q.options}


def _closed_counts(q, sub: pd.DataFrame):
    vals = sub["response"].map(json.loads)
    if q.type == "multiple_choice":
        flat = [c for v in vals for c in v]
        return pd.Series(flat).value_counts(), len(sub)
    if q.type == "ranking":
        firsts = [v[0] for v in vals if v]
        return pd.Series(firsts).value_counts(), len(sub)
    return vals.map(str).value_counts(), len(sub)


def aggregate(study, run_id):
    df = study.responses(run_id)
    df = df[df["status"] == "ANSWERED"]
    resp = read_table(study.internal / "respondents")
    df = df.merge(resp[["respondent_id"] + XT_VARS], on="respondent_id", how="left")
    rows, xrows = [], []
    for q in study.qn.questions:
        sub = df[df["question_id"] == q.id]
        if sub.empty:
            continue
        lab = _labels(q, sub.iloc[0])
        if q.type == "numeric":
            v = sub["response"].map(json.loads).astype(float)
            for stat, val in (("mean", v.mean()), ("median", v.median()), ("p25", v.quantile(.25)), ("p75", v.quantile(.75))):
                rows.append({"question_id": q.id, "block": q.block, "question": q.text, "type": q.type, "option_code": stat, "option_label": stat, "n_base": len(v),
                             "n": len(v), "pct": "", "mean_probability_pct": "", "stat": round(float(val), 2)})
            continue
        if q.type == "open":
            rows.append({"question_id": q.id, "block": q.block, "question": q.text, "type": q.type, "option_code": "answered", "option_label": "Απάντησαν",
                         "n_base": len(sub), "n": len(sub), "pct": 100.0, "mean_probability_pct": "", "stat": ""})
            continue
        cnt, base = _closed_counts(q, sub)
        mp = {}
        if q.type in ("single_choice", "likert", "scenario", "dce"):
            dists = sub["distribution"].map(lambda s: json.loads(s) if s else None).dropna()
            if len(dists):
                mp = pd.DataFrame(list(dists)).mean().mul(100).to_dict()
        codes = list(lab) if q.type != "dce" else sorted(set(cnt.index) | set(lab))
        for c in codes:
            rows.append({"question_id": q.id, "block": q.block, "question": q.text, "type": q.type, "option_code": c, "option_label": lab.get(c, c), "n_base": base,
                         "n": int(cnt.get(c, 0)), "pct": round(100 * cnt.get(c, 0) / base, 1), "mean_probability_pct": round(mp[c], 1) if c in mp else "",
                         "stat": "mean_rank" if q.type == "ranking" else ""})
        for var in XT_VARS:
            for lvl, g in sub.groupby(var):
                c2, b2 = _closed_counts(q, g)
                for c in codes:
                    xrows.append({"question_id": q.id, "variable": var, "level": lvl, "option_code": c, "option_label": lab.get(c, c), "n_base": b2,
                                  "n": int(c2.get(c, 0)), "pct": round(100 * c2.get(c, 0) / b2, 1) if b2 else ""})
    return pd.DataFrame(rows), pd.DataFrame(xrows)
