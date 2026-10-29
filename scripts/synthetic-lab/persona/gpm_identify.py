"""
PHASE6 Stage 0 — ταυτοποιησιμότητα ενός κοινού λανθάνοντος ελληνικού πληθυσμιακού μοντέλου.

  1. Γράφος σύνδεσης ερευνών: κόμβοι = ελληνικές έρευνες· ακμή = κοινή οικογένεια ερώτησης (όχι δημογραφικά).
     Συνεκτικές συνιστώσες με/χωρίς τις εναρμονισμένες άγκυρες (lr7, econ4, ...).
  2. Υποψήφιες διαστάσεις (gpm_core.DIMS): αντιστοίχιση ερωτήσεων με ενσωματώσεις και ΕΜΠΕΙΡΙΚΟΣ έλεγχος συνοχής
     (μέση |r| εντός διάστασης έναντι μεταξύ διαστάσεων, στην ίδια έρευνα).
  3. Διαστατικότητα ανά έρευνα: διασταυρούμενη επικύρωση σε κρυμμένα κελιά, k = 0..10, έναντι μοντέλου μόνο δημογραφικών.
  4. Πίνακας συν-μέτρησης διαστάσεων: ποιες ΣΥΣΧΕΤΙΣΕΙΣ μεταξύ διαστάσεων έχουν ελληνικά δεδομένα που τις ταυτοποιούν.
  5. Σταθερότητα: κοινό μοντέλο σε όλες τις έρευνες με 5 σπόρους· διασπορά των υπονοούμενων συσχετίσεων για ζεύγη
     ερωτήσεων που ΠΟΤΕ δεν μετρήθηκαν μαζί (μη ταυτοποιήσιμες) έναντι ζευγών που μετρήθηκαν μαζί.

  python3 -I scripts/synthetic-lab/persona/gpm_identify.py --root . --out <json>
"""
import argparse
import itertools
import json
import os
import sys
import time

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gpm_core as GC  # noqa: E402

DEMO = ["age_band", "gender", "edu3", "urban", "nuts1"]


def link_graph(meta, use_anchors):
    surv = sorted({m["survey"] for m in meta})
    sidx = {s: i for i, s in enumerate(surv)}
    by_link = {}
    for m in meta:
        if m["src"] == "anchor" and not use_anchors:
            continue
        by_link.setdefault(m["link"], set()).add(m["survey"])
    W = np.zeros((len(surv), len(surv)))
    for ss in by_link.values():
        for a, b in itertools.combinations(sorted(ss), 2):
            W[sidx[a], sidx[b]] += 1
            W[sidx[b], sidx[a]] += 1
    n, lab = connected_components(csr_matrix(W > 0), directed=False)
    comps = {}
    for s, l in zip(surv, lab):
        comps.setdefault(int(l), []).append(s)
    return surv, W, sorted(comps.values(), key=len, reverse=True)


def assign_dims(root, meta):
    import embed

    E = embed.Embedder(root)
    names = list(GC.DIMS)
    P = E.encode(list(GC.DIMS.values()))
    texts = [embed.clean(m["text"]) + " | " + " / ".join(m["options"][:5]) for m in meta]
    import hashlib

    cp = os.path.join(GC.gdir(root), "item-emb-" + hashlib.sha256("\n".join(texts).encode()).hexdigest()[:16] + ".npy")
    if os.path.exists(cp):
        T = np.load(cp)
    else:
        T = E.encode(texts)
        np.save(cp, T)
    S = T @ P.T
    best = S.argmax(axis=1)
    top = S.max(axis=1)
    srt = np.sort(S, axis=1)
    margin = srt[:, -1] - srt[:, -2]
    return names, S, best, top, margin


def demo_design(R, rows):
    cols = []
    for c in DEMO:
        v = R[c].values[rows].astype(str)
        for lev in sorted(set(v) - {"nan"})[1:]:
            cols.append((v == lev).astype(float))
    return np.column_stack([np.ones(len(rows))] + cols) if cols else np.ones((len(rows), 1))


