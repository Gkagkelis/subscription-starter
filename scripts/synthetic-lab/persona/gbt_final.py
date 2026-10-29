"""
PHASE5 — τελική επιβεβαίωση στα κλειδωμένα ελληνικά holdouts F1, F2, F3a–h (PHASE5_PREREGISTRATION §1, §9, Τροπ. Α/Β). ΜΙΑ εκτέλεση.

Φάση Α (predict): για κάθε item των κλειδωμένων ερευνών, πρόβλεψη του ελληνικού περιθωρίου με την ΚΛΕΙΔΩΜΕΝΗ διαμόρφωση
          (config/synthetic-lab/persona/gbt/final-config.json), χωρίς ανάγνωση ελληνικών απαντήσεων. Ορατές ελληνικές στήλες = όλες οι
          ελληνικές στήλες ανάπτυξης ΕΚΤΟΣ των οικογενειών ισοδυναμίας των items της έρευνας (σενάριο S1). Βάσεις: pool, A (IQGE
          μόνο ελληνικά), ομοιόμορφη. Υποομάδες (ridit) και συσχετίσεις: μέσος των γειτόνων / όλων των χωρών. 80% διαστήματα ανά τομέα.
          Εγγραφή predictions-final.json με sha256 ΠΡΙΝ από τη Φάση Β.
Φάση Β (score): ανάγνωση locked/<sid>.GR.csv.gz και βαθμολόγηση.

  python3 -I scripts/synthetic-lab/persona/gbt_final.py --root . --phase predict
  python3 -I scripts/synthetic-lab/persona/gbt_final.py --root . --phase score
"""
import argparse
import hashlib
import json
import math
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gbt  # noqa: E402
import gbt_eval as GE  # noqa: E402

FINAL = {"wgm2018": "F1", "qog2021": "F2", "eb753": "F3a", "eb781": "F3b", "eb975": "F3c", "eb982": "F3c", "eb994": "F3c", "eb1002": "F3c", "eb1013": "F3c",
         "ebcult2007": "F3d", "ebcult2013": "F3d", "ebcult2017": "F3d", "lits3": "F3e", "qog2010": "F3f", "qog2013": "F3f", "qog2017": "F3f", "piaac1": "F3g",
         "jrcwaste": "F3h"}


def families_for(root, sids, items, sv):
    """Οικογένειες ισοδυναμίας (ίδιοι κανόνες με gbt_eval.families) για items των κλειδωμένων ερευνών."""
    import embed
    from eval_unseen import OptVecs, scale_sim, split_spec

    bank = json.load(open(os.path.join(root, ".synthetic-lab-data", "persona", "harmonized", "item_bank.json")))
    allg = [dict(it, survey=s) for s in items for it in items[s]]
    E = embed.Embedder(root)
    OV = OptVecs(E)
    Vg = E.encode([embed.item_text(it) for it in allg])
    Vb = E.encode([embed.item_text(b) for b in bank])
    sg = [split_spec(it["text"])[1] for it in allg]
    sb = [split_spec(b["text"])[1] for b in bank]
    us = sorted({x for x in sg + sb if x})
    SV = dict(zip(us, E.encode(us))) if us else {}

    def spec_ok(a, b):
        if (a is None) != (b is None):
            return False
        return a is None or float(SV[a] @ SV[b]) >= 0.8

    out = {}
    for i, it in enumerate(allg):
        if it["survey"] not in sids:
            continue
        K = len(it["options"])
        fg = set()
        for j in np.where(Vg @ Vg[i] >= 0.85)[0]:
            o = allg[j]
            if len(o["options"]) == K and spec_ok(sg[i], sg[j]) and scale_sim(OV(it), OV(o))[0] >= 0.8:
                fg.add(o["id"])
        fg |= {o["id"] for o in allg if o["var"] == it["var"] and GE.gbt_family(o["survey"]) == GE.gbt_family(it["survey"])}
        fb = {bank[j]["id"] for j in np.where(Vb @ Vg[i] >= 0.85)[0] if len(bank[j]["options"]) == K and spec_ok(sg[i], sb[j])}
        out[it["id"]] = {"famGlobal": sorted(fg), "famBank": sorted(fb)}
    return out


