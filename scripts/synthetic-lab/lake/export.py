"""
Εξαγωγή του lake για το simulation engine (Deliverables D/E/F — τράπεζα ερωτήσεων, κατανομές, ευρετήριο ανάκτησης).

<LAKE>/export/lake_index.json        μελέτες (προέλευση/ποιότητα/άδεια) + ερωτήσεις/μεταβλητές (κείμενο, επιλογές, έτη, θέματα)
<LAKE>/export/shards/<sha1>.json     PriorMetric[] ανά μελέτη (scheme "lake") — φορτώνονται κατά απαίτηση

Κανόνες:
- Μόνο μελέτες VALIDATED/INTEGRATED από το lake (όχι τα ήδη ενσωματωμένα σύνολα του Lab), μη διπλότυπες, Ελλάδα,
  ατομικός πληθυσμός (τα B2B δείγματα εξαιρούνται), κύματα 2012–2026.
- Ερωτήσεις ψήφου/κομματικής προτίμησης εξαιρούνται (το Lab δεν μοντελοποιεί εκλογική συμπεριφορά ατόμων).
- tier = open μόνο με ρητά ανοικτή άδεια· αλλιώς research_only.
- Κανονικοποίηση ομάδων: age_band | age_group4 | age_findex · education_group (ή proxy ηλικίας ολοκλήρωσης) | education_findex ·
  income_quintile | income_findex · gender. Οι υπόλοιπες διασπάσεις μένουν στη βάση (δεν χρησιμοποιούνται στο μοντέλο).
- Οι εξαγόμενες μελέτες μαρκάρονται INTEGRATED.
"""

import hashlib
import json
import os
import re
import time
from collections import defaultdict

from . import db

EXPORT = os.path.join(db.LAKE, "export")
SHARDS = os.path.join(EXPORT, "shards")
POLITICAL = re.compile(r"(?i)vote for|voting intention|which party|party (?:would you|do you|you feel)|κόμμα|ψηφίσ|ψήφο|πρόθεση ψήφου|left-right|αριστερ.*δεξι")
DK = re.compile(r"(?i)^(don.?t know|dk|dk/na|ne sait pas|refus|refusal|δεν ξέρω|δ\.?γ\.?|δγ/δα|no answer|nsp|nsp/sr|ns/nr|spontaneous)|\(spontaneous\)|δεν απαντ")
MODEL_DIMS = {"all", "gender", "age_band", "age_group4", "age_findex", "education_group", "education_findex", "income_quintile", "income_findex"}
SCHEME_VERSION = "lake-export-1"

# Eurostat: μόνο δείκτες που είναι ΠΟΣΟΣΤΟ ΑΤΟΜΩΝ/ΝΟΙΚΟΚΥΡΙΩΝ (ερμηνεύσιμοι ως «Ναι» μιας ερώτησης)· όχι % ΑΕΠ, % αποδοχών, % δαπάνης κ.λπ.
PERSON_UNITS = {"PC_IND", "PC_HH", "PC_POP", "PC_PER", "PC_IND_ICT", "PC_IND_IU3", "PC_IND_IU12", "PC_IND_BLT12", "PC_IND_ECOM"}
PERSON_PREFIX = ("ilc_", "hlth_ehis", "hlth_silc", "hlth_dh", "isoc_ci", "isoc_ec_i", "isoc_sk", "isoc_r_", "isoc_cisc", "isoc_iiot_use",
                 "isoc_ai", "isoc_bde15", "edat_", "trng_", "yth_", "tus_", "cult_pcs", "cult_prt", "tour_dem_tt", "lfsa_", "lfsq_", "lfst_",
                 "lfso_", "lfsi_", "gbv_", "icw_", "hbs_exp", "hbs_car", "hbs_hh", "sdg_", "cens_", "demo_", "migr_")
