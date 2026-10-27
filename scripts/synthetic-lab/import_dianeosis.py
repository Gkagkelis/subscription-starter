"""
diaNEOsis «Τι πιστεύουν οι Έλληνες» (μικροδεδομένα SPSS, όλα τα κύματα) ->
empirical priors για το Synthetic Research Lab. ΜΟΝΟ ΓΙΑ ΕΡΕΥΝΗΤΙΚΗ ΧΡΗΣΗ.

Τα αρχεία δημοσιεύονται από τη διαΝΕΟσις («© Dianeosis. All rights reserved»,
χωρίς άδεια δεδομένων). Χρησιμοποιούνται για μη εμπορική έρευνα με αναφορά
πηγής· για προϊόν απαιτείται γραπτή άδεια. Δεν αναδιανέμονται: η έξοδος
γράφεται στον ιδιωτικό φάκελο .synthetic-lab-data/research/ (gitignored).

Τι κάνει:
  1. Διαβάζει κάθε αρχείο του WAVES (κωδικοποιήσεις διαφέρουν ανά έτος:
     φύλο, ηλικία, μόρφωση, περιφέρεια αναγνωρίζονται από τις ΕΤΙΚΕΤΕΣ τιμών).
  2. Εξαιρεί πολιτικές μεταβλητές (ψήφος, κόμματα, αυτοτοποθέτηση, πρόσωπα).
  3. Επαναστάθμιση (raking) του βάρους της πηγής στα περιθώρια του πληθυσμού
     15+ (ηλικία×φύλο, μόρφωση, περιφέρεια όπου υπάρχει): τα δείγματα
     υπερ-αντιπροσωπεύουν αποφοίτους ανώτατης.
  4. Συνδέει την ίδια ερώτηση μεταξύ κυμάτων (ίδιες ουσιαστικές επιλογές +
     ομοιότητα κειμένου με βάρη IDF) -> ένας δείκτης με πολλά κύματα, ώστε
     να γίνεται backtest σε held-out κύμα.

Χρήση (απαιτεί pyreadstat + pandas):
  npx tsx scripts/synthetic-lab/export-population-margins.ts
  python scripts/synthetic-lab/import_dianeosis.py \\
      --raw .synthetic-lab-data/raw/dianeosis \\
      --margins .synthetic-lab-data/raw/population-margins-15plus.json \\
      --out .synthetic-lab-data/research/dianeosis-tpe.json
"""

import argparse
import json
import math
import os
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone

import pyreadstat

# (έτος, μέρος, σχετική διαδρομή, μεταβλητή βάρους). Έτος = έτος δημοσίευσης της έρευνας.
WAVES = [
    (2017, "1", "2017/unz/Integrated_PartA&B_2557q_GreekBeliefs.sav", "sexage3weightInt"),
    (2018, "1", "2018/unz/TPE_2018/TPE2018_SPSS.sav", "WEIGHT"),
    (2018, "2", "2018/unz/TPE_2018/DIANEOSIS_B_send.sav", "WEIGHT"),
    (2020, "1", "2020/unz/TPE_2020/TPE_2020_MEROS_A.sav", "sta2"),
    (2020, "2", "2020/unz/TPE_2020/TPE_2020_MEROS_B.sav", "sta2"),
    (2022, "1", "2022/unz/SPSS/MEROS_A_SPSS.sav", "sta2"),
    (2022, "2", "2022/unz/MEROS_B_SPSS.sav", "sta2"),
    (2022, "3", "2022/unz/SPSS/SYMPLIROMATIKO_MEROS_SPSS.sav", "sta2"),
    (2024, "1", "2024/unz/data_part1_w.SAV", "x1"),
    (2024, "2", "2024/unz/data_part2_w fix.SAV", "x1"),
    (2024, "3", "2024/unz/data_part3_w.SAV", "x1"),
]


def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("ς", "σ")
    return re.sub(r"\s+", " ", s).strip()


def fix_text(s):
    """Αρχεία με ελληνικά cp1253 που διαβάστηκαν ως latin-1 (π.χ. ΤΠΕ 2018 μέρος Α)."""
    letters = [c for c in (s or "") if c.isalpha()]
    if letters and sum(1 for c in letters if "\u00c0" <= c <= "\u00ff") >= 0.5 * len(letters):
        try:
            return s.encode("latin-1").decode("cp1253")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s


