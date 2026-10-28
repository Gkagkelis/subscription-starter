"""Open downloaded files of one dataset dir and write summary.json (Greek n, political vars, weights, field dates).

Usage: python3 -I analyse.py <dataset_dir> [<dataset_dir> ...]
Never executes anything from the data; only parses SAV/DTA/CSV/XLSX/RDS-less formats with pandas/pyreadstat.
"""

import io
import json
import os
import re
import sys
import zipfile

import pandas as pd

MAXROWS = 2_000_000
COUNTRY_NAME = re.compile(r"^(country|cntry|ctry|country_?code|countryname|country_name|nation|pays|land|iso2?3?|"
                          r"q_?country|s?country\d?|cntry_?\w*|country_?id|countryid|isocntry|ccode|cty|state|cn|country_iso|"
                          r"cou|ctr|nat|country_?str|countrylabel|cname|cntryname|country_text|countries|stato|pais)$", re.I)
POL = re.compile(r"vote|voted|voting|ψηφ|party|parti|κόμμ|left|right|lr_|_lr|lrscale|l_r|ideolog|turnout|elect|εκλογ|"
                 r"trust|εμπιστ|govern|κυβέρν|approv|populis|prime.?min|mitsotakis|μητσοτάκ|tsipras|τσίπρα|syriza|σύριζα|"
                 r"new democracy|νέα δημοκρατ|pasok|πασοκ|kke|κκε|golden dawn|χρυσή αυγή|referend|δημοψήφ|leader|thermom|"
                 r"ptv|propensity|feeling|polari|democra|δημοκρατ|politic|πολιτικ|euro|bailout|memorand|μνημόν|austerity|"
                 r"satisf|anti.?elite|elite|people|protest|partisan|pid", re.I)
WEIGHT = re.compile(r"weight|^wgt|wgt$|^wt|_wt$|^w\d?$|pondera|^w_|_w$|gewicht|βάρ", re.I)
DATE = re.compile(r"date|start|end|time|recorded|submit|interview|month|year|day|fieldw", re.I)
GREEK_TOKENS = {"gr", "grc", "greece", "el", "ell", "hellas", "ελλάδα", "ελλαδα", "300", "gre", "greek", "gr-el"}


