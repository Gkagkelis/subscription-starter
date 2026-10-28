"""
Ανεξάρτητο benchmark του Persona Intelligence Engine (προκαταχώριση: docs/synthetic-lab/PERSONA_PREREGISTRATION.md).

  python3 scripts/synthetic-lab/persona/eval_persona.py --root . --split validation|final [--lam 1] [--no-factors] [--seeds 5] [--tag x]

Διαχωρισμός ΑΝΑ ΕΡΕΥΝΗΤΙΚΟ ΔΕΙΓΜΑ/ΚΥΜΑ (όχι ανά ερωτώμενο):
  validation : holdout = διαΝΕΟσις 2022 (dn2022a/b/s, πεδίο ~12/2021) · εκπαίδευση: κύματα ≤ 2021-11
  final      : holdout = διαΝΕΟσις 2024 (dn2024a/b/c, πεδίο ~12/2023) · εκπαίδευση: κύματα ≤ 2023-11
Από τα holdout αρχεία χρησιμοποιούνται ΜΟΝΟ τα δημογραφικά (σκελετός πληθυσμού: ηλικία, φύλο, μόρφωση, περιοχή,
αστικότητα, βάρος). Άγκυρες και απαντήσεις των συνθετικών προσώπων παράγονται από το μοντέλο· οι πραγματικές
απαντήσεις διαβάζονται μόνο ΜΕΤΑ το κλείδωμα (hash) των προβλέψεων.

Μηχανισμοί:
  PIE       νέος μηχανισμός (άγκυρες + λανθάνοντα χαρακτηριστικά + μοντέλα items)
  PIE_noθ   αφαίρεση λανθανόντων χαρακτηριστικών (λ = 0)
  B_prod    λογική του τρέχοντος prod-1: κατανομή του τελευταίου κύματος με κύριες επιδράσεις ηλικίας/φύλου/μόρφωσης/περιοχής
  B_last    απλή μεταφορά του περιθωρίου του τελευταίου κύματος
  B_unif    ομοιόμορφη κατανομή
"""
import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import pie  # noqa: E402
from pie import read_resp  # noqa: E402

SPLITS = {
    "validation": {"holdout": ["dn2022a", "dn2022b", "dn2022s"], "cutoff": "2021-11"},
    "final": {"holdout": ["dn2024a", "dn2024b", "dn2024c"], "cutoff": "2023-11"},
    # Test C (προκαταχώριση §9): καταναλωτική συμπεριφορά νοικοκυριών, ΕΛΣΤΑΤ ΕΟΠ
    "hbs-validation": {"holdout": ["hbs2019"], "cutoff": "2018-12", "families": "hbs", "cond": "incq5"},
    "hbs-final": {"holdout": ["hbs2020"], "cutoff": "2019-12", "families": "hbs", "cond": "incq5"},
}
KEYVARS = {"lr7": ["age_band", "gender", "edu3", "nuts1", "urban", "emp", "inc6", "econ4", "class3", "lr7", "lr_none"],
           "incq5": ["age_band", "gender", "edu3", "nuts1", "urban", "emp", "incq5", "hhsize5"]}
DEMO_FEATS = ["age_17_24", "age_25_34", "age_35_44", "age_55_64", "age_65p", "female", "edu_low", "edu_high", "n_attica", "n_north", "n_islands", "rural"]
SKEL = ["age_band", "gender", "edu3", "nuts1", "urban", "weight"]


def norm(s):
    import unicodedata

    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("ς", "σ")
    return re.sub(r"[^a-zα-ω0-9]", "", s)