# ---------------- Πολιτικές μεταβλητές (σκόπιμα εκτός) ----------------
POLITICAL_TEXT = re.compile(
    r"κομμα|ψηφ|εκλογ|αυτοτοποθετ|αριστερα.*δεξια|δεξια.*αριστερα|προσωπικοτητ|πολιτικ\w* (ηγετ|αρχηγ|προσωπ)|πρωθυπουργ|"
    r"μητσοτακ|τσιπρ|ανδρουλακ|κουτσουμπ|βελοπουλ|φαμελλ|κασσελακ|βαρουφακ|γεννηματ|μεϊμαρακ|μειμαρακ"
)
PARTY_OPTION = re.compile(r"^(νδ|συριζα|πασοκ|κκε|ανελ|ποταμι|χρυση αυγη|μερα25|ελληνικη λυση|κινημα αλλαγησ|πλευση|νικη|σπαρτιατεσ)\b")


def is_political(label, options):
    t = norm(label)
    if POLITICAL_TEXT.search(t):
        return True
    if any(POLITICAL_TEXT.search(norm(o)) for o in options):
        return True
    # αξιολόγηση προσώπων: «Όνομα Επώνυμο (ΧΩΡΑ)» με θετική/αρνητική γνώμη
    if re.search(r"\([^)]{2,25}\)\s*$", label) and any("θετικ" in norm(o) for o in options) and len(label) < 60:
        return True
    return sum(1 for o in options if PARTY_OPTION.search(norm(o))) >= 2


# ---------------- Δημογραφικά από ετικέτες ----------------
def find_var(meta, cols, pred):
    for v in cols:
        lab = norm(fix_text(meta.column_names_to_labels.get(v) or ""))
        if pred(v, lab):
            return v
    return None


def gender_map(vl):
    out = {}
    for c, l in vl.items():
        n = norm(fix_text(l))
        if n.startswith("ανδρ"):
            out[c] = "male"
        elif n.startswith("γυναικ"):
            out[c] = "female"
    return out if len(out) == 2 else None


def band_of_age(a):
    if a is None or a != a or a < 15 or a > 110:
        return None
    for lo, hi, b in ((15, 24, "15-24"), (25, 34, "25-34"), (35, 44, "35-44"), (45, 54, "45-54"), (55, 64, "55-64")):
        if lo <= a <= hi:
            return b
    return "65+"


def age_band_map(vl):
    """Ζώνες 17-24/25-34/.../65+ (όχι 25-39 κ.λπ., που δεν αντιστοιχίζονται)."""
    out = {}
    for c, l in vl.items():
        n = norm(fix_text(l)).replace(" ", "")
        m = re.match(r"(\d{2})-(\d{2})", n)
        if m:
            lo, hi = int(m.group(1)), int(m.group(2))
            if hi - lo > 9:
                return None
            out[c] = band_of_age(lo if lo >= 17 else 17)
        elif re.match(r"65", n):
            out[c] = "65+"
    return out if len(set(out.values())) == 6 else None


def edu_class(label):
    n = norm(fix_text(label))
    n = re.sub(r"[’'΄`]", " ", n)
    if re.search(r"δα\b|δξ|δγ|αρνηση", n) and not re.search(r"δημοτικ|βαθμ", n):
        return None
    if re.search(r"μεταπτυχ|διδακτορ|\bαει\b|\bτει\b|γ\s*βαθμ|τριτοβαθμ|πανεπιστ|πτυχιο", n):
        return "high_education"
    if re.search(r"γυμνασ|λυκει|β\s*βαθμ|τεχνικ|ιεκ|μεταλυκ|δευτεροβαθμ", n):
        return "medium_education"
    if re.search(r"δημοτικ|α\s*βαθμ|πρωτοβαθμ|αγραμματ", n):
        return "low_education"
    return None


