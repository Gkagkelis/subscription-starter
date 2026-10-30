"""CCE — εμπειρικός έλεγχος ΜΕΤΑΦΟΡΑΣ μοντέλου σε νέο πεδίο, με πραγματικά δεδομένα (Brügge et al. 2024, Ελβετία).

Ερώτημα: πόσο χειροτερεύει η πρόβλεψη όταν ένα μοντέλο εκτιμημένο σε ΑΛΛΕΣ κατηγορίες (smartphone + TV) εφαρμόζεται σε
πλυντήρια, και πόσα ΤΟΠΙΚΑ δεδομένα χρειάζονται για να διορθωθεί; Είναι κάτω όριο της απώλειας μεταφοράς: ίδιος πληθυσμός,
ίδιο ερωτηματολόγιο, μόνο άλλη κατηγορία. Η μεταφορά από Ελβετία/ΗΠΑ σε Ελλάδα αναμένεται χειρότερη.

Τιμή και διάρκεια κανονικοποιούνται ως λόγος προς τον μέσο όρο των επιπέδων κάθε προϊόντος (αλλιώς τα εύρη δεν είναι συγκρίσιμα).
Test = οι ίδιοι held-out ερωτώμενοι πλυντηρίων με το artifact cce-0.1-swiss-ce-washing-machine (ίδιο salt).
Μοντέλα στο test:
  native_full     CL σε όλο το train πλυντηρίων (60%)
  transfer        CL σε smartphone+TV, χωρίς τοπικά δεδομένα
  transfer+scale  μεταφερμένοι συντελεστές, επανεκτίμηση ΜΟΝΟ κλίμακας και σταθεράς σε n τοπικούς ερωτώμενους
  native_n        CL μόνο στους ίδιους n τοπικούς ερωτώμενους
    python3 -I cce_cli.py transfer_check <data_dir> <out_json>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from .evaluate import bootstrap_ci, metrics, respondent_split
from .models import ConditionalLogit
from .schema import build_design

LEVELS = {"smartphone": ([1.8, 5.5, 9.2, 13.0], [2, 4, 8]), "tv": ([2.5, 8.5, 19.0, 31.0], [2, 8, 15]), "washing_machine": ([4.7, 8.9, 16.5, 32.0], [5, 10, 15])}
DUMMIES = ["repair_limited", "repair_full", "recy_limited", "recy_full", "env_impact_medium", "env_impact_very_high", "energy_E", "energy_C", "energy_A"]
TERMS = [{"name": "asc_left", "kind": "asc", "alt": "A"}, {"name": "price_rel", "kind": "attr", "col": "price_rel"}, {"name": "life_rel", "kind": "attr", "col": "life_rel"}] + \
        [{"name": d, "kind": "attr", "col": d} for d in DUMMIES]


def load(data_dir, pid):
    d = pd.read_csv(Path(data_dir) / f"brugge2024_swiss_ce_{pid}.csv")
    p, l = LEVELS[pid]
    d["price_rel"] = d["price_100chf"] / np.mean(p)
    d["life_rel"] = d["life_years"] / np.mean(l)
    return d


def run(data_dir, out_json, sizes=(25, 50, 100, 200, 400), reps=20):
    wm = load(data_dir, "washing_machine")
    src = pd.concat([load(data_dir, "smartphone"), load(data_dir, "tv")])
    split = respondent_split(wm["respondent_id"].astype(str).unique(), (0.6, 0.2, 0.2), salt="cce-0.1-swiss-ce-washing-machine")
    wm["_s"] = wm["respondent_id"].astype(str).map(split)
    tr, te = wm[wm["_s"] == "train"], wm[wm["_s"] == "test"]
    Ate = build_design(te, TERMS)
    res = {"test_respondents": int(te["respondent_id"].nunique()), "source_respondents": int(src["respondent_id"].nunique())}
    native = ConditionalLogit().fit(build_design(tr, TERMS))
    transfer = ConditionalLogit().fit(build_design(src, TERMS))
    p_nat, p_tr = native.predict_rows(Ate), transfer.predict_rows(Ate)
    res["native_full"] = {"n_local": int(tr["respondent_id"].nunique()), **{k: v for k, v in metrics(Ate, p_nat).items() if k != "calibration_table"}}
    res["transfer"] = {"n_local": 0, **{k: v for k, v in metrics(Ate, p_tr).items() if k != "calibration_table"}}
    res["transfer_vs_native_full"] = bootstrap_ci(Ate, p_tr, other=p_nat)
    res["coef_native_full"] = dict(zip(native.feature_names if hasattr(native, "feature_names") else [t["name"] for t in TERMS], native.coef.tolist()))
    res["coef_transfer"] = dict(zip([t["name"] for t in TERMS], transfer.coef.tolist()))
    # V μεταφοράς χωρίς τη σταθερά: χρησιμοποιείται ως ΕΝΑ χαρακτηριστικό (κλίμακα) + τοπική σταθερά
    bt = transfer.coef.copy()
    bt[0] = 0.0

    def scaled_frame(df):
        A = build_design(df, TERMS)
        out = df.sort_values(["situation_id", "alt_id"], kind="mergesort").reset_index(drop=True)[["respondent_id", "situation_id", "alt_id", "chosen"]].copy()
        out["v_transfer"] = A.X @ bt
        return out

    ST = [{"name": "asc_left", "kind": "asc", "alt": "A"}, {"name": "scale", "kind": "attr", "col": "v_transfer"}]
    Ste = build_design(scaled_frame(te), ST)
    ids = np.array(sorted(tr["respondent_id"].astype(str).unique()))
    rng = np.random.default_rng(1)
    curve = []
    for n in sizes:
        ll_s, ll_n, sc = [], [], []
        for _ in range(reps):
            pick = set(rng.choice(ids, size=n, replace=False))
            loc = tr[tr["respondent_id"].astype(str).isin(pick)]
            ms = ConditionalLogit().fit(build_design(scaled_frame(loc), ST))
            ll_s.append(metrics(Ste, ms.predict_rows(Ste))["log_loss"])
            sc.append(float(ms.coef[1]))
            mn = ConditionalLogit(l2=0.0).fit(build_design(loc, TERMS))
            ll_n.append(metrics(Ate, mn.predict_rows(Ate))["log_loss"])
        curve.append({"n_local": n, "reps": reps, "transfer_plus_scale_log_loss": float(np.mean(ll_s)), "transfer_plus_scale_sd": float(np.std(ll_s)),
                      "native_n_log_loss": float(np.mean(ll_n)), "native_n_sd": float(np.std(ll_n)), "scale_mean": float(np.mean(sc))})
    res["local_sample_curve"] = curve
    Path(out_json).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    return res


if __name__ == "__main__":
    r = run(sys.argv[1], sys.argv[2])
    print(json.dumps({k: v for k, v in r.items() if not k.startswith("coef")}, ensure_ascii=False, indent=1))
