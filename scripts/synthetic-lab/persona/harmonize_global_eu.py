"""
Phase 5 GLOBAL BEHAVIOUR EVIDENCE LAKE — European families: harmonise ALL countries of the multi-country ESS,
Eurobarometer and EFSA-Eurobarometer microdata files into the format of docs/synthetic-lab/GLOBAL_LAKE_SPEC.md.

    python3 -I scripts/synthetic-lab/persona/harmonize_global_eu.py --root . [--only <surveyId> ...]

surveyIds: ess1 ess2 ess4 ess5 ess10 ess11 eb843 eb862 eb884 eb931 eb943 eb1033 fl506 efsa2019 efsa2022 efsa2025

Writes ONLY (private, gitignored) under .synthetic-lab-data/global-behavior-evidence/v1/:
  resp/<surveyId>.csv.gz        rid, country, wave, weight, age_band, gender, edu3, urban, "<surveyId>::<var>" ...
  items/<surveyId>.json         item list (same item set for all countries)
  provenance/<surveyId>.json    source files + sha256, harmoniser, row filters, exclusions with reasons
  surveys.eu.json               one entry per surveyId, read-modify-write under a file lock (entries of other
                                surveyIds are preserved); the caller merges it into surveys.json
and a conversion cache .synthetic-lab-data/global-behavior-evidence/cache/eb943_rawdata.csv.gz (the EB 94.3 xlsx
'Rawdata' sheet streamed to CSV; rebuilt when the source sha256 changes).

Item logic is REUSED from harmonize_p4_lake.py (imported, not modified): add_labelled / labelled_codes (DK / refusal /
not-applicable -> empty, end-labelled numeric scales completed, multi-mention groups as binary items), skip lists
(ESS_SKIP, EB_SKIP, CSV_EB_SKIP, generic_skip incl. SENSITIVE), ESS questionnaire stems, GESIS questionnaire parser,
codebook parsers, battery_flags (stemMissing). The per-file decisions documented in
.synthetic-lab-data/persona/phase4/lake_files.json (partial 'And then?' mentions, merged 'T' totals, truncated Flash
labels, producer recodes) are applied identically, but to every country.

Global rules (differences from the Greek phase-4 lake):
  * all countries; country = ISO 3166-1 alpha-2 (GB for the UK, GR for Greece, XK for Kosovo = EU/ISO user-assigned
    code); DE-W + DE-E -> DE and GB-GBN + GB-NIR -> GB with the producer's united-country weight; Turkish Cypriot
    Community samples are dropped (no ISO country);
  * weight = producer national weight normalised to mean 1 within country (ESS pspwght; EB w1, or the united weight
    w3 / w4 / weight_germany / Weight_Germany for split DE / UK samples; 1 when the file has none);
  * respondents with a known exact age < 17 dropped; rows with unknown age kept;
  * items: 2-11 substantive options, >= 300 valid answers overall, >= 2 distinct codes, and >= 30 valid answers in at
    least 2 countries (country-specific variables such as national party lists are excluded);
  * split ballots: split = "subsample" (ESS test items; items answered by only some groups of an EB split variable;
    disjoint question versions a/b/c);
  * political protection (prereg. section 2): items mentioning vote / party / candidate / party leader get
    excludedFromTransfer = true (kept in resp).

DATA HYGIENE: no answer distributions, correlations or crosstabs are computed or printed; only row, item, country and
valid-answer counts. Source files are read as data only (pyreadstat / pandas / openpyxl / pdftotext). Nothing shipped
in the downloads is executed. No Greek row in this scope is locked (all Greek rows are development data).
"""
import argparse
import csv
import datetime as dt
import fcntl
import gc
import gzip
import hashlib
import json
import os
import re
import resource
import subprocess
import sys
import time

import numpy as np
import pandas as pd
import pyreadstat

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:  # python -I does not put the script directory on sys.path
    sys.path.insert(0, HERE)
import harmonize_p4_lake as P4  # noqa: E402  (reused, not modified)

OUT_REL = os.path.join(".synthetic-lab-data", "global-behavior-evidence", "v1")
CACHE_REL = os.path.join(".synthetic-lab-data", "global-behavior-evidence", "cache")
P4RAW = os.path.join(".synthetic-lab-data", "raw", "phase4")
SPRINT = os.path.join(".synthetic-lab-data", "raw", "sprint", "microdata")
SCRIPT_REL = os.path.join("scripts", "synthetic-lab", "persona", "harmonize_global_eu.py")
MIN_N = 300
MIN_N_COUNTRY = 30
DEMO_COLS = ["rid", "country", "wave", "weight", "age_band", "gender", "edu3", "urban"]
AGE_BAND_SET = {b for _, _, b in P4.AGE_BANDS}
SURVEY_IDS = ["ess1", "ess2", "ess4", "ess5", "ess10", "ess11", "eb843", "eb862", "eb884", "eb931", "eb943", "eb1033",
              "fl506", "efsa2019", "efsa2022", "efsa2025"]
INCLUSION_RULE = ("All substantive categorical/ordinal variables with 2-11 substantive options (after removing DK / refused / "
                  "no answer / not applicable), >=300 valid answers over all countries, >=2 distinct codes, and >=30 valid "
                  "answers in at least 2 countries; wording from the variable label, codebook or questionnaire in the deposit. "
                  "Excluded: demographics, IDs, admin/paradata, dates, weights, open text, producer-derived indices/recodes/"
                  "scores/nets/totals, coded open-ended answers, partial multi-mention variables ('And then?'), sensitive "
                  "(GDPR art. 9) variables, items whose option meanings are undocumented, country-specific variables.")

ISO2 = set("""AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE
GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP
KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF
NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN
SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA
ZM ZW""".split())
USER_ASSIGNED = {"XK"}  # Kosovo: ISO 3166 user-assigned code used by the EU, Eurostat and ESS

# ---------------------------------------------------------------------------------------------- political protection
POL_TEXT = re.compile(
    r"\bvot(e|es|ed|ing|er|ers)\b|\bballot\b|(?<!third )(?<!third-)\bpart(y|ies)\b|(?<!\()\bcandidat(e|es|ure)\b(?!\s+countr)|"
    r"\b(party|political|opposition) leaders?\b|\bleaders? of (the )?(party|parties|opposition)\b|"
    r"\bκομμ|\bψηφ|\bυποψηφ|\bαρχηγ", re.I)
POL_VAR = re.compile(r"^(vote|prtv\w*|prtcl\w*|prtdgcl|clsprty|mmbprty|prty\w*|wrkprty|donprty)$")
POL_REASON = ("political protection (PHASE5_PREREGISTRATION section 2, automatic text filter): wording mentions vote / "
              "party / candidate / party leader; kept in resp but not transferred across countries")


def political(var, *texts):
    t = " ".join(x or "" for x in texts)
    return bool(POL_VAR.match(var.lower()) or POL_TEXT.search(t) or POL_TEXT.search(P4.norm(t)))


# GDPR art. 9 additions for the newer ESS rounds (own health conditions / treatments / mental-health symptoms / gender
# identity / own ethnic-group feeling); P4.SENSITIVE (via generic_skip) is applied as well.
SENS_EXTRA = re.compile(r"health problems?(, hampered)?, last 12 month|have or had any health problems|cancer|treatments used for own health|"
                        r"discussed health|medical consultation or treatment|unfairly treated when visiting a doctor|felt depressed|"
                        r"felt everything did as effort|sleep was restless|felt sad|non-binary gender|how (masculine|feminine) respondent|"
                        r"respondent had covid|anyone living with respondent had covid|same race or ethnic group as most people")
ESS_SENS_VARS = re.compile(r"^(hltp\w+|hltprca|cancfre|trhlt\w+|dshlt\w+|medtr\w+|trmed\w+|fltdpr|flteeff|slprl|fltsd|nobingnd|"
                           r"mascfel|femifel|respc19\w*|reshhc19|symtc19|symtnc19|vacc19|feethngr)$")
SENS_REASON = ("sensitive (GDPR art. 9: own health condition / infection / vaccination / treatment / mental-health symptom / "
               "gender identity / ethnicity)")


def sensitive_extra(var, lab):
    return bool(ESS_SENS_VARS.match(var.lower()) or SENS_EXTRA.search(P4.norm(lab)))


# ---------------------------------------------------------------------------------------------- small helpers

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def peak_mb():
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0


def write_json_atomic(path, obj, indent=1):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=indent)
    os.replace(tmp, path)


def norm_weight_by_country(w, country):
    """Producer weight -> mean 1 within each country; missing / non-positive weights get the country mean (before
    normalisation); a country without any usable weight gets 1."""
    w = pd.to_numeric(pd.Series(w).reset_index(drop=True), errors="coerce").astype(float)
    w = w.where(w > 0)
    c = pd.Series(country).reset_index(drop=True)
    out = pd.Series(1.0, index=w.index)
    filled = {}
    for k, idx in c.groupby(c).groups.items():
        wc = w.loc[idx]
        if wc.notna().any():
            filled[k] = int(wc.isna().sum())
            wc = wc.fillna(wc.mean())
            out.loc[idx] = wc / wc.mean()
        else:
            filled[k] = len(idx)
    return out.round(6).values, {k: v for k, v in filled.items() if v}


def waves_by_country(ym, country):
    s = pd.DataFrame({"ym": pd.Series(ym).reset_index(drop=True).values, "c": pd.Series(country).reset_index(drop=True).values})
    return {k: P4.earliest_month(grp.ym.tolist()) for k, grp in s.groupby("c")}


def split_var_subsample(valid, country, S):
    """True if, within the countries where the item has answers, some group of split variable S (>=10% of rows) has no
    valid answers at all while another group has >=30% valid answers (item administered to only some split groups)."""
    valid = np.asarray(valid, dtype=bool)
    c = np.asarray(country)
    asked_c = set(pd.Series(c[valid]).unique())
    sel = np.isin(c, list(asked_c))
    s = pd.to_numeric(pd.Series(S), errors="coerce").values[sel]
    v = valid[sel]
    ok = ~np.isnan(s)
    if ok.sum() == 0:
        return False
    s, v = s[ok], v[ok]
    rates = []
    for val in np.unique(s):
        m = s == val
        if m.mean() >= 0.10:
            rates.append(v[m].mean())
    return len(rates) >= 2 and min(rates) <= 0.005 and max(rates) >= 0.30


SIB_RX = re.compile(r"^(q[a-z]{0,3}\d+)([a-f])((?:[._]\w+)?)$", re.I)


