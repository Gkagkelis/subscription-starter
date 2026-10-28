"""
Γενικός parser πινάκων ερευνών (Level A): CSV/TSV/XLSX/XLS/ODS/SPSS/Stata → μεταβλητές + κατανομές.

Κανόνες:
- Πίνακας «ατομικών απαντήσεων» μόνο αν έχει ≥30 γραμμές και ≥3 στήλες.
- Κατηγορικές μεταβλητές: 2–12 διακριτές τιμές (ή ετικέτες τιμών SPSS/Stata).
- Ποτέ δεν εξάγονται στοιχεία ταυτοποίησης ή ελεύθερο κείμενο (email, όνομα, τηλέφωνο, IP, timestamp, σχόλια).
- Κατανομές συνολικά και, όπου εντοπίζονται, ανά φύλο και ζώνη ηλικίας· κελιά με n<10 δεν εξάγονται.
- Αν υπάρχει μεταβλητή βάρους, οι κατανομές σταθμίζονται.
"""

import csv
import io
import json
import os
import re
import zipfile

from .topics import norm

PII = re.compile(r"e-?mail|ονομ|επωνυμ|\bname\b|surname|phone|τηλεφων|\bip\b|address|διευθυνσ|timestamp|χρονοσφραγ|"
                 r"σχολι|comment|signature|υπογραφ|\bid\b|respondent ?id|κωδικ")
WEIGHT = re.compile(r"weight|wgt|βαρο|σταθμ|\bw_|^w\d*$|pspwght|anweight")
GENDER = re.compile(r"gender|\bsex\b|φυλο|φύλο")
AGE = re.compile(r"\bage\b|ηλικ|age group|ageg|agecat")
MAX_ROWS = 200_000


def _bands(a):
    try:
        a = float(a)
    except (TypeError, ValueError):
        return None
    if a < 15 or a > 110:
        return None
    for lo, hi, b in ((15, 24, "15-24"), (25, 34, "25-34"), (35, 44, "35-44"), (45, 54, "45-54"), (55, 64, "55-64")):
        if lo <= a <= hi:
            return b
    return "65+"


def _gender_value(v):
    t = norm(str(v))
    if t in ("1", "m", "male", "man", "ανδρασ", "ανδρ", "αρρεν", "ανδρασ (male)") or t.startswith(("ανδρ", "male", "man", "αρρ")):
        return "male"
    if t in ("2", "f", "female", "woman", "γυναικα") or t.startswith(("γυναικ", "female", "woman", "θηλ")):
        return "female"
    return None


def _age_band_label(v):
    t = norm(str(v)).replace(" ", "")
    m = re.match(r"(\d{2})[-–](\d{2})", t)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        bands = {_bands(lo), _bands(hi)}
        return bands.pop() if len(bands) == 1 else None
    m = re.match(r"(\d{2})\+|over(\d{2})|>(\d{2})|ανω(?:των)?(\d{2})", t)
    if m:
        lo = int(next(g for g in m.groups() if g))
        return "65+" if lo >= 65 else None
    return _bands(t) if re.fullmatch(r"\d{2}(\.0)?", t) else None


