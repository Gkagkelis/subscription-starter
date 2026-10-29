"""
PHASE4: benchmark γενίκευσης σε ΝΕΕΣ ερωτήσεις (PHASE4_PREREGISTRATION §1–§5).

Για κάθε ερώτηση-στόχο T ενός αρχείου-στόχου F (πραγματικοί ερωτώμενοι):
  - τα τεκμήρια είναι τα items ενός μοντέλου εκπαιδευμένου ΠΡΙΝ από το F (το F δεν υπάρχει στα τεκμήρια)·
  - η οικογένεια της T κρύβεται από όλα τα τεκμήρια (leave-one-family-out), εκτός αν mode=seen·
  - τα πρόσωπα παράγονται από τον δημογραφικό σκελετό του F· οι πραγματικές απαντήσεις διαβάζονται μόνο στη βαθμολόγηση.
Μέθοδοι:
  crude   ο παλιός αντιστοιχιστής μεταφοράς (ίδια έννοια/Κ/Jaccard) — B_crude
  lex     λεξική αυτόματη σύνδεση του runtime pie-0.4 (autolink-1, αποφάσεις από το TS) — B_pie04
  scale   μόνο επίπεδο από ίδιο τύπο κλίμακας (μέση κατανομή items με ίδιες ετικέτες), ανεξάρτητες απαντήσεις — B_scale
  unif    ομοιόμορφη
  sem     G1: πολυγλωσσική σημασιολογική ανάκτηση + σειρά προσώπων από το λανθάνον του τεκμηρίου· επίπεδο = τεκμήριο (ίδιο Κ) ή B_scale
  semlev  G2: όπως sem, επίπεδο = w_tier·τεκμήριο + (1−w_tier)·B_scale (w από αρχείο βαρών, μάθηση σε άλλο αρχείο ανάπτυξης)
  semens  G3: όπως semlev, σειρά από σταθμισμένο άθροισμα των k πρώτων τεκμηρίων

  python3 scripts/synthetic-lab/persona/eval_unseen.py --root . --model-dir <dir> --files dn2024a,dn2024b,dn2024c --ref 2023-12 --out <json>
"""
import argparse
import json
import math
import os
import re
import sys
import unicodedata

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import pie  # noqa: E402

HZ = None
SKEL = ["age_band", "gender", "edu3", "nuts1", "urban", "weight"]