def sibling_splits(items, country, stem_of=None):
    """Question versions a/b/c (same question number and sub-item suffix) answered by disjoint respondent groups whose
    sizes are ~1/k of every country's sample = split-ballot versions. Returns {var: reason}."""
    c = np.asarray(country)
    groups = {}
    for it in items:
        m = SIB_RX.match(it["var"])
        if m:
            groups.setdefault((m.group(1).lower(), m.group(3).lower()), {}).setdefault(m.group(2).lower(), []).append(it)
    out = {}
    cn = pd.Series(c).value_counts()
    for (base, suf), letters in groups.items():
        if len(letters) < 2:
            continue
        k = len(letters)
        masks = {L: np.logical_or.reduce([it["validMask"] for it in its]) for L, its in letters.items()}
        keys = sorted(masks)
        disjoint = all((masks[a] & masks[b]).sum() <= 0.02 * max(1, min(masks[a].sum(), masks[b].sum()))
                       for i, a in enumerate(keys) for b in keys[i + 1:])
        if not disjoint:
            continue
        union = np.logical_or.reduce(list(masks.values()))
        asked_c = [x for x in pd.Series(c[union]).unique()]
        shares = {L: pd.Series(masks[L]).groupby(c).sum().reindex(asked_c) / cn.reindex(asked_c) for L in keys}

        def frac_within(lo, hi):
            return min(float(((shares[L] >= lo / k) & (shares[L] <= hi / k)).mean()) for L in keys)
        same_stem = False
        if stem_of:
            stems = {stem_of(it) for its in letters.values() for it in its}
            same_stem = len(stems) == 1 and bool(next(iter(stems)))
        if (same_stem and frac_within(0.5, 1.5) >= 0.75) or frac_within(0.75, 1.25) >= 0.9:
            for its in letters.values():
                for it in its:
                    out[it["var"]] = (f"split-ballot version {base}{{{','.join(keys)}}}{suf}: versions answered by disjoint "
                                      f"random subsamples (~1/{k} of each country's sample)")
    return out


class GCtx(P4.Ctx):
    """P4.Ctx with categorical code storage (memory) and per-item split / asked bookkeeping."""

    def __init__(self, sid, slug):
        super().__init__(sid, slug)
        self.split = {}

    def add(self, var, codes, text, options, **kw):
        super().add(var, pd.Series(codes).reset_index(drop=True).astype("category"), text, options, **kw)


def iso_check(codes):
    bad = sorted({c for c in codes if c not in ISO2 and c not in USER_ASSIGNED})
    if bad:
        raise ValueError(f"non-ISO2 country codes {bad}")


# ---------------------------------------------------------------------------------------------- finalisation

def finalize(root, sid, ctx, demo, info):
    """demo: DataFrame with country, weight, age_band, gender, edu3, urban (row order = item code order).
    info: survey-level metadata (see SURVEY_META) + countryWaves, notes, waveApprox, stemOf, sources, rowFilters."""
    demo = demo.reset_index(drop=True)
    n = len(demo)
    country = demo["country"].values
    kept = []
    for it in ctx.items:
        codes = it["codes"].reset_index(drop=True)
        if len(codes) != n:
            raise ValueError(f"{sid}::{it['var']}: length mismatch")
        valid_codes = {c for c, _ in it["options"]}
        bad = sorted({str(x) for x in codes.dropna().unique()} - valid_codes)
        if bad:
            raise ValueError(f"{sid}::{it['var']}: codes outside options {bad}")
        k = len(it["options"])
        if not 2 <= k <= 11:
            ctx.exclude(it["var"], f"{k} substantive options (rule: 2-11)")
            continue
        vm = codes.notna().values
        n_valid = int(vm.sum())
        if codes.dropna().nunique() < 2:
            ctx.exclude(it["var"], "fewer than 2 distinct answer codes observed over all countries (constant / routing artefact)")
            continue
        if n_valid < MIN_N:
            ctx.exclude(it["var"], f"{n_valid} valid answers over all countries (<{MIN_N})")
            continue
        per_c = pd.Series(vm).groupby(country).sum()
        n_ctry = int((per_c >= 1).sum())
        big = per_c[per_c >= MIN_N_COUNTRY]
        if len(big) < 2:
            where = sorted(per_c[per_c >= 1].index.tolist())
            ctx.exclude(it["var"], f"country-specific variable: valid answers in {where[:6]} only (needs >={MIN_N_COUNTRY} "
                                   "valid answers in >=2 countries; codes not comparable / not asked elsewhere)")
            continue
        it["codes"], it["nValid"], it["nCountries"], it["validMask"] = codes, n_valid, n_ctry, vm
        kept.append(it)
    if ctx.empties:
        ctx.excluded.append({"variable": f"{len(ctx.empties)} variables", "reason": "no answers at all in the file "
                             "(routing-only / empty variables)", "variables": ctx.empties})
    sib = sibling_splits(kept, country, info.get("stemOf")) if info.get("siblingSplits", True) else {}
    flags = P4.battery_flags(kept)
    items, cols = [], {}
    n_pol = 0
    for it, flag in zip(kept, flags):
        iid = f"{sid}::{it['var']}"
        split_reason = ctx.split.get(it["var"]) or sib.get(it["var"])
        pol = political(it["var"], it["text"], it.get("label"))
        n_pol += pol
        e = {"id": iid, "var": it["var"], "text": it["text"], "textLanguage": it.get("language") or "en",
             "options": [{"code": c, "label": l} for c, l in it["options"]], "type": it["type"],
             "stemMissing": bool(flag), "split": "subsample" if split_reason else "all",
             "excludedFromTransfer": bool(pol), "excludedReason": POL_REASON if pol else None,
             "nValid": it["nValid"], "nCountries": it["nCountries"], "textSource": it["textSource"]}
        if split_reason:
            e["splitReason"] = split_reason
        if it.get("label") and it["label"] != it["text"]:
            e["label"] = it["label"]
        if it.get("stem"):
            e["stemAdded"] = True
        if it.get("multi"):
            e["multiMention"] = True
        if it.get("nonsub"):
            e["nonsubCodes"] = it["nonsub"]
        items.append(e)
        cols[iid] = it["codes"]
    # resp
    cw = info["countryWaves"]
    demo = demo.copy()
    demo.insert(0, "rid", [f"{sid}-{i + 1}" for i in range(n)])
    demo["wave"] = demo["country"].map(cw)
    frame = pd.concat([demo[DEMO_COLS], pd.DataFrame(cols)], axis=1)
    out = os.path.join(root, OUT_REL)
    for d in ("resp", "items", "provenance"):
        os.makedirs(os.path.join(out, d), exist_ok=True)
    rp = os.path.join(out, "resp", f"{sid}.csv.gz")
    frame.to_csv(rp + ".tmp", index=False, compression="gzip")
    os.replace(rp + ".tmp", rp)
    write_json_atomic(os.path.join(out, "items", f"{sid}.json"), items, indent=0)
    # survey entry
    cn = demo["country"].value_counts()
    countries = {c: {"n": int(cn[c]), "wave": cw.get(c)} for c in sorted(cn.index)}
    waves = sorted(w for w in cw.values() if w)
    m = info["meta"]
    entry = {"surveyId": sid, "title": m["title"], "family": m["family"], "source": m["source"], "doi_or_url": m["doi_or_url"],
             "licence": m["licence"], "commercialUse": m["commercialUse"], "aiTraining": m.get("aiTraining", "unclear"),
             "wave": waves[0] if waves else None, "waveApprox": bool(info["waveApprox"]), "mode": m["mode"],
             "sampling": m["sampling"], "weightVar": info["weightVar"], "countries": countries, "nItems": len(items),
             "greekRole": "dev", "notes": info["notes"],
             "nTotal": int(n), "nCountries": len(countries), "textLanguage": "en",
             "nItemsExcludedFromTransfer": n_pol, "nItemsSubsample": sum(1 for e in items if e["split"] == "subsample"),
             "overlaps": m.get("overlaps", []), "harmoniser": SCRIPT_REL}
    if m.get("commercialUseConditions"):
        entry["commercialUseConditions"] = m["commercialUseConditions"]
    if m.get("licenceNotes"):
        entry["licenceNotes"] = m["licenceNotes"]
    prov = {"surveyId": sid, "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "harmoniser": {"script": SCRIPT_REL, "function": info["function"],
                           "command": f"python3 -I {SCRIPT_REL} --root . --only {sid}",
                           "reusedFrom": "scripts/synthetic-lab/persona/harmonize_p4_lake.py (imported helpers; per-file decisions "
                                         "of .synthetic-lab-data/persona/phase4/lake_files.json applied to all countries)"},
            "sources": info["sources"], "inclusionRule": INCLUSION_RULE, "rowFilters": info["rowFilters"],
            "weight": {"variable": info["weightVar"], "normalisation": "mean 1 within country",
                       "missingFilledWithCountryMean": info.get("weightFilled", {})},
            "demographics": info["demoNotes"], "countryMapping": info.get("countryMapping"),
            "splitBallot": {e["id"]: e["splitReason"] for e in items if e.get("splitReason")},
            "excludedFromTransfer": [e["id"] for e in items if e["excludedFromTransfer"]],
            "stemMissing": [e["id"] for e in items if e["stemMissing"]],
            "excluded": ctx.excluded, "notes": info["notes"] + ctx.notes}
    if info.get("overlapCheck"):
        prov["overlapCheck"] = info["overlapCheck"]
    write_json_atomic(os.path.join(out, "provenance", f"{sid}.json"), prov)
    return items, entry