NOT_PERSON = re.compile(r"(?i)as a percentage of (earnings|hours|gdp|expenditure|revenue|turnover|total)|% of gdp|of gdp|structure of consumption|"
                        r"\btrade\b|\btax(es)?\b|investments?|revenues?|turnover|expenditure (by|on) |earnings|wages|prices|price index|"
                        r"gender pay gap|prisoners|budget|\bgva\b|value added|enterprises|business")


def _person_indicator(study_id, unit, label, var_type):
    code = study_id.split(":", 1)[1]
    if NOT_PERSON.search(label or "") or code.startswith(("hlth_cd", "hlth_co", "hlth_rs")):
        return False
    if var_type == "share_of_counts":
        return code.startswith(("cens_", "demo_", "lfs", "migr_", "edat_", "ilc_", "hlth_", "tus_", "yth_"))
    if unit in PERSON_UNITS:
        return True
    if unit == "PC" and code.startswith(PERSON_PREFIX):
        return not code.startswith("sdg_") or bool(re.search(r"(?i)population|persons|people|households|individuals|adults|children|share of", label or ""))
    return False


def _shard_name(study_id):
    return hashlib.sha1(study_id.encode("utf-8")).hexdigest()[:16] + ".json"


def _tier(st):
    return "open" if st["license_open"] == 1 else "research_only"


def _cell(value, n, flag, level):
    c = {"value": round(float(value), 2), "n": int(n or 0), "confidence": "official" if level == "B" else "survey", "sources": 1,
         "inconsistent": False}
    if not n:
        c["nUnknown"] = True
    if flag:
        c["flag"] = flag
    return c


def _waves(rows, level):
    """rows: (year, dim, group, value, n, flag) → PriorWave[] με κανονικοποιημένες διαστάσεις."""
    by_year = defaultdict(lambda: defaultdict(dict))
    proxy = defaultdict(dict)
    for y, dim, grp, v, n, flag in rows:
        if y is None or not (2012 <= y <= 2026) or v is None:
            continue
        if dim == "education_end_proxy":
            proxy[y][grp] = _cell(v, n, (flag or "") + " proxy: ηλικία ολοκλήρωσης εκπαίδευσης", level)
            continue
        if dim not in MODEL_DIMS:
            continue
        by_year[y][dim][grp] = _cell(v, n, flag, level)
    for y, cells in proxy.items():
        if y in by_year and "education_group" not in by_year[y]:
            by_year[y]["education_group"] = cells
    out = []
    for y in sorted(by_year):
        groups = by_year[y]
        if "all" not in groups or "all" not in groups["all"]:
            continue
        out.append({"key": str(y), "year": y, "quarter": "", "groups": {d: dict(g) for d, g in groups.items()}})
    return out


