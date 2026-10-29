"""
PHASE6 Part H — υβριδική έρευνα: μικρό ΠΡΑΓΜΑΤΙΚΟ δείγμα πελάτη (n = 200–500) + πληθυσμιακό μοντέλο.
Ερώτημα: βελτιώνει το μοντέλο την εκτίμηση των πληθυσμιακών ποσοστών ΣΕ ΣΧΕΣΗ με την ανάλυση του ίδιου του δείγματος;

Προσομοίωση σε πραγματικές ελληνικές έρευνες (ανάπτυξη· όχι τελικό holdout):
  στόχος  = ESS11 (2024)  · πλαίσιο πληθυσμού = ESS10 (2021–22) — άλλο δείγμα, προηγούμενο κύμα (περιλαμβάνει χρονική μετατόπιση)
  στόχος  = EB 101.3 (2024) · πλαίσιο = EB 100.2 (2023)
  «αλήθεια» = σταθμισμένα περιθώρια ΟΛΟΥ του δείγματος-στόχου (με το δικό τους δειγματοληπτικό σφάλμα, που αναφέρεται)
Σενάρια επιλογής του δείγματος πελάτη: SRS (τυχαίο) και BIASED (τύπου online panel: υπερ-αντιπροσώπευση νέων και αποφοίτων).
Το δείγμα πελάτη απαντά: δημογραφικά + τις ερωτήσεις-στόχους + Α ερωτήσεις-άγκυρες (κοινές με το πλαίσιο).
Εκτιμητές:
  direct   σταθμισμένος μέσος του δείγματος (βάρη έρευνας)
  rake     raking στα δημογραφικά περιθώρια του πληθυσμού (ηλικία, φύλο, μόρφωση)
  mrp      πολυωνυμική λογιστική (L2) στα δημογραφικά → μεταστρωμάτωση στο πλαίσιο
  gpm      ίδια + κανονικά σκορ των αγκυρών → πρόβλεψη στους ερωτώμενους του πλαισίου (κοινή κατανομή δημογραφικών × αγκυρών)
  synth1000  1.000 συνθετικοί ερωτώμενοι από το gpm (για να φανεί ότι ΔΕΝ προσθέτουν πληροφορία)

  python3 -I scripts/synthetic-lab/persona/gpm_hybrid.py --root . --out <json>
"""
import argparse
import hashlib
import json
import os
import sys
import time
import warnings

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gpm_core as GC  # noqa: E402

warnings.filterwarnings("ignore")
DEMO = ["age_band", "gender", "edu3"]
PAIRS = [("ess11", "ess10"), ("eb1013", "eb1002")]


def onehot(R, rows, levels):
    cols = []
    for c in DEMO:
        v = R[c].values[rows].astype(str)
        for lev in levels[c][1:]:
            cols.append((v == lev).astype(float))
    return np.column_stack(cols)


def rake(sample_demo, w, targets, iters=50):
    w = w.copy()
    for _ in range(iters):
        for c, t in targets.items():
            v = sample_demo[c]
            for lev, p in t.items():
                m = v == lev
                s = w[m].sum()
                if s > 0:
                    w[m] *= p * w.sum() / s
    return w


def wdist(y, w, K):
    p = np.bincount(y, weights=w, minlength=K)
    return p / p.sum()