REGION_PATTERNS = [
    ("GRCr105", r"ανατολικη μακεδονια|αν\.? μακεδ"),
    ("GRCr107", r"δυτικη μακεδονια"),
    ("GRCr106", r"κεντρικη μακεδονια"),
    ("GRCr102", r"[βb]ορειο αιγαιο"),
    ("GRCr103", r"νοτιο αιγαιο"),
    ("GRCr104", r"κρητη"),
    ("GRCr108", r"ηπειρο"),
    ("GRCr109", r"θεσσαλια"),
    ("GRCr110", r"ιονι"),
    ("GRCr111", r"δυτικη ελλαδα"),
    ("GRCr112", r"στερεα"),
    ("GRCr113", r"πελοποννησ"),
    ("GRCr101", r"^\(?αττικη"),
]


def region_of_label(label):
    n = norm(fix_text(label)).replace("  ", " ")
    m = re.match(r"\(([^)]*)\)", n)
    if m:
        n = m.group(1)
    for code, pat in REGION_PATTERNS:
        if re.search(pat, n):
            return code
    return None


def region_map(vl):
    out = {c: region_of_label(l) for c, l in vl.items()}
    out = {c: r for c, r in out.items() if r}
    return out if len(set(out.values())) >= 12 else None


def is_demographic(label, vl):
    """Μεταβλητές δημογραφικών/δειγματοληψίας: όχι ερωτήσεις στάσεων."""
    n = norm(label)
    if re.search(r"\bnuts|νομο[ιυσ]?\b|^.{0,12}(ηλικια|φυλο)\b|περιφερεια\b|γεωγραφικ|μορφωτικο επιπεδο|"
                 r"πολεοδομικ|αστικ\w* .{0,3}(ημιαστικ|αγροτικ)|ποσους κατοικους|κατοικειτε", n):
        return True
    if gender_map(vl) or age_band_map(vl) or region_map(vl):
        return True
    labs = [norm(fix_text(x)).replace(" ", "") for x in vl.values()]
    return sum(1 for x in labs if re.match(r"\d{2}-\d{2}", x)) >= 3


def detect_demographics(df, meta):
    cols = list(df.columns)
    vls = meta.variable_value_labels
    labs = {v: norm(fix_text(meta.column_names_to_labels.get(v) or "")) for v in cols}
    d = {}
    # φύλο
    for v in cols:
        if re.search(r"φυλο|gender|^sex", labs[v] + " " + v.lower()) and gender_map(vls.get(v) or {}):
            d["gender"] = (v, gender_map(vls[v]))
            break
    # ηλικία: συνεχής ή ζώνες 10 ετών
    for v in cols:
        lv = labs[v] + " " + v.lower()
        if not re.search(r"ηλικ|age", lv) or re.search(r"συνταξ|παιδ", lv):
            continue
        vl = vls.get(v) or {}
        if not vl and df[v].dtype.kind in "fi" and 30 < df[v].mean() < 70:
            d["age"] = (v, None)
            break
        m = age_band_map(vl) if vl else None
        if m:
            d["age"] = (v, m)
            break
    # μόρφωση
    for v in cols:
        if re.search(r"μορφωτικ|μορφωση|εκπαιδευτικο επιπεδο|^edu$|^d3$", labs[v] + " " + v.lower()):
            vl = vls.get(v) or {}
            m = {c: edu_class(l) for c, l in vl.items()}
            m = {c: e for c, e in m.items() if e}
            if len(set(m.values())) == 3:
                d["education"] = (v, m)
                break
    # περιφέρεια (13 διοικητικές)· ΤΠΕ 2017: συνδυασμός τριών μεταβλητών + Αττική
    for v in cols:
        if re.search(r"περιφερ|periferei|^per$|^perif", labs[v] + " " + v.lower()):
            m = region_map(vls.get(v) or {})
            if m:
                d["region"] = ([v], {v: m})
                break
    if "region" not in d and {"NUTS23VE", "NUTS23CG", "NUTS32AegCret", "region"} <= set(cols):
        maps = {}
        for v in ("NUTS23VE", "NUTS23CG", "NUTS32AegCret"):
            maps[v] = {c: r for c, r in ((c, region_of_label(l)) for c, l in (vls.get(v) or {}).items()) if r}
        maps["region"] = {c: "GRCr101" for c, l in (vls.get("region") or {}).items() if norm(l).startswith("αττικη")}
        if len({r for m in maps.values() for r in m.values()}) >= 12:
            d["region"] = (["NUTS23VE", "NUTS23CG", "NUTS32AegCret", "region"], maps)
    return d