def validate(root, sid, items, entry):
    """Counts-only validation of the written outputs (chunked read-back)."""
    problems = []
    path = os.path.join(root, OUT_REL, "resp", f"{sid}.csv.gz")
    ids = [it["id"] for it in items]
    if len(ids) != len(set(ids)):
        problems.append(f"{sid}: duplicate item ids")
    opts = {it["id"]: {o["code"] for o in it["options"]} for it in items}
    for it in items:
        if not 2 <= len(opts[it["id"]]) <= 11:
            problems.append(f"{it['id']}: {len(opts[it['id']])} options")
        if it["split"] not in ("all", "subsample") or not isinstance(it["excludedFromTransfer"], bool):
            problems.append(f"{it['id']}: bad split / excludedFromTransfer")
    seen_codes = {i: set() for i in ids}
    nvalid = {i: 0 for i in ids}
    wsum, wcnt = {}, {}
    rids = set()
    allowed = {"gender": {"male", "female"}, "edu3": {"low", "medium", "high"}, "urban": {"urban", "rural"}, "age_band": AGE_BAND_SET}
    header_ok = False
    for ch in pd.read_csv(path, dtype=str, keep_default_na=False, na_values=[""], chunksize=8000):
        if not header_ok:
            if list(ch.columns) != DEMO_COLS + ids:
                problems.append(f"{sid}: resp columns != DEMO_COLS + items order")
            header_ok = True
        for c, a in allowed.items():
            bad = set(ch[c].dropna().unique()) - a
            if bad:
                problems.append(f"{sid}: {c} values {sorted(bad)[:5]}")
        try:
            iso_check(set(ch.country.dropna().unique()))
        except ValueError as e:
            problems.append(f"{sid}: {e}")
        if ch.country.isna().any() or ch.wave.isna().any() or ch.weight.isna().any():
            problems.append(f"{sid}: missing country / wave / weight")
        if not ch.wave.dropna().str.fullmatch(r"\d{4}-\d{2}").all():
            problems.append(f"{sid}: wave not YYYY-MM")
        w = pd.to_numeric(ch.weight)
        for c, s in w.groupby(ch.country):
            wsum[c] = wsum.get(c, 0.0) + float(s.sum())
            wcnt[c] = wcnt.get(c, 0) + int(len(s))
        n0 = len(rids)
        rids.update(ch.rid)
        if len(rids) - n0 != len(ch):
            problems.append(f"{sid}: duplicate rid")
        for i in ids:
            col = ch[i].dropna()
            nvalid[i] += len(col)
            seen_codes[i].update(col.unique())
    for c in wsum:
        mean = wsum[c] / wcnt[c]
        if abs(mean - 1) > 1e-4:
            problems.append(f"{sid}: weight mean {mean:.6f} in {c}")
        if entry["countries"].get(c, {}).get("n") != wcnt[c]:
            problems.append(f"{sid}: n mismatch for {c}")
    if sum(wcnt.values()) != entry["nTotal"] or len(items) != entry["nItems"]:
        problems.append(f"{sid}: nTotal / nItems mismatch")
    for i in ids:
        bad = seen_codes[i] - opts[i]
        if bad:
            problems.append(f"{i}: codes {sorted(bad)[:5]} not in options")
        if nvalid[i] < MIN_N:
            problems.append(f"{i}: {nvalid[i]} valid answers")
    return problems


# ---------------------------------------------------------------------------------------------- survey metadata

ESS_LIC = ("CC BY-NC-SA 4.0 (ESS ERIC data licence, europeansocialsurvey.org/node/58; documentation CC BY-SA 4.0). This copy "
           "is redistributed inside a Harvard Dataverse replication deposit labelled CC0 1.0; the ESS terms govern.")
ESS_COND = ("ESS ERIC terms: commercial use permitted if (1) ESS ERIC is cited correctly ('Adapted from ESS Round X, edition Y'), "
            "(2) it is made clear the data are freely downloadable from the ESS Data Portal, (3) no affiliation with or "
            "endorsement by ESS ERIC is implied; ShareAlike applies to adapted data; ESS ERIC recommends not re-hosting datasets.")
ESS_SAMPLING = ("Strict random probability samples of persons aged 15+ resident in private households in each country "
                "(design weight dweight; post-stratification weight pspwght)")
EB_LIC = ("Eurobarometer (c) European Union / European Commission, archived and distributed by GESIS ({za}); third-party copy "
          "redistributed in a Harvard Dataverse replication deposit labelled CC0 1.0. The EC lists Eurobarometer datasets on "
          "data.europa.eu under CC BY 4.0; GESIS terms for redistributed copies not verified. Cite the original GESIS DOI.")
EB_SAMPLING = ("Standard Eurobarometer multi-stage random (probability) sampling of residents aged 15+ in each country/sample; "
               "national post-stratification weight w1 (united-country weights w3/w4 for the split DE / UK samples)")
EFSA_LIC = "CC BY 4.0 (Zenodo record deposited by the European Food Safety Authority, the commissioning body)"


def ess_meta(rnd, ed, doi, via, mode, overlaps):
    return {"title": f"European Social Survey Round {rnd} integrated file ({ed})", "family": "ess",
            "source": f"ESS ERIC, ESS Round {rnd} integrated file ({ed}); redistributed via Harvard Dataverse {via}",
            "doi_or_url": doi, "licence": ESS_LIC, "commercialUse": "yes", "commercialUseConditions": ESS_COND,
            "aiTraining": "unclear", "mode": mode, "sampling": ESS_SAMPLING, "overlaps": overlaps}


ESS_MODE15 = "Face-to-face interview (PAPI/CAPI) + supplementary self-completion questionnaire"
SURVEY_META = {
    "ess1": ess_meta(1, "edition 6.6", "doi:10.21338/NSD-ESS1-2002", "doi:10.7910/DVN/2DPD79", ESS_MODE15,
                     ["Distinct respondents from ess2/ess4/ess5 (repeated cross-sections). Greek rows identical to the Greek-only "
                      "phase-4 lake file 'ess1' (.synthetic-lab-data/persona/phase4)."]),
    "ess2": ess_meta(2, "edition 3.6", "doi:10.21338/NSD-ESS2-2004", "doi:10.7910/DVN/2DPD79", ESS_MODE15,
                     ["Distinct respondents from other ESS rounds. Greek rows also in phase-4 lake file 'ess2'."]),
    "ess4": ess_meta(4, "edition 4.5", "doi:10.21338/NSD-ESS4-2008", "doi:10.7910/DVN/2DPD79", ESS_MODE15,
                     ["Distinct respondents from other ESS rounds. Greek rows also in phase-4 lake file 'ess4'."]),
    "ess5": ess_meta(5, "edition 3.4", "doi:10.21338/NSD-ESS5-2010", "doi:10.7910/DVN/2DPD79", ESS_MODE15,
                     ["Distinct respondents from other ESS rounds. Greek rows also in phase-4 lake file 'ess5'."]),
    "ess10": ess_meta(10, "edition 2.1, face-to-face countries", "doi:10.7910/DVN/7QODL6 (ESS10 ed. 2.1)", "doi:10.7910/DVN/7QODL6",
                      "Face-to-face CAPI (video interviews in some cases; 'mode' variable). Only the face-to-face countries: the "
                      "ESS10 self-completion file (ESS10SC: AT, DE, ES, IL, LV, PL, RS, SE) is not part of this deposit.",
                      ["Distinct respondents from ess11. Greek rows also harmonised (Greek-only) as persona file 'ess10' by "
                       "scripts/synthetic-lab/persona/harmonize.py."]),
    "ess11": ess_meta(11, "edition 3.0", "doi:10.21338/ess11e03_0 (via doi:10.7910/DVN/CUT5RQ)", "doi:10.7910/DVN/CUT5RQ",
                      "Face-to-face CAPI",
                      ["Distinct respondents from ess10. Greek rows also harmonised (Greek-only) as persona file 'ess11' by "
                       "harmonize.py; per PHASE5_PREREGISTRATION section 1 they are development data (already revealed), not a "
                       "new holdout."]),
}
for _sid, _rnd, _za, _doi, _title, _ov in [
        ("eb843", "84.3", "ZA6643 v3.1.0", "doi:10.4232/1.12723 (GESIS ZA6643); copy via doi:10.7910/DVN/4TEDMI",
         "Standard Eurobarometer 84.3 (November 2015)", []),
        ("eb862", "86.2", "ZA6788 v2.0.0", "GESIS ZA6788; copy via doi:10.7910/DVN/KMWN9M", "Standard Eurobarometer 86.2 (November 2016)", []),
        ("eb884", "88.4", "ZA6939 v2.0.0", "GESIS ZA6939; copy via doi:10.7910/DVN/VNKZQF", "Eurobarometer 88.4 (December 2017)", []),
        ("eb931", "93.1", "ZA7649 v2.0.0", "GESIS ZA7649; copy via doi:10.7910/DVN/QHL4JK", "Standard Eurobarometer 93.1 (July-August 2020)", []),
        ("eb1033", "103.3", "ZA9128 v1.0.0 (trimmed)", "GESIS ZA9128; trimmed copy via doi:10.7910/DVN/L2U3XR",
         "Standard Eurobarometer 103.3 (March-April 2025), trimmed 76-variable subset",
         ["Same respondents as efsa2025 (the EFSA food-safety module of EB 103.3): respondent_serial matches EFSA Unique_ID "
          "(see provenance overlapCheck)."]),
        ("fl506", "Flash 506", "ZA7871 v1.0.0", "GESIS ZA7871; copy via doi:10.7910/DVN/COS3BS", "Flash Eurobarometer 506 (April 2022)", [])]:
    SURVEY_META[_sid] = {"title": _title, "family": "eb", "source": f"{_title}, GESIS {_za} — third-party copy (Harvard Dataverse)",
                         "doi_or_url": _doi, "licence": EB_LIC.format(za=_za), "commercialUse": "unclear", "aiTraining": "unclear",
                         "sampling": EB_SAMPLING, "overlaps": _ov or ["No respondent overlap with other files in this scope (separate waves)."]}
SURVEY_META["eb943"] = {"title": "Standard Eurobarometer 94.3 (February-March 2021)", "family": "eb",
                        "source": "Standard Eurobarometer 94.3 raw dataset ST943_FINAL SPSS_19042021 (xlsx) — third-party copy in "
                                  "Zenodo record 11002008 (supplementary materials of a journal article)",
                        "doi_or_url": "https://doi.org/10.5281/zenodo.11002008 (official release GESIS ZA7780)",
                        "licence": "Zenodo record labelled CC BY 4.0 ('copyright belongs to the European Union; original source is the "
                                   "Eurobarometer website'); EC lists Standard EB 94 on data.europa.eu under CC BY 4.0. Third-party "
                                   "copy, not the official GESIS release.",
                        "commercialUse": "unclear", "aiTraining": "unclear", "sampling": EB_SAMPLING.replace("w1 (united-country weights w3/w4 for the split DE / UK samples)", "'weight' (per country; 'Weight_Germany' for united Germany)"),
                        "licenceNotes": "commercialUse set to 'unclear' for all third-party Eurobarometer copies (project rule), although this "
                                        "Zenodo record carries CC BY 4.0.",
                        "overlaps": ["No respondent overlap with other files in this scope."]}
SURVEY_META["fl506"]["sampling"] = ("Flash Eurobarometer: random samples of residents aged 15+ per EU27 country; post-stratification "
                                    "weight w1 (sampling frame / mode details not documented in the deposit)")