def cv_dims(blocks, R, fam_of, ks=(0, 1, 2, 3, 4, 5, 6, 8, 10), seeds=(0, 1)):
    res = {}
    for s, b in blocks.items():
        if b["Z"].shape[1] < 20 or len(b["rows"]) < 500:
            continue
        D = demo_design(R, b["rows"])
        out = {k: [] for k in ks}
        out["demo"] = []
        for sd in seeds:
            tr, held = GC.mask_cells({s: b}, 0.1, seed=sd)
            (ri, ci), z = held[s]
            Zt = tr[s]["Z"]
            # μόνο δημογραφικά: γραμμική πρόβλεψη ανά ερώτηση
            pred = np.zeros(len(z))
            for c in np.unique(ci):
                ok = ~np.isnan(Zt[:, c])
                beta = np.linalg.lstsq(D[ok], Zt[ok, c], rcond=None)[0]
                sel = ci == c
                pred[sel] = D[ri[sel]] @ beta
            out["demo"].append(float(np.sqrt(np.mean((z - pred) ** 2))))
            for k in ks:
                if k == 0:
                    out[k].append(float(np.sqrt(np.mean(z ** 2))))
                    continue
                m = GC.fit_blocks(tr, fam_of, k, lam=1.0, iters=80, seed=sd)
                out[k].append(GC.predict_held(m, tr, held, fam_of)[0])
        mean = {str(k): round(float(np.mean(v)), 4) for k, v in out.items()}
        se = {str(k): float(np.std(v) / np.sqrt(len(v)) + 1e-9) for k, v in out.items()}
        num = [k for k in ks if k > 0]
        kbest = min(num, key=lambda k: mean[str(k)])
        # κανόνας 1-SE: το μικρότερο k εντός 1 SE (μετρημένο σε 2 σπόρους· συμπληρωματικά ≥ 0,25% βελτίωση ανά βήμα)
        thr = mean[str(kbest)] + max(se[str(kbest)], 0.0025 * mean[str(kbest)])
        k1se = min(k for k in num if mean[str(k)] <= thr)
        res[s] = {"n": int(len(b["rows"])), "items": int(b["Z"].shape[1]), "rmse": mean, "kBest": kbest, "k1SE": k1se,
                  "gainVsDemo": round(1 - mean[str(k1se)] / mean["demo"], 4), "demoGainVsMean": round(1 - mean["demo"] / mean["0"], 4)}
        print(s, res[s]["items"], "k*", k1se, mean, flush=True)
    return res


def coherence(blocks, meta, dim_of):
    """Μέση |r| ζευγών ερωτήσεων της ίδιας διάστασης έναντι διαφορετικών διαστάσεων (εντός έρευνας)."""
    same, diff = [], []
    per_dim = {}
    for s, b in blocks.items():
        Z = b["Z"]
        cols = b["cols"]
        if Z.shape[1] < 2:
            continue
        M = ~np.isnan(Z)
        Zc = np.where(M, Z, 0.0)
        n = M.T.astype(float) @ M.astype(float)
        sxy = Zc.T @ Zc
        sx = Zc.T @ M.astype(float)
        sxx = (Zc ** 2).T @ M.astype(float)
        with np.errstate(invalid="ignore", divide="ignore"):
            cov = sxy / n - (sx / n) * (sx.T / n)
            vx = sxx / n - (sx / n) ** 2
            r = cov / np.sqrt(vx * vx.T)
        d = [dim_of.get(int(c)) for c in cols]
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                if n[i, j] < 200 or not np.isfinite(r[i, j]) or d[i] is None or d[j] is None:
                    continue
                if d[i] == d[j]:
                    same.append(abs(r[i, j]))
                    per_dim.setdefault(d[i], []).append(abs(r[i, j]))
                else:
                    diff.append(abs(r[i, j]))
    return {"sameDim_meanAbsR": round(float(np.mean(same)), 4), "nSame": len(same), "diffDim_meanAbsR": round(float(np.mean(diff)), 4), "nDiff": len(diff),
            "perDim": {k: {"meanAbsR": round(float(np.mean(v)), 4), "pairs": len(v)} for k, v in sorted(per_dim.items())}}


def fam_var(blocks, fam_of):
    """Μέση διασπορά των κανονικών σκορ ανά οικογένεια (π.χ. ≈ 0,64 για δίτιμες)."""
    acc = {}
    for b in blocks.values():
        for c, col in enumerate(b["cols"]):
            z = b["Z"][:, c]
            z = z[~np.isnan(z)]
            if len(z) > 30:
                acc.setdefault(fam_of[int(col)], []).append(float(z.var()))
    return {f: float(np.mean(v)) for f, v in acc.items()}


def implied_corr(model, fam_pairs, var_of=None):
    """Υπονοούμενη συσχέτιση: cov = v_a·v_b (cov(U) = I), διαιρεμένη με τις εμπειρικές τυπικές αποκλίσεις."""
    fidx = {f: i for i, f in enumerate(model["fams"])}
    V = model["V"]
    out = []
    for a, b in fam_pairs:
        va, vb = V[fidx[a]], V[fidx[b]]
        sa = max((var_of or {}).get(a, 1.0), float(va @ va), 1e-6)
        sb = max((var_of or {}).get(b, 1.0), float(vb @ vb), 1e-6)
        out.append(float(np.clip(va @ vb / np.sqrt(sa * sb), -1, 1)))
    return np.array(out)


