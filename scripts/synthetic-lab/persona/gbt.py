"""
PHASE5 — Global Behavior Transfer (GBT): στατιστικά ανά χώρα από τη διεθνή βάση ατομικών απαντήσεων και μοντέλα μεταφοράς
στην Ελλάδα (PHASE5_PREREGISTRATION §3–§8).

  stats      ανά έρευνα × χώρα × item: n, n_eff (Kish), σταθμισμένο περιθώριο, περιθώριο ΠΡΟΣΑΡΜΟΣΜΕΝΟ ΣΤΗΝ ΕΛΛΗΝΙΚΗ ΣΥΝΘΕΣΗ
             (post-stratification ηλικία×φύλο×μόρφωση με μερική συγκέντρωση κελιών), δεσμευμένες αποκλίσεις (ridit) ανά ηλικία/φύλο/
             μόρφωση· συσχετίσεις ζευγών για υποσύνολο items. Οι κλειδωμένες ελληνικές γραμμές (locked/) ΔΕΝ διαβάζονται ποτέ εδώ.
  columns    πίνακας χώρα × στήλη: ordinal/binary → probit των αθροιστικών P(y≤k), k<K· nominal → logit P(y=k).
  model C    χαμηλής τάξης παραγοντοποίηση Z_cj = m_j + U_c·V_j (ALS με ridge)· η Ελλάδα εκτιμάται από τις ορατές στήλες της.
  model B    k πλησιέστερες χώρες ως προς τις ορατές ελληνικές στήλες (ανά τομέα όπου αρκούν), σταθμισμένος μέσος (1/d²).
  pool       μέσος όλων των άλλων χωρών (στον χώρο των στηλών).

  python3 -I scripts/synthetic-lab/persona/gbt.py --root . stats [--only <surveyId>]
"""
import argparse
import glob
import hashlib
import json
import math
import os
import sys

import numpy as np
import pandas as pd
from scipy.stats import norm

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

AGE3 = {"17-24": "y", "25-34": "y", "35-44": "m", "45-54": "m", "55-64": "o", "65+": "o"}
KAPPA = 30.0
GR_REF_FILES = ["dn2024a", "dn2024b", "dn2024c"]
CORR_ITEMS = 40


def root_dir(root):
    return os.path.join(root, ".synthetic-lab-data", "global-behavior-evidence", "v1")


def load_surveys(root):
    d = root_dir(root)
    out = {}
    for f in sorted(glob.glob(os.path.join(d, "surveys*.json"))):
        for s in json.load(open(f)):
            out[s["surveyId"]] = s
    return out


def load_items(root, sid):
    return json.load(open(os.path.join(root_dir(root), "items", f"{sid}.json")))


