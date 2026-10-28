"""
Πραγματικές συσχετίσεις μεταξύ ερωτήσεων από ΜΙΚΡΟΔΕΔΟΜΕΝΑ (διαΝΕΟσις «Τι πιστεύουν οι Έλληνες»).

Για κάθε αρχείο κύματος: δείκτης «πρώτη ουσιαστική επιλογή» ανά ερώτηση (π.χ. «Συμφωνώ»), σταθμισμένος συντελεστής
phi για κάθε ζεύγος ερωτήσεων του ίδιου ερωτηματολογίου. Μόνο ερωτήσεις που υπάρχουν στο ερευνητικό σύνολο του Lab
(ίδιοι κωδικοί/δείκτες) — ώστε να συγκριθούν με τις συνθετικές απαντήσεις του engine.

Έξοδος: <dataRoot>/benchmarks/microdata_assoc.json (ιδιωτικό· μόνο συντελεστές, όχι ατομικά δεδομένα).
  python -m benchmark.microdata_assoc   (από scripts/synthetic-lab)
"""

import itertools
import json
import math
import os
import sys

import pyreadstat

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))
import import_dianeosis as dn  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RAW = os.path.join(REPO, ".synthetic-lab-data", "raw", "dianeosis")
RESEARCH = os.path.join(REPO, ".synthetic-lab-data", "research", "dianeosis-tpe.json")
OUT = os.path.join(REPO, ".synthetic-lab-data", "benchmarks", "microdata_assoc.json")
MAX_VARS = 45


def main():
    research = json.load(open(RESEARCH, encoding="utf-8"))
    # κανονική ερώτηση (τελευταίο κύμα) -> (έτος, μέρος, μεταβλητή)
    canon = {}
    for q in research["questions"]:
        yy, part = q["id"][2:4], q["part"]
        subst = [o for o in q["options"] if o not in q["dkOptions"]]
        if not subst:
            continue
        code = int(q["optionMetrics"][subst[0]].rsplit("__", 1)[1])
        canon[(2000 + int(yy), part, q["variable"])] = {"qid": q["id"], "option": subst[0], "code": code, "metric": q["optionMetrics"][subst[0]]}
    out = []
    for year, part, rel, wvar in dn.WAVES:
        path = os.path.join(RAW, rel)
        qs = {k[2]: v for k, v in canon.items() if k[0] == year and k[1] == part}
        if not os.path.exists(path) or len(qs) < 5:
            continue
        df, meta = pyreadstat.read_sav(path, apply_value_formats=False)
        w = df[wvar].fillna(0).astype(float) if wvar in df.columns else None
        if w is None or w.sum() <= 0:
            w = df.iloc[:, 0] * 0 + 1.0
        vars_ = [v for v in qs if v in df.columns][:MAX_VARS]
        ind = {}
        for v in vars_:
            col = df[v]
            valid = col.notna()
            ind[v] = ((col == qs[v]["code"]).astype(float), valid)
        pairs = []
        for a, b in itertools.combinations(vars_, 2):
            xa, va = ind[a]
            xb, vb = ind[b]
            m = va & vb
            ww = w[m]
            sw = ww.sum()
            if m.sum() < 200 or sw <= 0:
                continue
            pa = float((ww * xa[m]).sum() / sw)
            pb = float((ww * xb[m]).sum() / sw)
            pab = float((ww * (xa[m] * xb[m])).sum() / sw)
            den = math.sqrt(pa * (1 - pa) * pb * (1 - pb))
            if den <= 1e-9:
                continue
            pairs.append({"a": qs[a]["qid"], "b": qs[b]["qid"], "optA": qs[a]["option"], "optB": qs[b]["option"],
                          "phi": round((pab - pa * pb) / den, 4), "n": int(m.sum())})
        out.append({"year": year, "part": part, "file": os.path.basename(path), "questions": [qs[v]["qid"] for v in vars_], "pairs": pairs})
        print(f"  {year}/{part}: {len(vars_)} ερωτήσεις, {len(pairs)} ζεύγη")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"source": "διαΝΕΟσις μικροδεδομένα (research_only) — μόνο συντελεστές συσχέτισης", "files": out}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"✓ {OUT}")


if __name__ == "__main__":
    main()
