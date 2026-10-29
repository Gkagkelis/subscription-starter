"""
Phase 5 GLOBAL BEHAVIOUR EVIDENCE LAKE — NEW European downloads of the phase (PHASE5_PREREGISTRATION "Τροποποίηση Α"):
Eurobarometer 75.3 / 78.1 / 97.5 / 98.2 / 99.4 / 100.2 / 101.3, EB cultural participation 2007 / 2013 / 2017 (Zenodo
harmonised file), stacked EB 2013-2017 (Harvard VTGQ9Q, 8 countries) and ESS rounds 3 / 6 / 7 / 8 / 9 (no Greece).

    python3 -I scripts/synthetic-lab/persona/harmonize_global_p5_eu.py --root . [--only <surveyId> ...]

surveyIds:
  eb753 eb781 eb975 eb982 eb994 eb1002 eb1013   Greek rows LOCKED (F3a / F3b / F3c)
  ebcult2007 ebcult2013 ebcult2017              Greek rows LOCKED (F3d)
  ebs793 ebs801 ebs812 ebs823 ebs833 ebs852 ebs873 ebs883   stacked EB, no Greece (waves 84.3 / 86.2 dropped: held as eb843 / eb862)
  ess3 ess6 ess7 ess8 ess9                      no Greece (training only)

Output format: docs/synthetic-lab/GLOBAL_LAKE_SPEC.md. Writes ONLY under .synthetic-lab-data/global-behavior-evidence/v1/:
  resp/<sid>.csv.gz           all NON-locked rows (for the locked surveys: every country except GR)
  locked/<sid>.GR.csv.gz      LOCKED final-holdout Greek rows, same columns as resp; absent from resp/
  items/<sid>.json, provenance/<sid>.json
  surveys.p5eu.json           one entry per surveyId (merged by surveyId on partial runs; other files untouched)

Reuse: the item / demographic / weight / split / political / sensitive logic of harmonize_global_eu.py (and through it
harmonize_p4_lake.py) is IMPORTED, not modified: GCtx, finalize, validate, norm_weight_by_country, waves_by_country,
split_var_subsample, eb_iso, political filter, sensitive filters, h_ess (ESS adapter, registered at run time for the new
rounds). Existing surveys' outputs are not touched (different surveyIds; surveys.eu.json is not written).

LOCKED GREEK ROWS (prereg. section 1, F3+): rows with country == GR are separated right after the country mapping. ALL item
decisions (options, numeric-scale completion, >=300 valid answers, >=2 codes, country coverage, split ballots, battery
flags) are taken on the non-Greek rows only. The Greek rows are then recoded mechanically with the resulting option sets
(answer code kept iff it is one of the item's documented substantive codes, else empty) and written only to locked/. For
them nothing is computed except the row count (plus the demographic recodes, weight normalisation and fieldwork month that
every row gets). Nothing about their answers is printed or stored outside locked/.

DATA HYGIENE: no answer distributions, correlations or crosstabs are computed or printed - only row / item / country /
valid-answer counts. Downloads are read as data only (pyreadstat / pandas); nothing inside them is executed. One source
file is processed at a time with usecols.
"""
import argparse
import datetime as dt
import fcntl
import gc
import json
import os
import re
import sys
import time
import types

import numpy as np
import pandas as pd
import pyreadstat

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:  # python -I does not put the script directory on sys.path
    sys.path.insert(0, HERE)
import harmonize_p4_lake as P4  # noqa: E402  (reused, not modified)
import harmonize_global_eu as G  # noqa: E402  (reused, not modified)

OUT_REL = G.OUT_REL
CACHE_REL = G.CACHE_REL
P5RAW = os.path.join(".synthetic-lab-data", "raw", "phase5")
SCRIPT_REL = os.path.join("scripts", "synthetic-lab", "persona", "harmonize_global_p5_eu.py")
SURVEYS_FILE = "surveys.p5eu.json"
DEMO_COLS = G.DEMO_COLS

EB_SIDS = ["eb753", "eb781", "eb975", "eb982", "eb994", "eb1002", "eb1013"]
CULT_SIDS = ["ebcult2007", "ebcult2013", "ebcult2017"]
STACK_WAVES = [793, 801, 812, 823, 833, 852, 873, 883]
STACK_DROPPED = {843: "eb843", 862: "eb862"}
STACK_SIDS = [f"ebs{w}" for w in STACK_WAVES]
ESS_SIDS = ["ess3", "ess6", "ess7", "ess8", "ess9"]
SURVEY_IDS = EB_SIDS + CULT_SIDS + STACK_SIDS + ESS_SIDS
LOCKED = {"eb753": "F3a", "eb781": "F3b", **{s: "F3c" for s in ["eb975", "eb982", "eb994", "eb1002", "eb1013"]},
          **{s: "F3d" for s in CULT_SIDS}}

# ---------------------------------------------------------------------------------------------- sensitive extension
# The EU harmoniser's filters (P4.SENSITIVE via generic_skip + G.SENS_EXTRA / G.ESS_SENS_VARS) are applied unchanged.
# Added for this scope (GDPR art. 9 about the respondent): trade-union membership (explicit art. 9 category; already the
# rule of harmonize_global_world.py) and the two remaining CES-D depression-symptom items of the ESS 3/6/7 well-being and
# health modules ('could not get going', 'felt anxious'), which are of the same kind as the already excluded fltdpr /
# flteeff / slprl / fltsd.
P5_SENS_VARS = re.compile(r"^(mbtru|tru(mmb|ptp|dm|vw)|cldgng|fltanx)$")
P5_SENS_TEXT = re.compile(r"member of (a )?trade union|trade union member|could not get going|felt anxious")
_orig_sensitive_extra = G.sensitive_extra
SENS_REASON = ("sensitive (GDPR art. 9: own health condition / infection / vaccination / treatment / mental-health symptom / "
               "gender identity / ethnicity / trade-union membership)")


def p5_sensitive(var, lab):
    return bool(_orig_sensitive_extra(var, lab) or P5_SENS_VARS.match(var.lower()) or P5_SENS_TEXT.search(P4.norm(lab)))


# run-time patch of the imported module's globals (affects this process only; the file is not modified)
G.sensitive_extra = p5_sensitive
G.SENS_REASON = SENS_REASON


# ---------------------------------------------------------------------------------------------- pyreadstat shim (ESS9)

def _fix_utf8(s):
    if not isinstance(s, str):
        return s
    try:
        return s.encode("latin-1").decode("utf-8", errors="replace")
    except UnicodeEncodeError:
        return s


ENCODING_FALLBACK = {}


def read_dta_safe(path, **kw):
    """pyreadstat.read_dta; if the file has an invalid UTF-8 byte sequence (ESS9e02: party-name value labels cut inside a
    multi-byte character), re-read as latin-1 and repair every string back to UTF-8 (invalid bytes -> U+FFFD)."""
    try:
        return pyreadstat.read_dta(path, **kw)
    except Exception as e:  # noqa: BLE001
        if "encoding" not in str(e).lower():
            raise
    df, m = pyreadstat.read_dta(path, encoding="latin1", **kw)
    ENCODING_FALLBACK[os.path.basename(path)] = True
    m.column_names_to_labels = {k: _fix_utf8(v) for k, v in (m.column_names_to_labels or {}).items()}
    m.variable_value_labels = {k: {kk: _fix_utf8(vv) for kk, vv in d.items()} for k, d in (m.variable_value_labels or {}).items()}
    if df is not None and len(df.columns):
        for c in df.columns:
            if df[c].dtype == object:
                df[c] = df[c].map(_fix_utf8)
    return df, m


