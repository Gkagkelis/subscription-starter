"""
Eurostat connector: ανακάλυψη (TOC), λήψη ελληνικών δεδομένων (geo=EL, 2012–2025), αποθήκευση κελιών,
εξαγωγή εμπειρικών δεικτών (ποσοστά) με δημογραφικές διασπάσεις για το simulation engine.

Επίπεδο τεκμηρίωσης: B (λεπτομερή συγκεντρωτικά επίσημα στοιχεία). Άδεια: CC BY 4.0 (Απόφαση 2011/833/ΕΕ).
"""

import gzip
import hashlib
import json
import os
import re

from . import db
from .net import HttpError, get, get_json
from .topics import classify, quality_score

API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
TOC = "https://ec.europa.eu/eurostat/api/dissemination/catalogue/toc/txt?lang=en"
LICENSE = "Eurostat — CC BY 4.0 (Commission Decision 2011/833/EU), επαναχρησιμοποίηση με αναφορά πηγής"
SOURCE_ID = "eurostat"

# Θεματικά προθέματα με δεδομένα από έρευνες ατόμων/νοικοκυριών (ή επίσημες στατιστικές για την κοινωνία)
PREFIXES = [
    "ilc", "hlth", "lfso", "lfsa", "lfsq", "lfst", "lfsi", "trng", "isoc", "educ", "edat", "migr", "cens", "tour", "demo",
    "tus", "hbs", "gbv", "icw", "yth", "cult", "sdg", "crim", "earn", "sprt", "spr", "nrg_d_hh", "env_ac_", "prc_hicp_a",
    "tran_hv", "urb", "met", "lfse", "edu", "iss", "ef_lf",
]
MAX_CELLS = 400_000

AGE_TO_BAND = {
    "Y15-24": "15-24", "Y16-24": "15-24", "Y18-24": "15-24", "Y15-19": "15-24", "Y20-24": "15-24",
    "Y25-34": "25-34", "Y25-29": "25-34", "Y30-34": "25-34",
    "Y35-44": "35-44", "Y35-39": "35-44", "Y40-44": "35-44",
    "Y45-54": "45-54", "Y45-49": "45-54", "Y50-54": "45-54",
    "Y55-64": "55-64", "Y55-59": "55-64", "Y60-64": "55-64",
    "Y_GE65": "65+", "Y65-74": "65+", "Y65-69": "65+", "Y70-74": "65+", "Y_GE75": "65+",
}
# Ζώνες που καλύπτουν ΟΛΟΚΛΗΡΗ τη ζώνη GLOPOP (αλλιώς δεν χρησιμοποιούνται ως ομάδα)
FULL_BAND = {"Y15-24": "15-24", "Y16-24": "15-24", "Y25-34": "25-34", "Y35-44": "35-44", "Y45-54": "45-54", "Y55-64": "55-64", "Y_GE65": "65+", "Y65-74": "65+"}
AGE_TOTALS = ["TOTAL", "Y_GE16", "Y_GE15", "Y16-74", "Y15-74", "Y_GE18", "Y18-74", "Y16-64", "Y15-64", "Y_GE0", "Y20-64", "Y25-64"]
ISCED = {"ED0-2": "low_education", "ED3_4": "medium_education", "ED5-8": "high_education"}
QUANT = {"QU1": "1", "QU2": "2", "QU3": "3", "QU4": "4", "QU5": "5", "QUINTILE1": "1", "QUINTILE2": "2", "QUINTILE3": "3", "QUINTILE4": "4", "QUINTILE5": "5"}
IND_TYPE_AGE = {"Y16_24": "15-24", "Y25_34": "25-34", "Y35_44": "35-44", "Y45_54": "45-54", "Y55_64": "55-64", "Y65_74": "65+"}
IND_TYPE_EDU = {"I0_2": "low_education", "I3_4": "medium_education", "I5_8": "high_education", "IND_ILO_LOW": "low_education"}
SKIP_DIMS = {"geo", "time", "freq"}