def read_tables(path):
    """Επιστρέφει λίστα (όνομα_πίνακα, DataFrame, value_labels:dict, var_labels:dict)."""
    import pandas as pd

    ext = os.path.splitext(path)[1].lower()
    out = []
    if ext == ".zip":
        with zipfile.ZipFile(path) as z:
            for info in z.infolist()[:40]:
                if info.is_dir() or info.file_size > 150 * 1024 * 1024 or "__MACOSX" in info.filename:
                    continue
                sub = os.path.splitext(info.filename)[1].lower()
                if sub in (".csv", ".tsv", ".txt", ".xlsx", ".xls", ".ods", ".sav", ".dta", ".tab", ".zsav", ".por"):
                    dest = os.path.join(os.path.dirname(path), "unz", re.sub(r"[^\w.\-]", "_", info.filename)[-120:])
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    if not os.path.exists(dest):
                        with z.open(info) as src, open(dest, "wb") as fh:
                            fh.write(src.read())
                    out += [(f"{os.path.basename(path)}/{n}", d, vl, lab) for n, d, vl, lab in read_tables(dest)]
        return out
    if ext in (".sav", ".zsav", ".por"):
        import pyreadstat

        fn = pyreadstat.read_por if ext == ".por" else pyreadstat.read_sav
        df, meta = fn(path, apply_value_formats=False, row_limit=MAX_ROWS)
        return [(os.path.basename(path), df, meta.variable_value_labels or {}, meta.column_names_to_labels or {})]
    if ext == ".dta":
        import pyreadstat

        df, meta = pyreadstat.read_dta(path, apply_value_formats=False, row_limit=MAX_ROWS)
        return [(os.path.basename(path), df, meta.variable_value_labels or {}, meta.column_names_to_labels or {})]
    if ext in (".xlsx", ".xls", ".ods"):
        sheets = pd.read_excel(path, sheet_name=None, nrows=MAX_ROWS, engine={"xlsx": "openpyxl", "xls": "xlrd", "ods": "odf"}[ext[1:]])
        return [(f"{os.path.basename(path)}#{name}", df, {}, {}) for name, df in list(sheets.items())[:20]]
    if ext in (".csv", ".tsv", ".txt", ".tab"):
        raw = open(path, "rb").read(MAX_ROWS * 2000)
        for enc in ("utf-8-sig", "cp1253", "latin-1"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        sample = text[:20000]
        try:
            sep = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
        except csv.Error:
            sep = "\t" if ext in (".tsv", ".tab") else ","
        df = pd.read_csv(io.StringIO(text), sep=sep, nrows=MAX_ROWS, low_memory=False, on_bad_lines="skip")
        return [(os.path.basename(path), df, {}, {})]
    return out


def analyse_table(df, value_labels, var_labels, min_rows=30):
    """Μεταβλητές + κατανομές από πίνακα ατομικών απαντήσεων. Επιστρέφει None αν δεν μοιάζει με τέτοιον."""
    import pandas as pd

    if df is None or df.shape[0] < min_rows or df.shape[1] < 3:
        return None
    df = df.dropna(how="all")
    if df.shape[0] < min_rows:
        return None
    cols = list(df.columns)
    label = lambda c: str(var_labels.get(c) or c).strip()
    # βάρος
    wcol = next((c for c in cols if WEIGHT.search(norm(str(c))) and pd.api.types.is_numeric_dtype(df[c]) and df[c].notna().mean() > 0.9 and 0.2 < df[c].mean() < 5), None)
    weights = df[wcol].fillna(0).astype(float) if wcol else pd.Series(1.0, index=df.index)
    # φύλο / ηλικία
    gender = None
    for c in cols:
        if GENDER.search(norm(label(c)) + " " + norm(str(c))):
            vl = value_labels.get(c, {})
            g = df[c].map(lambda v: _gender_value(vl.get(v, v)) if v == v else None)
            if g.notna().mean() > 0.6 and g.nunique() == 2:
                gender = g
                break
    age = None
    for c in cols:
        if AGE.search(norm(label(c)) + " " + norm(str(c))):
            vl = value_labels.get(c, {})
            if pd.api.types.is_numeric_dtype(df[c]) and not vl and df[c].dropna().between(10, 100).mean() > 0.9:
                a = df[c].map(_bands)
            else:
                a = df[c].map(lambda v: _age_band_label(vl.get(v, v)) if v == v else None)
            if a.notna().mean() > 0.5 and a.nunique() >= 2:
                age = a
                break
    variables = []
    for c in cols:
        lc = norm(label(c)) + " " + norm(str(c))
        if c == wcol or PII.search(lc):
            continue
        s = df[c]
        vl = value_labels.get(c, {})
        nn = s.dropna()
        if isinstance(nn.dtype, pd.CategoricalDtype):
            nn = nn.astype(str)
        if nn.empty:
            continue
        nun = nn.nunique()
        if not (2 <= nun <= 12):
            continue
        # αποκλεισμός ελεύθερου κειμένου/μεγάλων ετικετών και ID-like
        vals = nn.map(lambda v: str(vl.get(v, v)).strip())
        if vals.map(len).max() > 150:
            continue
        opts = list(vals.value_counts().index)
        def dist(mask):
            sub = vals[mask.reindex(vals.index, fill_value=False)] if mask is not None else vals
            if len(sub) < 10:
                return None
            w = weights.reindex(sub.index).fillna(0)
            tot = w.sum()
            if tot <= 0:
                return None
            return {o: round(100.0 * float(w[sub == o].sum()) / float(tot), 2) for o in opts}, int(len(sub))
        groups = {}
        d = dist(None)
        if not d:
            continue
        groups[("all", "all")] = d
        for dimname, ser in (("gender", gender), ("age_band", age)):
            if ser is None or ser is s:
                continue
            for g in sorted(ser.dropna().unique()):
                dd = dist(ser == g)
                if dd:
                    groups[(dimname, str(g))] = dd
        variables.append({
            "name": str(c), "label": label(c), "question_text": label(c), "options": opts,
            "value_labels": {str(k): str(v) for k, v in vl.items()} if vl else None,
            "n_valid": int(len(nn)), "n_missing": int(len(s) - len(nn)), "groups": groups,
            "role": "gender" if gender is not None and lc and GENDER.search(lc) else "age" if AGE.search(lc) else "question",
        })
    if not variables:
        return None
    return {"rows": int(df.shape[0]), "cols": int(df.shape[1]), "weight_var": str(wcol) if wcol else None,
            "has_gender": gender is not None, "has_age": age is not None, "variables": variables}
