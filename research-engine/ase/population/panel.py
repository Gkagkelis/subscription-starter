"""Δυναμικός generator συνθετικού πάνελ ανά μελέτη (ASE).

Ρυθμίσεις (config.yaml → panel):
  sample_size: οποιοσδήποτε αριθμός (π.χ. 100, 500, 1500, 5000)
  population: adults_18_plus
  geography: nationwide | {regions: [Αττική, ...]}
  filters: {gender: [female], age_band: [25-34, 35-44, 45-54], ...}       (στοχευμένο κοινό)
  sampling: {strategy: demographic_quota, variables: [age, gender, region, household_type, education, income_band], tolerance_pp: 2}
  random_seed, reuse_panel_from (ρητή επαναχρησιμοποίηση), avoid_overlap (προεπιλογή: true), extensions (κλαδικά χαρακτηριστικά)

Μέθοδος:
  1. Στόχοι = σταθμισμένες κατανομές του πλαισίου (βαθμονομημένο σε Eurostat/ΕΛΣΤΑΤ 2025) περιορισμένου στο κοινό-στόχο.
  2. Κύρια στρώματα = περιφέρεια × ηλικία × φύλο (όσα από αυτά είναι quota)· κατανομή n με μεγαλύτερο υπόλοιπο.
  3. Επιλογή χωρίς επανάθεση με πιθανότητα ανάλογη του βάρους (Efraimidis–Spirakis), seed = f(random_seed, study_id).
  4. Εξισορρόπηση δευτερευουσών quotas (εκπαίδευση, νοικοκυριό, εισόδημα…) με ανταλλαγές ΜΟΝΟ μέσα στο ίδιο στρώμα,
     ώστε οι κύριες quotas να μένουν ακριβείς. Τα προφίλ είναι πάντα πραγματικές εγγραφές του πλαισίου (συνεκτικοί
     συνδυασμοί) — δεν συνθέτονται χαρακτηριστικά ανεξάρτητα.
  5. Έλεγχος quotas: στόχος %, επιτευχθέν %, απόκλιση, σημαία εκτός ανοχής.
Η δημογραφική ομοιότητα του πάνελ ΔΕΝ τεκμηριώνει την εγκυρότητα των συμπεριφορικών απαντήσεων (δηλώνεται στο manifest).
"""
from __future__ import annotations

from collections import Counter
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from ..paths import ASE_DATA, STUDIES_ROOT
from ..util import derive_seed, now_iso, read_json

VAR_ALIAS = {"age": "age_band", "age_band": "age_band", "gender": "gender", "sex": "gender", "region": "region", "education": "education",
             "household_type": "household_type", "household": "household_type", "income_band": "income_quintile", "income": "income_quintile",
             "income_quintile": "income_quintile", "settlement": "settlement", "household_size": "household_size"}
PRIMARY = ["region", "age_band", "gender"]
UNKNOWN_ATTRIBUTES = ["employment", "occupation", "marital_status", "personal_purchase_history", "brand_relationships"]
DISCLAIMER = ("Η δημογραφική ομοιότητα του συνθετικού πάνελ με τον πληθυσμό-στόχο δεν αποτελεί τεκμήριο ότι οι προσομοιωμένες "
              "απαντήσεις αντιστοιχούν σε πραγματικές συμπεριφορές ή απόψεις.")


@lru_cache(maxsize=4)
def load_frame(frame_id: str = "gr_adults_2025_v1") -> pd.DataFrame:
    p = ASE_DATA / "frames" / f"{frame_id}.csv.gz"
    if not p.exists():
        raise FileNotFoundError(f"Δεν υπάρχει πλαίσιο {p}. Δημιουργία: python3 -I research-engine/ase_cli.py build-frame")
    return pd.read_csv(p, dtype={"income_quintile": str, "household_size": str})


def frame_manifest(frame_id: str = "gr_adults_2025_v1") -> dict:
    return read_json(ASE_DATA / "frames" / f"{frame_id}.manifest.json")


def _largest_remainder(sizes: dict, n: int) -> dict:
    tot = sum(sizes.values())
    exact = {k: v / tot * n for k, v in sizes.items()}
    out = {k: int(np.floor(x)) for k, x in exact.items()}
    rest = sorted(sizes, key=lambda k: (-(exact[k] - out[k]), str(k)))
    for k in rest[: n - sum(out.values())]:
        out[k] += 1
    return out


