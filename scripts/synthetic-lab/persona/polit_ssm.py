"""
PHASE6 Part G — χρονικό μοντέλο δημοσκοπήσεων (state-space) με house effects· ιστορική αξιολόγηση ΧΩΡΙΣ διαρροή.

Για κάθε εκλογή E (βουλευτικές 2007–2023, ευρωεκλογές 2014/2024) και ορίζοντα h ∈ {0, 14, 30} ημέρες πριν:
  χρησιμοποιούνται ΜΟΝΟ δημοσκοπήσεις με λήξη πεδίου ≤ E − h και ΜΟΝΟ αποτελέσματα ΠΡΟΗΓΟΥΜΕΝΩΝ εκλογών
  (για house effects και συστηματική απόκλιση κλάδου). Το αποτέλεσμα της E χρησιμοποιείται μόνο για τη βαθμολόγηση.
Μέθοδοι:
  last14     απλός μέσος: τελευταία δημοσκόπηση κάθε εταιρείας στις 14 ημέρες πριν το όριο, μέσος εταιρειών (τρέχων Lab)
  kalman     τυχαίος περίπατος ανά κόμμα (logit), παρατηρήσεις με δειγματοληπτική + μη δειγματοληπτική διασπορά
  kalman_he  + house effects ανά εταιρεία×οικογένεια κόμματος από προηγούμενες εκλογές (συρρίκνωση)
  kalman_heb + συστηματική απόκλιση κλάδου ανά οικογένεια κόμματος από προηγούμενες εκλογές (συρρίκνωση)
Υπερπαράμετροι (q, σ μη δειγμ., συρρίκνωση): επιλογή ΜΟΝΟ σε εκλογές ≤ 2012 (ανάπτυξη)· 2014–2024 = δοκιμή εκτός χρόνου.
Μετρικές: MAE (π.μ.) στα κόμματα με ≥ 1% στο αποτέλεσμα, σφάλμα διαφοράς 1ου–2ου, κάλυψη 80% διαστημάτων.

  python3 -I scripts/synthetic-lab/persona/polit_ssm.py --root . --out <json>
"""
import argparse
import itertools
import json
import os
import time

import numpy as np
import pandas as pd

ELECTIONS = ["GR_parl_2007-09-16", "GR_parl_2009-10-04", "GR_parl_2012-05-06", "GR_parl_2012-06-17", "GR_ep_2014-05-25", "GR_parl_2015-01-25",
             "GR_parl_2015-09-20", "GR_parl_2019-07-07", "GR_parl_2023-05-21", "GR_parl_2023-06-25", "GR_ep_2024-06-09"]
DEV = {"GR_parl_2007-09-16", "GR_parl_2009-10-04", "GR_parl_2012-05-06", "GR_parl_2012-06-17"}


def load(root):
    T = os.path.join(root, ".synthetic-lab-data", "raw", "political", "tidy")
    pm = pd.read_csv(os.path.join(T, "party_map.csv"), dtype=str)
    lin = dict(zip(pm.party_key, pm.lineage_key.fillna(pm.party_key)))
    p = pd.read_csv(os.path.join(T, "polls_toplines.csv"), dtype=str)
    p = p[(p.poll_type == "poll") & (p.measure == "vote_estimate") & (p.scenario == "0") & (p.scope == "national") & p.possible_duplicate_of.isna()]
    p = p[~p.date_flag.fillna("").str.contains("missing")]
    p["v"] = pd.to_numeric(p.value_pct, errors="coerce")
    p["n"] = pd.to_numeric(p.sample_size, errors="coerce")
    p["t"] = pd.to_datetime(p.fieldwork_end, errors="coerce")
    p = p.dropna(subset=["v", "t"])
    p["party_key"] = p.party_key.map(lambda k: lin.get(k, k))
    p = p.groupby(["poll_id", "election_context", "pollster_norm", "party_key"], as_index=False).agg(v=("v", "sum"), n=("n", "first"), t=("t", "first"))
    e = pd.read_csv(os.path.join(T, "election_results.csv"), dtype=str)
    e = e[e.level == "national"]
    e["v"] = pd.to_numeric(e.pct_valid, errors="coerce")
    return p, e, lin