def fit_predict(Xs, ys, ws, Xf, wf, K, C=0.5):
    present = np.unique(ys)
    if len(present) == 1:
        p = np.zeros(K)
        p[present[0]] = 1
        return p, None
    m = LogisticRegression(C=C, max_iter=300)
    m.fit(Xs, ys, sample_weight=ws / ws.mean())
    P = np.zeros((len(Xf), K))
    P[:, m.classes_] = m.predict_proba(Xf)
    return np.average(P, axis=0, weights=wf), m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--out", required=True)
    ap.add_argument("--reps", type=int, default=20)
    ap.add_argument("--targets", type=int, default=60)
    ap.add_argument("--anchors", type=int, default=8)
    ap.add_argument("--scens", default="SRS,BIASED,ATTBIAS")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    R, X, meta = GC.load_grim(root)
    X = X.tocsr()
    out = {"createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "results": {}}
    for tgt, frm in PAIRS:
        rt = np.where(R.survey.values == tgt)[0]
        rf = np.where(R.survey.values == frm)[0]
        ct = [m["col"] for m in meta if m["survey"] == tgt and m["type"] in ("ordinal", "binary")]
        cf = {m["link"]: m["col"] for m in meta if m["survey"] == frm and m["type"] in ("ordinal", "binary")}
        St, Sf = X[rt][:, ct].toarray(), None
        # άγκυρες: κοινές ερωτήσεις στόχου–πλαισίου με την υψηλότερη κάλυψη (κανόνας, χωρίς να κοιτάζουμε στόχους)
        shared = [(j, meta[c]["link"]) for j, c in enumerate(ct) if meta[c]["link"] in cf and meta[c]["src"] != "anchor"]
        # προκαθορισμένος κανόνας: οι πιο «γεφυρωτικές» ερωτήσεις του GPM (οικογένεια σε περισσότερες έρευνες), με κάλυψη ≥ 90%
        nsurv = {}
        for mm in meta:
            nsurv.setdefault(mm["link"], set()).add(mm["survey"])
        shared = [x for x in shared if (St[:, x[0]] > 0).mean() >= 0.9]
        cover = sorted(shared, key=lambda x: (-len(nsurv[x[1]]), hashlib.sha256(x[1].encode()).hexdigest()))
        anchors, seen = [], set()
        for x in cover:
            if x[1] not in seen:
                anchors.append(x)
                seen.add(x[1])
            if len(anchors) == a.anchors:
                break
        anc_t = [j for j, _ in anchors]
        anc_f = [cf[l] for _, l in anchors]
        Sf = X[rf][:, anc_f].toarray()
        wt = GC.wnorm(R.weight.values[rt])
        wf = GC.wnorm(R.weight.values[rf])
        levels = {c: sorted(set(R[c].values[np.concatenate([rt, rf])].astype(str)) - {"nan"}) for c in DEMO}
        Dt, Df = onehot(R, rt, levels), onehot(R, rf, levels)

        def zs(S, w):
            Z = np.zeros(S.shape, dtype=float)
            for c in range(S.shape[1]):
                ok = S[:, c] > 0
                if ok.sum() < 30:
                    continue
                K = int(S[ok, c].max())
                sc = GC.category_scores(S[ok, c].astype(int) - 1, w[ok], K)
                Z[ok, c] = sc[S[ok, c].astype(int) - 1]
            return np.column_stack([Z, (S == 0).astype(float)])

        At = zs(St[:, anc_t], wt)
        Af = zs(Sf, wf)
        targets_pop = {c: {lev: float(np.average(R[c].values[rf].astype(str) == lev, weights=wf)) for lev in levels[c]} for c in DEMO}
        anc_links = {l for _, l in anchors}
        cand = [j for j in range(len(ct)) if j not in anc_t and meta[ct[j]]["link"] not in anc_links and (St[:, j] > 0).sum() >= 0.8 * len(rt)]
        cand = sorted(cand, key=lambda j: hashlib.sha256(meta[ct[j]]["id"].encode()).hexdigest())[: a.targets]
        demo_t = {c: R[c].values[rt].astype(str) for c in DEMO}
        young = np.isin(demo_t["age_band"], ["17-24", "25-34"])
        old = demo_t["age_band"] == "65+"
        hi = demo_t["edu3"] == "high"
        sel_bias = np.exp(1.0 * hi + 0.7 * young - 0.7 * old)
        # επιλογή που εξαρτάται από ΣΤΑΣΕΙΣ (όχι μόνο δημογραφικά): π.χ. πιο ενεργοί/ενδιαφερόμενοι σε online panel
        sel_att = np.exp(0.8 * At[:, 0] + 0.5 * At[:, 1])
        rows = []
        for j in cand:
            c = ct[j]
            K = meta[c]["K"]
            y_all = St[:, j]
            okk = y_all > 0
            truth = wdist(y_all[okk] - 1, wt[okk], K)
            # δειγματοληπτικό σφάλμα της «αλήθειας» (bootstrap)
            rng0 = np.random.default_rng(5)
            bs = [wdist(y_all[okk][ix] - 1, wt[okk][ix], K) for ix in (rng0.integers(0, okk.sum(), okk.sum()) for _ in range(100))]
            truth_se_mae = float(np.mean(np.abs(np.array(bs) - truth)) * 100)
            for scen in a.scens.split(","):
                for n in (200, 300, 500):
                    for rep in range(a.reps):
                        rng = np.random.default_rng(abs(hash((c, scen, n, rep))) % 2**32)
                        pool = np.where(okk)[0]
                        sel = {"SRS": None, "BIASED": sel_bias, "ATTBIAS": sel_att}[scen]
                        p = None if sel is None else sel[pool] / sel[pool].sum()
                        s = rng.choice(pool, n, replace=False, p=p)
                        ys = (y_all[s] - 1).astype(int)
                        ws = wt[s] if scen == "SRS" else np.ones(n)  # online panel: χωρίς βάρη σχεδιασμού
                        est = {"direct": wdist(ys, ws, K)}
                        wr = rake({k: v[s] for k, v in demo_t.items()}, ws, targets_pop)
                        est["rake"] = wdist(ys, wr, K)
                        est["mrp"], _ = fit_predict(Dt[s], ys, ws, Df, wf, K)
                        est["gpm"], mg = fit_predict(np.column_stack([Dt[s], At[s]]), ys, ws, np.column_stack([Df, Af]), wf, K)
                        if mg is not None:
                            idx = rng.choice(len(rf), 1000, p=wf / wf.sum())
                            P = np.zeros((1000, K))
                            P[:, mg.classes_] = mg.predict_proba(np.column_stack([Df, Af])[idx])
                            yy = (rng.random(1000)[:, None] > np.cumsum(P, axis=1)).sum(axis=1).clip(0, K - 1)
                            est["synth1000"] = wdist(yy, np.ones(1000), K)
                        for k, v in est.items():
                            rows.append({"pair": tgt, "item": meta[c]["id"], "scen": scen, "n": n, "rep": rep, "est": k,
                                         "mae": float(np.mean(np.abs(v - truth)) * 100), "truthSE": truth_se_mae})
            print(tgt, meta[c]["id"], flush=True)
        d = pd.DataFrame(rows)
        summ = d.groupby(["scen", "n", "est"]).mae.agg(["mean", "median", lambda x: np.quantile(x, 0.9)]).round(2)
        summ.columns = ["MAE", "median", "p90"]
        out["results"][tgt] = {"frame": frm, "anchors": [l for _, l in anchors], "nTargets": len(cand), "truthSE_MAE_pp": round(float(d.truthSE.mean()), 2),
                               "summary": {f"{s}|{n}|{e}": r.to_dict() for (s, n, e), r in summ.iterrows()}}
        print(summ.to_string(), flush=True)
        d.to_csv(a.out.replace(".json", f".{tgt}.csv.gz"), index=False)
    json.dump(out, open(a.out, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
