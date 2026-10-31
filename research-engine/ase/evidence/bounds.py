"""Εμπειρικά κάτω όρια ανά πρόσωπο από ελληνικούς συγκεντρωτικούς δείκτες (π.χ. Eurostat), με ρητή ανακατασκευή.

Χρήση: όταν ένα μετρημένο συμβάν είναι ΛΟΓΙΚΟ ΥΠΟΣΥΝΟΛΟ της ερωτώμενης συμπεριφοράς (π.χ. «αγόρασε online ηλεκτρονικά
στο τρίμηνο» ⊂ «αγόρασε ηλεκτρική/ηλεκτρονική συσκευή στα 24 μήνες»), τότε P(ερώτηση) ≥ P(μετρημένο). Η Eurostat δίνει
μόνο περιθώρια ανά ηλικία, φύλο, εκπαίδευση. Ανακατασκευή ανά πρόσωπο:
    logit p(age, sex, edu) = b0 + a_age + s_sex + e_edu     (ΥΠΟΘΕΣΗ: χωρίς αλληλεπιδράσεις)
οι συντελεστές προσαρμόζονται (IPF στην κλίμακα logit) ώστε τα σταθμισμένα περιθώρια στη σύνθεση του ελληνικού πλαισίου
(GLOPOP-S/Eurostat 2025) να ισούνται με τα ελληνικά περιθώρια. Συντηρητικότητα:
  * αναξιόπιστες/λείπουσες ελληνικές τιμές συμπληρώνονται ΜΟΝΟ με εγκεκριμένη μεταφορά (LOCO) και μειώνονται κατά το MAE·
  * 65+: το μικρότερο από 65–74 και 75+ (έγκυρο κάτω όριο του μείγματος)·
  * αν δεν μπορεί να στηριχθεί μια οικογένεια, το όριο δεν εφαρμόζεται (καταγράφεται).
Το όριο περιορίζει μόνο από κάτω την πιθανότητα που δίνει το AI· δεν ορίζει την απάντηση."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..global_evidence.eurostat import load
from ..transport.pooling import FAMILIES, inv, logit, predict, table
from ..validation.transport import decisions

AGE = {"18-24": "Y16_24", "25-34": "Y25_34", "35-44": "Y35_44", "45-54": "Y45_54", "55-64": "Y55_64"}
SEX = {"male": "M_Y16_74", "female": "F_Y16_74"}
EDU = {"less_than_primary": "I0_2", "primary": "I0_2", "lower_secondary": "I0_2", "upper_secondary": "I3_4", "post_secondary": "I3_4", "tertiary": "I5_8"}


def greek_targets(ds: str, indicator: str, unit: str, year: int | None = None) -> dict:
    df = load(ds)
    d = df[(df["indic_is"] == indicator) & (df["unit"] == unit) & (df["geo"] == "EL")]
    yrs = sorted(d[d["ind_type"] == "IND_TOTAL"]["year"].unique())
    if not yrs:
        return {"ok": False, "reason": "χωρίς ελληνικό σύνολο"}
    y = year or int(yrs[-1])
    tab = table(df, indicator, unit, y)
    tab_all = table(df, indicator, unit, y, reliable_only=False)
    dec = decisions()
    out = {"ok": True, "dataset": ds, "indicator": indicator, "unit": unit, "year": y, "total": float(tab_all.loc["EL", "IND_TOTAL"]), "cells": {}}
    for fam, groups in FAMILIES.items():
        pr = predict(tab, "EL", groups, target_total=out["total"])
        d_ = dec.get(f"{indicator}|{unit}|{fam}", {})
        for g in groups:
            obs = tab.loc["EL", g] if ("EL" in tab.index and g in tab.columns) else np.nan
            if np.isfinite(obs):
                out["cells"][g] = {"value": float(obs), "source": "direct"}
            elif d_.get("approved") and g in pr:
                out["cells"][g] = {"value": max(0.0, pr[g]["pp"] - float(d_["mae_pp"])), "source": "transported", "mae": d_["mae_pp"]}
            else:
                out["cells"][g] = {"value": None, "source": "unavailable"}
    return out


def fit_person_model(targets: dict, frame: pd.DataFrame) -> dict:
    """IPF στην κλίμακα logit. frame: στήλες age_band, gender, education, w (ελληνικό πλαίσιο 18+)."""
    c = targets["cells"]
    t_age = {a: c.get(g, {}).get("value") for a, g in AGE.items()}
    v65 = [c.get(g, {}).get("value") for g in ("Y65_74", "Y75_MAX")]
    t_age["65+"] = min(v for v in v65 if v is not None) if any(v is not None for v in v65) else None
    t_sex = {s: c.get(g, {}).get("value") for s, g in SEX.items()}
    edu_cells = {g: c.get(g, {}).get("value") for g in ("I0_2", "I3_4", "I5_8")}
    fams = {"age_band": ({k: v for k, v in t_age.items() if v is not None}, lambda r: r),
            "gender": ({k: v for k, v in t_sex.items() if v is not None}, lambda r: r),
            "edu3": ({k: v for k, v in edu_cells.items() if v is not None}, lambda r: r)}
    f = frame.copy()
    f["edu3"] = f["education"].map(EDU)
    f = f.dropna(subset=["edu3"])
    w = f["w"].astype(float).to_numpy()
    eta = np.full(len(f), float(logit(targets["total"])))
    eff = {fam: {} for fam in fams}
    cols = {fam: f[fam].astype(str).to_numpy() for fam in fams}

    def errors():
        out = {}
        for fam, (tg, _) in fams.items():
            for lvl, val in tg.items():
                m = cols[fam] == lvl
                if m.any():
                    out[f"{fam}={lvl}"] = float(np.sum(w[m] * inv(eta[m])) / np.sum(w[m]) - val)
        return out
    for _ in range(400):
        for fam, (tg, _) in fams.items():
            for lvl, val in tg.items():
                m = cols[fam] == lvl
                if not m.any():
                    continue
                cur = np.sum(w[m] * inv(eta[m])) / np.sum(w[m])
                step = 0.5 * float(logit(val) - logit(cur))                    # απόσβεση: τα περιθώρια μπορεί να μην είναι πλήρως συμβατά
                eta[m] += step
                eff[fam][lvl] = eff[fam].get(lvl, 0.0) + step
        err = errors()
        if max(abs(v) for v in err.values()) < 0.05:
            break
    err = errors()
    max_err = max(abs(v) for v in err.values())
    used = {fam: sorted(tg) for fam, (tg, _) in fams.items()}
    return {"intercept": float(logit(targets["total"])), "effects": eff, "used_levels": used, "max_margin_error_pp": round(max_err, 3),
            "usable": bool(max_err <= 1.5), "margin_errors_pp": {k: round(v, 3) for k, v in err.items()},
            "assumption": "logit-additive κύρια αποτελέσματα ηλικίας/φύλου/εκπαίδευσης (χωρίς αλληλεπιδράσεις), σύνθεση από το ελληνικό πλαίσιο"}


def person_rate(model: dict, prof: dict) -> float | None:
    x = model["intercept"]
    for fam, key in (("age_band", prof.get("age_band")), ("gender", prof.get("gender")), ("edu3", EDU.get(str(prof.get("education"))))):
        e = model["effects"].get(fam, {})
        if key not in e:
            return None                                                      # μη στηριζόμενη ομάδα → χωρίς όριο
        x += e[key]
    return float(inv(x) / 100)