for _sid, _title, _doi, _ov in [
        ("efsa2019", "2019 Eurobarometer on Food Safety in the EU (Special EB 91.3) — microdata", "Zenodo (EFSA) — see provenance",
         ["Special Eurobarometer 91.3 respondents; no overlap with other files in this scope."]),
        ("efsa2022", "Eurobarometer on Food Safety 2022 (Special EB 97.2) — microdata", "Zenodo (EFSA) — see provenance",
         ["Special Eurobarometer 97.2 respondents; no overlap with other files in this scope."]),
        ("efsa2025", "Eurobarometer on Food Safety 2025 — EU27 and IPA countries (microdata)", "Zenodo (EFSA) — see provenance",
         ["SAME RESPONDENTS as eb1033 (Standard EB 103.3, March-April 2025): Unique_ID == EB 103.3 respondent_serial for "
          "virtually all rows (see provenance overlapCheck). Treat eb1033 and efsa2025 as one fieldwork; do not count them as "
          "independent samples."])]:
    SURVEY_META[_sid] = {"title": _title, "family": "efsa", "source": f"{_title}; deposited by EFSA on Zenodo", "doi_or_url": _doi,
                         "licence": EFSA_LIC, "commercialUse": "yes", "aiTraining": "unclear",
                         "sampling": "Eurobarometer multi-stage random (probability) sampling of residents aged 15+; national weight",
                         "overlaps": _ov}


def load_manifests(root):
    man = {}
    for rel in (os.path.join(P4RAW, "manifest.jsonl"), os.path.join(SPRINT, "manifest.jsonl")):
        p = os.path.join(root, rel)
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    d = json.loads(line)
                    man[d["slug"]] = d
    return man


def manifest_sha(man_entry, path):
    files = man_entry.get("files") if man_entry else None
    if isinstance(files, str):
        try:
            files = json.loads(files.replace("'", '"'))
        except ValueError:
            files = []
    for f in files or []:
        p = f.get("path") or f.get("file") or ""
        if os.path.basename(p) == os.path.basename(path):
            return f.get("sha256")
    return None


def source_entries(root, man_entry, paths_roles):
    out = []
    for p, role in paths_roles:
        if not os.path.exists(p):
            continue
        sha = sha256_file(p)
        ms = manifest_sha(man_entry, p)
        out.append({"path": os.path.relpath(p, root), "role": role, "bytes": os.path.getsize(p), "sha256": sha,
                    "manifestSha256Match": (ms == sha) if ms else None})
    return out


def man_info(man_entry, key, default=None):
    v = (man_entry or {}).get(key)
    return v if v not in (None, "", []) else default


# ---------------------------------------------------------------------------------------------- ESS

ESS_SPECS = {
    "ess1": {"path": (P4RAW, "ess_r1_r5_greece", "ESS1e06.dta"), "qdoc": "ESS1", "slug": "ess_r1_r5_greece"},
    "ess2": {"path": (P4RAW, "ess_r1_r5_greece", "ESS2e03.dta"), "qdoc": "ESS2", "slug": "ess_r1_r5_greece"},
    "ess4": {"path": (P4RAW, "ess_r1_r5_greece", "ESS4e04.dta"), "qdoc": "ESS4", "slug": "ess_r1_r5_greece"},
    "ess5": {"path": (P4RAW, "ess_r1_r5_greece", "ESS5e03.dta"), "qdoc": "ESS5", "slug": "ess_r1_r5_greece"},
    "ess10": {"path": (SPRINT, "harvard_10.7910_DVN_7QODL6_ess10", "ESS10.dta"), "qdoc": None, "slug": "harvard_10.7910_DVN_7QODL6_ess10",
              "codebook": (SPRINT, "harvard_10.7910_DVN_7QODL6_ess10", "ESS10_codebook.html")},
    "ess11": {"path": (SPRINT, "harvard_10.7910_DVN_CUT5RQ", "ESS11.dta"), "qdoc": None, "slug": "harvard_10.7910_DVN_CUT5RQ_ess11"},
}
ESS_EXTRA_SKIP = re.compile(r"^(prob|stratum|psu|domain|recon|vd\w*|showcv|admrclc|admit|admc19|adm\w*|regunit|nation|weighta|height|"
                            r"[a-z]inw[se]|[a-z]inw\w*|edlv\w*|eduagegr|edagegr|ctzshipd|cntbrthd|livecnta|ageo12|agepnt|"
                            r"gndro12\w*|pfmfdjba)$")
ESS_DEMO = ["cntry", "pspwght", "agea", "gndr", "eisced", "edulvla", "edulvlb", "domicil", "inwyr", "inwmm", "inwyys", "inwmms", "inwds"]
ESS_CORE_STEMS = 3  # first three P4.ESS_STEMS sets are ESS core-module batteries (trust, participation, agree/disagree)


def edu3_edulvla(v):
    return None if v != v or v < 1 or v > 5 else "low" if v <= 2 else "medium" if v <= 4 else "high"


def edu3_edulvlb(v):
    if v != v or v > 1000:
        return None
    return "low" if v < 300 else "medium" if v < 500 else "high"


def ym_ess(g, cols):
    if "inwds" in cols:
        s = g["inwds"]
        if np.issubdtype(s.dtype, np.datetime64):
            return [x.strftime("%Y-%m") if x == x and not pd.isna(x) else None for x in s]
        if s.dtype.kind in "fi":
            base = dt.datetime(1960, 1, 1)
            return [(base + dt.timedelta(milliseconds=float(x))).strftime("%Y-%m") if x == x else None for x in s]
        d = pd.to_datetime(s, errors="coerce")
        return [x.strftime("%Y-%m") if not pd.isna(x) else None for x in d]
    yv, mv = ("inwyr", "inwmm") if "inwyr" in cols else ("inwyys", "inwmms")
    yy, mm = pd.to_numeric(g[yv], errors="coerce"), pd.to_numeric(g[mv], errors="coerce")
    return [f"{int(y):04d}-{int(m):02d}" if y == y and m == m and 1 <= m <= 12 and 2000 <= y <= 2030 else None for y, m in zip(yy, mm)]


def h_ess(root, sid, mans):
    sp = ESS_SPECS[sid]
    path = os.path.join(root, *sp["path"])
    man = mans.get(sp["slug"], {})
    _, m = pyreadstat.read_dta(path, metadataonly=True)
    labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
    cols = m.column_names
    split_vars = [c for c in cols if re.match(r"^spltadm\w*$", c)]
    demo_need = [c for c in ESS_DEMO if c in cols]
    ctx = GCtx(sid, sp["slug"])
    cand = []
    for v in cols:
        lab = P4.clean(labs.get(v) or "")
        if v in demo_need or v in split_vars or P4.ESS_SKIP.match(v) or ESS_EXTRA_SKIP.match(v):
            ctx.exclude(v, "demographic / admin / household grid / weight / paradata (ESS skip list)")
            continue
        if sensitive_extra(v, lab):
            ctx.exclude(v, SENS_REASON)
            continue
        r = P4.generic_skip(v, lab)
        if r:
            ctx.exclude(v, r)
            continue
        cand.append(v)
    df, _ = pyreadstat.read_dta(path, usecols=demo_need + split_vars + cand)
    n_raw = len(df)
    country_raw = df.cntry.astype(str).str.strip().str.upper()
    iso_check(set(country_raw.unique()))
    age = pd.to_numeric(df.agea, errors="coerce")
    keep = ~(age < 17)
    g = df[keep].reset_index(drop=True)
    del df
    gc.collect()
    country = g.cntry.astype(str).str.strip().str.upper()
    age = pd.to_numeric(g.agea, errors="coerce")
    demo = pd.DataFrame({"country": country})
    demo["weight"], filled = norm_weight_by_country(g.pspwght, country)
    demo["age_band"] = age.map(P4.age_band)
    demo["gender"] = pd.to_numeric(g.gndr, errors="coerce").map({1.0: "male", 2.0: "female"})
    eis = pd.to_numeric(g["eisced"], errors="coerce") if "eisced" in g else pd.Series(np.nan, index=g.index)
    edu = pd.Series([None] * len(g), dtype=object)
    edu_src = {}
    for c, idx in country.groupby(country).groups.items():
        e = eis.loc[idx]
        if e.between(1, 7).mean() > 0.5:
            edu.loc[idx] = e.map(lambda v: None if v != v or v < 1 or v > 7 else "low" if v <= 2 else "medium" if v <= 5 else "high")
            edu_src[c] = "eisced"
        elif "edulvla" in g:
            edu.loc[idx] = pd.to_numeric(g.edulvla.loc[idx], errors="coerce").map(edu3_edulvla)
            edu_src[c] = "edulvla"
        elif "edulvlb" in g:
            edu.loc[idx] = pd.to_numeric(g.edulvlb.loc[idx], errors="coerce").map(edu3_edulvlb)
            edu_src[c] = "edulvlb"
    demo["edu3"] = edu.values
    demo["urban"] = pd.to_numeric(g.domicil, errors="coerce").map({1.0: "urban", 2.0: "urban", 3.0: "urban", 4.0: "rural", 5.0: "rural"})
    ym_all = ym_ess(g, g.columns)
    cw = waves_by_country(ym_all, country)
    no_date = sorted(c for c, x in cw.items() if not x)
    if no_date:  # e.g. ESS5 Estonia: interview-date variables empty in this edition
        allw = P4.earliest_month(ym_all)
        for c in no_date:
            cw[c] = allw
    # stems
    qdoc = sp["qdoc"] or "ESS5"
    qpath = os.path.join(root, P4RAW, "ess_r1_r5_greece", "docs", f"{qdoc}_source_main_questionnaire.pdf")
    qtxt, stems = "", {}
    try:
        qtxt = P4.ess_text_source(subprocess.run(["pdftotext", qpath, "-"], capture_output=True, text=True, check=True).stdout)
    except Exception as e:  # noqa: BLE001
        ctx.notes.append(f"questionnaire text not readable ({e}); no stems added")
    stem_sets = P4.ESS_STEMS if sp["qdoc"] else P4.ESS_STEMS[:ESS_CORE_STEMS]
    for vars_, stem, probe in stem_sets:
        if probe in qtxt:
            for v in cand:
                if (v in vars_) if isinstance(vars_, set) else vars_.match(v):
                    stems[v] = stem
    stem_src = (f"ESS {qdoc} source questionnaire stem + " if sp["qdoc"] else
                "ESS core-module stem (wording from the ESS5 source questionnaire; this round's questionnaire is not in the deposit) + ")
    cvals = country.values
    for var in cand:
        lab = P4.clean(labs.get(var) or "")
        s = g[var]
        if s.dtype.kind in "OSU" and not vls.get(var) and pd.to_numeric(s, errors="coerce").notna().sum() == 0:
            ctx.exclude(var, "open text / string")
            continue
        stem = stems.get(var)
        text = f"{stem} — {lab}" if stem else lab
        if P4.add_labelled(ctx, var, s, lab, vls.get(var), text=text, stem=stem,
                           text_source=(stem_src if stem else "") + "ESS variable label"):
            vm = ctx.items[-1]["codes"].notna().values
            if re.match(r"^test\w+$", var):
                ctx.split[var] = "ESS test item (supplementary split-ballot / MTMM) administered to a random subgroup"
            else:
                for S in split_vars:
                    if split_var_subsample(vm, cvals, g[S]):
                        ctx.split[var] = f"answered only by some groups of the split-ballot variable {S}"
                        break
    fb = sorted(c for c, s_ in edu_src.items() if s_ != "eisced")
    rnd = sid[3:]
    notes = [f"Rows in file: {n_raw}; dropped {int((~keep).sum())} respondents aged <17 (ESS samples 15+); rows with unknown age kept "
             "(age_band empty).",
             "Weight = pspwght (post-stratification weight including design weight) normalised to mean 1 within country.",
             "edu3 from eisced (ES-ISCED I-II low, IIIb-IV medium, V1-V2 high) where >50% of a country's cases are harmonised; "
             + (f"otherwise from {'edulvla (ISCED 0-2 low, 3-4 medium, 5-6 high)' if 'edulvla' in g else 'edulvlb (ISCED codes <300 low, 300-499 medium, 500+ high)'}: {fb}." if fb else "all countries use eisced."),
             "urban from domicil: big city / suburbs / town = urban; village / farm or home in countryside = rural.",
             "wave = earliest interview month per country holding >=1% of dated interviews"
             + (f"; no interview dates in the file for {no_date}: survey-level earliest month {cw[no_date[0]]} used (waveApprox)." if no_date else "."),
             "Item text = ESS variable label (compressed English wording); battery stems prepended where available; other battery "
             "members flagged stemMissing.",
             "country = cntry (ISO 3166-1 alpha-2 in the source; GB = United Kingdom).",
             f"Licence: ESS ERIC data CC BY-NC-SA 4.0; cite 'Adapted from ESS Round {rnd}'."]
    if sid in ("ess10", "ess11"):
        notes.append("The sprint manifest describes the R10/R11 Dataverse copies as 'CC BY 4.0 per ESS ERIC'; the project rule "
                     "(ESS ERIC conditions page) is CC BY-NC-SA 4.0, used here.")
    srcs = [(path, "data")]
    if sp["qdoc"] or stems:
        srcs.append((qpath, "questionnaire (stems)"))
    if sp.get("codebook"):
        srcs.append((os.path.join(root, *sp["codebook"]), "codebook (not used: labels only)"))
    info = {"meta": {**SURVEY_META[sid], "mode": SURVEY_META[sid]["mode"]}, "countryWaves": cw, "waveApprox": bool(no_date),
            "weightVar": "pspwght (post-stratification incl. design weight; anweight = pspwght x pweight is proportional within "
                         "country, hence identical after normalisation)",
            "weightFilled": filled, "notes": notes, "function": "h_ess",
            "sources": source_entries(root, man, srcs),
            "rowFilters": {"rowsInFile": n_raw, "droppedAgeUnder17": int((~keep).sum()), "droppedNoCountry": 0},
            "demoNotes": {"age_band": "agea", "gender": "gndr", "edu3": {"sourceByCountry": edu_src}, "urban": "domicil"},
            "countryMapping": "cntry used as is", "siblingSplits": False}
    return finalize(root, sid, ctx, demo, info)