def read_any(path):
    ext = os.path.splitext(path)[1].lower()
    import pyreadstat
    if ext in (".sav", ".zsav"):
        df, m = pyreadstat.read_sav(path, row_limit=MAXROWS, apply_value_formats=False)
        return df, m.column_names_to_labels or {}, m.variable_value_labels or {}
    if ext == ".por":
        df, m = pyreadstat.read_por(path, row_limit=MAXROWS, apply_value_formats=False)
        return df, m.column_names_to_labels or {}, m.variable_value_labels or {}
    if ext == ".dta":
        try:
            df, m = pyreadstat.read_dta(path, row_limit=MAXROWS, apply_value_formats=False)
            return df, m.column_names_to_labels or {}, m.variable_value_labels or {}
        except Exception:  # noqa: BLE001
            r = pd.read_stata(path, convert_categoricals=False, iterator=True)
            lab = r.variable_labels()
            vl = r.value_labels()
            df = r.read()
            return df, lab, {}
    if ext == ".sas7bdat":
        df, m = pyreadstat.read_sas7bdat(path, row_limit=MAXROWS)
        return df, m.column_names_to_labels or {}, {}
    if ext in (".xlsx", ".xls", ".ods"):
        sheets = pd.read_excel(path, sheet_name=None, nrows=MAXROWS)
        name, df = max(sheets.items(), key=lambda kv: kv[1].shape[0] * max(1, kv[1].shape[1]))
        return df, {}, {}
    if ext in (".csv", ".tab", ".tsv", ".txt", ".dat"):
        raw = open(path, "rb").read()
        for enc in ("utf-8-sig", "cp1253", "latin-1"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        first = text[:20000]
        sep = max([",", ";", "\t", "|"], key=lambda s: first.split("\n")[0].count(s))
        df = pd.read_csv(io.StringIO(text), sep=sep, low_memory=False, on_bad_lines="skip", nrows=MAXROWS)
        return df, {}, {}
    raise ValueError("unsupported")


def read_r(path):
    """Parse .RData/.rds with the pure-python `rdata` package (no R code is executed)."""
    import rdata
    parsed = rdata.parser.parse_file(path)
    try:
        conv = rdata.conversion.convert(parsed, default_encoding="utf8")
    except UnicodeDecodeError:
        conv = rdata.conversion.convert(parsed, default_encoding="latin1", force_default_encoding=True)
    out = []
    items = conv.items() if isinstance(conv, dict) else [("object", conv)]
    for k, v in items:
        if isinstance(v, pd.DataFrame):
            out.append((str(k), v))
    return out


def find_country(df, labels, vlabels):
    best = None
    for c in df.columns:
        lab = str(labels.get(c) or "")
        if not (COUNTRY_NAME.match(str(c)) or re.search(r"\bcountry\b|χώρα", lab, re.I)):
            continue
        s = df[c]
        vl = vlabels.get(c, {})
        n_gr = 0
        try:
            if vl:
                gr_codes = [k for k, v in vl.items() if str(v).strip().lower() in GREEK_TOKENS or re.search(r"gree|ελλάδ|hellas", str(v), re.I)]
                n_gr = int(s.isin(gr_codes).sum()) if gr_codes else 0
            if not n_gr:
                sv = s.astype(str).str.strip().str.lower().str.replace(r"\.0$", "", regex=True)
                n_gr = int((sv.isin(GREEK_TOKENS) | sv.str.contains(r"gree|ελλάδ", regex=True)).sum())
        except Exception:  # noqa: BLE001
            continue
        nun = s.nunique(dropna=True)
        cand = (c, n_gr, int(nun))
        if best is None or cand[1] > best[1]:
            best = cand
    return best


def summarise_df(df, labels, vlabels):
    out = {"rows": int(df.shape[0]), "cols": int(df.shape[1])}
    cc = find_country(df, labels, vlabels)
    if cc:
        out["country_var"], out["n_greece_by_country_var"], out["country_var_distinct"] = cc
    pol, wts, dts = [], [], []
    for c in df.columns:
        lab = str(labels.get(c) or "")
        txt = f"{c} {lab}"
        if POL.search(txt):
            pol.append(f"{c}: {lab}"[:140] if lab else str(c)[:140])
        if WEIGHT.search(str(c)) or re.search(r"\bweight", lab, re.I):
            try:
                wts.append({"var": str(c), "label": lab, "mean": round(float(pd.to_numeric(df[c], errors="coerce").mean()), 4)})
            except Exception:  # noqa: BLE001
                wts.append({"var": str(c), "label": lab})
        if DATE.search(str(c)) and len(dts) < 8:
            s = df[c].dropna()
            if len(s):
                try:
                    dts.append({"var": str(c), "min": str(s.min())[:30], "max": str(s.max())[:30]})
                except Exception:  # noqa: BLE001
                    pass
    out["political_vars"] = pol[:120]
    out["n_political_vars"] = len(pol)
    out["weights"] = wts[:10]
    out["date_vars"] = dts
    out["columns_head"] = [str(c) for c in list(df.columns)[:40]]
    return out


def analyse_dir(d):
    res = {"dir": d, "files": []}
    fdir = os.path.join(d, "files")
    paths = []
    for root, _, fs in os.walk(fdir):
        for f in fs:
            paths.append(os.path.join(root, f))
    for p in sorted(paths):
        ext = os.path.splitext(p)[1].lower()
        if ext == ".zip":
            try:
                with zipfile.ZipFile(p) as z:
                    names = [i.filename for i in z.infolist()]
                    res["files"].append({"file": os.path.basename(p), "zip_members": names[:80]})
                    xdir = os.path.join(d, "unzipped", os.path.splitext(os.path.basename(p))[0])
                    for info in z.infolist():
                        if info.is_dir() or "__MACOSX" in info.filename or info.file_size > 400 * 1024 * 1024:
                            continue
                        if os.path.splitext(info.filename)[1].lower() in (".sav", ".dta", ".csv", ".tab", ".xlsx", ".xls", ".por", ".zsav", ".tsv", ".rdata", ".rda", ".rds"):
                            dest = os.path.join(xdir, re.sub(r"[^\w.\-]", "_", info.filename)[-150:])
                            os.makedirs(os.path.dirname(dest), exist_ok=True)
                            if not os.path.exists(dest):
                                with z.open(info) as src, open(dest, "wb") as fh:
                                    fh.write(src.read())
                            paths.append(dest)
            except Exception as e:  # noqa: BLE001
                res["files"].append({"file": os.path.basename(p), "error": str(e)[:200]})
        if p.lower().endswith((".tar.gz", ".tgz", ".tar")):
            import tarfile
            try:
                with tarfile.open(p) as tf:
                    members = tf.getmembers()
                    res["files"].append({"file": os.path.basename(p), "tar_members": [m.name for m in members][:80]})
                    xdir = os.path.join(d, "unzipped", os.path.basename(p).split(".")[0])
                    for m in members:
                        if not m.isfile() or m.size > 400 * 1024 * 1024:
                            continue
                        if os.path.splitext(m.name)[1].lower() in (".sav", ".dta", ".csv", ".tab", ".xlsx", ".rds", ".rdata", ".rda", ".por"):
                            dest = os.path.join(xdir, re.sub(r"[^\w.\-]", "_", m.name)[-150:])
                            os.makedirs(os.path.dirname(dest), exist_ok=True)
                            if not os.path.exists(dest):
                                src = tf.extractfile(m)
                                with open(dest, "wb") as fh:
                                    fh.write(src.read())
                            paths.append(dest)
            except Exception as e:  # noqa: BLE001
                res["files"].append({"file": os.path.basename(p), "error": str(e)[:200]})
    for p in sorted(set(paths)):
        ext = os.path.splitext(p)[1].lower()
        if ext in (".rdata", ".rda", ".rds"):
            try:
                for name, df in read_r(p):
                    s = summarise_df(df, {}, {})
                    s["file"] = os.path.relpath(p, d) + "::" + name
                    res["files"].append(s)
            except Exception as e:  # noqa: BLE001
                res["files"].append({"file": os.path.relpath(p, d), "error": "R read: " + str(e)[:250]})
            continue
        if ext not in (".sav", ".zsav", ".por", ".dta", ".csv", ".tab", ".tsv", ".xlsx", ".xls", ".ods", ".sas7bdat", ".txt", ".dat"):
            continue
        if ext in (".txt",) and os.path.getsize(p) < 50_000:
            continue
        try:
            df, labels, vlabels = read_any(p)
            s = summarise_df(df, labels, vlabels)
            s["file"] = os.path.relpath(p, d)
            res["files"].append(s)
        except Exception as e:  # noqa: BLE001
            res["files"].append({"file": os.path.relpath(p, d), "error": str(e)[:300]})
    # carry metadata
    mp = os.path.join(d, "meta.json")
    if os.path.exists(mp):
        m = json.load(open(mp)).get("meta", {})
        res["title"] = m.get("title")
        res["licence"] = m.get("licence")
        res["meta_time"] = {k: m.get(k) for k in ("timePeriodCovered", "dateOfCollection", "productionDate", "publication_date", "date") if m.get(k)}
        res["meta_sampling"] = {k: m.get(k) for k in ("samplingProcedure", "collectionMode", "universe", "weighting", "kindOfData") if m.get(k)}
    old = os.path.join(d, "summary.json")
    if os.path.exists(old):
        prev = json.load(open(old))
        if "verified" in prev:
            res["verified"] = prev["verified"]  # keep manual verification block
    json.dump(res, open(old, "w"), ensure_ascii=False, indent=1, default=str)
    return res


def main():
    for d in sys.argv[1:]:
        r = analyse_dir(d)
        print(f"== {os.path.basename(d)} | {str(r.get('title'))[:80]}")
        for f in r["files"]:
            if "rows" in f:
                print(f"   {f['file'][:60]:<60} rows={f['rows']} cols={f['cols']} country={f.get('country_var')} gr={f.get('n_greece_by_country_var')} "
                      f"pol={f['n_political_vars']} w={[w['var'] for w in f['weights']]}")
            else:
                print(f"   {f.get('file')} {f.get('error', '')[:150]} {('zip:' + str(len(f.get('zip_members', [])))) if 'zip_members' in f else ''}")


if __name__ == "__main__":
    main()
