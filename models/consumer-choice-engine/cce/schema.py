"""CCE — κανονική μορφή δεδομένων επιλογής (long format) και έλεγχοι εγκυρότητας.

Μία γραμμή = μία εναλλακτική σε μία κατάσταση επιλογής (choice situation).
Υποχρεωτικές στήλες:
  respondent_id   πραγματικός ερωτώμενος (μονάδα διαχωρισμού train/validation/test — όχι η κατάσταση επιλογής)
  situation_id    μοναδικό αναγνωριστικό κατάστασης επιλογής (ερωτώμενος × task)
  alt_id          ετικέτα εναλλακτικής (π.χ. 'repair', 'new', 'refurb', 'none' ή 'A','B','none')
  chosen          1 για την επιλεγμένη εναλλακτική, 0 αλλιώς — ακριβώς ένα 1 ανά κατάσταση
Οι υπόλοιπες στήλες είναι χαρακτηριστικά εναλλακτικών (μεταβάλλονται μέσα στην κατάσταση) ή χαρακτηριστικά ερωτώμενου
(σταθερά ανά respondent_id). Κάθε σύνολο δεδομένων συνοδεύεται από manifest προέλευσης (πηγή, άδεια, hash).
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

REQUIRED = ("respondent_id", "situation_id", "alt_id", "chosen")


@dataclass
class DatasetManifest:
    dataset_id: str
    title: str
    source_url: str
    licence: str
    country: str
    years: str
    population: str
    collection: str                      # 'stated_preference_dce' | 'revealed_preference' | ...
    unit: str
    n_respondents: int = 0
    n_situations: int = 0
    n_rows: int = 0
    alternatives: list = field(default_factory=list)
    alt_attributes: dict = field(default_factory=dict)       # όνομα → {"unit":…, "levels"/"range":…, "description":…}
    respondent_covariates: dict = field(default_factory=dict)
    raw_files: list = field(default_factory=list)            # [{"name","sha256","bytes"}]
    data_sha256: str = ""
    notes: list = field(default_factory=list)
    greek_relevance: str = ""
    transfer_limits: str = ""

    def to_json(self, path: Path):
        Path(path).write_text(json.dumps(asdict(self), ensure_ascii=False, indent=1), encoding="utf-8")


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def frame_sha256(df: pd.DataFrame) -> str:
    return hashlib.sha256(pd.util.hash_pandas_object(df, index=False).values.tobytes()).hexdigest()


def validate(df: pd.DataFrame, alt_attrs: list[str], covariates: list[str] = ()) -> list[str]:
    """Επιστρέφει λίστα προβλημάτων (κενή = έγκυρο)."""
    errs = []
    for c in REQUIRED:
        if c not in df.columns:
            errs.append(f"λείπει η στήλη {c}")
    if errs:
        return errs
    ch = df.groupby("situation_id")["chosen"].sum()
    if (ch != 1).any():
        errs.append(f"{int((ch != 1).sum())} καταστάσεις χωρίς ακριβώς μία επιλογή")
    sit_resp = df.groupby("situation_id")["respondent_id"].nunique()
    if (sit_resp != 1).any():
        errs.append("κατάσταση επιλογής που αντιστοιχεί σε >1 ερωτώμενο")
    if df.duplicated(["situation_id", "alt_id"]).any():
        errs.append("διπλή εναλλακτική μέσα σε κατάσταση")
    for a in alt_attrs:
        if a not in df.columns:
            errs.append(f"λείπει χαρακτηριστικό {a}")
        elif df[a].isna().any():
            errs.append(f"κενές τιμές στο χαρακτηριστικό {a}")
    for c in covariates:
        if c not in df.columns:
            errs.append(f"λείπει χαρακτηριστικό ερωτώμενου {c}")
        elif (df.groupby("respondent_id")[c].nunique(dropna=False) > 1).any():
            errs.append(f"το {c} δεν είναι σταθερό ανά ερωτώμενο")
    return errs


@dataclass
class ChoiceArrays:
    """Πίνακες για εκτίμηση: γραμμές = εναλλακτικές, ομαδοποιημένες συνεχόμενα ανά κατάσταση."""
    X: np.ndarray            # (n_rows, p)
    y: np.ndarray            # (n_rows,) 0/1
    sit_start: np.ndarray    # αρχή κάθε κατάστασης στις γραμμές
    sit_resp: np.ndarray     # δείκτης ερωτώμενου ανά κατάσταση (0..R-1)
    row_sit: np.ndarray      # δείκτης κατάστασης ανά γραμμή
    feature_names: list
    resp_ids: np.ndarray     # πραγματικά respondent_id ανά δείκτη
    alt_ids: np.ndarray      # alt_id ανά γραμμή


def build_design(df: pd.DataFrame, terms: list[dict]) -> ChoiceArrays:
    """terms: [{'name':…, 'kind':'attr', 'col':…} | {'kind':'asc', 'alt':…} | {'kind':'attr_x_cov', 'col':…, 'cov':…, 'cov_value':… (προαιρετικό)}
    | {'kind':'asc_x_cov', 'alt':…, 'cov':…, 'cov_value':…}]· όλα αριθμητικά, χωρίς κανονικοποίηση (ερμηνεύσιμοι συντελεστές)."""
    df = df.sort_values(["situation_id", "alt_id"], kind="mergesort").reset_index(drop=True)
    cols = []
    for t in terms:
        k = t["kind"]
        if k == "attr":
            v = df[t["col"]].astype(float).to_numpy()
        elif k == "asc":
            v = (df["alt_id"].astype(str) == str(t["alt"])).astype(float).to_numpy()
        elif k == "attr_x_cov":
            cv = (df[t["cov"]] == t["cov_value"]).astype(float) if "cov_value" in t else df[t["cov"]].astype(float)
            v = (df[t["col"]].astype(float) * cv).to_numpy()
        elif k == "asc_x_cov":
            cv = (df[t["cov"]] == t["cov_value"]).astype(float) if "cov_value" in t else df[t["cov"]].astype(float)
            v = ((df["alt_id"].astype(str) == str(t["alt"])).astype(float) * cv).to_numpy()
        else:
            raise ValueError(f"άγνωστος όρος {k}")
        cols.append(v)
    X = np.column_stack(cols) if cols else np.zeros((len(df), 0))
    sit_codes, sit_index = np.unique(df["situation_id"].to_numpy(), return_inverse=True)
    starts = np.r_[0, np.flatnonzero(np.diff(sit_index)) + 1]
    resp_codes, resp_index = np.unique(df["respondent_id"].astype(str).to_numpy(), return_inverse=True)
    sit_resp = resp_index[starts]
    return ChoiceArrays(X=X, y=df["chosen"].astype(float).to_numpy(), sit_start=starts, sit_resp=sit_resp, row_sit=sit_index,
                        feature_names=[t["name"] for t in terms], resp_ids=resp_codes, alt_ids=df["alt_id"].astype(str).to_numpy())