# ---------------------------------------------------------------------------------------------- GESIS Eurobarometer (Stata)

STD_DEMO = {"age": "d11", "gender": "d10", "edu": "d8", "edu_kind": "age", "urban": "d25"}
FLASH_DEMO = {"age": "d1", "gender": "d2", "edu": "d4", "edu_kind": "age", "urban": "d13"}
EB_SPECS = {
    "eb843": {"slug": "eb_843_2015_harvard_4TEDMI", "fn": "ZA6643_v3-1-0.dta", "bq": "ZA6643_bq.pdf", "demo": STD_DEMO, "split": "split"},
    "eb862": {"slug": "eb_862_2016_harvard_KMWN9M", "fn": "ZA6788_v2-0-0.dta", "demo": STD_DEMO, "split": "split"},
    "eb884": {"slug": "eb_884_2017_harvard_VNKZQF", "fn": "ZA6939_v2-0-0.dta", "demo": STD_DEMO, "wave": "2017-12",
              "wave_basis": "survey identification 'December 2017' (no interview-date variable in the file)"},
    "eb931": {"slug": "eb_931_2020_harvard_QHL4JK", "fn": "ZA7649_eb93.1.dta", "demo": STD_DEMO},
    "fl506": {"slug": "flash_eb_506_2022_harvard_COS3BS", "fn": "ZA7871_v1-0-0.dta", "demo": FLASH_DEMO, "keep_d": None,
              "wave": "2022-04", "wave_basis": "survey identification 'April 2022' (no date variable in the file)"},
    "eb1033": {"slug": "eb_1033_2025_trimmed_harvard_L2U3XR", "fn": "ZA9128_v1-0-0_trimmed.dta",
               "demo": {"age": None, "gender": "d10", "edu": "d9a", "edu_kind": "isced", "urban": "d25"}, "country_var": "country"},
}


def eb_iso(code):
    c = str(code or "").strip().upper()
    if c in ("DE-W", "DE-E"):
        return "DE"
    if c in ("GB-GBN", "GB-NIR", "GB-UKM"):
        return "GB"
    if c in ("RS-KM", "KV"):
        return "XK"
    if c in ("CY-TCC", "TCC"):
        return None
    if c == "EL":
        return "GR"
    if c == "UK":
        return "GB"
    return c if re.fullmatch(r"[A-Z]{2}", c) else None


def label_sample_code(lab):
    """GESIS 'country' value label ('gr - greece', 'de-w - germany - west', 'es -spain') -> sample code ('GR', 'DE-W', 'ES')."""
    mt = re.match(r"^\s*([A-Za-z]{2}(?:-[A-Za-z]{1,3})?)\b", str(lab or ""))
    return mt.group(1).upper() if mt else ""