def discover(con, limit=None):
    """Από τον TOC: datasets με θεματικό πρόθεμα και δεδομένα μετά το 2012 → studies (DISCOVERED) + ουρά."""
    txt = get(TOC, timeout=120)
    lines = txt.splitlines()[1:]
    n = 0
    for line in lines:
        cols = [c.strip().strip('"') for c in line.split("\t")]
        if len(cols) < 7 or cols[2] != "dataset":
            continue
        title, code, _, last_upd, _, start, end = cols[:7]
        if not any(code.startswith(p) for p in PREFIXES):
            continue
        try:
            end_year = int(re.match(r"(\d{4})", end).group(1)) if end else None
        except AttributeError:
            end_year = None
        if end_year is not None and end_year < 2012:
            continue
        sid = f"eurostat:{code}"
        db.upsert_study(
            con, study_id=sid, source_id=SOURCE_ID, external_id=code, title=title.strip(), publisher="Eurostat (δεδομένα ΕΛΣΤΑΤ για την Ελλάδα)",
            url=f"https://ec.europa.eu/eurostat/databrowser/view/{code}/default/table", license=LICENSE, license_open=1,
            evidence_level="B", topics=classify(title, code), dedup_key=f"eurostat|{code}",
            access_restrictions="Ανοιχτά", raw_meta={"last_update": last_upd, "data_start": start, "data_end": end},
            representativeness="official_statistics",
        )
        db.enqueue(con, f"eurostat:{code}", "eurostat_fetch", {"code": code, "title": title.strip()})
        n += 1
        if limit and n >= limit:
            break
    db.log(con, "discover", f"Eurostat: {n} datasets στην ουρά", source_id=SOURCE_ID)
    con.commit()
    return n


def _rows(js):
    dims = js["id"]
    cats, labels = [], []
    for d in dims:
        idx = js["dimension"][d]["category"]["index"]
        arr = [None] * len(idx)
        for code, i in idx.items():
            arr[i] = code
        cats.append(arr)
        labels.append(js["dimension"][d]["category"].get("label", {}))
    sizes = js["size"]
    strides = [1] * len(dims)
    for k in range(len(dims) - 2, -1, -1):
        strides[k] = strides[k + 1] * sizes[k + 1]
    vals = js.get("value", {})
    status = js.get("status", {}) or {}
    items = vals.items() if isinstance(vals, dict) else ((str(i), v) for i, v in enumerate(vals) if v is not None)
    for flat, v in items:
        flat = int(flat)
        rem = flat
        row = {}
        for k, d in enumerate(dims):
            pos = rem // strides[k]
            rem -= pos * strides[k]
            row[d] = cats[k][pos]
        yield row, v, status.get(str(flat), "")


