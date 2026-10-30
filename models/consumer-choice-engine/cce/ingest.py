"""CCE — ingestion πραγματικών δεδομένων επιλογής σε κανονική μορφή (long) με manifest προέλευσης.

Δύο είσοδοι:
  long_csv(...)      ήδη σε μορφή «μία γραμμή ανά εναλλακτική» (π.χ. δημόσια DCE αρχεία)
  wide_tasks(...)    εξαγωγή πεδίου «μία γραμμή ανά συμμετέχοντα» (στήλες task_1..task_K με την επιλογή) + αρχείο σχεδιασμού
                     (block, task, εναλλακτική → χαρακτηριστικά). Αυτή είναι η μορφή του ελάχιστου πειράματος (CHOICE_EXPERIMENT_DESIGN.md).
Κάθε ingestion: έλεγχος εγκυρότητας, ποιοτικοί έλεγχοι συμμετεχόντων (speeders, straight-lining, αποτυχία ερώτησης ελέγχου),
hash ακατέργαστων αρχείων και τελικών δεδομένων, manifest. Τα ακατέργαστα αρχεία μένουν στον ιδιωτικό φάκελο δεδομένων.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from .schema import DatasetManifest, frame_sha256, sha256_file, validate


def long_csv(path, out_dir, manifest: DatasetManifest, rename: dict | None = None, alt_attrs=(), covariates=(), filters=None):
    df = pd.read_csv(path)
    if rename:
        df = df.rename(columns=rename)
    if filters is not None:
        df = filters(df)
    return _finish(df, [path], out_dir, manifest, alt_attrs, covariates)


def wide_tasks(responses_csv, design_json, out_dir, manifest: DatasetManifest, choice_cols: list[str], block_col="block",
               covariates=(), duration_col=None, min_seconds=None, attention_col=None, attention_pass=None, none_alt="none"):
    """responses: respondent_id, block, task_1..task_K (τιμή = alt_id ή κενό), συν χαρακτηριστικά ερωτώμενου.
    design: {"alternatives": [...], "blocks": {block: [{"task":1, "alts": {alt_id: {attr: value}}}, ...]}}"""
    resp = pd.read_csv(responses_csv)
    design = json.loads(Path(design_json).read_text(encoding="utf-8"))
    qc = {"input": len(resp)}
    if duration_col and min_seconds:
        resp = resp[resp[duration_col] >= min_seconds]
        qc["after_speeders"] = len(resp)
    if attention_col is not None:
        resp = resp[resp[attention_col] == attention_pass]
        qc["after_attention"] = len(resp)
    # straight-lining: ίδια ετικέτα εναλλακτικής σε ΟΛΑ τα tasks όταν οι εναλλακτικές δεν έχουν σταθερό νόημα (A/B)
    same = resp[choice_cols].nunique(axis=1) == 1
    qc["straightliners_flagged"] = int(same.sum())
    # test-retest: η ίδια ερώτηση επαναλαμβάνεται (type = "repeat_of_k")· ποσοστό ίδιας απάντησης
    same_rep, n_rep = 0, 0
    for _, r in resp.iterrows():
        tasks = design["blocks"][str(r[block_col])]
        for t, col in zip(tasks, choice_cols):
            if str(t.get("type", "")).startswith("repeat_of_") and not pd.isna(r[col]):
                k = int(t["type"].split("_")[-1])
                orig = r[choice_cols[k - 1]]
                if not pd.isna(orig):
                    n_rep += 1
                    same_rep += str(orig) == str(r[col])
    if n_rep:
        qc["test_retest_agreement"] = round(same_rep / n_rep, 4)
    rows = []
    for _, r in resp.iterrows():
        tasks = design["blocks"][str(r[block_col])]
        for t, col in zip(tasks, choice_cols):
            ch = r[col]
            if pd.isna(ch):
                continue
            for alt, attrs in t["alts"].items():
                row = {"respondent_id": str(r["respondent_id"]), "situation_id": f"{r['respondent_id']}_{t['task']}", "alt_id": alt, "chosen": int(str(ch) == alt), "task": t["task"],
                       "task_type": t.get("type", "design"), "block": r[block_col], **attrs}
                for c in covariates:
                    row[c] = r[c]
                rows.append(row)
    df = pd.DataFrame(rows)
    manifest.notes = list(manifest.notes) + [f"QC: {json.dumps(qc, ensure_ascii=False)}"]
    attrs = sorted({k for b in design["blocks"].values() for t in b for a in t["alts"].values() for k in a})
    return _finish(df, [responses_csv, design_json], out_dir, manifest, attrs, covariates)


def _finish(df, raw_paths, out_dir, manifest: DatasetManifest, alt_attrs, covariates):
    errs = validate(df, list(alt_attrs), list(covariates))
    if errs:
        raise ValueError("Μη έγκυρα δεδομένα επιλογής: " + "; ".join(errs))
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    df.to_csv(out / f"{manifest.dataset_id}.csv", index=False)
    manifest.raw_files = [{"name": Path(p).name, "sha256": sha256_file(p), "bytes": Path(p).stat().st_size} for p in raw_paths]
    manifest.n_rows = len(df)
    manifest.n_situations = int(df["situation_id"].nunique())
    manifest.n_respondents = int(df["respondent_id"].nunique())
    manifest.alternatives = sorted(df["alt_id"].astype(str).unique().tolist())
    manifest.data_sha256 = frame_sha256(df)
    manifest.to_json(out / f"{manifest.dataset_id}.manifest.json")
    return df
