"""
CSES (Comparative Study of Electoral Systems), ελληνικές μετεκλογικές έρευνες -> ερευνητικό σύνολο του Lab.

Πηγή: CSES Integrated Module Dataset (IMD), «free, public dataset» (cses.org), με αναφορά DOI.
Ελληνικές μελέτες: 2009, 2012 (Ιούνιος), 2015 (Ιανουάριος), 2015 (Σεπτέμβριος), 2019 — ELNES/ΑΠΘ.

Έξοδος: <dataRoot>/research/cses-greece.json (ιδιωτικό, gitignored), ίδια μορφή με τη διαΝΕΟσις:
  - cses:vote:<party_key>   ψήφος στις βουλευτικές (λίστα), % επί των έγκυρων ψήφων των ψηφισάντων
  - cses:turnout            δήλωσε ότι ψήφισε
  - cses:lr:<left|centre|right>  αυτοτοποθέτηση 0–10 (0–3 / 4–6 / 7–10), επί όσων απάντησαν
  - cses:dem_satisfied      ικανοποιημένος/η από τη λειτουργία της δημοκρατίας (πολύ + αρκετά)
  - cses:party_close        αισθάνεται κοντά σε κάποιο κόμμα
Ομάδες: all · age_gender (15-24…65+ | male/female) · education_group (low/medium/high) · και, για σύγκριση με τη
NORAYA/Eurobarometer, gender και age_group (18-24 / 25-39 / 40-54 / 55+).
Βάρος: δημογραφικό βάρος της μελέτης (IMD1010_2)· ΟΧΙ το «πολιτικό» βάρος, που ευθυγραμμίζει την ψήφο
με το αποτέλεσμα. n = ερωτώμενοι στο κελί, nEff = Kish.
Κύμα: το τρίμηνο της τελευταίας ημέρας πεδίου (χρονικό όριο), όχι η ημερομηνία των εκλογών.

Χρήση:  python3 -I scripts/synthetic-lab/political/import_cses.py <cses_imd_csv.zip> <out.json>
"""
import csv
import io
import json
import sys
import zipfile
from collections import defaultdict
from datetime import datetime, timezone

PARTY = {
    3000001: "pasok_kinal", 3000008: "pasok_kinal", 3000100: "pasok_kinal",
    3000002: "nd", 3000003: "syriza", 3000004: "kke", 3000006: "xrysi_avgi", 3000007: "anel",
    3000009: "elliniki_lysi", 3000013: "potami", 3000014: "mera25", 3000021: "enosi_kentroon",
    3000023: "plefsi", 3000012: "dimar", 3000019: "laos", 3000024: "lae", 3000011: "dx",
    3000005: "oikologoi", 3000016: "antarsya", 3000101: "antarsya", 3000025: "epam",
}
LABEL = {
    "nd": "ΝΔ", "syriza": "ΣΥΡΙΖΑ", "pasok_kinal": "ΠΑΣΟΚ/ΚΙΝΑΛ (ΔΗΣΥ 2015)", "kke": "ΚΚΕ", "xrysi_avgi": "Χρυσή Αυγή",
    "anel": "ΑΝΕΛ", "elliniki_lysi": "Ελληνική Λύση", "potami": "Ποτάμι", "mera25": "ΜέΡΑ25", "enosi_kentroon": "Ένωση Κεντρώων",
    "plefsi": "Πλεύση Ελευθερίας", "dimar": "ΔΗΜΑΡ", "laos": "ΛΑΟΣ", "lae": "ΛΑΕ", "dx": "Δημιουργία Ξανά", "oikologoi": "Οικολόγοι Πράσινοι",
    "antarsya": "ΑΝΤΑΡΣΥΑ", "epam": "ΕΠΑΜ", "other": "Άλλο κόμμα",
}
STUDIES = {"GRC_2009": "2009-10", "GRC_2012": "2012-06", "GRC12015": "2015-01", "GRC22015": "2015-09", "GRC_2019": "2019-07"}
OTHER_PARTY = {9999989, 9999990, 9999991, 9999992}
MIN_N = 1