def predict(root, a):
    gd = gbt.root_dir(root)
    cfg = json.load(open(os.path.join(root, a.config)))
    sv, stats, items = GE.load_all(root)
    dom_all = json.load(open(os.path.join(gd, "domains_all.json")))
    sids = [s for s in FINAL if s in stats]
    fams = families_for(root, set(sids), items, sv)
    countries, cols, Z, N = gbt.build_matrix(stats, items, use_adj=cfg["adj"])
    gr = countries.index("GR")
    foreign = [i for i, c in enumerate(countries) if c != "GR"]
    mask_all = ~np.isnan(Z)
    mask_f = mask_all.copy()
    mask_f[gr] = False
    col_of = {}
    for j, c in enumerate(cols):
        col_of.setdefault(c["item"], []).append(j)
    fit = gbt.als(Z, mask_f, cfg["rank"], cfg["lam"]) if cfg.get("rank") else None
    from iqge_core import IQGE

    G = IQGE(root, os.path.join(root, ".synthetic-lab-data", "persona", "models", "pie-0.4"), json.load(open(os.path.join(root, "config/synthetic-lab/persona/iqge/params.json"))))
    P = {"createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "config": cfg, "configSha256": hashlib.sha256(open(os.path.join(root, a.config), "rb").read()).hexdigest(),
         "surveys": {}}
    for sid in sids:
        hide = set()
        for it in items[sid]:
            hide |= set(fams.get(it["id"], {}).get("famGlobal", []))
        vis = np.array([j for j in range(len(cols)) if mask_all[gr, j] and cols[j]["item"] not in hide], dtype=int)
        d = []
        for i in foreign:
            o = vis[mask_all[i, vis]]
            if len(o) >= 10:
                d.append((float(np.sqrt(np.mean((Z[i, o] - Z[gr, o]) ** 2))), i))
        d.sort()
        u = gbt.fold_in(Z[gr, vis], fit[2][vis], fit[0][vis], cfg["lam"]) if fit else None
        gw = (sv[sid].get("countries", {}).get("GR") or {}).get("wave") or sv[sid].get("wave")
        recs = []
        for it in items[sid]:
            if it.get("excludedFromTransfer"):
                continue
            js = col_of.get(it["id"])
            if not js:
                continue
            K = len(it["options"])
            have = [i for i in foreign if all(mask_all[i, j] for j in js)]
            if len(have) < 3:
                continue
            hs = set(have)
            pool = gbt.from_cols(np.nanmean(Z[np.ix_(have, js)], axis=0), it["type"], K)
            nb = [x for x in d if x[1] in hs][: cfg["k"]]
            w = np.array([1 / max(x, 0.05) ** 2 for x, _ in nb])
            zb = np.average(Z[np.ix_([i for _, i in nb], js)], axis=0, weights=w)
            pb = gbt.from_cols(zb, it["type"], K)
            pred = pb
            if cfg["model"].startswith("E") and fit:
                pc = gbt.from_cols(fit[0][js] + fit[2][js] @ u, it["type"], K)
                pred = (pb + pc) / 2
            elif cfg["model"].startswith("C") and fit:
                pred = gbt.from_cols(fit[0][js] + fit[2][js] @ u, it["type"], K)
            dom = dom_all.get(it["id"], "SOCIAL")
            q = cfg["q80"].get(dom, cfg["q80"]["ALL"])
            f = fams.get(it["id"], {})
            t = {"id": it["id"], "var": it["var"], "text": it["text"], "options": it["options"], "type": it["type"], "wave": gw}
            ra = G.interpret(t, gw, exclude_ids=set(f.get("famBank", [])))
            nbc = [countries[i] for _, i in nb]
            st = stats[sid]["items"][it["id"]]
            gaps_nb = {}
            keys = set().union(*[set(st[c]["gaps"]) for c in nbc if c in st]) if nbc else set()
            for k in keys:
                v = [st[c]["gaps"][k] for c in nbc if c in st and k in st[c]["gaps"]]
                if v:
                    gaps_nb[k] = float(np.mean(v))
            gaps_pool = {}
            for k in set().union(*[set(st[c]["gaps"]) for c in st]):
                v = [st[c]["gaps"][k] for c in st if k in st[c]["gaps"]]
                gaps_pool[k] = float(np.mean(v))
            recs.append({"item": it["id"], "domain": dom, "K": K, "type": it["type"], "nCountries": len(have), "neighbors": nbc,
                         "pred": np.round(pred * 100, 3).tolist(), "int80": [[max(0, x * 100 - q), min(100, x * 100 + q)] for x in pred],
                         "pool": np.round(pool * 100, 3).tolist(), "A": np.round(np.array(ra["level"]) * 100, 3).tolist(),
                         "gapsNb": gaps_nb, "gapsPool": gaps_pool,
                         "dispersion": np.round(np.std([gbt.from_cols(Z[i, js], it["type"], K) for i in have], axis=0) * 100, 2).tolist()})
        corr_nb, corr_pool = {}, {}
        cs = stats[sid]["corr"]
        keys = set().union(*[set(v) for v in cs.values()]) if cs else set()
        nbc0 = [countries[i] for _, i in d[: cfg["k"]]]
        for k in keys:
            v = [cs[c][k] for c in cs if k in cs[c]]
            corr_pool[k] = float(np.mean(v))
            vn = [cs[c][k] for c in nbc0 if c in cs and k in cs[c]]
            if vn:
                corr_nb[k] = float(np.mean(vn))
        P["surveys"][sid] = {"holdout": FINAL[sid], "wave": gw, "neighbors": nbc0, "items": recs, "corrNb": corr_nb, "corrPool": corr_pool}
        print(sid, FINAL[sid], len(recs), "items", nbc0, flush=True)
    blob = json.dumps(P, sort_keys=True)
    P["lockSha256"] = hashlib.sha256(blob.encode()).hexdigest()
    json.dump(P, open(os.path.join(gd, "predictions-final.json"), "x"))
    print("κλείδωμα:", P["lockSha256"])


