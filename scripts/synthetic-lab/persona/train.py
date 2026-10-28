"""
Εκπαίδευση έκδοσης του Persona Intelligence Engine από τα harmonised μικροδεδομένα.

  python3 scripts/synthetic-lab/persona/train.py --root . --cutoff 2026-10 --policy research --version pie-0.1 [--holdout dn2024a,dn2024b]
      [--no-factors] [--lam 1.0] [--out <dir>]

Κανόνες:
  - Χρησιμοποιούνται ΜΟΝΟ αρχεία με κύμα πεδίου ≤ cutoff και που επιτρέπει η πολιτική αδειών
    (research: όλα· commercial: μόνο tier 'open').
  - Τα holdout αρχεία (και όσα έχουν την ίδια οικογένεια/κύμα) εξαιρούνται πλήρως.
  - Συνθετικές απαντήσεις δεν διαβάζονται ποτέ (η είσοδος είναι μόνο ο φάκελος harmonized/, που γράφεται από
    πραγματικές πηγές· ο φύλακας `assert_real_inputs` το ελέγχει).
Έξοδος: <out>/model.json (+ items.json), ιδιωτικά.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import pie  # noqa: E402

NODES = [
    ("emp", ["private_emp", "public_emp", "self_emp", "farmer", "unemployed", "retired", "student", "homemaker", "other"]),
    ("inc6", [1, 2, 3, 4, 5, 6]),
    ("econ4", [1, 2, 3, 4]),
    ("class3", [1, 2, 3]),
    ("lr7", [1, 2, 3, 4, 5, 6, 7, "none"]),
    ("pv", None),  # κατηγορίες από τις τελευταίες εκλογές ≤ cutoff
    ("believer", [0, 1]),
    ("polint4", [1, 2, 3, 4]),
]
DEMO_FEATS = ["age_17_24", "age_25_34", "age_35_44", "age_55_64", "age_65p", "female", "edu_low", "edu_high",
              "n_attica", "n_north", "n_islands", "rural"]
NODE_FEATS = {
    "emp": ["emp_unemp", "emp_retired", "emp_student", "emp_home", "emp_public", "emp_self", "emp_other"],
    "inc6": ["inc"], "econ4": ["econ"], "class3": ["cls_low", "cls_high"], "lr7": ["lr", "lr2", "lr_none"],
    "pv": ["pv_nd", "pv_syriza", "pv_pasok", "pv_kke", "pv_farright", "pv_leftother", "pv_centre", "pv_other"],
    "believer": ["believer"], "polint4": ["polint"],
}
POS = r"^(πολυ|συμφων|απολυτα|σιγουρα ναι|ναι|θετικ|πολυ θετικ|καλυτερ|εμπιστευ|ισχυει πολυ|very|strongly agree|agree|yes|always|παντα|καθε|πανω)"
NEG = r"^(καθολου|διαφων|σιγουρα οχι|οχι|αρνητικ|χειροτερ|δεν|ποτε|1 (δεν|πολυ αρνητ|πολυ μακρ)|not at all|strongly dis|disagree|no\b|never|very dis)"


def ym(w):
    y, m = str(w).split("-")[:2]
    return int(y) * 12 + int(m)


def assert_real_inputs(root):
    hz = os.path.join(root, ".synthetic-lab-data", "persona", "harmonized")
    for f in json.load(open(os.path.join(hz, "files.json"))):
        assert f["family"] in ("dianeosis_tpe", "cses", "undpolar") or f.get("realRespondents") is True, f"μη πραγματική πηγή: {f['fileId']}"
    return hz


def polarity(item):
    import re

    from importlib import util

    labs = [o["label"] for o in item["options"]]
    if len(labs) < 2:
        return 0
    n = lambda s: pie_norm(s)
    first, last = n(labs[0]), n(labs[-1])
    if re.search(POS, first) or re.search(NEG, last):
        return -1
    if re.search(NEG, first) or re.search(POS, last):
        return 1
    return 0


def pie_norm(s):
    import re
    import unicodedata

    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("ς", "σ")
    return re.sub(r"\s+", " ", s).strip()


def load_file(hz, fid, cache={}):
    if fid not in cache:
        cache[fid] = pd.read_csv(os.path.join(hz, "resp", f"{fid}.csv.gz"), low_memory=False)
    return cache[fid]


def snapshot_hash(hz, fids):
    h = hashlib.sha256()
    for fid in sorted(fids):
        with open(os.path.join(hz, "resp", f"{fid}.csv.gz"), "rb") as fh:
            h.update(hashlib.sha256(fh.read()).digest())
    h.update(open(os.path.join(hz, "item_bank.json"), "rb").read())
    return h.hexdigest()


def fit_anchor_nodes(files, hz, lam, log):
    """Αλυσίδα άγκυρων· κάθε κόμβος εκπαιδεύεται στο πιο πρόσφατο κύμα που τον περιέχει (± 3 μήνες)."""
    nodes = []
    prev_nodes = []
    for node, cats in NODES:
        cand = [f for f in files if node in f["anchors"]]
        if not cand:
            log.append(f"κόμβος {node}: καμία πηγή ≤ cutoff — παραλείπεται")
            prev_nodes.append(node)
            continue
        latest = max(ym(f["wave"]) for f in cand)
        use = [f for f in cand if latest - ym(f["wave"]) <= 3]
        if node == "pv":
            elec = max(f["pvElection"] for f in use if f.get("pvElection"))
            use = [f for f in use if f.get("pvElection") == elec]
        frames = [load_file(hz, f["fileId"]) for f in use]
        df = pd.concat(frames, ignore_index=True).copy()
        if node == "lr7":
            df = df[df["lr7"].notna() | (df["lr_none"] == 1)]
        else:
            df = df[df[node].notna()]
        if node == "lr7":
            y_raw = np.where(df["lr_none"].fillna(0).values == 1, "none", df["lr7"].values)
            df = df.assign(_y=[("none" if v == "none" else int(float(v))) if v == v and v is not None else None for v in y_raw])
            df = df[df._y.notna()]
        else:
            df = df.assign(_y=df[node])
        if cats is None:
            cnt = df.groupby("_y")["weight"].sum()
            cats = [c for c in cnt.index if cnt[c] / cnt.sum() >= 0.003]
            df = df[df._y.isin(cats)]
        else:
            norm_cats = {str(c): c for c in cats}
            df = df.assign(_y=df._y.map(lambda v: norm_cats.get(str(int(float(v))) if isinstance(v, (int, float)) or str(v).replace(".", "").isdigit() else str(v))))
            df = df[df._y.notna()]
        X = pie.feature_columns(df)
        cand_feats = DEMO_FEATS + [f for p in prev_nodes for f in NODE_FEATS[p]]
        feats = [f for f in pie.usable_features(X, 0.7) if f in cand_feats]
        Z, means = pie.design(X, feats)
        y = np.array([cats.index(v) for v in df._y])
        m = pie.fit_mnl(Z, y, len(cats), df["weight"].values.astype(float), lam=lam)
        obs = df.groupby("_y")["weight"].sum()
        nodes.append({"node": node, "categories": [str(c) for c in cats], "feats": feats, "means": np.round(means, 6).tolist(),
                      "a": m["a"], "B": m["B"], "trainFiles": [f["fileId"] for f in use], "wave": max(f["wave"] for f in use),
                      "n": int(len(df)), "pvElection": use[0].get("pvElection") if node == "pv" else None,
                      "observed": {str(k): round(100 * float(v) / float(obs.sum()), 2) for k, v in obs.items()}})
        log.append(f"κόμβος {node}: {len(df)} ερωτώμενοι από {[f['fileId'] for f in use]} · χαρακτηριστικά {len(feats)}")
        prev_nodes.append(node)
    return nodes


def fit_items(files, bank, hz, lam, log, factors=True, seed=7):
    by_file = {}
    for it in bank:
        by_file.setdefault(it["file"], []).append(it)
    rng = np.random.default_rng(seed)
    out = []
    for f in files:
        df = load_file(hz, f["fileId"])
        X = pie.feature_columns(df)
        feats = pie.usable_features(X, 0.7)
        Zall, means = pie.design(X, feats)
        w_all = df["weight"].values.astype(float)
        scores = {}
        for it in by_file.get(f["fileId"], []):
            if it["id"] not in df:
                continue
            col = df[it["id"]].astype(str).where(df[it["id"]].notna(), None)
            codes = [o["code"] for o in it["options"]]
            ans = col.notna().values
            if ans.sum() < 150:
                continue
            is_dk = (col == "dk").values & ans
            sub = ans & ~is_dk & col.isin(codes).values
            if sub.sum() < 150:
                continue
            y = np.array([codes.index(v) for v in col[sub]])
            K = len(codes)
            counts = np.bincount(y, weights=w_all[sub], minlength=K)
            if (counts > 0).sum() < 2:
                continue
            rec = {"id": it["id"], "file": it["file"], "wave": it["wave"], "type": it["type"], "text": it["text"], "options": it["options"],
                   "construct": it.get("construct"), "family": it.get("family"), "feats": feats, "means": np.round(means, 6).tolist(),
                   "n": int(ans.sum())}
            dk_share = float(w_all[is_dk].sum() / w_all[ans].sum())
            rec["dkShare"] = round(dk_share, 4)
            if dk_share >= 0.01 and is_dk.sum() >= 15:
                m = pie.fit_logit(Zall[ans], is_dk[ans].astype(float), w_all[ans], lam=lam)
                rec["dk"] = {"a": round(m["a"], 6), "b": np.round(m["b"], 6).tolist()}
            obs = counts / counts.sum()
            rec["observed"] = np.round(100 * obs, 2).tolist()
            if it["type"] in ("ordinal", "binary"):
                m = pie.fit_ordinal(Zall[sub], y, K, w_all[sub], lam=lam)
                rec["model"] = {"kind": "ordinal", "b": np.round(m["b"], 6).tolist(), "tau": np.round(m["tau"], 6).tolist()}
                P = pie.ordinal_probs(Zall[sub], m)
                rec["polarity"] = polarity(it)
                if factors and K >= 2:
                    s = np.full(len(df), np.nan)
                    s[sub] = pie.pit_normal_scores(Zall[sub], y, m, rng)
                    scores[it["id"]] = s
            else:
                m = pie.fit_mnl(Zall[sub], y, K, w_all[sub], lam=lam)
                rec["model"] = {"kind": "nominal", "a": np.round(m["a"], 6).tolist(), "B": np.round(m["B"], 6).tolist()}
                P = pie.mnl_probs(Zall[sub], m)
            fitted = np.average(P, axis=0, weights=w_all[sub])
            rec["inSampleMaxErrPp"] = round(float(100 * np.max(np.abs(fitted - obs))), 3)
            rec["lambda"] = 0.0
            out.append(rec)
        # λανθάνοντες παράγοντες ανά κατασκευή μέσα στο αρχείο
        if factors:
            by_c = {}
            for rec in out:
                if rec["file"] == f["fileId"] and rec["id"] in scores and rec.get("construct") not in (None, "other"):
                    by_c.setdefault(rec["construct"], []).append(rec)
            for c, recs in by_c.items():
                if len(recs) < 2:
                    continue
                S = np.column_stack([scores[r["id"]] for r in recs])
                lam_c, _ = pie.one_factor(S)
                orient = sum(l * r.get("polarity", 0) for l, r in zip(lam_c, recs))
                sign = -1.0 if orient < 0 else 1.0
                for l, r in zip(lam_c, recs):
                    r["lambda"] = round(sign * float(l), 4)
        log.append(f"items {f['fileId']}: {sum(1 for r in out if r['file'] == f['fileId'])}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--cutoff", required=True, help="YYYY-MM: μόνο κύματα πεδίου ≤ cutoff")
    ap.add_argument("--policy", choices=["research", "commercial"], default="research")
    ap.add_argument("--version", required=True)
    ap.add_argument("--holdout", default="")
    ap.add_argument("--lam", type=float, default=1.0)
    ap.add_argument("--no-factors", action="store_true")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    hz = assert_real_inputs(root)
    files_all = json.load(open(os.path.join(hz, "files.json")))
    bank = json.load(open(os.path.join(hz, "item_bank.json")))
    hold = {h for h in a.holdout.split(",") if h}
    files = [f for f in files_all if ym(f["wave"]) <= ym(a.cutoff) and f["fileId"] not in hold
             and (a.policy == "research" or f["tier"] == "open")]
    log = []
    t0 = time.time()
    nodes = fit_anchor_nodes(files, hz, a.lam, log)
    items = fit_items(files, bank, hz, a.lam, log, factors=not a.no_factors)
    out = a.out or os.path.join(root, ".synthetic-lab-data", "persona", "models", a.version)
    os.makedirs(out, exist_ok=True)
    try:
        commit = subprocess.check_output(["git", "-C", root, "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:  # noqa: BLE001
        commit = None
    constructs = sorted({r["construct"] for r in items if r.get("construct")})
    model = {
        "version": a.version, "engine": "pie", "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "codeCommit": commit,
        "cutoff": a.cutoff, "licencePolicy": a.policy, "holdout": sorted(hold), "l2": a.lam, "factors": not a.no_factors,
        "dataSnapshot": snapshot_hash(hz, [f["fileId"] for f in files]),
        "sources": [{k: f.get(k) for k in ("fileId", "family", "source", "url", "wave", "waveApprox", "n", "licence", "tier", "commercialUse", "mode", "population", "pvElection")} for f in files],
        "features": pie.FEATURES, "featureSource": pie.FEATURE_SOURCE, "pvFamily": pie.PV_FAMILY,
        "anchorNodes": nodes, "constructs": constructs, "nItems": len(items), "trainingSeconds": round(time.time() - t0, 1), "log": log,
        "syntheticInputs": False,
    }
    json.dump(model, open(os.path.join(out, "model.json"), "w"), ensure_ascii=False)
    json.dump(items, open(os.path.join(out, "items.json"), "w"), ensure_ascii=False)
    print(f"{a.version}: {len(files)} αρχεία, {len(nodes)} κόμβοι, {len(items)} items, {time.time() - t0:.0f}s → {out}")
    for l in log:
        if l.startswith("κόμβος"):
            print("  " + l)


if __name__ == "__main__":
    main()