def stability_section(rep, blocks, fam_of, k):
    var_of = fam_var(blocks, fam_of)
    models = [GC.fit_blocks(blocks, fam_of, k, lam=1.0, iters=60, seed=sd) for sd in range(5)]
    fams_surv = {}
    for s, b in blocks.items():
        for c in b["cols"]:
            fams_surv.setdefault(fam_of[int(c)], set()).add(s)
    fl = [f for f in models[0]["fams"]]
    rng = np.random.default_rng(1)
    co_pairs, never = [], []
    for _ in range(40000):
        f1, f2 = fl[rng.integers(len(fl))], fl[rng.integers(len(fl))]
        if f1 == f2:
            continue
        (co_pairs if fams_surv[f1] & fams_surv[f2] else never).append((f1, f2))
    co_pairs, never = co_pairs[:3000], never[:3000]
    C1 = np.array([implied_corr(m, co_pairs, var_of) for m in models])
    C2 = np.array([implied_corr(m, never, var_of) for m in models])
    # για ζεύγη που μετρήθηκαν μαζί: εμπειρική συσχέτιση
    rep["stability"] = {"k": k, "surveys": len(blocks), "rmse": [round(m["rmse"], 4) for m in models],
                        "coMeasured": {"pairs": len(co_pairs), "meanSDacrossSeeds": round(float(C1.std(axis=0).mean()), 4), "meanAbsImplied": round(float(np.abs(C1.mean(axis=0)).mean()), 4)},
                        "neverCoMeasured": {"pairs": len(never), "meanSDacrossSeeds": round(float(C2.std(axis=0).mean()), 4), "meanAbsImplied": round(float(np.abs(C2.mean(axis=0)).mean()), 4)}}
    print("σταθερότητα", rep["stability"], flush=True)


