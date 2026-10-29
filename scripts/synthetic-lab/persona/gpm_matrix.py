"""
PHASE6 — Ελληνικός πίνακας ερωτώμενων × ερωτήσεων (GRIM) με ρητή έλλειψη τιμών και γράφο σύνδεσης ερωτήσεων.

Πηγές (ΜΟΝΟ πραγματικοί Έλληνες ερωτώμενοι):
  - .synthetic-lab-data/persona/harmonized/resp/*.csv.gz  (ελληνικές έρευνες: διαΝΕΟσις, CSES, MAPLE, ESS10/11, HBS, ...)
  - .synthetic-lab-data/global-behavior-evidence/v1/{resp,locked}  (ελληνικές γραμμές των διεθνών ερευνών)
Διπλότυπα (ίδιοι ερωτώμενοι σε δύο αντίγραφα) κρατούνται ΜΙΑ φορά (προτεραιότητα στο ελληνικό εναρμονισμένο αντίγραφο).
Οι έρευνες του νέου μητρώου holdout της Phase 6 (config/synthetic-lab/persona/gpm/holdouts.json) ΔΕΝ διαβάζονται.

Σύνδεση ερωτήσεων (union-find):
  - οικογένεια ίδιας ερώτησης στα κύματα της ελληνικής τράπεζας (item_bank.family)·
  - ισοδυναμίες Phase 5 (families.json: famGlobal/famBank)·
  - ίδια μεταβλητή στην ίδια σειρά ερευνών με ίδιο Κ (ess*, eb*, maple*, wrp*, wgm*, efsa*, qog*, lits*).
Δημογραφικά (ηλικία, φύλο, μόρφωση, αστικότητα, περιφέρεια) είναι κοινές άγκυρες και ΔΕΝ μετρούν ως γέφυρες.

Έξοδος (ιδιωτική): .synthetic-lab-data/gpm/v1/{respondents.csv.gz, items.json, values.npz, manifest.json}

  python3 -I scripts/synthetic-lab/persona/gpm_matrix.py --root .
"""
import argparse
import glob
import gzip
import hashlib
import json
import os
import re
import time

import numpy as np
import pandas as pd
from scipy import sparse

DEMO = ["age_band", "gender", "edu3", "urban", "nuts1"]
# εναρμονισμένες άγκυρες (ίδιος ορισμός σε όλες τις ελληνικές έρευνες) → γέφυρες μεταξύ ερευνών
ANCHORS = {"lr7": ("ordinal", ["1", "2", "3", "4", "5", "6", "7"]), "econ4": ("ordinal", ["1", "2", "3", "4"]), "polint4": ("ordinal", ["1", "2", "3", "4"]),
           "inc6": ("ordinal", ["1", "2", "3", "4", "5", "6"]), "class3": ("ordinal", ["1", "2", "3"]), "incq5": ("ordinal", ["1", "2", "3", "4", "5"]),
           "believer": ("binary", ["0", "1"]), "hhsize5": ("ordinal", ["1", "2", "3", "4", "5"]),
           "emp": ("nominal", ["private_emp", "public_emp", "self_emp", "farmer", "employed", "unemployed", "retired", "student", "homemaker", "other"])}
SERIES = re.compile(r"^(ess|eb|ebs|ebcult|fl|maple_w|wrp|wgm|efsa|qog|lits|piaac|cses|hbs|dn)")
# ίδιοι ερωτώμενοι σε δύο αντίγραφα: κρατείται το ελληνικό εναρμονισμένο
DUPLICATE_GLOBAL = {"ess10": "ess10", "ess11": "ess11", "lits4": "lits4", "covidistress": "covidistress", "qog2024": "qog2024", "tisp": "tisp",
                    "wgm2020": "wellcome2020", "maple_w12": "maple2019feb", "maple_w34": "maple2019pre+post"}


def gdir(root):
    return os.path.join(root, ".synthetic-lab-data", "gpm", "v1")


def read(path):
    return pd.read_csv(path, dtype=str, keep_default_na=False, na_values=[""], low_memory=False)


class UF:
    def __init__(self):
        self.p = {}

    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb)] = min(ra, rb)


def series_of(sid):
    m = SERIES.match(sid)
    return m.group(1) if m else sid