def fetch(con, code, title):
    sid = f"eurostat:{code}"
    try:
        js = get_json(f"{API}/{code}", params={"geo": "EL", "sinceTimePeriod": "2012", "lang": "EN"}, timeout=180)
    except HttpError as e:
        if e.status in (400, 404):
            db.set_status(con, sid, "VERIFIED", "Χωρίς ελληνικά δεδομένα 2012–2025 (ή μη διαθέσιμο με geo=EL)")
            con.execute("UPDATE studies SET country=NULL WHERE study_id=?", (sid,))
            return "no_data"
        if e.status != 413:
            raise
        js = _fetch_by_year(code)
        if js is None:
            db.set_status(con, sid, "FAILED", "Πολύ μεγάλο αίτημα (413) ακόμη και ανά έτος — χρειάζεται φιλτράρισμα διαστάσεων")
            return "too_large"
    if "value" not in js or not js.get("value"):
        db.set_status(con, sid, "VERIFIED", "Χωρίς τιμές για την Ελλάδα 2012–2025")
        con.execute("UPDATE studies SET country=NULL WHERE study_id=?", (sid,))
        return "no_data"
    raw = json.dumps(js, ensure_ascii=False).encode("utf-8")
    path = os.path.join(db.LAKE, "raw", "eurostat", f"{code}.json.gz")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with gzip.open(path, "wb") as fh:
        fh.write(raw)
    sha = hashlib.sha256(raw).hexdigest()
    con.execute(
        "INSERT OR REPLACE INTO files VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (f"{sid}:data", sid, f"{API}/{code}?geo=EL&sinceTimePeriod=2012", f"{code}.json.gz", path, sha, len(raw), "JSON-stat 2.0",
         "data", "downloaded", None, db.now(), js.get("updated")),
    )
    db.set_status(con, sid, "DOWNLOADED")
    # κελιά
    dims = [d for d in js["id"] if d not in SKIP_DIMS]
    con.execute("DELETE FROM agg_cells WHERE study_id=?", (sid,))
    batch, years, ncell = [], set(), 0
    for row, v, flag in _rows(js):
        if row.get("geo") not in (None, "EL"):
            continue
        key = json.dumps({d: row[d] for d in dims}, ensure_ascii=False, sort_keys=True)
        t = row.get("time", "")
        m = re.match(r"(\d{4})", t or "")
        if m:
            years.add(int(m.group(1)))
        batch.append((sid, key, t, v, flag))
        ncell += 1
        if ncell > MAX_CELLS:
            break
        if len(batch) >= 5000:
            con.executemany("INSERT OR REPLACE INTO agg_cells VALUES (?,?,?,?,?)", batch)
            batch = []
    if batch:
        con.executemany("INSERT OR REPLACE INTO agg_cells VALUES (?,?,?,?,?)", batch)
    years = sorted(y for y in years if 2012 <= y <= 2025)
    dim_labels = {d: js["dimension"][d].get("label", d) for d in dims}
    demo = [d for d in dims if d in ("sex", "age", "isced11", "quantile", "quant_inc", "ind_type", "deg_urb")]
    db.upsert_study(
        con, study_id=sid, country="EL" if years else None, collection_year_start=years[0] if years else None,
        collection_year_end=years[-1] if years else None, sex_categories=sorted({r for r in _codes(js, "sex")}) or None,
        age_groups=sorted(_codes(js, "age"))[:60] or None, geographic_coverage="Ελλάδα (εθνικό επίπεδο)",
        target_population=_universe(title), sampling_method="Επίσημη στατιστική (έρευνα ή διοικητικά στοιχεία, βλ. μεταδεδομένα Eurostat)",
        quality_score=quality_score("B", representative="official_statistics", years_old=(2025 - years[-1]) if years else None),
        raw_meta={"dimensions": dim_labels, "demographic_dims": demo, "updated": js.get("updated"), "cells": ncell},
    )
    db.set_status(con, sid, "PARSED")
    if not years:
        db.set_status(con, sid, "VERIFIED", "Δεδομένα μόνο εκτός 2012–2025")
        return "out_of_range"
    nmet = derive_metrics(con, sid, code, title, js, dims)
    db.set_status(con, sid, "VALIDATED", f"{ncell} κελιά, {nmet} δείκτες ποσοστού")
    return "ok"


def _fetch_by_year(code):
    """Για αιτήματα >limit: λήψη ανά έτος 2012–2025 και συγχώνευση σε ένα JSON-stat (ίδια δομή διαστάσεων)."""
    parts = []
    for y in range(2012, 2026):
        try:
            parts.append(get_json(f"{API}/{code}", params={"geo": "EL", "time": str(y), "lang": "EN"}, timeout=180))
        except HttpError as e:
            if e.status in (400, 404):
                continue
            if e.status == 413:
                return None
            raise
    parts = [p for p in parts if p.get("value")]
    if not parts:
        return None
    base = json.loads(json.dumps(parts[0]))
    # ενοποίηση κατηγοριών όλων των διαστάσεων και επανατοποθέτηση τιμών
    dims = base["id"]
    cats = {d: {} for d in dims}
    labs = {d: {} for d in dims}
    for p in parts:
        for d in dims:
            for c in sorted(p["dimension"][d]["category"]["index"], key=lambda c: p["dimension"][d]["category"]["index"][c]):
                if c not in cats[d]:
                    cats[d][c] = len(cats[d])
                    labs[d][c] = p["dimension"][d]["category"].get("label", {}).get(c, c)
    sizes = [len(cats[d]) for d in dims]
    strides = [1] * len(dims)
    for k in range(len(dims) - 2, -1, -1):
        strides[k] = strides[k + 1] * sizes[k + 1]
    values, status = {}, {}
    for p in parts:
        for row, v, flag in _rows(p):
            flat = sum(cats[d][row[d]] * strides[k] for k, d in enumerate(dims))
            values[str(flat)] = v
            if flag:
                status[str(flat)] = flag
    for d in dims:
        base["dimension"][d]["category"]["index"] = cats[d]
        base["dimension"][d]["category"]["label"] = labs[d]
    base["size"], base["value"], base["status"] = sizes, values, status
    return base


