"""Count Greek respondents in a CSV inside a zip (read-only, never extracts/executes).

Usage: python3 -I count_greece.py <zipfile> <column> [<substring-filter>]
Prints the value counts of <column> for values containing the filter (default 'GRC').
If <column> is '?', prints the header of every CSV member instead.
"""
import csv
import io
import sys
import zipfile
from collections import Counter

csv.field_size_limit(10**9)
zpath, col = sys.argv[1], sys.argv[2]
flt = sys.argv[3] if len(sys.argv) > 3 else "GRC"
with zipfile.ZipFile(zpath) as z:
    for m in z.namelist():
        if not m.lower().endswith(".csv"):
            continue
        with z.open(m) as fb:
            f = io.TextIOWrapper(fb, encoding="latin-1", newline="")
            r = csv.reader(f)
            head = next(r)
            if col == "?":
                print(m, len(head), head[:40])
                continue
            if col not in head:
                print(m, "column not found")
                continue
            i = head.index(col)
            c = Counter()
            total = 0
            for row in r:
                total += 1
                v = row[i] if i < len(row) else ""
                if flt in v:
                    c[v] += 1
            print(m, "total rows", total)
            for k, v in sorted(c.items()):
                print("  ", k, v)
