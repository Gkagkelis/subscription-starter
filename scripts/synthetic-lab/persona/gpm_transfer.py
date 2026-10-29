"""
PHASE6 Part F — προηγμένη διεθνής μεταφορά έναντι της ισχυρής γραμμής βάσης B5 (Phase 5).

Δεδομένα: οι αποθηκευμένες προβλέψεις ανάπτυξης της Phase 5 (eval-dev.json, 3.303 ελληνικοί στόχοι, 26 έρευνες, adj=false)·
οι ελληνικές απαντήσεις των στόχων ΔΕΝ μπήκαν στις προβλέψεις. Επιλογή μοντέλου με leave-one-survey-out (LOSO).
Υποψήφια:
  B5               5 εμπειρικά πλησιέστερες χώρες (Phase 5, κλειδωμένο)
  shrink           ιεραρχική μερική συγκέντρωση: B5 → μέσος χωρών με βάρος που εξαρτάται από τη διαφωνία τους (εκτίμηση τ² / σ²)
  Bdom5            γείτονες ανά τομέα
  C3               διακρατικό λανθάνον μοντέλο (ALS, rank 3) — ισοδύναμο σε επίπεδο χώρας με multi-group factor model
  MoE              μείγμα ειδικών με επίγνωση αρνητικής μεταφοράς: βάρη softmax(Wx) πάνω σε {B5, pool, C3, Bdom5}, x = τομέας,
                   Κ, log αριθμού χωρών, διαφωνίες μεταξύ ειδικών, εντροπία· εκπαίδευση με ελαχιστοποίηση MAE (LOSO)
  DIF-flag         ερωτήσεις όπου οι γείτονες διαφωνούν έντονα με τον μέσο (|B5 − pool| στο άνω 10%) → αναφορά ως πιθανό DIF
Ελληνικά δεδομένα για τα βάρη: ΚΑΝΕΝΑ από τον στόχο (LOSO ανά έρευνα).

  python3 -I scripts/synthetic-lab/persona/gpm_transfer.py --root . --out <json>
"""
import argparse
import json
import os
import time

import numpy as np
import pandas as pd
from scipy.optimize import minimize

EXPERTS = ["B5|R0", "pool", "C3_10|R0", "Bdom5|R0"]
DOMS = ["CONSUMER", "ECONOMIC", "MEDIA_TECH", "POLITICAL", "SOCIAL"]


def feats(t):
    P = {e: np.array(t["pred"][e]) for e in EXPERTS}
    d = lambda a, b: float(np.mean(np.abs(P[a] - P[b])))
    pool = P["pool"] / 100
    ent = float(-(pool * np.log(np.clip(pool, 1e-6, 1))).sum() / np.log(len(pool)))
    x = [1.0] + [float(t["domain"] == k) for k in DOMS[1:]] + [np.log(t["nCountries"]), t["K"] / 10, d("B5|R0", "pool") / 10, d("B5|R0", "C3_10|R0") / 10,
                                                          d("Bdom5|R0", "B5|R0") / 10, ent, float(t["type"] == "binary")]
    return np.array(x), np.stack([P[e] for e in EXPERTS])


def pad(P, Y):
    Km = max(len(y) for y in Y)
    Pp = np.zeros((len(Y), P[0].shape[0], Km))
    Yp = np.zeros((len(Y), Km))
    M = np.zeros((len(Y), Km))
    for i, (p, y) in enumerate(zip(P, Y)):
        Pp[i, :, : len(y)] = p
        Yp[i, : len(y)] = y
        M[i, : len(y)] = 1.0 / len(y)
    return Pp, Yp, M


def moe_fit(X, P, Y, lam=0.01):
    nx, ne = X.shape[1], P[0].shape[0]
    Pp, Yp, M = pad(P, Y)

    def loss(w):
        W = w.reshape(nx, ne)
        S = X @ W
        S -= S.max(axis=1, keepdims=True)
        A = np.exp(S)
        A /= A.sum(axis=1, keepdims=True)
        pred = np.einsum("ie,iek->ik", A, Pp)
        return float((np.abs(pred - Yp) * M).sum() / len(Y)) + lam * float(w @ w)

    w0 = np.zeros(nx * ne)
    w0[0] = 1.0  # προεπιλογή ≈ B5
    r = minimize(loss, w0, method="Powell", options={"maxiter": 20000, "xtol": 1e-3, "ftol": 1e-5})
    return r.x.reshape(nx, ne)