def band(age):
    if age is None or age < 15 or age > 110:
        return None
    for lo, hi, b in ((15, 24, "15-24"), (25, 34, "25-34"), (35, 44, "35-44"), (45, 54, "45-54"), (55, 64, "55-64")):
        if lo <= age <= hi:
            return b
    return "65+"


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def groups_of(r):
    out = [("all", "all")]
    a = band(num(r["IMD2001_1"]))
    g = {1: "male", 2: "female"}.get(int(num(r["IMD2002"]) or 0))
    if a and g:
        out.append(("age_gender", f"{a}|{g}"))
    if g:
        out.append(("gender", g))
    age = num(r["IMD2001_1"])
    if age is not None and 18 <= age <= 110:
        out.append(("age_group", "18-24" if age <= 24 else "25-39" if age <= 39 else "40-54" if age <= 54 else "55+"))
    e = {0: "low_education", 1: "low_education", 2: "medium_education", 3: "medium_education", 4: "high_education"}.get(int(num(r["IMD2003"]) if num(r["IMD2003"]) is not None else -1))
    if e:
        out.append(("education_group", e))
    return out


def outcomes(r):
    """{metric: True/False} για όσους δείκτες ορίζονται στον ερωτώμενο (None = εκτός βάσης)."""
    o = {}
    t = num(r["IMD3001"])
    if t in (0, 1):
        o["cses:turnout"] = t == 1
    v = num(r["IMD3002_LH_PL"])
    if v is not None and t == 1:
        v = int(v)
        key = PARTY.get(v) or ("other" if (3000000 <= v < 3001000 or v in OTHER_PARTY) else None)
        if key:
            o[f"__vote__{key}"] = True
    lr = num(r["IMD3006"])
    if lr is not None and 0 <= lr <= 10:
        side = "left" if lr <= 3 else "centre" if lr <= 6 else "right"
        for s in ("left", "centre", "right"):
            o[f"cses:lr:{s}"] = s == side
    ds = num(r["IMD3010"])
    if ds in (1, 2, 4, 5):
        o["cses:dem_satisfied"] = ds in (1, 2)
    pc = num(r["IMD3005_1"])
    if pc in (0, 1):
        o["cses:party_close"] = pc == 1
    return o


