"""
Επίσημος πληθυσμός Ελλάδας ανά ηλικία×φύλο για κάθε έτος 2012–2025 (Eurostat demo_pjangroup, 1η Ιανουαρίου),
από τα κελιά που ήδη υπάρχουν στο lake (καμία νέα λήψη) → <LAKE>/export/population_by_year.json.
Χρησιμοποιείται από το benchmark για πληθυσμό βαθμονομημένο ΣΤΟ έτος αναφοράς (χωρίς μελλοντικά δεδομένα).
  python -m benchmark.export_population_by_year   (από scripts/synthetic-lab)
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lake import db  # noqa: E402

BAND = [(0, 4, "0-4"), (5, 14, "5-14"), (15, 24, "15-24"), (25, 34, "25-34"), (35, 44, "35-44"), (45, 54, "45-54"), (55, 64, "55-64"), (65, 200, "65+")]
SEX = {"M": "male", "F": "female"}


def band_of(code):
    if code == "Y_LT5":
        return "0-4"
    m = re.fullmatch(r"Y(\d+)-(\d+)", code)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        for a, b, name in BAND:
            if a <= lo and hi <= b:
                return name
        return None
    m = re.fullmatch(r"Y_GE(\d+)", code)
    if m and int(m.group(1)) >= 65:
        return "65+"
    return None


def main():
    con = db.connect()
    years = {}
    rows = con.execute("SELECT dims, time, value FROM agg_cells WHERE study_id='eurostat:demo_pjangroup'").fetchall()
    for r in rows:
        d = json.loads(r["dims"])
        if d.get("unit") not in (None, "NR") or d.get("sex") not in SEX:
            continue
        b = band_of(d.get("age", ""))
        if not b or r["value"] is None:
            continue
        # αποφυγή διπλομέτρησης ανοιχτών ομάδων (Y_GE75 και Y_GE85 κ.λπ.): κρατάμε μόνο κλειστά 5ετή + τη μικρότερη ανοιχτή
        years.setdefault(r["time"], {}).setdefault(d["age"], {})[SEX[d["sex"]]] = r["value"]
    out = {}
    for y, ages in sorted(years.items()):
        opens = sorted((int(a[4:]), a) for a in ages if a.startswith("Y_GE"))
        first_open = opens[0] if opens else None
        tot = {}
        for code, by in ages.items():
            if code.startswith("Y_GE") and (not first_open or code != first_open[1]):
                continue
            if first_open and re.fullmatch(r"Y(\d+)-(\d+)", code) and int(code[1:].split("-")[0]) >= first_open[0]:
                continue
            b = band_of(code)
            for s, v in by.items():
                tot[f"{b}|{s}"] = tot.get(f"{b}|{s}", 0) + v
        if len(tot) == 16:
            out[y] = {k: round(v) for k, v in sorted(tot.items())}
    path = os.path.join(db.LAKE, "export", "population_by_year.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"source": "Eurostat demo_pjangroup (1η Ιανουαρίου), δεδομένα ΕΛΣΤΑΤ", "license": "CC BY 4.0", "years": out}, fh, ensure_ascii=False, indent=1)
    print(f"✓ {len(out)} έτη → {path}")
    for y in list(out)[:1] + list(out)[-1:]:
        t = out[y]
        print(y, sum(t.values()), {k: v for k, v in t.items() if k.startswith(("15-24", "65+"))})


if __name__ == "__main__":
    main()