def result_of(e, eid, lin):
    r = e[e.election_id == eid].groupby("party_key").v.max()
    out = {}
    for k, v in r.items():
        k = lin.get(k, k)
        out[k] = out.get(k, 0) + v
    return out


def snapshot(p, eid, cutoff, lin):
    q = p[(p.election_context == eid) & (p.t <= cutoff)]
    return q


def last14(q, cutoff):
    q = q[q.t > cutoff - pd.Timedelta(days=14)]
    if q.empty:
        return None
    last = q.sort_values("t").groupby("pollster_norm").poll_id.last()
    q = q[q.poll_id.isin(last.values)]
    return q.groupby("party_key").v.mean().to_dict()


def logit(x):
    x = np.clip(x, 0.002, 0.998)
    return np.log(x / (1 - x))


def kalman(q, cutoff, q_var, sig_ns, he=None, bias=None, lin=None, horizon_days=0):
    """Ανά κόμμα: τυχαίος περίπατος στο logit μεριδίου· φίλτρο έως το όριο, πρόβλεψη στην ημέρα της εκλογής."""
    est, var = {}, {}
    for party, g in q.groupby("party_key"):
        g = g.sort_values("t")
        if len(g) < 2:
            continue
        x, P = None, None
        tprev = None
        for _, r in g.iterrows():
            y = logit(r.v / 100)
            fam = lin.get(party, party)
            if he is not None:
                y -= he.get((r.pollster_norm, fam), 0.0)
            n = r.n if np.isfinite(r.n) else 1000.0
            pp = np.clip(r.v / 100, 0.01, 0.99)
            R = 1 / (n * pp * (1 - pp)) + sig_ns ** 2
            if x is None:
                x, P = y, R + 1.0
            else:
                dt = max((r.t - tprev).days, 0)
                P = P + q_var * dt
                Kg = P / (P + R)
                x = x + Kg * (y - x)
                P = (1 - Kg) * P
            tprev = r.t
        dt = max((cutoff - tprev).days, 0) + horizon_days
        P = P + q_var * dt
        if bias is not None:
            x -= bias.get(lin.get(party, party), 0.0)
        est[party], var[party] = x, P
    if not est:
        return None, None
    s = {k: 1 / (1 + np.exp(-v)) for k, v in est.items()}
    tot = sum(s.values())
    return {k: 100 * v / max(tot, 1.0) if tot > 1 else 100 * v for k, v in s.items()}, var


def errors_prev(p, e, lin, before, shrink):
    """House effects (εταιρεία×οικογένεια) και κλαδική απόκλιση από τις τελευταίες 30 ημέρες προηγούμενων εκλογών."""
    rows = []
    for eid in ELECTIONS:
        if eid not in before:
            continue
        date = pd.Timestamp(eid.split("_")[-1])
        res = result_of(e, eid, lin)
        q = p[(p.election_context == eid) & (p.t > date - pd.Timedelta(days=30)) & (p.t <= date)]
        for _, r in q.iterrows():
            if r.party_key in res and res[r.party_key] >= 1:
                rows.append((r.pollster_norm, lin.get(r.party_key, r.party_key), logit(r.v / 100) - logit(res[r.party_key] / 100)))
    if not rows:
        return {}, {}
    d = pd.DataFrame(rows, columns=["firm", "fam", "err"])
    bias = d.groupby("fam").err.agg(["mean", "count"])
    bias = {f: float(m * c / (c + shrink)) for f, (m, c) in bias.iterrows()}
    d["res"] = d.err - d.fam.map(bias)
    he = d.groupby(["firm", "fam"]).res.agg(["mean", "count"])
    he = {k: float(m * c / (c + shrink)) for k, (m, c) in he.iterrows()}
    return he, bias