def cross_section(rep, blocks, fam_of, k):
    var_of = fam_var(blocks, fam_of)
    # 6. εγκυρότητα: πρόβλεψη συσχετίσεων σε έρευνα που ΑΦΑΙΡΕΘΗΚΕ από την εκτίμηση
    rep["crossSurveyCorr"] = {}
    for T in [t for t in ("ess11", "dn2024a", "undpolar2022", "maple2019feb", "eb1033", "dn2017") if t in blocks]:
        tr = {s: b for s, b in blocks.items() if s != T}
        m = GC.fit_blocks(tr, fam_of, k, lam=1.0, iters=60, seed=0)
        fset = set(m["fams"])
        fs_tr = {}
        for s, b in tr.items():
            for c in b["cols"]:
                fs_tr.setdefault(fam_of[int(c)], set()).add(s)
        b = blocks[T]
        Z = b["Z"]
        cols = [int(c) for c in b["cols"]]
        rows_a, rows_b = [], []
        for i, j in itertools.combinations(range(len(cols)), 2):
            fi, fj = fam_of[cols[i]], fam_of[cols[j]]
            if fi == fj or fi not in fset or fj not in fset:
                continue
            ok = ~np.isnan(Z[:, i]) & ~np.isnan(Z[:, j])
            if ok.sum() < 200:
                continue
            if Z[ok, i].std() < 1e-9 or Z[ok, j].std() < 1e-9:
                continue
            r = float(np.corrcoef(Z[ok, i], Z[ok, j])[0, 1])
            p_ = float(implied_corr(m, [(fi, fj)], var_of)[0])
            if not (np.isfinite(r) and np.isfinite(p_)):
                continue
            (rows_a if fs_tr[fi] & fs_tr[fj] else rows_b).append((r, p_))
        out = {}
        for tag, rr in (("coMeasuredElsewhere", rows_a), ("chainOnly", rows_b)):
            if rr:
                r_, p_ = np.array(rr).T
                out[tag] = {"pairs": len(rr), "MAE_model": round(float(np.mean(np.abs(r_ - p_))), 4), "MAE_zero": round(float(np.mean(np.abs(r_))), 4),
                            "corr_model_vs_real": round(float(np.corrcoef(r_, p_)[0, 1]), 3) if len(rr) > 2 else None}
        rep["crossSurveyCorr"][T] = out
        print("διασταυρούμενη", T, out, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--out", required=True)
    ap.add_argument("--skip-cv", action="store_true")
    ap.add_argument("--cross-only", action="store_true", help="μόνο τα τμήματα 5–6, συγχώνευση στο υπάρχον --out")
    ap.add_argument("--k", type=int, default=None)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    t0 = time.time()
    R, X, meta = GC.load_grim(root)
    fam_of = {m["col"]: m["link"] for m in meta}
    rep = {"createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    if a.cross_only:
        rep = json.load(open(a.out))
        blocks = {s: b for s, b in GC.survey_blocks(R, X, meta).items() if not s.startswith("hbs") and b["Z"].shape[1] >= 3}
        k = a.k or rep["stability"]["k"]
        stability_section(rep, blocks, fam_of, k)
        cross_section(rep, blocks, fam_of, k)
        json.dump(rep, open(a.out, "w"), ensure_ascii=False, indent=1)
        return

    # 1. γράφος
    for tag, ua in (("itemsOnly", False), ("withAnchors", True)):
        surv, W, comps = link_graph(meta, ua)
        deg = (W > 0).sum(axis=1)
        rep[f"graph_{tag}"] = {"surveys": len(surv), "components": len(comps), "largest": len(comps[0]), "componentSizes": [len(c) for c in comps],
                               "isolated": sorted(c[0] for c in comps if len(c) == 1), "giant": comps[0],
                               "meanDegree": round(float(deg.mean()), 2), "sharedFamiliesTotal": int(W.sum() / 2)}
        print(tag, len(comps), "συνιστώσες· μεγαλύτερη", len(comps[0]), flush=True)

    # 2. διαστάσεις
    names, S, best, top, margin = assign_dims(root, meta)
    tau = 0.40
    dim_of = {m["col"]: names[best[i]] for i, m in enumerate(meta) if top[i] >= tau and m["src"] != "anchor"}
    for m in meta:
        if m["src"] == "anchor":
            an = m["id"].split("@")[1]
            dim_of[m["col"]] = {"lr7": "cultural_ideology", "econ4": "economic_insecurity", "polint4": "political_engagement", "believer": "religiosity",
                                "incq5": "economic_insecurity", "inc6": "economic_insecurity", "class3": "economic_insecurity"}.get(an)
    blocks_all = GC.survey_blocks(R, X, meta)
    rep["dimAssignment"] = {"tau": tau, "assigned": int(sum(1 for v in dim_of.values() if v)), "of": len(meta),
                            "simQuantiles": [round(float(q), 3) for q in np.quantile(top, [0.1, 0.25, 0.5, 0.75, 0.9])]}
    rep["coherence"] = coherence(blocks_all, meta, dim_of)
    print("συνοχή", rep["coherence"]["sameDim_meanAbsR"], rep["coherence"]["diffDim_meanAbsR"], flush=True)

    # 4. συν-μέτρηση διαστάσεων (Έλληνες ερωτώμενοι σε έρευνες με ≥ 2 ερωτήσεις σε κάθε διάσταση)
    dims_by_s = {}
    for s, b in blocks_all.items():
        cnt = {}
        for c in b["cols"]:
            d = dim_of.get(int(c))
            if d:
                cnt[d] = cnt.get(d, 0) + 1
        dims_by_s[s] = {d for d, n in cnt.items() if n >= 2}
    co = {}
    for s, ds in dims_by_s.items():
        n = len(blocks_all[s]["rows"])
        for d1, d2 in itertools.combinations(sorted(ds), 2):
            x = co.setdefault(f"{d1}|{d2}", {"surveys": [], "respondents": 0})
            x["surveys"].append(s)
            x["respondents"] += n
    dim_cov = {d: {"surveys": sorted(s for s, ds in dims_by_s.items() if d in ds), "respondents": int(sum(len(blocks_all[s]["rows"]) for s, ds in dims_by_s.items() if d in ds))}
               for d in names}
    pairs = list(itertools.combinations(names, 2))
    rep["dimCoverage"] = dim_cov
    rep["dimPairs"] = {f"{a}|{b}": co.get(f"{a}|{b}", {"surveys": [], "respondents": 0}) for a, b in pairs}
    rep["dimPairsIdentified"] = sum(1 for k, v in rep["dimPairs"].items() if v["respondents"] >= 1000)
    rep["dimPairsTotal"] = len(pairs)

    # 3. διαστατικότητα ανά έρευνα
    if not a.skip_cv:
        rep["cvDims"] = cv_dims(blocks_all, R, fam_of)

    # 5. σταθερότητα κοινού μοντέλου (χωρίς HBS: νοικοκυριά, όχι άτομα)
    blocks = {s: b for s, b in blocks_all.items() if not s.startswith("hbs") and b["Z"].shape[1] >= 3}
    ks = sorted(v["k1SE"] for v in rep.get("cvDims", {}).values()) or [5]
    k = int(np.median(ks))
    stability_section(rep, blocks, fam_of, k)
    cross_section(rep, blocks, fam_of, k)
    rep["seconds"] = round(time.time() - t0)
    json.dump(rep, open(a.out, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
