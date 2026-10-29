"""
Phase 5 GLOBAL BEHAVIOUR EVIDENCE LAKE — new Phase-5 multi-country downloads ("p5world"), ALL countries.

    python3 -I scripts/synthetic-lab/persona/harmonize_global_p5_world.py --root . [--only <surveyId> ...]

surveyIds: lits3 lits2 lits1 qog2010 qog2013 qog2017 piaac1 piaac2 jrcwaste

Output format: docs/synthetic-lab/GLOBAL_LAKE_SPEC.md. Writes ONLY under .synthetic-lab-data/global-behavior-evidence/v1/:
  resp/<sid>.csv.gz        rid, country (ISO2), wave (YYYY-MM), weight (mean 1 within country), age_band, gender, edu3, urban,
                           then "<sid>::<var>" = answer code as text (DK / refused / not applicable / valid skip -> empty)
  locked/<sid>.GR.csv.gz   LOCKED final-holdout Greek rows (PHASE5_PREREGISTRATION "Τροποποίηση Α": F3e lits3, F3f qog2010 /
                           qog2013 / qog2017, F3g piaac1, F3h jrcwaste); same columns; never in resp/
  items/<sid>.json         one object per item (same set for all countries)
  provenance/<sid>.json    source files with sha256, harmonising function, exclusions with reasons, notes
  provenance/_overlap.p5world.json   respondent-overlap check between files (ids / years / row counts only)
  surveys.p5world.json     survey entries (merged by surveyId on partial runs)
Existing outputs of other harmonisers (surveys.world.json, surveys.eu.json, their resp/items/provenance) are not touched.

PREREGISTRATION (docs/synthetic-lab/PHASE5_PREREGISTRATION.md §1-§2, Τροποποίηση Α):
  * Greek rows of every locked survey go only to locked/. For them NOTHING is computed except the row count: every item decision
    (options completion, unlabelled-code share, >= 300 valid answers, >= 2 distinct codes, country-specific check) and every
    printed count uses the non-locked rows only; Greek rows are only mapped through the option sets found on the other rows.
  * Political protection: items whose wording mentions vote / party / candidate / leader (automatic text filter reused from
    harmonize_global_world.is_political) carry excludedFromTransfer: true. Kept, not transferred across countries.
  * LiTS I / LiTS II / PIAAC Cycle 2 have no Greek rows (training only).

Conventions reused from harmonize_global_world.py / harmonize_p4_lake.py (imported, not modified): age bands 17-24 ... 65+
(rows aged < 17 dropped where exact age exists), gender male/female, edu3 low (<= ISCED 2) / medium (ISCED 3-4) / high (ISCED 5+),
DK / refusal / not applicable -> empty, end-labelled numeric scales completed, multi-mention -> binary, GDPR art. 9 special-category
variables about the respondent (health, ethnicity, religion, party / trade-union membership, persecution history) are not items,
LiTS household-informant sections are not items, producer-derived indices / plausible values / scores are not items.

DATA HYGIENE: never prints answer distributions, correlations or crosstabs - only row / item / valid-answer / country counts.
Downloads are read as data only (pyreadstat / python-docx / pdftotext); nothing inside them is executed (the PIAAC zips contain
only .sav data files; they are extracted one at a time to a temporary directory and deleted after reading).
"""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile

import numpy as np
import pandas as pd
import pyreadstat

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harmonize_p4_lake as L  # noqa: E402  (helpers; module not modified)
import harmonize_global_world as W  # noqa: E402  (helpers: country names, political filter, sources; module not modified)

OUT_REL = W.OUT_REL
RAW5 = os.path.join(".synthetic-lab-data", "raw", "phase5")
SCRIPT_REL = "scripts/synthetic-lab/persona/harmonize_global_p5_world.py"
SURVEYS_FILE = "surveys.p5world.json"
MIN_VALID = 300
LOCKED = {"lits3": "F3e", "qog2010": "F3f", "qog2013": "F3f", "qog2017": "F3f", "piaac1": "F3g", "jrcwaste": "F3h"}
DEMO_OUT = W.DEMO_OUT
INCLUSION_RULE = W.INCLUSION_RULE + (" PIAAC: background-questionnaire items only (plausible values, assessment item responses, "
                                     "derived indices / WLE scores, trend '_T' and collapsed '_C' recodes excluded).")

# additional non-substantive answer labels in these files (on L.norm text)
NONSUB2 = re.compile(r"valid skip|not stated|do not know|^filtered$|difficult to say|^none of (these|the above)$|haven.?t heard|have not heard|"
                     r"i am not sure|^not sure|prefer not|cannot provide|does not apply|^n/?a$")
MENTION0B = re.compile(r"^(not mentioned|not selected|not ticked|not marked|0 not|not\s|no\s\S)")
NONE_OTHER = re.compile(r"^(other|others|none|nothing|nobody|no one|no problems|no-one is responsible|don.?t know|dk|refus|not stated)\b|"
                        r"none of (these|the above)|\(specify|\(\+q\d+oth", re.I)


def norm(s):
    return L.norm(L.clean(s))


def is_nonsub(label):
    t = norm(label)
    if re.search(r"not available in the|^nothing ?/ ?ordinary people|not asked to pay|people don.?t know (how|where)|refuse to pay",
                 t):  # substantive answers that the generic DK / refusal / not-asked regex would catch
        return False
    return bool(L.NONSUB.search(t) or NONSUB2.search(t) or W.EXTRA_NONSUB.search(t))


# ============================================================================== item machinery (numeric codes; locked-aware)

class Ctx:
    def __init__(self, sid, open_mask):
        self.sid = sid
        self.open = pd.Series(open_mask).reset_index(drop=True).astype(bool)
        self.items, self.excluded, self.notes, self.empties = [], [], [], []
        self.seen = set()

    def exclude(self, var, reason):
        self.excluded.append({"variable": var, "reason": reason})

    def add(self, var, codes, text, options, *, nonsub=(), qtype=None, label=None, text_source="", stem=None, multi=False,
            language="en", extra=None):
        if var in self.seen:
            raise ValueError(f"{self.sid}: duplicate var {var}")
        self.seen.add(var)
        options = [(str(c), L.clean(l)) for c, l in options]
        if qtype is None:
            qtype = L.item_type([l for _, l in options])
        it = {"var": var, "codes": pd.Series(codes).reset_index(drop=True).astype("float32"), "text": L.clean(text),
              "options": options, "nonsub": [str(c) for c in nonsub], "type": qtype,
              "label": L.clean(label if label is not None else text), "textSource": text_source, "stem": stem, "multi": multi,
              "language": language, "split": "all"}
        it.update(extra or {})
        self.items.append(it)


def add_labelled(ctx, var, series, label, vl, *, text=None, text_source="variable label", stem=None, qtype=None, extra=None,
                 binary_yesno_ok=True):
    """One labelled variable -> item (or a recorded exclusion). All decisions use the NON-LOCKED rows only (ctx.open)."""
    num = pd.to_numeric(pd.Series(series).reset_index(drop=True), errors="coerce").astype("float64")
    o = num[ctx.open]
    if not o.notna().any():
        ctx.empties.append(var)
        return False
    if not vl:
        ctx.exclude(var, "no value labels (option meanings undocumented)")
        return False
    opts, nonsub = {}, set()
    for k, v in vl.items():
        try:
            kf = float(k)
        except (TypeError, ValueError):
            continue
        lab = L.clean(v)
        if not lab:
            continue
        if is_nonsub(lab):
            nonsub.add(kf)
        else:
            opts[kf] = lab
    keys0 = sorted(opts)
    if len(keys0) >= 2 and all(float(k).is_integer() for k in keys0):
        gaps = set(range(int(keys0[0]), int(keys0[-1]) + 1)) - {int(k) for k in keys0} - {int(k) for k in nonsub if float(k).is_integer()}
        if gaps:  # data-driven completion of end-labelled scales, on non-locked rows only; never over a non-substantive code
            done = L.complete_numeric_scale(o, opts, nonsub)
            opts = {k: v for k, v in done.items() if k not in nonsub}
    valid_o = o.notna() & ~o.isin(list(nonsub))
    unl = valid_o & ~o.isin(list(opts))
    n_unl, n_val = int(unl.sum()), int(valid_o.sum())
    if n_val and n_unl / n_val > L.MAX_UNLABELLED_SHARE:
        ctx.exclude(var, f"{n_unl} answers (non-locked rows) carry codes without value labels; option meanings undocumented")
        return False
    keys = sorted(opts)
    labels = [opts[k] for k in keys]
    multi = len(keys) == 2 and bool(MENTION0B.search(norm(labels[0]))) and not (norm(labels[0]) == "no" and norm(labels[1]) == "yes")
    if multi:
        tail = re.split(r"\s+-\s+|:\s+", label)[-1] if re.search(r"\s+-\s+|:\s+", label) else labels[1]
        if NONE_OTHER.search(norm(labels[1])) or NONE_OTHER.search(norm(tail)) or is_nonsub(labels[1]) or is_nonsub(tail):
            ctx.exclude(var, "multi-mention indicator for DK / refusal / none / other (non-substantive)")
            return False
    if not 2 <= len(keys) <= 11:
        ctx.exclude(var, f"{len(keys)} substantive options (rule: 2-11)")
        return False
    if n_unl:
        ctx.notes.append(f"{var}: {n_unl} answers (non-locked rows) with undocumented codes set to empty")
    text = text if text is not None else label
    opt = re.sub(r"^[A-Z]\. ", "", labels[1]) if multi else ""
    if multi and norm(opt) not in norm(text) and not re.match(r"^(marked|mentioned|selected|ticked|yes)$", norm(opt)):
        text = f"{text} — mentions: «{opt}»"
    codes = num.where(num.isin(keys))
    extra = dict(extra or {})
    extra["nonsubLabels"] = sorted({L.clean(v) for k, v in vl.items() if L.clean(v) and _f(k) in nonsub})
    ctx.add(var, codes, text, [(L.code_str(k), opts[k]) for k in keys], nonsub=[L.code_str(k) for k in sorted(nonsub)],
            label=label, text_source=text_source, stem=stem, multi=multi, qtype=qtype, extra=extra)
    return True


def _f(k):
    try:
        return float(k)
    except (TypeError, ValueError):
        return None


def new_demo(n):
    return W.new_demo(n)


def out_dir(root, *parts):
    return W.out_dir(root, *parts)


