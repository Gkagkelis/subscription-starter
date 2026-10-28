"""
World Bank — Global Findex (source 28): έρευνα Gallup World Poll για χρηματοοικονομική συμπεριφορά (λογαριασμοί, πληρωμές,
αποταμίευση, δανεισμός, ψηφιακές πληρωμές). Ελλάδα: κύματα 2011, 2014, 2017, 2021, 2024 (~1000 συνεντεύξεις/κύμα).
Άδεια: CC BY 4.0 (World Bank Open Data). Επίπεδο B (σταθμισμένα ποσοστά με διασπάσεις φύλου/ηλικίας/μόρφωσης/εισοδήματος).
"""

import json
import re

from . import db, net
from .topics import classify, dedup_key, quality_score

SRC = "worldbank"
API = "https://api.worldbank.org/v2"
LICENSE = "CC BY 4.0 (World Bank Open Data Terms of Use)"

GROUPS = [
    (r", (?:female|women)$", ("gender", "female")), (r", (?:male|men)$", ("gender", "male")),
    (r", young(?: adults)?$", ("age_findex", "15-24")), (r", older(?: adults)?$", ("age_findex", "25+")),
    (r", primary education or less$", ("education_findex", "primary_or_less")),
    (r", secondary education or more$", ("education_findex", "secondary_or_more")),
    (r",(?: income,)? poorest 40%$", ("income_findex", "poorest_40")), (r",(?: income,)? richest 60%$", ("income_findex", "richest_60")),
    (r", in labou?r ?force$", ("labor_force", "in")), (r", out of labou?r ?force$", ("labor_force", "out")),
    (r", rural$", ("urbanisation", "rural")), (r", urban$", ("urbanisation", "urban")),
]


def _split(name):
    base = re.sub(r"\s*\(%[^)]*\)\s*$", "", re.sub(r"\s+", " ", name)).strip()
    pop = (re.search(r"\((%[^)]*)\)\s*$", name) or [None, None])[1]
    for rx, g in GROUPS:
        if re.search(rx, base, re.I):
            return re.sub(rx, "", base, flags=re.I).strip(), g, pop
    return base, ("all", "all"), pop


def discover(con, limit=None):
    sid = f"{SRC}:findex"
    db.upsert_study(
        con, study_id=sid, source_id=SRC, external_id="source-28", title="Global Findex Database — Ελλάδα (World Bank / Gallup World Poll)",
        publisher="World Bank (Development Research Group) — συλλογή Gallup", country="EL", url="https://www.worldbank.org/en/publication/globalfindex",
        license=LICENSE, license_open=1, access_restrictions="Δημόσια λήψη (API World Bank)", evidence_level="B",
        target_population="Ενήλικες 15+ (μη ιδρυματικός πληθυσμός)", sampling_method="Εθνικά αντιπροσωπευτικό τυχαίο δείγμα (Gallup World Poll), ~1000/κύμα",
        representativeness="national_probability", topics=["banking", "household_finance", "technology"], dedup_key=dedup_key("global findex greece", None),
        description="Δείκτες χρηματοοικονομικής ένταξης/συμπεριφοράς (λογαριασμοί, ψηφιακές πληρωμές, αποταμίευση, δανεισμός, οικονομική ανθεκτικότητα).",
    )
    db.enqueue(con, sid, "wb_fetch", {"source": 28})
    con.commit()
    return 1


def run(con, max_tasks=None):
    tasks = db.next_tasks(con, "wb_fetch", 5)
    for t in tasks:
        sid = t["task_id"]
        try:
            n = fetch_findex(con, sid)
            db.task_done(con, sid)
            db.log(con, "fetch", f"Findex: {n} μεταβλητές", source_id=SRC, study_id=sid)
        except Exception as e:  # noqa: BLE001
            db.task_done(con, sid, "retry", repr(e))
            db.log(con, "fetch", repr(e), ok=False, source_id=SRC, study_id=sid)
        con.commit()
    return len(tasks)


def fetch_findex(con, sid):
    inds, page = [], 1
    while True:
        d = net.get_json(f"{API}/source/28/indicators", {"format": "json", "per_page": 1000, "page": page})
        inds += d[1] or []
        if page >= d[0]["pages"]:
            break
        page += 1
    names = {i["id"]: i["name"] for i in inds}
    notes = {i["id"]: i.get("sourceNote") for i in inds}
    obs = []
    ids = list(names)
    for k in range(0, len(ids), 50):
        chunk = ids[k:k + 50]
        d = net.get_json(f"{API}/country/GRC/indicator/{';'.join(chunk)}", {"source": 28, "format": "json", "per_page": 5000, "date": "2011:2026"})
        if len(d) < 2 or not d[1]:
            continue
        obs += [r for r in d[1] if r.get("value") is not None]
    con.execute("DELETE FROM distributions WHERE study_id=?", (sid,))
    con.execute("DELETE FROM variables WHERE study_id=?", (sid,))
    fam = {}
    for r in obs:
        iid = r["indicator"]["id"]
        base, (gd, gv), pop = _split(names.get(iid) or r["indicator"]["value"])
        fam.setdefault(base, {"pop": pop, "ids": set(), "note": notes.get(iid)})["ids"].add(iid)
        fam[base].setdefault("rows", []).append((int(r["date"]), gd, gv, float(r["value"])))
    years = set()
    for base, f in fam.items():
        vid = f"{sid}::{re.sub(r'[^A-Za-z0-9]+', '_', base)[:80]}"
        con.execute("INSERT OR REPLACE INTO variables VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (vid, sid, None, sorted(f["ids"])[0], base, (f["note"] or base)[:2000], json.dumps(["Ναι", "Όχι"], ensure_ascii=False), None,
                     None, None, "percent_yes", "indicator", json.dumps(classify(base, f["note"] or ""))))
        for y, gd, gv, v in f["rows"]:
            years.add(y)
            v = max(0.0, min(100.0, v))
            for lab, val in (("Ναι", round(v, 2)), ("Όχι", round(100 - v, 2))):
                con.execute("INSERT INTO distributions (study_id,var_id,wave_year,group_dim,group_value,option_code,option_label,value,unit,n,weighted,flag,note) "
                            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (sid, vid, y, gd, gv, "yes" if lab == "Ναι" else "no", lab, val, "percent", None, 1, None, f["pop"]))
    ys = sorted(years)
    db.upsert_study(con, study_id=sid, collection_year_start=ys[0] if ys else None, collection_year_end=ys[-1] if ys else None,
                    fieldwork_dates=", ".join(map(str, ys)), sample_size=1000, sex_categories=["male", "female"], age_groups=["15-24", "25+"],
                    weight_vars=["Σταθμισμένα ποσοστά (Gallup)"], quality_score=quality_score("B", 1000, "national_probability", True, True, (2026 - ys[-1]) if ys else None),
                    status="VALIDATED", status_reason=f"{len(fam)} δείκτες × {len(ys)} κύματα ({len(obs)} παρατηρήσεις)")
    return len(fam)