def h_gesis_eb(root, sid, mans):
    sp = EB_SPECS[sid]
    man = mans.get(sp["slug"], {})
    path = os.path.join(root, P4RAW, sp["slug"], sp["fn"])
    dv = sp["demo"]
    keep_d = sp.get("keep_d", P4.EB_KEEP_D)
    _, m = pyreadstat.read_dta(path, metadataonly=True)
    labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
    cols = m.column_names
    cvar = sp.get("country_var", "isocntry")
    reserved = [c for c in [cvar, "w1", "w3", "w4", "p1", sp.get("split")] + [dv.get(k) for k in ("age", "gender", "edu", "urban")]
                if c and c in cols]
    used_demo = {dv.get(k) for k in ("age", "gender", "edu", "urban") if dv.get(k)}
    stems = P4.parse_eb_bq(os.path.join(root, P4RAW, sp["slug"], sp["bq"])) if sp.get("bq") else {}
    ctx = GCtx(sid, sp["slug"])
    sib = {}
    for v in cols:
        if re.search(r"_\d+$", v.lower()):
            sib.setdefault(P4.gesis_qid(v), []).append(re.sub(r"^q\d+_\d+\s+", "", labs.get(v) or "", flags=re.I))

    def truncated(var, raw):
        group = sib.get(P4.gesis_qid(var), [])
        if len(raw) < 76 or len(group) < 2:
            return False
        lcp = os.path.commonprefix(group)
        tail = re.sub(r"^q\d+_\d+\s+", "", raw, flags=re.I)[len(lcp):]
        return len(tail.strip()) < 15
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
        if re.match(r"^d\d", lv) and not (keep_d and keep_d.match(lv)):
            ctx.exclude(var, "demographic (EB D-block)")
            continue
        if sensitive_extra(var, lab):
            ctx.exclude(var, SENS_REASON)
            continue
        reason = P4.generic_skip(var, lab)
        if reason:
            ctx.exclude(var, reason)
            continue
        if re.search(r"(_r\d*|r\d)$", lv) and re.search(r"recod|\(r\)|cat\b", lab, re.I):
            ctx.exclude(var, "producer recode")
            continue
        if re.search(r"\b2ND\b", raw_lab) and "(SUM)" not in raw_lab.upper() or stems.get(P4.gesis_qid(var), "").lower().startswith("and then"):
            ctx.exclude(var, "partial multi-mention ('And then?' / 2nd mention); the (SUM) combined variable is used where present")
            continue
        vl = vls.get(var) or {}
        is_mention = len([k for k in vl if isinstance(k, (int, float))]) >= 2 and any(
            P4.MENTION0.search(P4.norm(str(x))) for k, x in vl.items() if isinstance(k, (int, float)) and float(k) == 0)
        stem, text, src = None, lab, "GESIS variable label"
        q = stems.get(P4.gesis_qid(var))
        if q:
            if not re.search(r"_\d+$", lv):
                text, src = q, f"GESIS basic questionnaire ({sp['bq']}) question text"
            else:
                stem, text, src = q, f"{q} — {lab}", f"GESIS basic questionnaire ({sp['bq']}) stem + GESIS variable label"
        elif re.search(r"_\d+$", lv) and not is_mention and truncated(var, raw_lab):
            ctx.exclude(var, "variable label truncated at Stata's 80-character limit (battery sub-item wording lost) and no "
                             "questionnaire in deposit")
            continue
        cand.append((var, lab, vl, text, stem, src))
    df, _ = pyreadstat.read_dta(path, usecols=reserved + [c[0] for c in cand])
    n_raw = len(df)
    if cvar == "isocntry":
        sample = df[cvar].astype(str).str.strip().str.upper()
    else:
        cl = vls.get(cvar, {})
        sample = pd.to_numeric(df[cvar], errors="coerce").map(lambda v: label_sample_code(cl.get(v)) if v == v else "")
    iso = sample.map(eb_iso)
    av = dv.get("age")
    has_age = bool(av) and av in df
    age = pd.to_numeric(df[av], errors="coerce") if has_age else pd.Series(np.nan, index=df.index)
    keep = iso.notna() & ~(age < 17)
    dropped_tcc = int(iso.isna().sum())
    dropped_age = int((iso.notna() & (age < 17)).sum())
    g = df[keep].reset_index(drop=True)
    sample = sample[keep].reset_index(drop=True)
    country = iso[keep].reset_index(drop=True)
    age = age[keep].reset_index(drop=True)
    del df
    gc.collect()
    iso_check(set(country.unique()))
    # weights: w1 per sample; united DE / UK weights w3 / w4 where the country is split into two samples
    wnote = []
    if "w1" in g:
        w = pd.to_numeric(g.w1, errors="coerce")
        for iso2, wv, subs in (("DE", "w3", {"DE-W", "DE-E"}), ("GB", "w4", {"GB-GBN", "GB-NIR"})):
            msk = country == iso2
            if msk.any() and set(sample[msk].unique()) >= subs and wv in g:
                wu = pd.to_numeric(g.loc[msk, wv], errors="coerce")
                if (wu > 0).mean() > 0.99:
                    w.loc[msk] = wu
                    wnote.append(f"{iso2}: {wv} (united-{'Germany' if iso2 == 'DE' else 'Kingdom'} weight; w1 is computed per "
                                 f"sub-sample {sorted(subs)})")
        weight_var = "w1" + (" (" + "; ".join(wnote) + ")" if wnote else "")
    else:
        w = None
        weight_var = None
    demo = pd.DataFrame({"country": country})
    if w is not None:
        demo["weight"], filled = norm_weight_by_country(w, country)
    else:
        demo["weight"], filled = 1.0, {}
    demo["age_band"] = age.map(P4.age_band) if has_age else None
    gv = dv.get("gender")
    demo["gender"] = pd.to_numeric(g[gv], errors="coerce").map({1.0: "male", 2.0: "female"}) if gv in g else None
    ev = dv.get("edu")
    edu_note = None
    if ev in g:
        e = pd.to_numeric(g[ev], errors="coerce")
        if dv.get("edu_kind") == "isced":
            demo["edu3"] = e.map(lambda v: None if v != v or v < 0 or v > 8 else "low" if v <= 2 else "medium" if v <= 4 else "high")
            edu_note = f"edu3 from {ev} (ISCED 0-2 low, 3-4 medium, 5-8 high)"
        else:
            demo["edu3"] = e.map(P4.edu3_from_age_finished)
            edu_note = (f"edu3 from {ev} (age when full-time education ended): <=15 or none = low, 16-19 = medium, 20+ = high; "
                        "'still studying' / DK empty")
    else:
        demo["edu3"] = None
    uv = dv.get("urban")
    if uv in g and re.search(r"community", labs.get(uv, ""), re.I):
        demo["urban"] = pd.to_numeric(g[uv], errors="coerce").map({1.0: "rural", 2.0: "urban", 3.0: "urban"})
        urb_note = f"urban from {uv} (type of community: rural area or village = rural; small/middle or large town = urban)"
    else:
        demo["urban"] = None
        urb_note = "no type-of-community variable (urban empty)"
    if sp.get("wave"):
        cw = {c: sp["wave"] for c in country.unique()}
        wave_approx, wave_basis = True, sp["wave_basis"]
    elif "p1" in g:
        pl = vls.get("p1", {})
        ym = [P4.ym_from_label(pl.get(v)) if v == v else None for v in pd.to_numeric(g.p1, errors="coerce")]
        cw = waves_by_country(ym, country)
        missing = [c for c, x in cw.items() if not x]
        wave_approx, wave_basis = False, "earliest interview month per country from p1 (date of interview) value labels"
        if missing:
            allw = P4.earliest_month(ym)
            for c in missing:
                cw[c] = allw
            wave_approx = True
            wave_basis += f"; survey-level month used for {missing}"
    else:
        raise ValueError(f"{sid}: no wave information")
    cvals = country.values
    S = g[sp["split"]] if sp.get("split") and sp["split"] in g else None
    for var, lab, vl, text, stem, src in cand:
        if P4.add_labelled(ctx, var, g[var], lab, vl, text=text, stem=stem, text_source=src) and S is not None:
            vm = ctx.items[-1]["codes"].notna().values
            if split_var_subsample(vm, cvals, S):
                ctx.split[var] = f"answered only by some groups of the questionnaire split variable '{sp['split']}' ({labs.get(sp['split'])})"
    notes = [f"Rows in file: {n_raw}; dropped {dropped_tcc} rows of the Turkish Cypriot Community sample (CY-TCC: no ISO country) and "
             f"{dropped_age} respondents aged <17 (EB samples 15+)." if has_age else
             f"Rows in file: {n_raw}; dropped {dropped_tcc} CY-TCC rows; no exact-age variable, so the under-17 filter could not be "
             "applied and age_band is empty.",
             "Country = ISO 3166-1 alpha-2 from the GESIS sample code: DE-W + DE-E -> DE, GB-GBN + GB-NIR (or GB-UKM) -> GB, "
             "RS-KM (Kosovo) -> XK.",
             (f"Weight = {weight_var}, normalised to mean 1 within country." if weight_var else
              "No weight variable in the file; weight = 1 (DE-W and DE-E sub-samples merged unweighted: East Germany is over-represented "
              "within DE)."),
             urb_note, f"wave: {wave_basis}."]
    if edu_note:
        notes.append(edu_note)
    notes.append(f"Question stems from GESIS basic questionnaire {sp['bq']} (English column) where the question id matches."
                 if sp.get("bq") else "No questionnaire in deposit: item text = GESIS variable label (terse); battery members flagged stemMissing.")
    if sid == "fl506":
        notes.append("Flash EB numbering: d1 age, d2 gender, d4 age education ended, d13 type of community. Battery labels cut at "
                     "Stata's 80-character limit are excluded (no questionnaire in deposit).")
    if sid == "eb1033":
        notes.append("Trimmed producer subset (76 of ~550 variables): only the 4-category age recode d11r1 (15-24/25-39/40-54/55+) "
                     "survives, which does not map onto the lake's age bands; no weight variable.")
    srcs = [(path, "data")] + ([(os.path.join(root, P4RAW, sp["slug"], sp["bq"]), "questionnaire (stems)")] if sp.get("bq") else [])
    info = {"meta": {**SURVEY_META[sid], "mode": man_info(man, "mode", "face-to-face (Standard Eurobarometer)")},
            "countryWaves": cw, "waveApprox": wave_approx, "weightVar": weight_var or "none (weight = 1)", "weightFilled": filled,
            "notes": notes, "function": "h_gesis_eb", "sources": source_entries(root, man, srcs),
            "rowFilters": {"rowsInFile": n_raw, "droppedCyTcc": dropped_tcc, "droppedAgeUnder17": dropped_age},
            "demoNotes": {"age_band": av if has_age else None, "gender": gv, "edu3": edu_note, "urban": urb_note},
            "countryMapping": {s: eb_iso(s) for s in sorted(set(sample.unique()))}, "stemOf": None}
    if sid == "eb1033":
        info["overlapCheck"] = overlap_eb1033_efsa2025(root)
        info["notes"].append(f"Overlap with efsa2025: {info['overlapCheck']}")
    return finalize(root, sid, ctx, demo, info)


def overlap_eb1033_efsa2025(root):
    """Counts-only check that EFSA 2025 respondents are EB 103.3 respondents (same serial and same country)."""
    try:
        a, ma = pyreadstat.read_dta(os.path.join(root, P4RAW, "eb_1033_2025_trimmed_harvard_L2U3XR", "ZA9128_v1-0-0_trimmed.dta"),
                                    usecols=["respondent_serial", "country"])
        cl = ma.variable_value_labels.get("country", {})
        a["iso"] = pd.to_numeric(a.country, errors="coerce").map(lambda v: eb_iso(label_sample_code(cl.get(v))))
        cb = P4.datamap_codebook(os.path.join(root, P4RAW, "efsa_eb_food_safety_2025", "Food_safety_2025_CSV_datamap.xlsx"),
                                 "Variable Labels", "Variable Value Labels")
        b = pd.read_csv(os.path.join(root, P4RAW, "efsa_eb_food_safety_2025", "Food_safety_2025_CSV_v2_data.csv"), sep=";",
                        usecols=["Unique_ID", "B"])
        bmap = b_code_map(cb["B"]["values"], {})
        b["iso"] = pd.to_numeric(b.B, errors="coerce").map(bmap)
        a["k"] = pd.to_numeric(a.respondent_serial, errors="coerce")
        b["k"] = pd.to_numeric(b.Unique_ID, errors="coerce")
        mm = b.merge(a[["k", "iso"]], on="k", how="left", suffixes=("", "_eb"))
        return {"efsa2025Rows": int(len(b)), "serialFoundInEb1033": int(mm.iso_eb.notna().sum()),
                "serialAndCountryMatch": int((mm.iso_eb == mm.iso).sum())}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


# ---------------------------------------------------------------------------------------------- CSV / xlsx Eurobarometer + EFSA

def b_code_map(values, overrides):
    """'Greece (EL)' -> GR, 'United Kingdom (UK)' -> GB, '(DEW)'/'(DEE)' -> DE, '(KV)'/'(XK)' -> XK, TCC -> None."""
    out = {}
    for k, lab in values.items():
        if k in overrides:
            out[k] = overrides[k]
            continue
        mt = re.search(r"\(([A-Z]{2,3})\)\s*$", str(lab).strip())
        code = mt.group(1) if mt else None
        if code in ("DEW", "DEE"):
            out[k] = "DE"
        elif code:
            out[k] = eb_iso(code)
        else:
            out[k] = None
    return out