def holdout_ids(root):
    p = os.path.join(root, "config", "synthetic-lab", "persona", "gpm", "holdouts.json")
    if not os.path.exists(p):
        return set()
    return {h["surveyId"] for h in json.load(open(p))["holdouts"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    hz = os.path.join(root, ".synthetic-lab-data", "persona", "harmonized")
    gd = os.path.join(root, ".synthetic-lab-data", "global-behavior-evidence", "v1")
    out = gdir(root)
    os.makedirs(out, exist_ok=True)
    blocked = holdout_ids(root)

    files = {f["fileId"]: f for f in json.load(open(os.path.join(hz, "files.json")))}
    bank = json.load(open(os.path.join(hz, "item_bank.json")))
    surveys = {}
    for f in sorted(glob.glob(os.path.join(gd, "surveys*.json"))):
        for v in json.load(open(f)):
            surveys[v["surveyId"]] = v
    items = {}  # id -> meta
    for b in bank:
        items[b["id"]] = {"id": b["id"], "survey": b["file"], "var": b["var"], "text": b["text"], "type": b["type"], "options": b["options"],
                          "construct": b.get("construct"), "bankFamily": b.get("family"), "lang": "el" if re.search("[α-ωΑ-Ω]", b["text"]) else "en", "src": "greek_bank"}
    gitems = {}
    for sid in surveys:
        p = os.path.join(gd, "items", f"{sid}.json")
        if os.path.exists(p):
            for it in json.load(open(p)):
                gitems[it["id"]] = dict(it, survey=sid)

    resp_frames, meta_rows = [], []
    sources = []
    # 1) ελληνικές εναρμονισμένες έρευνες
    for p in sorted(glob.glob(os.path.join(hz, "resp", "*.csv.gz"))):
        sid = os.path.basename(p)[:-7]
        if sid in blocked:
            continue
        d = read(p)
        f = files.get(sid, {})
        sources.append({"survey": sid, "copy": "greek_harmonized", "n": len(d), "wave": f.get("wave") or (surveys.get(sid) or {}).get("wave"),
                        "family": f.get("family") or (surveys.get(sid) or {}).get("family"), "licence": f.get("licence") or (surveys.get(sid) or {}).get("licence"),
                        "household": f.get("family") == "hbs", "sha256": hashlib.sha256(open(p, "rb").read()).hexdigest()})
        resp_frames.append((sid, d, sources[-1]["wave"]))
    have = {s["survey"] for s in sources}
    # 2) ελληνικές γραμμές διεθνών ερευνών (dev: resp· κλειδωμένες Phase 5, ήδη βαθμολογημένες: locked)
    for sid, v in sorted(surveys.items()):
        if "GR" not in v["countries"] or sid in blocked:
            continue
        dup = DUPLICATE_GLOBAL.get(sid)
        if dup and (dup in have or all(x in have for x in dup.split("+"))) or sid in have:
            continue
        lp, rp = os.path.join(gd, "locked", f"{sid}.GR.csv.gz"), os.path.join(gd, "resp", f"{sid}.csv.gz")
        if os.path.exists(lp):
            d, copy = read(lp), "phase5_locked_scored"
        elif os.path.exists(rp):
            d = read(rp)
            d = d[d["country"] == "GR"]
            copy = "international_lake"
        else:
            continue
        sources.append({"survey": sid, "copy": copy, "n": len(d), "wave": v["countries"]["GR"].get("wave") or v.get("wave"), "family": v["family"],
                        "licence": v.get("licence"), "commercialUse": v.get("commercialUse"), "household": False})
        resp_frames.append((sid, d, sources[-1]["wave"]))

    # τιμές: δείκτης ουσιαστικής επιλογής 0..K-1
    col_ids, col_index = [], {}
    rows, cols, vals = [], [], []
    r0 = 0
    for sid, d, wave in resp_frames:
        m = pd.DataFrame({"gid": [f"{sid}#{x}" for x in (d["rid"] if "rid" in d else range(len(d)))], "survey": sid, "wave": wave,
                          "weight": pd.to_numeric(d.get("weight", pd.Series(["1"] * len(d))), errors="coerce").fillna(1.0).values})
        for c in DEMO:
            m[c] = d[c].values if c in d else np.nan
        meta_rows.append(m)
        for c in d.columns:
            if "::" not in c:
                continue
            it = items.get(c) or gitems.get(c)
            if not it or it.get("type") not in ("ordinal", "binary", "nominal") or not 2 <= len(it["options"]) <= 11:
                continue
            if c not in items:
                items[c] = {"id": c, "survey": sid, "var": it.get("var"), "text": it["text"], "type": it["type"], "options": it["options"], "construct": None,
                            "bankFamily": None, "lang": it.get("textLanguage", "en"), "src": "international_lake", "excludedFromTransfer": it.get("excludedFromTransfer", False)}
            codes = {o["code"]: k for k, o in enumerate(it["options"])}
            v = d[c].map(codes)
            ok = v.notna().values
            if ok.sum() < 50:
                continue
            j = col_index.setdefault(c, len(col_ids))
            if j == len(col_ids):
                col_ids.append(c)
            idx = np.where(ok)[0]
            rows.append(idx + r0)
            cols.append(np.full(len(idx), j))
            vals.append(v.values[ok].astype(np.int16) + 1)
        for an, (typ, opts) in ANCHORS.items():
            if an not in d:
                continue
            v = d[an].map(lambda x: str(int(float(x))) if re.match(r"^-?\d+(\.0)?$", str(x)) else x).map({o: k for k, o in enumerate(opts)})
            ok = v.notna().values
            if ok.sum() < 50:
                continue
            c = f"{sid}::@{an}"
            items[c] = {"id": c, "survey": sid, "var": f"@{an}", "text": f"[άγκυρα] {an}", "type": typ, "options": [{"code": o, "label": o} for o in opts],
                        "construct": "anchor", "bankFamily": f"anchor:{an}", "lang": "el", "src": "anchor"}
            j = col_index.setdefault(c, len(col_ids))
            if j == len(col_ids):
                col_ids.append(c)
            idx = np.where(ok)[0]
            rows.append(idx + r0)
            cols.append(np.full(len(idx), j))
            vals.append(v.values[ok].astype(np.int16) + 1)
        r0 += len(d)
    R = pd.concat(meta_rows, ignore_index=True)
    X = sparse.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(len(R), len(col_ids)), dtype=np.int16)

    # σύνδεση ερωτήσεων
    uf = UF()
    for c in col_ids:
        uf.find(c)
    bank_fam = {}
    for c in col_ids:
        f = items[c].get("bankFamily")
        if f:
            bank_fam.setdefault(f, []).append(c)
    for fam in bank_fam.values():
        for c in fam[1:]:
            uf.union(fam[0], c)
    fams = json.load(open(os.path.join(gd, "families.json")))
    cs = set(col_ids)
    for k, f in fams.items():
        for c in f.get("famGlobal", []) + f.get("famBank", []):
            if k in cs and c in cs:
                uf.union(k, c)
    byvar = {}
    for c in col_ids:
        it = items[c]
        byvar.setdefault((series_of(it["survey"]), (it.get("var") or c.split("::")[-1]).lower(), len(it["options"])), []).append(c)
    for grp in byvar.values():
        for c in grp[1:]:
            uf.union(grp[0], c)
    link = {c: uf.find(c) for c in col_ids}

    meta = []
    for j, c in enumerate(col_ids):
        it = items[c]
        meta.append({"col": j, "id": c, "survey": it["survey"], "type": it["type"], "K": len(it["options"]), "text": it["text"][:300], "lang": it["lang"],
                     "options": [o["label"] for o in it["options"]], "construct": it.get("construct"), "link": link[c], "src": it["src"],
                     "excludedFromTransfer": bool(it.get("excludedFromTransfer"))})
    R.to_csv(os.path.join(out, "respondents.csv.gz"), index=False)
    sparse.save_npz(os.path.join(out, "values.npz"), X)
    json.dump(meta, open(os.path.join(out, "items.json"), "w"), ensure_ascii=False)
    man = {"version": "grim-1", "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "nRespondents": int(len(R)), "nItems": len(col_ids),
           "nObserved": int(X.nnz), "density": round(X.nnz / (X.shape[0] * X.shape[1]), 5), "sources": sources, "excludedHoldouts": sorted(blocked),
           "valuesSha256": hashlib.sha256(open(os.path.join(out, "values.npz"), "rb").read()).hexdigest()}
    json.dump(man, open(os.path.join(out, "manifest.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in man.items() if k != "sources"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
