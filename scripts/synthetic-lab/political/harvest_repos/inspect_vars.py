"""Inspect a data file: list variables matching a regex (name+label) and tabulate chosen variables.

Usage: python3 -I inspect_vars.py <file> [--grep REGEX] [--tab VAR[,VAR...]] [--filter VAR=VALUE]
"""

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyse import read_any, read_r  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--grep", default=r"countr|cntry|vote|vot|party|parti|left|right|lr|ideol|turnout|trust|approv|govern|"
                                      r"leader|thermo|ptv|weight|wgt|date|start|end|month|year|wave|ψηφ|κόμμ")
    ap.add_argument("--tab", default="")
    ap.add_argument("--filter", default="")
    ap.add_argument("--obj", default="")
    ap.add_argument("--max", type=int, default=150)
    a = ap.parse_args()
    ext = os.path.splitext(a.file)[1].lower()
    if ext in (".rdata", ".rda", ".rds"):
        objs = dict(read_r(a.file))
        df = objs[a.obj] if a.obj else list(objs.values())[0]
        labels, vlabels = {}, {}
    else:
        df, labels, vlabels = read_any(a.file)
    if a.filter:
        k, v = a.filter.split("=", 1)
        col = df[k]
        try:
            df = df[col == type(col.dropna().iloc[0])(v)]
        except Exception:  # noqa: BLE001
            df = df[col.astype(str) == v]
    print(f"shape={df.shape}")
    rx = re.compile(a.grep, re.I)
    n = 0
    for c in df.columns:
        lab = str(labels.get(c) or "")
        if rx.search(str(c)) or rx.search(lab):
            nn = int(df[c].notna().sum())
            print(f"  {c} | {lab[:110]} | nonmiss={nn}")
            n += 1
            if n >= a.max:
                break
    for v in [x for x in a.tab.split(",") if x]:
        if v not in df.columns:
            print(f"-- {v}: missing")
            continue
        vc = df[v].value_counts(dropna=False).head(40)
        vl = vlabels.get(v, {})
        print(f"-- {v} ({labels.get(v, '')}):")
        for val, cnt in vc.items():
            print(f"     {val!s:>12} {cnt:>7}  {vl.get(val, '')}")


if __name__ == "__main__":
    main()