def _codes(js, d):
    if d not in js["dimension"]:
        return set()
    return set(js["dimension"][d]["category"]["index"].keys())


def _universe(title):
    t = title.lower()
    if "household" in t:
        return "Νοικοκυριά / άτομα σε νοικοκυριά, Ελλάδα"
    if "enterprise" in t:
        return "Επιχειρήσεις, Ελλάδα"
    return "Πληθυσμός Ελλάδας (βλ. ορισμό dataset)"


def _is_percent(unit_code, unit_label):
    u = (unit_code or "").upper()
    return u.startswith("PC") or "PERCENT" in (unit_label or "").upper()


def derive_metrics(con, sid, code, title, js, dims):
    """Δείκτες ποσοστού ανά συνδυασμό μη δημογραφικών διαστάσεων, με ομάδες ηλικίας/φύλου/μόρφωσης/εισοδήματος."""
    con.execute("DELETE FROM distributions WHERE study_id=?", (sid,))
    con.execute("DELETE FROM variables WHERE study_id=?", (sid,))
    labels = {d: js["dimension"][d]["category"].get("label", {}) for d in dims}
    unit_dim = "unit" if "unit" in dims else None
    demo_dims = [d for d in dims if d in ("sex", "age", "isced11", "quantile", "quant_inc", "ind_type")]
    other = [d for d in dims if d not in demo_dims]
    totals = {}
    if "sex" in dims:
        totals["sex"] = "T" if "T" in labels["sex"] else None
    if "age" in dims:
        totals["age"] = next((a for a in AGE_TOTALS if a in labels["age"]), None)
    for d in ("isced11",):
        if d in dims:
            totals[d] = "TOTAL" if "TOTAL" in labels[d] else None
    for d in ("quantile", "quant_inc"):
        if d in dims:
            totals[d] = "TOTAL" if "TOTAL" in labels[d] else None
    if "ind_type" in dims:
        totals["ind_type"] = "IND_TOTAL" if "IND_TOTAL" in labels["ind_type"] else None
    if any(v is None for v in totals.values()):
        # χωρίς κατηγορία «σύνολο» δεν ορίζεται συνολική τιμή → μόνο κελιά, όχι δείκτες
        return 0
    percent_mode = bool(unit_dim and any(_is_percent(c, l) for c, l in labels["unit"].items()))
    share_dim = None
    if not percent_mode:
        # Αριθμοί (π.χ. απογραφή, ΕΕΔ σε χιλιάδες): μερίδιο κάθε κατηγορίας μιας διάστασης μέσα σε κάθε ομάδα
        cand = [d for d in other if d != "unit" and "TOTAL" in labels[d] and len(labels[d]) > 2]
        multi = [d for d in other if d != "unit" and d not in cand and len(labels[d]) > 1]
        if len(cand) == 1 and not multi:
            share_dim = cand[0]
            units = list(labels["unit"].keys()) if unit_dim else [None]
            share_unit = next((u for u in ("NR", "THS_PER", "THS", "PER") if u in units), units[0])
        else:
            return 0
    series = {}  # key -> {year -> {(dim, group): value}}
    flags = {}
    counts = {}
    for row, v, flag in _rows(js):
        if row.get("geo") not in (None, "EL"):
            continue
        if share_dim:
            if unit_dim and row.get("unit") != share_unit:
                continue
            m = re.match(r"(\d{4})", row.get("time") or "")
            if not m or not (2012 <= int(m.group(1)) <= 2025) or v is None:
                continue
            grp = _group(row, demo_dims, totals)
            if grp is not None:
                counts.setdefault((row[share_dim], int(m.group(1)), grp), v)
            continue
        if unit_dim and not _is_percent(row.get("unit"), labels["unit"].get(row.get("unit"), "")):
            continue
        m = re.match(r"(\d{4})", row.get("time") or "")
        if not m or not (2012 <= int(m.group(1)) <= 2025) or v is None:
            continue
        year = int(m.group(1))
        grp = _group(row, demo_dims, totals)
        if grp is None:
            continue
        key = tuple(row[d] for d in other)
        cell = series.setdefault(key, {}).setdefault(year, {})
        if grp in cell:
            continue  # π.χ. 2 ζώνες ηλικίας → ίδια ζώνη GLOPOP: κρατείται η πρώτη πλήρης
        cell[grp] = v
        flags[(key, year, grp)] = flag
    if share_dim:
        other = [share_dim]
        for (cat, year, grp), v in counts.items():
            if cat == "TOTAL":
                continue
            tot = counts.get(("TOTAL", year, grp))
            if tot and tot > 0:
                series.setdefault((cat,), {}).setdefault(year, {})[grp] = 100.0 * v / tot
    elif not unit_dim and not re.search(r"percent|%|share of", title, re.I):
        return 0
    n = 0
    rows = []
    for key, by_year in series.items():
        if not any(("all", "all") in g for g in by_year.values()):
            continue
        if any(not (0 <= v <= 100) for g in by_year.values() for v in g.values()):
            continue
        klabel = "; ".join(f"{labels[d].get(c, c)}" for d, c in zip(other, key) if d != "unit")
        kid = hashlib.sha1(json.dumps(key).encode()).hexdigest()[:10]
        var_id = f"{sid}:{kid}"
        breakdowns = sorted({g[0] for gs in by_year.values() for g in gs if g[0] != "all"})
        rows.append((var_id, sid, f"{sid}:data", kid, f"{title} — {klabel}" if klabel else title, klabel or title,
                     json.dumps(dict(zip(other, key)), ensure_ascii=False), json.dumps(breakdowns), None, None, "share_of_counts" if share_dim else "percent", "indicator",
                     json.dumps(classify(title, klabel, code))))
        for year, gs in by_year.items():
            for (gd, gv), v in gs.items():
                con.execute(
                    "INSERT INTO distributions (study_id, var_id, wave_year, group_dim, group_value, option_code, option_label, value, unit, n, weighted, flag, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (sid, var_id, year, gd, gv, "pct", "ποσοστό", v, "percent", None, 1, flags.get((key, year, (gd, gv)), ""), None),
                )
        n += 1
    con.executemany("INSERT OR REPLACE INTO variables VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    return n


def _group(row, demo_dims, totals):
    """Επιστρέφει (dim, group) αν το κελί είναι «σύνολο» ή διάσπαση ΜΙΑΣ δημογραφικής διάστασης."""
    off = [d for d in demo_dims if row[d] != totals.get(d)]
    if not off:
        return ("all", "all")
    if len(off) > 1:
        return None
    d = off[0]
    c = row[d]
    if d == "sex":
        return ("gender", "male") if c == "M" else ("gender", "female") if c == "F" else None
    if d == "age":
        b = FULL_BAND.get(c)
        return ("age_band", b) if b else None
    if d == "isced11":
        g = ISCED.get(c)
        return ("education_group", g) if g else None
    if d in ("quantile", "quant_inc"):
        g = QUANT.get(c)
        return ("income_quintile", g) if g else None
    if d == "ind_type":
        if c in IND_TYPE_AGE:
            return ("age_band", IND_TYPE_AGE[c])
        if c in IND_TYPE_EDU:
            return ("education_group", IND_TYPE_EDU[c])
        if c == "M_Y16_74":
            return ("gender", "male")
        if c == "F_Y16_74":
            return ("gender", "female")
    return None


def run(con, max_tasks=None, log_every=25):
    done = 0
    while True:
        tasks = db.next_tasks(con, "eurostat_fetch", limit=50)
        if not tasks:
            break
        for t in tasks:
            p = json.loads(t["payload"])
            try:
                res = fetch(con, p["code"], p["title"])
                db.task_done(con, t["task_id"], "done", None if res == "ok" else res)
                db.log(con, "fetch", f"{p['code']}: {res}", ok=res in ("ok", "no_data", "out_of_range"), source_id=SOURCE_ID, study_id=f"eurostat:{p['code']}")
            except Exception as e:  # δίκτυο κ.λπ. → retry με backoff
                db.task_done(con, t["task_id"], "retry", repr(e))
                db.set_status(con, f"eurostat:{p['code']}", "FAILED", f"Αποτυχία λήψης: {repr(e)[:300]}")
                db.log(con, "fetch", f"{p['code']}: {e!r}", ok=False, source_id=SOURCE_ID)
            con.commit()
            done += 1
            if done % log_every == 0:
                print(f"  eurostat: {done} εργασίες", flush=True)
            if max_tasks and done >= max_tasks:
                return done
    return done
