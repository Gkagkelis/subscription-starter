"""CCE — διαχωρισμός ανά ερωτώμενο και μετρικές αξιολόγησης σε held-out πραγματικές επιλογές."""
from __future__ import annotations

import hashlib

import numpy as np
import pandas as pd

from .schema import ChoiceArrays


def respondent_split(resp_ids, frac=(0.6, 0.2, 0.2), salt="cce-0.1", strata=None):
    """Ντετερμινιστικός διαχωρισμός σε επίπεδο ΕΡΩΤΩΜΕΝΟΥ (hash του id + salt): καμία επιλογή του ίδιου ατόμου σε δύο σύνολα.
    strata (προαιρετικό dict id→ομάδα): διαχωρισμός μέσα σε κάθε ομάδα (π.χ. block του σχεδιασμού)."""
    ids = sorted(set(map(str, resp_ids)))
    groups = {}
    for i in ids:
        groups.setdefault(strata.get(i) if strata else "_", []).append(i)
    out = {}
    for g, members in groups.items():
        members = sorted(members, key=lambda i: hashlib.sha256(f"{salt}|{i}".encode()).hexdigest())
        n = len(members)
        a = int(round(frac[0] * n))
        b = int(round((frac[0] + frac[1]) * n))
        for k, i in enumerate(members):
            out[i] = "train" if k < a else "validation" if k < b else "test"
    return out


def per_situation(A: ChoiceArrays, p_rows: np.ndarray):
    n = len(A.y)
    lens = np.diff(np.r_[A.sit_start, n])
    p_chosen = np.add.reduceat(p_rows * A.y, A.sit_start)
    brier = np.add.reduceat((p_rows - A.y) ** 2, A.sit_start)
    # argmax ανά κατάσταση
    hit = []
    for s, (a, L) in enumerate(zip(A.sit_start, lens)):
        hit.append(float(A.y[a + int(np.argmax(p_rows[a:a + L]))] == 1))
    return p_chosen, brier, np.array(hit), lens


def metrics(A: ChoiceArrays, p_rows: np.ndarray, bins=10):
    pc, br, hit, lens = per_situation(A, p_rows)
    ll = -np.log(np.clip(pc, 1e-12, 1))
    # βαθμονόμηση: όλα τα ζεύγη (προβλεπόμενη πιθανότητα, παρατηρηθείσα επιλογή) σε δεκατημόρια
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p_rows, edges) - 1, 0, bins - 1)
    table = []
    ece = 0.0
    for b in range(bins):
        m = idx == b
        if m.sum() == 0:
            continue
        pm, om = float(p_rows[m].mean()), float(A.y[m].mean())
        table.append({"bin": f"{edges[b]:.1f}-{edges[b + 1]:.1f}", "n": int(m.sum()), "mean_pred": pm, "obs_rate": om})
        ece += m.sum() / len(p_rows) * abs(pm - om)
    # κλίση βαθμονόμησης (logit του chosen ~ logit p): απλή εκτίμηση με παλινδρόμηση στο logit
    return {"n_situations": int(len(pc)), "log_loss": float(ll.mean()), "brier": float(br.mean()), "accuracy": float(hit.mean()),
            "ece": float(ece), "calibration_table": table, "null_log_loss_uniform": float(np.log(lens).mean())}


def bootstrap_ci(A: ChoiceArrays, p_rows, B=1000, seed=1, other=None):
    """95% διάστημα (bootstrap ΕΡΩΤΩΜΕΝΩΝ) για log loss και για τη διαφορά log loss έναντι άλλου μοντέλου."""
    pc, _, _, _ = per_situation(A, p_rows)
    ll = -np.log(np.clip(pc, 1e-12, 1))
    R = A.sit_resp.max() + 1
    per_r = np.bincount(A.sit_resp, weights=ll, minlength=R)
    cnt = np.bincount(A.sit_resp, minlength=R)
    rng = np.random.default_rng(seed)
    out = {"log_loss": [], "diff": []}
    if other is not None:
        pc2, _, _, _ = per_situation(A, other)
        ll2 = -np.log(np.clip(pc2, 1e-12, 1))
        per_r2 = np.bincount(A.sit_resp, weights=ll2, minlength=R)
    for _ in range(B):
        s = rng.integers(0, R, R)
        c = cnt[s].sum()
        out["log_loss"].append(per_r[s].sum() / c)
        if other is not None:
            out["diff"].append((per_r[s].sum() - per_r2[s].sum()) / c)
    res = {"log_loss_ci95": [float(np.percentile(out["log_loss"], 2.5)), float(np.percentile(out["log_loss"], 97.5))]}
    if other is not None:
        res["diff_vs_other"] = float((per_r.sum() - per_r2.sum()) / cnt.sum())
        res["diff_ci95"] = [float(np.percentile(out["diff"], 2.5)), float(np.percentile(out["diff"], 97.5))]
    return res