def greek_cells(root):
    """Από κοινού κατανομή ηλικία(3)×φύλο×μόρφωση των Ελλήνων 17+.
    Δομή: ESS10+ESS11 Ελλάδα (πιθανοτικά δείγματα, βάρη ESS)· προσαρμογή IPF στα επίσημα περιθώρια ηλικία×φύλο (Eurostat 2025) και
    μόρφωσης (βαθμονομημένος πληθυσμός του Lab). Τα δείγματα διαΝΕΟσις ΔΕΝ χρησιμοποιούνται: ~53% τριτοβάθμια (έναντι ~27%),
    χωρίς διόρθωση μόρφωσης στα βάρη τους."""
    import pie

    frames = []
    for f in ("ess10", "ess11"):
        r = pie.read_resp(os.path.join(root, ".synthetic-lab-data", "persona", "harmonized", "resp", f"{f}.csv.gz"))
        frames.append(r[["age_band", "gender", "edu3", "weight"]])
    g = pd.concat(frames).dropna()
    g["a3"] = g["age_band"].map(AGE3)
    tab = g.groupby(["a3", "gender", "edu3"])["weight"].sum()
    P = (tab / tab.sum()).to_dict()
    mg = json.load(open(os.path.join(root, ".synthetic-lab-data", "raw", "population-margins-15plus.json")))["margins"]
    ag = {}
    for k, v in mg["age_gender"].items():
        a, sx = k.split("|")
        a3 = {"15-24": "y", "25-34": "y", "35-44": "m", "45-54": "m", "55-64": "o", "65+": "o"}[a]
        ag[(a3, sx)] = ag.get((a3, sx), 0.0) + v
    tot = sum(ag.values())
    ag = {k: v / tot for k, v in ag.items()}
    ed = {"low": mg["education_group"]["low_education"], "medium": mg["education_group"]["medium_education"], "high": mg["education_group"]["high_education"]}
    for _ in range(50):
        cur = {}
        for (a3, sx, e), v in P.items():
            cur[(a3, sx)] = cur.get((a3, sx), 0.0) + v
        P = {(a3, sx, e): v * ag[(a3, sx)] / cur[(a3, sx)] for (a3, sx, e), v in P.items()}
        cur = {}
        for (a3, sx, e), v in P.items():
            cur[e] = cur.get(e, 0.0) + v
        P = {(a3, sx, e): v * ed[e] / cur[e] for (a3, sx, e), v in P.items()}
    return P


def wdist(vals, w, codes):
    d = np.array([w[vals == c].sum() for c in codes], dtype=float)
    return d / d.sum() if d.sum() > 0 else None


def ridit_scores(x_idx, w, K):
    """ridit ανά κατηγορία (0..K-1) με σταθμισμένα βάρη· επιστρέφει πίνακα τιμών ανά κατηγορία."""
    p = np.array([w[x_idx == k].sum() for k in range(K)], dtype=float)
    p = p / p.sum() if p.sum() > 0 else np.full(K, 1 / K)
    c = np.cumsum(p) - p / 2
    return c