def score(pred, res, top=1.0):
    parties = [k for k, v in res.items() if v >= top]
    errs = [abs(pred.get(k, 0.0) - res[k]) for k in parties if k in pred]
    miss = [k for k in parties if k not in pred]
    srt = sorted(res, key=res.get, reverse=True)[:2]
    lead = abs((pred.get(srt[0], 0) - pred.get(srt[1], 0)) - (res[srt[0]] - res[srt[1]]))
    return {"MAE": float(np.mean(errs)) if errs else None, "nParties": len(errs), "missing": miss, "leadErr": float(lead)}


def run(p, e, lin, params, elections, horizons=(0, 14, 30)):
    out = []
    for i, eid in enumerate(ELECTIONS):
        if eid not in elections:
            continue
        date = pd.Timestamp(eid.split("_")[-1])
        before = set(ELECTIONS[:i])
        res = result_of(e, eid, lin)
        he, bias = errors_prev(p, e, lin, before, params["shrink"])
        for h in horizons:
            cutoff = date - pd.Timedelta(days=h + 1)
            q = snapshot(p, eid, cutoff, lin)
            q = q[q.t > cutoff - pd.Timedelta(days=180)]
            if q.empty:
                continue
            preds = {"last14": last14(q, cutoff)}
            preds["kalman"], v0 = kalman(q, cutoff, params["q"], params["sig"], lin=lin, horizon_days=h)
            preds["kalman_he"], _ = kalman(q, cutoff, params["q"], params["sig"], he=he, lin=lin, horizon_days=h)
            preds["kalman_heb"], vb = kalman(q, cutoff, params["q"], params["sig"], he=he, bias=bias, lin=lin, horizon_days=h)
            for m, pr in preds.items():
                if pr is None:
                    continue
                s = score(pr, res)
                if m.startswith("kalman") and vb:
                    # 80% διάστημα στο logit → ποσοστά
                    cov = []
                    for k in res:
                        if res[k] >= 1 and k in pr and k in vb:
                            sd = params.get("c", 1.0) * np.sqrt(vb[k] + params["sig"] ** 2)
                            lo, hi = [100 / (1 + np.exp(-(logit(pr[k] / 100) + z * sd))) for z in (-1.2816, 1.2816)]
                            cov.append(lo <= res[k] <= hi)
                    s["cover80"] = float(np.mean(cov)) if cov else None
                out.append({"election": eid, "h": h, "method": m, "nPolls": int(q.poll_id.nunique()), **s})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    p, e, lin = load(root)
    grid = [{"q": q, "sig": s, "shrink": k} for q, s, k in itertools.product((1e-5, 5e-5, 2e-4), (0.05, 0.1, 0.2), (5, 20, 80))]
    best, bscore = None, 1e9
    for g in grid:
        r = pd.DataFrame(run(p, e, lin, g, DEV & set(ELECTIONS[2:]), horizons=(0, 14)))
        if r.empty:
            continue
        sc = r[r.method == "kalman_heb"].MAE.mean()
        if sc < bscore:
            best, bscore = g, sc
    # πλάτος διαστημάτων: συντελεστής c ώστε κάλυψη 80% στην ανάπτυξη (≤ 2012)
    cbest = min((1, 1.5, 2, 2.5, 3, 4, 5, 6), key=lambda c: abs(pd.DataFrame(run(p, e, lin, dict(best, c=c), DEV, horizons=(0, 14))).query("method=='kalman_heb'").cover80.mean() - 0.8))
    best = dict(best, c=cbest)
    test = pd.DataFrame(run(p, e, lin, best, set(ELECTIONS) - DEV))
    dev = pd.DataFrame(run(p, e, lin, best, DEV))
    summ = test.groupby(["h", "method"]).agg(MAE=("MAE", "mean"), leadErr=("leadErr", "mean"), cover80=("cover80", "mean"), n=("election", "count")).round(3)
    print("παράμετροι (ανάπτυξη ≤ 2012):", best, round(bscore, 3))
    print(summ.to_string())
    json.dump({"createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "params": best, "devMAE": round(float(bscore), 3),
               "testSummary": {f"{h}|{m}": r.to_dict() for (h, m), r in summ.iterrows()}, "test": test.to_dict("records"), "dev": dev.to_dict("records")},
              open(a.out, "w"), ensure_ascii=False, indent=1, default=str)


if __name__ == "__main__":
    main()