def run(con):
    os.makedirs(SHARDS, exist_ok=True)
    # η κατάσταση INTEGRATED αποδίδεται εκ νέου σε κάθε εξαγωγή (μόνο για ό,τι πράγματι εξάγεται)
    con.execute("UPDATE studies SET status='VALIDATED' WHERE status='INTEGRATED' AND source_id <> 'lab_existing'")
    studies = con.execute(
        """SELECT * FROM studies WHERE status IN ('VALIDATED','INTEGRATED') AND source_id <> 'lab_existing' AND duplicate_of IS NULL
           AND (country LIKE 'EL%' OR country IS NULL) AND COALESCE(representativeness,'') <> 'business_sample'
           AND EXISTS (SELECT 1 FROM variables v WHERE v.study_id = studies.study_id)"""
    ).fetchall()
    index_studies, index_questions, exported, written = [], [], set(), set()
    t0 = time.time()
    for st in studies:
        sid = st["study_id"]
        level = st["evidence_level"] or "C"
        tier = _tier(st)
        vars_ = con.execute("SELECT * FROM variables WHERE study_id=? ORDER BY var_id", (sid,)).fetchall()
        dist = defaultdict(list)
        for d in con.execute("SELECT var_id, wave_year, group_dim, group_value, option_label, value, n, flag FROM distributions WHERE study_id=?", (sid,)):
            dist[d["var_id"]].append(d)
        metrics, qcount = [], 0
        for v in vars_:
            rows = dist.get(v["var_id"])
            if not rows:
                continue
            qtext = ((v["label"] if st["source_id"] in ("eurostat", "worldbank") else v["question_text"]) or v["label"] or v["name"] or "").strip()
            if POLITICAL.search(qtext):
                continue
            vt = v["var_type"] or ""
            base_id = f"lake:{sid}::{v['name']}"
            topics = json.loads(v["topics"] or "[]") if v["topics"] else []
            if vt in ("percent", "share_of_counts") and all(r["option_label"] == "ποσοστό" for r in rows):
                try:
                    unit = (json.loads(v["options"] or "{}") or {}).get("unit")
                except (ValueError, AttributeError):
                    unit = None
                if st["source_id"] == "eurostat" and not _person_indicator(sid, unit, f"{st['title']} {v['label']}", vt):
                    continue
                # δείκτης ποσοστού (Eurostat): δυαδικός «Ναι» = έχει το χαρακτηριστικό
                waves = _waves([(r["wave_year"], r["group_dim"], r["group_value"], r["value"], r["n"], r["flag"]) for r in rows], level)
                if not waves:
                    continue
                mid = base_id
                metrics.append({"metric": mid, "family": f"lake:{st['source_id']}", "label": v["label"] or qtext, "question": qtext,
                                "semanticsNote": f"{st['title']} ({st['publisher'] or st['source_id']}). Ποσοστό πληθυσμού με το χαρακτηριστικό· έτη {waves[0]['year']}–{waves[-1]['year']}.",
                                "waves": waves, "scheme": "lake", "datasetId": sid, "tier": tier, "answerOptions": ["Ναι", "Όχι"], "positiveOption": "Ναι"})
                index_questions.append({"id": mid, "studyId": sid, "kind": "binary", "code": v["name"], "text": qtext[:400], "options": ["Ναι", "Όχι"],
                                        "dkOptions": [], "optionMetrics": {"Ναι": mid}, "years": [w["year"] for w in waves],
                                        "n": None, "topics": topics, "multi": False})
                qcount += 1
                continue
            if vt == "percent_yes":
                # δυαδικός δείκτης έρευνας (π.χ. Global Findex): «Ναι» = ποσοστό με το χαρακτηριστικό
                waves = _waves([(r["wave_year"], r["group_dim"], r["group_value"], r["value"], r["n"], r["flag"]) for r in rows if r["option_label"] == "Ναι"], level)
                if not waves:
                    continue
                mid = base_id
                note = (v["question_text"] or "")[:600]
                metrics.append({"metric": mid, "family": f"lake:{st['source_id']}", "label": qtext, "question": qtext,
                                "semanticsNote": f"{st['title']}. {note}", "waves": waves, "scheme": "lake", "datasetId": sid, "tier": tier,
                                "answerOptions": ["Ναι", "Όχι"], "positiveOption": "Ναι"})
                index_questions.append({"id": mid, "studyId": sid, "kind": "binary", "code": v["name"], "text": qtext[:400], "options": ["Ναι", "Όχι"],
                                        "dkOptions": [], "optionMetrics": {"Ναι": mid}, "years": [w["year"] for w in waves], "n": None,
                                        "topics": topics, "multi": False})
                qcount += 1
                continue
            # κατηγορική ερώτηση: ένας δείκτης ανά επιλογή
            opts = json.loads(v["options"] or "[]") if v["options"] and v["options"].startswith("[") else []
            by_opt = defaultdict(list)
            for r in rows:
                by_opt[r["option_label"]].append((r["wave_year"], r["group_dim"], r["group_value"], r["value"], r["n"], r["flag"]))
            order = [o for o in opts if o in by_opt] + [o for o in by_opt if o not in opts]
            multi = vt == "percent_multi"
            om, years = {}, set()
            n_all = max((r["n"] or 0 for r in rows if r["group_dim"] == "all"), default=0) or None
            for k, o in enumerate(order):
                waves = _waves(by_opt[o], level)
                if not waves:
                    continue
                mid = f"{base_id}::{k}"
                om[o] = mid
                years.update(w["year"] for w in waves)
                metrics.append({"metric": mid, "family": f"lake:{st['source_id']}", "label": f"{qtext[:200]} — «{o}»", "question": qtext,
                                "semanticsNote": f"{st['title']} ({st['publisher'] or st['source_id']}). Ποσοστό που επέλεξε «{o}»" + (" (πολλαπλές απαντήσεις)" if multi else "") + ".",
                                "waves": waves, "scheme": "lake", "datasetId": sid, "tier": tier,
                                **({"answerOptions": ["Ναι", "Όχι"], "positiveOption": "Ναι"} if multi else {})})
            if len(om) < (1 if multi else 2):
                continue
            if multi:
                for o, mid in om.items():
                    index_questions.append({"id": mid, "studyId": sid, "kind": "binary", "code": v["name"], "text": f"{qtext[:300]} — {o}",
                                            "options": ["Ναι", "Όχι"], "dkOptions": [], "optionMetrics": {"Ναι": mid}, "years": sorted(years),
                                            "n": n_all, "topics": topics, "multi": True})
            else:
                index_questions.append({"id": base_id, "studyId": sid, "kind": "distribution", "code": v["name"], "text": qtext[:400],
                                        "options": list(om), "dkOptions": [o for o in om if DK.search(o)], "optionMetrics": om,
                                        "years": sorted(years), "n": n_all, "topics": topics, "multi": False})
            qcount += 1
        if not metrics:
            continue
        shard = _shard_name(sid)
        with open(os.path.join(SHARDS, shard + ".tmp"), "w", encoding="utf-8") as fh:
            json.dump({"studyId": sid, "metrics": metrics}, fh, ensure_ascii=False, separators=(",", ":"))
        os.replace(os.path.join(SHARDS, shard + ".tmp"), os.path.join(SHARDS, shard))
        written.add(shard)
        dups = [r["study_id"] for r in con.execute("SELECT study_id FROM studies WHERE duplicate_of=?", (sid,))]
        index_studies.append({
            "studyId": sid, "source": st["source_id"], "title": st["title"], "publisher": st["publisher"], "url": st["url"], "doi": st["doi"],
            "license": st["license"], "tier": tier, "level": level, "quality": st["quality_score"], "representativeness": st["representativeness"],
            "sampleSize": st["sample_size"], "yearStart": st["collection_year_start"], "yearEnd": st["collection_year_end"],
            "fieldwork": st["fieldwork_dates"], "population": st["target_population"], "topics": json.loads(st["topics"] or "[]"),
            "dedupKey": st["dedup_key"], "duplicates": dups, "shard": shard, "questions": qcount,
        })
        exported.add(sid)
        reason = (st["status_reason"] or "").split(" · εξήχθη")[0]
        db.set_status(con, sid, "INTEGRATED", f"{reason} · εξήχθη στο simulation engine ({qcount} ερωτήσεις/δείκτες)")
    for f in os.listdir(SHARDS):  # παλιά shards μελετών που δεν εξάγονται πλέον
        if f.endswith(".json") and f not in written:
            os.remove(os.path.join(SHARDS, f))
    index = {"version": SCHEME_VERSION, "generatedAt": db.now(), "studies": index_studies, "questions": index_questions,
             "dimensions": sorted(MODEL_DIMS - {"all"})}
    tmp = os.path.join(EXPORT, "lake_index.json.tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, os.path.join(EXPORT, "lake_index.json"))
    db.log(con, "export", f"{len(index_studies)} μελέτες, {len(index_questions)} ερωτήσεις/δείκτες ({time.time() - t0:.0f}s)")
    con.commit()
    print(f"✓ export: {len(index_studies)} μελέτες, {len(index_questions)} ερωτήσεις/δείκτες → {EXPORT}")
    return len(index_studies)
