"""Πλαίσιο δειγματοληψίας ενηλίκων Ελλάδας (ASE).

Πηγή εγγραφών: GLOPOP-S v5.0 (Ton et al., CC BY 4.0) — πλήρη αρχεία 13 περιφερειών (10.625.742 πρόσωπα), ίδιες
κωδικοποιήσεις με τον TS πληθυσμό του Lab (lib/synthetic-lab/population). Κάθε εγγραφή είναι συνεκτικό πρόσωπο
νοικοκυριού (ηλικία, φύλο, εκπαίδευση, νοικοκυριό, εισόδημα, περιοχή από το ίδιο μικροπροσομοιωμένο άτομο).

Βήματα:
  1. Ενήλικες: ζώνες ηλικίας ≥ 15–24. Η ζώνη 15–24 χρησιμοποιείται ως «18–24» και το βάρος της βαθμονομείται στον επίσημο
     πληθυσμό 18–24 (παραδοχή A1: τα χαρακτηριστικά των 18–24 προσεγγίζονται από τη ζώνη 15–24 του GLOPOP-S).
  2. Κανόνες συνέπειας: απορρίπτονται εγγραφές με αντιφατικό νοικοκυριό (μονοπρόσωπο με μέγεθος > 1 ή αντίστροφα).
  3. Τυχαίο (seeded) υποδείγμα ανά περιφέρεια, αναλογικό του ενήλικου πληθυσμού της.
  4. Raking στα επίσημα 2025: περιφέρεια × ηλικία × φύλο (Eurostat demo_r_pjangroup, 18–24 από 15–19/20–24 και
     demo_pjan) και εκπαίδευση × ηλικία × φύλο για 25–64 (Eurostat edat_lfs_9901). Το εισόδημα (πεμπτημόρια GLOPOP-S
     2015) δεν βαθμονομείται — δηλώνεται.
Έξοδος: .synthetic-lab-data/ase/frames/<frame_id>.csv.gz + manifest με πηγές, hashes, στόχους και επιτευχθείσες κατανομές.
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd

from ..paths import ASE_DATA, GLOPOP_RAW, OFFICIAL_ASE, OFFICIAL_TS
from ..util import derive_seed, now_iso, sha256_file, write_json

COLUMNS = ["HID", "RELATE_HEAD", "INCOME", "WEALTH", "RURAL", "AGE", "GENDER", "EDUC", "HHTYPE", "HHSIZE_CAT", "AGRI_OWNERSHIP", "FLOOR", "WALL", "ROOF", "SOURCE"]
REGIONS = {"GRCr101": "Αττική", "GRCr102": "Βόρειο Αιγαίο", "GRCr103": "Νότιο Αιγαίο", "GRCr104": "Κρήτη", "GRCr105": "Ανατολική Μακεδονία & Θράκη",
           "GRCr106": "Κεντρική Μακεδονία", "GRCr107": "Δυτική Μακεδονία", "GRCr108": "Ήπειρος", "GRCr109": "Θεσσαλία", "GRCr110": "Ιόνια Νησιά",
           "GRCr111": "Δυτική Ελλάδα", "GRCr112": "Στερεά Ελλάδα", "GRCr113": "Πελοπόννησος"}
NUTS2 = {"EL30": "GRCr101", "EL41": "GRCr102", "EL42": "GRCr103", "EL43": "GRCr104", "EL51": "GRCr105", "EL52": "GRCr106", "EL53": "GRCr107",
         "EL54": "GRCr108", "EL61": "GRCr109", "EL62": "GRCr110", "EL63": "GRCr111", "EL64": "GRCr112", "EL65": "GRCr113"}
AGE = {3: "18-24", 4: "25-34", 5: "35-44", 6: "45-54", 7: "55-64", 8: "65+"}
EDUC = {1: "less_than_primary", 2: "primary", 3: "lower_secondary", 4: "upper_secondary", 5: "tertiary"}
EDU3 = {"less_than_primary": "ED0-2", "primary": "ED0-2", "lower_secondary": "ED0-2", "upper_secondary": "ED3_4", "tertiary": "ED5-8"}
HHTYPE = {1: "single", 2: "couple", 3: "couple_with_children", 4: "single_parent", 5: "couple_with_relatives", 6: "couple_with_children_and_relatives",
          7: "single_parent_with_relatives", 8: "other"}
HHSIZE = {1: "1", 2: "2", 3: "3-4", 4: "5-6", 5: "7-10", 6: "10+"}
RELATE = {1: "head", 2: "partner", 3: "child", 4: "relative", 5: "non_relative"}
SOURCE_GLOPOP = {"dataset": "GLOPOP-S v5.0", "doi": "https://doi.org/10.7910/DVN/KJC3RH", "licence": "CC BY 4.0", "reference_year": 2015,
                 "attribution": "GLOPOP-S (Ton et al.), Harvard Dataverse, doi:10.7910/DVN/KJC3RH, v5.0 — CC BY 4.0"}


def _jsonstat_cells(d: dict, keys: list[str]) -> dict:
    """JSON-stat → {(τιμή διάστασης για κάθε key): value}."""
    dims = d["id"]
    sizes = d["size"]
    idx = {k: {v: i for v, i in d["dimension"][k]["category"]["index"].items()} for k in dims}
    inv = {k: {i: v for v, i in idx[k].items()} for k in dims}
    out = {}
    for flat, val in d["value"].items():
        flat = int(flat)
        coords = []
        for s in reversed(sizes):
            coords.append(flat % s)
            flat //= s
        coords = list(reversed(coords))
        lab = {k: inv[k][c] for k, c in zip(dims, coords)}
        out[tuple(lab[k] for k in keys)] = val
    return out


def official_targets() -> dict:
    """Στόχοι 2025: κελιά (region, age, gender) και μερίδια εκπαίδευσης ανά (age, gender) για 25–64."""
    pop = json.loads((OFFICIAL_TS / "eurostat-population-2025.json").read_text(encoding="utf-8"))
    cells = {}
    for k, v in pop["cells"].items():
        r, a, g = k.split("|")
        if a in ("25-34", "35-44", "45-54", "55-64", "65+"):
            cells[(r, a, g)] = float(v)
    grp = json.loads((OFFICIAL_ASE / "demo_r_pjangroup_15_24_2025.json").read_text(encoding="utf-8"))
    one = json.loads((OFFICIAL_ASE / "demo_pjan_15_19_EL_2025.json").read_text(encoding="utf-8"))
    g5 = _jsonstat_cells(grp, ["geo", "sex", "age"])
    s1 = _jsonstat_cells(one, ["sex", "age"])
    share_18_19 = {}
    for sx in ("M", "F"):
        tot = sum(s1[(sx, f"Y{a}")] for a in range(15, 20))
        share_18_19[sx] = (s1[(sx, "Y18")] + s1[(sx, "Y19")]) / tot
    for nuts, r in NUTS2.items():
        for sx, g in (("M", "male"), ("F", "female")):
            cells[(r, "18-24", g)] = g5[(nuts, sx, "Y20-24")] + g5[(nuts, sx, "Y15-19")] * share_18_19[sx]
    edu = json.loads((OFFICIAL_TS / "eurostat-education-2025.json").read_text(encoding="utf-8"))
    edu_share = {}
    for a in ("25-34", "35-44", "45-54", "55-64"):
        for g in ("male", "female"):
            vals = {e: float(edu["cells"][f"{a}|{g}|{e}"]) for e in ("ED0-2", "ED3_4", "ED5-8")}
            t = sum(vals.values())
            edu_share[(a, g)] = {e: v / t for e, v in vals.items()}
    return {"cells": cells, "edu_share": edu_share, "share_18_19_in_15_19": share_18_19,
            "sources": [{"id": pop["datasetId"], "source": pop["source"], "licence": pop["license"], "updated": pop.get("updated")},
                        {"id": "eurostat-demo_r_pjangroup-15-24-2025", "source": "Eurostat demo_r_pjangroup (Y15-19, Y20-24, NUTS2, 2025)", "licence": "CC BY 4.0",
                         "updated": grp.get("updated")},
                        {"id": "eurostat-demo_pjan-15-19-EL-2025", "source": "Eurostat demo_pjan (ηλικίες 15–19, Ελλάδα, 2025)", "licence": "CC BY 4.0", "updated": one.get("updated")},
                        {"id": edu["datasetId"], "source": edu["source"], "licence": edu["license"], "updated": edu.get("updated")}]}


def read_region(path: Path) -> pd.DataFrame:
    raw = gzip.open(path).read()
    a = np.frombuffer(raw, dtype="<i4")
    n = a.size // len(COLUMNS)
    m = a.reshape(len(COLUMNS), n)
    return pd.DataFrame({c: m[i] for i, c in enumerate(COLUMNS[:10])})


def rake(df: pd.DataFrame, targets: dict, iters: int = 100, tol: float = 1e-7) -> tuple[np.ndarray, dict]:
    w = df["w"].to_numpy(dtype=float).copy()
    key_c = list(zip(df["region_code"], df["age_band"], df["gender"]))
    cell_idx = pd.Series(range(len(df))).groupby(pd.Index(key_c)).apply(list).to_dict()
    edu_key = list(zip(df["age_band"], df["gender"], df["education"].map(EDU3)))
    edu_idx = pd.Series(range(len(df))).groupby(pd.Index(edu_key)).apply(list).to_dict()
    hist = []
    for it in range(iters):
        maxdev = 0.0
        for k, ix in cell_idx.items():
            t = targets["cells"].get(k)
            if t is None:
                continue
            s = w[ix].sum()
            maxdev = max(maxdev, abs(s / t - 1))
            w[ix] *= t / s
        for (a, g), shares in targets["edu_share"].items():
            tot = sum(w[cell] .sum() for (aa, gg, ee), cell in edu_idx.items() if aa == a and gg == g)
            for e, sh in shares.items():
                ix = edu_idx.get((a, g, e))
                if not ix:
                    continue
                s = w[ix].sum()
                tgt = sh * tot
                maxdev = max(maxdev, abs(s / tgt - 1))
                w[ix] *= tgt / s
        hist.append(maxdev)
        if maxdev < tol:
            break
    return w, {"iterations": len(hist), "final_max_rel_dev": hist[-1]}


def build_frame(frame_size: int = 250_000, seed: int = 20261031, frame_id: str = "gr_adults_2025_v1") -> Path:
    tg = official_targets()
    rng = np.random.default_rng(derive_seed(seed, frame_id))
    parts, src_files, dropped = [], [], {}
    regions = {}
    for code in REGIONS:
        p = GLOPOP_RAW / f"synthpop_{code}.dat.gz"
        df = read_region(p)
        n_all = len(df)
        df = df[df["AGE"] >= 3].copy()
        bad = ((df["HHTYPE"] == 1) & (df["HHSIZE_CAT"] != 1)) | ((df["HHSIZE_CAT"] == 1) & (df["HHTYPE"] != 1)) | (~df["EDUC"].isin(EDUC)) | (~df["HHTYPE"].isin(HHTYPE))
        dropped[code] = int(bad.sum())
        df = df[~bad]
        regions[code] = {"rows": n_all, "adult_rows_valid": len(df)}
        df["source_row"] = df.index
        df["region_code"] = code
        parts.append(df)
        src_files.append({"file": p.name, "sha256": sha256_file(p), "rows": n_all})
    full = pd.concat(parts, ignore_index=True)
    tot = len(full)
    sel = []
    for code, g in full.groupby("region_code"):
        m = max(1, round(frame_size * len(g) / tot))
        ix = rng.choice(len(g), size=min(m, len(g)), replace=False)
        sub = g.iloc[np.sort(ix)].copy()
        sub["w"] = len(g) / len(sub)
        sel.append(sub)
    fr = pd.concat(sel, ignore_index=True)
    out = pd.DataFrame({
        "frame_id": [f"{frame_id}:{r}:{s}" for r, s in zip(fr["region_code"], fr["source_row"])],
        "region_code": fr["region_code"], "region": fr["region_code"].map(REGIONS),
        "age_band": fr["AGE"].map(AGE), "gender": np.where(fr["GENDER"] == 1, "male", "female"),
        "education": fr["EDUC"].map(EDUC), "settlement": np.where(fr["RURAL"] == 1, "rural", "urban"),
        "income_quintile": fr["INCOME"].where(fr["INCOME"].between(1, 5)).astype("Int64").astype(str).replace("<NA>", "unknown"),
        "household_type": fr["HHTYPE"].map(HHTYPE), "household_size": fr["HHSIZE_CAT"].map(HHSIZE),
        "household_role": fr["RELATE_HEAD"].map(RELATE).fillna("unknown"), "household_id": [f"{r}:{h}" for r, h in zip(fr["region_code"], fr["HID"])],
        "w": fr["w"]})
    out["w_base"] = out["w"]
    w, info = rake(out, tg)
    out["w"] = w
    dest = ASE_DATA / "frames" / f"{frame_id}.csv.gz"
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(dest, index=False, compression="gzip")
    achieved = {v: (out.groupby(v)["w"].sum() / out["w"].sum() * 100).round(2).to_dict() for v in ("age_band", "gender", "region", "education", "income_quintile", "household_type", "settlement")}
    manifest = {"frame_id": frame_id, "created_at": now_iso(), "seed": seed, "rows": len(out), "represented_adults": float(out["w"].sum()),
                "glopop": SOURCE_GLOPOP, "glopop_files": src_files, "regions": regions, "dropped_inconsistent": dropped,
                "targets_sources": tg["sources"], "share_18_19_in_15_19": tg["share_18_19_in_15_19"], "raking": info, "weighted_margins_pct": achieved,
                "assumptions": [
                    "A1: Τα χαρακτηριστικά των 18–24 προσεγγίζονται από τη ζώνη 15–24 του GLOPOP-S· το συνολικό βάρος βαθμονομείται στον επίσημο πληθυσμό 18–24 (2025).",
                    "A2: Πληθυσμός 18–24 ανά περιφέρεια = 20–24 + 15–19 × εθνικό μερίδιο 18–19 στους 15–19 ανά φύλο (Eurostat 2025).",
                    "A3: Εκπαίδευση βαθμονομείται μόνο για 25–64 (κάλυψη LFS)· για 18–24 και 65+ ισχύει η κατανομή του GLOPOP-S.",
                    "A4: Εισοδηματικά πεμπτημόρια = GLOPOP-S (LIS 2015), χωρίς επικαιροποίηση· νοικοκυριό/περιοχή επίσης από GLOPOP-S 2015.",
                    "A5: Δεν υπάρχουν πραγματικά δεδομένα για απασχόληση, επάγγελμα, οικογενειακή κατάσταση πέρα από τον τύπο νοικοκυριού· δηλώνονται άγνωστα.",
                    "A6: Γνωστό ζήτημα πηγής: πληθυσμοί Βορείου/Νοτίου Αιγαίου πιθανόν αντεστραμμένοι στο GLOPOP-S· τα βάρη διορθώνονται από το raking στους επίσημους στόχους."]}
    write_json(dest.with_suffix("").with_suffix(".manifest.json"), manifest)
    return dest
