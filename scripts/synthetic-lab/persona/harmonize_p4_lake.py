"""
Phase 4 EVIDENCE LAKE: harmonise the phase-4 Greek-respondent survey datasets
(.synthetic-lab-data/raw/phase4/manifest.jsonl) into the persona item-bank schema.

    python3 -I scripts/synthetic-lab/persona/harmonize_p4_lake.py --root . [--only <manifest slug>]

Writes ONLY (all private / gitignored):
  .synthetic-lab-data/persona/phase4/resp/<fileId>.csv.gz
        rid, weight (mean 1), age_band, gender, edu3, nuts1, urban, then "<fileId>::<var>" = response code as string
        (don't know / refused / no answer / not applicable / undocumented codes -> empty)
  .synthetic-lab-data/persona/phase4/lake_bank.json    items in the item_bank schema
        {id, file, wave, var, text, type, options, dkCode, construct, family, familyWaves} + documentation keys
  .synthetic-lab-data/persona/phase4/lake_files.json   one entry per fileId (role "evidence_p4"); datasets / frames that
        yield no usable items are listed with role "skipped_p4" and no resp file.

Conventions copied from harmonize.py / harmonize_p4_holdouts.py: Greek rows only, respondents under 17 dropped,
age bands 17-24 ... 65+, gender male/female, edu3 low/medium/high, nuts1 attica/north/centre/islands (current
NUTS 2013+ grouping: Epirus -> north, Thessaly and the Ionian Islands -> centre), urban urban/rural, weights
normalised to mean 1, multi-response groups as binary items, end-labelled numeric scales completed
(complete_numeric_scale), DK/refusal codes are non-substantive (null), sensitive (GDPR art. 9) variables are not items.

Item inclusion: every substantive categorical/ordinal variable with 2-11 substantive options and >=150 valid Greek
answers whose wording is documented (variable label, codebook or questionnaire shipped with the deposit). Excluded:
demographics, admin/ID/date/weight, open text, producer-derived indices/recodes/scores, coded open-ended answers,
partial multi-mention variables ("And then?") when the combined variable exists, items without any wording/option
documentation. Exclusions are recorded per file in lake_files.json (meta.excluded).

Survey experiments: items that follow a randomised treatment keep only control-group answers (others -> null);
see TREATMENT notes per file. ESS / World Risk Poll waves get one fileId each.

DATA HYGIENE: this script never computes or prints answer distributions; it prints only row / item / valid-answer
counts. Source files are read as data only (pandas / pyreadstat / pyreadr / openpyxl / python-docx / pdftotext);
nothing shipped inside the downloads is executed. It does not touch persona/harmonized/ or any model.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import unicodedata

import numpy as np
import pandas as pd
import pyreadstat

RAW_REL = os.path.join(".synthetic-lab-data", "raw", "phase4")
OUT_REL = os.path.join(".synthetic-lab-data", "persona", "phase4")
MIN_N = 150
MAX_UNLABELLED_SHARE = 0.02
DEMO_COLS = ["rid", "weight", "age_band", "gender", "edu3", "nuts1", "urban"]
ROLE = "evidence_p4"
AGE_BANDS = [(17, 24, "17-24"), (25, 34, "25-34"), (35, 44, "35-44"), (45, 54, "45-54"), (55, 64, "55-64"), (65, 200, "65+")]
INCLUSION_RULE = ("All substantive categorical/ordinal variables with 2-11 substantive options (after removing DK/refused/"
                  "no answer/not applicable) and >=150 valid Greek answers, with wording from the variable label, codebook "
                  "or questionnaire in the deposit. Excluded: demographics, IDs, admin/paradata, dates, weights, open text, "
                  "producer-derived indices/recodes/scores, coded open-ended answers, partial multi-mention variables, "
                  "sensitive (GDPR art. 9) variables, items whose wording or option meanings are undocumented.")


# ============================================================================== text helpers (from harmonize.py)

def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("ς", "σ")
    return re.sub(r"\s+", " ", s).strip()


def fix_text(s):
    """Greek cp1253 read as latin-1 (same as import_dianeosis.fix_text)."""
    letters = [c for c in (s or "") if c.isalpha()]
    if letters and sum(1 for c in letters if "À" <= c <= "ÿ") >= 0.5 * len(letters):
        try:
            return s.encode("latin-1").decode("cp1253")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s


def clean(s):
    return re.sub(r"\s+", " ", fix_text(str(s if s is not None else ""))).strip()


# non-substantive answer labels (DK / refusal / no answer / not applicable / undocumented), English + Greek, on norm()
NONSUB = re.compile(r"don.?t know|\bdk\b|\(dk\)|d\.k\.|refus|no answer|\bn/?a\b|not applicable|\binap\b|inap\.|does not apply|"
                    r"not asked|prefer not|not documented|not available|no opinion|do not have an opinion|don.?t have (an )?opinion|can.?t choose|"
                    r"can.?t say|cannot say|hard to say|not sure|unsure|don.?t understand|^missing|skipped|\bδξ\b|\bδα\b|δεν (γνωριζ|ξερ|απαντ)|"
                    r"αρνηση|προτιμω να μην|\?\?/\?\?|^\s*$")
MENTION0 = re.compile(r"^(not mentioned|not selected|not marked|no\b|0 not)")
OTHER_NONE = re.compile(r"^(other|none|nothing|no one|αλλο|τιποτα|κανεν)\b|\(spont[a-z.]*\)\s*$.*other|^others?\b")
ORDINAL_VOCAB = re.compile(
    r"συμφων|διαφων|πολυ|αρκετα|λιγο|καθολου|θετικ|αρνητικ|καλυτερ|χειροτερ|σιγουρα|μαλλον|ικανοποι|συχνα|σπανια|ποτε|"
    r"παντα|καθε (μερα|εβδομαδ|μηνα)|φορεσ|εμπιστευ|σημαντικ|ισχυει|^\d+\b|^ναι$|^οχι$|agree|disagree|very|somewhat|not at all|"
    r"never|often|daily|likely|satisf|trust|better|worse|ισχυρ|ασθεν|αυξη|μειω|worried|important|always|frequent|occasional|"
    r"rarely|sometimes|good|bad|fairly|rather|a lot|much|little|more|less|increase|decrease|positive|negative|easy|difficult|"
    r"comfortab|interested|close|attached|proud|happy|threat|serious|safe|weekly|monthly|a year|a week|a month|hour|no time|"
    r"completely|totally|tend to|strongly|extremely|well|support|oppose|favour|favor|against|confident|familiar|clearly|"
    r"definitely|probably|certain|like me|like you|accept|upper|lower|middle class|many|few|some|none|most|hardly|slightly|"
    r"moderately|considerabl|liberal|conservative|excellent|fair\b|poor")
CONSTRUCTS = [
    ("trust_inst", r"εμπιστ|trust|confidence in"),
    ("democracy", r"δημοκρατ|democra"),
    ("gov_eval", r"κυβερνησ|πρωθυπουργ|government"),
    ("econ_outlook", r"οικονομ|οικονομικ|economy|economic|financ|βιωτικο επιπεδ|εισοδημ|τα βγαζ"),
    ("eu", r"ευρωπ|\bεε\b|ευρω\b|european|\beu\b|ευρωζων"),
    ("immigration", r"μεταναστ|προσφυγ|immigr|refugee|αλλοδαπ"),
    ("social_lib", r"ομοφυλ|ομοφυλοφιλ|τεκνοθεσ|ταυτοτητα φυλου|αμβλωσ|gay|lesbian|lgbt|γυναικ|ανδρ.* (ρολ|επαγγελμ)|ισοτητα"),
    ("religion", r"θεο\b|θεο[υν]?\b|εκκλησ|θρησκ|ιερε|προσευχ|religio|church|god\b|ματι\b|μοιρα|αστρολογ"),
    ("nationalism", r"τουρκ|εθνικ|πατριδ|μακεδον|ελληνικοτητ|ελληνεσ ειναι|συμμαχ|χωρεσ"),
    ("tech", r"τεχνητη νοημοσ|ιντερνετ|internet|τεχνολογ|ψηφιακ|social media|μεσα κοινωνικ"),
    ("environment", r"κλιματ|περιβαλλ|ανακυκλ|πλαστικ|climate|ενεργει"),
    ("anti_elite", r"πολιτικοι|διεφθαρ|διαφθορ|ελιτ|politician|elite|συμφεροντ|κατεστημ|populis"),
    ("emotion", r"αισιοδοξ|απογοητευσ|ανασφαλ|συναισθημ|θυμο|φοβ|ελπιδ|ευτυχ|happy|μοναξ"),
    ("lifestyle", r"καταναλων|τηλεορασ|σινεμα|θεατρ|αλκοολ|κρεασ|αποταμιευ|διακοπ|ταξιδ|καπνιζ|γυμναζ|αθλη|news|ειδησ|ενημερων"),
    ("science", r"επιστημ|εμβολ|vaccin|ιατρ|υγει|health"),
    ("work", r"εργασια|απασχολ|δουλει|επαγγελμ|μισθ|εργοδοτ|ανεργ|work|job"),
    ("politics_general", r"πολιτικ|κομμα|εκλογ|ψηφ|vote|party|politic"),
]
# GDPR art. 9 filter (adapted from harmonize.SENSITIVE): applied to the RESPONDENT'S OWN special-category status
# (ethnic-minority membership, discrimination grounds of own group, sexual orientation, diagnoses, disability, drug use,
# harassment/abuse), not to attitudes about groups (e.g. ESS 'allow immigrants of different race/ethnic group' is kept).
SENSITIVE = re.compile(r"experienced discrimination|minority ethnic group|belong to .{0,30}ethnic|respondent'?s group|member of a group discriminated|discriminated against|"
                       r"μειονοτ.{0,20}(ανηκ|ομαδ)|παρενοχλ|κακοποι|βιασ|harass|sexual abuse|sexual orient|σεξουαλικ.{0,10}προσανατολ|"
                       r"διαγνωσ|diagnos|χρονια νοσ|ψυχικη ασθεν|αναπηρ|disab|hampered in daily|\bhiv\b|ναρκωτικ|drug use|"
                       r"experienced .{0,40}mental health")
QUESTION_LIKE = re.compile(r"\?|^(q[a-z]*\d+[a-z]*[._]?\d*\s+)?(how|what|which|who|do|does|did|are|is|was|were|have|has|would|should|could|"
                           r"can|to what extent|please|using this card|πόσο|ποι|πώς)\b", re.I)


def construct_of(text):
    t = norm(fix_text(text))
    for k, rx in CONSTRUCTS:
        if re.search(rx, t):
            return k
    return "other"


def age_band(a):
    try:
        a = float(a)
    except (TypeError, ValueError):
        return None
    if a != a:
        return None
    for lo, hi, b in AGE_BANDS:
        if lo <= a <= hi:
            return b
    return None


def band_from_label(lab):
    """'15-24' -> '17-24' (convention of harmonize.py for 15-24 bands); '25-34' etc. kept; '65+' / '65-98' -> '65+';
    bands spanning two lake bands (e.g. '55+', '25-39') -> None."""
    t = str(lab or "").replace(" ", "")
    m = re.match(r"^(\d+)(?:-(\d+)|\+)", t)
    if not m:
        return None
    lo, hi = int(m.group(1)), int(m.group(2)) if m.group(2) else 200
    if lo >= 65:
        return "65+"
    if lo in (15, 16, 17, 18) and hi == 24:
        return "17-24"
    for a, b, name in AGE_BANDS:
        if lo == a and (hi == b or (b == 200 and hi >= 98)):
            return name
    return None


def code_str(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:
        return None
    return str(int(f)) if f.is_integer() else repr(f)


def norm_weight(w):
    w = pd.to_numeric(pd.Series(w), errors="coerce").astype(float)
    w = w.where(w > 0)
    w = w.fillna(w.mean() if w.notna().any() else 1.0)
    return (w / w.mean()).round(6).values


def rid_of(key):
    return hashlib.sha1(f"{key}:persona-p4lake".encode()).hexdigest()[:12]


def nuts1_from_label(label):
    """NUTS2 region name (Greek transliteration / English / NUTS code) -> current NUTS1 group."""
    t = norm(str(label))
    m = re.search(r"\b(el|gr)\s?(\d{2})\b", t)
    if m:
        c = m.group(2)
        return {"30": "attica", "41": "islands", "42": "islands", "43": "islands", "11": "north", "12": "north", "13": "north",
                "21": "north", "14": "centre", "22": "centre", "23": "centre", "24": "centre", "25": "centre",
                "51": "north", "52": "north", "53": "north", "54": "north", "61": "centre", "62": "centre", "63": "centre",
                "64": "centre", "65": "centre"}.get(c)
    if re.search(r"attik|attic|αττικ", t):
        return "attica"
    if re.search(r"makedon|maced|thrak|thrac|ipeir|epir|μακεδον|θρακ|ηπειρ", t):
        return "north"
    if re.search(r"krit|cret|aiga|aege|κρητ|αιγαι", t):
        return "islands"
    if re.search(r"thessal|ionia|dytiki ellada|west(ern)? greece|sterea|central greece|pelopon|θεσσαλ|ιονι|στερε|πελοποννησ|δυτικη ελλαδα", t):
        return "centre"
    return None


# ============================================================================== generic item machinery

class Ctx:
    """Per-file accumulator: items (in output order), exclusions, notes."""

    def __init__(self, fid, slug):
        self.fid, self.slug = fid, slug
        self.items, self.excluded, self.notes, self.empties = [], [], [], []
        self.seen = set()

    def exclude(self, var, reason):
        self.excluded.append({"variable": var, "reason": reason})

    def empty(self, var):
        self.empties.append(var)

    def add(self, var, codes, text, options, *, nonsub=(), qtype=None, label=None, text_source="variable label",
            stem=None, control_mask=None, multi=False, language="en"):
        """codes: Series of str codes / None (already mapped). options: list[(code, label)] in code order."""
        if var in self.seen:
            raise ValueError(f"{self.fid}: duplicate var {var}")
        self.seen.add(var)
        options = [(str(c), clean(l)) for c, l in options]
        if qtype is None:
            qtype = item_type([l for _, l in options])
        self.items.append({"var": var, "codes": codes, "text": clean(text), "options": options, "nonsub": [str(c) for c in nonsub],
                           "type": qtype, "label": clean(label if label is not None else text), "textSource": text_source,
                           "stem": stem, "control": control_mask, "multi": multi, "language": language})


def item_type(labels):
    if len(labels) == 2:
        return "binary"
    hits = sum(1 for l in labels if ORDINAL_VOCAB.search(norm(l)))
    if hits >= max(2, int(0.6 * len(labels))) or all(re.match(r"^\d", l) for l in labels):
        return "ordinal"
    return "nominal"


def complete_numeric_scale(num, subst, nonsub_codes):
    """End-labelled numeric scale (e.g. 0 'not at all' ... 10 'completely'): fill intermediate integer codes present in
    the data (convention from harmonize.complete_numeric_scale). num: numeric Series; subst: {float: label}."""
    keys = sorted(subst)
    if len(keys) < 2 or not all(float(k).is_integer() for k in keys):
        return subst
    lo, hi = int(keys[0]), int(keys[-1])
    if not 4 <= hi - lo <= 10 or len(keys) == hi - lo + 1:
        return subst
    v = num[num.notna() & ~num.isin(list(nonsub_codes))]
    inside = v[(v >= lo) & (v <= hi) & (v % 1 == 0)]
    if len(v) == 0 or len(inside) / len(v) < 0.98 or inside.nunique() < hi - lo - 1:
        return subst
    out = {}
    for k in range(lo, hi + 1):
        lab = subst.get(float(k))
        out[float(k)] = str(k) if not lab else (lab if re.match(rf"^{k}\b", lab) else f"{k} {lab}")
    return out


def labelled_codes(series, vl):
    """series (numeric / mixed object), vl {code: label}. Returns (options{float: label}, nonsub set(float), codes Series[str|None],
    n_unlabelled, unlabelled set)."""
    num = pd.to_numeric(series, errors="coerce")  # letter codes (.a/.b) and blanks -> NaN (non-substantive)
    opts, nonsub = {}, set()
    for k, v in (vl or {}).items():
        try:
            kf = float(k)
        except (TypeError, ValueError):
            continue
        lab = clean(v)
        if lab == "":
            continue
        if NONSUB.search(norm(lab)):
            nonsub.add(kf)
        else:
            opts[kf] = lab
    opts = complete_numeric_scale(num, opts, nonsub)
    valid = num.notna() & ~num.isin(list(nonsub))
    inopt = num.isin(list(opts))
    unl = valid & ~inopt
    codes = num.where(inopt).map(code_str)
    codes = codes.where(codes.notna(), None)
    return opts, nonsub, codes, int(unl.sum()), sorted(set(num[unl].tolist()))


def add_labelled(ctx, var, series, label, vl, *, text=None, text_source="variable label", stem=None, control_mask=None,
                 language="en", qtype=None):
    """Generic: one labelled variable -> item (or a recorded exclusion)."""
    if not (series.notna() & (series.astype(str).str.strip() != "")).any():
        ctx.empty(var)
        return False
    if not vl:
        ctx.exclude(var, "no value labels (option meanings undocumented)")
        return False
    opts, nonsub, codes, n_unl, unl = labelled_codes(series, vl)
    n_valid_all = int(pd.to_numeric(series, errors="coerce").pipe(lambda s: (s.notna() & ~s.isin(list(nonsub))).sum()))
    if n_valid_all and n_unl / n_valid_all > MAX_UNLABELLED_SHARE:
        ctx.exclude(var, f"{n_unl} answers carry codes without value labels ({unl[:6]}); option meanings undocumented")
        return False
    keys = sorted(opts)
    labels = [opts[k] for k in keys]
    # multi-mention indicator (0 = not mentioned, 1 = <option>)
    if len(keys) == 2 and MENTION0.search(norm(labels[0])):
        opt_text = labels[1]
        tail = label.split(":")[-1] if ":" in label else opt_text
        tail = tail if tail.strip() else opt_text
        if NONSUB.search(norm(opt_text)) or NONSUB.search(norm(tail)) or re.search(r"^(other|none|nothing)\b|\bnone apply\b|^\(?none",
                                                                                   norm(tail)) or re.search(r"^(other|none)\b", norm(opt_text)):
            ctx.exclude(var, "multi-mention indicator for DK / none / other (non-substantive)")
            return False
    if not 2 <= len(keys) <= 11:
        ctx.exclude(var, f"{len(keys)} substantive options (rule: 2-11)")
        return False
    if n_unl:
        ctx.notes.append(f"{var}: {n_unl} answers with undocumented codes {unl[:6]} set to null")
    multi = len(keys) == 2 and bool(MENTION0.search(norm(labels[0])))
    text = text if text is not None else label
    if multi and norm(labels[1]) not in norm(text) and not re.match(r"^(marked|mentioned|selected|yes|mentioned \(not coded\))$", norm(labels[1])):
        text = f"{text} — mentions: «{labels[1]}»"
    ctx.add(var, codes, text, [(code_str(k), opts[k]) for k in keys],
            nonsub=[code_str(k) for k in sorted(nonsub)], label=label, text_source=text_source, stem=stem,
            control_mask=control_mask, multi=multi, language=language, qtype=qtype)
    return True


# ============================================================================== finalisation / output

def battery_flags(items):
    """Battery = >=3 consecutive items with identical option labels, or >=3 items sharing a question-id prefix
    (var '<q>_<k>' / '<q>.<k>'). A battery member whose text is not itself a question and had no stem prepended is flagged
    stemMissing."""
    flags = [False] * len(items)
    member = [False] * len(items)
    i = 0
    while i < len(items):
        j = i + 1
        key = tuple(l for _, l in items[i]["options"])
        while j < len(items) and tuple(l for _, l in items[j]["options"]) == key:
            j += 1
        if j - i >= 3:
            for k in range(i, j):
                member[k] = True
        i = j
    pref = [re.sub(r"[_.]\d+$", "", it["var"]) if re.search(r"[_.]\d+$", it["var"]) else None for it in items]
    cnt = pd.Series([p for p in pref if p]).value_counts().to_dict() if any(pref) else {}
    for k, it in enumerate(items):
        if member[k] or (pref[k] and cnt.get(pref[k], 0) >= 3):
            if not it["stem"] and not QUESTION_LIKE.search(it["text"]):
                flags[k] = True
    return flags


def finalize(root, ctx, demo, fmeta, wave):
    demo = demo.reset_index(drop=True)
    n = len(demo)
    cols, bank, stem_missing = {}, [], []
    kept = []
    for it in ctx.items:
        codes = pd.Series(it["codes"]).reset_index(drop=True)
        if len(codes) != n:
            raise ValueError(f"{ctx.fid}::{it['var']}: length mismatch")
        codes = codes.astype(object).where(codes.notna(), None)
        if it["control"] is not None:
            cm = pd.Series(it["control"]).reset_index(drop=True).fillna(False).astype(bool)
            codes = codes.where(cm, None)
        valid = {c for c, _ in it["options"]}
        bad = sorted({c for c in codes.dropna().unique() if c not in valid})
        if bad:
            raise ValueError(f"{ctx.fid}::{it['var']}: codes outside options {bad}")
        k = len(it["options"])
        if not 2 <= k <= 11:
            ctx.exclude(it["var"], f"{k} substantive options (rule: 2-11)")
            continue
        n_valid = int(codes.notna().sum())
        if codes.dropna().nunique() < 2:
            ctx.exclude(it["var"], "fewer than 2 distinct answer codes observed in the Greek sample (constant / routing artefact)")
            continue
        if n_valid < MIN_N:
            ctx.exclude(it["var"], f"{n_valid} valid Greek answers{' in the control group' if it['control'] is not None else ''} (<{MIN_N})")
            continue
        it["codes"], it["nValid"] = codes, n_valid
        kept.append(it)
    if ctx.empties:
        ctx.excluded.append({"variable": f"{len(ctx.empties)} variables", "reason": "no Greek answers at all (not asked in Greece / "
                             "other-country or routing-only variables)", "variables": ctx.empties})
    flags = battery_flags(kept)
    for it, flag in zip(kept, flags):
        iid = f"{ctx.fid}::{it['var']}"
        cols[iid] = it["codes"]
        entry = {"id": iid, "file": ctx.fid, "wave": wave, "var": it["var"], "text": it["text"], "type": it["type"],
                 "options": [{"code": c, "label": l} for c, l in it["options"]], "dkCode": None,
                 "construct": construct_of(it["text"]), "family": f"p4fam_{ctx.fid}_{it['var']}", "familyWaves": [wave],
                 "nValid": it["nValid"], "nonsubCodes": it["nonsub"], "textSource": it["textSource"], "language": it["language"]}
        if it["label"] and it["label"] != it["text"]:
            entry["label"] = it["label"]
        if it["stem"]:
            entry["stemAdded"] = True
        if flag:
            entry["stemMissing"] = True
            stem_missing.append(iid)
        if it["control"] is not None:
            entry["controlGroupOnly"] = True
        if it["multi"]:
            entry["multiMention"] = True
        bank.append(entry)
    frame = pd.concat([demo[DEMO_COLS], pd.DataFrame(cols)], axis=1)
    os.makedirs(os.path.join(root, OUT_REL, "resp"), exist_ok=True)
    frame.to_csv(os.path.join(root, OUT_REL, "resp", f"{ctx.fid}.csv.gz"), index=False, compression="gzip")
    demo_avail = [c for c in DEMO_COLS[2:] if demo[c].notna().any()]
    meta = {"fileId": ctx.fid, "slug": ctx.slug, **fmeta, "wave": wave, "n": int(n), "nItems": len(bank), "role": ROLE,
            "demographicsAvailable": demo_avail}
    meta["notes"] = list(fmeta.get("notes", [])) + ctx.notes
    meta["meta"] = {"inclusionRule": INCLUSION_RULE, "stemMissing": stem_missing, "excluded": ctx.excluded,
                    **fmeta.get("meta", {})}
    order = ["fileId", "slug", "source", "url", "wave", "n", "nItems", "licence", "mode", "population", "role", "notes"]
    meta = {**{k: meta[k] for k in order if k in meta}, **{k: v for k, v in meta.items() if k not in order}}
    print(f"{ctx.fid}: n={n} items={len(bank)} excluded={len(ctx.excluded)} stemMissing={len(stem_missing)} demographics={demo_avail}")
    return bank, meta


def skipped_entry(fid, slug, man, n, reason, extra=None, wave=None, wave_approx=True):
    print(f"{fid}: SKIPPED ({reason[:90]})")
    return {"fileId": fid, "slug": slug, "source": man.get("title"), "url": man.get("url"), "wave": wave, "waveApprox": wave_approx, "n": int(n) if n is not None else None,
            "nItems": 0, "licence": man.get("licence"), "mode": man.get("mode"), "population": man.get("population"),
            "role": "skipped_p4", "notes": [reason] + (extra or [])}


def demo_frame(n):
    return pd.DataFrame({"rid": [None] * n, "weight": 1.0, "age_band": None, "gender": None, "edu3": None, "nuts1": None, "urban": None})


def base_meta(man, *, weight_var, wave_basis, wave_approx=False, notes=(), source=None, extra=None):
    m = {"source": source or man.get("title"), "url": man.get("url"), "licence": man.get("licence"), "mode": man.get("mode"),
         "population": man.get("population"), "weightVar": weight_var, "waveBasis": wave_basis, "waveApprox": wave_approx,
         "producer": man.get("producer"), "doi": man.get("doi"), "commercialUse": man.get("commercialUse"), "notes": list(notes)}
    if extra:
        m.update(extra)
    return m


def earliest_month(ym_series, min_share=0.01):
    """Earliest 'YYYY-MM' holding at least min_share of the dated interviews (guards against stray mis-dated cases)."""
    s = pd.Series(ym_series).dropna()
    if s.empty:
        return None
    vc = s.value_counts()
    ok = sorted(m for m, c in vc.items() if c >= max(1, min_share * len(s)))
    return ok[0] if ok else None


MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september",
                                       "october", "november", "december"], 1)}


def ym_from_label(lab):
    t = norm(str(lab))
    m = re.search(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", t)
    if m:
        return f"{int(m.group(3)):04d}-{int(m.group(2)):02d}"
    m = re.search(r"(january|february|march|april|may|june|july|august|september|october|november|december)\w*[\s-]+(\d{4})", t)
    if m:
        return f"{int(m.group(2)):04d}-{MONTHS[m.group(1)]:02d}"
    return None


# ============================================================================== shared skip rules

DEMO_LABEL = re.compile(
    r"^(gender|sex\b|age\b|age of|age exact|age educ|age - |age in years|year of birth|how old|marital|legal marital|household size|"
    r"number of people (living|in (the )?household)|number of children|children (living|aged|under)|highest level of education|education level|education\b|"
    r"years of full-time education|occupation|last occupation|employment status|employment relation|main activity|doing last 7 days|"
    r"partner|father|mother|household's total net income|household income|income quintile|per capita income|citizenship|"
    r"citizen of|country of birth|born in country|language most often|region|size of locality|size of community|type of community|"
    r"domicile|urbanicity|urban/rural|religion or denomination|belonging to particular religion|nationality|d7 |d8 |d10 |d11 |d15|d25 |d40)",
    re.I)
ADMIN_LABEL = re.compile(
    r"^w\.|^weight\b|weight (result|extra|special|euro|germany|united|eu)|design weight|post-stratification weight|population size weight|"
    r"within-country weight|projection weight|identification number|respondent id|unique id|serial|interviewer|date of interview|day of month of interview|"
    r"month of interview|year of interview|start of interview|end of interview|interview length|length of interview|"
    r"duration|split ballot|administration of|questionnaire version|language of interview|methodology|people present|"
    r"respondent cooperation|sampling|stratif|sample point|psu\b|archive|survey identification|dataset edition|"
    r"production date|title of dataset|country code|country/sample|fieldwork country|nuts|time of interview|device used", re.I)
DERIVED_LABEL = re.compile(r"wrong answer|total internet|\(d\d+_\d+\s*\+|\(rec\b|\(recoded|\(total\)|correct answer|^generation|nation group|\(d\d+\.\d+|\bindex\b|summari[sz]ed|recoded|\brecode\b|corrected by the archive|\bscore\b|standardi[sz]ed|"
                           r"\bcompute\b|- net$|\bnet\b$|\(r\)$|total ['‘’]|\btotal\b.*\(max|grouping", re.I)


QID_PREFIX = re.compile(r"^(q[a-z]{0,3}\d+[a-z]*|[a-z]{1,3}\d+[a-z]*)([._]\w+)?\s*[-:]?\s+", re.I)


def generic_skip(var, label):
    core = QID_PREFIX.sub("", label)  # 'SD5 How old are you?' -> 'How old are you?'
    if SENSITIVE.search(norm(label) + " " + var.lower()):
        return "sensitive (GDPR art. 9: ethnicity / sexuality / health diagnosis / disability / discrimination ground)"
    if ADMIN_LABEL.search(label) or ADMIN_LABEL.search(core):
        return "admin / ID / weight / date / paradata"
    if DERIVED_LABEL.search(label):
        return "producer-derived index / recode / net / total"
    if DEMO_LABEL.search(label) or DEMO_LABEL.search(core):
        return "demographic"
    return None


# ============================================================================== manifest

def load_manifest(root):
    out = {}
    with open(os.path.join(root, RAW_REL, "manifest.jsonl"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                d = json.loads(line)
                out[d["slug"]] = d
    return out


def rawp(root, *parts):
    return os.path.join(root, RAW_REL, *parts)


# ============================================================================== ESS rounds 1/2/4/5

ESS_FILES = [("ess1", "ESS1e06.dta", "ESS1", "ESS1 GR"), ("ess2", "ESS2e03.dta", "ESS2", "ESS2 GR"),
             ("ess4", "ESS4e04.dta", "ESS4", "ESS4 GR"), ("ess5", "ESS5e03.dta", "ESS5", "ESS5 GR")]
ESS_SKIP = re.compile(
    r"^(name|essround|edition|proddate|cntry|idno|dweight|pspwght|pweight|anweight|regio\w*|region|inw\w*|splt\w*|supq\w*|"
    r"gndr\d*|yrbrn\d*|agea|rship\w*|hhmmb|domicil|edulvl\w*|eisced\w*|edlv\w*|eduyrs|edage\w*|pdwrk\w*|edctn\w*|uempl\w*|"
    r"dsbld\w*|rtrd\w*|cmsrv\w*|hswrk\w*|dngoth\w*|dngdk\w*|dngref\w*|dngna\w*|mainact|mnact\w*|crpdwk\w*|pdjob\w*|"
    r"emplrel\w*|emprel\w*|emplno\w*|wrkctr\w*|estsz|jbspv\w*|njbspv\w*|wkhct\w*|wkhtot\w*|isco\w*|nace\w*|tporgwk|hincsrc|"
    r"hinctnt\w*|partner|marital\w*|maritl\w*|marsts|lvg\w*|dvrcd\w*|chldhm|chldhhe|chldo\w*|occf14\w*|occm14\w*|emprf14|emprm14|"
    r"emplnof|emplnom|jbspvf|jbspvm|ctzcntr|ctzship\w*|brncntr|cntbrth\w*|livecntr|lnghom\w*|blgetmg|facntr|facntn|mocntr|"
    r"mocntn|fbrn\w*|mbrn\w*|rlgblg\w*|rlgdnm\w*|rlgdn\w*|dscr\w*|uemp\w*|icpart\w*|ic\w*|anctry\w*|rshpsts|nacer\w*|"
    r"edupl\w*|edufl\w*|eduml\w*|edulvlp\w*|dngnap\w*|wkdcp\w*|mnactp|iscocop|emprelp|emplnop|jbspvp|njbspvp|wkhtotp|"
    r"crmvct_\w*|ainw\w*|binw\w*|cinw\w*|dinw\w*|einw\w*|finw\w*|ginw\w*|hinw\w*|iinw\w*|kinw\w*|vdcond|mode\w*|"
    r"pdempyr|pdjobyr|yrlvdae|livpnt\w*|fxlt\w*|wrkac6m|agec\w*|hincsrc\w*|pphincr|cld\w*|ageyo30|chg1530|mbfmo70)$")
# verbatim stems from the ESS source questionnaires in docs/ (footnote markers and interviewer instructions removed);
# applied only when the distinctive phrase is found in that round's questionnaire.
ESS_STEMS = [
    ({"trstprl", "trstlgl", "trstplc", "trstplt", "trstprt", "trstep", "trstun"},
     "Using this card, please tell me on a score of 0-10 how much you personally trust each of the institutions I read out. "
     "0 means you do not trust an institution at all, and 10 means you have complete trust.", "personally trust each of the institutions"),
    ({"contplt", "wrkprty", "wrkorg", "badge", "sgnptit", "pbldmn", "bctprd", "bghtprd", "dntmny", "ilglpst"},
     "There are different ways of trying to improve things in [country] or help prevent things from going wrong. "
     "During the last 12 months, have you done any of the following?", "different ways of trying to improve things"),
    ({"ginveco", "gincdif", "needtru", "freehms", "lawobey", "prtyban", "ecohenv", "scnsenv", "hmsfmlsh", "hmsacld"},
     "Using this card, please say to what extent you agree or disagree with each of the following statements.",
     "to what extent you agree or disagree with each of the following"),
    (re.compile(r"^(sptc|clto|tru|prfo|cnso|hmno|epao|rlgo|prty|seto|sclc|othv)(mmb|ptp|dm|vw)$"),
     "For each of the voluntary organisations I will now mention, please use this card to tell me whether any of these things "
     "apply to you now or in the last 12 months, and, if so, which.", "for each of the voluntary organisations i will now mention"),
    ({"impfml", "impfrds", "implsrt", "imppol", "impwrk", "imprlg", "impvo"},
     "Looking at this card, how important is each of these things in your life.", "how important is each of these things in your life"),
    ({"impsppl", "impvote", "impoblw", "impopin", "impavo", "impapol"},
     "To be a good citizen, how important would you say it is for a person to…", "to be a good citizen, how important would you say it is"),
    (re.compile(r"^qfim\w+$"),
     "Please tell me how important you think each of these things should be in deciding whether someone born, brought up and "
     "living outside [country] should be able to come and live here. Firstly, how important should it be for them to…",
     "please tell me how important you think each of these things should be in deciding whether someone born"),
]


def ess_text_source(qtxt):
    return re.sub(r"\s+", " ", re.sub(r"(?<=[a-z\]’)])\d{1,3}\b", "", qtxt)).lower()


def h_ess(root, man):
    slug = "ess_r1_r5_greece"
    banks, metas = [], []
    for fid, fn, qdoc, fwkey in ESS_FILES:
        path = rawp(root, slug, fn)
        try:
            df, m = pyreadstat.read_dta(path)
        except Exception as e:  # noqa: BLE001
            metas.append(skipped_entry(fid, slug, man, None, f"could not parse {fn}: {e}"))
            continue
        labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
        g = df[df.cntry == "GR"].reset_index(drop=True)
        n_gr = len(g)
        age = pd.to_numeric(g.agea, errors="coerce")
        g = g[~(age < 17)].reset_index(drop=True)
        age = pd.to_numeric(g.agea, errors="coerce")
        ctx = Ctx(fid, slug)
        demo = demo_frame(len(g))
        demo["rid"] = [rid_of(f"{fid}:{i}") for i in range(len(g))]
        demo["weight"] = norm_weight(g.pspwght)
        demo["age_band"] = age.map(age_band)
        demo["gender"] = pd.to_numeric(g.gndr, errors="coerce").map({1.0: "male", 2.0: "female"})
        eis = pd.to_numeric(g.get("eisced"), errors="coerce") if "eisced" in g else pd.Series(np.nan, index=g.index)
        if eis.between(1, 7).mean() > 0.5:
            demo["edu3"] = eis.map(lambda v: None if v != v or v < 1 or v > 7 else "low" if v <= 2 else "medium" if v <= 5 else "high")
            edu_note = "edu3 from eisced (ES-ISCED I-II low, IIIb-IV medium, V1-V2 high)"
        else:
            ed = pd.to_numeric(g.edulvla, errors="coerce")
            demo["edu3"] = ed.map(lambda v: None if v != v or v < 1 or v > 5 else "low" if v <= 2 else "medium" if v <= 4 else "high")
            edu_note = "edu3 from edulvla (ISCED 0-2 low, 3-4 medium, 5-6 high); eisced not harmonisable in this round"
        regvar = next(c for c in ("regiongr", "regioagr", "region") if c in g)
        rvl = vls.get(regvar, {})
        demo["nuts1"] = g[regvar].map(lambda v: None if v is None or (isinstance(v, float) and v != v)
                                      else nuts1_from_label(rvl.get(v, v) if not isinstance(v, str) else v))
        demo["urban"] = pd.to_numeric(g.domicil, errors="coerce").map({1.0: "urban", 2.0: "urban", 3.0: "urban", 4.0: "rural", 5.0: "rural"})
        # fieldwork start month
        yv, mv = ("inwyr", "inwmm") if "inwyr" in g else ("inwyys", "inwmms")
        yy, mm = pd.to_numeric(g[yv], errors="coerce"), pd.to_numeric(g[mv], errors="coerce")
        ym = [f"{int(y):04d}-{int(mo):02d}" if y == y and mo == mo and 1 <= mo <= 12 else None for y, mo in zip(yy, mm)]
        wave = earliest_month(ym)
        qpath = rawp(root, slug, "docs", f"{qdoc}_source_main_questionnaire.pdf")
        qtxt = ""
        try:
            qtxt = ess_text_source(subprocess.run(["pdftotext", qpath, "-"], capture_output=True, text=True, check=True).stdout)
        except Exception as e:  # noqa: BLE001
            ctx.notes.append(f"questionnaire text not readable ({e}); no stems added")
        stems = {}
        for vars_, stem, probe in ESS_STEMS:
            if probe in qtxt:
                for v in g.columns:
                    if (v in vars_) if isinstance(vars_, set) else vars_.match(v):
                        stems[v] = stem
        for var in g.columns:
            lab = clean(labs.get(var) or "")
            if ESS_SKIP.match(var):
                ctx.exclude(var, "demographic / admin / household grid / weight (ESS skip list)")
                continue
            reason = generic_skip(var, lab)
            if reason:
                ctx.exclude(var, reason)
                continue
            if g[var].dtype.kind in "OSU" and not vls.get(var) and pd.to_numeric(g[var], errors="coerce").notna().sum() == 0:
                ctx.exclude(var, "open text / string")
                continue
            stem = stems.get(var)
            text = f"{stem} — {lab}" if stem else lab
            add_labelled(ctx, var, g[var], lab, vls.get(var), text=text, stem=stem,
                         text_source=("ESS source questionnaire stem + " if stem else "") + "ESS variable label")
        man_fw = (man.get("fieldwork_period") or {}).get(fwkey)
        fmeta = base_meta(man, weight_var="pspwght (post-stratification weight incl. design weight)", wave_basis=f"earliest interview month in data ({yv}/{mv}); manifest: {man_fw}",
                          source=f"European Social Survey {qdoc} integrated file ({fn}), Greece — via Harvard Dataverse doi:10.7910/DVN/2DPD79",
                          notes=[f"Greek rows: {n_gr}; dropped {n_gr - len(g)} aged <17 (ESS samples 15+).",
                                 "Weight = pspwght normalised to mean 1.", edu_note,
                                 f"nuts1 from {regvar} (NUTS2 labels mapped to current NUTS1: Epirus -> north, Thessaly/Ionian -> centre).",
                                 "urban from domicil: big city/suburbs/town = urban; village/farm = rural.",
                                 "Item text = ESS variable label (compressed English wording); core battery stems prepended from the round's "
                                 "source questionnaire where found; other battery members flagged meta.stemMissing.",
                                 "Licence: ESS ERIC data CC BY-NC-SA 4.0 (see manifest); cite 'Adapted from ESS Round X'."])
        b, meta = finalize(root, ctx, demo, fmeta, wave)
        banks += b
        metas.append(meta)
    return banks, metas


# ============================================================================== GESIS Eurobarometer (Stata)

EB_SKIP = re.compile(
    r"^(studyno\d|doi|version|edition|survey|caseid|uniqid|serialid|respondent_serial|unique_id|tnscntry|country|isocntry|"
    r"eu\d+\w*|eu_\w+|eb\d+|euro\w*|nuts\w*|p\d+\w*|w\d+\w*|wex\w*|wd\w*|ipscntry|"
    r"polintr\w*|region\w*|sd3\w*|vs\d+|capi_cawi|mode\w*|cntry\w*|n_\w*|split\w*)$")
# d1/d60-d63/d70-d79/d43/d46/d62 are kept below by an explicit allow-list (EB_KEEP_D), d-prefixed others are demographics
EB_KEEP_D = re.compile(r"^(d1|d43\w*|d46\w*|d60|d61|d62\w*|d63|d7[0-9]\w*)$")


def parse_eb_bq(pdf_path):
    """GESIS basic bilingual questionnaire -> {QID(lower): English question text}. Left (English) column only."""
    try:
        txt = subprocess.run(["pdftotext", "-layout", pdf_path, "-"], capture_output=True, text=True, check=True).stdout
    except Exception:  # noqa: BLE001
        return {}
    lines = txt.split("\n")
    out = {}
    head = re.compile(r"^(Q[A-Z]{0,2}\d+[a-z]?|D\d+[a-z]?|SD\d+[a-z]?|C\d+[a-z]?)\s{2,}(\S.*)$")
    i = 0
    while i < len(lines):
        m = head.match(lines[i])
        if not m:
            i += 1
            continue
        qid = m.group(1)
        parts = [re.split(r"\s{6,}", m.group(2).strip())[0]]
        j = i + 1
        while j < len(lines):
            ln = lines[j]
            if not ln.strip() or not ln.startswith(" "):
                break
            indent = len(ln) - len(ln.lstrip(" "))
            if indent > 16:  # French-column wrap or answer grid: not part of the English question text
                j += 1
                continue
            seg = re.split(r"\s{6,}", ln.strip())[0].strip()
            if seg.startswith("(") or re.match(r"^[A-Z0-9 ()&,.:\-–/'’]{12,}$", seg) or re.match(r"^\d", seg):
                break
            parts.append(seg)
            j += 1
        text = re.sub(r"\s*\(M\)\s*$", "", " ".join(parts)).strip()
        out.setdefault(qid.lower(), text)
        i = j
    return out


def gesis_qid(var):
    v = var.lower()
    v = re.sub(r"_\d+$", "", v)
    return v


STD_EB_DEMO = {"age": "d11", "gender": "d10", "edu": "d8", "edu_kind": "age", "urban": "d25"}
FLASH_EB_DEMO = {"age": "d1", "gender": "d2", "edu": "d4", "edu_kind": "age", "urban": "d13"}


def edu3_from_age_finished(v):
    """EB 'age when full-time education ended': <=15 or none (97) = low, 16-19 = medium, 20+ = high; still studying (98) /
    DK / refusal null (convention of this lake)."""
    if v != v or v == 0 or v in (98, 99) or v > 97 or v >= 996:
        return None
    return "low" if v == 97 or v <= 15 else "medium" if v <= 19 else "high"


def h_gesis_eb(root, man, slug, fid, fn, filt, *, bq=None, wave=None, wave_basis=None, region_vars=(), extra_notes=(),
               demo_vars=None, keep_d=EB_KEEP_D):
    demo_vars = demo_vars or STD_EB_DEMO
    path = rawp(root, slug, fn)
    try:
        df, m = pyreadstat.read_dta(path)
    except Exception as e:  # noqa: BLE001
        return [], [skipped_entry(fid, slug, man, None, f"could not parse {fn}: {e}")]
    labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
    col, val = filt
    g = df[df[col] == val].reset_index(drop=True)
    n_gr = len(g)
    av = demo_vars.get("age")
    has_age = bool(av) and av in g
    if has_age:
        age = pd.to_numeric(g[av], errors="coerce")
        g = g[~(age < 17)].reset_index(drop=True)
        age = pd.to_numeric(g[av], errors="coerce")
    ctx = Ctx(fid, slug)
    demo = demo_frame(len(g))
    demo["rid"] = [rid_of(f"{fid}:{i}") for i in range(len(g))]
    wvar = "w1" if "w1" in g else None
    demo["weight"] = norm_weight(g[wvar]) if wvar else 1.0
    if has_age:
        demo["age_band"] = age.map(age_band)
    gv = demo_vars.get("gender")
    if gv and gv in g:
        demo["gender"] = pd.to_numeric(g[gv], errors="coerce").map({1.0: "male", 2.0: "female"})
    edu_note = None
    ev = demo_vars.get("edu")
    if ev and ev in g:
        e = pd.to_numeric(g[ev], errors="coerce")
        if demo_vars.get("edu_kind") == "isced":
            demo["edu3"] = e.map(lambda v: None if v != v or v < 0 or v > 8 else "low" if v <= 2 else "medium" if v <= 4 else "high")
            edu_note = f"edu3 from {ev} (ISCED 0-2 low, 3-4 medium, 5-8 high)"
        else:
            demo["edu3"] = e.map(edu3_from_age_finished)
            edu_note = (f"edu3 from {ev} (age when full-time education ended): <=15 or none = low, 16-19 = medium, 20+ = high; "
                        "'still studying' left null")
    for rv in region_vars:
        if rv in g:
            rvl = vls.get(rv, {})
            demo["nuts1"] = g[rv].map(lambda v: None if v is None or (isinstance(v, float) and v != v) else nuts1_from_label(rvl.get(v, v)))
            region_used = rv
            break
    else:
        region_used = None
    uv = demo_vars.get("urban")
    if uv and uv in g and re.search(r"community", labs.get(uv, ""), re.I):
        demo["urban"] = pd.to_numeric(g[uv], errors="coerce").map({1.0: "rural", 2.0: "urban", 3.0: "urban"})
    if wave is None and "p1" in g:
        pl = vls.get("p1", {})
        wave = earliest_month([ym_from_label(pl.get(v)) if v == v else None for v in pd.to_numeric(g.p1, errors="coerce")])
        wave_basis = "earliest Greek interview date (p1 value labels)"
    stems = parse_eb_bq(rawp(root, slug, bq)) if bq else {}
    used_demo = {v for k, v in demo_vars.items() if k != "edu_kind" and v}
    # truncated-label detection: battery siblings '<q>_<k>' share a label prefix; if the item-specific tail left after the
    # shared prefix is tiny and the label hits Stata's 80-char limit, the item wording was cut off.
    sib = {}
    for v in g.columns:
        if re.search(r"_\d+$", v.lower()):
            sib.setdefault(gesis_qid(v), []).append(re.sub(r"^q\d+_\d+\s+", "", labs.get(v) or "", flags=re.I))

    def truncated(var, raw):
        group = sib.get(gesis_qid(var), [])
        if len(raw) < 76 or len(group) < 2:
            return False
        lcp = os.path.commonprefix(group)
        tail = re.sub(r"^q\d+_\d+\s+", "", raw, flags=re.I)[len(lcp):]
        return len(tail.strip()) < 15
    for var in g.columns:
        raw_lab = labs.get(var) or ""
        lab = clean(raw_lab)
        lv = var.lower()
        if var in used_demo:
            ctx.exclude(var, "demographic (used for demographics columns)")
            continue
        if EB_SKIP.match(lv):
            ctx.exclude(var, "admin / weight / region / country-group flag (EB skip list)")
            continue
        if re.match(r"^d\d", lv) and not (keep_d and keep_d.match(lv)):
            ctx.exclude(var, "demographic (EB D-block)")
            continue
        reason = generic_skip(var, lab)
        if reason:
            ctx.exclude(var, reason)
            continue
        if re.search(r"(_r\d*|r\d)$", lv) and re.search(r"recod|\(r\)|cat\b", lab, re.I):
            ctx.exclude(var, "producer recode")
            continue
        if re.search(r"\b2ND\b", raw_lab) and "(SUM)" not in raw_lab.upper() or stems.get(gesis_qid(var), "").lower().startswith("and then"):
            ctx.exclude(var, "partial multi-mention ('And then?' / 2nd mention); the (SUM) combined variable is used where present")
            continue
        vl = vls.get(var) or {}
        is_mention = len([k for k in vl if isinstance(k, (int, float))]) >= 2 and any(
            MENTION0.search(norm(str(v))) for k, v in vl.items() if isinstance(k, (int, float)) and float(k) == 0)
        stem, text, src = None, lab, "GESIS variable label"
        q = stems.get(gesis_qid(var))
        if q:
            if not re.search(r"_\d+$", lv):
                text, src = q, f"GESIS basic questionnaire ({bq}) question text"
            else:
                stem, text, src = q, f"{q} — {lab}", f"GESIS basic questionnaire ({bq}) stem + GESIS variable label"
        elif re.search(r"_\d+$", lv) and not is_mention and truncated(var, raw_lab):
            ctx.exclude(var, "variable label truncated at Stata's 80-character limit (battery sub-item wording lost) and no "
                             "questionnaire in deposit")
            continue
        add_labelled(ctx, var, g[var], lab, vl, text=text, stem=stem, text_source=src)
    notes = [f"Greek rows: {n_gr}; dropped {n_gr - len(g)} aged <17 (EB samples 15+)." if has_age else
             f"Greek rows: {n_gr}; no exact-age variable, so the under-17 filter could not be applied and age_band is null.",
             f"Weight = {wvar} (national post-stratification weight) normalised to mean 1." if wvar else "No weight variable; weight = 1.",
             f"nuts1 from {region_used} (NUTS2 labels mapped to current NUTS1)." if region_used else "No Greek region variable (nuts1 null)."]
    if edu_note:
        notes.append(edu_note)
    if bq:
        notes.append(f"Question stems from GESIS basic questionnaire {bq} (English column) where the question id matches the variable name.")
    else:
        notes.append("No questionnaire in deposit: item text = GESIS variable label (terse); battery members flagged meta.stemMissing.")
    notes += list(extra_notes)
    fmeta = base_meta(man, weight_var=wvar, wave_basis=wave_basis, wave_approx=bool(wave_basis) and "p1" not in wave_basis, notes=notes)
    b, meta = finalize(root, ctx, demo, fmeta, wave)
    return b, [meta]


# ============================================================================== xlsx/csv Eurobarometer with codebook sheets

def eb943_codebook(path):
    lv = pd.read_excel(path, sheet_name="ListVariables", header=None, dtype=object)
    cb = {}
    for j in range(1, lv.shape[1]):
        col = lv.iloc[:, j].tolist()
        var = col[0]
        if not isinstance(var, str):
            continue
        q, sub = col[1], col[2]
        label = sub if isinstance(sub, str) and sub.strip() else (q if isinstance(q, str) else "")
        values = {}
        for cell in col[5:]:
            if isinstance(cell, str) and "|" in cell:
                k, _, v = cell.partition("|")
                try:
                    values[float(k.strip())] = v.strip()
                except ValueError:
                    pass
        cb[var.strip()] = {"label": clean(label), "question": clean(q) if isinstance(q, str) else "", "values": values,
                           "scale": col[3] if isinstance(col[3], str) else ""}
    return cb


def datamap_codebook(path, label_sheet, value_sheet):
    vl = pd.read_excel(path, sheet_name=label_sheet, dtype=object)
    vv = pd.read_excel(path, sheet_name=value_sheet, dtype=object)
    vcol = vl.columns[0]
    cb = {}
    for _, r in vl.iterrows():
        if isinstance(r[vcol], str):
            cb[r[vcol].strip()] = {"label": clean(r["Label"]), "values": {}}
    vv[vv.columns[0]] = vv[vv.columns[0]].ffill()
    for _, r in vv.iterrows():
        var = r.iloc[0]
        if not isinstance(var, str) or var.strip() not in cb:
            continue
        try:
            cb[var.strip()]["values"][float(r.iloc[1])] = clean(r.iloc[2])
        except (TypeError, ValueError):
            pass
    return cb


CSV_EB_SKIP = re.compile(
    r"^(respondent_serial|responseid|unique_id|survey_number|date|inttime|loi\w*|new_urban|samplepoint\w*|dg\d+|langpick\w*|"
    r"capi_ca\w*|b|q1nat\S*|d7\w*|d8\w*|d10\w*|d11\w*|d15\S*|d25|d40\S*|weight\S*|pre_weight\S*|region_\S*|p\d\S*|sd3\S*|"
    r"d1\.\d|d1r\d*|\S*net\d*([._]\d+)?|\S*r\d?[._]\d+|\S*r\d?|\S*\.r\d*|nuts\S*|isocntry|country\S*|w\d+\S*|wex\S*)$", re.I)


def h_csv_eb(root, man, slug, fid, data_file, cb, *, sep, filt_col, filt_val, age_var, gender_var, edu_var, urb_var, region_var,
             weight_var, wave, wave_basis, notes=(), partial_rx=None, coded_open_rx=r"in your own words|spontaneous.{0,20}\bcode", total_rx=None,
             age_band_var=None):
    path = rawp(root, slug, data_file)
    try:
        df = pd.read_csv(path, sep=sep, low_memory=False, dtype=str, keep_default_na=True)
    except Exception as e:  # noqa: BLE001
        return [], [skipped_entry(fid, slug, man, None, f"could not parse {data_file}: {e}")]
    df.columns = [c.strip() for c in df.columns]
    g = df[pd.to_numeric(df[filt_col], errors="coerce") == filt_val].reset_index(drop=True)
    n_gr = len(g)
    ctx = Ctx(fid, slug)
    age = pd.to_numeric(g[age_var], errors="coerce") if age_var and age_var in g else pd.Series(np.nan, index=g.index)
    if age_var and age_var in g:
        g = g[~(age < 17)].reset_index(drop=True)
        age = pd.to_numeric(g[age_var], errors="coerce")
    demo = demo_frame(len(g))
    demo["rid"] = [rid_of(f"{fid}:{i}") for i in range(len(g))]
    demo["weight"] = norm_weight(g[weight_var]) if weight_var and weight_var in g else 1.0
    demo["age_band"] = age.map(age_band)
    age_note = f"Exact age from {age_var}; dropped respondents aged <17." if age_var and age_var in g else None
    if age_band_var and age_band_var in g and not (age_var and age_var in g):
        bl = (cb.get(age_band_var) or {}).get("values", {})
        demo["age_band"] = pd.to_numeric(g[age_band_var], errors="coerce").map(lambda v: None if v != v else band_from_label(bl.get(v)))
        age_note = (f"No exact age in the file: age_band from the band recode {age_band_var} ('15-24' mapped to 17-24, so 15-16 "
                    "year-olds cannot be removed; the under-17 filter could not be applied).")
    if gender_var and gender_var in g:
        demo["gender"] = pd.to_numeric(g[gender_var], errors="coerce").map({1.0: "male", 2.0: "female"})
    edu_note = None
    if edu_var and edu_var in g:
        lab = (cb.get(edu_var) or {}).get("values", {})
        e = pd.to_numeric(g[edu_var], errors="coerce")
        if any("16-19" in str(v) for v in lab.values()):  # 5-category recode
            def f(v):
                t = norm(lab.get(v, "")) if v == v else ""
                return "low" if re.search(r"^(up to )?15|15-|no full", t) else "medium" if "16-19" in t else "high" if "20" in t else None
            demo["edu3"] = e.map(f)
        else:
            demo["edu3"] = e.map(lambda v: None if v != v or v in (0, 98, 99) or v > 97 else "low" if v == 97 or v <= 15 else "medium" if v <= 19 else "high")
        edu_note = "edu3 from age when full-time education ended: <=15 or none = low, 16-19 = medium, 20+ = high; 'still studying' null"
    if urb_var and urb_var in g:
        demo["urban"] = pd.to_numeric(g[urb_var], errors="coerce").map({1.0: "rural", 2.0: "urban", 3.0: "urban"})
    if region_var and region_var in g:
        rl = (cb.get(region_var) or {}).get("values", {})
        demo["nuts1"] = pd.to_numeric(g[region_var], errors="coerce").map(lambda v: None if v != v else nuts1_from_label(rl.get(v, "")))
    for var in g.columns:
        info = cb.get(var)
        if info is None:
            ctx.exclude(var, "variable not documented in the codebook")
            continue
        lab = info["label"]
        if CSV_EB_SKIP.match(var):
            ctx.exclude(var, "demographic / admin / weight / region / recode / net (skip list)")
            continue
        if total_rx and re.search(total_rx, var) and not re.search(r"firstly|and then|\(max", lab, re.I):
            ctx.exclude(var, "producer-merged total of split-ballot versions (derived); the version-specific items are used")
            continue
        if total_rx and re.search(total_rx, var) and any(re.match(rf"^{re.escape(var.split('T')[0])}ab[._]", v) for v in g.columns):
            ctx.exclude(var, "duplicate total of a multi-mention question; the combined 'ab' variable is used")
            continue
        if partial_rx and re.search(partial_rx, var) and re.search(r"and then\?", lab, re.I):
            ctx.exclude(var, "partial multi-mention ('And then?'); combined variable used instead")
            continue
        if re.search(coded_open_rx, lab, re.I):
            ctx.exclude(var, "coded open-ended answer (derived from free text)")
            continue
        reason = generic_skip(var, lab)
        if reason:
            ctx.exclude(var, reason)
            continue
        add_labelled(ctx, var, g[var], lab, info["values"], text=lab, text_source="codebook question text (+ sub-item)")
    nt = [f"Greek rows: {n_gr}; dropped {n_gr - len(g)} aged <17." if age_var and age_var in g else f"Greek rows: {n_gr}."] + \
        ([age_note] if age_note else []) + ([edu_note] if edu_note else []) + \
        [f"nuts1 from {region_var}." if region_var and region_var in g else "No usable Greek region variable (nuts1 null)."] + list(notes)
    fmeta = base_meta(man, weight_var=weight_var, wave_basis=wave_basis, wave_approx="record" in (wave_basis or "") or "approx" in (wave_basis or ""), notes=nt)
    b, meta = finalize(root, ctx, demo, fmeta, wave)
    return b, [meta]


# ============================================================================== EFSA 2019 (.sav)

def h_efsa2019(root, man):
    slug, fid = "efsa_eb_913_food_safety_2019", "p4_efsa2019"
    try:
        df, m = pyreadstat.read_sav(rawp(root, slug, "eb_91.3_EFSA_Microdata.sav"))
    except Exception as e:  # noqa: BLE001
        return [], [skipped_entry(fid, slug, man, None, f"could not parse: {e}")]
    labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
    g = df[df.b == 4].reset_index(drop=True)
    n_gr = len(g)
    ctx = Ctx(fid, slug)
    agev = next((c for c in ("d11", "vd11") if c in g.columns), None)
    age = pd.to_numeric(g[agev], errors="coerce") if agev else pd.Series(np.nan, index=g.index)
    if agev:
        g = g[~(age < 17)].reset_index(drop=True)
        age = pd.to_numeric(g[agev], errors="coerce")
    demo = demo_frame(len(g))
    demo["rid"] = [rid_of(f"{fid}:{i}") for i in range(len(g))]
    demo["weight"] = norm_weight(g.w1)
    demo["age_band"] = age.map(age_band)
    demo["gender"] = pd.to_numeric(g.d10, errors="coerce").map({1.0: "male", 2.0: "female"})
    demo["edu3"] = pd.to_numeric(g.d8, errors="coerce").map({1.0: "low", 2.0: "medium", 3.0: "high", 5.0: "low"})
    demo["urban"] = pd.to_numeric(g.d25, errors="coerce").map({1.0: "rural", 2.0: "urban", 3.0: "urban"})
    regv = next((c for c in g.columns if re.search(r"region|nuts", labs.get(c) or "", re.I) and vls.get(c) and
                 any(nuts1_from_label(v) for v in vls[c].values())), None)
    if regv:
        rl = vls[regv]
        demo["nuts1"] = pd.to_numeric(g[regv], errors="coerce").map(lambda v: None if v != v else nuts1_from_label(rl.get(v, "")))
    for var in g.columns:
        lab = clean(labs.get(var) or "")
        lv = var.lower()
        if re.match(r"^(b|vc|vd|vdd|q1\.\d+|p\d+\w*|d7|d8|d10|d11|vd11|d15\w*|d25|vd40\w*|d40\w*|w\d+|wex|v[a-z]+\d*|brk\S*|nuts\w*|"
                    r"region\w*|isocntry|split\w*)$", lv) or var == regv:
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
        reason = generic_skip(var, lab2)
        if reason:
            ctx.exclude(var, reason)
            continue
        vl = {k: re.sub(r"^no\s+", "Not mentioned: ", v) if re.match(r"^no\s{1,2}\S", v or "") else v for k, v in (vls.get(var) or {}).items()}
        # multi-mention: 0 'no  X' / 1 'X'
        text = lab2
        if len(vl) == 2 and set(vl) == {0.0, 1.0} and str(vl[0.0]).startswith("Not mentioned"):
            vl = {0.0: "Not mentioned", 1.0: vls[var][1.0]}
            text = f"{lab2} — mentions: «{clean(vls[var][1.0])}»"
        elif " / " in lab and re.match(r"^[^/]{2,80} / Q", lab):  # 'Item / QD7 stem'
            item_, _, q = lab.partition(" / ")
            text = f"{q} — {item_}"
        add_labelled(ctx, var, g[var], lab, vl, text=text, text_source="SPSS variable label (question text)")
    fmeta = base_meta(man, weight_var="w1", wave_basis="EFSA record fieldwork 2019-04-09 to 2019-04-26 (no date variable in file)", wave_approx=False,
                      notes=[f"Greek rows: {n_gr}; dropped {n_gr - len(g)} aged <17.", "Weight = w1 (national post-stratification) normalised to mean 1.",
                             "edu3 from d8 (5-cat recode of age finished education): 15- or none = low, 16-19 = medium, 20+ = high, still studying null.",
                             f"nuts1 from {regv}." if regv else "No region variable in the released file (nuts1 null).",
                             "Multi-mention questions: the combined TOTAL variables are used; 'And then?' partials excluded."])
    b, meta = finalize(root, ctx, demo, fmeta, "2019-04")
    return b, [meta]


# ============================================================================== Lloyd's Register Foundation World Risk Poll

WRP_SKIP = re.compile(
    r"^(WPID\w*|Wave|Year|WP5|WP1225[89]\w*|Country|COUNTRY_\w+|GlobalRegion|CountryIncomeLevel\w*|WGT|PROJWT|Age|AgeGroups\d|Gender|"
    r"Education|Urbanicity\d?|EMP_\w+|INCOME_\w+|HouseholdSize|ChildrenInHousehold|worry_\w+|experience_\w+|resilience\w*|"
    r"FIELD_DATE|REG\w*|REGION_\w+|EMP8\w*|Global\w*|wbi\w*|weight\w*)$")


def h_wrp(root, man):
    slug = "lrf_world_risk_poll_2019_2025"
    banks, metas = [], []
    for year in (2019, 2021, 2023, 2025):
        fid = f"p4_wrp{year}"
        try:
            df, m = pyreadstat.read_sav(rawp(root, slug, "extracted", f"WRP_{year}.sav"))
        except Exception as e:  # noqa: BLE001
            metas.append(skipped_entry(fid, slug, man, None, f"could not parse WRP_{year}.sav: {e}"))
            continue
        labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
        g = df[df.COUNTRY_ISO2 == "GR"].reset_index(drop=True)
        n_gr = len(g)
        age = pd.to_numeric(g.Age, errors="coerce")
        g = g[~(age < 17)].reset_index(drop=True)
        age = pd.to_numeric(g.Age, errors="coerce")
        ctx = Ctx(fid, slug)
        demo = demo_frame(len(g))
        demo["rid"] = [rid_of(f"{fid}:{i}") for i in range(len(g))]
        demo["weight"] = norm_weight(g.WGT)
        demo["age_band"] = age.map(lambda a: age_band(a) if a == a and a < 100 else None)
        demo["gender"] = pd.to_numeric(g.Gender, errors="coerce").map({1.0: "male", 2.0: "female"})
        demo["edu3"] = pd.to_numeric(g.Education, errors="coerce").map({1.0: "low", 2.0: "medium", 3.0: "high"})
        demo["urban"] = pd.to_numeric(g.Urbanicity2, errors="coerce").map({1.0: "rural", 2.0: "urban"})
        regv = next((c for c in g.columns if c.upper() in ("REGION_GRC", "REGION_GR", "REGION2_GRC")), None)
        if regv:
            rl = vls.get(regv, {})
            demo["nuts1"] = pd.to_numeric(g[regv], errors="coerce").map(lambda v: None if v != v else nuts1_from_label(rl.get(v, "")))
        for var in g.columns:
            lab = clean(labs.get(var) or "")
            if WRP_SKIP.match(var):
                ctx.exclude(var, "harmonised-block demographic / admin / weight / derived score (skip list)")
                continue
            reason = generic_skip(var, lab)
            if reason:
                ctx.exclude(var, reason)
                continue
            if re.search(r"coded response", lab, re.I):
                ctx.exclude(var, "coded open-ended response")
                continue
            add_labelled(ctx, var, g[var], lab, vls.get(var), text=lab, text_source="SPSS variable label (LRF/Gallup short wording)")
        fd = None
        if "FIELD_DATE" in g:
            fdv = g.FIELD_DATE.dropna().astype(str)
            fd = sorted(fdv.unique())[:3] if len(fdv) else None
        fmeta = base_meta(man, weight_var="WGT (within-country weight)",
                          wave_basis=(f"APPROXIMATION: month unknown, mid-year of the fieldwork year used; only FIELD_DATE (study completion "
                                      f"date) {fd} in file" if fd else "APPROXIMATION: month unknown (file holds only the fieldwork year); "
                                      "mid-year of the fieldwork year used"),
                          wave_approx=True, source=f"Lloyd's Register Foundation World Risk Poll {year} (harmonised single-wave file), Greece",
                          notes=[f"Greek rows: {n_gr}; dropped {n_gr - len(g)} aged <17 (Gallup samples 15+).",
                                 "Weight = WGT normalised to mean 1.", "edu3 from Gallup Education (primary or less = low, secondary = medium, tertiary = high).",
                                 "urban from Urbanicity2 (rural area/small town = rural; large city/suburb = urban).",
                                 f"nuts1 from {regv}." if regv else "No Greek region variable (nuts1 null).",
                                 "Item text = LRF/Gallup variable label (short wording); battery members flagged meta.stemMissing.",
                                 "Repeated cross-sections; the first 37 harmonised variables (demographics, derived worry/experience/resilience "
                                 "scores) are not items."],
                          extra={"waveYear": year})
        b, meta = finalize(root, ctx, demo, fmeta, f"{year}-07")
        banks += b
        metas.append(meta)
    return banks, metas


# ============================================================================== O Xenos (2024)

XENOS_ITEMS = ["follownews", "egalitarianism", "pc1", "careparents", "samesexparents", "bother", "kindness", "followrules"]


def h_xenos(root, man):
    slug, fid = "harvard_CPDFPQ_o_xenos_gr", "p4_xenos2024"
    try:
        df, m = pyreadstat.read_dta(rawp(root, slug, "GR_refraction.dta"))
    except Exception as e:  # noqa: BLE001
        return [], [skipped_entry(fid, slug, man, None, f"could not parse: {e}")]
    labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
    n_all = len(df)
    age = pd.to_numeric(df.age, errors="coerce")
    g = df[~(age < 17)].reset_index(drop=True)
    age = pd.to_numeric(g.age, errors="coerce")
    ctx = Ctx(fid, slug)
    demo = demo_frame(len(g))
    demo["rid"] = [rid_of(f"{fid}:{i}") for i in range(len(g))]
    demo["age_band"] = age.map(age_band)
    demo["gender"] = pd.to_numeric(g.gender, errors="coerce").map({1.0: "male", 2.0: "female"})
    demo["nuts1"] = g.NUTS1.astype(str).map({"Attiki": "attica", "Voreia Ellada": "north", "Kentriki Ellada": "centre", "Nisia Aigaiou and Kriti": "islands"})
    start = pd.to_numeric(g.StartDate, errors="coerce")
    ym = [(dt.datetime(1960, 1, 1) + dt.timedelta(milliseconds=float(v))).strftime("%Y-%m") if v == v else None for v in start]
    wave = earliest_month(ym)
    for var in XENOS_ITEMS:
        lab = clean(labs.get(var) or var)
        note = {"careparents": "policy_pretreat_1", "samesexparents": "policy_pretreat_2", "bother": "policy_pretreat_4",
                "kindness": "policy_pretreat_5", "followrules": "policy_pretreat_6"}.get(var)
        src = "Stata variable label (terse descriptor; no questionnaire in deposit)" + (f"; producer reverse-coded copy of {note}" if note else "")
        add_labelled(ctx, var, g[var], lab, vls.get(var), text=lab, text_source=src)
    for var, reason in [
        ("natid_1-4 / same_beliefs, important, chauvinism, proud", "wording undocumented (labels are variable names only)"),
        ("therm_1-6 / feel_1-6", "0-100 thermometers (>11 values) and targets undocumented"),
        ("policy_pretreat_1-6", "unlabelled; labelled reverse-coded copies careparents/samesexparents/bother/kindness/followrules used "
                                "(policy_pretreat_3 has no labelled copy: wording undocumented)"),
        ("belief_*", "post-treatment (photo/name experiment, Section 4a) 0-100 sliders; no labels"),
        ("behavior_*", "post-treatment (Section 4b experiment); no value labels"),
        ("snider_*, rank_*", "post-treatment (Section 5 stimuli); no labels / rank data"),
        ("informed", "duplicate (reverse-coded) of follownews"),
        ("partychoice", "wording undocumented (vote intention vs recall unknown)"),
        ("religion, nonreligious, education, income_*, occupation, immatwork, immemploy*, yearborn, age*, gender*, educ*, female, post_secondary, high_income, NUTS1, region*, nomos, perifereia, prefecture_*, parents, canyouvote",
         "demographics / producer recodes / screening"),
        ("future_dwelling, similarity", "no value labels / wording undocumented"),
        ("party1-12, right_wing, nat_index_*", "producer-derived dummies / indices"),
        ("a_*, b_*, _* (stimulus metadata), *_DO, FL_27_DO, SECTION4*_DO", "experiment stimulus / display-order metadata (admin)"),
        ("StartDate, EndDate, Status, Progress, Duration*, Finished, RecordedDate, ResponseId, DistributionChannel, UserLanguage, consent, attncheck*, Q_*, ID, state, screen",
         "admin / paradata / attention checks"),
        ("gender_3_TEXT, occupation, partychoice_11_TEXT, immemploy_1_TEXT", "open text")]:
        ctx.exclude(var, reason)
    fmeta = base_meta(man, weight_var=None, wave_basis="earliest StartDate month (Stata %tc)",
                      notes=[f"Rows: {n_all}; dropped {n_all - len(g)} aged <17.", "No weight variable; weight = 1 (online panel).",
                             "nuts1 from producer NUTS1 string; no urban variable; education has 9 unlabelled codes (edu3 null).",
                             "TREATMENT: the survey randomises photo/name/skin-tone stimuli in Sections 4a/4b/5 (every respondent is "
                             "treated; no pure control). Only items asked BEFORE the experimental sections are included "
                             "(follownews, egalitarianism, pc1 and the five 'policy_pretreat' items), so no control restriction is needed; "
                             "all post-treatment outcomes are excluded.",
                             "Item wording: variable labels are terse descriptors ('Care parents', 'Egalitarianism'); the questionnaire is "
                             "not in the deposit, so exact wording is unknown; endpoint labels 1 Disagree / 5 Agree."],
                      extra={"treatment": {"design": "randomised stimuli (photos, names, skin tone) in Sections 4a/4b/5; no control arm",
                                           "handling": "only pre-treatment items included"}})
    b, meta = finalize(root, ctx, demo, fmeta, wave)
    return b, [meta]


# ============================================================================== National histories (E2CIQE) + Greek past (GYQLGB): same respondents

NANA_ITEMS = ["pol_L_R", "pol_lib_con", "cult_open_trad", "patriot_love", "iden_own_bond", "patriot_glad", "patriot_identity", "GR_demo", "GR_Chr"]
JMGS_ITEMS = ["soc_cla", "L_R", "relig_import", "religon_freq", "nationalism_interest", "nationalism_better", "nationalism_govt_wrong",
              "nationalism_sport", "nationalism_learn_from", "nationalism_heritage", "GR_unbro", "GR_Pers", "GR_byz_d", "GR_Otto", "GR_Rev",
              "GR_holo", "GR_civil", "GR_ath73"]
NAT_STEM_NOTE = "agree/disagree statement; the battery instruction is not in the deposit"


def _grpast_load(root):
    a, ma = pyreadstat.read_sav(rawp(root, "harvard_E2CIQE_national_histories_gr", "Greece_data_for_NaNa_2025.sav"))
    b, mb = pyreadstat.read_sav(rawp(root, "harvard_GYQLGB_greek_past_ideology_2026", "JMGS.2026.sav"))
    return a, ma, b, mb


def _grpast_demo(df, jm):
    """Demographics from the JMGS file (gender, urban) joined by int_id, age/educ/weight from the file itself."""
    j = jm.set_index("int_id")
    ids = df.int_id
    demo = demo_frame(len(df))
    demo["rid"] = [rid_of(f"grpast2022:{int(i)}") for i in ids]
    demo["weight"] = norm_weight(df.weight)
    demo["age_band"] = pd.to_numeric(df.age, errors="coerce").map(age_band)
    demo["gender"] = ids.map(pd.to_numeric(j.gender, errors="coerce")).map({1.0: "female", 2.0: "male"})
    demo["edu3"] = pd.to_numeric(df.educ, errors="coerce").map({1.0: "low", 2.0: "medium", 3.0: "high"})
    demo["urban"] = ids.map(pd.to_numeric(j.rur_urb, errors="coerce")).map({1.0: "rural", 2.0: "urban", 3.0: "urban", 4.0: "urban"})
    return demo


def _grpast_region(df, m, demo):
    vl = (m.variable_value_labels or {}).get("region", {})
    demo["nuts1"] = pd.to_numeric(df.region, errors="coerce").map(lambda v: None if v != v else nuts1_from_label(vl.get(v, "")))


def h_grpast(root, man_nana, man_jmgs, which):
    try:
        a, ma, b, mb = _grpast_load(root)
    except Exception as e:  # noqa: BLE001
        slug = "harvard_E2CIQE_national_histories_gr" if which == "nana" else "harvard_GYQLGB_greek_past_ideology_2026"
        return [], [skipped_entry("p4_nathist2022" if which == "nana" else "p4_grpast2022", slug, man_nana if which == "nana" else man_jmgs, None, f"could not parse: {e}")]
    if set(a.int_id) != set(b.int_id):
        raise ValueError("E2CIQE and GYQLGB int_id sets differ")
    cond = a.set_index("int_id").exp_cond
    if which == "nana":
        slug, fid, df, m, man, items = "harvard_E2CIQE_national_histories_gr", "p4_nathist2022", a, ma, man_nana, NANA_ITEMS
    else:
        slug, fid, df, m, man, items = "harvard_GYQLGB_greek_past_ideology_2026", "p4_grpast2022", b, mb, man_jmgs, JMGS_ITEMS
    n_all = len(df)
    df = df[~(pd.to_numeric(df.age, errors="coerce") < 17)].reset_index(drop=True)
    labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
    ctx = Ctx(fid, slug)
    demo = _grpast_demo(df, b)
    _grpast_region(df, m, demo)
    control = df.int_id.map(cond).eq(0)
    dates = pd.to_datetime(df.int_date, errors="coerce")  # datetime.date values
    wave = earliest_month(dates.dt.strftime("%Y-%m").where(dates.notna(), None))
    for var in items:
        lab = clean(labs.get(var) or var)
        stem = None
        text = lab
        src = "SPSS variable label (bilingual EN/GR item wording)"
        add_labelled(ctx, var, df[var], lab, vls.get(var), text=text, stem=stem, text_source=src, control_mask=control)
    if which == "nana":
        for var, reason in [("GR_partheon_*, GR_hagia_*", "association rankings shown only inside the two treatment arms (manipulation "
                                                            "check, no control answers) / rank data"),
                            ("exp_cond", "experimental assignment (admin)"),
                            ("econ_cl, LIBCON3, PAT_4", "producer-derived recode / scale means"),
                            ("ND_GS", "producer-derived dichotomy"), ("male", "demographic (unlabelled; JMGS gender used)"),
                            ("int_*, weight, age, educ, region", "admin / weight / demographics")]:
            ctx.exclude(var, reason)
    else:
        for var, reason in [("int_*, weight, gender, age, educ, rur_urb, region", "admin / weight / demographics"),
                            ("L_R", "kept" if "L_R" in items else "duplicate")]:
            if reason != "kept":
                ctx.exclude(var, reason)
    nt = [f"Rows: {n_all}; dropped {n_all - len(df)} aged <17.",
          "SAME 1,578 respondents in harvard_E2CIQE (p4_nathist2022) and harvard_GYQLGB (p4_grpast2022): rid is derived from int_id "
          "identically in both files so they can be joined.",
          "Weight = 'weight' (gender/age/education/place/region) normalised to mean 1; gender and urban taken from the GYQLGB file "
          "(gender, rur_urb: village <3k = rural) joined on int_id; edu3 from educ (primary/secondary/tertiary).",
          "TREATMENT (exp_cond: 0 control, 1 Athens vignette, 2 Constantinople vignette): neither deposit documents where the items "
          "sit relative to the vignette, so ALL items of both files are treated as potentially post-treatment and keep only "
          f"control-group answers (exp_cond==0, n={int(control.sum())}); treated respondents' answers are null.",
          "Battery agree/disagree statements: the instruction stem is not in either deposit (meta.stemMissing)."]
    if which == "nana":
        nt.append("pol_L_R duplicates GYQLGB L_R for the same respondents (kept in both files: identical respondents, separate fileIds).")
    fmeta = base_meta(man, weight_var="weight", wave_basis="earliest int_date month", notes=nt,
                      extra={"treatment": {"variable": "exp_cond (from E2CIQE, joined on int_id)", "control": "exp_cond == 0",
                                           "handling": "all items control-group only"},
                             "linkedFile": "p4_grpast2022" if which == "nana" else "p4_nathist2022"})
    b2, meta = finalize(root, ctx, demo, fmeta, wave)
    return b2, [meta]


# ============================================================================== 2015 referendum poll (+ experiment file)

def h_referendum(root, man):
    slug, fid = "harvard_KYCG3P_greek_referendum_2015_poll", "p4_ref2015"
    out_meta = []
    try:
        df, m = pyreadstat.read_dta(rawp(root, slug, "DataSet_Referendum_Sat5July15.dta"))
    except Exception as e:  # noqa: BLE001
        return [], [skipped_entry(fid, slug, man, None, f"could not parse: {e}")]
    labs, vls = m.column_names_to_labels or {}, m.variable_value_labels or {}
    g = df.reset_index(drop=True)
    ctx = Ctx(fid, slug)
    demo = demo_frame(len(g))
    demo["rid"] = [rid_of(f"{fid}:{i}") for i in range(len(g))]
    demo["weight"] = norm_weight(g.sexage3weight)
    demo["age_band"] = pd.to_numeric(g.Age, errors="coerce").map({1.0: "17-24", 2.0: "25-34", 3.0: "35-44", 4.0: "45-54", 5.0: "55-64", 6.0: "65+"})
    demo["gender"] = pd.to_numeric(g.Gender, errors="coerce").map({1.0: "male", 2.0: "female"})
    demo["edu3"] = pd.to_numeric(g.EduLevel, errors="coerce").map({1.0: "low", 2.0: "low", 3.0: "medium", 4.0: "medium", 5.0: "medium", 6.0: "high", 7.0: "high"})
    demo["urban"] = pd.to_numeric(g.Region, errors="coerce").map({1.0: "urban", 2.0: "rural"})
    for var in ("VoteRef", "CapitalControls", "BestForGr"):
        lab = clean(labs.get(var))
        add_labelled(ctx, var, g[var], lab, vls.get(var), text=lab, text_source="Stata variable label (English)",
                     qtype="nominal" if var in ("VoteRef", "BestForGr") else None)
    for var, reason in [("europreferences", "label 'Experiment results - Euro - National currenct': outcome of an embedded experiment whose "
                                            "assignment is not in the file (no control group identifiable); not question wording"),
                        ("expectations", "label '5 years before / 5 years ahead - GrExti / Negotiations' is not question wording; wording undocumented"),
                        ("PastVoteJan2015", "15 substantive options (rule: 2-11)"),
                        ("quid", "ID"), ("zone", "interview time slot (admin)"),
                        ("Gender, Age, EduLevel, Occupation, Age3Cat_, Region, EduRec", "demographics"), ("sexage3weight", "weight")]:
        ctx.exclude(var, reason)
    fmeta = base_meta(man, weight_var="sexage3weight", wave_basis="poll fielded Saturday 2015-07-04 (README / zone labels)",
                      notes=["All 989 rows; age only in bands (18-24 mapped to 17-24), no under-17 filter needed.",
                             "Weight = sexage3weight normalised to mean 1. edu3: no certificate/primary = low; high school/secondary/post-secondary = medium; university/master-PhD = high. urban from Region (Urban/Rural). No nuts1.",
                             "Experiment.dta (pre-referendum Schaeuble/Varoufakis/Draghi experiment, n=2003) NOT harmonised: its only outcome "
                             "ResExp_2 has no variable label and value labels (1, 10) that do not match the data codes (1-5, 99), so wording and "
                             "option meanings are undocumented (control arm Exp2==10, n=169, would also be the only usable rows)."],
                      extra={"treatment": {"file": "Experiment.dta", "variable": "Exp2 (10 = control)", "handling": "file skipped (outcome undocumented)"}})
    b, meta = finalize(root, ctx, demo, fmeta, "2015-07")
    out_meta.append(meta)
    return b, out_meta


# ============================================================================== Populism IT/GR/ES 2022

POP_STEMS = {  # verbatim Greek block instructions from Greek_survey__Social__political_views.docx (block titles removed)
    "pub_pol": "Σας παρακαλούμε να εκφράσετε κατά πόσο συμφωνείτε ή διαφωνείτε με τις παρακάτω φράσεις:",
    "values": "Ποιές αξίες πρέπει να έχει ένα παιδί: παρακάτω παραθέτουμε μια σειρά από αξίες που μπορεί να χαρακτηρίζουν ένα παιδί, "
              "οργανωμένες σε ζευγάρια. Για κάθε ζευγάρι επιλέξτε μια από τις αξίες αυτές που θεωρείτε πιο σημαντική.",
    "social_views1": "Παρακαλώ υποδείξτε κατά πόσο συμφωνείτε με τις παρακάτω δηλώσεις",
    "pol_ideas1": "Παρακαλώ υποδείξτε κατά πόσο συμφωνείτε με τις παρακάτω δηλώσεις",
    "pol_ideas2": "Παρακαλώ υποδείξτε κατά πόσο συμφωνείτε με τις παρακάτω δηλώσεις",
    "pol_system1": "Σε ποιό βαθμό είστε διατεθιμμένη/ος να δεχτείτε... (με 1 καμία θέληση να δεχτείτε και 5 πλήρη θέληση να δεχτείτε)",
}


def _pop_options(levels, values, wording):
    """Codebook levels/values -> options list or None."""
    levels, values = str(levels), str(values)
    mr = re.match(r"^\s*(\d+)\s*-\s*(\d+)\s*$", values)
    if mr:
        lo, hi = int(mr.group(1)), int(mr.group(2))
        parts = [p.strip() for p in re.split(r"\s+-\s+|,\s*|-(?=[A-Z])", levels) if p.strip()]
        if hi - lo + 1 == len(parts):
            return [(str(lo + i), p) for i, p in enumerate(parts)]
        if len(parts) == 2 and hi - lo >= 2:
            return [(str(k), (f"{k} {parts[0]}" if k == lo else f"{k} {parts[1]}" if k == hi else str(k))) for k in range(lo, hi + 1)]
        return None
    vals = [v for v in re.split(r"[,.]", values) if v.strip() != ""]
    parts = [p.strip() for p in levels.split(",")]
    if len(vals) == len(parts):
        return [(str(int(v)), p) for v, p in zip(vals, parts)]
    return None


def h_populism(root, man):
    slug, fid = "zenodo_20772797_populism_it_gr_es_2022", "p4_populism2022"
    try:
        g = pd.read_csv(rawp(root, slug, "grc.csv"))
        cb = pd.read_excel(rawp(root, slug, "codebook_ESP_ITA_GRC.xlsx"), sheet_name="Hoja 1", dtype=object)
    except Exception as e:  # noqa: BLE001
        return [], [skipped_entry(fid, slug, man, None, f"could not parse: {e}")]
    n_all = len(g)
    ctx = Ctx(fid, slug)
    demo = demo_frame(len(g))
    demo["rid"] = [rid_of(f"{fid}:{i}") for i in range(len(g))]
    # age_yrs is NOT age in years in grc.csv (values 1-64; 5-9 fall in age group 18-24): use the age_groups recode
    demo["age_band"] = pd.to_numeric(g.age_groups, errors="coerce").map({1.0: "17-24", 2.0: "25-34", 3.0: "35-44", 4.0: "45-54"})
    demo["gender"] = pd.to_numeric(g.gender, errors="coerce").map({1.0: "male", 2.0: "female"})
    demo["edu3"] = pd.to_numeric(g.education, errors="coerce").map({1.0: "low", 2.0: "low", 3.0: "medium", 4.0: "medium", 5.0: "high"})
    cbd = {r.variable: r for _, r in cb.iterrows() if isinstance(r.variable, str)}
    skip_demo = {"Unnamed: 0", "age_yrs", "gender", "education", "employ_status", "domicile", "religion", "age_groups", "cntry"}
    for var in g.columns:
        if var in skip_demo:
            ctx.exclude(var, "demographic / index column" + ("; domicile: 4 data codes vs 5 documented levels (mapping ambiguous)" if var == "domicile" else ""))
            continue
        r = cbd.get(var)
        if r is None:
            ctx.exclude(var, "not in codebook")
            continue
        wording = clean(r.wording)
        if var == "lrscale":
            opts = [(str(k), "0 left" if k == 0 else "10 right" if k == 10 else str(k)) for k in range(11)]
            note_src = "codebook wording (end labels taken from the wording; codebook 'levels' column is a copy-paste error)"
        elif var == "pol_system2.7":
            opts = [(str(k), str(k)) for k in range(11)]
            note_src = "codebook wording; scale end labels undocumented (codebook levels refer to satisfaction), options numeric"
        else:
            opts = _pop_options(r.levels, r["values"], wording)
            note_src = "codebook wording + levels"
        if not opts:
            ctx.exclude(var, f"codebook levels/values not parseable ({r.levels} / {r['values']})")
            continue
        num = pd.to_numeric(g[var], errors="coerce")
        valid = {c for c, _ in opts}
        codes = num.map(code_str)
        n99 = int((num == 99).sum())
        unl = codes.notna() & ~codes.isin(valid) & (num != 99)
        if unl.sum():
            ctx.exclude(var, f"{int(unl.sum())} answers with codes outside the documented range")
            continue
        codes = codes.where(codes.isin(valid), None)
        block = re.sub(r"\.\d+$|\d+$", "", var.split(".")[0]) if not var.startswith(("social_views", "pol_ideas", "pol_system")) else var.split(".")[0]
        stem = POP_STEMS.get(block)
        text = f"{stem} — {wording}" if stem else wording
        ctx.add(var, codes, text, opts, nonsub=["99"] if n99 else [], label=clean(r.label), stem=stem,
                text_source=("Greek questionnaire block instruction (docx) + " if stem else "") + note_src,
                language="el+en" if stem else "en")
    fmeta = base_meta(man, weight_var=None, wave_basis="Zenodo description: fieldwork 2022-03-23 to 2022-04-05 (no date variable)", wave_approx=False,
                      notes=[f"Rows (grc.csv): {n_all}; no one dropped: the sample is 18+ (age_groups); 'age_yrs' in grc.csv is not age in "
                             "years (range 1-64, inconsistent with age_groups), so age_band comes from age_groups (18-24 -> 17-24, 25-34, "
                             "35-44, 45-54; '55+' cannot be split into 55-64/65+ and is left null).",
                             "No weight in the deposit (quota online panel): weight = 1.",
                             "edu3 from education: no formal/primary = low, secondary/professional = medium, university = high. "
                             "domicile not used (4 data codes vs 5 documented levels); no region variable.",
                             "Code 99 (undocumented; DK/no answer) -> null.",
                             "Item wording = English codebook 'wording'; for statement batteries the Greek block instruction from the Greek "
                             "questionnaire (docx) is prepended (text mixes Greek stem + English item).",
                             "vote_recall_grc / vote_intention_grc have 12 substantive options (>11) and are excluded."])
    b, meta = finalize(root, ctx, demo, fmeta, "2022-03")
    return b, [meta]


# ============================================================================== TealHelix (11-country consumer food-label survey)

def h_tealhelix(root, man):
    slug, fid = "zenodo_18631009_tealhelix_food_labels_11eu", "p4_tealhelix"
    base = rawp(root, slug, "extracted", "Replication_Package_Tealhelix")
    try:
        num = pd.read_csv(os.path.join(base, "TealHelix.csv"), header=None, dtype=str, keep_default_na=False)
        txt = pd.read_csv(os.path.join(base, "TealHelix2.csv"), header=None, dtype=str, keep_default_na=False)
    except Exception as e:  # noqa: BLE001
        return [], [skipped_entry(fid, slug, man, None, f"could not parse: {e}")]
    if num.shape != txt.shape:
        return [], [skipped_entry(fid, slug, man, None, "numeric and text exports differ in shape")]
    qrow = num.iloc[0].replace("", np.nan).ffill().fillna("")
    srow = num.iloc[1]
    dn, dt_ = num.iloc[2:].reset_index(drop=True), txt.iloc[2:].reset_index(drop=True)
    live = next(j for j in range(num.shape[1]) if num.iat[0, j].startswith("Which country do you currently live in?"))
    gmask = dt_[live].str.strip().eq("Greece")
    dn, dt_ = dn[gmask].reset_index(drop=True), dt_[gmask].reset_index(drop=True)
    n_gr = len(dn)
    col_age = next(j for j in range(num.shape[1]) if num.iat[0, j].startswith("Age:"))
    age = pd.to_numeric(dt_[col_age], errors="coerce")
    keep = ~(age < 17)
    dn, dt_ = dn[keep].reset_index(drop=True), dt_[keep].reset_index(drop=True)
    age = pd.to_numeric(dt_[col_age], errors="coerce")
    ctx = Ctx(fid, slug)
    demo = demo_frame(len(dn))
    demo["rid"] = [rid_of(f"{fid}:{i}") for i in range(len(dn))]
    demo["age_band"] = age.map(age_band)
    col_g = next(j for j in range(num.shape[1]) if num.iat[0, j].startswith("Gender:"))
    demo["gender"] = dt_[col_g].str.strip().str.lower().map({"male": "male", "female": "female", "man": "male", "woman": "female"})
    col_e = next(j for j in range(num.shape[1]) if num.iat[0, j].startswith("Education:"))

    def edu(t):
        t = norm(t)
        if not t or "prefer" in t:
            return None
        if re.search(r"bachelor|master|doctor|phd|tertiary|university|degree", t):
            return "high"
        if re.search(r"secondary|high school|vocational|post-secondary|upper", t):
            return "medium"
        if re.search(r"primary|no formal|less than|elementary|lower", t):
            return "low"
        return None
    demo["edu3"] = dt_[col_e].map(edu)
    skip_q = re.compile(r"^(Respondent ID|Collector ID|Start Date|End Date|IP Address|Email Address|First Name|Last Name|Custom Data|"
                        r"I have read the TealHelix|What is your Prolific|Age:|Which country|Please name the city|Gender:|Education:|"
                        r"How many children|How many people live|What is your current occupation|What is your average monthly household income|"
                        r"Most modern theories of decision-making|Please choose the picture below|According to the Food and Agricultural|"
                        r"Please indicate the extra percentage)")
    reasons = {"Most modern theories": "attention check (instructional manipulation check)",
               "Please choose the picture": "pictorial response options (pictures undocumented in deposit)",
               "According to the Food": "constant-sum allocation (0-100 points; continuous)",
               "Please indicate the extra percentage": "open numeric answer",
               "Which country": "screening / demographic", "Please name the city": "open text (place of residence)"}
    # Dictionary.xlsx: one row per data column from the diet question onwards, with documented min/max codes
    rng = {}
    try:
        dic = pd.read_excel(os.path.join(base, "Dictionary.xlsx"), dtype=object)
        dic.columns = ["q", "a", "mn", "mx"]
        start = next(j for j in range(num.shape[1]) if num.iat[0, j].startswith("What is your type of diet"))
        for k, r in dic.iterrows():
            c = start + k
            if c >= num.shape[1]:
                break
            if norm(fix_text(str(r.q)))[:25].replace("â€™", "'") and norm(str(qrow[c]))[:12] != norm(fix_text(str(r.q)))[:12]:
                continue
            m1, m2 = re.match(r"^\s*(\d+)", str(r.mn)), re.match(r"^\s*(\d+)", str(r.mx))
            if m1 and m2:
                rng[c] = (int(m1.group(1)), int(m2.group(1)))
    except Exception as e:  # noqa: BLE001
        ctx.notes.append(f"Dictionary.xlsx not usable for option ranges ({e})")
    incomplete = []
    qlabels = {}  # question stem -> {code: label} observed in any of its sub-item columns (same answer scale)
    for c in range(num.shape[1]):
        pr = pd.DataFrame({"n": num.iloc[2:, c].str.strip(), "t": txt.iloc[2:, c].str.strip()})
        pr = pr[(pr.n.str.fullmatch(r"\d+")) & (pr.t != "")].drop_duplicates()
        for n_, t_ in zip(pr.n, pr.t):
            qlabels.setdefault(clean(qrow[c]), {}).setdefault(int(n_), t_)
    done_groups = set()
    j = 0
    ncol = num.shape[1]
    while j < ncol:
        q = clean(qrow[j])
        sub = clean(srow[j])
        var = f"c{j:03d}"
        if skip_q.match(q):
            key = next((v for k, v in reasons.items() if q.startswith(k)), "admin / PII header / demographic")
            if (q, key) not in done_groups:
                ctx.exclude(f"{var} ({q[:60]})", key)
                done_groups.add((q, key))
            j += 1
            continue
        if sub.startswith("http"):
            ctx.exclude(f"{var} ({q[:50]} / image)", "sub-item is an image (label logo) without documented name")
            j += 1
            continue
        if sub.startswith("Open-Ended") or re.match(r"other \(please specify\)", sub, re.I):
            ctx.exclude(f"{var} ({q[:50]})", "open text")
            j += 1
            continue
        # checkbox (multi-select): numeric export holds the option code, text export the option label, blank = not selected
        group = [j]
        k = j + 1
        while k < ncol and num.iat[0, k] == "" and clean(qrow[k]) == q:
            group.append(k)
            k += 1
        tvals = set(dt_[j].unique()) - {""}
        is_checkbox = (sub != "Response" and len(tvals) <= 1 and (not tvals or clean(next(iter(tvals))) == sub)) and len(group) > 1
        if is_checkbox:
            for c in group:
                s = clean(srow[c])
                if re.match(r"other \(please specify\)", s, re.I):
                    ctx.exclude(f"c{c:03d}", "open 'other' option")
                    continue
                ans = dn.apply(lambda r: r.astype(str).str.strip().ne("").any(), axis=1) if False else None
                # respondent answered the question if any box of the group is ticked; unticked boxes then mean 'not selected'
                any_ticked = dt_[group].apply(lambda col: col.str.strip().ne("")).any(axis=1)
                codes = dt_[c].str.strip().ne("").map({True: "1", False: "0"}).where(any_ticked, None)
                ctx.add(f"c{c:03d}", codes, f"{q} — mentions: «{s}»", [("0", "Not selected"), ("1", s)], label=f"{q}: {s}",
                        text_source="SurveyMonkey header (question + option)", multi=True)
            j = k
            continue
        # single-choice / grid sub-item: map numeric codes to text labels from the parallel text export
        pairs = pd.DataFrame({"n": dn[j].str.strip(), "t": dt_[j].str.strip()})
        pairs = pairs[(pairs.n != "") & (pairs.t != "")]
        mp = pairs.drop_duplicates().groupby("n").t.agg(lambda x: sorted(set(x)))
        if (mp.map(len) > 1).any() or pairs.empty:
            ctx.exclude(var, "numeric and text exports disagree / empty")
            j += 1
            continue
        if not all(re.fullmatch(r"\d+", c) for c in mp.index):
            ctx.exclude(var, "non-numeric codes")
            j += 1
            continue
        opts = {int(c): ts[0] for c, ts in mp.items()}
        nonsub = {c for c, l in opts.items() if NONSUB.search(norm(l))}
        subst = {c: l for c, l in opts.items() if c not in nonsub}
        if j in rng:
            lo, hi = rng[j]
            if hi - lo <= 10 and all(lo <= c <= hi for c in subst):
                missing = [c for c in range(lo, hi + 1) if c not in subst and c not in nonsub]
                unknown = []
                for c in missing:
                    lab_c = qlabels.get(q, {}).get(c)
                    if lab_c and NONSUB.search(norm(lab_c)):
                        nonsub.add(c)
                    elif lab_c:
                        subst[c] = lab_c
                    else:
                        subst[c] = str(c)
                        unknown.append(c)
                if unknown:
                    incomplete.append(f"{var}: codes {unknown} lie in the Dictionary.xlsx range {lo}-{hi} but were never chosen in the "
                                      "11-country file (no label available): numeric label used")
        codes = pd.to_numeric(dn[j], errors="coerce").map(lambda v: None if v != v or int(v) in nonsub else str(int(v)))
        text = q if sub in ("Response", "") else f"{q} — {sub}"
        if not 2 <= len(subst) <= 11:
            ctx.exclude(var, f"{len(subst)} substantive options (rule: 2-11)")
            j += 1
            continue
        ctx.add(var, codes, text, [(str(c), subst[c]) for c in sorted(subst)], nonsub=[str(c) for c in sorted(nonsub)],
                label=text, stem=q if sub not in ("Response", "") else None,
                text_source="SurveyMonkey header (question + sub-item); option labels from the parallel text export "
                            "(only options chosen by at least one respondent are documented)")
        j += 1
    ctx.notes.extend(incomplete)
    fmeta = base_meta(man, weight_var=None, wave_basis="APPROXIMATION: fieldwork date not in the files (Start/End Date columns empty); "
                      "project 2024-2027, data export dated 2026-02-09 (upper bound); mid-2025 used — year unverified",
                      wave_approx=True,
                      notes=[f"Greek residents ('Which country do you currently live in?' == Greece): {n_gr}; dropped {n_gr - len(dn)} aged <17.",
                             "No weight (Prolific quota panel): weight = 1. No region or urban variable (city is open text).",
                             "edu3 from the education answer text (bachelor/master/doctorate = high; secondary/vocational = medium; primary = low).",
                             "Option labels come from the parallel text export (TealHelix2.csv), so an answer option never chosen by anyone in the "
                             "full 11-country file would be missing from the option list; the Dictionary.xlsx gives min/max per question.",
                             "Fieldwork date not verifiable: wave = 2025-07 is an explicitly flagged approximation (waveApprox)."])
    b, meta = finalize(root, ctx, demo, fmeta, "2025-07")
    return b, [meta]


# ============================================================================== skipped datasets

def h_skip_once_we_too(root, man):
    slug = "harvard_ADQPHQ_once_we_too_were_strangers"
    n = {}
    try:
        import pyreadr
        r = pyreadr.read_r(rawp(root, slug, "Once_We_Too_Data.Rdata"))
        n = {k: len(v) for k, v in r.items() if k in ("g.2022", "dinas")}
    except Exception as e:  # noqa: BLE001
        return [], [skipped_entry("p4_owt2022", slug, man, None, f"could not parse Rdata: {e}")]
    return [], [
        skipped_entry("p4_owt2022", slug, man, n.get("g.2022"),
                      "g.2022 frame (n=2,483): no variable or value labels for the attitude items (numeric codes such as -2..3 with "
                      "undocumented meaning); the Greek questionnaire is not in the deposit (appendix gives only paraphrases). "
                      "Wording and option meanings cannot be established without inspecting answers, so no item qualifies.",
                      ["TREATMENT: tr (0 control / 1 treated vignette) — would have restricted all outcomes to tr==0.",
                       "The deposit's second Greek frame 'dinas' (n=1,897; original Dinas, Fouka & Schlaepfer 2021 survey, northern "
                       "prefectures + Lesvos) is NOT in the lake at all (no fileId, no resp file, no bank items): all 1,897 ids match "
                       "the phase-4 FINAL HOLDOUT 'dinas' (harvard_10.7910_DVN_CQUVCV greece.dta, n=1,928), so including it would leak "
                       "holdout respondents.",
                       "Other frames (t.2021, c.2018, c.2021, c.2022, c.3arms, c.2022.nome) are Turkish / Cypriot samples (not Greek)."],
                      wave="2022-10", wave_approx=False),
    ]


def h_skip_covid(root, man):
    slug = "harvard_FGMNNF_covid_attitudes_social_media_gr_2020"
    try:
        df, m = pyreadstat.read_dta(rawp(root, slug, "study_sample.dta"), metadataonly=True)
        n = m.number_rows
    except Exception as e:  # noqa: BLE001
        return [], [skipped_entry("p4_covidsm2020", slug, man, None, f"could not parse: {e}")]
    return [], [skipped_entry("p4_covidsm2020", slug, man, n,
                              "study_sample.dta has no variable or value labels (item_eu, item_cancer, know1-5 ...) and the deposit's "
                              "syntax.do / codebook was not downloaded: question wording and code meanings (direction of the 5-point "
                              "scales, correct answers of know1-5) are undocumented, so no item qualifies. reference_sample.dta holds only "
                              "6 demographic variables.", wave="2020-04", wave_approx=False)]


def h_skip_valereco(root, man):
    slug = "zenodo_18350399_valereco_legumes_consumers"
    n = None
    try:
        d = pd.read_excel(rawp(root, slug, "1VALERECO_survey_data_consumers.xlsx"), dtype=object)
        if "C103" in d:
            n = int((pd.to_numeric(d.C103, errors="coerce") == 7).sum())
    except Exception as e:  # noqa: BLE001
        return [], [skipped_entry("p4_valereco2025", slug, man, None, f"could not parse: {e}")]
    return [], [skipped_entry("p4_valereco2025", slug, man, n, f"Greek residents (C103 == 7): n={n} < {MIN_N}; no item can reach "
                                                               f"{MIN_N} valid Greek answers.", wave="2025-03", wave_approx=False)]


# ============================================================================== driver

def run_slug(root, slug, man_all):
    man = man_all[slug]
    if slug == "ess_r1_r5_greece":
        return h_ess(root, man)
    if slug == "eb_931_2020_harvard_QHL4JK":
        return h_gesis_eb(root, man, slug, "p4_eb931", "ZA7649_eb93.1.dta", ("isocntry", "GR"), region_vars=("region_greece_wt", "p7gr", "nuts"))
    if slug == "eb_884_2017_harvard_VNKZQF":
        return h_gesis_eb(root, man, slug, "p4_eb884", "ZA6939_v2-0-0.dta", ("isocntry", "GR"), wave="2017-12",
                          wave_basis="survey identification 'December 2017' (no interview date variable)", region_vars=("p7gr", "nuts"))
    if slug == "eb_862_2016_harvard_KMWN9M":
        return h_gesis_eb(root, man, slug, "p4_eb862", "ZA6788_v2-0-0.dta", ("isocntry", "GR"), region_vars=("p7gr", "nuts"))
    if slug == "eb_843_2015_harvard_4TEDMI":
        return h_gesis_eb(root, man, slug, "p4_eb843", "ZA6643_v3-1-0.dta", ("isocntry", "GR"), bq="ZA6643_bq.pdf", region_vars=("p7gr", "nuts"))
    if slug == "flash_eb_506_2022_harvard_COS3BS":
        return h_gesis_eb(root, man, slug, "p4_fl506", "ZA7871_v1-0-0.dta", ("isocntry", "GR"), wave="2022-04",
                          wave_basis="survey identification 'April 2022' (no date variable)", region_vars=("d12gr", "d12gr_r"),
                          demo_vars=FLASH_EB_DEMO, keep_d=None,
                          extra_notes=["Flash EB numbering: d1 age, d2 gender, d4 age education ended, d13 type of community.",
                                       "Most battery variable labels are cut at Stata's 80-character limit before the item text "
                                       "(e.g. 'Q3_1 How much do you agree or disagree with each of the following statements? Si'); "
                                       "with no questionnaire in the deposit these sub-items are excluded."])
    if slug == "eb_1033_2025_trimmed_harvard_L2U3XR":
        return h_gesis_eb(root, man, slug, "p4_eb1033", "ZA9128_v1-0-0_trimmed.dta", ("country", 11.0), region_vars=("region_greece",),
                          demo_vars={"age": None, "gender": "d10", "edu": "d9a", "edu_kind": "isced", "urban": "d25"},
                          extra_notes=["Trimmed producer subset (76 of ~550 variables): only the 4-category age recode d11r1 survives "
                                       "(15-24 / 25-39 / 40-54 / 55+), which does not map onto the lake's age bands."])
    if slug == "eb_943_standard_2021_zenodo11002008":
        path = rawp(root, slug, "ST943_FINAL_SPSS_19042021.xlsx")
        try:
            cb = eb943_codebook(path)
        except Exception as e:  # noqa: BLE001
            return [], [skipped_entry("p4_eb943", slug, man, None, f"codebook not parseable: {e}")]
        dl = cb.get("Date", {}).get("values", {})
        g = pd.read_csv(rawp(root, slug, "derived_GR_only_EB943.csv"), usecols=["B", "Date"])
        g = g[pd.to_numeric(g.B, errors="coerce") == 13]
        wave = earliest_month([ym_from_label(dl.get(float(v))) if v == v else None for v in pd.to_numeric(g.Date, errors="coerce")])
        edu_v = next((v for v in ("D8R", "D8r", "D8") if v in cb and any("16-19" in str(x) for x in cb[v]["values"].values())), "D8")
        return h_csv_eb(root, man, slug, "p4_eb943", "derived_GR_only_EB943.csv", cb, sep=",", filt_col="B", filt_val=13, age_var="RC006",
                        gender_var="D10", edu_var=edu_v, urb_var="D25", region_var="Region_Greece", weight_var="weight", wave=wave,
                        wave_basis="earliest Greek interview date (Date codes -> ListVariables labels)",
                        partial_rx=r"^Q[A-Z]+\d+b[._]", total_rx=r"^Q[A-Z]+\d+[a-z]?T(\d*|\d*[._]\d+)$",
                        notes=["Data from derived_GR_only_EB943.csv (the 1,058 Greek rows of the raw xlsx, same columns; B == 13 re-checked); "
                               "codebook = ListVariables sheet (question text, sub-question, value labels).",
                               "Weight = 'weight' (national weight of the raw file) normalised to mean 1 (no documentation of the many "
                               "weight variants; 'weight' is the base national weight).",
                               "Mixed mode in Greece (CAPI 536 / CAWI 522)."])
    if slug == "efsa_eb_food_safety_2025":
        cb = datamap_codebook(rawp(root, slug, "Food_safety_2025_CSV_datamap.xlsx"), "Variable Labels", "Variable Value Labels")
        return h_csv_eb(root, man, slug, "p4_efsa2025", "Food_safety_2025_CSV_v2_data.csv", cb, sep=";", filt_col="B", filt_val=13,
                        age_var=None, age_band_var="D11R", gender_var="D10", edu_var="D8", urb_var="D25",
                        region_var=next((v for v in cb if re.match(r"^Region_?(GR|EL|Greece)", v, re.I)), None),
                        weight_var=next((v for v in ("weight", "Weight", "W1", "w1") if v in cb), None), wave="2025-03",
                        wave_basis="P1 interview dates for Greece 2025-03-26 to 2025-04-15 (manifest)",
                        partial_rx=r"^Q[A-Z]+\d+b[._]", total_rx=r"^Q[A-Z]+\d+[a-z]?T(\d*|\d*[._]\d+)$",
                        notes=["Split-ballot versions (e.g. QE11a/b/c with different item wording) are kept as separate items, each answered "
                               "by its random subsample; the merged 'T' variables are excluded as derived."])
    if slug == "efsa_eb_972_food_safety_2022":
        cb = datamap_codebook(rawp(root, slug, "DataMap_eb972_food_safety_v2.xlsx"), "Variable Labels", "Variable Values")
        return h_csv_eb(root, man, slug, "p4_efsa2022", "eb972_food_safety_v3.csv", cb, sep="~", filt_col="B", filt_val=13,
                        age_var=None, age_band_var="D11R", gender_var="D10", edu_var="D8", urb_var="D25",
                        region_var=next((v for v in cb if re.match(r"^Region_?(GR|EL|Greece)", v, re.I)), None),
                        weight_var=next((v for v in ("weight", "Weight", "W1", "w1") if v in cb), None), wave="2022-03",
                        wave_basis="EFSA record: fieldwork 2022-03-21 to 2022-04-20 (file p1 = day of month only)",
                        partial_rx=r"^Q[A-Z]+\d+b[._]", total_rx=r"^Q[A-Z]+\d+[a-z]?T(\d*|\d*[._]\d+)$")
    if slug == "efsa_eb_913_food_safety_2019":
        return h_efsa2019(root, man)
    if slug == "lrf_world_risk_poll_2019_2025":
        return h_wrp(root, man)
    if slug == "harvard_CPDFPQ_o_xenos_gr":
        return h_xenos(root, man)
    if slug == "harvard_E2CIQE_national_histories_gr":
        return h_grpast(root, man, man_all.get("harvard_GYQLGB_greek_past_ideology_2026", {}), "nana")
    if slug == "harvard_GYQLGB_greek_past_ideology_2026":
        return h_grpast(root, man_all.get("harvard_E2CIQE_national_histories_gr", {}), man, "jmgs")
    if slug == "harvard_KYCG3P_greek_referendum_2015_poll":
        return h_referendum(root, man)
    if slug == "zenodo_20772797_populism_it_gr_es_2022":
        return h_populism(root, man)
    if slug == "zenodo_18631009_tealhelix_food_labels_11eu":
        return h_tealhelix(root, man)
    if slug == "harvard_ADQPHQ_once_we_too_were_strangers":
        return h_skip_once_we_too(root, man)
    if slug == "harvard_FGMNNF_covid_attitudes_social_media_gr_2020":
        return h_skip_covid(root, man)
    if slug == "zenodo_18350399_valereco_legumes_consumers":
        return h_skip_valereco(root, man)
    return [], [skipped_entry(f"p4_{slug[:20]}", slug, man, None, "no adapter for this manifest entry")]


def validate(root, bank, files):
    """Counts-only validation of the written outputs."""
    problems = []
    by_file = {}
    for it in bank:
        by_file.setdefault(it["file"], []).append(it)
    ids = [it["id"] for it in bank]
    if len(ids) != len(set(ids)):
        problems.append("duplicate item ids in bank")
    fams = [it["family"] for it in bank]
    if len(fams) != len(set(fams)):
        problems.append("duplicate family ids")
    for f in files:
        if not (isinstance(f.get("wave"), str) and re.fullmatch(r"\d{4}-\d{2}", f["wave"])):
            problems.append(f"{f['fileId']}: wave {f.get('wave')!r} is not YYYY-MM")
        if f["role"] != ROLE:
            continue
        fid = f["fileId"]
        path = os.path.join(root, OUT_REL, "resp", f"{fid}.csv.gz")
        items = by_file.get(fid, [])
        d = pd.read_csv(path, dtype=str, keep_default_na=False, na_values=[""])
        exp = DEMO_COLS + [it["id"] for it in items]
        if list(d.columns) != exp:
            problems.append(f"{fid}: column order != bank order")
        w = pd.to_numeric(d.weight)
        if abs(w.mean() - 1) > 1e-3 or w.isna().any():
            problems.append(f"{fid}: weight mean {w.mean():.4f}")
        if d.rid.duplicated().any():
            problems.append(f"{fid}: duplicate rid")
        if len(d) != f["n"] or len(items) != f["nItems"]:
            problems.append(f"{fid}: n / nItems mismatch")
        for c, allowed in (("gender", {"male", "female"}), ("edu3", {"low", "medium", "high"}), ("urban", {"urban", "rural"}),
                           ("nuts1", {"attica", "north", "centre", "islands"}), ("age_band", {b for _, _, b in AGE_BANDS})):
            bad = set(d[c].dropna().unique()) - allowed
            if bad:
                problems.append(f"{fid}: {c} has values {sorted(bad)[:5]}")
        for it in items:
            opts = {o["code"] for o in it["options"]}
            if not 2 <= len(opts) <= 11:
                problems.append(f"{it['id']}: {len(opts)} options")
            col = d[it["id"]].dropna()
            bad = set(col.unique()) - opts
            if bad:
                problems.append(f"{it['id']}: codes {sorted(bad)[:5]} not in options")
            if len(col) < MIN_N:
                problems.append(f"{it['id']}: {len(col)} valid answers")
            if it["family"] != f"p4fam_{fid}_{it['var']}":
                problems.append(f"{it['id']}: family id")
            if it["wave"] != f["wave"]:
                problems.append(f"{it['id']}: wave mismatch")
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", default=".")
    ap.add_argument("--only", action="append", help="manifest slug to (re)build; repeatable. Other files in the lake are kept.")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    man_all = load_manifest(root)
    slugs = list(man_all)
    if a.only:
        bad = [s for s in a.only if s not in man_all]
        if bad:
            raise SystemExit(f"unknown slug(s): {bad}")
        slugs = [s for s in slugs if s in a.only]
    out = os.path.join(root, OUT_REL)
    os.makedirs(os.path.join(out, "resp"), exist_ok=True)
    bank_p, files_p = os.path.join(out, "lake_bank.json"), os.path.join(out, "lake_files.json")
    bank, files = [], []
    if a.only and os.path.exists(bank_p) and os.path.exists(files_p):
        old_files = json.load(open(files_p, encoding="utf-8"))
        drop = {f["fileId"] for f in old_files if f["slug"] in slugs}
        files = [f for f in old_files if f["slug"] not in slugs]
        bank = [it for it in json.load(open(bank_p, encoding="utf-8")) if it["file"] not in drop]
    for slug in slugs:
        b, metas = run_slug(root, slug, man_all)
        bank += b
        files += metas
    order = {s: i for i, s in enumerate(man_all)}
    files.sort(key=lambda f: (order.get(f["slug"], 999), f["fileId"]))
    fo = [f["fileId"] for f in files]
    bank.sort(key=lambda it: fo.index(it["file"]))  # stable: keeps item order within a file
    written = {f["fileId"] for f in files if f["role"] == ROLE}
    for fn in os.listdir(os.path.join(out, "resp")):
        if fn.endswith(".csv.gz") and fn[:-7] not in written:
            os.remove(os.path.join(out, "resp", fn))
    with open(bank_p, "w", encoding="utf-8") as fh:
        json.dump(bank, fh, ensure_ascii=False, indent=0)
    with open(files_p, "w", encoding="utf-8") as fh:
        json.dump(files, fh, ensure_ascii=False, indent=1)
    problems = validate(root, bank, files)
    n_ev = sum(1 for f in files if f["role"] == ROLE)
    print(f"lake: {n_ev} evidence files, {sum(1 for f in files if f['role'] != ROLE)} skipped, {len(bank)} items")
    print("validation: OK" if not problems else "validation problems:\n  " + "\n  ".join(problems[:50]))
    if problems:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
