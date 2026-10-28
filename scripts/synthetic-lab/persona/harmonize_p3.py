"""
Phase 3: σύνολα ΕΠΙΒΕΒΑΙΩΣΗΣ (PHASE3_PREREGISTRATION §1) — ποτέ εκπαίδευση.

  python3 -I scripts/synthetic-lab/persona/harmonize_p3.py --root . --lits <lits_iv.dta> --issp <2023_data_gr.sav>

K1  LiTS IV (EBRD), Ελλάδα, πεδίο 12/2022–3/2023, προσωπική συνέντευξη, n≈1.001 → resp/lits4.csv.gz
K2  ISSP 2023 «National Identity», Ελλάδα, πεδίο 5/2023–4/2024 (κυρίως web), n=1.463 → resp/issp2023.csv.gz
Γράφονται μόνο δημογραφικά (σκελετός) και οι στήλες που δηλώνονται στις αντιστοιχίσεις p3-*.json· αρνητικοί κωδικοί → κενό.
Ο ρόλος 'final_holdout' αποκλείει τα αρχεία από κάθε εκπαίδευση (train.py).
"""
import argparse
import json
import os

import numpy as np
import pandas as pd
import pyreadstat

AGE_BANDS = [(17, 24, "17-24"), (25, 34, "25-34"), (35, 44, "35-44"), (45, 54, "45-54"), (55, 64, "55-64"), (65, 200, "65+")]
LITS_ITEMS = ["q401a", "q401c", "q401d", "q401f", "q402", "q403a", "q403b", "q403d", "q403e", "q403f", "q403g", "q403h", "q403i", "q403j", "q403l",
              "q408d", "q829a", "q829b", "q836b", "q836e"]
ISSP_ITEMS = ["v14", "v19", "v26", "v27", "v29", "v31", "v38", "v45", "v47", "v48", "v51", "v52", "v53", "v59"]
LR_MAP_0_10 = {0: 1, 1: 1, 2: 2, 3: 2, 4: 3, 5: 4, 6: 5, 7: 5, 8: 6, 9: 6, 10: 6}  # ίδια εξίσωση με το ESS10 (equate_lr, αναφορά 2021-12)


def age_band(a):
    if a != a:
        return None
    for lo, hi, b in AGE_BANDS:
        if lo <= a <= hi:
            return b
    return None


def clean(s):
    v = pd.to_numeric(s, errors="coerce")
    return v.where(v >= 0)


def lits(path):
    cols = ["country", "region", "urbanity", "rand_resp_code", "q109b", "weight"] + LITS_ITEMS
    df, _ = pyreadstat.read_dta(path)
    g = df[df.country == 13].reset_index(drop=True)
    code = pd.to_numeric(g.rand_resp_code, errors="coerce").fillna(1).astype(int)
    age = np.array([pd.to_numeric(g.at[i, f"q105{c}"], errors="coerce") if f"q105{c}" in g else np.nan for i, c in enumerate(code)], dtype=float)
    sex = np.array([pd.to_numeric(g.at[i, f"q103{c}"], errors="coerce") if f"q103{c}" in g else np.nan for i, c in enumerate(code)], dtype=float)
    out = pd.DataFrame({"rid": [f"lits4-{i:05d}" for i in range(len(g))]})
    w = pd.to_numeric(g.weight, errors="coerce").fillna(1.0)
    out["weight"] = (w / w.mean()).round(5)
    out["age_band"] = [age_band(a) for a in age]
    out["gender"] = pd.Series(sex).map({1.0: "male", 2.0: "female"})
    out["edu3"] = pd.to_numeric(g.q109b, errors="coerce").map(lambda v: None if v != v or v < 1 else "low" if v <= 3 else "medium" if v <= 5 else "high")
    out["nuts1"] = g.region.astype(str).map({"Attiki": "attica", "Voreia Ellada": "north", "Kentriki Ellada": "centre", "Nisia Aigaiou, Kriti": "islands"})
    out["urban"] = pd.to_numeric(g.urbanity, errors="coerce").map({1.0: "urban", 2.0: "rural"})
    for c in LITS_ITEMS:
        out[f"lits4::{c}"] = clean(g[c]) if c in g else np.nan
    del cols
    return out