def row_groups(row, demo):
    out = [("all", "all")]
    g = a = None
    if "gender" in demo:
        v, m = demo["gender"]
        g = m.get(row.get(v))
    if "age" in demo:
        v, m = demo["age"]
        a = band_of_age(row.get(v)) if m is None else m.get(row.get(v))
    if a and g:
        out.append(("age_gender", f"{a}|{g}"))
    if "education" in demo:
        v, m = demo["education"]
        e = m.get(row.get(v))
        if e:
            out.append(("education_group", e))
    if "region" in demo:
        vars_, maps = demo["region"]
        for v in vars_:
            r = maps[v].get(row.get(v))
            if r:
                out.append(("region", r))
                break
    return out


def rake(rows, keys, margins, base, max_iter=200, bounds=(0.1, 10.0)):
    """IPF στα περιθώρια· επιστρέφει βάρη (μέσο 1) και διαγνωστικά."""
    w = list(base)
    dev = 1.0
    it = 0
    for it in range(max_iter):
        dev = 0.0
        for dim, target in margins.items():
            idx = [i for i in range(len(rows)) if dim in keys[i]]
            if not idx:
                continue
            tot = sum(w[i] for i in idx)
            cur = Counter()
            for i in idx:
                cur[keys[i][dim]] += w[i]
            for i in idx:
                g = keys[i][dim]
                if g not in target or cur[g] <= 0:
                    continue
                share = cur[g] / tot
                dev = max(dev, abs(share - target[g]))
                w[i] *= target[g] / share
            for i in range(len(w)):
                w[i] = min(max(w[i], bounds[0] * base[i]), bounds[1] * base[i])
        if dev < 1e-4:
            break
    m = sum(w) / len(w)
    w = [x / m for x in w]
    ess = sum(w) ** 2 / sum(x * x for x in w)
    return w, {"iterations": it + 1, "maxDeviation": round(dev, 5), "effectiveN": round(ess, 1), "n": len(rows)}


DK = re.compile(r"δξ|δγ|δα\b|δεν γνωριζ|δεν απαντ|αρνηση")


def is_dk(o):
    return bool(DK.search(norm(o)))


def opt_key(o):
    n = norm(fix_text(o))
    if is_dk(o):
        return "dk"
    n = re.sub(r"^\d+\.?\s*", "", n)
    n = re.sub(r"\(.*?\)", "", n)
    return re.sub(r"[^a-zα-ω0-9 ]", "", n).strip()