def finalize(root, sid, ctx, demo, meta, sources, *, func=None):
    """Thresholds (non-locked rows only), political flags, weight normalisation; writes resp/locked/items/provenance."""
    demo = demo.reset_index(drop=True)
    n = len(demo)
    if demo.country.isna().any():
        raise ValueError(f"{sid}: rows without country reached finalize")
    locked = sid in LOCKED
    lmask = (demo.country == "GR") if locked else pd.Series(False, index=demo.index)
    if locked and not (ctx.open == ~lmask).all():
        raise ValueError(f"{sid}: open mask does not match the non-Greek rows")
    omask = ~lmask
    w = pd.to_numeric(demo.weight, errors="coerce").astype(float)
    w = w.where(w > 0)
    wn = pd.Series(1.0, index=demo.index)
    for _c, idx in demo.groupby("country").groups.items():
        s = w.loc[idx]
        if s.notna().any():
            s = s.fillna(s.mean())
            wn.loc[idx] = s / s.mean()
    demo["weight"] = wn.round(6)
    demo.insert(0, "rid", [f"{sid}-{i + 1}" for i in range(n)])
    kept = []
    for it in ctx.items:
        codes = it["codes"]
        if len(codes) != n:
            raise ValueError(f"{sid}::{it['var']}: length mismatch")
        valid = [float(c) for c, _ in it["options"]]
        bad = codes.notna() & ~codes.isin(valid)
        n_bad_open = int((bad & omask).sum())
        codes = codes.where(~bad)
        k = len(it["options"])
        if not 2 <= k <= 11:
            ctx.exclude(it["var"], f"{k} substantive options (rule: 2-11)")
            continue
        oc = codes[omask]
        n_valid = int(oc.notna().sum())
        if n_valid < MIN_VALID:
            ctx.exclude(it["var"], f"{n_valid} valid answers{' (non-locked rows)' if locked else ''} (<{MIN_VALID})")
            continue
        if oc.dropna().nunique() < 2:
            ctx.exclude(it["var"], "fewer than 2 distinct answer codes observed on non-locked rows (constant / routing artefact)")
            continue
        if n_bad_open:
            ctx.notes.append(f"{it['var']}: {n_bad_open} answers with codes outside the documented options set to empty")
        n_cty = int(demo.country[omask & codes.notna()].nunique())
        if n_cty == 1 and demo.country[omask].nunique() >= 3:
            ctx.exclude(it["var"], "answered in one country only (country-specific question, not part of the common questionnaire)")
            continue
        it["codes"], it["nValid"], it["nCountries"] = codes, n_valid, n_cty
        kept.append(it)
    if ctx.empties:
        ctx.excluded.append({"variable": f"{len(ctx.empties)} variables", "reason": "no answers at all on non-locked rows",
                             "variables": ctx.empties})
    flags = [f and not re.search(r"[?;;]\s*[»”\"]?\s*$", it["text"]) for f, it in zip(L.battery_flags(kept), kept)]
    cols, items_out = {}, []
    for it, flag in zip(kept, flags):
        iid = f"{sid}::{it['var']}"
        mx = max(abs(float(c)) for c, _ in it["options"])
        cols[iid] = it["codes"].round().astype("Int16" if mx < 32000 else "Int32")
        pol = bool(it.get("political")) or W.is_political(it["text"]) or W.is_political(it.get("label") or "")
        if pol and it.get("notPolitical"):
            pol = False
            it["note"] = ((it.get("note") or "") + " " + it["notPolitical"]).strip()
        entry = {"id": iid, "var": it["var"], "text": it["text"], "textLanguage": it["language"],
                 "options": [{"code": c, "label": l} for c, l in it["options"]], "type": it["type"],
                 "stemMissing": bool(flag) or bool(it.get("wordingMissing")), "split": it.get("split", "all"),
                 "excludedFromTransfer": pol, "excludedReason": (it.get("politicalReason") or W.POLITICAL_REASON) if pol else None,
                 "label": it["label"], "textSource": it["textSource"], "nonsubCodes": it["nonsub"], "nValid": it["nValid"],
                 "nCountries": it["nCountries"]}
        if it.get("multi"):
            entry["multiMention"] = True
        if it.get("stem"):
            entry["stemAdded"] = True
        for k in ("note", "wordingMissing", "waveSpecificText", "nonsubLabels"):
            if it.get(k):
                entry[k] = it[k]
        items_out.append(entry)
    base = demo[DEMO_OUT].copy()
    frame = pd.concat([base, pd.DataFrame(cols, index=base.index)], axis=1)
    resp = frame[omask.values]
    if locked:
        assert not (resp.country == "GR").any(), f"{sid}: locked Greek rows leaked into resp"
    resp.to_csv(out_dir(root, "resp", f"{sid}.csv.gz"), index=False, compression="gzip")
    lpath = os.path.join(root, OUT_REL, "locked", f"{sid}.GR.csv.gz")
    n_locked = int(lmask.sum())
    if locked and n_locked:
        frame[lmask.values].to_csv(out_dir(root, "locked", f"{sid}.GR.csv.gz"), index=False, compression="gzip")
    elif os.path.exists(lpath):
        os.remove(lpath)
    del frame, resp, cols
    with open(out_dir(root, "items", f"{sid}.json"), "w", encoding="utf-8") as fh:
        json.dump(items_out, fh, ensure_ascii=False, indent=1)
    demo["wave"] = demo.wave.map(lambda v: v if isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}", v) else None)
    cw = demo.groupby("country").wave.agg(lambda s: L.earliest_month(s.dropna()) or None).to_dict()
    cw = {k: (v if isinstance(v, str) else None) for k, v in cw.items()}
    cn = demo.groupby("country").size().to_dict()
    countries = {c: {"n": int(cn[c]), "wave": cw.get(c)} for c in sorted(cn)}
    waves = sorted(v["wave"] for v in countries.values() if v["wave"])
    greek_role = ("final_locked" if locked else "dev") if "GR" in countries else "absent"
    entry = {"surveyId": sid, "title": meta["title"], "family": meta["family"], "source": meta["source"],
             "doi_or_url": meta["doi_or_url"], "licence": meta["licence"], "commercialUse": meta["commercialUse"],
             "aiTraining": meta["aiTraining"], "wave": waves[0] if waves else None, "waveApprox": meta["waveApprox"],
             "mode": meta["mode"], "sampling": meta["sampling"], "weightVar": meta["weightVar"], "countries": countries,
             "nItems": len(items_out), "greekRole": greek_role, "notes": list(meta.get("notes", [])) + ctx.notes}
    if locked and n_locked:
        entry["lockedHoldout"] = LOCKED[sid]
        entry["notes"].append(f"Greek rows are locked final holdout {LOCKED[sid]} (PHASE5_PREREGISTRATION, Τροποποίηση Α): written "
                              f"only to locked/{sid}.GR.csv.gz (n={n_locked}); nothing but the row count is computed for them.")
    entry["nRows"] = {"resp": int(omask.sum()), "locked": n_locked}
    entry["textLanguage"] = sorted({it["textLanguage"] for it in items_out})
    if meta.get("waveApproxCountries"):
        entry["waveApproxCountries"] = meta["waveApproxCountries"]
    prov = {"surveyId": sid, "generatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "harmonizer": {"script": SCRIPT_REL, "function": func, "command": f"python3 -I {SCRIPT_REL} --root . --only {sid}"},
            "sources": sources, "inclusionRule": INCLUSION_RULE, "minValidAnswers": MIN_VALID,
            "rows": entry["nRows"], "excluded": ctx.excluded, "notes": entry["notes"],
            "politicalFilter": W.POLITICAL_RX.pattern + " | Greek: " + W.POLITICAL_EL.pattern + " (religious/community/traditional/"
                               "business/famous leaders ignored)"}
    for k in ("weightNote", "overlap", "manifestSlug"):
        if k in meta:
            prov[k] = meta[k]
    with open(out_dir(root, "provenance", f"{sid}.json"), "w", encoding="utf-8") as fh:
        json.dump(prov, fh, ensure_ascii=False, indent=1)
    n_pol = sum(1 for it in items_out if it["excludedFromTransfer"])
    print(f"{sid}: resp rows={int(omask.sum())} countries={len(countries)} items={len(items_out)} (excludedFromTransfer={n_pol}) "
          f"excluded={len(ctx.excluded)}" + (f" | LOCKED GR rows={n_locked}" if locked else ""), flush=True)
    return entry


# ============================================================================== shared helpers

