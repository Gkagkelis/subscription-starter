"""Μεταφορά δομής υποομάδων μεταξύ χωρών (transportability) για συγκεντρωτικούς δείκτες τύπου Eurostat.

Πρόβλημα: για τη χώρα-στόχο (π.χ. Ελλάδα) υπάρχει το συνολικό επίπεδο ενός δείκτη αλλά λείπει (ή είναι αναξιόπιστη) η τιμή
μιας υποομάδας (π.χ. 65–74). Μέθοδος (PP-logit):
    απόκλιση υποομάδας στη χώρα c:   d_cg = logit(p_cg) − logit(p_c,total)
    μεταφερόμενη απόκλιση:            δ_g  = Σ_c w_c d_cg / Σ_c w_c   (χώρες-πηγές ≠ στόχος, με αξιόπιστες τιμές)
    βάρη ομοιότητας:                  w_c  = exp(−|logit p_c,total − logit p_target,total| / h)   (h = διάμεση απόσταση)
    πρόβλεψη:                         p̂_target,g = σ(logit p_target,total + δ_g)
Υπόθεση μεταφοράς (δηλώνεται): η απόκλιση της υποομάδας από το εθνικό επίπεδο, στην κλίμακα logit, μοιάζει με αυτή χωρών με
παρόμοιο επίπεδο. Δεν υποτίθεται ότι το ΕΠΙΠΕΔΟ μεταφέρεται — το επίπεδο είναι πάντα το πραγματικό της χώρας-στόχου.
Μέθοδοι αναφοράς: B0 = εθνικό σύνολο για κάθε υποομάδα (καμία δομή)· B1 = μέση τιμή υποομάδας στις άλλες χώρες (καθόλου
τοπικό επίπεδο). Η μέθοδος χρησιμοποιείται μόνο αν στην επικύρωση LOCO είναι καλύτερη από τις B0/B1 (βλ. validation)."""
from __future__ import annotations

import numpy as np
import pandas as pd

FAMILIES = {"age": ["Y16_24", "Y25_34", "Y35_44", "Y45_54", "Y55_64", "Y65_74", "Y75_MAX"],
            "sex": ["M_Y16_74", "F_Y16_74"], "edu": ["I0_2", "I3_4", "I5_8"]}
UNRELIABLE = ("u",)


def logit(p):
    p = np.clip(np.asarray(p, float) / 100.0, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def inv(x):
    return 100.0 / (1.0 + np.exp(-np.asarray(x, float)))


def table(df: pd.DataFrame, indicator: str, unit: str, year: int, reliable_only: bool = True) -> pd.DataFrame:
    d = df[(df["indic_is"] == indicator) & (df["unit"] == unit) & (df["year"] == year)]
    if reliable_only:
        d = d[~d["flag"].astype(str).isin(UNRELIABLE)]
    return d.pivot_table(index="geo", columns="ind_type", values="value", aggfunc="first")


def predict(tab: pd.DataFrame, target: str, groups: list[str], target_total: float | None = None) -> dict:
    """Πρόβλεψη υποομάδων του target από τις άλλες χώρες (ο ίδιος ο target ΔΕΝ χρησιμοποιείται, εκτός από το συνολικό του επίπεδο)."""
    tt = target_total if target_total is not None else tab.loc[target, "IND_TOTAL"] if target in tab.index else np.nan
    if not np.isfinite(tt):
        return {}
    src = tab.drop(index=[target], errors="ignore").dropna(subset=["IND_TOTAL"])
    dist = np.abs(logit(src["IND_TOTAL"]) - logit(tt))
    h = float(np.median(dist)) or 0.25
    w_all = np.exp(-dist / h)
    out = {}
    for g in groups:
        if g not in src.columns:
            continue
        ok = src[g].notna()
        if ok.sum() < 5:
            continue
        d = logit(src.loc[ok, g]) - logit(src.loc[ok, "IND_TOTAL"])
        w = w_all[ok.values]
        delta = float(np.sum(w * d) / np.sum(w))
        out[g] = {"pp": float(inv(logit(tt) + delta)), "b0": float(tt), "b1": float(src.loc[ok, g].mean()), "n_sources": int(ok.sum()), "delta_logit": delta}
    return out


def loco(df: pd.DataFrame, indicator: str, unit: str, year: int, family: str) -> pd.DataFrame:
    """Leave-one-country-out: για κάθε χώρα με πραγματικές (αξιόπιστες) τιμές υποομάδων, πρόβλεψη χωρίς τις δικές της υποομάδες."""
    tab = table(df, indicator, unit, year)
    groups = FAMILIES[family]
    rows = []
    for c in tab.index:
        if not np.isfinite(tab.loc[c].get("IND_TOTAL", np.nan)):
            continue
        pr = predict(tab, c, groups)
        for g, r in pr.items():
            obs = tab.loc[c].get(g, np.nan)
            if np.isfinite(obs):
                rows.append({"indicator": indicator, "unit": unit, "year": year, "family": family, "geo": c, "group": g, "observed": float(obs),
                             "pp": r["pp"], "b0": r["b0"], "b1": r["b1"]})
    return pd.DataFrame(rows)