def toks(t):
    import unicodedata

    s = unicodedata.normalize("NFKD", (t or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("ς", "σ")
    return {w for w in re.findall(r"[a-zα-ω]{4,}", s)}


def wdist(codes, w, cats):
    v = np.array([np.sum(w[codes == c]) for c in cats], dtype=float)
    return v / v.sum() if v.sum() > 0 else np.full(len(cats), np.nan)


def wspearman(x, y, w):
    def rank(a):
        order = np.argsort(a, kind="mergesort")
        r = np.empty(len(a))
        r[order] = np.arange(len(a))
        # μέσος βαθμός για ισοβαθμίες
        _, inv, cnt = np.unique(a, return_inverse=True, return_counts=True)
        sums = np.bincount(inv, weights=r)
        return (sums / cnt)[inv]
    rx, ry = rank(x), rank(y)
    mx, my = np.average(rx, weights=w), np.average(ry, weights=w)
    cov = np.average((rx - mx) * (ry - my), weights=w)
    sx = math.sqrt(np.average((rx - mx) ** 2, weights=w))
    sy = math.sqrt(np.average((ry - my) ** 2, weights=w))
    return cov / (sx * sy) if sx > 0 and sy > 0 else np.nan


def train(root, split, lam, factors, tag, battery_cov=False, families=""):
    ver = f"eval-{split}-{tag}"
    out = os.path.join(root, ".synthetic-lab-data", "persona", "models", "eval", ver)
    cmd = [sys.executable, os.path.join(os.path.dirname(__file__), "train.py"), "--root", root, "--cutoff", SPLITS[split]["cutoff"],
           "--version", ver, "--holdout", ",".join(SPLITS[split]["holdout"]), "--lam", str(lam), "--out", out]
    if not factors:
        cmd.append("--no-factors")
    if battery_cov:
        cmd.append("--battery-cov")
    if families or SPLITS[split].get("families"):
        cmd += ["--families", families or SPLITS[split]["families"]]
    subprocess.run(cmd, check=True, capture_output=True)
    return json.load(open(os.path.join(out, "model.json"))), json.load(open(os.path.join(out, "items.json"))), out


def match_items(hold_items, train_items):
    """Αντιστοίχιση: ίδια οικογένεια (επαναλαμβανόμενη ερώτηση) ή μεταφορά από συγγενική (ίδια κατασκευή/τύπος/πλήθος επιλογών)."""
    by_fam = {}
    for t in train_items:
        if t.get("family"):
            by_fam.setdefault(t["family"], []).append(t)
    out = []
    for h in hold_items:
        cands = by_fam.get(h.get("family"), [])
        if cands:
            latest = max(c["wave"] for c in cands)
            t = max((c for c in cands if c["wave"] == latest), key=lambda c: c["n"])
            hl = {norm(o["label"]): o["code"] for o in h["options"]}
            tl = {norm(o["label"]): o["code"] for o in t["options"]}
            if set(hl) != set(tl):
                continue
            out.append({"hold": h, "train": t, "kind": "repeated", "map": {hl[k]: tl[k] for k in hl}})
            continue
        if h.get("construct") in (None, "other") or h["type"] == "nominal":
            out.append({"hold": h, "train": None, "kind": "not_estimable"})
            continue
        K = len(h["options"])
        pool = [t for t in train_items if t.get("construct") == h["construct"] and t["type"] == h["type"] and len(t["options"]) == K]
        if not pool:
            out.append({"hold": h, "train": None, "kind": "not_estimable"})
            continue
        ht = toks(h["text"])
        t = max(pool, key=lambda t: (len(ht & toks(t["text"])) / max(1, len(ht | toks(t["text"]))), t["wave"], t["n"]))
        hp, tp = h_pol(h), h_pol(t)
        order = list(range(K))
        if hp and tp and hp != tp:
            order = order[::-1]
        out.append({"hold": h, "train": t, "kind": "transfer", "map": {h["options"][i]["code"]: t["options"][order[i]]["code"] for i in range(K)}})
    return out


def h_pol(it):
    from train import polarity

    return polarity(it)


def demo_model(train_item, root, cache={}):
    """B_prod: ίδιο item, μόνο δημογραφικές κύριες επιδράσεις, στο αρχείο εκπαίδευσης."""
    key = train_item["id"]
    if key in cache:
        return cache[key]
    df = read_resp(os.path.join(root, ".synthetic-lab-data/persona/harmonized/resp", f"{train_item['file']}.csv.gz"))
    col = df[train_item["id"]].astype(str).where(df[train_item["id"]].notna(), None)
    codes = [o["code"] for o in train_item["options"]]
    sub = col.isin(codes).values
    X = pie.feature_columns(df)
    feats = [f for f in pie.usable_features(X, 0.7) if f in DEMO_FEATS]
    Z, means = pie.design(X, feats)
    y = np.array([codes.index(v) for v in col[sub]])
    w = df["weight"].values.astype(float)[sub]
    if train_item["model"]["kind"] == "ordinal":
        m = pie.fit_ordinal(Z[sub], y, len(codes), w)
        m["kind"] = "ordinal"
    else:
        m = pie.fit_mnl(Z[sub], y, len(codes), w)
        m["kind"] = "nominal"
    cache[key] = {"feats": feats, "means": means.tolist(), "model": m, "options": train_item["options"]}
    return cache[key]


def run(a):
    root = os.path.abspath(a.root)
    split = SPLITS[a.split]
    hz = os.path.join(root, ".synthetic-lab-data", "persona", "harmonized")
    bank = json.load(open(os.path.join(hz, "item_bank.json")))
    t0 = time.time()
    model, titems, mdir = train(root, a.split, a.lam, not a.no_factors, a.tag, a.battery_cov, a.families)
    tby = {t["id"]: t for t in titems}
    results = {"split": a.split, "cutoff": split["cutoff"], "holdout": split["holdout"], "lam": a.lam, "factors": not a.no_factors,
               "seeds": a.seeds, "modelSnapshot": model["dataSnapshot"], "trainFiles": [s["fileId"] for s in model["sources"]], "files": {}}
    preds = {}
    reals = {}
    for fid in split["holdout"]:
        real = read_resp(os.path.join(hz, "resp", f"{fid}.csv.gz"))
        skel = real[SKEL].copy()
        w = real["weight"].values.astype(float)
        hitems = [h for h in bank if h["file"] == fid]
        matches = match_items(hitems, titems)
        # ---------------- ΠΡΟΒΛΕΨΕΙΣ (χωρίς πρόσβαση στις πραγματικές απαντήσεις)
        syn = {}
        for s in range(a.seeds):
            rng = np.random.default_rng(1000 + s)
            P = pie.generate_anchors(model, skel, rng)
            ans = {}
            ans_noth = {}
            for mt in matches:
                if mt["train"] is None:
                    continue
                t = mt["train"]
                ans[mt["hold"]["id"]] = pie.answer_item(t, P, np.random.default_rng(stable_seed(s, t["id"], 0)), factors=True)
                ans_noth[mt["hold"]["id"]] = pie.answer_item(t, P, np.random.default_rng(stable_seed(s, t["id"], 1)), factors=False)
            syn[s] = {"personas": P[[c for c in ("lr7", "lr_none", "pv", "incq5", "hhsize5") if c in P]].copy(), "ans": ans, "ans_noth": ans_noth}
            if s == 0:
                syn_full = P[[c for c in ("emp", "inc6", "econ4", "class3", "lr7", "lr_none", "incq5", "hhsize5") if c in P]].reset_index(drop=True)
        bprod = {}
        rngb = np.random.default_rng(99)
        for mt in matches:
            if mt["train"] is None:
                continue
            dm = demo_model(mt["train"], root)
            X = pie.feature_columns(skel)
            Z, _ = pie.design(X, dm["feats"], np.array(dm["means"]))
            Pm = pie.ordinal_probs(Z, dm["model"]) if dm["model"]["kind"] == "ordinal" else pie.mnl_probs(Z, dm["model"])
            idx = pie._sample_rows(Pm, rngb)
            codes = [o["code"] for o in mt["train"]["options"]]
            bprod[mt["hold"]["id"]] = {"expected": np.average(Pm, axis=0, weights=w), "draw": np.array([codes[i] for i in idx], dtype=object)}
        preds[fid] = {"matches": matches, "syn": syn, "bprod": bprod, "syn_full": syn_full}
        reals[fid] = real
    lock = hashlib.sha256(json.dumps({fid: {s: {k: v.tolist() for k, v in d["ans"].items()} for s, d in p["syn"].items()} for fid, p in preds.items()},
                                     sort_keys=True, default=str).encode()).hexdigest()
    results["predictionsLockSha256"] = lock
    results["lockedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    # ---------------- ΒΑΘΜΟΛΟΓΗΣΗ (μετά το κλείδωμα)
    agg = {k: [] for k in ["marg", "sub", "assoc", "lrcond", "dk", "stab", "transfer"]}
    for fid in split["holdout"]:
        real = reals[fid]
        w = real["weight"].values.astype(float)
        P = preds[fid]
        file_rows = []
        for mt in P["matches"]:
            h = mt["hold"]
            if h["id"] not in real:
                continue
            rc = real[h["id"]].astype(str).where(real[h["id"]].notna(), None)
            hcodes = [o["code"] for o in h["options"]]
            ok = rc.isin(hcodes).values
            if ok.sum() < 100:
                continue
            truth = wdist(rc.values[ok], w[ok], hcodes)
            row = {"item": h["id"], "kind": mt["kind"], "construct": h.get("construct"), "K": len(hcodes), "n": int(ok.sum())}
            row["B_unif"] = float(np.mean(np.abs(truth - 1 / len(hcodes))) * 100)
            if mt["train"] is None:
                row["status"] = "NOT_ESTIMABLE"
                file_rows.append(row)
                continue
            t = mt["train"]
            tmap = mt["map"]
            tcodes = [o["code"] for o in t["options"]]
            # PIE: μέσος όρος σπόρων της σταθμισμένης κατανομής (ΔΞ εξαιρείται)
            dists = []
            for s, d in P["syn"].items():
                a_ = d["ans"][h["id"]]
                okk = a_ != "dk"
                dists.append(wdist(np.array([tcodes.index(x) if x in tcodes else -1 for x in a_[okk]]), w[okk], list(range(len(tcodes)))))
            pie_d = np.mean(dists, axis=0)
            order = [tcodes.index(tmap[c]) for c in hcodes]
            pie_d = pie_d[order]
            row["PIE"] = float(np.mean(np.abs(truth - pie_d)) * 100)
            row["PIE_seed_sd_max"] = float(np.max(np.std(np.array(dists)[:, order], axis=0)) * 100)
            last = np.array(t["observed"]) / 100.0
            row["B_last"] = float(np.mean(np.abs(truth - last[order])) * 100)
            row["B_prod"] = float(np.mean(np.abs(truth - P["bprod"][h["id"]]["expected"][order])) * 100)
            # ΔΞ
            real_dk = float(w[(rc == "dk").values].sum() / w[rc.notna().values].sum()) if rc.notna().any() else 0
            syn_dk = float(np.mean([np.average(d["ans"][h["id"]] == "dk", weights=w) for d in P["syn"].values()]))
            row["dk_err"] = abs(real_dk - syn_dk) * 100
            row["dk_err_last"] = abs(real_dk - t.get("dkShare", 0)) * 100
            # υποομάδες (ηλικία, φύλο, μόρφωση): MAE ανά κελί με n ≥ 50
            subs = {"PIE": [], "B_prod": [], "B_last": []}
            d0 = P["syn"][0]["ans"][h["id"]]
            bp = P["bprod"][h["id"]]["draw"]
            for dim in ("age_band", "gender", "edu3"):
                for g in real[dim].dropna().unique():
                    cell = (real[dim] == g).values
                    if (cell & ok).sum() < 50:
                        continue
                    tr = wdist(rc.values[cell & ok], w[cell & ok], hcodes)
                    for name, arr in (("PIE", d0), ("B_prod", bp)):
                        m2 = cell & (arr != "dk")
                        sd = wdist(np.array([tmap_inv(tmap, x) for x in arr[m2]], dtype=object), w[m2], hcodes)
                        subs[name].append(np.mean(np.abs(tr - sd)) * 100)
                    subs["B_last"].append(np.mean(np.abs(tr - last[order])) * 100)
            for k, v in subs.items():
                row[f"sub_{k}"] = float(np.mean(v)) if v else None
            # εξάρτηση από αυτοτοποθέτηση (αριστερά/κέντρο/δεξιά/καμία)
            cond = split.get("cond", "lr7")
            if cond in real and real[cond].notna().any():
                lrg_real = cond_group(real, cond)
                lr_errs = {"PIE": [], "B_prod": []}
                lrg_syn = cond_group(P["syn"][0]["personas"], cond)
                for g in sorted(set(lrg_real) - {"na"}):
                    cr = (lrg_real == g) & ok
                    if cr.sum() < 50:
                        continue
                    tr = wdist(rc.values[cr], w[cr], hcodes)
                    cs = (lrg_syn == g) & (d0 != "dk")
                    if cs.sum() >= 30:
                        sd = wdist(np.array([tmap_inv(tmap, x) for x in d0[cs]], dtype=object), w[cs], hcodes)
                        lr_errs["PIE"].append(np.mean(np.abs(tr - sd)) * 100)
                    cb = (lrg_real == g) & (bp != "dk")  # B_prod δεν έχει άγκυρες: η «ομάδα» είναι ίδια με το σύνολο
                    sd = wdist(np.array([tmap_inv(tmap, x) for x in bp[(bp != "dk")]], dtype=object), w[bp != "dk"], hcodes)
                    lr_errs["B_prod"].append(np.mean(np.abs(tr - sd)) * 100)
                row["lr_PIE"] = float(np.mean(lr_errs["PIE"])) if lr_errs["PIE"] else None
                row["lr_B_prod"] = float(np.mean(lr_errs["B_prod"])) if lr_errs["B_prod"] else None
            row["status"] = "DIRECTLY_SUPPORTED" if mt["kind"] == "repeated" else "MODEL_EXTRAPOLATED"
            if mt["kind"] == "transfer":
                u = np.full(len(hcodes), 1 / len(hcodes))
                row["alpha"] = {str(al): float(np.mean(np.abs(truth - (al * pie_d + (1 - al) * u))) * 100) for al in (0.0, 0.25, 0.5, 0.75, 1.0)}
            file_rows.append(row)
        # συσχετίσεις μεταξύ items του ίδιου αρχείου (ordinal, επαναλαμβανόμενα)
        ords = [r["item"] for r in file_rows if r.get("status") == "DIRECTLY_SUPPORTED" and r["K"] >= 2]
        mt_by = {mt["hold"]["id"]: mt for mt in P["matches"]}
        ords = [i for i in ords if mt_by[i]["train"]["model"]["kind"] == "ordinal"]
        rng = np.random.default_rng(5)
        pairs = [(ords[i], ords[j]) for i in range(len(ords)) for j in range(i + 1, len(ords))]
        if len(pairs) > 400:
            pairs = [pairs[k] for k in rng.choice(len(pairs), 400, replace=False)]
        assoc = []
        for i1, i2 in pairs:
            m1, m2 = mt_by[i1], mt_by[i2]
            r1 = real[i1].astype(str)
            r2 = real[i2].astype(str)
            c1 = [o["code"] for o in m1["hold"]["options"]]
            c2 = [o["code"] for o in m2["hold"]["options"]]
            okr = r1.isin(c1).values & r2.isin(c2).values
            if okr.sum() < 100:
                continue
            x = np.array([c1.index(v) for v in r1[okr]])
            y = np.array([c2.index(v) for v in r2[okr]])
            rr = wspearman(x, y, w[okr])
            if np.isnan(rr):
                continue
            out = {"pair": [i1, i2], "same_construct": m1["hold"].get("construct") == m2["hold"].get("construct"), "real": rr}
            for name, key in (("PIE", "ans"), ("PIE_noθ", "ans_noth")):
                vals = []
                for d in P["syn"].values():
                    a1, a2 = d[key][i1], d[key][i2]
                    t1 = [o["code"] for o in m1["train"]["options"]]
                    t2 = [o["code"] for o in m2["train"]["options"]]
                    inv1 = {v: c1.index(k) for k, v in m1["map"].items()}
                    inv2 = {v: c2.index(k) for k, v in m2["map"].items()}
                    oks = np.array([(p in inv1) and (q in inv2) for p, q in zip(a1, a2)])
                    xs = np.array([inv1[p] for p in a1[oks]])
                    ys = np.array([inv2[q] for q in a2[oks]])
                    vals.append(wspearman(xs, ys, w[oks]))
                out[name] = float(np.nanmean(vals))
            b1, b2 = P["bprod"][i1]["draw"], P["bprod"][i2]["draw"]
            inv1 = {v: c1.index(k) for k, v in m1["map"].items()}
            inv2 = {v: c2.index(k) for k, v in m2["map"].items()}
            oks = np.array([(p in inv1) and (q in inv2) for p, q in zip(b1, b2)])
            out["B_prod"] = wspearman(np.array([inv1[p] for p in b1[oks]]), np.array([inv2[q] for q in b2[oks]]), w[oks])
            assoc.append(out)
        results["files"][fid] = {"items": file_rows, "assoc": assoc}
    # ---------------- M8 ιδιωτικότητα: πλήρης ταύτιση με εγγραφές εκπαίδευσης (δημογραφικά + άγκυρες, χωρίς ψήφο)
    keyvars = KEYVARS[split.get("cond", "lr7")]

    def keys(df):
        d = df.reindex(columns=keyvars)
        d = d.dropna(subset=[c for c in keyvars if c not in ("lr7",)])

        def canon(v):
            try:
                f = float(v)
                return "nan" if f != f else str(int(f)) if f.is_integer() else str(f)
            except (TypeError, ValueError):
                return str(v)
        d = d.apply(lambda col: col.map(canon))
        k = d.agg("|".join, axis=1)
        return set(k), k
    train_keys = set()
    for fid in results["trainFiles"]:
        df = pd.read_csv(os.path.join(hz, "resp", f"{fid}.csv.gz"), usecols=lambda c: c in keyvars, low_memory=False)
        if "lr_none" in keyvars and "lr_none" not in df and "lr7" in df:
            df["lr_none"] = np.where(df["lr7"].notna(), 0, np.nan)
        if all(c in df for c in keyvars):
            train_keys |= keys(df)[0]
    syn_k, real_k = [], []
    for fid in split["holdout"]:
        sp = preds[fid]["syn"][0]["personas"]
        full = pd.concat([reals[fid][["age_band", "gender", "edu3", "nuts1", "urban"]].reset_index(drop=True), preds[fid]["syn_full"]], axis=1)
        _, ks = keys(full)
        syn_k += list(ks)
        _, kr = keys(reals[fid])
        real_k += list(kr)
    results["privacy"] = {"trainKeys": len(train_keys), "synMatchRate": round(100 * np.mean([k in train_keys for k in syn_k]), 3) if syn_k else None,
                          "realHoldoutMatchRate": round(100 * np.mean([k in train_keys for k in real_k]), 3) if real_k else None,
                          "nSyn": len(syn_k), "nReal": len(real_k)}

    # ---------------- συνόψεις
    rows = [r for f in results["files"].values() for r in f["items"]]
    rep = [r for r in rows if r.get("status") == "DIRECTLY_SUPPORTED"]
    trf = [r for r in rows if r.get("status") == "MODEL_EXTRAPOLATED"]
    ne = [r for r in rows if r.get("status") == "NOT_ESTIMABLE"]
    ass = [x for f in results["files"].values() for x in f["assoc"]]

    def mean(v):
        v = [x for x in v if x is not None and not (isinstance(x, float) and math.isnan(x))]
        return round(float(np.mean(v)), 3) if v else None
    results["summary"] = {
        "itemsHoldout": len(rows), "repeated": len(rep), "transfer": len(trf), "notEstimable": len(ne),
        "M1_marginal_MAE_pp": {k: mean([r[k] for r in rep]) for k in ("PIE", "B_prod", "B_last", "B_unif")},
        "M2_subgroup_MAE_pp": {k: mean([r.get(f"sub_{k}") for r in rep]) for k in ("PIE", "B_prod", "B_last")},
        "M3_assoc_abs_err": {k: mean([abs(x[k] - x["real"]) for x in ass]) for k in ("PIE", "PIE_noθ", "B_prod")},
        "M3_pairs": len(ass), "M3_real_mean_abs_rho": mean([abs(x["real"]) for x in ass]),
        "M3_same_construct_abs_err": {k: mean([abs(x[k] - x["real"]) for x in ass if x["same_construct"]]) for k in ("PIE", "PIE_noθ", "B_prod")},
        "M3_sign_agreement_|real|>0.1": {k: mean([float(np.sign(x[k]) == np.sign(x["real"])) for x in ass if abs(x["real"]) > 0.1]) for k in ("PIE", "PIE_noθ", "B_prod")},
        "M4_conditional_MAE_pp": {"by": split.get("cond", "lr7"), "PIE": mean([r.get("lr_PIE") for r in rep]), "B_prod": mean([r.get("lr_B_prod") for r in rep])},
        "M5_dk_abs_err_pp": {"PIE": mean([r.get("dk_err") for r in rep]), "B_last": mean([r.get("dk_err_last") for r in rep])},
        "M6_seed_sd_max_pp": round(float(np.max([r["PIE_seed_sd_max"] for r in rep])), 3) if rep else None,
        "M6_seed_sd_mean_pp": mean([r["PIE_seed_sd_max"] for r in rep]),
        "M7_transfer_MAE_pp": {"PIE": mean([r["PIE"] for r in trf]), "B_unif": mean([r["B_unif"] for r in trf])},
        "M7_transfer_alpha_MAE_pp": {al: mean([r["alpha"][al] for r in trf if "alpha" in r]) for al in ("0.0", "0.25", "0.5", "0.75", "1.0")},
        "M8_privacy": results.get("privacy"),
        "seconds": round(time.time() - t0, 1),
    }
    out = a.out or os.path.join(root, ".synthetic-lab-data", "persona", "benchmarks", f"{a.split}-{a.tag}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(results, open(out, "w"), ensure_ascii=False, indent=1, default=float)
    print(json.dumps(results["summary"], ensure_ascii=False, indent=1))


def stable_seed(*parts):
    return int(hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:8], 16)


def tmap_inv(tmap, x):
    for h, t in tmap.items():
        if t == x:
            return h
    return None


def cond_group(df, cond):
    if cond == "lr7":
        return lr_group(df)
    v = pd.to_numeric(df[cond], errors="coerce").values
    return np.array(["na" if x != x else str(int(x)) for x in v], dtype=object)


def lr_group(df):
    l = pd.to_numeric(df["lr7"], errors="coerce").values
    none = pd.to_numeric(df.get("lr_none", pd.Series(0, index=df.index)), errors="coerce").fillna(0).values
    g = np.where(none == 1, "none", np.where(l <= 3, "left", np.where(l == 4, "centre", np.where(l >= 5, "right", "na"))))
    return g


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--split", choices=list(SPLITS), required=True)
    ap.add_argument("--lam", type=float, default=1.0)
    ap.add_argument("--no-factors", action="store_true")
    ap.add_argument("--battery-cov", action="store_true")
    ap.add_argument("--families", default="", help="οικογένειες πηγών του γενικού μοντέλου (π.χ. dianeosis_tpe,cses,maple,undpolar)")
    ap.add_argument("--seeds", type=int, default=5)
    ap.add_argument("--tag", default="default")
    ap.add_argument("--out", default=None)
    run(ap.parse_args())