G.pyreadstat = types.SimpleNamespace(read_dta=read_dta_safe, read_sav=pyreadstat.read_sav)


# ---------------------------------------------------------------------------------------------- helpers

MON3 = {m[:3]: i for m, i in P4.MONTHS.items()}


def ym_any(lab):
    """Interview-date value labels in all formats of these files: 'Friday 6th May 2011', '18-OCT-2023', '2/Apr/24',
    '3-Jun-2022', '12/Jan/2023', '01-June-2023'."""
    r = P4.ym_from_label(lab)
    if r:
        return r
    t = P4.norm(str(lab or ""))
    m = re.search(r"(\d{1,2})(?:st|nd|rd|th)?[-/ .]([a-z]{3,9})[-/ .,]+(\d{2,4})\b", t)
    if m and m.group(2)[:3] in MON3:
        y = int(m.group(3))
        y = y + 2000 if y < 100 else y
        return f"{y:04d}-{MON3[m.group(2)[:3]]:02d}"
    return None


def load_p5_manifest(root):
    out = {}
    with open(os.path.join(root, P5RAW, "manifest.jsonl"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                d = json.loads(line)
                out[d["slug"]] = d
    return out


def first_value(path, var, reader=None):
    """First non-empty value of an admin variable (study number / DOI / version / edition)."""
    try:
        df, _ = (reader or read_dta_safe)(path, usecols=[var], row_limit=50)
    except Exception:  # noqa: BLE001
        return None
    s = df[var].dropna().astype(str).str.strip()
    s = s[s != ""]
    return s.iloc[0] if len(s) else None


def greek_numeric_codes(series, allowed):
    """Mechanical recode of LOCKED Greek rows with an item's documented option codes (same rule as P4.labelled_codes:
    numeric code kept iff it is a substantive option; DK / refusal / inap / undocumented -> empty). No counting."""
    s = pd.to_numeric(series, errors="coerce").map(P4.code_str)
    return s.where(s.isin(allowed), None).reset_index(drop=True)


def write_locked(root, sid, items, demo_gr, wave_gr, start, recode):
    """Writes locked/<sid>.GR.csv.gz (same columns as resp). Returns the number of rows written."""
    d = demo_gr.reset_index(drop=True).copy()
    n = len(d)
    d.insert(0, "rid", [f"{sid}-{start + i + 1}" for i in range(n)])
    d["wave"] = wave_gr
    cols = {}
    for it in items:
        allowed = {o["code"] for o in it["options"]}
        cols[it["id"]] = recode(it["var"], allowed)
    frame = pd.concat([d[DEMO_COLS], pd.DataFrame(cols, index=d.index)], axis=1)
    path = os.path.join(root, OUT_REL, "locked", f"{sid}.GR.csv.gz")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    frame.to_csv(path + ".tmp", index=False, compression="gzip")
    os.replace(path + ".tmp", path)
    return n


def remove_stale_locked(root, sid):
    p = os.path.join(root, OUT_REL, "locked", f"{sid}.GR.csv.gz")
    if os.path.exists(p):
        os.remove(p)


def patch_outputs(root, sid, entry, *, func, n_locked=0, wave_gr=None, extra_notes=(), prov_extra=None):
    """Overrides the bookkeeping that harmonize_global_eu.finalize writes for its own surveys (harmoniser, greekRole) and
    adds the locked-row counts. Must run AFTER G.validate (which compares nTotal with resp)."""
    locked = sid in LOCKED
    n_resp = entry["nTotal"]
    entry["harmoniser"] = SCRIPT_REL
    entry["notes"] = list(entry["notes"]) + list(extra_notes)
    if locked:
        entry["countries"]["GR"] = {"n": int(n_locked), "wave": wave_gr}
        entry["countries"] = {c: entry["countries"][c] for c in sorted(entry["countries"])}
        entry["nCountries"] = len(entry["countries"])
        entry["nTotal"] = int(n_resp + n_locked)
        entry["greekRole"] = "final_locked"
        entry["lockedHoldout"] = LOCKED[sid]
        entry["notes"].append(f"Greek rows are LOCKED final holdout {LOCKED[sid]} (PHASE5_PREREGISTRATION, Τροποποίηση Α): "
                              f"written only to locked/{sid}.GR.csv.gz (n={n_locked}); item decisions were taken on the "
                              "non-Greek rows only and nothing but the Greek row count was computed.")
    else:
        if "GR" in entry["countries"]:
            raise RuntimeError(f"{sid}: Greek rows in a no-Greece file")
        entry["greekRole"] = "absent"
    entry["nRows"] = {"resp": int(n_resp), "locked": int(n_locked)}
    entry.pop("build", None)
    ppath = os.path.join(root, OUT_REL, "provenance", f"{sid}.json")
    prov = json.load(open(ppath, encoding="utf-8"))
    prov["harmoniser"] = {"script": SCRIPT_REL, "function": func, "command": f"python3 -I {SCRIPT_REL} --root . --only {sid}",
                          "reusedFrom": ["scripts/synthetic-lab/persona/harmonize_global_eu.py (imported: GCtx, finalize, validate, "
                                         "h_ess, weight / wave / split / political / sensitive helpers; not modified)",
                                         "scripts/synthetic-lab/persona/harmonize_p4_lake.py (imported via the above; not modified)"]}
    prov["rows"] = entry["nRows"]
    prov["greekRole"] = entry["greekRole"]
    prov["notes"] = list(prov.get("notes", [])) + list(extra_notes)
    if locked:
        prov["locked"] = {"holdout": LOCKED[sid], "file": f"locked/{sid}.GR.csv.gz", "nRows": int(n_locked),
                          "rule": "Greek rows separated after the country mapping; all item decisions on non-Greek rows only; "
                                  "Greek answers recoded mechanically with the documented option codes; only the row count "
                                  "was computed (no Greek marginal, distribution, missingness or crosstab)."}
    prov["sensitiveFilter"] = ("harmonize_global_eu SENSITIVE / SENS_EXTRA / ESS_SENS_VARS + this script: "
                               f"{P5_SENS_VARS.pattern} | {P5_SENS_TEXT.pattern}")
    if prov_extra:
        prov.update(prov_extra)
    G.write_json_atomic(ppath, prov)
    return entry


# ---------------------------------------------------------------------------------------------- Eurobarometer (GESIS Stata)

OBT = "eb_975_982_994_1002_1013_2022_2024_harvard_OBTOD4"
EB_P5 = {
    "eb753": {"slug": "eb_753_2011_harvard_4XXD3E", "fn": "eb75.3_2011.dta", "rename": True, "wde": "w3", "wgb": "w4", "split": "split",
              "deposit": "doi:10.7910/DVN/4XXD3E"},
    "eb781": {"slug": "eb_781_2012_harvard_KMWN9M", "fn": "ZA5685_v2-0-0.dta", "wde": "w3", "wgb": "w4", "split": "split",
              "deposit": "doi:10.7910/DVN/KMWN9M"},
    "eb975": {"slug": OBT, "fn": "EB_97_5.dta", "wde": "w1de", "deposit": "doi:10.7910/DVN/OBTOD4"},
    "eb982": {"slug": OBT, "fn": "EB_98_2.dta", "wde": "w1de", "deposit": "doi:10.7910/DVN/OBTOD4"},
    "eb994": {"slug": OBT, "fn": "EB_99_4.dta", "wde": "w1de", "deposit": "doi:10.7910/DVN/OBTOD4"},
    "eb1002": {"slug": OBT, "fn": "EB_100_2.dta", "wde": "w1de", "deposit": "doi:10.7910/DVN/OBTOD4"},
    "eb1013": {"slug": OBT, "fn": "EB_101_3.dta", "wde": "w1de", "deposit": "doi:10.7910/DVN/OBTOD4"},
}
PREFIX_RX = re.compile(r"^([A-Z]{1,3}\d+(?:[A-Z]+\d*)*(?:_\d+)*)\s+(\S.*)$")
EB_C_BLOCK = re.compile(r"^c\d+\w*$")


def eb753_names(cols, labs):
    """EB 75.3 deposit uses generic names v1..v753; the GESIS question id is the first token of each label
    ('QA4A_1 SITUATION: NATIONAL ECONOMY'). Unique ids become the variable name (lower case, like the other GESIS files);
    duplicated ids (P3, P6, P7 ...) keep the generic name. Returns {orig: new}, {new: label without id}."""
    pref = {}
    for c in cols:
        lab = labs.get(c) or ""
        if lab.startswith("NATION - ALL SAMPLES ISO"):
            pref[c] = "isocntry"
        elif lab.upper().startswith("SPLIT"):
            pref[c] = "split"
        else:
            m = PREFIX_RX.match(lab)
            if m:
                pref[c] = m.group(1).lower()
    cnt = pd.Series(list(pref.values())).value_counts().to_dict()
    ren, newlab = {}, {}
    for c in cols:
        p = pref.get(c)
        new = p if p and cnt.get(p) == 1 and p not in cols else c
        ren[c] = new
        lab = labs.get(c) or ""
        m = PREFIX_RX.match(lab)
        newlab[new] = m.group(2) if (m and new != c) else lab
    return ren, newlab


def eb_meta(sid, path, man, vls_orig, cols_orig, ren):
    inv = {v: k for k, v in ren.items()}

    def val(v):
        return first_value(path, inv.get(v, v)) if inv.get(v, v) in cols_orig else None
    studyno = val("studyno1") or val("v1")
    version = val("version") or val("v3")
    doi = val("doi")
    sv = "survey" if "survey" in cols_orig else ("v4" if "v4" in cols_orig else None)
    title_lab = next(iter((vls_orig.get(sv) or {}).values()), None) if sv else None
    za = f"ZA{studyno}" if studyno and re.fullmatch(r"\d{4}", str(studyno)) else (str(studyno) if studyno else "")
    wave_no = {"eb753": "75.3", "eb781": "78.1", "eb975": "97.5", "eb982": "98.2", "eb994": "99.4", "eb1002": "100.2",
               "eb1013": "101.3"}[sid]
    title = f"Standard Eurobarometer {wave_no}" + (f" — {P4.clean(title_lab)}" if title_lab else "")
    za_v = f"{za} {version}".strip() if version else za
    return {"title": title, "family": "eb",
            "source": f"{title}, GESIS {za_v or '(study number not in file)'} — third-party copy (Harvard Dataverse "
                      f"{EB_P5[sid]['deposit']})",
            "doi_or_url": (f"{doi} (GESIS {za}); " if doi else (f"GESIS {za}; " if za else "")) + f"copy via {EB_P5[sid]['deposit']}",
            "licence": G.EB_LIC.format(za=za_v or "study number not in file"), "commercialUse": "unclear", "aiTraining": "unclear",
            "mode": man.get("mode") or "face-to-face CAPI (Standard Eurobarometer)", "sampling": G.EB_SAMPLING,
            "overlaps": ["New wave of the phase: no respondent overlap with the held EB waves (84.3, 86.2, 88.4, 93.1, 94.3, "
                         "103.3, Flash 506, EFSA) or with the other new waves (separate cross-sections)."]}, za_v


def h_p5_eb(root, sid, mans):
    sp = EB_P5[sid]
    man = mans.get(sp["slug"], {})
    path = os.path.join(root, P5RAW, sp["slug"], sp["fn"])
    _, m = read_dta_safe(path, metadataonly=True)
    labs0, vls0 = m.column_names_to_labels or {}, m.variable_value_labels or {}
    cols0 = list(m.column_names)
    if sp.get("rename"):
        ren, labs = eb753_names(cols0, labs0)
    else:
        ren, labs = {c: c for c in cols0}, {c: labs0.get(c) or "" for c in cols0}
    vls = {ren[c]: v for c, v in vls0.items() if c in ren}
    cols = [ren[c] for c in cols0]
    inv = {v: k for k, v in ren.items()}
    dv = {"age": "d11", "gender": "d10", "edu": "d8", "urban": "d25"}
    for k, v in dv.items():
        if v not in cols:
            raise ValueError(f"{sid}: demographic {v} missing")
    cvar = "isocntry"
    split = sp.get("split") if sp.get("split") in cols else None
    reserved = [c for c in [cvar, "w1", sp.get("wde"), sp.get("wgb"), "p1", split] + list(dv.values()) if c and c in cols]
    used_demo = set(dv.values())
    keep_d = P4.EB_KEEP_D
    ctx = G.GCtx(sid, sp["slug"])
    sib = {}
    for v in cols:
        if re.search(r"_\d+$", v.lower()):
            sib.setdefault(P4.gesis_qid(v), []).append(re.sub(r"^q\d+_\d+\s+", "", labs.get(v) or "", flags=re.I))

    def truncated(var, raw):
        group = sib.get(P4.gesis_qid(var), [])
        if len(raw) < 76 or len(group) < 2:
            return False
        lcp = os.path.commonprefix(group)
        return len(raw[len(lcp):].strip()) < 15

    cand = []
    for var in cols:
        raw_lab = labs.get(var) or ""
        lab = P4.clean(raw_lab)
        lv = var.lower()
        if var in used_demo:
            ctx.exclude(var, "demographic (used for demographics columns)")
            continue
        if var in reserved or P4.EB_SKIP.match(lv) or lv in ("nation", "serialid", "respondent_serial", "uniqid"):
            ctx.exclude(var, "admin / weight / region / country-group flag (EB skip list)")
            continue
        if re.match(r"^d\d", lv) and not keep_d.match(lv):
            ctx.exclude(var, "demographic (EB D-block)")
            continue
        if EB_C_BLOCK.match(lv):
            ctx.exclude(var, "GESIS-derived index / scale (C-block: opinion leadership, political interest index, occupation scale)")
            continue
        if lv in ("de", "gb") or re.match(r"^NATION\b", raw_lab.upper()):
            ctx.exclude(var, "admin: country / sample flag (NATION ...)")
            continue
        if re.match(r"^d\d+t\w*$", lv):
            ctx.exclude(var, "producer-derived D-block total / combination (e.g. D43T landline/mobile)")
            continue
        if re.search(r"\dr_\d+$", lv):
            ctx.exclude(var, "producer recode (GESIS 'r' variable, e.g. counts of correct / DK answers)")
            continue
        mb = re.match(r"^(q[a-z]*\d+)b_(\d+)$", lv)
        if mb and f"{mb.group(1)}t_{mb.group(2)}" in cols:
            ctx.exclude(var, "partial multi-mention (follow-up 'and then?' mentions of the B question); the combined T variable "
                             "is used")
            continue
        mt = re.match(r"^(q[a-z]*\d+)t_(\d+)$", lv)
        if mt and any(re.match(rf"^{mt.group(1)}_\d+$", c) for c in cols):
            ctx.exclude(var, "producer-derived thematic net (sum of several answer categories of the same question)")
            continue
        if re.match(r"^v\d+$", lv) and sp.get("rename"):
            if not vls.get(var) or not re.match(r"^[A-Z]", raw_lab):
                ctx.exclude(var, "admin / unnamed variable without question id (EB 75.3 deposit naming)")
                continue
        if p5_sensitive(var, lab):
            ctx.exclude(var, SENS_REASON)
            continue
        reason = P4.generic_skip(var, lab)
        if reason:
            ctx.exclude(var, reason)
            continue
        if re.search(r"(_r\d*|r\d)$", lv) and re.search(r"recod|\(r\)|cat\b|\brec\b", lab, re.I):
            ctx.exclude(var, "producer recode")
            continue
        if re.search(r"\b2ND\b", raw_lab) and "(SUM)" not in raw_lab.upper():
            ctx.exclude(var, "partial multi-mention ('And then?' / 2nd mention); the (SUM) combined variable is used where present")
            continue
        vl = vls.get(var) or {}
        is_mention = len([k for k in vl if isinstance(k, (int, float))]) >= 2 and any(
            P4.MENTION0.search(P4.norm(str(x))) for k, x in vl.items() if isinstance(k, (int, float)) and float(k) == 0)
        if is_mention and re.match(r"^others?\b", P4.norm(lab.split(":")[-1]).strip()):
            ctx.exclude(var, "multi-mention indicator for 'other(s)' (non-substantive)")
            continue
        if re.search(r"_\d+$", lv) and not is_mention and truncated(var, raw_lab):
            ctx.exclude(var, "variable label truncated at Stata's 80-character limit (battery sub-item wording lost) and no "
                             "questionnaire in deposit")
            continue
        cand.append((var, lab, vl))
    usecols = [inv[c] for c in reserved + [c[0] for c in cand]]
    df, _ = read_dta_safe(path, usecols=usecols)
    df = df.rename(columns=ren)
    n_raw = len(df)
    sample = df[cvar].astype(str).str.strip().str.upper()
    iso = sample.map(G.eb_iso)
    age_lab = vls.get("d11") or {}
    age_na = [float(k) for k, v in age_lab.items() if isinstance(k, (int, float)) and P4.NONSUB.search(P4.norm(str(v)))]
    age = pd.to_numeric(df["d11"], errors="coerce")
    age = age.where(~age.isin(age_na))
    keep = iso.notna() & ~(age < 17)
    dropped_tcc = int(iso.isna().sum())
    unmapped = sorted(set(sample[iso.isna()].unique()))
    dropped_age = int((iso.notna() & (age < 17)).sum())
    g = df[keep].reset_index(drop=True)
    sample = sample[keep].reset_index(drop=True)
    country = iso[keep].reset_index(drop=True)
    age = age[keep].reset_index(drop=True)
    del df
    gc.collect()
    G.iso_check(set(country.unique()))
    # weights: w1 per sample; united DE / GB weights where the country is split into two samples
    w = pd.to_numeric(g.w1, errors="coerce")
    wnote = []
    for iso2, wv, subs in (("DE", sp.get("wde"), {"DE-W", "DE-E"}), ("GB", sp.get("wgb"), {"GB-GBN", "GB-NIR"})):
        msk = country == iso2
        if wv and wv in g and msk.any() and set(sample[msk].unique()) >= subs:
            wu = pd.to_numeric(g.loc[msk, wv], errors="coerce")
            if (wu > 0).mean() > 0.99:
                w.loc[msk] = wu
                wnote.append(f"{iso2}: {wv} (united-{'Germany' if iso2 == 'DE' else 'Kingdom'} weight; w1 is computed per sub-sample "
                             f"{sorted(subs)})")
            else:
                raise ValueError(f"{sid}: united weight {wv} not usable for {iso2}")
    weight_var = "w1" + (" (" + "; ".join(wnote) + ")" if wnote else "")
    # demographics (same recodes for open and locked rows)
    demo = pd.DataFrame({"country": country})
    demo["age_band"] = age.map(P4.age_band)
    demo["gender"] = pd.to_numeric(g["d10"], errors="coerce").map({1.0: "male", 2.0: "female"})
    demo["edu3"] = pd.to_numeric(g["d8"], errors="coerce").map(P4.edu3_from_age_finished)
    if not re.search(r"community", labs.get("d25", ""), re.I):
        raise ValueError(f"{sid}: d25 is not type of community")
    demo["urban"] = pd.to_numeric(g["d25"], errors="coerce").map({1.0: "rural", 2.0: "urban", 3.0: "urban"})
    demo["weight"] = 1.0
    pl = vls.get("p1", {})
    unparsed = sorted({str(v) for v in pl.values() if not ym_any(v)})
    ym = pd.Series([ym_any(pl.get(v)) if v == v else None for v in pd.to_numeric(g.p1, errors="coerce")])
    lock = (country == "GR").values
    op = ~lock
    n_gr = int(lock.sum())
    # ---- open (non-Greek) rows
    go = g[op].reset_index(drop=True)
    demo_o = demo[op].reset_index(drop=True)
    demo_o["weight"], filled = G.norm_weight_by_country(w[op], demo_o.country)
    cw = G.waves_by_country(ym[op].values, demo_o.country)
    missing = sorted(c for c, x in cw.items() if not x)
    wave_approx = False
    wave_basis = "earliest interview month per country (>=1% of dated interviews) from p1 (date of interview) value labels"
    if missing:
        allw = P4.earliest_month(ym[op])
        for c in missing:
            cw[c] = allw
        wave_approx = True
        wave_basis += f"; survey-level month used for {missing}"
    cvals = demo_o.country.values
    S = go[split] if split else None
    for var, lab, vl in cand:
        if P4.add_labelled(ctx, var, go[var], lab, vl, text=lab, text_source="GESIS variable label (no questionnaire in deposit)") \
                and S is not None:
            vm = ctx.items[-1]["codes"].notna().values
            if G.split_var_subsample(vm, cvals, S):
                ctx.split[var] = f"answered only by some groups of the questionnaire split variable '{split}' ({labs.get(split)})"
    meta, za_v = eb_meta(sid, path, man, vls0, cols0, ren)
    notes = [f"Rows in file: {n_raw}; dropped {dropped_tcc} rows without an ISO country ({unmapped}: Turkish Cypriot Community "
             f"sample / not-included samples) and {dropped_age} respondents aged <17 (EB samples 15+); d11 codes labelled as "
             f"refusal {age_na or 'none'} treated as unknown age.",
             "Country = ISO 3166-1 alpha-2 from the GESIS sample code (isocntry): DE-W + DE-E -> DE, GB-GBN + GB-NIR (or GB-UKM) "
             "-> GB, RS-KM (Kosovo) -> XK.",
             f"Weight = {weight_var}, normalised to mean 1 within country.",
             "urban from d25 (type of community: rural area or village = rural; small/middle or large town = urban; DK empty).",
             "edu3 from d8 (age when full-time education ended): <=15 or none = low, 16-19 = medium, 20+ = high; 'still "
             "studying' / DK / refusal empty.",
             "gender from d10: 1 = male, 2 = female; the non-binary / prefer-not-to-say code of the 2022-24 files is empty.",
             f"wave: {wave_basis}.",
             "No questionnaire in deposit: item text = GESIS variable label (terse English); battery members flagged stemMissing."]
    if sp.get("rename"):
        notes.append("EB 75.3 deposit names variables v1..v753; the GESIS question id that starts each label (e.g. 'QA4A_1') is used "
                     "as the variable name (lower case) and removed from the label; ids that occur more than once keep the v-name. "
                     "Mapping in provenance 'variableRenaming'.")
    if unparsed:
        notes.append(f"p1 value labels without a parsable month: {unparsed[:5]}")
    info = {"meta": meta, "countryWaves": cw, "waveApprox": wave_approx, "weightVar": weight_var, "weightFilled": filled,
            "notes": notes, "function": "h_p5_eb", "sources": G.source_entries(root, man, [(path, "data")]),
            "rowFilters": {"rowsInFile": n_raw, "droppedNoIsoCountry": dropped_tcc, "droppedNoIsoCountryCodes": unmapped,
                           "droppedAgeUnder17": dropped_age, "lockedGreekRows": n_gr},
            "demoNotes": {"age_band": "d11", "gender": "d10", "edu3": "d8 (age education ended)", "urban": "d25"},
            "countryMapping": {s: G.eb_iso(s) for s in sorted(set(sample.unique()) | set(unmapped))}, "stemOf": None}
    items, entry = G.finalize(root, sid, ctx, demo_o, info)
    probs = G.validate(root, sid, items, entry)
    # ---- locked Greek rows
    n_open = len(demo_o)
    wave_gr = None
    if n_gr:
        gg = g[lock].reset_index(drop=True)
        demo_g = demo[lock].reset_index(drop=True)
        demo_g["weight"], _ = G.norm_weight_by_country(w[lock], demo_g.country)
        wave_gr = P4.earliest_month(ym[lock]) or entry["wave"]
        write_locked(root, sid, items, demo_g, wave_gr, n_open, lambda var, allowed: greek_numeric_codes(gg[var], allowed))
        del gg
    else:
        remove_stale_locked(root, sid)
    extra = {}
    if sp.get("rename"):
        extra["variableRenaming"] = {k: v for k, v in ren.items() if k != v}
    entry = patch_outputs(root, sid, entry, func="h_p5_eb", n_locked=n_gr, wave_gr=wave_gr, prov_extra=extra)
    entry["source"] = meta["source"]
    del g
    gc.collect()
    return items, entry, probs


# ---------------------------------------------------------------------------------------------- EB cultural participation

CULT_SLUG = "eb_cultural_participation_harmonized_zenodo5781672"
CULT_WAVES = {"2007": ("2007-02", "ZA4529 v3.0.1", "Eurobarometer 67.1 (Feb-Mar 2007)",
                       "deposit documentation: 'Eurobarometer 67.1 (Feb-Mar 2007)'"),
              "2013": ("2013-04", "ZA5688 v6.0.0", "Eurobarometer 79.2 (2013)",
                       "deposit gives the year only; month = start of the EB 79.2 fieldwork (April-May 2013) per the GESIS study "
                       "description (not in the deposit) - approximate"),
              "2017": ("2017-09", "ZA6925 v1.0.0", "Eurobarometer 88.1 (2017)",
                       "deposit gives the year only; month = start of the EB 88.1 fieldwork (September-October 2017) per the GESIS "
                       "study description (not in the deposit) - approximate")}
CULT_ACTS = [("visit_concert", "been to a concert"), ("visit_library", "visited a public library"),
             ("visit_museum", "visited a museum or gallery")]
CULT_CODES = {0.0: "1", 1.5: "2", 3.5: "3", 6.0: "4"}
CULT_OPTS = [("1", "Never (not in the last twelve months)"), ("2", "1-2 times"), ("3", "3-5 times"), ("4", "More than 5 times")]
_CULT_CACHE = {}


def _cult_df(root):
    if "df" not in _CULT_CACHE:
        p = os.path.join(root, P5RAW, CULT_SLUG, "harmonized_cap_file_20211214.csv")
        _CULT_CACHE["df"] = pd.read_csv(p, dtype=str, keep_default_na=False, na_values=["", "NA"])
        _CULT_CACHE["path"] = p
    return _CULT_CACHE["df"], _CULT_CACHE["path"]


def cult_codes(series):
    return pd.to_numeric(series, errors="coerce").map(CULT_CODES).reset_index(drop=True)


def h_cult(root, sid, mans):
    year = sid[-4:]
    man = mans.get(CULT_SLUG, {})
    df_all, path = _cult_df(root)
    pdf = os.path.join(root, P5RAW, CULT_SLUG, "Harmonized_Cultural_Access_And_Participation_Dataset.pdf")
    wave, za, ebtitle, wave_basis = CULT_WAVES[year]
    df = df_all[df_all.year_survey == year].reset_index(drop=True)
    n_raw = len(df)
    country = df.country_code.astype(str).str.strip().str.upper().map(lambda c: "GB" if c == "UK" else ("GR" if c == "EL" else c))
    G.iso_check(set(country.unique()))
    age = pd.to_numeric(df.age_exact, errors="coerce")
    keep = ~(age < 17)
    dropped_age = int((~keep).sum())
    g = df[keep].reset_index(drop=True)
    country = country[keep].reset_index(drop=True)
    age = age[keep].reset_index(drop=True)
    demo = pd.DataFrame({"country": country})
    demo["age_band"] = age.map(P4.age_band)
    demo["gender"] = None
    ae = pd.to_numeric(g.age_education, errors="coerce")
    stud = pd.to_numeric(g.is_student, errors="coerce") == 1
    demo["edu3"] = ae.map(P4.edu3_from_age_finished).where(~stud, None)
    demo["urban"] = None
    demo["weight"] = 1.0
    w = pd.to_numeric(g.w, errors="coerce")
    lock = (country == "GR").values
    op = ~lock
    n_gr = int(lock.sum())
    go = g[op].reset_index(drop=True)
    demo_o = demo[op].reset_index(drop=True)
    demo_o["weight"], filled = G.norm_weight_by_country(w[op], demo_o.country)
    cw = {c: wave for c in demo_o.country.unique()}
    ctx = G.GCtx(sid, CULT_SLUG)
    for c in df.columns:
        if c not in [a for a, _ in CULT_ACTS]:
            reason = {"id": "source study id", "rowid": "source row id", "geo": "sample code (country/sub-sample)",
                      "country_code": "country", "w1": "weight", "w_uk": "weight", "w_de": "weight", "wex": "weight", "w": "weight",
                      "year_survey": "wave", "age_exact": "demographic (age)", "age_education": "demographic (education)",
                      "is_student": "demographic (student status)"}.get(c)
            if c.startswith("fct_visit"):
                reason = ("duplicate factor representation of the numeric visit_* variable" if c != "fct_visit_museum" else
                          "factor version carries undocumented integer codes 1-6 in the deposit; the documented numeric "
                          "visit_museum is used instead")
            elif c.startswith("is_visit"):
                reason = "depositor-derived binary recode (visited at least once) of visit_*"
            ctx.exclude(c, reason or "not an item")
    for var, act in CULT_ACTS:
        codes = cult_codes(go[var])
        if codes.notna().sum() == 0:
            ctx.empty(var)
            continue
        text = (f"Cultural activities: how many times in the last twelve months have you {act}? (Eurobarometer cultural access "
                "and participation battery, harmonised by the depositor)")
        note = None
        if var == "visit_library":
            note = ("The deposit merges source labels 'public library' and 'library or archive' (retroharmonize search terms in "
                    "the deposit PDF); the exact wording of each wave is not in the deposit.")
        ctx.add(var, codes, text, CULT_OPTS, qtype="ordinal", label=var,
                text_source="deposit documentation (Harmonized_Cultural_Access_And_Participation_Dataset.pdf: harmonised "
                            "visiting-frequency concept, 'never in the last twelve months' / 1-2 / 3-5 / more than 5 times); "
                            "original EB questionnaire wording not in the deposit")
        if note:
            ctx.notes.append(f"{var}: {note}")
    notes = [f"Source file rows for {year}: {n_raw} ({za}); dropped {dropped_age} respondents aged <17.",
             "Country = country_code (deposit: first two letters of the GESIS sample code; DE-W/DE-E -> DE, GB-GBN/GB-NIR -> GB).",
             "Weight = w (deposit: w1, or w_de / w_uk for the united German / UK samples), normalised to mean 1 within country.",
             "age_band from age_exact; gender and urban are not in the deposit (empty).",
             "edu3 from age_education (age when full-time education ended; depositor recoded 'no full-time education' to 14): "
             "<=15 low, 16-19 medium, 20+ high; still studying (is_student = 1) and DK / refusal empty.",
             f"wave {wave}: {wave_basis}.",
             "Items = the documented numeric frequency variables visit_* (0 = never, 1.5 = 1-2 times, 3.5 = 3-5 times, 6 = more "
             "than 5 times; NA = declined / inap.) recoded to ordinal codes 1-4; 'been to a concert' was not asked in 2017.",
             "Item text: the deposit holds harmonised concepts, not the questionnaire; the original EB question wording is not "
             "reproduced (stemMissing = true)."]
    meta = {"title": f"EB cultural access and participation {year} ({ebtitle}) — harmonised file", "family": "eb",
            "source": f"Harmonized Cultural Access & Participation Dataset (D. Antal, Zenodo 10.5281/zenodo.5781672), rows of "
                      f"{ebtitle}, GESIS {za}",
            "doi_or_url": "https://doi.org/10.5281/zenodo.5781672", "licence": "CC BY 4.0 (Zenodo record); underlying "
            "Eurobarometer data (c) European Union / GESIS terms", "commercialUse": "unclear",
            "licenceNotes": "Zenodo record CC BY 4.0 (manifest: commercial use yes with attribution); set to 'unclear' because "
                            "the underlying EB microdata are GESIS-distributed (project rule for EB copies).",
            "aiTraining": "unclear", "mode": "face-to-face (Special Eurobarometer)",
            "sampling": "Eurobarometer multi-stage random (probability) sampling of residents aged 15+; national weight",
            "overlaps": [f"Respondents of {ebtitle}; no overlap with any other file in the lake (no other copy of this wave)."]}
    info = {"meta": meta, "countryWaves": cw, "waveApprox": True, "weightVar": "w (w1; w_de for DE, w_uk for GB)",
            "weightFilled": filled, "notes": notes, "function": "h_cult",
            "sources": G.source_entries(root, man, [(path, "data (all three waves)"), (pdf, "documentation")]),
            "rowFilters": {"rowsInFile": n_raw, "droppedAgeUnder17": dropped_age, "lockedGreekRows": n_gr},
            "demoNotes": {"age_band": "age_exact", "gender": None, "edu3": "age_education + is_student", "urban": None},
            "countryMapping": "country_code used as is (ISO2)", "stemOf": None, "siblingSplits": False}
    items, entry = G.finalize(root, sid, ctx, demo_o, info)
    items = mark_stem_missing(root, sid, items)
    probs = G.validate(root, sid, items, entry)
    n_open = len(demo_o)
    if n_gr:
        gg = g[lock].reset_index(drop=True)
        demo_g = demo[lock].reset_index(drop=True)
        demo_g["weight"], _ = G.norm_weight_by_country(w[lock], demo_g.country)
        write_locked(root, sid, items, demo_g, wave, n_open,
                     lambda var, allowed: cult_codes(gg[var]).where(lambda s: s.isin(allowed), None))
    else:
        remove_stale_locked(root, sid)
    entry = patch_outputs(root, sid, entry, func="h_cult", n_locked=n_gr, wave_gr=wave)
    if sid == CULT_SIDS[-1]:
        _CULT_CACHE.clear()
    return items, entry, probs


def mark_stem_missing(root, sid, items):
    p = os.path.join(root, OUT_REL, "items", f"{sid}.json")
    for it in items:
        it["stemMissing"] = True
    G.write_json_atomic(p, items, indent=0)
    pp = os.path.join(root, OUT_REL, "provenance", f"{sid}.json")
    prov = json.load(open(pp, encoding="utf-8"))
    prov["stemMissing"] = [it["id"] for it in items]
    G.write_json_atomic(pp, prov)
    return items


# ---------------------------------------------------------------------------------------------- stacked EB 2013-2017

STACK_SLUG = "eb_stacked_2005_2016_harvard_VTGQ9Q"
STACK_DEMO = ["survey_id", "gesis_id", "country", "edatevar", "weight_national", "weight_EU", "age", "gender", "education_age",
              "urbanization"]
STACK_DERIVED = {"Solve_EU_country", "Issue_EU_country", "wrongdirection_eu_country"}
STACK_ADMIN = {"date_of_interview": "interview date (value labels valid for one wave only)"}
STACK_TITLES = {793: "79.3 (May 2013)", 801: "80.1 (November 2013)", 812: "81.2 (March 2014)", 823: "82.3 (November 2014)",
                833: "83.3 (May 2015)", 843: "84.3 (November 2015)", 852: "85.2 (May 2016)", 862: "86.2 (November 2016)",
                873: "87.3 (May 2017)", 883: "88.3 (November 2017)"}
NAME_ISO = {"Germany": "DE", "France": "FR", "Italy": "IT", "Belgium": "BE", "Netherlands": "NL", "Luxembourg": "LU",
            "Denmark": "DK", "Ireland": "IE", "United Kingdom": "GB", "Greece": "GR", "Spain": "ES", "Portugal": "PT",
            "Finland": "FI", "Sweden": "SE", "Austria": "AT", "Cyprus": "CY", "Czech Republic": "CZ", "Estonia": "EE",
            "Hungary": "HU", "Latvia": "LV", "Lithuania": "LT", "Malta": "MT", "Poland": "PL", "Slovakia": "SK", "Slovenia": "SI",
            "Bulgaria": "BG", "Romania": "RO", "Croatia": "HR"}
_STACK_CACHE = {}


def _stack_load(root, mans):
    if "g" in _STACK_CACHE:
        return _STACK_CACHE
    path = os.path.join(root, P5RAW, STACK_SLUG, "FINAL_DATAFILE.dta")
    _, m = read_dta_safe(path, metadataonly=True)
    labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
    cols = list(m.column_names)
    excl, cand = [], []
    for v in cols:
        lab = P4.clean(labs.get(v) or "")
        if v in STACK_DEMO or v in ("weight_national", "weight_EU", "gesis_id", "survey_id"):
            excl.append((v, "demographic / admin / weight / wave (used for the demographic columns)"))
        elif v in STACK_ADMIN:
            excl.append((v, STACK_ADMIN[v]))
        elif v in STACK_DERIVED:
            excl.append((v, "depositor-derived analysis variable (combination of other items)"))
        elif not lab:
            excl.append((v, "depositor-created analysis variable without variable label (index / dummy / standardised / "
                            "contextual / lagged variable)"))
        elif re.match(r"^_I", v) or re.match(r"^(country|edatevar|date|datevar)==", lab):
            excl.append((v, "estimation dummy"))
        elif p5_sensitive(v, lab):
            excl.append((v, SENS_REASON))
        elif P4.generic_skip(v, lab):
            excl.append((v, P4.generic_skip(v, lab)))
        elif re.search(r"\b2ND\b", labs.get(v) or "") and "(SUM)" not in (labs.get(v) or "").upper():
            excl.append((v, "partial multi-mention (2nd news source only)"))
        else:
            cand.append(v)
    df, _ = read_dta_safe(path, usecols=STACK_DEMO + cand)
    n_raw = len(df)
    cl = vls.get("country", {})
    country = pd.to_numeric(df.country, errors="coerce").map(lambda v: NAME_ISO.get(cl.get(v)) if v == v else None)
    if country.isna().any():
        raise ValueError("stacked EB: unmapped country codes")
    n_gr = int((country == "GR").sum())
    if n_gr:
        raise RuntimeError(f"stacked EB: {n_gr} Greek rows found in a file documented without Greece; stop (would need locking)")
    sid_wave = pd.to_numeric(df.survey_id, errors="coerce").astype("Int64")
    wave_rows = sid_wave.value_counts().to_dict()
    age = pd.to_numeric(df.age, errors="coerce")
    age_lab = vls.get("age", {})
    age_na = [float(k) for k, v in age_lab.items() if isinstance(k, (int, float)) and re.search(r"refus|dk", str(v), re.I)]
    age = age.where(~age.isin(age_na))
    _STACK_CACHE.update({"path": path, "labs": labs, "vls": vls, "excl": excl, "cand": cand, "df": df, "country": country,
                         "wave": sid_wave, "age": age, "n_raw": n_raw, "waveRows": {int(k): int(v) for k, v in wave_rows.items()},
                         "age_na": age_na, "g": True})
    return _STACK_CACHE


def h_stack(root, sid, mans):
    st = _stack_load(root, mans)
    wave_no = int(sid[3:])
    man = mans.get(STACK_SLUG, {})
    df, labs, vls = st["df"], st["labs"], st["vls"]
    sel = (st["wave"] == wave_no).fillna(False).to_numpy(dtype=bool)
    age_all = st["age"][sel].reset_index(drop=True)
    keep = ~(age_all < 17)
    dropped_age = int((~keep).sum())
    g = df[sel].reset_index(drop=True)[keep.values].reset_index(drop=True)
    country = st["country"][sel].reset_index(drop=True)[keep.values].reset_index(drop=True)
    age = age_all[keep.values].reset_index(drop=True)
    G.iso_check(set(country.unique()))
    demo = pd.DataFrame({"country": country})
    demo["weight"], filled = G.norm_weight_by_country(g.weight_EU, country)
    demo["age_band"] = age.map(P4.age_band)
    demo["gender"] = pd.to_numeric(g.gender, errors="coerce").map({1.0: "male", 2.0: "female"})
    demo["edu3"] = pd.to_numeric(g.education_age, errors="coerce").map(P4.edu3_from_age_finished)
    demo["urban"] = pd.to_numeric(g.urbanization, errors="coerce").map({1.0: "rural", 2.0: "urban", 3.0: "urban"})
    d = pd.to_datetime(g.edatevar.astype(str), errors="coerce")
    ym = d.dt.strftime("%Y-%m").where(d.notna(), None)
    cw = G.waves_by_country(ym.values, country)
    if any(not x for x in cw.values()):
        raise ValueError(f"{sid}: no wave date")
    ctx = G.GCtx(sid, STACK_SLUG)
    for v, r in st["excl"]:
        ctx.exclude(v, r)
    for var in st["cand"]:
        lab = P4.clean(labs.get(var) or "")
        P4.add_labelled(ctx, var, g[var], lab, vls.get(var) or {}, text=lab,
                        text_source="variable label in the depositor's stacked file (GESIS label; no questionnaire in deposit)")
    za = int(pd.to_numeric(g.gesis_id, errors="coerce").dropna().iloc[0]) if len(g) else None
    title = f"Standard Eurobarometer {STACK_TITLES[wave_no]} — 8-country subset of the stacked EB file VTGQ9Q"
    notes = [f"Stacked file rows: {st['n_raw']} in 10 waves; this surveyId = survey_id {wave_no} (GESIS ZA{za}), "
             f"{st['waveRows'].get(wave_no)} rows; dropped {dropped_age} respondents aged <17. Waves 84.3 "
             f"({st['waveRows'].get(843)} rows) and 86.2 ({st['waveRows'].get(862)} rows) are NOT harmonised: same respondents "
             "as the held eb843 / eb862.",
             "Country from 'country' value labels (country names) -> ISO2; 8 countries (DE, DK, ES, FR, GB, IE, IT, NL), no Greece.",
             "Weight = weight_EU (EU28 weight = national weight x sample-level population factor), normalised to mean 1 within "
             "country: proportional to weight_national within single-sample countries and restores the united-country "
             "proportions for DE (DE-W + DE-E) and GB (GB-GBN + GB-NIR), which the stacked file merges without a sample flag.",
             f"age from 'age' (codes labelled refusal/DK {st['age_na']} -> unknown); gender from 'gender'; edu3 from education_age "
             "(<=15 or none low, 16-19 medium, 20+ high, still studying / refusal empty); urban from urbanization (rural area "
             "or village = rural, towns = urban).",
             "wave = month of the wave-level date edatevar (start of fieldwork of the wave; same for all countries; waveApprox).",
             "Items = the GESIS-labelled EB variables of the stacked file; depositor-created analysis variables (indices, dummies, "
             "standardised / contextual / lagged variables, Solve_EU_country, Issue_EU_country, wrongdirection_eu_country) "
             "excluded.",
             "Label check: the depositor's names voice_count_country / voice_count_eu carry the GESIS labels 'MY VOICE COUNTS - IN "
             "THE EU' / '... IN (OUR COUNTRY)' respectively; item text follows the label (the variable names look swapped)."]
    meta = {"title": title, "family": "eb",
            "source": f"Stacked Eurobarometer subset (Harvard Dataverse doi:10.7910/DVN/VTGQ9Q, replication data 'The Battle for "
                      f"the Public Perception'), rows of EB {STACK_TITLES[wave_no]} (GESIS ZA{za})",
            "doi_or_url": "https://doi.org/10.7910/DVN/VTGQ9Q", "licence": "Harvard Dataverse deposit CC0 1.0 (derived from "
            f"GESIS Eurobarometer ZA{za}); underlying data (c) European Union / GESIS terms not verified",
            "commercialUse": "unclear", "aiTraining": "unclear", "mode": "face-to-face CAPI (Standard Eurobarometer)",
            "sampling": "Standard Eurobarometer multi-stage random (probability) sampling of residents aged 15+",
            "overlaps": ["Separate respondents from the other stacked waves and from all held / new EB waves (held 84.3 / 86.2 "
                         "dropped from this file)."]}
    info = {"meta": meta, "countryWaves": cw, "waveApprox": True, "weightVar": "weight_EU (within-country normalised; see notes)",
            "weightFilled": filled, "notes": notes, "function": "h_stack",
            "sources": G.source_entries(root, man, [(st["path"], "data (stacked, all waves)")]),
            "rowFilters": {"rowsInFile": st["n_raw"], "rowsThisWave": st["waveRows"].get(wave_no), "droppedAgeUnder17": dropped_age,
                           "droppedHeldWaves": {f"{k} ({v})": st["waveRows"].get(k) for k, v in STACK_DROPPED.items()}},
            "demoNotes": {"age_band": "age", "gender": "gender", "edu3": "education_age", "urban": "urbanization"},
            "countryMapping": {str(k): NAME_ISO.get(v) for k, v in vls.get("country", {}).items()}, "stemOf": None,
            "overlapCheck": {"heldWavesDropped": {STACK_DROPPED[k]: st["waveRows"].get(k) for k in STACK_DROPPED}}}
    items, entry = G.finalize(root, sid, ctx, demo, info)
    probs = G.validate(root, sid, items, entry)
    remove_stale_locked(root, sid)
    entry = patch_outputs(root, sid, entry, func="h_stack")
    if sid == STACK_SIDS[-1]:
        _STACK_CACHE.clear()
    gc.collect()
    return items, entry, probs


# ---------------------------------------------------------------------------------------------- ESS rounds 3, 6-9

ESS_SLUG = "ess_r3_r6_r7_r8_r9_no_greece_harvard_2DPD79"
ESS_P5 = {"ess3": ("ESS3e03.dta", "doi:10.21338/NSD-ESS3-2006"), "ess6": ("ESS6e02.dta", "doi:10.21338/NSD-ESS6-2012"),
          "ess7": ("ESS7e02.dta", "doi:10.21338/NSD-ESS7-2014"), "ess8": ("ESS8e02.dta", "doi:10.21338/NSD-ESS8-2016"),
          "ess9": ("ESS9e02.dta", "doi:10.21338/NSD-ESS9-2018")}


def h_p5_ess(root, sid, mans):
    fn, doi = ESS_P5[sid]
    path = os.path.join(root, P5RAW, ESS_SLUG, fn)
    cn, _ = read_dta_safe(path, usecols=["cntry"])
    n_gr = int((cn.cntry.astype(str).str.strip().str.upper() == "GR").sum())
    if n_gr:
        raise RuntimeError(f"{sid}: {n_gr} Greek rows in a file documented without Greece; stop (would need locking)")
    del cn
    ed = first_value(path, "edition") or fn[5:7]
    G.ESS_SPECS[sid] = {"path": (P5RAW, ESS_SLUG, fn), "qdoc": None, "slug": ESS_SLUG}
    G.SURVEY_META[sid] = G.ess_meta(int(sid[3:]), f"edition {ed}", f"{doi} (edition {ed})", "doi:10.7910/DVN/2DPD79",
                                    G.ESS_MODE15,
                                    ["Distinct respondents from the other ESS rounds (repeated cross-sections). Greece did not "
                                     "take part in this round (no Greek rows)."])
    items, entry = G.h_ess(root, sid, mans)
    probs = G.validate(root, sid, items, entry)
    remove_stale_locked(root, sid)
    extra = []
    if ENCODING_FALLBACK.get(fn):
        extra.append(f"{fn} contains invalid UTF-8 byte sequences (party-name value labels truncated inside a multi-byte "
                     "character); read as latin-1 and repaired to UTF-8 (invalid bytes -> U+FFFD). Affects only labels of "
                     "country-specific party variables, which are not items.")
    entry = patch_outputs(root, sid, entry, func="h_ess (harmonize_global_eu, registered for this round) via h_p5_ess",
                          extra_notes=extra)
    gc.collect()
    return items, entry, probs


# ---------------------------------------------------------------------------------------------- driver

HANDLERS = {**{s: h_p5_eb for s in EB_SIDS}, **{s: h_cult for s in CULT_SIDS}, **{s: h_stack for s in STACK_SIDS},
            **{s: h_p5_ess for s in ESS_SIDS}}


def update_surveys(root, entries):
    path = os.path.join(root, OUT_REL, SURVEYS_FILE)
    os.makedirs(os.path.join(root, CACHE_REL), exist_ok=True)
    with open(os.path.join(root, CACHE_REL, SURVEYS_FILE + ".lock"), "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        try:
            old = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else []
        except ValueError:
            old = []
        by = {e["surveyId"]: e for e in old}
        for e in entries:
            by[e["surveyId"]] = e
        order = {s: i for i, s in enumerate(SURVEY_IDS)}
        G.write_json_atomic(path, sorted(by.values(), key=lambda e: (order.get(e["surveyId"], 999), e["surveyId"])))
        fcntl.flock(lk, fcntl.LOCK_UN)
    return path


def verify_locking(root, sid, entry):
    """Counts only: no GR row in resp; locked file present (with the documented row count and resp's header) iff locked."""
    probs = []
    rp = os.path.join(root, OUT_REL, "resp", f"{sid}.csv.gz")
    n_gr_resp = 0
    header = None
    for ch in pd.read_csv(rp, dtype=str, keep_default_na=False, usecols=["country"], chunksize=50000):
        n_gr_resp += int((ch.country == "GR").sum())
    header = list(pd.read_csv(rp, nrows=0).columns)
    if n_gr_resp:
        probs.append(f"{sid}: {n_gr_resp} GR rows in resp")
    lp = os.path.join(root, OUT_REL, "locked", f"{sid}.GR.csv.gz")
    if sid in LOCKED:
        if not os.path.exists(lp):
            probs.append(f"{sid}: locked file missing")
        else:
            if list(pd.read_csv(lp, nrows=0).columns) != header:
                probs.append(f"{sid}: locked columns differ from resp")
            n = sum(len(ch) for ch in pd.read_csv(lp, dtype=str, usecols=["rid"], chunksize=50000))
            if n != entry["nRows"]["locked"] or n == 0:
                probs.append(f"{sid}: locked rows {n} != {entry['nRows']['locked']}")
    elif os.path.exists(lp):
        probs.append(f"{sid}: unexpected locked file")
    return probs, n_gr_resp


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", default=".")
    ap.add_argument("--only", action="append", help="surveyId to (re)build; repeatable. Other surveys' outputs are kept.")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    ids = SURVEY_IDS
    if a.only:
        bad = [s for s in a.only if s not in HANDLERS]
        if bad:
            raise SystemExit(f"unknown surveyId(s): {bad}; known: {SURVEY_IDS}")
        ids = [s for s in SURVEY_IDS if s in a.only]
    os.makedirs(os.path.join(root, OUT_REL), exist_ok=True)
    mans = load_p5_manifest(root)
    all_problems = []
    for sid in ids:
        t0 = time.time()
        items, entry, probs = HANDLERS[sid](root, sid, mans)
        lp, _ = verify_locking(root, sid, entry)
        probs = probs + lp
        entry["build"] = {"seconds": round(time.time() - t0, 1), "peakRssMB": round(G.peak_mb())}
        update_surveys(root, [entry])
        all_problems += probs
        gr = entry["countries"].get("GR", {}).get("n", 0)
        print(f"{sid}: countries={entry['nCountries']} n={entry['nTotal']} (resp={entry['nRows']['resp']}, "
              f"locked GR={entry['nRows']['locked']}) GRrole={entry['greekRole']} items={entry['nItems']} "
              f"subsample={entry['nItemsSubsample']} political={entry['nItemsExcludedFromTransfer']} "
              f"weight={entry['weightVar'][:50]!r} {time.time() - t0:.0f}s peakRSS={G.peak_mb():.0f}MB"
              + (f" PROBLEMS={len(probs)}" if probs else " validation OK") + (" GR-in-file" if gr and sid not in LOCKED else ""))
        gc.collect()
    print(f"{SURVEYS_FILE} updated ({len(ids)} entries written)")
    if all_problems:
        print("validation problems:\n  " + "\n  ".join(all_problems[:80]))
        raise SystemExit(1)
    print("validation: OK")


if __name__ == "__main__":
    main()
