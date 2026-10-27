"""
diaNEOsis «Τι πιστεύουν οι Έλληνες» (μικροδεδομένα SPSS) -> empirical priors
για το Synthetic Research Lab. ΜΟΝΟ ΓΙΑ ΕΡΕΥΝΗΤΙΚΗ ΧΡΗΣΗ.

Τα αρχεία δημοσιεύονται από τη διαΝΕΟσις («© Dianeosis. All rights reserved»,
χωρίς άδεια δεδομένων). Χρησιμοποιούνται για μη εμπορική έρευνα με αναφορά
πηγής· για προϊόν απαιτείται γραπτή άδεια. Δεν αναδιανέμονται: η έξοδος
γράφεται στον ιδιωτικό φάκελο .synthetic-lab-data/research/ (gitignored).

Στάθμιση: το βάρος x1 της πηγής διορθώνει ηλικία/φύλο/περιοχή, ΟΧΙ μόρφωση
(το δείγμα 2024 έχει ~53% αποφοίτους ανώτατης). Αν δοθεί --margins, το βάρος
επαναστάθμίζεται (raking, ξεκινώντας από το x1) στα περιθώρια του πληθυσμού
15+ (ηλικία×φύλο, μόρφωση, περιφέρεια), ώστε τα ποσοστά ανά ομάδα να μη
φέρουν τη μεροληψία σύνθεσης του δείγματος.

Χρήση (απαιτεί pyreadstat + pandas):
  npx tsx scripts/synthetic-lab/export-population-margins.ts
  python scripts/synthetic-lab/import_dianeosis.py \
      --raw .synthetic-lab-data/raw/dianeosis/2024/unz \
      --margins .synthetic-lab-data/raw/population-margins-15plus.json \
      --out .synthetic-lab-data/research/dianeosis-tpe-2024.json
"""

import argparse
import glob
import json
import os
import re
from datetime import datetime, timezone

import pyreadstat

# Πολιτικές μεταβλητές: σκόπιμα εκτός (ψήφος, αυτοτοποθέτηση, κόμματα, πολιτικά πρόσωπα).
POLITICAL_LABEL = re.compile(r"κόμμα|ψήφ|εκλογ|αυτοτοποθέτηση|κυβέρνηση .* κόμμα", re.IGNORECASE)
POLITICAL_VARS = {"Q23", "Q27", "Q28", "q25", "q26"}
POLITICAL_PREFIX = ("q13_",)  # αξιολόγηση πολιτικών ηγετών
DEMOGRAPHIC_VARS = {"RecordNo", "D1", "AGE", "age1", "age2", "gender", "AREA", "PERIFEREIA", "nuts1", "URBAN",
                    "D3", "D4", "D5", "D6", "D7", "type", "x1"}

AGE1 = {1: "15-24", 2: "25-34", 3: "35-44", 4: "45-54", 5: "55-64", 6: "65+"}  # 17-24 -> ζώνη 15-24
SEX = {1: "male", 2: "female"}
EDU = {1: "low_education", 2: "medium_education", 5: "medium_education", 3: "high_education", 6: "high_education",
       4: "high_education", 7: "high_education"}
REGION = {1: "GRCr101", 2: "GRCr105", 3: "GRCr106", 4: "GRCr107", 5: "GRCr108", 6: "GRCr109", 7: "GRCr110",
          8: "GRCr111", 9: "GRCr112", 10: "GRCr113", 11: "GRCr102", 12: "GRCr103", 13: "GRCr104"}
DK = re.compile(r"ΔΓ|ΔΑ|Δεν γνωρίζω|Δεν απαντώ", re.IGNORECASE)


def groups_for(row):
    out = [("all", "all")]
    a, s = AGE1.get(row.get("age1")), SEX.get(row.get("gender"))
    if a and s:
        out.append(("age_gender", f"{a}|{s}"))
    e = EDU.get(row.get("D3"))
    if e:
        out.append(("education_group", e))
    r = REGION.get(row.get("PERIFEREIA"))
    if r:
        out.append(("region", r))
    return out