def nrm(s):
    s = unicodedata.normalize("NFD", str(s).lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("ς", "σ")
    s = re.sub(r"^\s*\d+\s*[.)]?\s*", "", s)
    return re.sub(r"[^\w ]+", " ", re.sub(r"\s+", " ", s)).strip()


def label_key(options):
    return tuple(nrm(o["label"]) for o in options)


def wdist(vals, w, codes):
    d = np.array([w[vals == c].sum() for c in codes], dtype=float)
    return d / d.sum() if d.sum() > 0 else np.full(len(codes), np.nan)


def ridit(x, w):
    out = np.full(len(x), np.nan)
    ok = ~np.isnan(x)
    if not ok.any():
        return out
    tot, cum = w[ok].sum(), 0.0
    for v in np.unique(x[ok]):
        m = ok & (x == v)
        p = w[m].sum() / tot
        out[m] = cum + p / 2
        cum += p
    return out


def wspear(a, b, w):
    ok = ~np.isnan(a) & ~np.isnan(b)
    if ok.sum() < 100:
        return np.nan
    ra, rb = ridit(a[ok], w[ok]), ridit(b[ok], w[ok])
    ww = w[ok]
    ma, mb = np.average(ra, weights=ww), np.average(rb, weights=ww)
    cov = np.average((ra - ma) * (rb - mb), weights=ww)
    sa, sb = math.sqrt(np.average((ra - ma) ** 2, weights=ww)), math.sqrt(np.average((rb - mb) ** 2, weights=ww))
    return cov / (sa * sb) if sa > 0 and sb > 0 else np.nan


# ------------------------------------------------------------------ λανθάνουσα βαθμολογία ενός τεκμηρίου για κάθε πρόσωπο
def latent_score(item, P, X, rng, model):
    """y* = η + e (ordinal, ίδια λογική με pie.answer_item)· για nominal: None."""
    if item["model"]["kind"] != "ordinal":
        return None
    Z, _ = pie.design(X, item["feats"], np.array(item["means"]))
    eta = Z @ np.array(item["model"]["b"])
    lam = float(item.get("lambda", 0.0))
    n = len(P)
    if item.get("factorKey") and lam != 0:
        th = pie.theta(P, item["factorKey"])
        e = lam * th + math.sqrt(max(1 - lam * lam, 0.0)) * rng.standard_normal(n)
    else:
        e = rng.standard_normal(n)
    return eta + e


def expected_probs(item, X):
    Z, _ = pie.design(X, item["feats"], np.array(item["means"]))
    if item["model"]["kind"] == "ordinal":
        return pie.ordinal_probs(Z, {"b": np.array(item["model"]["b"]), "tau": np.array(item["model"]["tau"])})
    return pie.mnl_probs(Z, {"a": np.array(item["model"]["a"]), "B": np.array(item["model"]["B"])})


def rank_assign(score, w, p):
    """Κατηγορία ανά πρόσωπο: τομή της σταθμισμένης σειράς του score στις αθροιστικές πιθανότητες p (comonotone)."""
    order = np.argsort(score, kind="stable")
    cw = np.cumsum(w[order]) / w.sum()
    cuts = np.cumsum(p)[:-1]
    cat = np.searchsorted(cuts, cw - 1e-12 * 0, side="left")
    out = np.empty(len(score), dtype=int)
    out[order] = np.minimum(cat, len(p) - 1)
    return out


def orientation(Et_opts, Es_opts):
    """+1 αν το «υψηλό» άκρο του τεκμηρίου αντιστοιχεί στο «υψηλό» της ερώτησης (σημασιολογική σύγκριση ετικετών άκρων), αλλιώς −1."""
    a = Et_opts[0] @ Es_opts[0] + Et_opts[-1] @ Es_opts[-1]
    b = Et_opts[0] @ Es_opts[-1] + Et_opts[-1] @ Es_opts[0]
    return 1 if a >= b else -1


# ------------------------------------------------------------------ κύρια ροή
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--files", required=True)
    ap.add_argument("--ref", required=True)
    ap.add_argument("--mode", choices=["unseen", "seen"], default="unseen")
    ap.add_argument("--methods", default="unif,scale,crude,lex,sem,semlev,semens")
    ap.add_argument("--weights", default=None, help="JSON βαρών επιπέδου ανά βαθμίδα (G2), μαθημένα σε ΑΛΛΟ αρχείο ανάπτυξης")
    ap.add_argument("--lex", default=None, help="JSON αποφάσεων autolink (TS) για τις ερωτήσεις-στόχους")
    ap.add_argument("--seeds", type=int, default=2)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    global HZ
    HZ = os.path.join(root, ".synthetic-lab-data", "persona", "harmonized")
    md = a.model_dir if os.path.isabs(a.model_dir) else os.path.join(root, a.model_dir)
    model = json.load(open(os.path.join(md, "model.json")))
    pool = [t for t in json.load(open(os.path.join(md, "items.json"))) if t["wave"] <= a.ref]
    bank = json.load(open(os.path.join(HZ, "item_bank.json")))
    files = a.files.split(",")
    targets = [b for b in bank if b["file"] in files and b["type"] in ("ordinal", "binary", "nominal") and 2 <= len(b["options"]) <= 11]
    import embed  # noqa: E402

    E = embed.Embedder(root)
    pv = E.encode([embed.item_text(t) for t in pool])
    tv = E.encode([embed.item_text(t) for t in targets])
    opt_cache = {}

    def opt_vecs(item):
        k = item["id"]
        if k not in opt_cache:
            opt_cache[k] = E.encode([o["label"] for o in item["options"]])
        return opt_cache[k]
    # B_scale: μέση παρατηρούμενη κατανομή items με ίδιες κανονικοποιημένες ετικέτες
    by_labels = {}
    for t in pool:
        if t.get("observed"):
            by_labels.setdefault(label_key(t["options"]), []).append(np.array(t["observed"], dtype=float) / 100)
    lex = json.load(open(a.lex)) if a.lex else {}
    W = json.load(open(a.weights)) if a.weights else {"paraphrase": 1.0, "related": 0.5, "weak": 0.0}
    import eval_persona as ep  # noqa: E402

    res = []
    for fid in files:
        real = pie.read_resp(os.path.join(HZ, "resp", f"{fid}.csv.gz"))
        w = real["weight"].values.astype(float)
        skel = real[[c for c in SKEL if c in real]].copy()
        tgts = [(i, t) for i, t in enumerate(targets) if t["file"] == fid and t["id"] in real]
        personas = []
        for s in range(a.seeds):
            P = pie.generate_anchors(model, skel, np.random.default_rng(4100 + s))
            personas.append((P, pie.feature_columns(P)))
        crude = {m["hold"]["id"]: m for m in ep.match_items([t for _, t in tgts], [p for p in pool] if a.mode == "seen" else pool)}
        syn_cols = {m: {} for m in a.methods.split(",")}
        for ti, t in tgts:
            codes = [o["code"] for o in t["options"]]
            K = len(codes)
            rc = real[t["id"]].astype(str).where(real[t["id"]].notna(), None)
            ok = rc.isin(codes).values
            if ok.sum() < 150:
                continue
            truth = wdist(rc.values[ok], w[ok], codes)
            fam = t.get("family")
            mask = np.array([(a.mode == "seen" or not fam or p.get("family") != fam) for p in pool])
            sims = np.where(mask, pv @ tv[ti], -1)
            lk = label_key(t["options"])
            scale = np.mean(by_labels[lk], axis=0) if lk in by_labels else None
            row = {"item": t["id"], "file": fid, "K": K, "type": t["type"], "construct": t.get("construct"), "text": t["text"][:140], "n": int(ok.sum()),
                   "truth": np.round(truth * 100, 2).tolist(), "scaleAvailable": scale is not None}
            top = np.argsort(-sims)[:5]
            row["top"] = [{"id": pool[j]["id"], "sim": round(float(sims[j]), 3), "text": pool[j]["text"][:100], "K": len(pool[j]["options"])} for j in top]
            res_m = {}

            def score_err(dist, cat_by_seed=None):
                e = {"MAE": float(np.mean(np.abs(dist - truth)) * 100)}
                return e
            # ---- βάσεις σύγκρισης επιπέδου
            res_m["unif"] = {"dist": np.full(K, 1 / K), "answered": True}
            res_m["scale"] = {"dist": scale if scale is not None else np.full(K, 1 / K), "answered": scale is not None}
            # ---- μέθοδοι με τεκμήριο
            def from_source(src_list, level_mode):
                """src_list: [(pool_index, weight)]· επιστρέφει (κατηγορίες ανά σπόρο, κατανομή επιπέδου)."""
                cats, dists = [], []
                for s, (P, X) in enumerate(personas):
                    rng = np.random.default_rng(777 + s * 31 + ti)
                    total = np.zeros(len(P))
                    used = 0
                    lev_src = None
                    for j, wt in src_list:
                        src = pool[j]
                        sc = latent_score(src, P, X, rng, model)
                        if sc is None:
                            continue
                        sgn = orientation(opt_vecs(t), opt_vecs(src))
                        zsc = (sc - sc.mean()) / (sc.std() + 1e-9)
                        total += wt * sgn * zsc
                        used += 1
                        if lev_src is None and len(src["options"]) == K:
                            pr = expected_probs(src, X).mean(axis=0) if True else None
                            pr = np.average(expected_probs(src, X), axis=0, weights=P["weight"].values)
                            lev_src = pr if sgn > 0 else pr[::-1]
                    if not used:
                        return None, None
                    sim_top = src_list[0][2] if len(src_list[0]) > 2 else None
                    if level_mode == "source":
                        lev = lev_src if lev_src is not None else (scale if scale is not None else np.full(K, 1 / K))
                    else:
                        tier = level_mode
                        wv = W.get(tier, 0.0)
                        base = scale if scale is not None else np.full(K, 1 / K)
                        lev = wv * lev_src + (1 - wv) * base if lev_src is not None else base
                    lev = np.clip(lev, 1e-6, None)
                    lev = lev / lev.sum()
                    cats.append(rank_assign(total, P["weight"].values, lev))
                    dists.append(lev)
                return cats, np.mean(dists, axis=0)
            top1 = top[0]
            s1 = float(sims[top1])
            tier = "paraphrase" if s1 >= 0.85 else "related" if s1 >= 0.65 else "weak"
            row["tier"] = tier
            ordinal_pool_top = [j for j in np.argsort(-sims)[:20] if pool[j]["model"]["kind"] == "ordinal"]
            for m in a.methods.split(","):
                if m in ("sem", "semlev", "semens"):
                    if not ordinal_pool_top or t["type"] == "nominal":
                        res_m[m] = {"answered": False}
                        continue
                    j0 = ordinal_pool_top[0]
                    if m == "sem":
                        cats, lev = from_source([(j0, 1.0)], "source")
                    elif m == "semlev":
                        cats, lev = from_source([(j0, 1.0)], tier)
                    else:
                        js = ordinal_pool_top[:3]
                        ws = np.array([max(sims[j], 0) ** 4 for j in js])
                        cats, lev = from_source([(j, float(x / ws.sum())) for j, x in zip(js, ws)], tier)
                    if cats is None:
                        res_m[m] = {"answered": False}
                        continue
                    res_m[m] = {"dist": lev, "answered": True, "cats": cats, "src": pool[j0]["id"]}
                elif m == "crude":
                    mt = crude.get(t["id"])
                    if not mt or mt["kind"] == "not_estimable" or mt["train"]["model"]["kind"] != "ordinal":
                        res_m[m] = {"answered": False}
                        continue
                    src = mt["train"]
                    inv = {v: k for k, v in mt["map"].items()}
                    pr = np.average(expected_probs(src, personas[0][1]), axis=0, weights=personas[0][0]["weight"].values)
                    scodes = [o["code"] for o in src["options"]]
                    dist = np.zeros(K)
                    for ci, c in enumerate(scodes):
                        if c in inv:
                            dist[codes.index(inv[c])] += pr[ci]
                    res_m[m] = {"dist": dist / dist.sum(), "answered": True, "src": src["id"]}
                elif m == "lex":
                    d = lex.get(t["id"])
                    if not d or not d.get("accepted") or not d.get("itemId"):
                        res_m[m] = {"answered": False}
                        continue
                    src = next((p for p in pool if p["id"] == d["itemId"]), None)
                    if src is None or (a.mode == "unseen" and fam and src.get("family") == fam):
                        res_m[m] = {"answered": False}
                        continue
                    pr = np.average(expected_probs(src, personas[0][1]), axis=0, weights=personas[0][0]["weight"].values)
                    scodes = [o["code"] for o in src["options"]]
                    dist = np.zeros(K)
                    for opt, cs in d["optionMap"].items():
                        oi = [o["label"] for o in t["options"]].index(opt) if opt in [o["label"] for o in t["options"]] else None
                        if oi is None:
                            continue
                        for c in cs:
                            if c in scodes:
                                dist[oi] += pr[scodes.index(c)]
                    if dist.sum() <= 0:
                        res_m[m] = {"answered": False}
                        continue
                    res_m[m] = {"dist": dist / dist.sum(), "answered": True, "src": src["id"]}
            row["methods"] = {}
            for m, r in res_m.items():
                if not r.get("answered"):
                    row["methods"][m] = {"answered": False}
                    continue
                rr = {"answered": True, "MAE": round(float(np.mean(np.abs(r["dist"] - truth)) * 100), 3), "dist": np.round(r["dist"] * 100, 2).tolist()}
                if "src" in r:
                    rr["src"] = r["src"]
                if "cats" in r:
                    # δεσμευμένη απόκλιση (ridit) ανά ηλικία/φύλο/μόρφωση
                    xr = np.array([codes.index(v) if v in codes else np.nan for v in rc.values], dtype=float)
                    gaps = []
                    xs = r["cats"][0].astype(float)
                    rr_r, rr_s = ridit(xr, w), ridit(xs, w)
                    for g in ("age_band", "gender", "edu3"):
                        if g not in real:
                            continue
                        gv = real[g].values
                        for lev_ in [x for x in pd.unique(gv) if isinstance(x, str)]:
                            mm = gv == lev_
                            if (mm & ~np.isnan(rr_r)).sum() < 60:
                                continue
                            dr = np.nanmean(rr_r[mm]) - np.nanmean(rr_r)
                            ds = np.nanmean(rr_s[mm]) - np.nanmean(rr_s)
                            gaps.append(abs(dr - ds))
                    rr["condErr"] = round(float(np.mean(gaps)), 4) if gaps else None
                    syn_cols[m][t["id"]] = xs
                row["methods"][m] = rr
            res.append(row)
        # συσχετίσεις μεταξύ ερωτήσεων-στόχων (R1) ανά μέθοδο
        for m, cols in syn_cols.items():
            ids = list(cols)
            errs = []
            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    t1 = next(t for _, t in tgts if t["id"] == ids[i])
                    t2 = next(t for _, t in tgts if t["id"] == ids[j])
                    c1, c2 = [o["code"] for o in t1["options"]], [o["code"] for o in t2["options"]]
                    x1 = np.array([c1.index(v) if v in c1 else np.nan for v in real[ids[i]].astype(str)], dtype=float)
                    x2 = np.array([c2.index(v) if v in c2 else np.nan for v in real[ids[j]].astype(str)], dtype=float)
                    rr_ = wspear(x1, x2, w)
                    rs_ = wspear(cols[ids[i]], cols[ids[j]], w)
                    if rr_ == rr_ and rs_ == rs_:
                        errs.append((abs(rr_ - rs_), abs(rr_)))
            res.append({"file": fid, "assoc": m, "pairs": len(errs), "R1": round(float(np.mean([e for e, _ in errs])), 4) if errs else None,
                        "R1_strong": round(float(np.mean([e for e, r in errs if r > 0.2])), 4) if any(r > 0.2 for _, r in errs) else None})
    json.dump(res, open(a.out, "w"), ensure_ascii=False, indent=1, default=float)
    summarize(res)


def summarize(res):
    rows = [r for r in res if "methods" in r]
    print(f"targets: {len(rows)}")
    for tier in ("paraphrase", "related", "weak", "ALL"):
        rs = [r for r in rows if tier == "ALL" or r.get("tier") == tier]
        if not rs:
            continue
        line = f"{tier:10s} n={len(rs):3d} "
        for m in ("unif", "scale", "crude", "lex", "sem", "semlev", "semens"):
            v = [r["methods"][m]["MAE"] for r in rs if m in r["methods"] and r["methods"][m].get("answered")]
            if v:
                line += f"| {m} {np.mean(v):5.1f} cov {len(v) / len(rs) * 100:3.0f}% "
        print(line)
    for r in res:
        if "assoc" in r:
            print("assoc", r)


if __name__ == "__main__":
    main()