def issp(path):
    df, _ = pyreadstat.read_sav(path, encoding="cp1253")
    out = pd.DataFrame({"rid": [f"issp23-{i:05d}" for i in range(len(df))]})
    out["weight"] = 1.0  # PSWEIGHT = «No weighting» στο ελληνικό αρχείο
    out["age_band"] = [age_band(a) for a in pd.to_numeric(df.AGE, errors="coerce")]
    out["gender"] = pd.to_numeric(df.SEX, errors="coerce").map({1.0: "male", 2.0: "female"})
    out["edu3"] = pd.to_numeric(df.EDULEVEL, errors="coerce").map(lambda v: None if v != v or v < 0 else "low" if v <= 2 else "medium" if v <= 4 else "high")
    reg = pd.to_numeric(df.GR_REG, errors="coerce")
    out["nuts1"] = reg.map(lambda v: None if v != v else "attica" if v == 30 else "islands" if v in (41, 42, 43) else "north" if 51 <= v <= 54 else "centre" if 61 <= v <= 65 else None)
    out["urban"] = pd.to_numeric(df.URBRURAL, errors="coerce").map({1.0: "urban", 2.0: "urban", 3.0: "urban", 4.0: "rural", 5.0: "rural"})
    lr = clean(df.v46)
    out["lr11"] = lr
    out["lr7"] = lr.map(lambda v: LR_MAP_0_10.get(int(v)) if v == v else np.nan)
    out["lr_none"] = pd.to_numeric(df.v46, errors="coerce").map(lambda v: 1 if v == -8 else (0 if v == v and v >= 0 else np.nan))
    for c in ISSP_ITEMS:
        out[f"issp23::{c}"] = clean(df[c])
    return out


def register(root, file_id, frame, meta):
    hz = os.path.join(root, ".synthetic-lab-data", "persona", "harmonized")
    frame.to_csv(os.path.join(hz, "resp", f"{file_id}.csv.gz"), index=False, compression="gzip")
    fp = os.path.join(hz, "files.json")
    files = [f for f in json.load(open(fp)) if f["fileId"] != file_id]
    files.append({"fileId": file_id, **meta, "n": int(len(frame)), "nItems": int(sum(1 for c in frame.columns if "::" in c)), "role": "final_holdout",
                  "realRespondents": True, "anchors": [c for c in ("age_band", "gender", "edu3", "nuts1", "urban", "lr7", "lr_none") if c in frame]})
    json.dump(files, open(fp, "w"), ensure_ascii=False, indent=1)
    print(file_id, len(frame), "γραμμές")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--lits", required=True)
    ap.add_argument("--issp", required=True)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    register(root, "lits4", lits(a.lits), {"family": "lits", "source": "EBRD Life in Transition Survey IV (Ελλάδα)", "url": "https://www.ebrd.com/what-we-do/economic-research-and-data/data/lits.html",
                                           "wave": "2023-01", "waveApprox": True, "licence": "EBRD LiTS terms (έρευνα)", "tier": "research", "mode": "προσωπική συνέντευξη", "population": "Ελλάδα 18+"})
    register(root, "issp2023", issp(a.issp), {"family": "issp", "source": "ISSP 2023 National Identity — ελληνικό αρχείο (Zenodo 18155062)", "url": "https://zenodo.org/records/18155062",
                                              "wave": "2023-07", "waveApprox": True, "licence": "βλ. Zenodo record", "tier": "research", "mode": "κυρίως web αυτοσυμπλήρωση (95%)", "population": "Ελλάδα 18+"})