def rake(rows, margins, max_iter=200, bounds=(0.1, 10.0)):
    """IPF στα περιθώρια· επιστρέφει νέα βάρη (κλίμακα: μέσο βάρος 1) και διαγνωστικά."""
    base = [float(r.get("x1") or 1.0) for r in rows]
    w = list(base)
    keys = []
    for r in rows:
        k = {}
        for dim, g in groups_for(r):
            if dim in margins:
                k[dim] = g
        keys.append(k)
    dev = 1.0
    for it in range(max_iter):
        dev = 0.0
        for dim, target in margins.items():
            tot = sum(w[i] for i in range(len(rows)) if dim in keys[i])
            cur = {}
            for i in range(len(rows)):
                g = keys[i].get(dim)
                if g is not None:
                    cur[g] = cur.get(g, 0.0) + w[i]
            for i in range(len(rows)):
                g = keys[i].get(dim)
                if g is None or g not in target or cur.get(g, 0) <= 0:
                    continue
                share = cur[g] / tot
                dev = max(dev, abs(share - target[g]))
                w[i] *= target[g] / share
            # όρια ως προς το αρχικό βάρος (αποφυγή ακραίων βαρών)
            for i in range(len(w)):
                lo, hi = bounds[0] * base[i], bounds[1] * base[i]
                w[i] = min(max(w[i], lo), hi)
        if dev < 1e-4:
            break
    m = sum(w) / len(w)
    w = [x / m for x in w]
    ess = sum(w) ** 2 / sum(x * x for x in w)
    return w, {"iterations": it + 1, "maxDeviation": round(dev, 5), "effectiveN": round(ess, 1), "n": len(rows)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--year", default="2024")
    ap.add_argument("--margins", default=None, help="JSON με περιθώρια πληθυσμού (export-population-margins.ts)")
    args = ap.parse_args()
    margins = None
    if args.margins:
        with open(args.margins, encoding="utf-8") as fh:
            margins = json.load(fh)["margins"]
    raking = {}

    questions = []
    metrics = []
    excluded = []
    files = sorted(glob.glob(os.path.join(args.raw, "data_part*.SAV")))
    if not files:
        raise SystemExit("Δεν βρέθηκαν αρχεία data_part*.SAV")

    for f in files:
        part = re.search(r"part(\d)", os.path.basename(f)).group(1)
        df, meta = pyreadstat.read_sav(f, apply_value_formats=False)
        rows = df.to_dict("records")
        if margins:
            wts, diag = rake(rows, margins)
            for r, x in zip(rows, wts):
                r["_w"] = x
            raking[part] = diag
        else:
            for r in rows:
                r["_w"] = float(r.get("x1") or 1.0)
        for var in df.columns:
            if var in DEMOGRAPHIC_VARS:
                continue
            label = (meta.column_names_to_labels.get(var) or "").strip()
            vl = meta.variable_value_labels.get(var) or {}
            if var in POLITICAL_VARS or var.startswith(POLITICAL_PREFIX) or POLITICAL_LABEL.search(label):
                excluded.append({"part": part, "var": var, "label": label, "reason": "πολιτική μεταβλητή"})
                continue
            if not (2 <= len(vl) <= 12):
                continue  # ελεύθερο κείμενο, αριθμητικές, πολλαπλές απαντήσεις χωρίς labels
            codes = sorted(vl.keys())
            options = [vl[c].strip() for c in codes]
            qid = f"dn{args.year[2:]}_{part}_{var}"
            # σταθμισμένες συχνότητες ανά ομάδα
            acc = {}
            for row in rows:
                v = row.get(var)
                if v is None or v != v or v not in vl:
                    continue
                w = row["_w"]
                for dim, g in groups_for(row):
                    cell = acc.setdefault((dim, g), {"w": 0.0, "n": 0, "by": {}})
                    cell["w"] += w
                    cell["n"] += 1
                    cell["by"][v] = cell["by"].get(v, 0.0) + w
            if ("all", "all") not in acc or acc[("all", "all")]["n"] < 100:
                continue
            option_metrics = {}
            for c, opt in zip(codes, options):
                mid = f"{qid}__{int(c)}"
                option_metrics[opt] = mid
                groups = {}
                for (dim, g), cell in acc.items():
                    groups.setdefault(dim, {})[g] = {
                        "value": round(100.0 * cell["by"].get(c, 0.0) / cell["w"], 2),
                        "n": cell["n"],
                        "confidence": "high" if cell["n"] >= 200 else "medium" if cell["n"] >= 50 else "low",
                        "sources": 1,
                        "inconsistent": False,
                    }
                metrics.append({
                    "metric": mid,
                    "family": "dianeosis_attitudes",
                    "label": f"{label} — «{opt}»",
                    "semanticsNote": f"diaNEOsis «Τι πιστεύουν οι Έλληνες» {args.year}, μέρος {part}, μεταβλητή {var}. " + ("Σταθμισμένο ποσοστό: βάρος x1 επαναστάθμισμένο (raking) σε ηλικία×φύλο, μόρφωση, περιφέρεια του πληθυσμού 15+" if margins else "Σταθμισμένο ποσοστό (βάρος x1)") + "· n = πραγματικός αριθμός ερωτώμενων ανά κελί.",
                    "waves": [{"key": f"{args.year}-Q1", "year": int(args.year), "quarter": "Q1", "groups": groups}],
                    "scheme": "dianeosis",
                    "datasetId": f"dianeosis-tpe-{args.year}",
                    "question": label,
                })
            questions.append({
                "id": qid,
                "part": part,
                "variable": var,
                "text": label,
                "options": options,
                "dkOptions": [o for o in options if DK.search(o)],
                "optionMetrics": option_metrics,
                "n": acc[("all", "all")]["n"],
            })

    out = {
        "datasetId": f"dianeosis-tpe-{args.year}",
        "tier": "research_only",
        "source": f"διαΝΕΟσις, «Τι πιστεύουν οι Έλληνες» {args.year} (Metron Analysis), μικροδεδομένα SPSS — https://www.dianeosis.org/research/ti-pistevoun-oi-ellines/",
        "license": "© Dianeosis — All rights reserved. Χωρίς άδεια δεδομένων: μόνο μη εμπορική ερευνητική χρήση με αναφορά πηγής· για προϊόν απαιτείται γραπτή άδεια.",
        "importedAt": datetime.now(timezone.utc).isoformat(),
        "files": [os.path.basename(f) for f in files],
        "questions": questions,
        "metrics": metrics,
        "excludedPolitical": excluded,
        "weighting": {"raked": bool(margins), "byPart": raking},
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False)
    print(f"✓ {len(questions)} ερωτήσεις, {len(metrics)} δείκτες επιλογών, {len(excluded)} πολιτικές μεταβλητές εξαιρέθηκαν -> {args.out}")


if __name__ == "__main__":
    main()