def tokens(text):
    n = norm(fix_text(text))
    n = re.sub(r"^[\[\(]?[a-zα-ω]{0,3}\d+[\w.]*[\]\)]?[.)]?\s*", "", n)
    return {t for t in re.findall(r"[a-zα-ω]{3,}", n)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--margins", required=True, help="JSON με περιθώρια πληθυσμού (export-population-margins.ts)")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    with open(args.margins, encoding="utf-8") as fh:
        margins = json.load(fh)["margins"]

    items = []  # ανά (κύμα, ερώτηση)
    excluded = []
    files_meta = []
    for year, part, rel, wvar in WAVES:
        path = os.path.join(args.raw, rel)
        if not os.path.exists(path):
            print(f"  (λείπει {rel} — παραλείπεται)")
            continue
        df, meta = pyreadstat.read_sav(path, apply_value_formats=False)
        demo = detect_demographics(df, meta)
        rows = df.to_dict("records")
        keys = [{dim: g for dim, g in row_groups(r, demo) if dim != "all"} for r in rows]
        base = [float(r.get(wvar)) if wvar in df.columns and r.get(wvar) == r.get(wvar) and r.get(wvar) else 1.0 for r in rows]
        use_margins = {k: v for k, v in margins.items() if any(k in kk for kk in keys)}
        wts, diag = rake(rows, keys, use_margins, base)
        diag.update({"year": year, "part": part, "file": os.path.basename(path), "weightVar": wvar if wvar in df.columns else None,
                     "dimensions": sorted(use_margins)})
        files_meta.append(diag)
        print(f"  {year}/{part}: n={len(rows)} δημογραφικά={sorted(demo)} ESS={diag['effectiveN']} απόκλιση={diag['maxDeviation']}")
        demo_vars = set()
        for k, v in demo.items():
            demo_vars.update(v[0] if isinstance(v[0], list) else [v[0]])
        for var in df.columns:
            if var in demo_vars or var == wvar:
                continue
            label = fix_text((meta.column_names_to_labels.get(var) or "").strip())
            vl = meta.variable_value_labels.get(var) or {}
            # ενότητα δημογραφικών (D1.., Δ1..): εισόδημα, επάγγελμα, τάξη κ.λπ. — όχι ερωτήσεις στάσεων
            if re.match(r"^[DdΔ]\d+[A-Za-z]?$", var) or re.match(r"^\s*[DΔ]\d+[\.\)]", label):
                continue
            if not (2 <= len(vl) <= 12) or not label or is_demographic(label, vl):
                continue
            codes = sorted(vl.keys())
            options = [fix_text(vl[c].strip()) for c in codes]
            if is_political(label, options):
                excluded.append({"year": year, "part": part, "var": var, "label": label[:200], "reason": "πολιτική μεταβλητή"})
                continue
            acc = {}
            for row, kk, w in zip(rows, keys, wts):
                v = row.get(var)
                if v is None or v != v or v not in vl:
                    continue
                for dim, g in [("all", "all")] + list(kk.items()):
                    cell = acc.setdefault((dim, g), {"w": 0.0, "n": 0, "by": Counter()})
                    cell["w"] += w
                    cell["n"] += 1
                    cell["by"][v] += w
            if ("all", "all") not in acc or acc[("all", "all")]["n"] < 100:
                continue
            # οι «0 = δεν επιλέχθηκε» δυαδικές πολλαπλής επιλογής: κρατούνται (2 επιλογές)
            dist = {}
            for c, opt in zip(codes, options):
                groups = {}
                for (dim, g), cell in acc.items():
                    groups.setdefault(dim, {})[g] = {
                        "value": round(100.0 * cell["by"].get(c, 0.0) / cell["w"], 2),
                        "n": cell["n"],
                        "confidence": "high" if cell["n"] >= 200 else "medium" if cell["n"] >= 50 else "low",
                        "sources": 1,
                        "inconsistent": False,
                    }
                dist[opt] = {"code": int(c), "groups": groups}
            items.append({
                "year": year, "part": part, "var": var, "label": label, "options": options,
                "qid": f"dn{str(year)[2:]}_{part}_{var}"[:40], "n": acc[("all", "all")]["n"], "dist": dist,
                "tokens": tokens(label), "optkeys": frozenset(opt_key(o) for o in options if not is_dk(o)),
            })

    # -------- Σύνδεση ερωτήσεων μεταξύ κυμάτων --------
    df_tok = Counter(t for it in items for t in it["tokens"])
    N = len(items)
    idf = {t: math.log((N + 1) / (c + 1)) + 1 for t, c in df_tok.items()}

    def sim(a, b):
        inter = sum(idf[t] for t in a["tokens"] & b["tokens"])
        union = sum(idf[t] for t in a["tokens"] | b["tokens"])
        return inter / union if union else 0.0

    items.sort(key=lambda x: (-x["year"], x["part"], x["var"]))
    by_year = defaultdict(list)
    for it in items:
        by_year[it["year"]].append(it)
    years = sorted(by_year, reverse=True)
    clusters = []  # λίστες items, πρώτο = νεότερο (κανονικό)
    for it in by_year[years[0]]:
        clusters.append([it])
    THRESH = 0.62
    for y in years[1:]:
        cands = []
        for ci, cl in enumerate(clusters):
            head = cl[-1]  # το παλαιότερο ως τώρα μέλος (πλησιέστερο χρονικά)
            if any(m["year"] == y for m in cl):
                continue
            for it in by_year[y]:
                if it["optkeys"] != head["optkeys"] or len(it["optkeys"]) < 1:
                    continue
                s = max(sim(it, m) for m in cl)
                if s >= THRESH:
                    cands.append((s, ci, id(it), it))
        cands.sort(key=lambda x: -x[0])
        used_c, used_i = set(), set()
        for s, ci, iid, it in cands:
            if ci in used_c or iid in used_i:
                continue
            clusters[ci].append(it)
            it["linkScore"] = round(s, 3)
            used_c.add(ci)
            used_i.add(iid)
        for it in by_year[y]:
            if id(it) not in used_i:
                clusters.append([it])

    # -------- Έξοδος --------
    questions, metrics = [], []
    for cl in clusters:
        canon = cl[0]
        canon_opts = canon["options"]
        option_metrics = {}
        for opt in canon_opts:
            code = canon["dist"][opt]["code"]
            mid = f"{canon['qid']}__{code}"
            option_metrics[opt] = mid
            waves = []
            for m in sorted(cl, key=lambda x: x["year"]):
                # αντιστοίχιση επιλογής μέσω κανονικοποιημένης ετικέτας
                match = next((o for o in m["options"] if opt_key(o) == opt_key(opt)), None)
                if match is None:
                    continue
                waves.append({"key": f"{m['year']}-Q1", "year": m["year"], "quarter": "Q1", "groups": m["dist"][match]["groups"],
                              "source": f"{m['year']} μέρος {m['part']} {m['var']}"})
            metrics.append({
                "metric": mid,
                "family": "dianeosis_attitudes",
                "label": f"{canon['label']} — «{opt}»",
                "semanticsNote": "διαΝΕΟσις «Τι πιστεύουν οι Έλληνες» (Metron Analysis/MRB κατά κύμα). Ποσοστό επιλογής, βάρος της πηγής επαναστάθμισμένο (raking) σε ηλικία×φύλο, μόρφωση, περιφέρεια του πληθυσμού 15+· n = πραγματικός αριθμός ερωτώμενων ανά κελί.",
                "waves": waves,
                "scheme": "dianeosis",
                "datasetId": "dianeosis-tpe",
                "question": canon["label"],
            })
        questions.append({
            "id": canon["qid"], "part": canon["part"], "variable": canon["var"], "text": canon["label"],
            "options": canon_opts, "dkOptions": [o for o in canon_opts if is_dk(o)], "optionMetrics": option_metrics,
            "n": canon["n"], "years": sorted({m["year"] for m in cl}),
            "linked": [{"year": m["year"], "part": m["part"], "var": m["var"], "text": m["label"][:160], "score": m.get("linkScore")} for m in cl[1:]],
        })

    out = {
        "datasetId": "dianeosis-tpe",
        "tier": "research_only",
        "source": "διαΝΕΟσις, «Τι πιστεύουν οι Έλληνες» 2017–2024, μικροδεδομένα SPSS — https://www.dianeosis.org/research/ti-pistevoun-oi-ellines/",
        "license": "© Dianeosis — All rights reserved. Χωρίς άδεια δεδομένων: μόνο μη εμπορική ερευνητική χρήση με αναφορά πηγής· για προϊόν απαιτείται γραπτή άδεια.",
        "importedAt": datetime.now(timezone.utc).isoformat(),
        "years": sorted(by_year),
        "files": files_meta,
        "linking": {"method": "ίδιες ουσιαστικές επιλογές + ομοιότητα κειμένου (IDF-Jaccard)", "threshold": THRESH,
                    "linkedQuestions": sum(1 for q in questions if q["linked"])},
        "weighting": {"raked": True, "note": "Περιθώρια πληθυσμού 15+ (2025) για όλα τα κύματα."},
        "questions": questions,
        "metrics": metrics,
        "excludedPolitical": excluded,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    multi = sum(1 for q in questions if len(q["years"]) >= 2)
    print(f"✓ {len(questions)} ερωτήσεις ({multi} σε ≥2 κύματα), {len(metrics)} δείκτες επιλογών, "
          f"{len(excluded)} πολιτικές μεταβλητές εξαιρέθηκαν -> {args.out}")


if __name__ == "__main__":
    main()