def moe_pred(W, x, P):
    s = x @ W
    a = np.exp(s - s.max())
    a /= a.sum()
    return a @ P, a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    gd = os.path.join(root, ".synthetic-lab-data", "global-behavior-evidence", "v1")
    T = [t for t in json.load(open(os.path.join(gd, "eval-dev.json")))["targets"] if not t["adj"]]
    X, P, Y, S = [], [], [], []
    for t in T:
        x, p = feats(t)
        X.append(x)
        P.append(p)
        Y.append(np.array(t["truth"]))
        S.append(t["survey"])
    X, S = np.array(X), np.array(S)
    rows = []
    for s in sorted(set(S)):
        tr, te = S != s, S == s
        idx_tr = np.where(tr)[0]
        # υποδειγματοληψία για ταχύτητα (σταθερή)
        rng = np.random.default_rng(0)
        sub = idx_tr
        W = moe_fit(X[sub], [P[i] for i in sub], [Y[i] for i in sub])
        # ιεραρχική συρρίκνωση: βάρος B5 = τ² / (τ² + κ·d²), κ από ανάπτυξη (απλό πλέγμα)
        best_k, best_e = None, 1e9
        for kk in (0.0, 0.5, 1, 2, 4, 8):
            e = 0.0
            for i in sub:
                dd = np.mean(np.abs(P[i][0] - P[i][1]))
                wb = 1 / (1 + kk * (dd / 10) ** 2)
                e += np.mean(np.abs(wb * P[i][0] + (1 - wb) * P[i][1] - Y[i]))
            if e < best_e:
                best_k, best_e = kk, e
        for i in np.where(te)[0]:
            pm, aw = moe_pred(W, X[i], P[i])
            dd = np.mean(np.abs(P[i][0] - P[i][1]))
            wb = 1 / (1 + best_k * (dd / 10) ** 2)
            r = {"survey": s, "item": T[i]["item"], "domain": T[i]["domain"], "dis": float(dd)}
            for j, e in enumerate(EXPERTS):
                r[e] = float(np.mean(np.abs(P[i][j] - Y[i])))
            r["shrink"] = float(np.mean(np.abs(wb * P[i][0] + (1 - wb) * P[i][1] - Y[i])))
            r["MoE"] = float(np.mean(np.abs(pm - Y[i])))
            r["wB5"] = float(aw[0])
            rows.append(r)
        print(s, "κ", best_k, flush=True)
    d = pd.DataFrame(rows)
    meths = EXPERTS + ["shrink", "MoE"]
    out = {"createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "n": int(len(d)),
           "MAE": {m: round(float(d[m].mean()), 3) for m in meths},
           "byDomain": {k: {m: round(float(g[m].mean()), 3) for m in meths} for k, g in d.groupby("domain")},
           "surveysWhereBetterThanB5": {m: int((d.groupby("survey")[m].mean() < d.groupby("survey")["B5|R0"].mean()).sum()) for m in meths},
           "nSurveys": int(d.survey.nunique())}
    # διάστημα 80% (cluster bootstrap ανά έρευνα) για MoE − B5 και shrink − B5
    rng = np.random.default_rng(9)
    us = d.survey.unique()
    for m in ("MoE", "shrink"):
        x = (d[m] - d["B5|R0"]).values
        g = {u: np.where(d.survey.values == u)[0] for u in us}
        bs = [np.concatenate([x[g[u]] for u in rng.choice(us, len(us))]).mean() for _ in range(2000)]
        out[f"{m}-B5"] = {"diff": round(float(x.mean()), 3), "ci80": [round(float(np.quantile(bs, 0.1)), 3), round(float(np.quantile(bs, 0.9)), 3)]}
    # DIF: ερωτήσεις με μεγάλη διαφωνία γειτόνων–μέσου
    q = d.dis.quantile(0.9)
    out["difFlag"] = {"threshold_pp": round(float(q), 2), "B5_MAE_flagged": round(float(d[d.dis >= q]["B5|R0"].mean()), 2), "pool_MAE_flagged": round(float(d[d.dis >= q]["pool"].mean()), 2),
                      "B5_MAE_rest": round(float(d[d.dis < q]["B5|R0"].mean()), 2)}
    json.dump(out, open(a.out, "w"), ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