def _apply_filters(fr: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    if cfg.get("population", "adults_18_plus") != "adults_18_plus":
        raise ValueError(f"Μη υποστηριζόμενος πληθυσμός: {cfg.get('population')} (διαθέσιμο: adults_18_plus)")
    df = fr
    geo = cfg.get("geography", "nationwide")
    if isinstance(geo, dict) and geo.get("regions"):
        bad = set(geo["regions"]) - set(df["region"].unique())
        if bad:
            raise ValueError(f"Άγνωστες περιφέρειες: {sorted(bad)}")
        df = df[df["region"].isin(geo["regions"])]
    for k, vals in (cfg.get("filters") or {}).items():
        col = VAR_ALIAS.get(k, k)
        if col not in df.columns:
            raise ValueError(f"Άγνωστο φίλτρο {k}")
        vals = [str(v) for v in (vals if isinstance(vals, list) else [vals])]
        bad = set(vals) - set(df[col].astype(str).unique())
        if bad:
            raise ValueError(f"Άγνωστες τιμές {sorted(bad)} για {col}")
        df = df[df[col].astype(str).isin(vals)]
    if df.empty:
        raise ValueError("Κανένα προφίλ δεν αντιστοιχεί στο κοινό-στόχο.")
    return df


def _used_frame_ids(exclude_study: str) -> set:
    used = set()
    if not STUDIES_ROOT.exists():
        return used
    for d in STUDIES_ROOT.iterdir():
        if d.name == exclude_study:
            continue
        for ext in (".csv.gz", ".parquet"):
            p = d / "internal" / f"respondents{ext}"
            if p.exists():
                t = pd.read_parquet(p) if ext == ".parquet" else pd.read_csv(p, usecols=["frame_record"], dtype=str)
                used |= set(t["frame_record"])
    return used


def generate_panel(cfg: dict, study_id: str) -> tuple[pd.DataFrame, dict]:
    """Επιστρέφει (respondents, panel_report). cfg = ενότητα panel του config."""
    n = int(cfg["sample_size"])
    if n <= 0:
        raise ValueError("sample_size πρέπει να είναι θετικό")
    seed = int(cfg.get("random_seed", 20261031))
    frame_id = cfg.get("frame_id", "gr_adults_2025_v1")
    fr = load_frame(frame_id)
    target = _apply_filters(fr, cfg)
    pool = target
    excluded = 0
    if cfg.get("avoid_overlap", True):
        used = _used_frame_ids(study_id)
        if used:
            pool = target[~target["frame_id"].isin(used)]
            excluded = len(target) - len(pool)
    if n > len(pool):
        raise ValueError(f"Ζητήθηκαν {n} προφίλ αλλά το πλαίσιο έχει {len(pool)} κατάλληλες εγγραφές για αυτό το κοινό.")
    qvars = [VAR_ALIAS[v] for v in cfg.get("sampling", {}).get("variables", ["age", "gender", "region"])]
    prim = [v for v in PRIMARY if v in qvars] or ["region"]
    sec = [v for v in qvars if v not in prim]
    tol = float(cfg.get("sampling", {}).get("tolerance_pp", 2.0))
    rng = np.random.default_rng(derive_seed(seed, study_id, "panel"))
    # στόχοι από το κοινό-στόχο (όχι από το pool μετά τον αποκλεισμό επικαλύψεων)
    W = target["w"].sum()
    targets = {v: (target.groupby(v)["w"].sum() / W).to_dict() for v in qvars}
    strata_w = target.groupby(prim)["w"].sum().to_dict()
    alloc = _largest_remainder(strata_w, n)
    pool = pool.reset_index(drop=True)
    groups = pool.groupby(prim).indices
    # διόρθωση στρωμάτων με ανεπαρκή εγγραφές (σπάνιο με πλαίσιο 250.000)
    deficit = 0
    for k in list(alloc):
        cap = len(groups.get(k, []))
        if alloc[k] > cap:
            deficit += alloc[k] - cap
            alloc[k] = cap
    for k in sorted(alloc, key=lambda k: -strata_w[k]):
        if not deficit:
            break
        room = len(groups.get(k, [])) - alloc[k]
        add = min(room, deficit)
        alloc[k] += add
        deficit -= add
    chosen, rest = {}, {}
    wv = pool["w"].to_numpy()
    for k, m in alloc.items():
        ix = np.asarray(groups.get(k, []))
        if m == 0 or len(ix) == 0:
            continue
        keys = rng.random(len(ix)) ** (1.0 / wv[ix])          # Efraimidis–Spirakis: σταθμισμένη χωρίς επανάθεση
        order = ix[np.argsort(-keys)]
        chosen[k] = list(order[:m])
        rest[k] = list(order[m:])
    # εξισορρόπηση δευτερευουσών quotas με ανταλλαγές εντός στρώματος
    swaps = 0
    if sec:
        vals = {v: pool[v].astype(str).to_numpy() for v in sec}
        cnt = {v: Counter(vals[v][i] for k in chosen for i in chosen[k]) for v in sec}
        tgt = {v: {str(l): p * n for l, p in targets[v].items()} for v in sec}

        def cost_delta(i, j):
            d = 0.0
            for v in sec:
                a, b = vals[v][i], vals[v][j]
                if a == b:
                    continue
                ta, tb = tgt[v].get(a, 0.0), tgt[v].get(b, 0.0)
                ca, cb = cnt[v][a], cnt[v][b]
                d += ((ca - 1 - ta) ** 2 - (ca - ta) ** 2) + ((cb + 1 - tb) ** 2 - (cb - tb) ** 2)
            return d

        keys_ = [k for k in chosen if rest.get(k)]
        iters = int(cfg.get("sampling", {}).get("balance_iterations", 40 * n))
        for _ in range(iters):
            k = keys_[rng.integers(len(keys_))]
            a = rng.integers(len(chosen[k]))
            b = rng.integers(min(len(rest[k]), 400))          # υποψήφιοι από την κορυφή της σταθμισμένης σειράς
            i, j = chosen[k][a], rest[k][b]
            if cost_delta(i, j) < -1e-9:
                for v in sec:
                    cnt[v][vals[v][i]] -= 1
                    cnt[v][vals[v][j]] += 1
                chosen[k][a], rest[k][b] = j, i
                swaps += 1
    idx = [i for k in sorted(chosen, key=str) for i in chosen[k]]
    sel = pool.iloc[idx].copy()
    sel = sel.sample(frac=1.0, random_state=int(derive_seed(seed, study_id, "order") % (2**32))).reset_index(drop=True)
    sel.insert(0, "respondent_id", [f"R{i + 1:05d}" for i in range(len(sel))])
    sel.insert(1, "study_id", study_id)
    sel = sel.rename(columns={"frame_id": "frame_record"})
    sel["unknown_attributes"] = ",".join(UNKNOWN_ATTRIBUTES)
    # κλαδικά χαρακτηριστικά (μόνο με τεκμηριωμένη πηγή ή ρητή, καταγεγραμμένη παραδοχή)
    ext_log = []
    for spec in cfg.get("extensions") or []:
        sel[spec["name"]], log = draw_extension(sel, spec, seed, study_id)
        ext_log.append(log)
    report = quota_report(sel, targets, tol)
    report.update({"study_id": study_id, "created_at": now_iso(), "sample_size": n, "seed": seed, "frame_id": frame_id,
                   "frame_manifest": {k: frame_manifest(frame_id).get(k) for k in ("created_at", "rows", "represented_adults", "assumptions", "targets_sources", "glopop")},
                   "target_population": {"population": cfg.get("population", "adults_18_plus"), "geography": cfg.get("geography", "nationwide"),
                                         "filters": cfg.get("filters") or {}, "frame_records": int(len(target)), "represented_people": float(W)},
                   "strata": prim, "secondary_quotas": sec, "balance_swaps": swaps, "excluded_overlap_records": int(excluded),
                   "extensions": ext_log, "unknown_attributes": UNKNOWN_ATTRIBUTES, "disclaimer": DISCLAIMER})
    return sel, report


def quota_report(sel: pd.DataFrame, targets: dict, tol: float) -> dict:
    n = len(sel)
    rows, worst = [], 0.0
    for v, t in targets.items():
        ach = sel[v].astype(str).value_counts().to_dict()
        for lvl, p in sorted(t.items(), key=lambda x: str(x[0])):
            a = ach.get(str(lvl), 0) / n
            dev = (a - p) * 100
            worst = max(worst, abs(dev))
            rows.append({"variable": v, "level": str(lvl), "target_pct": round(p * 100, 2), "achieved_pct": round(a * 100, 2), "deviation_pp": round(dev, 2),
                         "within_tolerance": abs(dev) <= tol})
    return {"quotas": rows, "max_abs_deviation_pp": round(worst, 2), "tolerance_pp": tol, "all_within_tolerance": all(r["within_tolerance"] for r in rows)}


def draw_extension(sel: pd.DataFrame, spec: dict, seed: int, study_id: str):
    """Κλαδικό χαρακτηριστικό. spec: {name, levels: {τιμή: πιθανότητα} ή conditional_on + table, source: {...}} ή
    {status: assumption, justification}. Χωρίς πηγή ή ρητή παραδοχή → σφάλμα (καμία αυθαίρετη κατανομή)."""
    src = spec.get("source")
    if not src and spec.get("status") != "assumption":
        raise ValueError(f"Το χαρακτηριστικό {spec['name']} δεν έχει τεκμηριωμένη πηγή ούτε δηλωμένη παραδοχή.")
    if spec.get("status") == "assumption" and not spec.get("justification"):
        raise ValueError(f"Η παραδοχή για {spec['name']} χρειάζεται αιτιολόγηση.")
    rng = np.random.default_rng(derive_seed(seed, study_id, "ext", spec["name"]))
    out = []
    for _, r in sel.iterrows():
        tab = spec["table"][str(r[spec["conditional_on"]])] if spec.get("conditional_on") else spec["levels"]
        lv = list(tab)
        p = np.array([tab[x] for x in lv], dtype=float)
        out.append(lv[rng.choice(len(lv), p=p / p.sum())])
    return out, {"name": spec["name"], "source": src, "status": "SOURCED" if src else "ASSUMPTION", "justification": spec.get("justification"),
                 "conditional_on": spec.get("conditional_on")}