def main(src, out_path):
    with zipfile.ZipFile(src) as z:
        name = next(n for n in z.namelist() if n.endswith(".csv"))
        rows = []
        with z.open(name) as fh:
            rd = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8", errors="replace"))
            for r in rd:
                if r.get("IMD1006_UNALPHA3") == "GRC":
                    rows.append(r)
    by_study = defaultdict(list)
    for r in rows:
        by_study[r["IMD1004"]].append(r)

    # acc[metric][wave][dim][group] = [Σw·y, Σw, Σw², n]
    acc = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: [0.0, 0.0, 0.0, 0]))))
    waves_meta, party_keys = {}, defaultdict(set)
    for sid, rs in by_study.items():
        fw = max(int(num(r["IMD1013_Y"])) * 100 + int(num(r["IMD1013_M"])) for r in rs if num(r["IMD1013_Y"]) and num(r["IMD1013_M"]) and num(r["IMD1013_M"]) <= 12)
        y, m = divmod(fw, 100)
        q = f"Q{(m - 1) // 3 + 1}"
        wkey = f"{y}-{q}"
        waves_meta[wkey] = {"study": sid, "election": STUDIES.get(sid, ""), "fieldworkEnd": f"{y}-{m:02d}", "n": len(rs)}
        for r in rs:
            w = num(r["IMD1010_2"]) or 1.0
            gs = groups_of(r)
            o = outcomes(r)
            vote = next((k[8:] for k in o if k.startswith("__vote__")), None)
            if vote:
                party_keys[wkey].add(vote)
            for metric, val in o.items():
                if metric.startswith("__vote__"):
                    continue
                for d, g in gs:
                    a = acc[metric][wkey][d][g]
                    a[0] += w * val; a[1] += w; a[2] += w * w; a[3] += 1
            if vote is not None:
                for d, g in gs:
                    for pk in set(PARTY.values()) | {"other"}:
                        a = acc[f"cses:vote:{pk}"][wkey][d][g]
                        a[0] += w * (pk == vote); a[1] += w; a[2] += w * w; a[3] += 1

    metrics = []
    labels = {
        "cses:turnout": "Ψήφισε στις βουλευτικές εκλογές (δήλωση)",
        "cses:lr:left": "Αυτοτοποθέτηση αριστερά (0–3 στην κλίμακα 0–10)",
        "cses:lr:centre": "Αυτοτοποθέτηση κέντρο (4–6 στην κλίμακα 0–10)",
        "cses:lr:right": "Αυτοτοποθέτηση δεξιά (7–10 στην κλίμακα 0–10)",
        "cses:dem_satisfied": "Ικανοποιημένος/η από τη λειτουργία της δημοκρατίας (πολύ/αρκετά)",
        "cses:party_close": "Αισθάνεται κοντά σε κάποιο κόμμα",
    }
    for metric, waves in sorted(acc.items()):
        pk = metric.split(":")[-1] if metric.startswith("cses:vote:") else None
        out_waves = []
        for wkey in sorted(waves):
            if pk and pk not in party_keys[wkey]:
                continue  # το κόμμα δεν κατέβηκε / κανείς δεν το ψήφισε σε αυτή τη μελέτη
            groups = {}
            for d, gg in waves[wkey].items():
                for g, (sy, sw, sw2, n) in gg.items():
                    if n < MIN_N or sw <= 0:
                        continue
                    groups.setdefault(d, {})[g] = {
                        "value": round(100 * sy / sw, 2), "n": n, "nEff": round(sw * sw / sw2, 1),
                        "confidence": "high" if n >= 300 else "medium" if n >= 100 else "low", "sources": 1, "inconsistent": False,
                    }
            if "all" in groups:
                y, q = wkey.split("-")
                out_waves.append({"key": wkey, "year": int(y), "quarter": q, "groups": groups, "source": json.dumps(waves_meta[wkey], ensure_ascii=False)})
        if not out_waves:
            continue
        label = f"Ψήφος στις βουλευτικές: {LABEL[pk]} (% επί των έγκυρων ψήφων)" if pk else labels[metric]
        metrics.append({
            "metric": metric, "family": "cses_vote" if pk else "cses_attitudes", "label": label,
            "semanticsNote": "CSES/ELNES μετεκλογική έρευνα (ανάκληση ψήφου μετά τις εκλογές). Δημογραφικό βάρος της μελέτης· κύμα = τρίμηνο λήξης πεδίου.",
            "waves": out_waves, "scheme": "dianeosis", "datasetId": "cses-greece", "question": label,
        })

    latest = max(waves_meta)
    vote_opts = [LABEL[k] for k in sorted(party_keys[latest], key=lambda k: list(LABEL).index(k))]
    questions = [{
        "id": "cses_vote_last", "part": "CSES", "variable": "IMD3002_LH_PL",
        "text": "Ποιο κόμμα ψηφίσατε στις τελευταίες βουλευτικές εκλογές;",
        "options": vote_opts, "dkOptions": [],
        "optionMetrics": {LABEL[k]: f"cses:vote:{k}" for k in party_keys[latest]},
        "n": waves_meta[latest]["n"], "years": sorted({int(k[:4]) for k in waves_meta}),
    }]
    out = {
        "datasetId": "cses-greece", "tier": "research_only",
        "source": "CSES Integrated Module Dataset (IMD), ελληνικές μελέτες ELNES 2009–2019 — https://cses.org/data-download/cses-integrated-module-dataset-imd/ (doi:10.7804/cses.imd.2024-02-14)",
        "license": "CSES: δωρεάν δημόσιο σύνολο δεδομένων με υποχρεωτική αναφορά· δεν δηλώνεται ρητά άδεια εμπορικής χρήσης → χρήση ως research_only.",
        "importedAt": datetime.now(timezone.utc).isoformat(),
        "years": sorted({int(k[:4]) for k in waves_meta}),
        "waves": waves_meta,
        "questions": questions,
        "metrics": metrics,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"cses-greece: {len(rows)} ερωτώμενοι, {len(waves_meta)} μελέτες {sorted(waves_meta)}, {len(metrics)} δείκτες -> {out_path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
