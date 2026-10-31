"""Ανάλυση ευαισθησίας για ερωτήσεις που εξαρτώνται από μη ταυτοποιημένη βάση (π.χ. εμπιστοσύνη/γνωριμία συγκεκριμένης μάρκας
χωρίς μέτρηση της μάρκας). Από τις αποθηκευμένες ατομικές κατανομές υπολογίζεται το μερίδιο των «θετικών» απαντήσεων αν η βάση
μετατοπιστεί κατά δ στην κλίμακα logit (διατεταγμένες: σωρευτικό logit· ονομαστικές: logit της θετικής επιλογής).
ΔΕΝ είναι διάστημα εμπιστοσύνης: δείχνει πόσο αλλάζει ένα συμπέρασμα αν η άγνωστη βάση της μάρκας είναι υψηλότερη/χαμηλότερη."""
from __future__ import annotations

import json

import numpy as np


def _sig(x):
    return 1 / (1 + np.exp(-x))


def _logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def positive_codes(q) -> list[str]:
    codes = [o.code for o in q.options]
    if q.type == "likert" and len(codes) >= 4:
        return codes[-2:]
    return codes[:1]


def shifted_share(dist: dict, codes: list[str], pos: list[str], delta: float, ordinal: bool) -> float:
    p = np.array([float(dist.get(c, 0)) for c in codes])
    p = p / p.sum() if p.sum() > 0 else np.ones(len(codes)) / len(codes)
    if ordinal:
        cum = np.cumsum(p[::-1])[::-1]                       # P(Y ≥ k)
        cum_s = np.concatenate([[1.0], _sig(_logit(cum[1:]) + delta)])
        q = -np.diff(np.concatenate([cum_s, [0.0]]))
    else:
        i = [codes.index(c) for c in pos]
        a = p[i].sum()
        a2 = _sig(_logit(a) + delta)
        q = p.copy()
        rest = 1 - a
        q[i] = p[i] / a * a2 if a > 0 else a2 / len(i)
        mask = np.ones(len(p), bool)
        mask[i] = False
        q[mask] = p[mask] / rest * (1 - a2) if rest > 0 else (1 - a2) / mask.sum()
    return float(sum(q[codes.index(c)] for c in pos))


def run(study, run_id, shifts=(-1.0, -0.5, 0.0, 0.5, 1.0)) -> dict:
    df = study.responses(run_id)
    if "brand_dependent" not in df.columns:
        return {}
    df = df[(df["status"] == "ANSWERED") & (df["brand_dependent"].astype(str).isin(["True", "true", "1"])) & (df["distribution"].astype(str) != "")]
    qby = study.qn.by_id()
    out = {}
    for qid, g in df.groupby("question_id"):
        q = qby[qid]
        if q.type not in ("single_choice", "likert", "scenario"):
            continue
        codes, pos = [o.code for o in q.options], positive_codes(q)
        dists = [json.loads(x) for x in g["distribution"]]
        res = {}
        for d in shifts:
            res[str(d)] = round(100 * float(np.mean([shifted_share(x, codes, pos, d, q.type == "likert") for x in dists])), 1)
        out[qid] = {"positive_options": pos, "labels": [o.label for o in q.options if o.code in pos], "n": len(dists), "share_by_logit_shift": res,
                    "note": "Μετατόπιση της άγνωστης βάσης της μάρκας· όχι διάστημα εμπιστοσύνης."}
    return out
