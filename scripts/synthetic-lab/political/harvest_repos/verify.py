"""Verify Greek n, political variables, weights and field dates for downloaded datasets; write summary.json["verified"].

Usage: python3 -I verify.py <spec.json> <repos_root> <out_json>
spec: list of {dir, file, [obj], [country_var, greek_values], [filters: {var: [values]}], pol_vars: [..], weight_vars: [..],
               [date_vars: [..]], [wave_var], notes}
"""

import json
import os
import re
import sys
import warnings

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyse import read_any, read_r  # noqa: E402

import pandas as pd  # noqa: E402

DATE_RX = re.compile(r"date|start|end|recorded|timestamp|int_date|datestamp|interview", re.I)


def load(path, obj=None):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".rdata", ".rda", ".rds"):
        objs = dict(read_r(path))
        return (objs[obj] if obj else list(objs.values())[0]), {}, {}
    return read_any(path)


def to_dt(s):
    s = s.dropna()
    if s.empty:
        return None
    if pd.api.types.is_numeric_dtype(s):
        v = s.astype("int64").astype(str)
        if v.str.len().eq(8).all():
            d = pd.to_datetime(v, format="%Y%m%d", errors="coerce")
        else:
            return None
    else:
        d = pd.to_datetime(s.astype(str), errors="coerce", dayfirst=False)
    d = d.dropna()
    if d.empty:
        return None
    return str(d.min().date()), str(d.max().date())


def main():
    spec = json.load(open(sys.argv[1]))
    root = sys.argv[2]
    out = []
    for e in spec:
        path = os.path.join(root, e["dir"], e["file"])
        rec = {"dir": e["dir"], "file": e["file"]}
        try:
            df, labels, vlabels = load(path, e.get("obj"))
        except Exception as ex:  # noqa: BLE001
            rec["error"] = str(ex)[:300]
            out.append(rec)
            print("ERR", e["dir"], ex)
            continue
        rec["rows_total"] = int(len(df))
        sub = df
        if e.get("country_var"):
            cv = df[e["country_var"]]
            gv = e["greek_values"]
            mask = cv.isin(gv) | cv.astype(str).str.strip().isin([str(x) for x in gv])
            sub = df[mask]
            rec["country_var"] = e["country_var"]
            rec["greek_values"] = gv
            rec["n_countries"] = int(cv.nunique())
        for var, vals in (e.get("filters") or {}).items():
            col = sub[var]
            sub = sub[col.isin(vals) | col.astype(str).isin([str(v) for v in vals])]
            rec.setdefault("filters", {})[var] = vals
        rec["n_greece"] = int(len(sub))
        if e.get("wave_var"):
            rec["n_greece_by_wave"] = {str(k): int(v) for k, v in sub[e["wave_var"]].value_counts().items()}
        pv = []
        for v in e.get("pol_vars", []):
            if v in df.columns:
                pv.append({"var": v, "label": str(labels.get(v) or "")[:160], "nonmissing_gr": int(sub[v].notna().sum())})
            else:
                pv.append({"var": v, "missing_in_file": True})
        rec["political_vars"] = pv
        rec["weights"] = [w for w in e.get("weight_vars", []) if w in df.columns]
        dates = {}
        cand = e.get("date_vars") or [c for c in df.columns if DATE_RX.search(str(c))][:6]
        for c in cand:
            if c in sub.columns:
                r = to_dt(sub[c])
                if r:
                    dates[c] = r
        rec["field_dates"] = dates
        rec["notes"] = e.get("notes", "")
        out.append(rec)
        sp = os.path.join(root, e["dir"], "summary.json")
        summ = json.load(open(sp)) if os.path.exists(sp) else {"dir": e["dir"]}
        summ.setdefault("verified", {})
        summ["verified"][e["file"] + (("::" + e["obj"]) if e.get("obj") else "")] = rec
        json.dump(summ, open(sp, "w"), ensure_ascii=False, indent=1, default=str)
        print(f"{e['dir'][:40]:<40} {e['file'][:38]:<38} n_gr={rec['n_greece']:<6} dates={dates} pol_ok={sum(1 for p in pv if not p.get('missing_in_file'))}/{len(pv)} w={rec['weights']}")
    json.dump(out, open(sys.argv[3], "w"), ensure_ascii=False, indent=1, default=str)


if __name__ == "__main__":
    main()