def score(root, a):
    gd = gbt.root_dir(root)
    P = json.load(open(os.path.join(gd, "predictions-final.json")))
    rows, gaps, corr = [], [], []
    for sid, S in P["surveys"].items():
        df = pd.read_csv(os.path.join(gd, "locked", f"{sid}.GR.csv.gz"), dtype=str, keep_default_na=False, na_values=[""])
        w = pd.to_numeric(df["weight"], errors="coerce").fillna(1.0).values
        df["a3"] = df["age_band"].map(gbt.AGE3) if "age_band" in df else None
        rid = {}
        for r in S["items"]:
            codes = [o["code"] for o in next(it for it in gbt.load_items(root, sid) if it["id"] == r["item"])["options"]]
            v = df[r["item"]] if r["item"] in df else None
            if v is None:
                continue
            ok = v.isin(codes).values
            if ok.sum() < 150:
                continue
            truth = gbt.wdist(v.values[ok], w[ok], codes) * 100
            rec = {"survey": sid, "holdout": S["holdout"], "item": r["item"], "domain": r["domain"], "K": r["K"], "n": int(ok.sum())}
            for m in ("pred", "pool", "A"):
                rec[m] = float(np.mean(np.abs(np.array(r[m]) - truth)))
            rec["unif"] = float(np.mean(np.abs(100 / r["K"] - truth)))
            rec["cov80"] = float(np.mean([lo <= t <= hi for (lo, hi), t in zip(r["int80"], truth)]))
            rows.append(rec)
            if r["type"] in ("ordinal", "binary"):
                idx = np.array([codes.index(x) for x in v.values[ok]])
                rs = gbt.ridit_scores(idx, w[ok], len(codes))
                rr = rs[idx]
                mu = np.average(rr, weights=w[ok])
                tg = {}
                for dcol in ("a3", "gender", "edu3"):
                    if dcol not in df:
                        continue
                    lv = df.loc[ok, dcol].values
                    for L in pd.unique(lv):
                        if isinstance(L, str) and (lv == L).sum() >= 60:
                            tg[f"{dcol}:{L}"] = float(np.average(rr[lv == L], weights=w[ok][lv == L]) - mu)
                if tg:
                    e = lambda p: float(np.mean([abs(p.get(k, 0.0) - tg[k]) for k in tg]))
                    gaps.append({"survey": sid, "domain": r["domain"], "zero": e({}), "pool": e(r["gapsPool"]), "nb": e(r["gapsNb"])})
                x = np.full(len(df), np.nan)
                x[ok] = rr
                rid[r["item"]] = x
        for k, cp in S["corrPool"].items():
            a_, b_ = k.split("|")
            if a_ in rid and b_ in rid:
                m = ~np.isnan(rid[a_]) & ~np.isnan(rid[b_])
                if m.sum() < 150:
                    continue
                ww = w[m]
                xa, xb = rid[a_][m], rid[b_][m]
                ma, mb = np.average(xa, weights=ww), np.average(xb, weights=ww)
                c = np.average((xa - ma) * (xb - mb), weights=ww) / math.sqrt(np.average((xa - ma) ** 2, weights=ww) * np.average((xb - mb) ** 2, weights=ww))
                corr.append({"survey": sid, "zero": abs(c), "pool": abs(c - cp), "nb": abs(c - S["corrNb"].get(k, cp))})
    df = pd.DataFrame(rows)

    def boot(d, cl, n=4000):
        rng = np.random.default_rng(11)
        u = np.unique(cl)
        idx = {c: np.where(cl == c)[0] for c in u}
        bs = [np.concatenate([d[idx[c]] for c in rng.choice(u, len(u))]).mean() for _ in range(n)]
        return [round(float(np.quantile(bs, 0.1)), 3), round(float(np.quantile(bs, 0.9)), 3)]

    def block(d):
        out = {"n": int(len(d)), "surveys": int(d.survey.nunique())}
        for m in ("pred", "pool", "A", "unif"):
            out[m] = {"mean": round(float(d[m].mean()), 2), "median": round(float(d[m].median()), 2), "p90": round(float(d[m].quantile(0.9)), 2), "worst": round(float(d[m].max()), 2)}
        bases = {m: d[m].mean() for m in ("pool", "A", "unif")}
        bb = min(bases, key=bases.get)
        diff = (d["pred"] - d[bb]).values
        out["bestBaseline"] = bb
        out["vsBest"] = {"diff": round(float(diff.mean()), 3), "ci80_cluster": boot(diff, d.holdout.values) if d.holdout.nunique() > 1 else None,
                         "beats": round(float((diff < 0).mean()) * 100, 1), "negTransfer": round(float((diff > 1).mean()) * 100, 1)}
        out["cov80"] = round(float(d["cov80"].mean()) * 100, 1)
        return out

    summ = {"lockSha256": P["lockSha256"], "scoredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "ALL": block(df), "byDomain": {}, "byHoldout": {}}
    for d_ in sorted(df.domain.unique()):
        summ["byDomain"][d_] = block(df[df.domain == d_])
    for h in sorted(df.holdout.unique()):
        q = df[df.holdout == h]
        summ["byHoldout"][h] = {"n": int(len(q)), **{m: round(float(q[m].mean()), 2) for m in ("pred", "pool", "A", "unif")},
                                "diffVsBest": round(float((q["pred"] - q[min(("pool", "A", "unif"), key=lambda m: q[m].mean())]).mean()), 3),
                                "ci80": boot((q["pred"] - q["pool"]).values, q.survey.values) if q.survey.nunique() > 1 else None, "cov80": round(float(q["cov80"].mean()) * 100, 1)}
    g = pd.DataFrame(gaps)
    c = pd.DataFrame(corr)
    summ["gaps"] = {m: round(float(g[m].mean()), 4) for m in ("zero", "pool", "nb")} if len(g) else None
    summ["corr"] = {m: round(float(c[m].mean()), 4) for m in ("zero", "pool", "nb")} if len(c) else None
    # κριτήρια §9 (καλύτερη βάση = pool / A / ομοιόμορφη στο ίδιο σύνολο ερωτήσεων· ≥ 2 ανεξάρτητα holdouts με −1 π.μ. και CI < 0)
    per = []
    for h in sorted(df.holdout.unique()):
        q = df[df.holdout == h]
        bb = min(("pool", "A", "unif"), key=lambda m: q[m].mean())
        dd = (q["pred"] - q[bb]).values
        rng = np.random.default_rng(5)
        bs = [rng.choice(dd, len(dd)).mean() for _ in range(4000)]
        per.append({"holdout": h, "best": bb, "diff": round(float(dd.mean()), 3), "ci80": [round(float(np.quantile(bs, 0.1)), 3), round(float(np.quantile(bs, 0.9)), 3)]})
    summ["perHoldoutVsBest"] = per
    ok_h = [p for p in per if p["diff"] <= -1.0 and p["ci80"][1] < 0]
    worst_dom = max((v["vsBest"]["diff"] for k, v in summ["byDomain"].items() if v["n"] >= 10), default=0)
    summ["criteria"] = {"S1_improvement_ge1pp_in_ge2_holdouts": len(ok_h) >= 2, "holdoutsPassing": [p["holdout"] for p in ok_h],
                        "no_domain_worse_than_1pp": worst_dom <= 1.0, "coverage80_in_70_90": 70 <= summ["ALL"]["cov80"] <= 90}
    json.dump({"summary": summ, "rows": rows}, open(os.path.join(gd, "scores-final.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(summ, ensure_ascii=False, indent=1)[:6000])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--phase", choices=["predict", "score"], required=True)
    ap.add_argument("--config", default="config/synthetic-lab/persona/gbt/final-config.json")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    (predict if a.phase == "predict" else score)(root, a)


if __name__ == "__main__":
    main()