def manifest(root, slug):
    with open(os.path.join(root, RAW5, "manifest.jsonl"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                d = json.loads(line)
                if d["slug"] == slug:
                    return d
    return {}


def src(root, path):
    return W.src(root, path)


def raw(root, *parts):
    return os.path.join(root, RAW5, *parts)


def meta_base(man, **kw):
    out = {"doi_or_url": man.get("url_or_doi"), "licence": man.get("licence"), "commercialUse": man.get("commercialUse"),
           "aiTraining": man.get("aiTraining"), "manifestSlug": man.get("slug")}
    out.update(kw)
    return out


def edu_from(series, mapping):
    return pd.to_numeric(series, errors="coerce").map(lambda v: next((e for keys, e in mapping if v in keys), None) if v == v else None)


def pdf_text(pdf):
    return subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True, timeout=120).stdout


# ============================================================================== LiTS questionnaires (stems + lettered item rows)

Q_INSTR = re.compile(r"^(READ OUT|SINGLE CODE|SHOW ?CARD|MULTI ?CODE|MULTIPLE|CROSS ALL|INTERVIEWER|CAPI|DO NOT|ONLY IF|IF NECESSARY|"
                     r"PROBE|•|RANDOMI[SZ]E|ASK ALL|\(?ROTATE|OFFICIAL USE)", re.I)
LEAD_SCALE = re.compile(r"^(Neither [a-z]+ nor [a-z]+|Complete (dis)?trust|Strongly (dis)?agree|Not applicable|Don't know)\s+(?=[A-Z])")


def _left(line):
    return re.split(r"\s{3,}", line.strip())[0].strip()


STEM_FIXES = [(re.compile(r"^With which one of the following .*statements do you agree most\?.*$"),
               "With which one of the following statements do you agree most?"),
              (re.compile(r"^Did you vote in the most .*$"), "Did you vote in the most recent…"),
              (re.compile(r"^(Which of the following actions aimed at fighting climate change have you personally) friendly (taken\?)$"),
               r"\1 \2"),
              (re.compile(r"^Who makes the decisions about the following issues in your$"),
               "Who makes the decisions about the following issues in your household?"),
              (re.compile(r"^Here is a list of voluntary organizations\. For$"),
               "Here is a list of voluntary organizations. For each one, please indicate, whether you are an active member, an "
               "inactive member, or not a member of that type of organization")]
STEM_REJECT = re.compile(r"CAPI|to be offered|For option|^\d+/\d+$|CARD \d|^[–-]|^Yes No$|^.{0,11}$")


def _clean_stem(stem):
    stem = re.sub(r"\s+", " ", stem).strip()
    stem = re.sub(r"\s*\b(READ OUT|SINGLE CODE|SHOW ?CARD|MULTI ?CODE|MULTIPLE CODES?|INTERVIEWER|CROSS ALL|SINGLE|DO NOT PROMPT|"
                  r"DO NOT READ)\b.*$", "", stem).strip()
    stem = re.sub(r"^(ask only if|ask if|only if)\b[^?]*?\s(?=(Have|Do|Did|Are|Is|Was|Were|What|Which|How|Would|In|To|Please)\b)", "",
                  stem, flags=re.I)
    stem = re.sub(r"^in (either )?\d\.\d\d\w?( or \d\.\d\d\w?)?\s+", "", stem)
    stem = LEAD_SCALE.sub("", stem)
    for rx, rep in STEM_FIXES:
        if rx.match(stem):
            stem = rx.sub(rep, stem)
    return stem


def parse_lits_questionnaire(pdf):
    """{'4.01': stem}, {'4.01': {'a': row text}} from a LiTS master questionnaire ('(4.01)' or 'Q.3.01' question markers)."""
    try:
        lines = pdf_text(pdf).splitlines()
    except Exception:  # noqa: BLE001
        return {}, {}
    marks = []
    for i, ln in enumerate(lines):
        m = re.match(r"^\s*(?:\((\d{1,2})\.(\d{2})([a-z]?)\)|Q\.\s?(\d)\.\s?(\d{2})([a-z]?))\s*(.*)$", ln)
        if m:
            sec, num = m.group(1) or m.group(4), m.group(2) or m.group(5)
            marks.append((i, f"{int(sec)}.{num}{m.group(3) or m.group(6) or ''}", m.group(7)))
    stems, rows = {}, {}
    for k, (i, key, rest) in enumerate(marks):
        end = marks[k + 1][0] if k + 1 < len(marks) else min(len(lines), i + 120)
        parts, started, blanks, done = [], False, 0, False
        first = _left(rest) if rest.strip() else ""
        if first and not Q_INSTR.match(first) and not re.match(r"^\(\d", first):
            parts.append(first)
            started = True
            done = bool(re.search(r"\?\s*$", first))
        j = i + 1
        while j < end and not done:
            t = lines[j]
            j += 1
            if not t.strip():
                if started:
                    # continuation across layout gaps: next non-blank left chunk starting in lower case
                    nxt = next((x for x in lines[j:min(end, j + 20)] if x.strip()), "")
                    c2 = _left(nxt)
                    if c2[:1].islower() and not re.search(r"[?.:]\s*$", parts[-1]):
                        parts.append(c2)
                        j = lines.index(nxt, j) + 1 if nxt in lines[j:min(end, j + 20)] else j
                        done = bool(re.search(r"\?\s*$", c2))
                        continue
                    break
                blanks += 1
                if blanks > 12:
                    break
                continue
            c = _left(t)
            if not c:
                continue
            if Q_INSTR.match(c) or (started and re.match(r"^[a-z]\s{1,3}\S", t.strip())):
                if started:
                    break
                continue
            letters = [ch for ch in c if ch.isalpha()]
            if letters and sum(ch.isupper() for ch in letters) / len(letters) > 0.7:
                if started:
                    break
                continue
            if re.match(r"^-?\d+(\s|$|/)", c):
                if started:
                    break
                continue
            parts.append(c)
            started = True
            done = bool(re.search(r"\?\s*$", c))
        stem = _clean_stem(" ".join(parts))
        if stem and not re.match(r"^\(?\d", stem) and not STEM_REJECT.search(stem):
            stems[key] = stem
        r, prev = {}, ""
        for jj in range(i + 1, end):
            t = lines[jj]
            m2 = re.match(r"^\s{0,4}([a-z])\s+(\S.*)$", t)
            if m2:
                txt_ = _left(m2.group(2))
                if re.match(r"^[\d\s-]+$", txt_):
                    txt_ = ""
                cand = txt_ or prev
                ok = cand if cand[:1].isupper() or cand[:1] in "….\"'[(" else ""
                if ok or not r.get(m2.group(1)):
                    r[m2.group(1)] = ok
                prev = ""
            else:
                c = _left(t)
                if c and not Q_INSTR.match(c) and not re.match(r"^[\d\s-]+$", c):
                    prev = c
        if r:
            rows[key] = r
    return stems, rows


def lits_key(var):
    """'q401a' -> ('4.01', 'a'); 'PRq315' -> ('3.15', None); 'q715_1' -> ('7.15', 'a'); 'q814if' -> ('8.14', 'f')."""
    m = re.match(r"^(?:PR|SR)?q(\d)(\d\d)([a-z]{0,2})(?:_(\d+))?", var)
    if not m:
        return None, None
    key = f"{m.group(1)}.{m.group(2)}"
    if len(m.group(3)) == 1 and m.group(4) and 0 < int(m.group(4)) < 27:  # 'q307a_02': sub-question a, option 02
        return key, chr(96 + int(m.group(4)))
    letter = m.group(3)[-1] if m.group(3) else (chr(96 + int(m.group(4))) if m.group(4) and 0 < int(m.group(4)) < 27 else None)
    return key, letter


def lits_text(var, label, stems, rows, *, label_is_item=True):
    """Question text: master-questionnaire stem (+ item row / item label for battery members). Returns (text, stem, source)."""
    key, letter = lits_key(var)
    stem = stems.get(key)
    core = re.sub(r"^(Primary respondent - )?\(\d\.\d\d\)\s*", "", label)
    if not stem:
        return label, None, "Stata variable label"
    row = rows.get(key, {}).get(letter) if letter else None
    if letter and (row or label_is_item):
        item = row if (row and len(row) > 3) else core
        return f"{stem} — {item}", stem, ("master questionnaire question text + item row" if (row and len(row) > 3)
                                         else "master questionnaire question text + item label (Stata variable label)")
    return stem, None, "master questionnaire question text"


def lits_country(name):
    t = W.name_key(name)
    extra = {"slovak rep": "SK", "czech rep": "CZ", "kyrgyz rep": "KG", "bosnia and herz": "BA", "fyr macedonia": "MK",
             "kosovo": "XK", "bosnia herzegovina": "BA", "great britain": "GB", "macedonia": "MK", "bosnia": "BA", "czechrep": "CZ",
             "fyrom": "MK", "kyrgyzstan": "KG", "slovakia": "SK"}
    return extra.get(t) or W.iso2(name)


LITS_SERVICES = {"a": "Interact with the road police",
                 "b": "Request official documents (e.g. passport, visa, birth or marriage certificate, land register, etc.) from "
                      "authorities",
                 "c": "Go to courts for a civil matter", "d": "Receive public education (primary or secondary)",
                 "e": "Receive public education (vocation)", "f": "Receive medical treatment in the public health system",
                 "g": "Request unemployment benefits", "h": "Request other social security benefits"}
# column headers of the public-services matrix (transcribed from the master questionnaires; the PDF layout defeats the parser)
LITS_MATRIX = {
    "often": "In your opinion, how often do people like you have to make unofficial payments or gifts in these situations?",
    "used": "During the past 12 months have you or any member of your household used these services?",
    "satisfied": "How satisfied were you with the quality and the efficiency of the service/interaction?",
    "paid": "Did you or any member of your household make an unofficial payment or gift when using these services over the past "
            "12 months?",
    "why": "Why did you make an informal payment for services you should have received for free?"}
LITS3_STEMS = {"8.01": LITS_MATRIX["often"], "8.02": LITS_MATRIX["used"], "8.03": LITS_MATRIX["satisfied"], "8.04": LITS_MATRIX["paid"],
               "8.05": "Did you report any of the incidents where you or a member of your household made an unofficial payment or gift "
                       "to a government official/someone in authority?",
               "8.06": "Which of the following happened the most recent time that you reported a bribery incident?",
               "8.07": LITS_MATRIX["why"],
               "4.20": "What was the most important factor influencing who you voted for during the last election?"}
LITS2_STEMS = {"6.01": LITS_MATRIX["often"], "6.02": LITS_MATRIX["used"], "6.03": LITS_MATRIX["satisfied"], "6.04": LITS_MATRIX["paid"],
               "6.05": LITS_MATRIX["why"],
               "7.13": "Here is a list of voluntary organizations. For each one, please indicate, whether you are an active member, an "
                       "inactive member, or not a member of that type of organization",
               "3.20": "What was the most important factor influencing who you voted for…",
               "5.26": "Suppose you were working and could choose between different kinds of jobs. Which of the following would you "
                       "personally choose?",
               "6.07": "Have you encountered any of these problems with your local public schools during the past 12 months?",
               "6.13": "Have you encountered any of these problems with your local public health clinic or hospital during the past 12 "
                       "months?",
               "6.14": "Do you know where to file a complaint if you were dissatisfied with your local public clinic or hospital?",
               "6.21": "How has the overall performance of […LEVEL OF GOVT...] changed in the past 3 years?"}
LITS_ELECTIONS = {"a": "...local-level elections", "b": "…parliamentary elections", "c": "…presidential elections"}
LITS_GOVT = {"a": "Local government", "b": "Regional government", "c": "National government"}
LITS2_ROWSETS = {"3.05": {"a": "First priority", "b": "Second priority"}, "3.20": LITS_ELECTIONS, "6.20": LITS_GOVT, "6.21": LITS_GOVT,
                 "3.06": {"a": "…improve public education", "b": "…improve the public health system", "c": "…combat climate change",
                          "d": "…help the needy"},
                 "3.21": {"a": "(a) Local level", "b": "(b) Regional level"},
                 "4.05": {"a": "The causes of climate change", "b": "The consequences of climate change",
                          "c": "Ways in which we can slow down climate change", "d": "Ways in which we can adapt to climate change"},
                 "6.18": {"a": "Newspaper", "b": "News broadcasts on radio or TV", "c": "Printed magazines",
                          "d": "In-depth reports on radio or TV", "e": "Internet, Email", "f": "Talk with family, friends or colleagues"},
                 "7.13": {"b": "Sport and recreational organizations and associations", "c": "Art, music or educational organizations",
                          "e": "Environmental organization", "f": "Professional associations",
                          "g": "Humanitarian or charitable organization", "h": "Youth associations"},
                 **{f"6.0{k}": LITS_SERVICES for k in range(1, 6)}}
LITS2_FOLLOWUP = {"q307b", "q327b", "q401b"}  # 'And which is the most important?' follow-ups (sub-question b, not a row b)
LITS2_SUFFIX = {"q310": "[statements on the economic system]", "q311": "[statements on the political system]",
                **{v: "[public schools in your area]" for v in ("q609", "q610", "q611")},
                **{v: "[your local public clinic or hospital]" for v in ("q615", "q616", "q617")}}


def dedupe_texts(texts, labels):
    """texts {var: [text, stem, source]}; identical texts of different variables get ' — <variable label>' appended."""
    cnt = pd.Series([t[0] for t in texts.values()]).value_counts()
    for v, t in texts.items():
        if cnt.get(t[0], 0) > 1 and labels.get(v) and norm(labels[v]) not in norm(t[0]):
            t[0] = f"{t[0]} — {labels[v]}"
            t[2] += " + item label (Stata variable label) to separate identical question texts"
    return texts


# ---------------------------------------------------------------------------- LiTS III (2016) — Greek rows LOCKED (F3e)

LITS3_EXCL = [
    (r"^q60[12]$|^q608$", "job-search status / reason not looking (incl. sickness) — labour-market background"),
    (r"^q70[26]$|^q705", "business as primary occupation / sector / date (occupation background)"),
    (r"^q901$", "self-assessed health (GDPR art. 9 health data)"),
    (r"^q90[23]$|^q927$", "body weight / height (GDPR art. 9 health data)"),
    (r"^q905$", "hours of TV (numeric, no value labels)"),
    (r"^q90[6-9]|^q91[01]|^q914", "family origin / residence / migration history (demographic background)"),
    (r"^q916", "parents' occupation (socio-economic background)"),
    (r"^q917$|^q918", "political-party membership (GDPR art. 9 political opinions)"),
    (r"^q919a$", "membership of church / religious organisation (GDPR art. 9 religion)"),
    (r"^q919d$", "labour-union membership (GDPR art. 9 trade-union membership)"),
    (r"^q920", "Communist-party membership of respondent / family (GDPR art. 9 political opinions)"),
    (r"^q922$|^q923", "religion / ethnicity of the respondent (GDPR art. 9)"),
    (r"^q92[456]", "war / persecution victimisation history of respondent and family (health, political, religious — GDPR art. 9)"),
    (r"^q928", "interview paradata (others present)"),
]


def h_lits3(root):
    sid = "lits3"
    base = raw(root, "ebrd_lits_iii")
    path = os.path.join(base, "lits_iii.dta")
    qpdf = os.path.join(base, "LiTS-III-Questionnaire.pdf")
    man = manifest(root, "ebrd_lits_iii")
    stems, rows = parse_lits_questionnaire(qpdf)
    _, m = pyreadstat.read_dta(path, metadataonly=True)
    labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
    excl_pre = []
    cand = []
    for var in m.column_names:
        if not re.match(r"^(PRq3(01|06|13|15|16|17)|q[4-9]\d\d[a-z_0-9]*)$", var):
            continue
        r = next((rr for rx, rr in LITS3_EXCL if re.search(rx, var)), None)
        lab = L.clean(labs.get(var) or "")
        r = r or W.skip_reason(var, lab, sensitive=False, demographic=False)
        if r:
            excl_pre.append((var, r))
            continue
        cand.append(var)
    use = ["country", "age_pr", "gender_pr", "q109_1", "urban", "weight_sample", "outcome1_month"] + cand
    df, _ = pyreadstat.read_dta(path, usecols=use)
    n0 = len(df)
    cty = df.country.map(lits_country)
    age = pd.to_numeric(df.age_pr, errors="coerce").where(lambda a: a >= 0)
    drop = cty.isna() | (age < 17)
    df, cty, age = (x[~drop].reset_index(drop=True) for x in (df, cty, age))
    demo = new_demo(len(df))
    demo["country"] = cty.values
    demo["weight"] = pd.to_numeric(df.weight_sample, errors="coerce").values
    demo["age_band"] = age.map(W.age_band)
    demo["gender"] = W.mf(df.gender_pr, 1, 2)
    demo["edu3"] = edu_from(df.q109_1, [((1, 2, 3), "low"), ((4, 5), "medium"), ((6, 7, 8), "high")])
    demo["urban"] = pd.to_numeric(df.urban, errors="coerce").map({1.0: "urban", 2.0: "rural"})
    mon = pd.to_numeric(df.outcome1_month, errors="coerce")
    ym = mon.map(lambda v: None if v != v or not 1 <= v <= 12 else f"{2015 if v >= 9 else 2016}-{int(v):02d}")
    demo["wave"] = demo.country.map(W.country_waves(demo.country, ym, "2016-01"))
    ctx = Ctx(sid, ~(demo.country == "GR"))
    for v, r in excl_pre:
        ctx.exclude(v, r)
    ctx.exclude("section 1 (household roster q101-q112), section 2 (q201-q225, household finances / dwelling; answered by the "
                "sections 1-2 household informant, not the sampled primary respondent)", "household roster / household-informant section")
    ctx.exclude("PRq302-PRq305, PRq307-PRq312", "per-dwelling / per-plot ownership roster details (owner codes, deeds, plot use)")
    ctx.exclude("PRq501-PRq528 (section 5)", "labour-market status / job / business characteristics (labour-market background)")
    ctx.exclude("SRq3xx / SRq5xx", "secondary-respondent answers (a different person from the primary respondent whose "
                                   "demographics are recorded)")
    ctx.exclude("q1001-q1012 (section 10)", "Greece-only country module (crisis impact, crisis blame incl. party names, vote recall "
                                            "2009-2015, referendum vote): not part of the common questionnaire; not read")
    ctx.exclude("interviewer, PSU, district, coordinates, visit outcomes, timestamps, C1-C3, e1a-e1m, weights",
                "admin / geography / paradata / weights")
    stems.update(LITS3_STEMS)
    rows.update({f"8.0{k}": LITS_SERVICES for k in range(1, 8)})
    rows["4.20"] = LITS_ELECTIONS
    lab_of = {var: L.clean(labs.get(var) or "") for var in cand}
    texts = {var: list(lits_text(var, lab_of[var], stems, rows)) for var in cand}
    texts = dedupe_texts(texts, lab_of)
    n_stem = 0
    for var in cand:
        lab = lab_of[var]
        text, stem, how = texts[var]
        n_stem += text != lab
        add_labelled(ctx, var, df[var], lab, W.vl_mark(vls.get(var)), text=text, stem=stem,
                     qtype="ordinal" if re.match(r"^(PRq31[5-7]|q417|q428)", var) else None,
                     text_source=f"LiTS III {how} (LiTS-III-Questionnaire.pdf)" if text != lab else "Stata variable label")
    meta = meta_base(man, title="EBRD Life in Transition Survey III (2016)", family="lits",
                     source="EBRD / World Bank, LiTS III (lits_iii.dta) + master questionnaire (LiTS-III-Questionnaire.pdf)",
                     waveApprox=False, mode="Face-to-face household survey (CAPI/PAPI), two-stage random sample (PSU + random walk)",
                     sampling="Nationally representative household samples (~1,500 per country); primary respondent = household head "
                              "or a knowledgeable member (sections 3-9)",
                     weightVar="weight_sample (survey weights adding up to the number of interviews per country)",
                     notes=[f"Rows in file: {n0}; dropped {int(drop.sum())} (aged <17 or unmapped country).",
                            "Demographics of the primary respondent: gender_pr, age_pr; edu3 from q109_1 (no degree / primary / lower "
                            "secondary = low; upper secondary / post-secondary non-tertiary = medium; tertiary (incl. bachelor, "
                            "master, PhD) = high); urban from 'urban'.",
                            "Items: primary-respondent sections 3 (selected: second dwelling, land, bank account, wealth ladders), "
                            "4 (attitudes and values), 6-9 (job search, entrepreneurship, governance / corruption, media / civic). "
                            "Secondary-respondent block, household sections 1-2 and the Greece-only section 10 are excluded.",
                            f"Item wording: {n_stem} items with question text parsed from the master questionnaire (stem + item row "
                            "or item label), others = Stata variable label.",
                            "wave: month of the first visit (outcome1_month) with year inferred from the fieldwork window "
                            "(Sep-Dec -> 2015, Jan-Aug -> 2016); earliest month holding >=1% of a country's rows.",
                            "'Difficult to say', 'Haven't heard enough to say', DK / refusal / not applicable -> empty.",
                            "XK = Kosovo (user-assigned code)."])
    return finalize(root, sid, ctx, demo, meta, [src(root, path), src(root, qpdf)], func="h_lits3")


# ---------------------------------------------------------------------------- LiTS II (2010) — no Greece (training only)

LITS2_EXCL = [
    (r"^q50[1-9]|^q51[0-6]|^q52[1245]$", "work / job / education history (labour-market and demographic background)"),
    (r"^q517$", "currently a student (education status; demographic background)"),
    (r"^q70[1-3]$", "marital status / partner / born in country (demographic)"),
    (r"^q704$", "self-assessed health (GDPR art. 9 health data)"),
    (r"^q70[5-7]|^q710", "residence / migration history (demographic background)"),
    (r"^q712$", "political-party membership (GDPR art. 9 political opinions)"),
    (r"^q713a$", "membership of church / religious organisation (GDPR art. 9 religion)"),
    (r"^q713d$", "labour-union membership (GDPR art. 9 trade-union membership)"),
    (r"^q714", "Communist-party membership of respondent / family (GDPR art. 9 political opinions)"),
    (r"^q716$|^q717|^q720", "religion / mother tongue / ethnicity (GDPR art. 9)"),
    (r"^q71[89]$", "parents' education (socio-economic background)"),
    (r"^q721", "war / conflict victimisation history (health; GDPR art. 9)"),
    (r"^q619$", "TV minutes (numeric)"),
]
LITS2_MISSING = {-99.0: "Refused", -98.0: "Not applicable", -97.0: "Don't know", -90.0: "Filtered", -1.0: "Not stated"}
LADDER = {float(k): (f"{k} (poorest 10%)" if k == 1 else f"{k} (richest 10%)" if k == 10 else str(k)) for k in range(1, 11)}
POLES = {"q316a": ("Incomes should be made more equal", "We need larger income differences as incentives for individual effort"),
         "q316b": ("Private ownership of business and industry should be increased",
                   "Government ownership of business and industry should be increased"),
         "q316c": ("Competition is good. It stimulates people to work hard and develop new ideas",
                   "Competition is harmful. It brings out the worst in people"),
         "q316d": ("People should obey the law without exception", "There are times when people have good reasons to break the law"),
         "q316e": ("As citizens, we should be more active in questioning the actions of our authorities",
                   "In our country today, we should show more respect for our authorities")}
LITS2_QVL = {**{v: {**{float(k): str(k) for k in range(2, 10)}, 1.0: f"1 {a}", 10.0: f"10 {b}"} for v, (a, b) in POLES.items()},
             "q330": LADDER, "q331": LADDER, "q332": LADDER,
             "q537": {**{float(k): str(k) for k in range(2, 10)}, 1.0: "1 Not willing to take risks at all",
                      10.0: "10 Very much willing to take risks"},
             "q722": {**{float(k): str(k) for k in range(2, 10)}, 1.0: "1 Completely dissatisfied", 10.0: "10 Completely satisfied"}}


def lits2_label_core(label):
    t = re.sub(r"\{[^}]*\}", "", label)
    t = re.sub(r"^(q\w+|Q\.\s?\d?\.?\d+\w*)\s*-?\s*", "", t).strip()
    return t


def h_lits2(root):
    sid = "lits2"
    base = raw(root, "ebrd_lits_ii")
    path = os.path.join(base, "lits2.dta")
    qpdf = os.path.join(base, "LiTSII_Questionnaire.pdf")
    man = manifest(root, "ebrd_lits_ii")
    stems, rows = parse_lits_questionnaire(qpdf)
    _, m = pyreadstat.read_dta(path, metadataonly=True)
    labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
    excl_pre, cand = [], []
    for var in m.column_names:
        if not re.match(r"^q[3-7]\d\d[a-z_0-9]*$", var):
            continue
        r = next((rr for rx, rr in LITS2_EXCL if re.search(rx, var)), None)
        lab = L.clean(labs.get(var) or "")
        r = r or W.skip_reason(var, lab, sensitive=False, demographic=False)
        if r:
            excl_pre.append((var, r))
            continue
        cand.append(var)
    use = ["country", "respondentage", "respondentgender", "q515", "weight"] + cand
    df, _ = pyreadstat.read_dta(path, usecols=use)
    n0 = len(df)
    clab = vls.get("country", {})
    cty = pd.to_numeric(df.country, errors="coerce").map(lambda c: lits_country(re.sub(r"\{[^}]*\}", "", clab.get(c, ""))) if c == c else None)
    age = pd.to_numeric(df.respondentage, errors="coerce").where(lambda a: a >= 0)
    drop = cty.isna() | (age < 17)
    df, cty, age = (x[~drop].reset_index(drop=True) for x in (df, cty, age))
    demo = new_demo(len(df))
    demo["country"] = cty.values
    demo["weight"] = pd.to_numeric(df.weight, errors="coerce").values
    demo["age_band"] = age.map(W.age_band)
    demo["gender"] = W.mf(df.respondentgender, 1, 2)
    demo["edu3"] = edu_from(df.q515, [((1, 2, 3), "low"), ((4, 5), "medium"), ((6, 7), "high")])
    demo["wave"] = "2010-09"
    ctx = Ctx(sid, pd.Series(True, index=demo.index))
    for v, r in excl_pre:
        ctx.exclude(v, r)
    ctx.exclude("section 1 (roster), section 2 (q201-q229, housing and expenses; answered by the household head or other "
                "knowledgeable member), section 8 (q801-q816, crisis impact; respondent = head of household)",
                "household roster / household-informant sections (not the randomly selected respondent)")
    ctx.exclude("psu, hh, select, oneper, Locality, Region1/2, age/sex population cells, XCweight, weight", "admin / geography / weights")
    stems.update(LITS2_STEMS)
    rows.update(LITS2_ROWSETS)
    texts, cores = {}, {}
    for var in cand:
        lab = L.clean(labs.get(var) or "")
        core = lits2_label_core(lab)
        cores[var] = core
        key, letter = lits_key(var)
        stem = stems.get(key)
        q_part, item_part = (core.split("?:", 1) + [""])[:2] if "?:" in core else (core, "")
        q_part = q_part.strip() + ("?" if "?:" in core else "")
        row = rows.get(key, {}).get(letter) if letter and var not in LITS2_FOLLOWUP else None
        if var in LITS2_FOLLOWUP:
            letter = None
        complete_q = bool(re.search(r"[?.]\s*$", q_part)) and len(core) < 76 and key not in LITS2_STEMS
        qtext = q_part if complete_q else (stem or q_part)
        if letter and (row or item_part):
            text = f"{qtext} — {row if row and len(row) > 3 else item_part.strip()}"
            how = "master questionnaire question text + item row" if not complete_q else "Stata variable label + questionnaire item row"
        else:
            text = qtext
            how = "Stata variable label" if complete_q or not stem else "master questionnaire question text"
        if var in LITS2_FOLLOWUP and stem:
            text, how = f"{stem} {core}", "master questionnaire question text + follow-up (Stata variable label)"
        if var in LITS2_SUFFIX:
            text = f"{text} {LITS2_SUFFIX[var]}"
            how += " + bracketed context from the questionnaire layout"
        texts[var] = [text, stem if text != core else None, how]
    texts = dedupe_texts(texts, cores)
    n_q = 0
    for var in cand:
        text, stem, how = texts[var]
        n_q += how != "Stata variable label"
        vl = LITS2_QVL.get(var) or vls.get(var)
        if var in LITS2_QVL and vls.get(var):
            vl = {**vls[var], **LITS2_QVL[var]}
        if vl:  # file-wide missing codes (labelled on most variables, unlabelled on some): documented, non-substantive
            vl = {**LITS2_MISSING, **{k: re.sub(r"\(\+q\d+oth\d*\+\)", "Other (specify)", str(x)) for k, x in vl.items()}}
        if var in LITS2_QVL:
            ctx.notes.append(f"{var}: substantive value labels taken from the master questionnaire (scale end points); the "
                             "Stata file labels only the missing codes or carries placeholder labels ('answering1/2')")
        add_labelled(ctx, var, df[var], cores[var], W.vl_mark(vl), text=text, stem=stem,
                     qtype="ordinal" if re.match(r"^(q33[0-2]|q316|q322|q537|q722)", var) else None,
                     text_source=f"LiTS II {how} (LiTSII_Questionnaire.pdf)")
    meta = meta_base(man, title="EBRD Life in Transition Survey II (2010)", family="lits",
                     source="EBRD / World Bank, LiTS II (lits2.dta) + master questionnaire (LiTSII_Questionnaire.pdf)",
                     waveApprox=True, mode="Face-to-face household survey, two-stage random sample",
                     sampling="Nationally representative household samples (~1,000 per country, ~1,500 in some); one randomly "
                              "selected adult answers sections 3-7",
                     weightVar="weight (democratic weight; each country's weights add up to its population)",
                     notes=[f"Rows in file: {n0}; dropped {int(drop.sum())} (aged <17 or unmapped country). No Greek rows (training only).",
                            "Demographics of the randomly selected respondent: respondentage, respondentgender (1 male, 2 female; "
                            "verified against the roster entry of the selected member); edu3 from q515 (no degree / primary / lower "
                            "secondary = low; upper secondary / post-secondary non-tertiary = medium; bachelor+ = high). No urban "
                            "variable in the file.",
                            "No interview dates in the file: wave = 2010-09 for all countries (fieldwork autumn 2010; approximate).",
                            "Items: sections 3 (attitudes and values), 4 (climate change), 5 (selected attitudes: training wish, job "
                            "chances, job preferences, mobility, entrepreneurship, risk), 6 (governance, public services, media), "
                            "7 (move intentions, civic participation, voluntary organisations, life satisfaction).",
                            f"Item wording: {n_q} items with question text / item rows from the master questionnaire, others = Stata "
                            "variable label (prefix removed). 'Filtered' (-90) and 'Not stated' (-1) are non-substantive codes; the "
                            "file-wide missing codes (-99 refused, -98 n/a, -97 DK, -90 filtered, -1 not stated) are treated as "
                            "non-substantive also where a variable's own value-label set omits them.",
                            "Ladders q330-q332, risk q537 and life satisfaction q722 carry no substantive value labels in the file; "
                            "end-point labels transcribed from the master questionnaire."])
    return finalize(root, sid, ctx, demo, meta, [src(root, path), src(root, qpdf)], func="h_lits2")


# ---------------------------------------------------------------------------- LiTS I (2006) — no Greece (training only)

LITS1_EXCL = [
    (r"^q702", "Communist-party membership (GDPR art. 9 political opinions)"),
    (r"^q703_1$", "political-party membership (GDPR art. 9 political opinions)"),
    (r"^q705$", "self-assessed health (GDPR art. 9 health data)"),
    (r"^q70[6-9]", "religion / nationality / ethnic minority / language (GDPR art. 9 / demographic)"),
]


def h_lits1(root):
    sid = "lits1"
    base = raw(root, "ebrd_lits_i")
    path = os.path.join(base, "LITS-2006-data.dta")
    qpdf = os.path.join(base, "LiTSI_Questionnaire.pdf")
    man = manifest(root, "ebrd_lits_i")
    stems, _rows = parse_lits_questionnaire(qpdf)
    _, m = pyreadstat.read_dta(path, metadataonly=True)
    labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
    excl_pre, cand = [], []
    for var in m.column_names:
        if not re.match(r"^(q3\d\d[a-z_0-9]*|q70[1-9][a-z_0-9]*)$", var):
            continue
        r = next((rr for rx, rr in LITS1_EXCL if re.search(rx, var)), None)
        if r:
            excl_pre.append((var, r))
            continue
        cand.append(var)
    use = ["countryname", "ageB", "genderB", "q501", "weight_0"] + cand
    df, _ = pyreadstat.read_dta(path, usecols=use)
    n0 = len(df)
    cty = df.countryname.map(lits_country)
    age = pd.to_numeric(df.ageB, errors="coerce")
    drop = cty.isna() | (age < 17)
    df, cty, age = (x[~drop].reset_index(drop=True) for x in (df, cty, age))
    demo = new_demo(len(df))
    demo["country"] = cty.values
    demo["weight"] = pd.to_numeric(df.weight_0, errors="coerce").values
    demo["age_band"] = age.map(W.age_band)
    demo["gender"] = pd.to_numeric(df.genderB, errors="coerce").map({1.0: "male", 0.0: "female"})
    demo["edu3"] = edu_from(df.q501, [((1, 2), "low"), ((3, 4), "medium"), ((5, 6), "high")])
    demo["wave"] = "2006-08"
    ctx = Ctx(sid, pd.Series(True, index=demo.index))
    for v, r in excl_pre:
        ctx.exclude(v, r)
    ctx.exclude("section 1 (roster), section 2 (q201-q215, housing and expenses; answered by the household head)",
                "household roster / household-informant section")
    ctx.exclude("sections 4-6 (q401-q414 current activities, q501-q516 education and labour, q601-q606 life history)",
                "labour-market status, job characteristics, education and life history (demographic / labour-market background)")
    ctx.exclude("q801-q803 (interviewer assessment), id, serial, city, region, table1/3, respA/B, ageA/B, tags, weights, pcexp, "
                "decile, igroup, eqsize", "admin / paradata / derived / weights")
    texts, lab_of = {}, {}
    for var in cand:
        lab = L.clean(labs.get(var) or "")
        lab_of[var] = lab
        key, _letter = lits_key(var)
        stem = stems.get(key)
        multi_item = bool(re.search(r"_\d+$|[a-z]$", var)) and stem is not None and not re.match(r"^q30[6-9]$|^q31[01]$|^q701$", var)
        text = f"{stem} — {lab}" if (stem and multi_item) else (stem or lab)
        how = ("LiTS I master questionnaire question text" + (" + item label (Stata variable label)" if multi_item else "")
               + " (LiTSI_Questionnaire.pdf)") if text != lab else "Stata variable label (paraphrase)"
        texts[var] = [text, stem if multi_item else None, how]
    texts = dedupe_texts(texts, lab_of)
    n_stem = 0
    for var in cand:
        text, stem, how = texts[var]
        n_stem += text != lab_of[var]
        add_labelled(ctx, var, df[var], lab_of[var], W.vl_mark(vls.get(var)), text=text, stem=stem, text_source=how)
    meta = meta_base(man, title="EBRD Life in Transition Survey I (2006)", family="lits",
                     source="EBRD / World Bank, LiTS 2006 (LITS-2006-data.dta) + master questionnaire (LiTSI_Questionnaire.pdf)",
                     waveApprox=True, mode="Face-to-face household survey, two-stage random sample",
                     sampling="Nationally representative household samples (~1,000 per country); sections 3-7 answered by a "
                              "Kish-grid selected adult",
                     weightVar="weight_0 (democratic weight)",
                     notes=[f"Rows in file: {n0}; dropped {int(drop.sum())} (aged <17 or unmapped country). No Greek rows (training only).",
                            "Demographics of the Kish-grid respondent: ageB, genderB (1 = male, 0 = female: spouses of the household "
                            "head are 96% coded 0), edu3 from q501 (no degree / compulsory = low; secondary / vocational = medium; "
                            "higher professional / postgraduate = high). No urban variable.",
                            "No interview dates in the file: wave = 2006-08 for all countries (fieldwork Aug-Oct 2006; approximate).",
                            "Items: section 3 (attitudes and values, public services) and q701 / q703_2 / q704 (voting, civic "
                            "membership, protest potential).",
                            f"Item wording: {n_stem} items with the master-questionnaire question text (+ the Stata item label, a short "
                            "English paraphrase of the row), others = Stata variable label (paraphrase).",
                            "Several LiTS I items refer to 1989 ('w.r.t. 1989', 'before 1989') — kept as asked."])
    return finalize(root, sid, ctx, demo, meta, [src(root, path), src(root, qpdf)], func="h_lits1")


# ============================================================================== QoG EQI 2010 / 2013 (combined file) and 2017

QOG_CTY = {"belgique": "BE", "croatie": "HR", "grece": "GR", "danemark": "DK", "suede": "SE", "uk": "GB", "kosovo": "XK"}


def qog_country(label):
    t = W.name_key(label)
    return QOG_CTY.get(t) or W.iso2(label)


def parse_qog_codebook(pdf):
    """{'q7': 'Certain people are given ...'} from section 2.2 / 2.3 entries ('2.2.7  q7 - text')."""
    lines = pdf_text(pdf).splitlines()
    out = {}
    for i, ln in enumerate(lines):
        mm = re.match(r"^\s*2\.[23]\.\d+\s+(q\w+?)\s*[-–]\s*(.+)$", ln)
        if not mm:
            continue
        parts = [mm.group(2).strip()]
        for nxt in lines[i + 1:i + 6]:
            t = nxt.strip()
            if not t or re.match(r"^(\(\d+\)|Very|Strongly|Extremely|Success|Don’t trust|Don't trust|Agree|Totally|Note:|Randomize|"
                                 r"Each respondent|\"Don|“Don|poor|disagree|\d)", t):
                break
            parts.append(t)
        text = re.sub(r"\s+", " ", " ".join(parts)).strip()
        text = re.sub(r"\s*\[2013 ONLY\]\s*", " ", text).strip()
        text = re.sub(r"(\w)- (\w)", r"\1\2", text)  # hyphenation at line ends ('COUN- TRY')
        out[mm.group(1).lower()] = text
    return out


_QOG_CACHE = {}


def qog13_load(root):
    if "df" in _QOG_CACHE:
        return _QOG_CACHE["df"], _QOG_CACHE["m"]
    path = raw(root, "qog_eqi_2013_individual", "qog_eqi_ind_2013.dta")
    _, m = pyreadstat.read_dta(path, metadataonly=True)
    items = [v for v in m.column_names if re.match(r"^q\d+[a-z]?(_\d)?$", v)]
    df, _ = pyreadstat.read_dta(path, usecols=["resp_id", "year", "country", "d1", "d2", "d3", "d6", "gender", "Edu3", "Population",
                                                "Dweight", "PSweight"] + items)
    _QOG_CACHE.update(df=df, m=m)
    return df, m


QOG10_TEXT = {"q18": ("Elections in my area are honest and clean from corruption.", "EQI 2010 wording (codebook note to q18)"),
              "q19": ("In your opinion, if corruption by a public employee or politician were to occur in your area, how likely is "
                      "it that such corruption would be exposed by the local mass media?", "EQI 2010 wording (codebook note to q19)")}
QOG10_OPTS = {"q19": {0.0: "0 Extremely unlikely", 10.0: "10 Extremely likely"}}


def h_qog_1013(root, year):
    sid = f"qog{year}"
    path = raw(root, "qog_eqi_2013_individual", "qog_eqi_ind_2013.dta")
    pdf = raw(root, "qog_eqi_2013_individual", "qog_eqi_2013.pdf")
    man = manifest(root, "qog_eqi_2013_individual")
    texts = parse_qog_codebook(pdf)
    dfa, m = qog13_load(root)
    vls, labs = m.variable_value_labels or {}, m.column_names_to_labels or {}
    df = dfa[pd.to_numeric(dfa.year, errors="coerce") == year].reset_index(drop=True)
    n0 = len(df)
    clab = vls.get("country", {})
    cty = pd.to_numeric(df.country, errors="coerce").map(lambda c: qog_country(clab.get(c)) if c == c else None)
    if year == 2013:
        age = pd.to_numeric(df.d3, errors="coerce").where(lambda a: a < 999)
    else:
        age = pd.Series(np.nan, index=df.index)
    drop = cty.isna() | (age < 17)
    df, cty, age = (x[~drop].reset_index(drop=True) for x in (df, cty, age))
    demo = new_demo(len(df))
    demo["country"] = cty.values
    ps = pd.to_numeric(df.PSweight, errors="coerce")
    demo["weight"] = ps.where(ps > 0, pd.to_numeric(df.Dweight, errors="coerce")).values
    demo["age_band"] = age.map(W.age_band)
    if year == 2013:
        demo["gender"] = W.mf(df.d1, 1, 2)
        demo["edu3"] = edu_from(df.d2, [((1, 2), "low"), ((3,), "medium"), ((4, 5), "high")])
        demo["urban"] = pd.to_numeric(df.d6, errors="coerce").map({1.0: "rural", 2.0: "urban", 3.0: "urban", 4.0: "urban"})
        demo["wave"] = "2013-01"
    else:
        demo["gender"] = W.mf(df.gender, 0, 1)
        demo["edu3"] = edu_from(df.Edu3, [((1,), "low"), ((2,), "medium"), ((3,), "high")])
        demo["urban"] = pd.to_numeric(df.Population, errors="coerce").map({1.0: "rural", 2.0: "urban", 3.0: "urban", 4.0: "urban"})
        demo["wave"] = "2009-12"
    ctx = Ctx(sid, ~(demo.country == "GR"))
    ctx.exclude("q24", "vote intention with country-specific party lists (>11 options, not a common item); political")
    ctx.exclude("q26", "mother tongue same as the official regional language (language / ethnic origin: demographic; GDPR art. 9)")
    for v, r in [("d1-d6, rd3, rd4, recoded4, d5bis, gender, Edu3, Age4, Income3, Population, unemployed", "demographics (used for "
                  "gender / edu3 / age / urban)"), ("Service_Exp", "producer-derived indicator from q1-q3"),
                 ("id, resp_id, year, country, nuts, nuts_name, nuts_c, language, typetel", "ID / admin / geography"),
                 ("Dweight, PSweight, Pweight", "weights")]:
        ctx.exclude(v, r)
    items = [v for v in m.column_names if re.match(r"^q\d+[a-z]?(_\d)?$", v) and v not in ("q24", "q26")]
    for v in items:
        base_t = texts.get(v) or texts.get(v.replace("_", "_")) or L.clean(labs.get(v) or v)
        src_t = "QoG EQI 2010 & 2013 codebook (qog_eqi_2013.pdf, section 2.2; English master)"
        extra = {}
        if year == 2010 and v in QOG10_TEXT:
            base_t, src_t = QOG10_TEXT[v][0], "QoG EQI 2010 & 2013 codebook: " + QOG10_TEXT[v][1]
            extra["waveSpecificText"] = True
        lab = L.clean(labs.get(v) or v)
        vl = dict(vls.get(v) or {})
        if year == 2010 and v in QOG10_OPTS:
            vl.update(QOG10_OPTS[v])
        if base_t != lab and not texts.get(v):
            src_t = "Stata variable label (truncated at 80 characters)"
        if re.match(r"^q(1[0-2])$", v):
            base_t = "Do you agree, rather agree, rather disagree or disagree: " + base_t
        add_labelled(ctx, v, df[v], lab, W.vl_mark(vl), text=base_t, text_source=src_t + " + Stata value labels", extra=extra)
    if year == 2010:
        ctx.notes.append("Questions marked '[2013 ONLY]' in the codebook (q20, q21a, q21b, q23, q25) have no 2010 answers and drop "
                         "out as empty.")
    meta = meta_base(man, title=f"European Quality of Government Index (EQI) {year} survey" + (" (fielded Dec 2009)" if year == 2010 else ""),
                     family="qog",
                     source="QoG Institute, University of Gothenburg (Charron, Lapuente, Rothstein); qog_eqi_ind_2013.dta "
                            f"(combined 2010 & 2013 file; rows with year == {year})",
                     waveApprox=True, mode="CATI (landline and mobile), random-digit dialling, next-birthday selection",
                     sampling="Regionally stratified samples of residents 18+ (fixed n per NUTS1/NUTS2 region: ~195 in 2010, ~400 in "
                              "2013); conducted by Efficience 3",
                     weightVar="PSweight (post-stratification weight = individual x design weight; Dweight where PSweight is missing)",
                     notes=[f"Rows with year == {year}: {n0}; dropped {int(drop.sum())} (aged <17 or no country).",
                            "The combined QoG file holds the EQI 2010 and 2013 rounds; split by 'year' into qog2010 and qog2013 "
                            "(resp_id sets are disjoint; see provenance/_overlap.p5world.json).",
                            "country from the (partly French) country label; Kosovo (code 25, NUTS 'RS') -> XK; 'uk' -> GB.",
                            ("Demographics: d1 gender, d3 exact age (999 DK), d2 education (primary / incomplete secondary = low; "
                             "secondary diploma = medium; tertiary = high), d6 place size (<10,000 = rural)." if year == 2013 else
                             "Demographics: d1-d6 exist only for 2013; 2010 uses the harmonised 'gender' (0 male, 1 female), 'Edu3' "
                             "(ISCED-based low / medium / high) and 'Population' (<10,000 = rural). Only Age4 (18-29 / 30-49 / 50-64 / "
                             "65+) exists for 2010, which does not nest the lake bands: age_band empty, no under-17 filter (18+ sample)."),
                            ("wave = 2013-01 placeholder for all countries: the codebook gives no fieldwork dates for the 2013 round "
                             "(approximate)." if year == 2013 else
                             "wave = 2009-12 for all countries (codebook: 2010 data collected in December 2009)."),
                            "Item text = codebook question text; 0-10 scales use the Stata value labels (the codebook prints 1-10 "
                            "scales; the data and value labels are 0-10). q17's codebook scale caption (agree/disagree) is a "
                            "copy error; options follow the value labels (0 Never ... 10 Very frequently).",
                            "q25 (would still vote for the preferred party after a scandal) mentions the vote -> excludedFromTransfer."]
                           + (["q18 / q19 use the 2010 wording given in the codebook notes; q19 (2010) options relabelled to the 2010 "
                               "end points 'Extremely unlikely' / 'Extremely likely' (the Stata labels carry the 2013 agree scale)."]
                              if year == 2010 else []))
    return finalize(root, sid, ctx, demo, meta, [src(root, path), src(root, pdf)], func=f"h_qog_1013({year})")


def h_qog2010(root):
    return h_qog_1013(root, 2010)


def h_qog2013(root):
    return h_qog_1013(root, 2013)


def h_qog2017(root):
    sid = "qog2017"
    path = raw(root, "qog_eqi_2017_individual", "qog_eqi_ind_2017.dta")
    pdf = raw(root, "qog_eqi_2017_individual", "qog_eqi_2017.pdf")
    man = dict(manifest(root, "qog_eqi_2017_individual"))
    if str(man.get("licence", "")).strip().lower().startswith("as eqi 2013"):
        man["licence"] = manifest(root, "qog_eqi_2013_individual").get("licence") + " (manifest: 'as EQI 2013')"
    texts = parse_qog_codebook(pdf)
    q23_stem = ("We would like to ask you about your views on some issues in the next few questions. Please rate how strongly you "
                "agree with the following statements, with ‘1’ being strongly disagree, and ‘10’ being strongly agree. ")
    _, m = pyreadstat.read_dta(path, metadataonly=True)
    vls, labs = m.variable_value_labels or {}, m.column_names_to_labels or {}
    items = [v for v in m.column_names if re.match(r"^Q\d+(_\d)?$", v) and v != "Q25"]
    df, _ = pyreadstat.read_dta(path, usecols=["COUNTRY", "D1", "D2", "D3", "D6", "PSweight", "Dweight", "TYPETEL"] + items)
    n0 = len(df)
    clab = vls.get("COUNTRY", {})
    cty = pd.to_numeric(df.COUNTRY, errors="coerce").map(lambda c: qog_country(clab.get(c)) if c == c else None)
    age = pd.to_numeric(df.D3, errors="coerce").where(lambda a: a < 999)
    drop = cty.isna() | (age < 17)
    df, cty, age = (x[~drop].reset_index(drop=True) for x in (df, cty, age))
    demo = new_demo(len(df))
    demo["country"] = cty.values
    ps = pd.to_numeric(df.PSweight, errors="coerce")
    demo["weight"] = ps.where(ps > 0, pd.to_numeric(df.Dweight, errors="coerce")).values
    demo["age_band"] = age.map(W.age_band)
    demo["gender"] = W.mf(df.D1, 1, 2)
    demo["edu3"] = edu_from(df.D2, [((1, 2), "low"), ((3,), "medium"), ((4, 5), "high")])
    demo["urban"] = pd.to_numeric(df.D6, errors="coerce").map({1.0: "rural", 2.0: "urban", 3.0: "urban", 4.0: "urban"})
    demo["wave"] = "2017-08"
    ctx = Ctx(sid, ~(demo.country == "GR"))
    ctx.exclude("Q25", "vote intention with country-specific party lists (>11 options, not a common item); political")
    ctx.exclude("Q26A1-Q26A4, Q26B_1-Q26B_4", "randomised survey experiment (corruption-scandal vignettes, one per random subsample) "
                                             "and its follow-ups routed on the experimental answer; political (party / vote)")
    for v, r in [("D1-D6, RD3, D4, D4B, RECODED4, D5A, D5B", "demographics (D1 / D2 / D3 / D6 used)"),
                 ("IDFinal, TYPETEL, COUNTRY, LANGUAGE, D7_NUTS1, D7_NUTS2", "ID / admin / geography"),
                 ("Iweight, Dweight, Pweight, PSweight", "weights")]:
        ctx.exclude(v, r)
    for v in items:
        key = v.lower().replace("q16_1", "q16a").replace("q16_2", "q16b")
        base_t = texts.get(key)
        lab = L.clean(labs.get(v) or v)
        src_t = "QoG EQI 2017 codebook (qog_eqi_2017.pdf, section 2.2; English master)"
        if not base_t:
            base_t, src_t = lab, "Stata variable label"
        if v.startswith("Q23_"):
            base_t = q23_stem + base_t
        elif re.match(r"^Q1[0-2]$", v):
            base_t = "Do you agree, rather agree, rather disagree or disagree: " + base_t
        add_labelled(ctx, v, df[v], lab, W.vl_mark(vls.get(v)), text=base_t, stem=q23_stem.strip() if v.startswith("Q23_") else None,
                     text_source=src_t + " + Stata value labels")
    meta = meta_base(man, title="European Quality of Government Index (EQI) 2017 survey", family="qog",
                     source="QoG Institute, University of Gothenburg (Charron, Lapuente et al.); qog_eqi_ind_2017.dta",
                     waveApprox=True, mode="CATI (landline and mobile), next-birthday selection",
                     sampling="Regionally stratified samples of residents 18+ (400-450 per NUTS1/NUTS2 region), 21 EU countries",
                     weightVar="PSweight (post-stratification = individual x design weight; Dweight where missing)",
                     notes=[f"Rows in file: {n0}; dropped {int(drop.sum())} (aged <17 or no country).",
                            "country from the (partly French) country label.",
                            "No interview dates in the file: wave = 2017-08 for all countries (codebook: launched summer / fall "
                            "2017; approximate).",
                            "Demographics: D1 gender, D3 exact age (999 DK), D2 education (primary / incomplete secondary = low; "
                            "secondary diploma = medium; tertiary = high), D6 place size (<10,000 = rural).",
                            "Item text = codebook question text (Q16_1/Q16_2 = codebook q16a/q16b; Q23 battery intro prepended); "
                            "options from the Stata value labels (1-10 scales).",
                            "Q22_3 Stata label says 'the European Union Parliament', the codebook 'the European Union' (codebook "
                            "wording used; Stata label kept in 'label')."])
    return finalize(root, sid, ctx, demo, meta, [src(root, path), src(root, pdf)], func="h_qog2017")


# ============================================================================== OECD PIAAC Cycle 1 / Cycle 2 (public-use files)

PIAAC_ISO3 = {"AUT": "AT", "BEL": "BE", "CAN": "CA", "CHE": "CH", "CHL": "CL", "CZE": "CZ", "DEU": "DE", "DNK": "DK", "ECU": "EC",
              "ESP": "ES", "EST": "EE", "FIN": "FI", "FRA": "FR", "GBR": "GB", "GRC": "GR", "HRV": "HR", "HUN": "HU", "IRL": "IE",
              "ISR": "IL", "ITA": "IT", "JPN": "JP", "KAZ": "KZ", "KOR": "KR", "LTU": "LT", "LVA": "LV", "MEX": "MX", "NLD": "NL",
              "NOR": "NO", "NZL": "NZ", "PER": "PE", "POL": "PL", "PRT": "PT", "RUS": "RU", "SGP": "SG", "SVK": "SK", "SVN": "SI",
              "SWE": "SE", "TUR": "TR", "USA": "US"}
PIAAC1_ROUND = {**{c: ("R1", "2011-08") for c in ["AUT", "BEL", "CAN", "CZE", "DEU", "DNK", "ESP", "EST", "FIN", "FRA", "GBR", "IRL",
                                                   "ITA", "JPN", "KOR", "NLD", "NOR", "POL", "RUS", "SVK", "SWE", "USA_2012"]},
                **{c: ("R2", "2014-04") for c in ["CHL", "GRC", "ISR", "LTU", "NZL", "SGP", "SVN", "TUR"]},
                **{c: ("R3", "2017-07") for c in ["ECU", "HUN", "KAZ", "MEX", "PER", "USA_2017"]}}
PIAAC1_ITEMS = re.compile(r"^(B_Q(12[aceg]|14[ab]|15c|26[ab])|D_Q1[134][a-d]?|F_Q0\d[a-h]?|G_Q0\d[a-h]?|H_Q0\d[a-h]?|I_Q0[4-7][a-z])$")
PIAAC2_ITEMS = re.compile(r"^(B2_Q(08a|09|11|12|17|22|23)|D2_Q13|F2_Q0\d[a-f]?|G2_Q0\d[a-f]?|"
                          r"H2_Q(0\d[a-e]?|1[0-7][ab]?|18a0[1-6]|18b|19a|19b0\d)|I2_Q0[1-5][ab]?)$")
PIAAC_HEALTH = {"I_Q08", "I2_Q03"}
PIAAC_TIME_SHARE = {"F_Q01b", "H2_Q01", "H2_Q12", "G_Q06"}  # 'None of the time' ... 'All of the time'; straightforward..complex
PIAAC_NOMINAL = {"B_Q14b", "B2_Q12", "B_Q26b", "B2_Q23"}


def piaac_files(root, cycle):
    d = raw(root, "oecd_piaac_cycle1_puf" if cycle == 1 else "oecd_piaac_cycle2_puf")
    out = []
    for fn in sorted(os.listdir(d)):
        mm = re.match(r"^prg([a-z]{3})p" + str(cycle) + r"(_(\d{4}))?_sav\.zip$", fn, re.I)
        if mm:
            iso3 = mm.group(1).upper()
            tag = f"{iso3}_{mm.group(3)}" if mm.group(3) else iso3
            out.append((tag, iso3, os.path.join(d, fn)))
    return out


def piaac_age_band(age_r, ageg5):
    a = pd.to_numeric(age_r, errors="coerce").where(lambda x: x < 99)
    band = a.map(W.age_band)
    g = pd.to_numeric(ageg5, errors="coerce")
    gb = g.map({1.0: "17-24", 2.0: "17-24", 3.0: "25-34", 4.0: "25-34", 5.0: "35-44", 6.0: "35-44", 7.0: "45-54", 8.0: "45-54",
                9.0: "55-64", 10.0: "55-64"})
    return band.where(a.notna(), gb), a


def h_piaac(root, cycle):
    sid = f"piaac{cycle}"
    man = manifest(root, "oecd_piaac_cycle1_puf" if cycle == 1 else "oecd_piaac_cycle2_puf")
    rx = PIAAC1_ITEMS if cycle == 1 else PIAAC2_ITEMS
    files = piaac_files(root, cycle)
    ref_meta, item_vars, frames, file_notes, sources = None, None, [], [], []
    demo_cols = ["CNTRYID", "AGE_R", "AGEG5LFS", "GENDER_R", "SPFWT0"] + (["EDCAT6", "B_Q01a"] if cycle == 1 else ["EDA_ISCED1", "EDU_BQDI"])
    order = sorted(files, key=lambda f: (f[1] == "GRC", f[0]))  # option sets come from the first (non-Greek) file
    label_diff = {}
    for tag, iso3, zpath in order:
        sources.append(src(root, zpath))
        with zipfile.ZipFile(zpath) as z:
            members = [i.filename for i in z.infolist() if i.filename.lower().endswith(".sav")]
            if len(members) != 1:
                raise ValueError(f"{zpath}: expected one .sav member, found {members}")
            with tempfile.TemporaryDirectory(prefix=f"{sid}_") as tmp:
                z.extract(members[0], tmp)
                sav = os.path.join(tmp, members[0])
                _, m = pyreadstat.read_sav(sav, metadataonly=True)
                if ref_meta is None:
                    ref_meta = m
                    item_vars = [v for v in m.column_names if rx.match(v) and v not in PIAAC_HEALTH]
                upmap = {c.upper(): c for c in m.column_names}  # e.g. the USA 2017 file uses 'B_Q12A' for 'B_Q12a'
                actual = {c: upmap.get(c.upper()) for c in demo_cols + item_vars}
                cols = [a for a in actual.values() if a]
                missing = [c for c in item_vars if not actual[c]]
                if missing:
                    file_notes.append(f"{tag}: {len(missing)} item variables absent from the public-use file ({', '.join(missing[:8])}"
                                      f"{' ...' if len(missing) > 8 else ''})")
                if iso3 != "GRC":
                    for v in item_vars:
                        a, b = (ref_meta.variable_value_labels or {}).get(v), (m.variable_value_labels or {}).get(actual[v] or "")
                        if actual[v] and a and b and {k: L.clean(x) for k, x in a.items()} != {k: L.clean(x) for k, x in b.items()}:
                            label_diff.setdefault(v, []).append(tag)
                df, _ = pyreadstat.read_sav(sav, usecols=cols)
                df = df.rename(columns={a: c for c, a in actual.items() if a and a != c})
        for c in item_vars + demo_cols:
            if c not in df:
                df[c] = np.nan
        part = pd.DataFrame({"_tag": tag, "_iso3": iso3}, index=df.index)
        part = pd.concat([part, df[demo_cols].astype("float64"), df[item_vars].apply(pd.to_numeric, errors="coerce").astype("float32")],
                         axis=1)
        frames.append(part)
        print(f"  {sid}: read {tag} rows={len(df)}", flush=True)
        del df
    big = pd.concat(frames, ignore_index=True)
    del frames
    n0 = len(big)
    cty = big._iso3.map(PIAAC_ISO3)
    band, age = piaac_age_band(big.AGE_R, big.AGEG5LFS)
    drop = cty.isna() | (age < 17)
    n16_band = int(((big.AGEG5LFS == 1) & age.isna() & ~drop & (cty != "GR")).sum())  # non-locked rows only
    big, cty, band = big[~drop].reset_index(drop=True), cty[~drop].reset_index(drop=True), band[~drop].reset_index(drop=True)
    demo = new_demo(len(big))
    demo["country"] = cty.values
    demo["weight"] = big.SPFWT0.values
    demo["age_band"] = band.values
    demo["gender"] = W.mf(big.GENDER_R, 1, 2)
    if cycle == 1:
        e = edu_from(big.EDCAT6, [((1,), "low"), ((2, 3), "medium"), ((4, 5, 6), "high")])
        e2 = edu_from(big.B_Q01a, [((1, 2, 3, 4), "low"), ((5, 6, 7, 8, 9, 10), "medium"), ((11, 12, 13, 14, 16), "high")])
        demo["edu3"] = e.where(e.notna(), e2)
        rnd = big._tag.map(lambda t: PIAAC1_ROUND.get(t, PIAAC1_ROUND.get(t.split("_")[0], ("?", None))))
        demo["wave"] = rnd.map(lambda x: x[1]).values
    else:
        e = edu_from(big.EDA_ISCED1, [((0, 1, 2), "low"), ((3, 4), "medium"), ((5, 6, 7, 8), "high")])
        e2 = edu_from(big.EDU_BQDI, [((1, 2, 3), "low"), ((4,), "medium"), ((5,), "high")])
        demo["edu3"] = e.where(e.notna(), e2)
        demo["wave"] = "2022-09"
    ctx = Ctx(sid, ~(demo.country == "GR") if sid in LOCKED else pd.Series(True, index=demo.index))
    labs, vls = ref_meta.column_names_to_labels or {}, ref_meta.variable_value_labels or {}
    hv = [v for v in PIAAC_HEALTH if v in ref_meta.column_names]
    if hv:
        ctx.exclude(", ".join(hv), "self-assessed general health (GDPR art. 9 health data)")
    ctx.exclude("plausible values (PVLIT1-10, PVNUM1-10, PVPSL1-10 / PVAPS), assessment item responses, scores, timing / CBA routing",
                "assessment results / derived scores (excluded by instruction: derived)")
    ctx.exclude("derived indices (ICTHOME, ICTWORK, READHOME, ..., *_WLE_CA), trend recodes (*_T, *_T1, *_TC1), collapsed recodes (*_C), "
                "variables DERIVED BY CAPI", "producer-derived indices / recodes")
    ctx.exclude("education history, current status / work history, job characteristics, earnings, last job, background (J / J2 "
                "sections), language / migration, occupation / industry codes", "demographic / labour-market background")
    ctx.exclude("SPFWT1-80, VEMETHOD*, VARSTRAT, VARUNIT, SEQID, CNTRYID*, disposition / observation module (ZZ*)",
                "weights / replication / admin / paradata")
    for v in item_vars:
        lab = L.clean(labs.get(v) or v)
        extra = {"notPolitical": "Political text filter overridden: 'team leader' refers to a work team, not politics."} \
            if re.search(r"team leader", lab, re.I) else None
        add_labelled(ctx, v, big[v], lab, W.vl_mark(vls.get(v)), text=lab, extra=extra,
                     qtype="ordinal" if v in PIAAC_TIME_SHARE else "nominal" if v in PIAAC_NOMINAL else None,
                     text_source="PIAAC public-use file SPSS variable label (BQ master questionnaire not available offline) + "
                                 "SPSS value labels")
        big.drop(columns=[v], inplace=True)
    for v, tags in label_diff.items():
        ctx.notes.append(f"{v}: value labels differ from the reference file in {len(tags)} country files ({', '.join(tags[:6])}); "
                         "codes are the international codes, option labels from the reference file")
    tags_present = sorted(set(big._tag))
    if cycle == 1:
        meta = meta_base(man, title="OECD PIAAC Cycle 1 — Survey of Adult Skills 2011-2018, background questionnaire (public-use files)",
                         family="piaac", source="OECD PIAAC Cycle 1 international public-use files (SPSS), one file per country "
                                                "(prg<cty>p1.sav; USA 2012 and 2017 files)",
                         waveApprox=True, mode="CAPI background questionnaire (+ computer / paper assessment)",
                         sampling="Probability samples of adults 16-65 (household or register), ~5,000 per country",
                         weightVar="SPFWT0 (final full-sample person weight); replicate weights not used",
                         waveApproxCountries=sorted(set(demo.country)),
                         notes=[f"Rows in files: {n0}; dropped {int(drop.sum())} (aged 16 by exact AGE_R, or unmapped country).",
                                f"Countries from the file names ({len(tags_present)} files). GB = England and Northern Ireland; BE = "
                                "Flanders; RU sample excludes the Moscow municipal area (PUF caveat); US = two independent samples "
                                "(2012 round 1 file and 2017 round 3 file).",
                                "No interview dates in the PUF: wave = start of the PIAAC round (R1 2011-08, R2 2014-04 [incl. GR], "
                                "R3 2017-07); approximate.",
                                "Demographics: GENDER_R; age from AGE_R, or AGEG5LFS where AGE_R is suppressed in the PUF "
                                f"(16-19 -> '17-24': {n16_band} non-Greek rows whose 16-year-olds cannot be removed; 60-65 -> '55-64'); edu3 "
                                "from EDCAT6 (lower secondary or less = low; upper secondary / post-secondary non-tertiary = medium; "
                                "tertiary = high), B_Q01a where EDCAT6 is missing. No urban variable.",
                                "Items: background-questionnaire attitude / behaviour items only — learning activities and reasons, "
                                "work flexibility / learning / job satisfaction, skill use at work (F, G) and in everyday life (H: "
                                "reading, writing, numeracy, ICT / internet use), learning strategies, volunteering, political "
                                "efficacy, social trust (I). Item text = SPSS variable label (PUF labels are short descriptions, "
                                "not the questionnaire wording).",
                                "'Valid skip', DK, refused, 'Not stated or inferred' -> empty."] + file_notes)
    else:
        meta = meta_base(man, title="OECD PIAAC Cycle 2 — Survey of Adult Skills 2023, background questionnaire (public-use files)",
                         family="piaac", source="OECD PIAAC Cycle 2 international public-use files (SPSS), one file per country",
                         waveApprox=True, mode="Tablet-based CAPI background questionnaire (+ assessment)",
                         sampling="Probability samples of adults 16-65, 28 countries / economies (no Greece)",
                         weightVar="SPFWT0 (final full-sample person weight); replicate weights not used",
                         notes=[f"Rows in files: {n0}; dropped {int(drop.sum())} (aged 16 by exact AGE_R, or unmapped country). "
                                "No Greek rows (training only).",
                                "No interview dates in the PUF: wave = 2022-09 for all countries (fieldwork Sep 2022 - Jun 2023; "
                                "approximate).",
                                "Demographics: GENDER_R; AGE_R (AGEG5LFS where suppressed); edu3 from EDA_ISCED1 (ISCED-A 2011: 0-2 "
                                "low, 3-4 medium, 5-8 high), EDU_BQDI where missing. No urban variable.",
                                "Items: training participation / reasons, job satisfaction, skill use at work (F2) and in everyday "
                                "life (G2, incl. devices and online banking / e-commerce), work organisation (H2), political "
                                "efficacy, social trust, volunteering, time preference, life satisfaction (I2). Item text = SPSS "
                                "variable label.",
                                "'Valid skip', DK, refused, 'Not stated or inferred' -> empty."] + file_notes)
    return finalize(root, sid, ctx, demo, meta, sources, func=f"h_piaac({cycle})")


def h_piaac1(root):
    return h_piaac(root, 1)


def h_piaac2(root):
    return h_piaac(root, 2)


# ============================================================================== JRC waste-sorting labels (21 EU countries)

JRC_SKIP = re.compile(r"^(st_|timing_|trial_|v\d|prod_|prd_|pro_|pr_t|timer_|sal_|und_|ut_|s_|u_|product_clicked|sort_home_|colours_|"
                      r"attention_check|clear_task|difficult|feedback|injunctive_other|percentage_waste_oth|builder_prod_\w+_do_|"
                      r"\w+_do_\w+|.*_text$)")
JRC_MULTI = {"convenience_barrier": (range(1, 12), {10, 11}), "convenience_encour": (range(1, 11), {9, 10}),
             "qr_usage": (None, set())}
JRC_DEMO = ["country", "gender", "age", "edu", "area_live", "startdate"]


def h_jrcwaste(root):
    sid = "jrcwaste"
    base = raw(root, "jrc_waste_sorting_labels_21eu")
    path = os.path.join(base, "Wide_data.dta")
    readme = os.path.join(base, "WSL_online_survey_analysis_README.docx")
    man = manifest(root, "jrc_waste_sorting_labels_21eu")
    _, m = pyreadstat.read_dta(path, metadataonly=True)
    labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
    derived = [v for v in m.column_names if vls.get(v) and re.search(r"income|^edu\d|_control$|_num$", v) and v != "income"]
    singles = [v for v in m.column_names if vls.get(v) and v not in JRC_DEMO + ["house", "income"] + derived and not JRC_SKIP.match(v)]
    multis = {}
    for blk, (rng, nonsub_idx) in JRC_MULTI.items():
        if blk == "qr_usage":
            vs = [v for v in m.column_names if v.startswith("qr_usage_") and not v.endswith("_text")]
        else:
            vs = [f"{blk}_{k}" for k in rng if f"{blk}_{k}" in m.column_names]
        multis[blk] = (vs, {f"{blk}_{k}" for k in nonsub_idx} | ({"qr_usage_other"} if blk == "qr_usage" else set()))
    use = JRC_DEMO + singles + [v for vs, _ in multis.values() for v in vs]
    df, _ = pyreadstat.read_dta(path, usecols=use)
    n0 = len(df)
    clab = vls.get("country", {})
    cty = pd.to_numeric(df.country, errors="coerce").map(lambda c: W.iso2(clab.get(c)) if c == c else None)
    drop = cty.isna()
    df, cty = df[~drop].reset_index(drop=True), cty[~drop].reset_index(drop=True)
    demo = new_demo(len(df))
    demo["country"] = cty.values
    demo["weight"] = np.nan
    demo["age_band"] = pd.to_numeric(df.age, errors="coerce").map({1.0: "17-24", 2.0: "25-34", 3.0: "35-44", 5.0: "45-54",
                                                                   6.0: "55-64", 7.0: "65+"})
    demo["gender"] = W.mf(df.gender, 1, 2)
    demo["edu3"] = edu_from(df.edu, [((1,), "low"), ((2, 6), "medium"), ((3, 4, 5), "high")])
    demo["urban"] = pd.to_numeric(df.area_live, errors="coerce").map({1.0: "urban", 2.0: "urban", 3.0: "rural"})
    d = pd.to_datetime(df.startdate.astype(str).str.strip(), format="%d/%m/%Y %H:%M", errors="coerce")
    ym = d.dt.strftime("%Y-%m").where(d.notna(), None)
    demo["wave"] = demo.country.map(W.country_waves(demo.country, ym, "2024-09"))
    ctx = Ctx(sid, ~(demo.country == "GR"))
    ctx.exclude("ipaddress, locationlatitude, locationlongitude, responseid, rid, recipient*, useragent*, q_recaptchascore, "
                "durationinseconds, status, progress, finished, dates, countrycode, regioncountry, citycode, q_language",
                "personal identifiers / geolocation / admin / paradata (not read)")
    ctx.exclude("st_*, sal_*, timing_*, timer_*, trial_*, prod_* / prd_* / pr_t*, u_*, s_*, product_clicked_*, v*",
                "salience / understanding / product-sorting experiment tasks and their derived scores (survey-experiment outcomes)")
    ctx.exclude("colours_*, sort_home_*, injunctive_other_*, percentage_waste_oth_*", "no value labels / no wording (option meanings "
                                                                                       "undocumented)")
    ctx.exclude("attention_check1_1, attention_check2_1, clear_task, difficultysurvey, difficulty_explained_*, feedback, *_do_* "
                "(display order), *_text", "attention checks / survey paradata / randomisation order / open text")
    ctx.exclude("gender, age, edu, house, area_live, income, country", "demographics (gender / age / edu / area_live used)")
    if derived:
        ctx.exclude(", ".join(derived), "producer-derived demographic recodes (income quartiles, education recode)")
    note_w = "question wording not in the deposit (no questionnaire; Stata variables carry no labels)"
    for v in singles:
        lab = L.clean(labs.get(v) or "")
        text = f"JRC waste-sorting survey item '{v}'" + (f": {lab}" if lab and norm(lab) != norm(v) else "") + f" ({note_w})"
        labs5 = [L.clean(x) for _, x in sorted((vls.get(v) or {}).items())]
        qt = "ordinal" if (len(labs5) >= 5 and norm(labs5[2]) == "neutral") or (labs5[:1] == ["Excellent"]) else None
        add_labelled(ctx, v, df[v], lab or v, W.vl_mark(vls.get(v)), text=text, qtype=qt,
                     text_source="variable name (+ Stata variable label where present) + Stata value labels; no questionnaire",
                     extra={"wordingMissing": True})
    for blk, (vs, nonsub_vars) in multis.items():
        if not vs:
            continue
        block = df[vs].apply(pd.to_numeric, errors="coerce")
        answered = (block == 1).any(axis=1)
        for v in vs:
            if v in nonsub_vars:
                ctx.exclude(v, "multi-mention indicator for none / other (non-substantive)")
                continue
            lab = L.clean(labs.get(v) or "") or v.replace(f"{blk}_", "").replace("_", " ")
            codes = pd.Series(np.where(block[v] == 1, 1.0, np.where(answered, 0.0, np.nan)))
            vl = {0.0: "Not mentioned", 1.0: "Mentioned"}
            add_labelled(ctx, v, codes, f"{blk}: {lab}", vl, text=f"JRC waste-sorting survey, multiple-choice block '{blk}' ({note_w}) "
                                                               f"— option: «{lab}»",
                         text_source="option text from the Stata variable label / variable name; ticked = 1, unticked = 0 for "
                                     "respondents who ticked at least one option of the block",
                         extra={"wordingMissing": True})
    meta = meta_base(man, title="EU harmonised consumer waste-sorting labels — JRC online survey / experiment, 21 EU countries (2024)",
                     family="jrc", source="European Commission JRC (CCBI), WSL Dataset 'Wide data.dta' + analysis README",
                     waveApprox=False, mode="Online (CAWI) survey with embedded label experiments (Qualtrics)",
                     sampling="Online access-panel samples with national quotas (non-probability), ~800 per country",
                     weightVar=None,
                     notes=[f"Rows in file: {n0}; dropped {int(drop.sum())} (no country).",
                            "No weights in the file: weight = 1.",
                            "Demographics: gender (man / woman; other / prefer not -> empty), age in bands (18-24 -> '17-24'), edu "
                            "(did not finish high school = low; high school / vocational school = medium; bachelor / master / "
                            "doctorate = high), area_live (urban or suburban = urban, rural = rural).",
                            "wave = earliest month of StartDate holding >=1% of a country's rows.",
                            "WORDING: the deposit has no questionnaire and the Stata variables carry no question labels; item "
                            "text is built from the variable name (and the option / variable label where present) and every "
                            "item carries wordingMissing: true and stemMissing: true. '_1pp' = rating of the on-pack label, "
                            "'_2bin' / '_bin' = rating of the on-bin label (variable-name suffixes; both asked to all).",
                            "'I am not sure' and 'Not sure what compostable means' -> empty; 'I don't care' kept as a substantive "
                            "option.",
                            "Multi-mention blocks (convenience_barrier_*, convenience_encour_*, qr_usage_*) are stored as 1 = "
                            "ticked / missing in the source: converted to 1 / 0 for respondents who ticked at least one option of "
                            "the block (including 'None' / 'Other'), empty otherwise."])
    return finalize(root, sid, ctx, demo, meta, [src(root, path), src(root, readme)], func="h_jrcwaste")


# ============================================================================== overlap check (ids / years / counts only)

def overlap_check(root):
    out = {"generatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "checks": []}
    try:
        d, _ = pyreadstat.read_dta(raw(root, "qog_eqi_2013_individual", "qog_eqi_ind_2013.dta"), usecols=["resp_id", "id", "year"])
        s10 = set(d.resp_id[d.year == 2010].dropna())
        s13 = set(d.resp_id[d.year == 2013].dropna())
        out["checks"].append({"files": ["qog2010", "qog2013"], "idVariable": "resp_id (Respondent ID 2010 & 2013)",
                              "nA": len(s10), "nB": len(s13), "sharedIds": len(s10 & s13),
                              "rowsByYear": {str(int(k)): int(v) for k, v in d.year.value_counts().items()}})
    except Exception as e:  # noqa: BLE001
        out["checks"].append({"files": ["qog2010", "qog2013"], "error": str(e)})
    out["reasoning"] = [
        "QoG EQI: 2010 (fielded Dec 2009), 2013, 2017 and the held 2021 / 2024 rounds are independent RDD telephone cross-sections "
        "drawn afresh in each round (codebooks); the combined 2010 & 2013 file is split by 'year' and its resp_id sets are disjoint "
        "(check above). No EQI file carries ids linking to another round.",
        "LiTS I (2006), II (2010), III (2016) and the held LiTS IV (2022-23) are fresh two-stage household samples per round; no "
        "panel component and no shared id variable. LiTS III's Greek rows (2016) are different respondents from LiTS IV Greece.",
        "PIAAC Cycle 1: the USA 2012 (round 1) and USA 2017 (round 3) public-use files are separate national samples; Cycle 2 (2023) "
        "is a new sample in every country. Greece took part only in Cycle 1 round 2 (2014-15).",
        "JRC waste-sorting survey (2024): single online cross-section; no link to other files.",
        "No file in this scope is a replication copy containing locked Greek rows of wgm2018 (F1), qog2021 (F2) or another F3 file."]
    with open(out_dir(root, "provenance", "_overlap.p5world.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    for c in out["checks"]:
        print("overlap:", c.get("files"), "shared ids:", c.get("sharedIds"), c.get("error", ""))
    return out


# ============================================================================== main

ADAPTERS = {"lits3": h_lits3, "lits2": h_lits2, "lits1": h_lits1, "qog2010": h_qog2010, "qog2013": h_qog2013, "qog2017": h_qog2017,
            "piaac1": h_piaac1, "piaac2": h_piaac2, "jrcwaste": h_jrcwaste}


def validate(root, sids):
    problems = []
    for sid in sids:
        rp = os.path.join(root, OUT_REL, "resp", f"{sid}.csv.gz")
        ip = os.path.join(root, OUT_REL, "items", f"{sid}.json")
        if not (os.path.exists(rp) and os.path.exists(ip)):
            problems.append(f"{sid}: missing resp/items")
            continue
        hdr = pd.read_csv(rp, nrows=0).columns.tolist()
        items = json.load(open(ip, encoding="utf-8"))
        if not items:
            problems.append(f"{sid}: no items")
        if hdr[:len(DEMO_OUT)] != DEMO_OUT:
            problems.append(f"{sid}: resp columns {hdr[:8]}")
        if [c for c in hdr if "::" in c] != [it["id"] for it in items]:
            problems.append(f"{sid}: item columns != items json")
        cc = pd.read_csv(rp, usecols=["country", "wave", "weight"], dtype={"country": str, "wave": str}, keep_default_na=False)
        cc["weight"] = pd.to_numeric(cc.weight)
        if len(cc) == 0:
            problems.append(f"{sid}: no rows")
        if not cc.country.str.fullmatch(r"[A-Z]{2}").all():
            problems.append(f"{sid}: non-ISO2 country codes")
        if not cc.wave.fillna("").str.fullmatch(r"\d{4}-\d{2}").all():
            problems.append(f"{sid}: wave not YYYY-MM for some rows")
        if ((cc.groupby("country").weight.mean() - 1).abs() > 1e-3).any():
            problems.append(f"{sid}: weights not mean 1 within country")
        if (cc.country == "GR").any() and sid in LOCKED:
            problems.append(f"{sid}: GR rows in resp (locked!)")
        lp = os.path.join(root, OUT_REL, "locked", f"{sid}.GR.csv.gz")
        if sid in LOCKED and os.path.exists(lp):
            if pd.read_csv(lp, nrows=0).columns.tolist() != hdr:
                problems.append(f"{sid}: locked file columns differ")
            lc = pd.read_csv(lp, usecols=["country"], dtype=str, keep_default_na=False)
            if len(lc) == 0 or not (lc.country == "GR").all():
                problems.append(f"{sid}: locked file empty or holds non-GR rows")
        for it in items:
            if not 2 <= len(it["options"]) <= 11 or it["nValid"] < MIN_VALID:
                problems.append(f"{it['id']}: option/valid rule violated")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--only", action="append", choices=sorted(ADAPTERS))
    ap.add_argument("--no-overlap", action="store_true")
    ap.add_argument("--validate-only", action="store_true")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    sids = a.only or list(ADAPTERS)
    sp = os.path.join(root, OUT_REL, SURVEYS_FILE)
    entries = {}
    if os.path.exists(sp):
        entries = {e["surveyId"]: e for e in json.load(open(sp, encoding="utf-8"))}
    for sid in ([] if a.validate_only else sids):
        e = ADAPTERS[sid](root)
        entries[sid] = e
        order = list(ADAPTERS)
        with open(out_dir(root, SURVEYS_FILE), "w", encoding="utf-8") as fh:
            json.dump(sorted(entries.values(), key=lambda x: order.index(x["surveyId"]) if x["surveyId"] in order else 99), fh,
                      ensure_ascii=False, indent=1)
    if not (a.no_overlap or a.validate_only):
        overlap_check(root)
    problems = validate(root, sids)
    print("validation: OK" if not problems else "validation problems:\n  " + "\n  ".join(problems[:60]))
    if problems:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