def ensure_eb943_cache(root):
    """Stream the EB 94.3 xlsx 'Rawdata' sheet (row 1 = variable names, row 2 = labels, rows 3+ = data) into a gzip CSV."""
    src = os.path.join(root, P4RAW, "eb_943_standard_2021_zenodo11002008", "ST943_FINAL_SPSS_19042021.xlsx")
    cdir = os.path.join(root, CACHE_REL)
    os.makedirs(cdir, exist_ok=True)
    dst, side = os.path.join(cdir, "eb943_rawdata.csv.gz"), os.path.join(cdir, "eb943_rawdata.json")
    sha = sha256_file(src)
    if os.path.exists(dst) and os.path.exists(side):
        try:
            if json.load(open(side, encoding="utf-8")).get("sourceSha256") == sha:
                return dst, sha, True
        except ValueError:
            pass
    import openpyxl
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    ws = wb["Rawdata"]
    nrow = 0
    with gzip.open(dst + ".tmp", "wt", encoding="utf-8", newline="") as fh:
        wr = csv.writer(fh)
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i == 1:
                continue  # label row
            wr.writerow(["" if x is None else x for x in row])
            nrow += i > 1
    wb.close()
    os.replace(dst + ".tmp", dst)
    write_json_atomic(side, {"source": os.path.relpath(src, root), "sourceSha256": sha, "sheet": "Rawdata", "dataRows": nrow,
                             "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
    return dst, sha, False


CSV_SPECS = {
    "eb943": {"slug": "eb_943_standard_2021_zenodo11002008", "data": None, "sep": ",", "age": "RC006", "age_band": None,
              "gender": "D10", "edu": "D8R", "urban": "D25", "weight": "weight", "weight_de": "Weight_Germany",
              "b_overrides": {41.0: "DE", 42.0: "DE", 40.0: None}, "wave_from": "Date",
              "partial_rx": r"^Q[A-Z]+\d+b[._]", "total_rx": r"^Q[A-Z]+\d+[a-z]?T(\d*|\d*[._]\d+)$"},
    "efsa2025": {"slug": "efsa_eb_food_safety_2025", "data": "Food_safety_2025_CSV_v2_data.csv", "sep": ";",
                 "codebook": ("Food_safety_2025_CSV_datamap.xlsx", "Variable Labels", "Variable Value Labels"),
                 "age": None, "age_band": "D11R", "gender": "D10", "edu": "D8", "urban": "D25", "weight": "weight",
                 "weight_de": "weight_germany", "b_overrides": {}, "wave_from": "P1",
                 "partial_rx": r"^Q[A-Z]+\d+b[._]", "total_rx": r"^Q[A-Z]+\d+[a-z]?T(\d*|\d*[._]\d+)$"},
    "efsa2022": {"slug": "efsa_eb_972_food_safety_2022", "data": "eb972_food_safety_v3.csv", "sep": "~",
                 "codebook": ("DataMap_eb972_food_safety_v2.xlsx", "Variable Labels", "Variable Values"),
                 "age": None, "age_band": "D11R", "gender": "D10", "edu": "D8", "urban": "D25", "weight": "weight",
                 "weight_de": None, "b_overrides": {41.0: "DE", 42.0: "DE", 40.0: None}, "wave": "2022-03",
                 "wave_basis": "EFSA record: fieldwork 2022-03-21 to 2022-04-20 (file p1 = day of month only)",
                 "partial_rx": r"^Q[A-Z]+\d+b[._]", "total_rx": r"^Q[A-Z]+\d+[a-z]?T(\d*|\d*[._]\d+)$"},
}


def csv_stem(it):
    lab = it.get("label") or it["text"]
    return P4.norm(P4.QID_PREFIX.sub("", lab.split(":")[0]))


def h_csv_eb(root, sid, mans):
    sp = CSV_SPECS[sid]
    man = mans.get(sp["slug"], {})
    base = os.path.join(root, P4RAW, sp["slug"])
    cache_note = None
    if sid == "eb943":
        xlsx = os.path.join(base, "ST943_FINAL_SPSS_19042021.xlsx")
        cb = P4.eb943_codebook(xlsx)
        data_path, _, reused = ensure_eb943_cache(root)
        cache_note = (f"Data streamed from the xlsx 'Rawdata' sheet (all countries) into {os.path.relpath(data_path, root)} "
                      f"({'reused' if reused else 'built'}; rebuilt when the xlsx sha256 changes); codebook = 'ListVariables' sheet.")
        srcs = [(xlsx, "data + codebook (xlsx: Rawdata, ListVariables)")]
        sep = ","
    else:
        cbf, s1, s2 = sp["codebook"]
        cb = P4.datamap_codebook(os.path.join(base, cbf), s1, s2)
        data_path = os.path.join(base, sp["data"])
        srcs = [(data_path, "data"), (os.path.join(base, cbf), "codebook (datamap)")]
        sep = sp["sep"]
    hdr = [c.strip() for c in pd.read_csv(data_path, sep=sep, nrows=0).columns]
    reserved = [c for c in ["B", sp.get("age"), sp.get("age_band"), sp["gender"], sp["edu"], sp["urban"], sp["weight"],
                            sp.get("weight_de"), sp.get("wave_from")] if c and c in hdr]
    ctx = GCtx(sid, sp["slug"])
    cand = []
    for var in hdr:
        info_ = cb.get(var)
        if var in reserved:
            ctx.exclude(var, "demographic / admin / weight / country (used for the demographic columns)")
            continue
        if info_ is None:
            ctx.exclude(var, "variable not documented in the codebook")
            continue
        lab = info_["label"]
        if P4.CSV_EB_SKIP.match(var):
            ctx.exclude(var, "demographic / admin / weight / region / recode / net (skip list)")
            continue
        tr = sp.get("total_rx")
        if tr and re.search(tr, var) and not re.search(r"firstly|and then|\(max", lab, re.I):
            ctx.exclude(var, "producer-merged total of split-ballot versions (derived); the version-specific items are used")
            continue
        if tr and re.search(tr, var) and any(re.match(rf"^{re.escape(var.split('T')[0])}ab[._]", v) for v in hdr):
            ctx.exclude(var, "duplicate total of a multi-mention question; the combined 'ab' variable is used")
            continue
        if sp.get("partial_rx") and re.search(sp["partial_rx"], var) and re.search(r"and then\?", lab, re.I):
            ctx.exclude(var, "partial multi-mention ('And then?'); combined variable used instead")
            continue
        if re.search(r"in your own words|spontaneous.{0,20}\bcode", lab, re.I):
            ctx.exclude(var, "coded open-ended answer (derived from free text)")
            continue
        if sensitive_extra(var, lab):
            ctx.exclude(var, SENS_REASON)
            continue
        reason = P4.generic_skip(var, lab)
        if reason:
            ctx.exclude(var, reason)
            continue
        cand.append(var)
    want = set(reserved + cand)
    df = pd.read_csv(data_path, sep=sep, low_memory=False, usecols=lambda c: c.strip() in want)
    df.columns = [c.strip() for c in df.columns]
    if sid == "eb943":  # first data column of the sheet is a row label; a stray non-numeric row would show up in B
        df = df[pd.to_numeric(df.B, errors="coerce").notna()].reset_index(drop=True)
    n_raw = len(df)
    bvals = cb["B"]["values"]
    bmap = b_code_map(bvals, sp.get("b_overrides", {}))
    bnum = pd.to_numeric(df.B, errors="coerce")
    iso = bnum.map(bmap)
    unmapped = sorted({f"{int(k)}:{bvals.get(k)}" for k in bnum[iso.isna()].dropna().unique()})
    age = pd.to_numeric(df[sp["age"]], errors="coerce") if sp.get("age") and sp["age"] in df else pd.Series(np.nan, index=df.index)
    keep = iso.notna() & ~(age < 17)
    dropped_c, dropped_age = int(iso.isna().sum()), int((iso.notna() & (age < 17)).sum())
    g = df[keep].reset_index(drop=True)
    country = iso[keep].reset_index(drop=True)
    bsub = bnum[keep].reset_index(drop=True)
    age = age[keep].reset_index(drop=True)
    del df
    gc.collect()
    iso_check(set(country.unique()))
    demo = pd.DataFrame({"country": country})
    w = pd.to_numeric(g[sp["weight"]], errors="coerce")
    wnote = None
    wd = sp.get("weight_de")
    if wd and wd in g:
        msk = country == "DE"
        wu = pd.to_numeric(g.loc[msk, wd], errors="coerce")
        if msk.any() and (wu > 0).mean() > 0.99:
            w.loc[msk] = wu
            wnote = f"DE: {wd} (united-Germany weight; '{sp['weight']}' is computed per East/West sub-sample)"
    demo["weight"], filled = norm_weight_by_country(w, country)
    weight_var = sp["weight"] + (f" ({wnote})" if wnote else "")
    if sp.get("age") and sp["age"] in g:
        demo["age_band"] = age.map(P4.age_band)
        age_note = f"Exact age from {sp['age']}; respondents aged <17 dropped."
    else:
        bl = (cb.get(sp["age_band"]) or {}).get("values", {})
        demo["age_band"] = pd.to_numeric(g[sp["age_band"]], errors="coerce").map(lambda v: None if v != v else P4.band_from_label(bl.get(v)))
        age_note = (f"No exact age in the file: age_band from the band recode {sp['age_band']} ('15-24' mapped to 17-24, so 15-16 "
                    "year-olds cannot be removed; the under-17 filter could not be applied).")
    demo["gender"] = pd.to_numeric(g[sp["gender"]], errors="coerce").map({1.0: "male", 2.0: "female"})
    lab_e = (cb.get(sp["edu"]) or {}).get("values", {})
    e = pd.to_numeric(g[sp["edu"]], errors="coerce")
    if any("16-19" in str(v) for v in lab_e.values()):
        def f(v):
            t = P4.norm(lab_e.get(v, "")) if v == v else ""
            return "low" if re.search(r"^(up to )?15|15-|no full", t) else "medium" if "16-19" in t else "high" if "20" in t else None
        demo["edu3"] = e.map(f)
    else:
        demo["edu3"] = e.map(lambda v: None if v != v or v in (0, 98, 99) or v > 97 else "low" if v == 97 or v <= 15 else "medium" if v <= 19 else "high")
    edu_note = (f"edu3 from {sp['edu']} (age when full-time education ended): <=15 or none = low, 16-19 = medium, 20+ = high; "
                "'still studying' / DK empty")
    demo["urban"] = pd.to_numeric(g[sp["urban"]], errors="coerce").map({1.0: "rural", 2.0: "urban", 3.0: "urban"})
    urb_note = f"urban from {sp['urban']} (rural area or village = rural; small/middle or large town = urban; DK empty)"
    if sp.get("wave"):
        cw = {c: sp["wave"] for c in country.unique()}
        wave_approx, wave_basis = True, sp["wave_basis"]
    elif sp["wave_from"] == "Date":
        dl = cb.get("Date", {}).get("values", {})
        ym = [P4.ym_from_label(dl.get(float(v))) if v == v else None for v in pd.to_numeric(g.Date, errors="coerce")]
        cw = waves_by_country(ym, country)
        wave_approx, wave_basis = False, "earliest interview month per country (Date codes -> ListVariables labels)"
    else:  # P1 'dd-mm-yy'
        def ymp(s):
            mt = re.match(r"^\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\s*$", str(s))
            if not mt:
                return None
            y = int(mt.group(3))
            y = y + 2000 if y < 100 else y
            return f"{y:04d}-{int(mt.group(2)):02d}"
        ym = [ymp(v) if isinstance(v, str) else None for v in g[sp["wave_from"]]]
        cw = waves_by_country(ym, country)
        wave_approx, wave_basis = False, f"earliest interview month per country from {sp['wave_from']} (dd-mm-yy)"
    if any(not x for x in cw.values()):
        raise ValueError(f"{sid}: country without wave {cw}")
    for var in cand:
        info_ = cb[var]
        P4.add_labelled(ctx, var, g[var], info_["label"], info_["values"], text=info_["label"],
                        text_source="codebook question text (+ sub-item)")
    notes = [f"Rows in file: {n_raw}; dropped {dropped_c} rows without an ISO country ({unmapped}) and {dropped_age} respondents aged <17.",
             age_note, edu_note, urb_note, f"Weight = {weight_var}, normalised to mean 1 within country.", f"wave: {wave_basis}.",
             "Country from B (codebook labels '(XX)'): EL -> GR, UK -> GB, KV/XK -> XK, East/West Germany -> DE; Turkish Cypriot "
             "Community dropped.",
             "Split-ballot question versions (e.g. QE11a/b/c with different item wording) are kept as separate items with split = "
             "'subsample'; the producer-merged 'T' totals are excluded as derived."]
    if cache_note:
        notes.append(cache_note)
    if sid == "eb943":
        notes.append("Mixed mode in 2021 (CAPI and CAWI by country; CAPI_CAWI variable).")
    info = {"meta": {**SURVEY_META[sid], "mode": man_info(man, "mode", "face-to-face CAPI (Eurobarometer)")},
            "countryWaves": cw, "waveApprox": wave_approx, "weightVar": weight_var, "weightFilled": filled, "notes": notes,
            "function": "h_csv_eb", "sources": source_entries(root, man, srcs),
            "rowFilters": {"rowsInFile": n_raw, "droppedNoIsoCountry": dropped_c, "droppedNoIsoCountryCodes": unmapped,
                           "droppedAgeUnder17": dropped_age},
            "demoNotes": {"age_band": age_note, "gender": sp["gender"], "edu3": edu_note, "urban": urb_note},
            "countryMapping": {f"{int(k)}:{v}": bmap.get(k) for k, v in bvals.items()}, "stemOf": csv_stem}
    return finalize(root, sid, ctx, demo, info)


# ---------------------------------------------------------------------------------------------- EFSA 2019 (.sav)

EFSA19_B = {1.0: "BE", 2.0: "DK", 4.0: "GR", 5.0: "ES", 6.0: "FI", 7.0: "FR", 8.0: "IE", 9.0: "IT", 10.0: "LU", 11.0: "NL",
            12.0: "AT", 13.0: "PT", 14.0: "SE", 20.0: "DE", 21.0: "DE", 22.0: "GB", 31.0: "BG", 32.0: "CY", 33.0: "CZ",
            34.0: "EE", 35.0: "HU", 36.0: "LV", 37.0: "LT", 38.0: "MT", 39.0: "PL", 40.0: "RO", 41.0: "SK", 42.0: "SI",
            43.0: "TR", 45.0: "IS", 46.0: "HR"}


def h_efsa2019(root, sid, mans):
    slug = "efsa_eb_913_food_safety_2019"
    man = mans.get(slug, {})
    path = os.path.join(root, P4RAW, slug, "eb_91.3_EFSA_Microdata.sav")
    _, m = pyreadstat.read_sav(path, metadataonly=True)
    labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
    cols = m.column_names
    regv = next((c for c in cols if re.search(r"region|nuts", labs.get(c) or "", re.I) and vls.get(c)), None)
    reserved = [c for c in ("b", "d8", "d10", "d11", "vd11", "d25", "w1", "w3") if c in cols]
    ctx = GCtx(sid, slug)
    cand = []
    for var in cols:
        lab = P4.clean(labs.get(var) or "")
        lv = var.lower()
        if var in reserved or re.match(r"^(b|vc|vd|vdd|q1\.\d+|p\d+\w*|d7|d8|d10|d11|vd11|d15\w*|d25|vd40\w*|d40\w*|w\d+|wex|v[a-z]+\d*|"
                                       r"brk\S*|nuts\w*|region\w*|isocntry|split\w*)$", lv) or var == regv:
            ctx.exclude(var, "demographic / admin / weight / region / country flag (skip list)")
            continue
        if re.search(r"RGPS$|r\d?$", var) or re.search(r"\bregroup", lab, re.I):
            ctx.exclude(var, "producer regrouping (derived)")
            continue
        if re.search(r"^q\w+b\.\d+$", lv) and re.search(r"and then\?", lab, re.I):
            ctx.exclude(var, "partial multi-mention ('And then?'); TOTAL variable used instead")
            continue
        if re.search(r"in your own words", lab, re.I):
            ctx.exclude(var, "coded open-ended answer")
            continue
        lab2 = re.sub(r"\bTOTAL \(MAX\s+\d+ ANSWERS\)", "", lab).strip()
        if sensitive_extra(var, lab2):
            ctx.exclude(var, SENS_REASON)
            continue
        reason = P4.generic_skip(var, lab2)
        if reason:
            ctx.exclude(var, reason)
            continue
        cand.append(var)
    df, _ = pyreadstat.read_sav(path, usecols=reserved + cand)
    n_raw = len(df)
    bnum = pd.to_numeric(df.b, errors="coerce")
    iso = bnum.map(EFSA19_B)
    agev = next((c for c in ("d11", "vd11") if c in df.columns), None)
    age = pd.to_numeric(df[agev], errors="coerce") if agev else pd.Series(np.nan, index=df.index)
    keep = iso.notna() & ~(age < 17)
    dropped_c, dropped_age = int(iso.isna().sum()), int((iso.notna() & (age < 17)).sum())
    g = df[keep].reset_index(drop=True)
    country = iso[keep].reset_index(drop=True)
    bsub = bnum[keep].reset_index(drop=True)
    age = age[keep].reset_index(drop=True)
    del df
    gc.collect()
    iso_check(set(country.unique()))
    w = pd.to_numeric(g.w1, errors="coerce")
    wnote = None
    msk = country == "DE"
    if msk.any() and set(bsub[msk].unique()) >= {20.0, 21.0} and "w3" in g:
        wu = pd.to_numeric(g.loc[msk, "w3"], errors="coerce")
        if (wu > 0).mean() > 0.99:
            w.loc[msk] = wu
            wnote = "DE: w3 ('Weight special Germany', united Germany; w1 is computed per East/West sub-sample)"
    demo = pd.DataFrame({"country": country})
    demo["weight"], filled = norm_weight_by_country(w, country)
    demo["age_band"] = age.map(P4.age_band)
    demo["gender"] = pd.to_numeric(g.d10, errors="coerce").map({1.0: "male", 2.0: "female"})
    demo["edu3"] = pd.to_numeric(g.d8, errors="coerce").map({1.0: "low", 2.0: "medium", 3.0: "high", 5.0: "low"})
    demo["urban"] = pd.to_numeric(g.d25, errors="coerce").map({1.0: "rural", 2.0: "urban", 3.0: "urban"})
    for var in cand:
        lab = P4.clean(labs.get(var) or "")
        lab2 = re.sub(r"\bTOTAL \(MAX\s+\d+ ANSWERS\)", "", lab).strip()
        vl = {k: re.sub(r"^no\s+", "Not mentioned: ", v) if re.match(r"^no\s{1,2}\S", v or "") else v for k, v in (vls.get(var) or {}).items()}
        text = lab2
        if len(vl) == 2 and set(vl) == {0.0, 1.0} and str(vl[0.0]).startswith("Not mentioned"):
            vl = {0.0: "Not mentioned", 1.0: vls[var][1.0]}
            text = f"{lab2} — mentions: «{P4.clean(vls[var][1.0])}»"
        elif " / " in lab and re.match(r"^[^/]{2,80} / Q", lab):
            item_, _, q = lab.partition(" / ")
            text = f"{q} — {item_}"
        P4.add_labelled(ctx, var, g[var], lab, vl, text=text, text_source="SPSS variable label (question text)")
    weight_var = "w1" + (f" ({wnote})" if wnote else "")
    cw = {c: "2019-04" for c in country.unique()}
    notes = [f"Rows in file: {n_raw}; dropped {dropped_c} rows without country and {dropped_age} respondents aged <17.",
             f"Weight = {weight_var}, normalised to mean 1 within country.",
             "edu3 from d8 (5-category recode of age finished education): 15- or none = low, 16-19 = medium, 20+ = high, still studying empty.",
             "urban from d25 (rural area or village = rural; small/middle or large town = urban).",
             "Country from b (national names) mapped to ISO2; Deutschland West + Ost -> DE.",
             "wave: EFSA record fieldwork 2019-04-09 to 2019-04-26 (no date variable in the file); same month for all countries.",
             "Multi-mention questions: the combined TOTAL variables are used; 'And then?' partials excluded."]
    info = {"meta": {**SURVEY_META[sid], "mode": man_info(man, "mode", "face-to-face")}, "countryWaves": cw, "waveApprox": True,
            "weightVar": weight_var, "weightFilled": filled, "notes": notes, "function": "h_efsa2019",
            "sources": source_entries(root, man, [(path, "data")]),
            "rowFilters": {"rowsInFile": n_raw, "droppedNoCountry": dropped_c, "droppedAgeUnder17": dropped_age},
            "demoNotes": {"age_band": agev, "gender": "d10", "edu3": "d8 (5-cat recode)", "urban": "d25"},
            "countryMapping": {f"{int(k)}:{vls.get('b', {}).get(k)}": v for k, v in EFSA19_B.items()},
            "stemOf": lambda it: P4.norm(P4.QID_PREFIX.sub("", (it.get("label") or it["text"]).split(" / ")[-1]))}
    return finalize(root, sid, ctx, demo, info)


# ---------------------------------------------------------------------------------------------- driver

HANDLERS = {**{s: h_ess for s in ESS_SPECS}, **{s: h_gesis_eb for s in EB_SPECS}, **{s: h_csv_eb for s in CSV_SPECS},
            "efsa2019": h_efsa2019}


def update_surveys_eu(root, entries):
    path = os.path.join(root, OUT_REL, "surveys.eu.json")
    os.makedirs(os.path.join(root, CACHE_REL), exist_ok=True)
    with open(os.path.join(root, CACHE_REL, "surveys.eu.json.lock"), "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        try:
            old = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else []
        except ValueError:
            old = []
        by = {e["surveyId"]: e for e in old}
        for e in entries:
            by[e["surveyId"]] = e
        order = {s: i for i, s in enumerate(SURVEY_IDS)}
        write_json_atomic(path, sorted(by.values(), key=lambda e: (order.get(e["surveyId"], 999), e["surveyId"])))
        fcntl.flock(lk, fcntl.LOCK_UN)
    return path


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
    mans = load_manifests(root)
    entries, all_problems, timing = [], [], []
    for sid in ids:
        t0 = time.time()
        items, entry = HANDLERS[sid](root, sid, mans)
        probs = validate(root, sid, items, entry)
        dt_s = time.time() - t0
        entry["build"] = {"seconds": round(dt_s, 1), "peakRssMB": round(peak_mb())}
        entries.append(entry)
        update_surveys_eu(root, [entry])
        all_problems += probs
        gr = entry["countries"].get("GR", {}).get("n", 0)
        timing.append((sid, dt_s))
        print(f"{sid}: countries={entry['nCountries']} n={entry['nTotal']} GR={gr} items={entry['nItems']} "
              f"subsample={entry['nItemsSubsample']} political={entry['nItemsExcludedFromTransfer']} "
              f"weight={entry['weightVar'][:40]!r} {dt_s:.0f}s peakRSS={peak_mb():.0f}MB"
              + (f" PROBLEMS={len(probs)}" if probs else " validation OK"))
        gc.collect()
    print(f"surveys.eu.json updated ({len(entries)} entries written)")
    if all_problems:
        print("validation problems:\n  " + "\n  ".join(all_problems[:80]))
        raise SystemExit(1)
    print("validation: OK")


if __name__ == "__main__":
    main()