def survey_stats(root, sid, gr_cells):
    items = load_items(root, sid)
    df = pd.read_csv(os.path.join(root_dir(root), "resp", f"{sid}.csv.gz"), dtype=str, low_memory=False)
    df["weight"] = pd.to_numeric(df["weight"], errors="coerce").fillna(1.0)
    df["a3"] = df["age_band"].map(AGE3) if "age_band" in df else None
    out = {"surveyId": sid, "items": {}, "countries": {}, "corr": {}}
    groups = {c: g for c, g in df.groupby("country")}
    for c, g in groups.items():
        out["countries"][c] = {"n": int(len(g))}
    cell_keys = list(gr_cells)
    for it in items:
        col = it["id"]
        if col not in df:
            continue
        codes = [o["code"] for o in it["options"]]
        K = len(codes)
        ordered = it["type"] in ("ordinal", "binary")
        rec = {}
        for c, g in groups.items():
            v = g[col]
            ok = v.isin(codes).values
            if ok.sum() < 100:
                continue
            w = g["weight"].values[ok]
            vals = v.values[ok]
            p = wdist(vals, w, codes)
            if p is None:
                continue
            neff = float(w.sum() ** 2 / (w ** 2).sum())
            # προσαρμογή σύνθεσης: κελιά με μερική συγκέντρωση προς το περιθώριο της χώρας
            sub = g.loc[ok, ["a3", "gender", "edu3"]]
            have = [d for d in ("a3", "gender", "edu3") if d in sub and sub[d].notna().mean() > 0.8]
            padj = None
            if have:
                gc = {}
                for key, pr in gr_cells.items():
                    k2 = tuple(x for x, d in zip(key, ("a3", "gender", "edu3")) if d in have)
                    gc[k2] = gc.get(k2, 0.0) + pr
                acc = np.zeros(K)
                tot = 0.0
                grp = sub[have].fillna("").astype(str).agg("|".join, axis=1).values
                for k2, pr in gc.items():
                    m = grp == "|".join(k2)
                    wc = w[m]
                    if wc.sum() > 0:
                        pc = wdist(vals[m], wc, codes)
                        nc = float(m.sum())
                        pc = (nc * pc + KAPPA * p) / (nc + KAPPA)
                    else:
                        pc = p
                    acc += pr * pc
                    tot += pr
                padj = acc / tot
            # δεσμευμένες αποκλίσεις (ridit) για ordinal
            gaps = {}
            if ordered:
                idx = np.array([codes.index(x) for x in vals])
                rs = ridit_scores(idx, w, K)
                r_ = rs[idx]
                mu = np.average(r_, weights=w)
                for d in ("a3", "gender", "edu3"):
                    if d not in sub or sub[d].notna().mean() < 0.8:
                        continue
                    lv = sub[d].values
                    for L in pd.unique(lv):
                        if not isinstance(L, str):
                            continue
                        m = lv == L
                        if m.sum() >= 60:
                            gaps[f"{d}:{L}"] = round(float(np.average(r_[m], weights=w[m]) - mu), 4)
            rec[c] = {"n": int(ok.sum()), "neff": round(neff, 1), "p": np.round(p, 5).tolist(),
                      "padj": np.round(padj, 5).tolist() if padj is not None else None, "gaps": gaps}
        out["items"][col] = rec
    # συσχετίσεις: έως CORR_ITEMS ordinal items (σταθερή επιλογή με hash), ανά χώρα με n ≥ 300
    ords = sorted([it for it in items if it["type"] in ("ordinal", "binary") and it["id"] in df and not it.get("excludedFromTransfer")],
                  key=lambda it: hashlib.sha256(it["id"].encode()).hexdigest())[:CORR_ITEMS]
    for c, g in groups.items():
        if len(g) < 300:
            continue
        w = g["weight"].values
        R = {}
        for it in ords:
            codes = [o["code"] for o in it["options"]]
            v = g[it["id"]]
            x = np.full(len(g), np.nan)
            ok = v.isin(codes).values
            if ok.sum() < 150:
                continue
            idx = np.array([codes.index(s) for s in v.values[ok]])
            rs = ridit_scores(idx, w[ok], len(codes))
            x[ok] = rs[idx]
            R[it["id"]] = x
        ids = list(R)
        cc = {}
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                a, b = R[ids[i]], R[ids[j]]
                m = ~np.isnan(a) & ~np.isnan(b)
                if m.sum() < 150:
                    continue
                ww = w[m]
                ma, mb = np.average(a[m], weights=ww), np.average(b[m], weights=ww)
                cov = np.average((a[m] - ma) * (b[m] - mb), weights=ww)
                sa, sb = math.sqrt(np.average((a[m] - ma) ** 2, weights=ww)), math.sqrt(np.average((b[m] - mb) ** 2, weights=ww))
                if sa > 0 and sb > 0:
                    cc[f"{ids[i]}|{ids[j]}"] = round(float(cov / (sa * sb)), 4)
        out["corr"][c] = cc
    return out


# ------------------------------------------------------------------ στήλες
EPS = 0.005


def to_cols(p, typ):
    p = np.clip(np.asarray(p, dtype=float), EPS, 1)
    p = p / p.sum()
    if typ in ("ordinal", "binary"):
        cum = np.clip(np.cumsum(p)[:-1], EPS, 1 - EPS)
        return norm.ppf(cum)
    return np.log(p) - np.log(p).mean()


def from_cols(z, typ, K):
    z = np.asarray(z, dtype=float)
    if typ in ("ordinal", "binary"):
        cum = norm.cdf(np.maximum.accumulate(z))
        cum = np.concatenate([cum, [1.0]])
        p = np.diff(np.concatenate([[0.0], cum]))
        p = np.clip(p, 1e-6, None)
        return p / p.sum()
    e = np.exp(z - z.max())
    return e / e.sum()


