"""CCE — training pipeline.

    python3 -I cce_cli.py train <spec.json>          (από τον φάκελο models/consumer-choice-engine)

Ροή (σταθερή, χωρίς επιλογή υπερπαραμέτρων στο test):
  1. φόρτωση κανονικών δεδομένων + manifest, έλεγχος εγκυρότητας (schema.validate)
  2. διαχωρισμός ανά ΕΡΩΤΩΜΕΝΟ (train / validation / test)
  3. baselines: μερίδια πλειοψηφίας· conditional logit μόνο με τιμή (+ σταθερές εναλλακτικών)
  4. baseline μοντέλο: πλήρες conditional logit· candidate: panel mixed logit (αν ορίζεται)
  5. επιλογή μοντέλου ΜΟΝΟ με το validation log loss· το test αξιολογείται μία φορά για όλα
  6. τελική επανεκτίμηση του επιλεγμένου στο train+validation· artifact με συντελεστές, συνδιακύμανση, πεδίο εφαρμογής,
     hash δεδομένων, μετρικές
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

from . import CCE_VERSION
from .evaluate import bootstrap_ci, metrics, respondent_split
from .models import ConditionalLogit, MarginalShares, MixedLogit
from .schema import build_design, frame_sha256, validate


def run(spec_path: str):
    spec = json.loads(Path(spec_path).read_text(encoding="utf-8"))
    root = Path(spec_path).resolve().parent.parent
    data_path = Path(spec["data"]) if Path(spec["data"]).is_absolute() else (root / spec["data"])
    df = pd.read_csv(data_path)
    manifest = json.loads((data_path.parent / spec["manifest"]).read_text(encoding="utf-8"))
    # holdout / repeat tasks (σχεδιασμός CCE: task_type = holdout_* / repeat_of_*): εκτός εκπαίδευσης· τα holdout αξιολογούνται χωριστά
    held = df.iloc[0:0]
    if "task_type" in df.columns:
        held = df[df["task_type"].astype(str).str.startswith("holdout")]
        df = df[df["task_type"].astype(str) == "design"]
    attrs = [t["col"] for t in spec["terms"] if t["kind"] in ("attr", "attr_x_cov")]
    covs = sorted({t["cov"] for t in spec["terms"] if "cov" in t} - set(spec.get("context_vars", [])))
    errs = validate(df, sorted(set(attrs)), covs)
    if errs:
        raise SystemExit("Μη έγκυρα δεδομένα: " + "; ".join(errs))
    strata = None
    if spec.get("split_strata"):
        strata = df.groupby("respondent_id")[spec["split_strata"]].first().astype(str).to_dict()
        strata = {str(k): v for k, v in strata.items()}
    split = respondent_split(df["respondent_id"].astype(str).unique(), tuple(spec.get("split", [0.6, 0.2, 0.2])), salt=spec["model_id"], strata=strata)
    df["_split"] = df["respondent_id"].astype(str).map(split)
    parts = {k: df[df["_split"] == k] for k in ("train", "validation", "test")}
    D = {k: build_design(v, spec["terms"]) for k, v in parts.items()}
    Dp = {k: build_design(v, spec["price_only_terms"]) for k, v in parts.items()}
    t0 = time.time()
    models = {}
    models["majority"] = MarginalShares().fit(D["train"])
    models["price_only_logit"] = ConditionalLogit().fit(Dp["train"])
    models["conditional_logit"] = ConditionalLogit().fit(D["train"])
    if spec.get("mixed"):
        mx = MixedLogit(spec["mixed"]["random"], draws=spec["mixed"].get("draws", 200))
        models["mixed_logit"] = mx.fit(D["train"], init_coef=models["conditional_logit"].coef)
    preds = {}
    for name, m in models.items():
        for k in ("validation", "test"):
            A = Dp[k] if name == "price_only_logit" else D[k]
            preds[(name, k)] = m.predict_rows(A)
    ev = {name: {k: metrics(Dp[k] if name == "price_only_logit" else D[k], preds[(name, k)]) for k in ("validation", "test")} for name in models}
    cand = [n for n in models if n not in ("majority",)]
    chosen = min(cand, key=lambda n: ev[n]["validation"]["log_loss"])
    # διαστήματα bootstrap (ανά ερωτώμενο) στο test για το επιλεγμένο και τη διαφορά από τα baselines
    ci = {"chosen": bootstrap_ci(D["test"], preds[(chosen, "test")])}
    for base in ("majority", "price_only_logit", "conditional_logit"):
        if base != chosen:
            ci[f"vs_{base}"] = bootstrap_ci(D["test"], preds[(chosen, "test")], other=preds[(base, "test")])
    # τελική επανεκτίμηση στο train+validation
    full = pd.concat([parts["train"], parts["validation"]])
    Dfull = build_design(full, spec["terms"])
    final = ConditionalLogit().fit(Dfull) if chosen in ("conditional_logit",) else (
        MixedLogit(spec["mixed"]["random"], draws=spec["mixed"].get("draws", 200)).fit(Dfull, init_coef=ConditionalLogit().fit(Dfull).coef)
        if chosen == "mixed_logit" else ConditionalLogit().fit(build_design(full, spec["price_only_terms"])))
    holdout_eval = {}
    if len(held):
        test_ids = {k for k, v in split.items() if v == "test"}
        h = held[held["respondent_id"].astype(str).isin(test_ids)]
        if len(h):
            terms_final = spec["terms"] if chosen != "price_only_logit" else spec["price_only_terms"]
            for tt, g in h.groupby("task_type"):
                Ah = build_design(g, terms_final)
                ph = final.predict_rows(Ah)
                obs = pd.Series(Ah.y).groupby(Ah.alt_ids).mean().to_dict()
                pred = pd.Series(ph).groupby(Ah.alt_ids).mean().to_dict()
                holdout_eval[tt] = {"n_respondents": int(g["respondent_id"].nunique()), "metrics": metrics(Ah, ph), "observed_shares": obs, "predicted_shares": pred,
                                    "note": "Ερωτώμενοι του test (δεν συμμετείχαν στην εκτίμηση) σε σταθερά σενάρια που ΔΕΝ ανήκουν στον σχεδιασμό εκπαίδευσης."}
    domain = {"categories": spec["domain"]["categories"], "populations": spec["domain"]["populations"], "alternatives": sorted(df["alt_id"].astype(str).unique().tolist()),
              "attributes": {a: {"range": [float(df[a].min()), float(df[a].max())], "unit": spec["domain"].get("units", {}).get(a, "")} for a in sorted(set(attrs))}}
    art = {
        "cce_version": CCE_VERSION, "model_id": spec["model_id"], "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "seconds": round(time.time() - t0, 1),
        "status": spec.get("status", "EXPERIMENTAL"), "dataset": {"manifest": manifest, "data_sha256": frame_sha256(df.drop(columns=["_split"]))},
        "terms": spec["terms"] if chosen != "price_only_logit" else spec["price_only_terms"], "selected": chosen, "model": final.to_dict(), "domain": domain,
        "split": {k: int((pd.Series(split) == k).sum()) for k in ("train", "validation", "test")},
        "validation": {"source_population": {"metrics": ev, "bootstrap_test": ci, "note": spec.get("validation_note", "")},
                       "holdout_tasks": holdout_eval, "external": spec.get("external_validation", {})},
        "behavior_spec": spec.get("behavior_spec"), "limitations": spec.get("limitations", []),
    }
    for name, m in models.items():
        art.setdefault("candidates", {})[name] = m.to_dict()
    out = root / "artifacts" / f"{spec['model_id']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(art, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{spec['model_id']}: επιλέχθηκε {chosen}")
    for n in models:
        print(f"  {n:20s} val LL {ev[n]['validation']['log_loss']:.4f} · test LL {ev[n]['test']['log_loss']:.4f} · acc {ev[n]['test']['accuracy']:.3f} · Brier {ev[n]['test']['brier']:.4f} · ECE {ev[n]['test']['ece']:.3f}")
    print("  bootstrap:", json.dumps(ci))
    return art


if __name__ == "__main__":
    run(sys.argv[1])