def build_matrix(stats_by_survey, items_by_survey, use_adj=True, exclude_transfer=True):
    """Επιστρέφει (countries, columns meta, Z [C×J] με NaN, Nf [C×J] n_eff)."""
    cols, rows = [], {}
    for sid, st in stats_by_survey.items():
        for it in items_by_survey[sid]:
            if exclude_transfer and it.get("excludedFromTransfer"):
                continue
            rec = st["items"].get(it["id"])
            if not rec:
                continue
            K = len(it["options"])
            nc = K - 1 if it["type"] in ("ordinal", "binary") else K
            base = len(cols)
            for k in range(nc):
                cols.append({"item": it["id"], "survey": sid, "k": k, "type": it["type"], "K": K})
            for c, r in rec.items():
                p = (r["padj"] if (use_adj and r.get("padj") is not None and c != "GR") else r["p"])
                z = to_cols(p, it["type"])
                rows.setdefault(c, {})
                for k in range(nc):
                    rows[c][base + k] = (z[k], r["neff"])
    countries = sorted(rows)
    C, J = len(countries), len(cols)
    Z = np.full((C, J), np.nan)
    N = np.zeros((C, J))
    for i, c in enumerate(countries):
        for j, (z, ne) in rows[c].items():
            Z[i, j] = z
            N[i, j] = ne
    return countries, cols, Z, N


def als(Z, mask, rank, lam, iters=30, seed=0):
    """Z ≈ m + U V^T στα παρατηρημένα (mask), ridge λ. Οι στήλες με ίδιο μοτίβο παρατήρησης λύνονται μαζί."""
    C, J = Z.shape
    cnt = mask.sum(axis=0)
    m = np.where(cnt > 0, np.where(mask, Z, 0.0).sum(axis=0) / np.maximum(cnt, 1), 0.0)
    R = np.where(mask, Z - m, 0.0)
    if rank == 0:
        return m, np.zeros((C, 0)), np.zeros((J, 0))
    pats = {}
    for j in range(J):
        pats.setdefault(mask[:, j].tobytes(), []).append(j)
    pats = [(np.frombuffer(k, dtype=bool), np.array(v)) for k, v in pats.items()]
    rng = np.random.default_rng(seed)
    U = rng.normal(0, 0.1, (C, rank))
    V = rng.normal(0, 0.1, (J, rank))
    I = np.eye(rank)
    for _ in range(iters):
        for c in range(C):
            o = mask[c]
            if o.any():
                Vo = V[o]
                U[c] = np.linalg.solve(Vo.T @ Vo + lam * I, Vo.T @ R[c, o])
        for o, js in pats:
            if o.any():
                Uo = U[o]
                V[js] = np.linalg.solve(Uo.T @ Uo + lam * I, Uo.T @ R[np.ix_(o, js)]).T
    return m, U, V


def fold_in(z_obs, V_obs, m_obs, lam):
    """Ενσωμάτωση χώρας από τις ορατές στήλες της (χωρίς επανεκπαίδευση)."""
    r = V_obs.shape[1]
    if r == 0 or len(z_obs) == 0:
        return np.zeros(r)
    return np.linalg.solve(V_obs.T @ V_obs + lam * np.eye(r), V_obs.T @ (z_obs - m_obs))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("cmd", choices=["stats"])
    ap.add_argument("--only", action="append")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    sv = load_surveys(root)
    cells = greek_cells(root)
    os.makedirs(os.path.join(root_dir(root), "stats"), exist_ok=True)
    json.dump({"|".join(k): v for k, v in cells.items()}, open(os.path.join(root_dir(root), "stats", "_greek_cells.json"), "w"), indent=1)
    for sid in sv:
        if a.only and sid not in a.only:
            continue
        p = os.path.join(root_dir(root), "stats", f"{sid}.json")
        st = survey_stats(root, sid, cells)
        json.dump(st, open(p, "w"))
        print(sid, len(st["items"]), "items", len(st["countries"]), "countries", "GR" in st["countries"])


if __name__ == "__main__":
    main()
