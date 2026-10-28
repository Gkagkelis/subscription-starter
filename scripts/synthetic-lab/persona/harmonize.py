"""
Harmonisation layer του Persona Intelligence Engine (Level A: πραγματικές ατομικές απαντήσεις).

Μετατρέπει κάθε αρχείο μικροδεδομένων σε ΕΝΑ κοινό σχήμα:
  - δημογραφικά (age_band, gender, edu3, nuts1, region13, urban)
  - «άγκυρες» (anchors): μεταβλητές που υπάρχουν σε πολλές έρευνες και ενώνουν τις πηγές
        emp      κατάσταση απασχόλησης (9 κατηγορίες)
        inc6     μηνιαίο ΟΙΚΟΓΕΝΕΙΑΚΟ εισόδημα σε 6 ζώνες (ατομικό εισόδημα ΔΕΝ αντιστοιχίζεται)
        econ4    «πώς τα βγάζετε πέρα» (1 δεν τα βγάζω … 4 άνετα)
        class3   υποκειμενική κοινωνική τάξη (χαμηλή/μεσαία/υψηλή)
        believer πιστεύει στον Θεό (ναι/όχι)
        lr7      αυτοτοποθέτηση (1 άκρα αριστερά … 7 άκρα δεξιά)· lr_none = «τίποτα/ΔΞ»
        pv       ψήφος στις τελευταίες βουλευτικές (κλειδί κόμματος ή abstain/blank/dk) + pv_election
        polint4  ενδιαφέρον για την πολιτική (1 πολύ … 4 καθόλου)
        vi       πρόθεση ψήφου (όπου ρωτήθηκε) + vi_wave
  - items: κάθε άλλη κατηγορική ερώτηση του αρχείου (μία στήλη ανά item· κωδικοί ανά επιλογή, ΔΞ/ΔΑ = 'dk')
Δεν κρατιούνται αναγνωριστικά, ημερομηνίες γέννησης, νομοί, ελεύθερο κείμενο.

Έξοδος (ιδιωτική, gitignored): <data>/persona/harmonized/
  files.json            μεταδεδομένα ανά αρχείο (πηγή, κύμα, άδεια, βαθμίδα, ποιες άγκυρες υπάρχουν)
  item_bank.json        κατάλογος items (κείμενο, επιλογές, τύπος, κατασκευή, οικογένεια διαχρονικής σύνδεσης)
  resp/<file_id>.csv.gz ατομικές εγγραφές (rid τυχαίο, ΟΧΙ το ID της πηγής)

Χρήση: python3 scripts/synthetic-lab/persona/harmonize.py <repo_root>
"""
import gzip
import hashlib
import importlib.util
import json
import os
import re
import sys
import zipfile
from collections import Counter, defaultdict

import numpy as np
import pandas as pd
import pyreadstat

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
DATA = os.path.join(ROOT, ".synthetic-lab-data")
OUT = os.path.join(DATA, "persona", "harmonized")

_spec = importlib.util.spec_from_file_location("dn", os.path.join(ROOT, "scripts/synthetic-lab/import_dianeosis.py"))
dn = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dn)
norm, fix_text = dn.norm, dn.fix_text

AGE_BANDS = ["17-24", "25-34", "35-44", "45-54", "55-64", "65+"]
NUTS1 = {"GRCr101": "attica", "GRCr105": "north", "GRCr106": "north", "GRCr107": "north", "GRCr108": "north",
         "GRCr109": "centre", "GRCr110": "centre", "GRCr111": "centre", "GRCr112": "centre", "GRCr113": "centre",
         "GRCr102": "islands", "GRCr103": "islands", "GRCr104": "islands"}
DK = re.compile(r"\bδξ|\bδγ|\bδα\b|δ\.ξ|δ\.α|δεν (γνωριζ|απαντ|ξερ)|αρνηση|don.?t know|prefer not|refus|no answer|\bna\b|\bdk\b")
ANCHORS = ["emp", "inc6", "econ4", "class3", "believer", "lr7", "lr_none", "pv", "pv_election", "polint4", "vi", "vi_wave"]
DEMO = ["age_band", "gender", "edu3", "nuts1", "region13", "urban"]


def age_band(a):
    try:
        a = float(a)
    except (TypeError, ValueError):
        return None
    if a != a or a < 17 or a > 105:
        return None
    for lo, hi, b in ((17, 24, "17-24"), (25, 34, "25-34"), (35, 44, "35-44"), (45, 54, "45-54"), (55, 64, "55-64")):
        if lo <= a <= hi:
            return b
    return "65+"


# ---------------------------------------------------------------- κόμματα
PARTY_RX = [
    ("nd", r"^ν\.?\s?δ\.?\b|νεα δημοκρατ|^nd\b|\bνδ\b"),
    ("syriza", r"συριζα|\bσυ\b|syriza|^sy\b"),
    ("pasok", r"πασοκ|κιναλ|κινημα αλλαγ|δημοκρατικη (παραταξη|συμπαραταξ)|δη\.?συ|pasok|kinal|ελια\b"),
    ("kke", r"\bκκε\b|kke|κομμουνιστ"),
    ("xa", r"χρυση αυγη|golden dawn"),
    ("anel", r"ανελ|ανεξαρτητοι ελληνεσ|indep.* greeks"),
    ("potami", r"ποταμι|potami"),
    ("ek", r"ενωση κεντρωων|λεβεντη|union of centrists"),
    ("lae", r"λαικη ενοτητα|λαφαζαν|\bλαε\b"),
    ("el", r"ελληνικη λυση|βελοπουλ|greek solution"),
    ("mera25", r"μερα\s?25|μερα 25|βαρουφακ|mera"),
    ("plefsi", r"πλευση|κωνσταντοπουλ|plefsi"),
    ("spartiates", r"σπαρτιατ"),
    ("niki", r"\bνικη\b|νατσιο"),
    ("nea_aristera", r"νεα αριστερα"),
    ("antarsya", r"ανταρσυα|antarsya"),
    ("dimar", r"δημαρ\b|δημοκρατικη αριστερα"),
    ("laos", r"λαοσ\b|λα\.ο\.σ|καρατζαφερ"),
]
FAMILY = {"nd": "nd", "syriza": "syriza", "pasok": "pasok", "kke": "kke", "xa": "far_right", "el": "far_right",
          "spartiates": "far_right", "niki": "far_right", "laos": "far_right", "anel": "right_populist",
          "potami": "centre", "ek": "centre", "dimar": "centre", "lae": "left_other", "mera25": "left_other",
          "plefsi": "left_other", "antarsya": "left_other", "nea_aristera": "left_other", "other": "other",
          "abstain": "abstain", "blank": "blank", "dk": "dk", "underage": "abstain", "nonvote": "nonvote"}


def party_key(label):
    t = norm(fix_text(str(label)))
    if re.search(r"δεν ψηφισ|δεν πηγα|απεχ|αποχη|did not vote|δεν ειχα δικαιωμα|ανηλικ|not eligible|i do not vote|would not vote|wouldn.?t vote|δεν θα ψηφ", t):
        return "abstain"
    if re.search(r"(ακυρο|λευκο).*(δεν ψηφισ|δα\b)", t):
        return "nonvote"  # μικτός κωδικός της πηγής (λευκό/άκυρο/αποχή/ΔΑ)
    if re.search(r"λευκο|ακυρο|blank|invalid", t):
        return "blank"
    if DK.search(t) or re.search(r"δεν θυμ|don.?t remember|δεν (εχω|ξερω) αποφασ|αναποφασ|undecided", t):
        return "dk"
    for k, rx in PARTY_RX:
        if re.search(rx, t):
            return k
    if re.search(r"αλλο|other|λοιπα|πατριωτικ", t):
        return "other"
    return None


# ---------------------------------------------------------------- άγκυρες από ετικέτες
def emp_of(label):
    t = norm(fix_text(str(label)))
    if DK.search(t):
        return None
    if "συνταξιουχ" in t or "retired" in t:
        return "retired"
    if re.search(r"δημοσιοσ υπαλληλ|δημοσιο υπαλλ", t):
        return "public_emp"
    if re.search(r"ιδιωτικοσ υπαλληλ|εργατ|μισθωτ", t):
        return "private_emp"
    if re.search(r"αγροτ|κτηνοτροφ|αλιε", t):
        return "farmer"
    if re.search(r"ελευθερ|επιστημων|επιχειρηματ|αυτοαπασχολ|εμπορ|καταστηματαρχ|βιοτεχν|τεχνιτ", t):
        return "self_emp"
    if re.search(r"ανεργ|unemploy", t):
        return "unemployed"
    if re.search(r"φοιτητ|μαθητ|σπουδαστ|student|education", t):
        return "student"
    if re.search(r"οικιακ|νοικοκυρ|housew|homemak", t):
        return "homemaker"
    return "other"


def inc6_of(label):
    t = norm(fix_text(str(label))).replace(".", "").replace(" ", "")
    if DK.search(norm(fix_text(str(label)))):
        return None
    if re.search(r"καθολου", t):
        return 1
    m = re.search(r"(\d{3,5})", t)
    if not m:
        return None
    lo = int(m.group(1))
    if re.search(r"κατω|εωσ500|^εωσ", t) and lo <= 500:
        return 1
    if re.search(r"πανω|ανω", t):
        return 6 if lo >= 3000 else None
    return {500: 1, 501: 2, 1001: 3, 1000: 3, 1501: 4, 1500: 4, 2001: 5, 2000: 5, 3001: 6, 3000: 6, 5001: 6, 5000: 6}.get(lo)


def econ4_of(label):
    t = norm(fix_text(str(label)))
    if DK.search(t):
        return None
    if re.search(r"δεν τα βγαζ|δεν φθανει|δε φθανει", t):
        return 1
    if re.search(r"δεν μπορω να αποταμιευ|δε μου (μενουν|περισσευ)", t):
        return 3
    if re.search(r"με .{0,25}δυσκολ|με το ζορι|μολισ", t):
        return 2
    if re.search(r"αλλα δεν? (μου )?(περισσευ|μενουν)|φθανει μονο|φθανει για (τα )?(βασικ|απαραιτ)", t):
        return 3
    if re.search(r"ανετ|περισσευ|αποταμιευ|φθανει για (ν|ο)", t):
        return 4
    return None


def class3_of(label):
    t = norm(fix_text(str(label)))
    if DK.search(t):
        return None
    if re.search(r"ανωτερ|ανωτερη|upper", t) and not re.search(r"μεση ανωτερ|μεσαια προσ (τα )?πανω", t):
        return 3
    if re.search(r"κατωτερ|lower|εργατικ", t) and not re.search(r"μεση κατωτερ", t):
        return 1
    if re.search(r"μεση ανωτερ", t):
        return 3
    if re.search(r"μεση κατωτερ|μεσο.?κατωτερ|μεσαια προσ (τα )?κατω", t):
        return 1
    if re.search(r"μεσαι|μεση|middle", t):
        return 2
    return None


def lr7_of(label):
    t = norm(fix_text(str(label)))
    if re.search(r"τιποτα|κανενα|none|δεν (με )?εκφραζ", t) or DK.search(t):
        return "none"
    if re.search(r"ακρα αριστερ", t):
        return 1
    if re.search(r"κεντρο.?αριστερ|κεντροαριστερ", t):
        return 3
    if re.search(r"κεντρο.?δεξι|κεντροδεξι", t):
        return 5
    if re.search(r"ακρα δεξι", t):
        return 7
    if re.search(r"αριστερ", t):
        return 2
    if re.search(r"δεξι", t):
        return 6
    if re.search(r"κεντρο", t):
        return 4
    return None


def lr7_of_11(v):
    """0–10 → 7 κατηγορίες (ΠΑΡΑΔΟΧΗ αντιστοίχισης κλιμάκων, ελέγχεται στο audit των κατανομών)."""
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    if v != v or v < 0 or v > 10:
        return None
    return {0: 1, 1: 1, 2: 2, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 6, 9: 7, 10: 7}[int(v)]


def believer_of(label):
    t = norm(fix_text(str(label)))
    if DK.search(t):
        return None
    if re.match(r"^(ναι|μαλλον ναι)", t):
        return 1
    if re.match(r"^(οχι|μαλλον οχι)", t):
        return 0
    return None


def polint4_of(label):
    t = norm(fix_text(str(label)))
    if DK.search(t):
        return None
    for k, rx in ((1, r"^πολυ|very"), (2, r"^αρκετα|somewhat|quite"), (3, r"^λιγο|not very"), (4, r"^καθολου|not at all")):
        if re.search(rx, t):
            return k
    return None


# ---------------------------------------------------------------- items
ORDINAL_VOCAB = re.compile(
    r"συμφων|διαφων|πολυ|αρκετα|λιγο|καθολου|θετικ|αρνητικ|καλυτερ|χειροτερ|σιγουρα|μαλλον|ικανοποι|συχνα|σπανια|ποτε|"
    r"παντα|καθε (μερα|εβδομαδ|μηνα)|φορεσ|εμπιστευ|σημαντικ|ισχυει|^\d+\b|^ναι$|^οχι$|agree|disagree|very|somewhat|not at all|"
    r"never|often|daily|likely|satisf|trust|better|worse|ισχυρ|ασθεν|αυξη|μειω")
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


def construct_of(text):
    t = norm(fix_text(text))
    for k, rx in CONSTRUCTS:
        if re.search(rx, t):
            return k
    return "other"


SENSITIVE = re.compile(r"ethnic|minority ethnic|μειονοτ.{0,20}(ανηκ|ομαδ)|παρενοχλ|κακοποι|βιασ|sexual orient|σεξουαλικ.{0,10}προσανατολ|"
                       r"διαγνωσ|χρονια νοσ|ψυχικη ασθεν|αναπηρ|disab|hiv|ναρκωτικ|drug")


def is_skip_var(name, label):
    t = norm(fix_text(label)) + " " + name.lower()
    if SENSITIVE.search(t):
        return True  # ευαίσθητα δεδομένα (άρθρο 9 GDPR): δεν γίνονται items, ούτε συνθετικές απαντήσεις
    if re.match(r"^d\d", name.lower()) or re.match(r"^\s*(ηλικια|φυλο|μορφωση|εκπαιδευτικο επιπεδο|επαγγελματικ|θεση στην απασχολ|οικογενειακη κατασταση|"
                                                      r"εισοδημα|μηνιαιο οικογενειακο|κοινωνικη ταξη|περιοχη κατοικιας|αστικοτητα|δημογραφ)", norm(fix_text(label))):
        return True
    return bool(re.search(r"κωδικ|recordno|^id\b|ημερομηνια|γεννησ|year_born|νομο|area\b|weight|σταθμ|στρωμα|βαρο|ερευνητ|interviewer|"
                          r"\bfilter|μεθοδολογ|type\b|duration|διαρκεια|time|record|quota|version|comp\b|language|^\s*$", t))


def complete_numeric_scale(s, subst, opts):
    """Κλίμακα με ετικέτες μόνο στα άκρα (π.χ. 0 «καθόλου» … 10 «απόλυτα»): συμπληρώνει τις ενδιάμεσες τιμές που
    υπάρχουν στα δεδομένα. Χωρίς αυτό, οι απαντήσεις 1–9 χάνονταν και το item γινόταν ψευδο-δυαδικό (διόρθωση sprint 10/2026)."""
    try:
        keys = sorted(float(k) for k in subst)
    except (TypeError, ValueError):
        return subst
    if len(keys) < 2 or not all(k.is_integer() for k in keys):
        return subst
    lo, hi = int(keys[0]), int(keys[-1])
    if not 4 <= hi - lo <= 10 or len(keys) == hi - lo + 1:
        return subst
    dk = {k for k, v in opts.items() if DK.search(norm(v))}
    vals = pd.to_numeric(s, errors="coerce")
    vals = vals[vals.notna() & ~vals.isin(dk)]
    inside = vals[(vals >= lo) & (vals <= hi) & (vals % 1 == 0)]
    if len(vals) == 0 or len(inside) / len(vals) < 0.98 or inside.nunique() < hi - lo - 1:
        return subst
    lab = {int(float(k)): v for k, v in subst.items()}
    return {float(v): (f"{v} {lab[v]}" if v in lab else str(v)) for v in range(lo, hi + 1)}


def build_items(df, meta, skip_cols, file_id, wave):
    """Κατηγορικά items + ομάδες πολλαπλών αναφορών («Και ποια άλλη;») ως δυαδικά items ανά επιλογή."""
    vls = meta.variable_value_labels or {}
    labs = meta.column_names_to_labels or {}
    cols = [c for c in df.columns if c not in skip_cols]
    items, data = [], {}
    i = 0
    while i < len(cols):
        c = cols[i]
        vl = vls.get(c) or {}
        lab = fix_text(labs.get(c) or "")
        if not vl or is_skip_var(c, lab):
            i += 1
            continue
        # ομάδα πολλαπλών αναφορών: επόμενες μεταβλητές με «και ποια άλλη» και ίδιες ετικέτες τιμών
        group = [c]
        j = i + 1
        while j < len(cols) and (vls.get(cols[j]) or {}) == vl and re.search(r"^\s*(και )?ποι(α|ο|οι|ες|ος) (αλλ|επισησ)|and which other|^\s*$|"
                                                                               r"εωσ \d απαντ", norm(fix_text(labs.get(cols[j]) or ""))) \
                and not re.search(r"^\s*$", norm(lab)):
            group.append(cols[j])
            j += 1
        if len(group) == 1 and j < len(cols) and (vls.get(cols[j]) or {}) == vl and norm(fix_text(labs.get(cols[j]) or "")) == norm(lab):
            while j < len(cols) and (vls.get(cols[j]) or {}) == vl and norm(fix_text(labs.get(cols[j]) or "")) == norm(lab):
                group.append(cols[j])
                j += 1
        # κωδικοί-γράμματα (Stata «.a/.b/.c» = άρνηση/ΔΞ/ΔΑ) δεν είναι επιλογές απάντησης
        opts = {k: fix_text(str(v)).strip() for k, v in vl.items() if isinstance(k, (int, float))}
        subst = {k: v for k, v in opts.items() if not DK.search(norm(v))}
        subst = complete_numeric_scale(df[c], subst, opts)
        if len(group) > 1 and len(subst) >= 3:
            for k, v in subst.items():
                if re.search(r"^(αλλο|other|τιποτα|none|κανεν)", norm(v)):
                    continue
                iid = f"{file_id}::{group[0]}::m{int(k) if float(k).is_integer() else k}"
                vals = df[group].isin([k]).any(axis=1)
                answered = df[group[0]].notna()
                data[iid] = vals.where(answered).map({True: "1", False: "0"})
                text = f"{re.sub(r'\s+', ' ', lab).strip()} — αναφέρει: «{v}»"
                items.append({"id": iid, "file": file_id, "wave": wave, "var": group[0], "text": text, "type": "binary",
                              "options": [{"code": "0", "label": "Όχι"}, {"code": "1", "label": "Ναι"}], "dkCode": None,
                              "construct": construct_of(lab + " " + v), "multiMention": len(group)})
            i = j
            continue
        if len(subst) < 2 or len(subst) > 12:
            i += 1
            continue
        s = df[c]
        if s.notna().mean() < 0.3:
            i += 1
            continue
        code = s.map(lambda x: None if x != x else ("dk" if x in opts and DK.search(norm(opts[x])) else (str(int(x)) if float(x).is_integer() else str(x)) if x in subst else None))
        if code.notna().mean() < 0.3:
            i += 1
            continue
        olabels = [subst[k] for k in sorted(subst)]
        ordinal = len(subst) == 2 or sum(1 for o in olabels if ORDINAL_VOCAB.search(norm(o))) >= max(2, int(0.6 * len(olabels)))
        ordinal = ordinal or all(re.match(r"^\d", o) for o in olabels)
        iid = f"{file_id}::{c}"
        data[iid] = code
        items.append({"id": iid, "file": file_id, "wave": wave, "var": c, "text": re.sub(r"\s+", " ", lab).strip(),
                      "type": "ordinal" if ordinal else "nominal",
                      "options": [{"code": str(int(k)) if float(k).is_integer() else str(k), "label": subst[k]} for k in sorted(subst)],
                      "dkCode": "dk" if any(DK.search(norm(v)) for v in opts.values()) else None,
                      "construct": construct_of(lab)})
        i += 1
    return items, data


def rid(file_id, i):
    return hashlib.sha1(f"{file_id}:{i}:persona-v1".encode()).hexdigest()[:12]


def write_file(file_id, frame):
    os.makedirs(os.path.join(OUT, "resp"), exist_ok=True)
    frame.to_csv(os.path.join(OUT, "resp", f"{file_id}.csv.gz"), index=False, compression="gzip")


# ---------------------------------------------------------------- διαΝΕΟσις
DN_FILES = [
    # file_id, path, wave (πεδίο ~), weight, explicit anchors {anchor: var}, pv election
    ("dn2015a", "2015/unz/DATABASE_IDEOGRAMMA_Posotiki_Apriliou.sav", "2015-04", None, {"lr": "Q017", "inc": "Q0B5", "emp": "Q0B3", "edu": "Q0B4"}, None),
    ("dn2015n", "2015/unz/DATABASE_IDEOGRAMMA_Posotiki_Noemvriou.sav", "2015-11", "W_15", {"lr": "Q057", "inc": "Q0B5", "emp": "Q0B3", "edu": "Q0B4", "econ": "Q069", "pv": "Q070", "believer": "Q047"}, "2015-09"),
    ("dn2017", "2017/unz/Integrated_PartA&B_2557q_GreekBeliefs.sav", "2016-12", "sexage3weightInt", {"inc": "income", "emp": "profession", "econ": "ecselfass", "class": "Class", "pv": "pastvote", "believer": "worship"}, "2015-09"),
    ("dn2018a", "2018/unz/TPE_2018/TPE2018_SPSS.sav", "2017-12", "WEIGHT", {"lr": "Q43", "emp": "D4", "econ": "D6", "class": "D7", "pv": "Q45", "believer": "Q18"}, "2015-09"),
    ("dn2018b", "2018/unz/TPE_2018/DIANEOSIS_B_send.sav", "2017-12", "WEIGHT", {"lr": "Q29A", "emp": "D4", "econ": "D6", "class": "D7", "pv": "B29C"}, "2015-09"),
    ("dn2020a", "2020/unz/TPE_2020/TPE_2020_MEROS_A.sav", "2019-12", "sta2", {"lr": "Q39", "emp": "D05", "inc": "D06", "econ": "D07", "class": "D08", "pv": "Q41", "believer": "Q24"}, "2019-07"),
    ("dn2020b", "2020/unz/TPE_2020/TPE_2020_MEROS_B.sav", "2019-12", "sta2", {"lr": "Q30", "emp": "D05", "inc": "D06", "econ": "D07", "class": "D08", "pv": "Q32", "polint": "Q26"}, "2019-07"),
    ("dn2022a", "2022/unz/SPSS/MEROS_A_SPSS.sav", "2021-12", "sta2", {"lr": "Q39", "emp": "D04", "inc": "D05", "econ": "D06", "class": "D07", "pv": "Q40", "believer": "Q33"}, "2019-07"),
    ("dn2022b", "2022/unz/MEROS_B_SPSS.sav", "2021-12", "sta2", {"lr": "Q37", "emp": "D04", "inc": "D05", "econ": "D06", "class": "D07", "pv": "Q38", "polint": "Q35"}, "2019-07"),
    ("dn2022s", "2022/unz/SPSS/SYMPLIROMATIKO_MEROS_SPSS.sav", "2021-12", "sta2", {"lr": "Q08", "emp": "D04", "inc": "D05", "econ": "D06", "class": "D07", "pv": "Q09"}, "2019-07"),
    ("dn2024a", "2024/unz/data_part1_w.SAV", "2023-12", "x1", {"lr": "Q27", "emp": "D4", "inc": "D5", "econ": "D6", "class": "D7", "pv": "Q28", "believer": "Q19", "urban": "URBAN"}, "2023-06"),
    ("dn2024b", "2024/unz/data_part2_w fix.SAV", "2023-12", "x1", {"lr": "q25", "emp": "D4", "inc": "D5", "econ": "D6", "class": "D7", "pv": "q26", "urban": "URBAN"}, "2023-06"),
    ("dn2024c", "2024/unz/data_part3_w.SAV", "2023-12", "x1", {"lr": "Q29", "emp": "D4", "inc": "D5", "econ": "D6", "class": "D7", "pv": "Q30", "urban": "URBAN"}, "2023-06"),
]
DN_LICENCE = "© Dianeosis — All rights reserved· μη εμπορική έρευνα με αναφορά πηγής· για προϊόν απαιτείται γραπτή άδεια"


def dn_edu(vl_label):
    t = norm(fix_text(vl_label))
    t = re.sub(r"[’'΄`]", " ", t)
    if DK.search(t):
        return None
    if re.search(r"μεταπτυχ|διδακτορ|γ\s*βαθμ|ανωτατ|αει|τει|πανεπιστ|πτυχιο", t):
        return "high"
    if re.search(r"β\s*βαθμ|λυκει|γυμνασ|τεχνικ|ιεκ|μεταλυκ|δευτεροβαθμ", t):
        return "medium"
    if re.search(r"α\s*βαθμ|δημοτικ|πρωτοβαθμ|αγραμματ|καθολου", t):
        return "low"
    return None


def map_labels(series, vl, fn):
    return series.map(lambda x: None if x != x else fn(vl.get(x, x)))


def harmonize_dianeosis(files_meta, bank):
    base = os.path.join(DATA, "raw", "dianeosis")
    for file_id, rel, wave, wvar, anc, election in DN_FILES:
        path = os.path.join(base, rel)
        df, meta = pyreadstat.read_sav(path)
        vls = meta.variable_value_labels or {}
        demo = dn.detect_demographics(df, meta)
        out = pd.DataFrame(index=df.index)
        out["rid"] = [rid(file_id, i) for i in range(len(df))]
        w = pd.to_numeric(df[wvar], errors="coerce") if wvar and wvar in df else pd.Series(1.0, index=df.index)
        w = w.fillna(w.mean() if w.notna().any() else 1.0)
        out["weight"] = (w / w.mean()).round(5)
        used = set()
        # δημογραφικά
        if "gender" in demo:
            v, m = demo["gender"]
            out["gender"] = df[v].map(m)
            used.add(v)
        if "age" in demo:
            v, m = demo["age"]
            out["age_band"] = df[v].map(age_band) if m is None else df[v].map(lambda x: {"15-24": "17-24"}.get(m.get(x), m.get(x)))
            used.add(v)
        ev = anc.get("edu")
        if ev:
            out["edu3"] = map_labels(df[ev], vls.get(ev, {}), dn_edu)
            used.add(ev)
        elif "education" in demo:
            v, m = demo["education"]
            out["edu3"] = df[v].map(lambda x: {"low_education": "low", "medium_education": "medium", "high_education": "high"}.get(m.get(x)))
            used.add(v)
        if "region" in demo:
            vars_, maps = demo["region"]
            reg = pd.Series(None, index=df.index, dtype=object)
            for v in vars_:
                reg = reg.fillna(df[v].map(maps[v]))
                used.add(v)
            out["region13"] = reg
            out["nuts1"] = reg.map(NUTS1)
        if not anc.get("urban"):
            for c in df.columns:
                labs_c = [norm(fix_text(str(x))) for x in (vls.get(c) or {}).values()]
                if labs_c and any("αγροτ" in x for x in labs_c) and any("αστικ" in x for x in labs_c) and len(labs_c) <= 4:
                    out["urban"] = map_labels(df[c], vls.get(c, {}), lambda l: "rural" if "αγροτ" in norm(fix_text(l)) else "urban")
                    used.add(c)
                    break
                if c == "PERIFA":
                    out["urban"] = map_labels(df[c], vls.get(c, {}), lambda l: "rural" if re.search(r"- ?αγ", norm(fix_text(l))) else "urban")
                    used.add(c)
                    break
        if "A1_Alt" in df.columns and file_id.startswith("dn2015"):
            out["nuts1"] = map_labels(df["A1_Alt"], vls.get("A1_Alt", {}), lambda l: {"αττικη": "attica", "θεσσαλονικη": "north", "βορεια ελλαδα": "north", "κεντρικη ελλαδα": "centre"}.get(norm(fix_text(l)), "islands" if "νησια" in norm(fix_text(l)) else None))
            used.add("A1_Alt")
        if "nuts1" not in out:
            for c in df.columns:
                if re.search(r"περιφερ", norm(fix_text((meta.column_names_to_labels or {}).get(c) or ""))) and vls.get(c):
                    def n1(l):
                        t = norm(fix_text(l))
                        if "αττικ" in t:
                            return "attica"
                        if re.search(r"μακεδον|θρακ|ηπειρ", t):
                            return "north"
                        if re.search(r"κρητ|αιγαι|νησι", t):
                            return "islands"
                        if re.search(r"θεσσαλ|στερε|πελοποννησ|δυτικη ελλαδα|ιονι", t):
                            return "centre"
                        return None
                    m1 = map_labels(df[c], vls.get(c, {}), n1)
                    if m1.notna().mean() > 0.8:
                        out["nuts1"] = m1
                        used.add(c)
                        break
        if anc.get("urban"):
            v = anc["urban"]
            out["urban"] = map_labels(df[v], vls.get(v, {}), lambda l: "rural" if re.search(r"κατω", norm(l)) else "urban")
            used.add(v)
        # άγκυρες
        def anchor(key, fn, col):
            v = anc.get(key)
            if v and v in df:
                out[col] = map_labels(df[v], vls.get(v, {}), fn)
                used.add(v)
        anchor("emp", emp_of, "emp")
        if anc.get("inc") and not re.search(r"ατομικ", norm(fix_text(meta.column_names_to_labels.get(anc["inc"]) or ""))):
            anchor("inc", inc6_of, "inc6")
        elif anc.get("inc"):
            used.add(anc["inc"])
        anchor("econ", econ4_of, "econ4")
        if file_id == "dn2015n":  # «το εισόδημα φθάνει για…» (αντίστροφη σειρά)
            v = anc["econ"]
            lab = {k: norm(fix_text(x)) for k, x in vls.get(v, {}).items()}
            m = {}
            for k, t in lab.items():
                m[k] = None if DK.search(t) else 4 if "αποταμιευ" in t or "περισσευ" in t else 1 if "δεν φθαν" in t else 2 if "μονο" in t else 3 if "αναγκαια" in t else None
            out["econ4"] = df[v].map(m)
        anchor("class", class3_of, "class3")
        anchor("believer", believer_of, "believer")
        anchor("polint", polint4_of, "polint4")
        if anc.get("lr"):
            v = anc["lr"]
            l = map_labels(df[v], vls.get(v, {}), lr7_of)
            out["lr7"] = l.map(lambda x: x if isinstance(x, int) else None)
            out["lr_none"] = l.map(lambda x: None if x is None else int(x == "none"))
            used.add(v)
        if anc.get("pv"):
            v = anc["pv"]
            out["pv"] = map_labels(df[v], vls.get(v, {}), party_key)
            out["pv_election"] = election
            used.add(v)
        # έλεγχος ποιότητας αντιστοίχισης
        for col in ("emp", "inc6", "econ4", "class3", "lr7", "pv", "believer", "polint4", "edu3", "age_band", "gender"):
            if col in out and out[col].notna().mean() < 0.5:
                print(f"  ! {file_id}: χαμηλή κάλυψη {col} = {out[col].notna().mean():.2f}")
        skip = used | {wvar} | {c for c in df.columns if is_skip_var(c, fix_text((meta.column_names_to_labels or {}).get(c) or ""))}
        items, data = build_items(df, meta, skip, file_id, wave)
        for k, s in data.items():
            out[k] = s.values
        write_file(file_id, out)
        bank.extend(items)
        files_meta.append({
            "fileId": file_id, "family": "dianeosis_tpe", "source": f"διαΝΕΟσις, Τι πιστεύουν οι Έλληνες — {os.path.basename(rel)}",
            "url": "https://www.dianeosis.org/research/ti-pistevoun-oi-ellines/", "wave": wave, "waveApprox": file_id not in ("dn2015a", "dn2015n"),
            "n": int(len(df)), "weightVar": wvar, "licence": DN_LICENCE, "tier": "research_only", "commercialUse": "not_allowed_without_permission",
            "mode": "CATI/CAWI (πηγή)", "population": "Ελλάδα 17+", "anchors": sorted(c for c in ANCHORS + DEMO if c in out and out[c].notna().any()),
            "pvElection": election, "nItems": len(items),
        })
        print(f"{file_id}: n={len(df)} items={len(items)} anchors={files_meta[-1]['anchors']}")


# ---------------------------------------------------------------- CSES (IMD, Ελλάδα)
CSES_PARTY = {3000001: "pasok", 3000008: "pasok", 3000100: "pasok", 3000002: "nd", 3000003: "syriza", 3000004: "kke",
              3000006: "xa", 3000007: "anel", 3000009: "el", 3000013: "potami", 3000014: "mera25", 3000021: "ek",
              3000023: "plefsi", 3000012: "dimar", 3000019: "laos", 3000024: "lae", 3000011: "other", 3000005: "other",
              3000016: "antarsya", 3000101: "antarsya", 3000025: "other"}
CSES_STUDY = {"GRC_2009": ("cses2009", "2009-10", "2009-10", "2007-09"), "GRC_2012": ("cses2012", "2012-06", "2012-06", "2012-05"),
              "GRC12015": ("cses2015a", "2015-02", "2015-01", "2012-06"), "GRC22015": ("cses2015b", "2015-10", "2015-09", "2015-01"),
              "GRC_2019": ("cses2019", "2019-07", "2019-07", "2015-09")}


def cses_party(v):
    try:
        v = int(float(v))
    except (TypeError, ValueError):
        return None
    if v in CSES_PARTY:
        return CSES_PARTY[v]
    if 3000000 <= v < 3001000 or v in (9999989, 9999990, 9999991):
        return "other"
    if v == 9999992:
        return "blank"
    if v in (9999993,):
        return "abstain"
    return None  # 9999997 αρνήθηκε / 9999998 ΔΞ / 9999999 εκτός βάσης (π.χ. δεν ψήφισε)


def harmonize_cses(files_meta, bank):
    path = os.path.join(DATA, "raw/political/archives/cses_imd/cses_imd_csv.zip")
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.endswith(".csv"))
        cols = ["IMD1004", "IMD1006_UNALPHA3", "IMD1010_2", "IMD2001_1", "IMD2002", "IMD2003", "IMD2005_1", "IMD2006", "IMD2007", "IMD2014",
                "IMD2017", "IMD3001", "IMD3002_LH_PL", "IMD3004_LH_PL", "IMD3005_1", "IMD3006", "IMD3010", "IMD3011", "IMD3012", "IMD3013_1", "IMD3014"]
        df = pd.read_csv(z.open(name), usecols=cols, low_memory=False)
    df = df[df.IMD1006_UNALPHA3 == "GRC"]
    for sid, (file_id, wave, election, prev) in CSES_STUDY.items():
        g = df[df.IMD1004 == sid].reset_index(drop=True)
        out = pd.DataFrame(index=g.index)
        out["rid"] = [rid(file_id, i) for i in range(len(g))]
        w = pd.to_numeric(g.IMD1010_2, errors="coerce").fillna(1.0)
        out["weight"] = (w / w.mean()).round(5)
        out["age_band"] = g.IMD2001_1.map(age_band)
        out["gender"] = g.IMD2002.map({1: "male", 2: "female"})
        out["edu3"] = g.IMD2003.map({0: "low", 1: "low", 2: "medium", 3: "medium", 4: "high"})
        out["urban"] = g.IMD2007.map({1: "rural", 2: "urban", 3: "urban", 4: "urban"})
        out["emp"] = g.apply(lambda r: {1: "employed", 2: "employed", 3: "employed", 4: "employed", 5: "unemployed", 6: "student", 7: "retired", 8: "homemaker", 9: "other", 10: "other"}.get(r.IMD2014), axis=1)
        # δημόσιος/ιδιωτικός για εργαζόμενους
        out["emp"] = [("public_emp" if p == 1 else "private_emp" if p in (2, 3, 4) else "private_emp") if e == "employed" else e for e, p in zip(out["emp"], g.IMD2017)]
        out["lr11"] = g.IMD3006.map(lambda v: v if 0 <= v <= 10 else None)
        out["lr7"] = g.IMD3006.map(lr7_of_11)
        out["lr_none"] = g.IMD3006.map(lambda v: 1 if v in (95, 97, 98) else 0 if 0 <= v <= 10 else None)
        turn = g.IMD3001
        vote = g.IMD3002_LH_PL.map(cses_party)
        out["pv"] = [("abstain" if t == 0 else v) for t, v in zip(turn, vote)]
        out["pv_election"] = election
        out["prev_vote"] = g.IMD3004_LH_PL.map(cses_party)
        out["prev_election"] = prev
        items = []
        spec = [
            ("IMD3010", "Πόσο ικανοποιημένος/η είστε με τον τρόπο που λειτουργεί η δημοκρατία στην Ελλάδα;", {1: "Πολύ", 2: "Αρκετά", 4: "Όχι ιδιαίτερα", 5: "Καθόλου"}, "democracy"),
            ("IMD3013_1", "Η οικονομία της χώρας τους τελευταίους 12 μήνες έγινε…", {1: "Καλύτερη", 3: "Ίδια", 5: "Χειρότερη"}, "econ_outlook"),
            ("IMD3014", "Πώς κρίνετε το έργο της κυβέρνησης γενικά;", {1: "Πολύ καλό", 2: "Καλό", 3: "Κακό", 4: "Πολύ κακό"}, "gov_eval"),
            ("IMD3005_1", "Αισθάνεστε κοντά σε κάποιο συγκεκριμένο κόμμα;", {1: "Ναι", 0: "Όχι"}, "politics_general"),
            ("IMD3011", "Έχει διαφορά ποιος είναι στην εξουσία; (1 καμία … 5 μεγάλη)", {1: "1", 2: "2", 3: "3", 4: "4", 5: "5"}, "anti_elite"),
            ("IMD3012", "Έχει διαφορά τι ψηφίζει κανείς; (1 καμία … 5 μεγάλη)", {1: "1", 2: "2", 3: "3", 4: "4", 5: "5"}, "anti_elite"),
            ("IMD2005_1", "Πόσο συχνά πηγαίνετε στην εκκλησία;", {1: "Ποτέ", 2: "Μία φορά τον χρόνο", 3: "2–11 φορές τον χρόνο", 4: "Μία φορά τον μήνα", 5: "2+ φορές τον μήνα", 6: "Κάθε εβδομάδα ή συχνότερα"}, "religion"),
            ("IMD2006", "Εισοδηματικό πεμπτημόριο νοικοκυριού (1 χαμηλότερο … 5 υψηλότερο)", {1: "1", 2: "2", 3: "3", 4: "4", 5: "5"}, "econ_outlook"),
        ]
        for var, text, labels, cons in spec:
            iid = f"{file_id}::{var}"
            code = g[var].map(lambda v: str(int(v)) if v in labels else ("dk" if v in (7, 8, 97, 98) else None))
            if code.notna().mean() < 0.3:
                continue
            out[iid] = code
            items.append({"id": iid, "file": file_id, "wave": wave, "var": var, "text": text, "type": "ordinal",
                          "options": [{"code": str(k), "label": v} for k, v in labels.items()], "dkCode": "dk", "construct": cons})
        write_file(file_id, out)
        bank.extend(items)
        files_meta.append({
            "fileId": file_id, "family": "cses", "source": f"CSES Integrated Module Dataset — {sid} (ELNES)", "url": "https://cses.org/",
            "wave": wave, "waveApprox": False, "n": int(len(g)), "weightVar": "IMD1010_2 (δημογραφικό· όχι το πολιτικό βάρος)",
            "licence": "CSES: free, public dataset· αναφορά DOI", "tier": "open", "commercialUse": "allowed_with_attribution",
            "mode": "μετεκλογική έρευνα (πηγή)", "population": "Ελλάδα 18+ με δικαίωμα ψήφου",
            "anchors": sorted(c for c in ANCHORS + DEMO + ["prev_vote"] if c in out and out[c].notna().any()), "pvElection": election,
            "prevElection": prev, "nItems": len(items),
        })
        print(f"{file_id}: n={len(g)} items={len(items)} anchors={files_meta[-1]['anchors']}")


# ---------------------------------------------------------------- UNDPOLAR (Ελλάδα)
UND_PARTY = {"ΝΔ": "nd", "ΣΥ": "syriza", "ΚΙΝ.ΑΛ": "pasok", "Ελληνική Λύση": "el", "ΜέΡΑ": "mera25", "ΚΚΕ": "kke"}


def und_party(label):
    if label is None:
        return None
    for k, v in UND_PARTY.items():
        if k in label:
            return v
    t = label.lower()
    if "would not vote" in t or "not vote" in t or "δεν θα ψηφ" in t or "not allowed" in t or "not eligible" in t:
        return "abstain"
    if "blank" in t or "λευκ" in t:
        return "blank"
    if "know" in t or "undecided" in t:
        return "dk"
    if "other" in t:
        return "other"
    return None


def harmonize_undpolar(files_meta, bank):
    path = os.path.join(DATA, "raw/political/repos/dataverse.nl_10.34894_IME1EY/files/UNDPOLAR_data_full_V12.sav")
    df, meta = pyreadstat.read_sav(path)
    vls = meta.variable_value_labels
    g = df[df.Country == 4].reset_index(drop=True)
    file_id = "undpolar2022"
    out = pd.DataFrame(index=g.index)
    out["rid"] = [rid(file_id, i) for i in range(len(g))]
    w = pd.to_numeric(g.Weight_GenderAgeEducation_Region, errors="coerce").fillna(1.0)
    out["weight"] = (w / w.mean()).round(5)
    out["age_band"] = g.age.map(lambda a: age_band(2021 - a if a > 1900 else a))
    out["gender"] = g.gender.map({1.0: "female", 2.0: "male"})
    out["edu3"] = g.isced3.map({1.0: "low", 2.0: "medium", 3.0: "high"})
    out["nuts1"] = g.Quota_Region_GR.map({1.0: "attica", 2.0: "centre", 3.0: "islands", 4.0: "north"})
    out["urban"] = g.urbanization.map({1.0: "rural", 2.0: "rural", 3.0: "urban", 4.0: "urban", 5.0: "urban"})
    out["emp"] = g.mainactivity.map({1.0: "employed", 2.0: "student", 3.0: "unemployed", 4.0: "other", 5.0: "retired", 6.0: "other", 7.0: "homemaker", 8.0: "other"})
    out["lr11"] = g.lrposition.map(lambda v: v if v == v and 0 <= v <= 10 else None)
    out["lr7"] = g.lrposition.map(lr7_of_11)
    out["polint4"] = g.polinterest.map({4.0: 1, 3.0: 2, 2.0: 3, 1.0: 4})
    vi = [und_party(vls["party_vote"].get(v)) if v == v else None for v in g.party_vote]
    out["vi"] = vi
    out["vi_wave"] = "2022-01"
    skip = {"id", "Comp", "Version", "Country", "age", "year_born", "gender", "gender_man", "gender_woman", "isced", "isced3", "isced7", "highest_diploma",
            "urbanization", "mainactivity", "lrposition", "polinterest", "party_vote", "region", "Weight_GenderAgeEducation_Region", "Weight_GenderAgeEducation",
            "party_pref", "edu_current", "parlgov_id_pref", "family_id_pref", "parlgov_id_vote", "family_id_vote"}
    skip |= {c for c in g.columns if c.startswith("Quota") or c.endswith(("_other", "_na", "_Codes", "_rec")) or c.startswith("Language")}
    items, data = build_items(g, meta, skip, file_id, "2022-01")
    # κλίμακες 0–10 / θερμόμετρα χωρίς πλήρεις ετικέτες: διακριτοποίηση σε 5 ζώνες ως items
    for c in g.columns:
        if c in skip or c in [it["var"] for it in items]:
            continue
        lab = (meta.column_names_to_labels or {}).get(c) or c
        s = pd.to_numeric(g[c], errors="coerce")
        vl = vls.get(c) or {}
        if len(vl) == 2 and set(vl) <= {0.0, 10.0, 100.0} and s.notna().mean() > 0.5:
            top = 100.0 if 100.0 in vl else 10.0
            bins = s.map(lambda v: None if v != v else str(min(5, int(v / top * 5) + 1)))
            iid = f"{file_id}::{c}"
            data[iid] = bins
            items.append({"id": iid, "file": file_id, "wave": "2022-01", "var": c, "text": f"{lab} (0–{int(top)}, σε 5 ζώνες)", "type": "ordinal",
                          "options": [{"code": str(k), "label": f"ζώνη {k}"} for k in range(1, 6)], "dkCode": None, "construct": construct_of(lab)})
    for k, s in data.items():
        out[k] = s.values
    write_file(file_id, out)
    bank.extend(items)
    files_meta.append({
        "fileId": file_id, "family": "undpolar", "source": "UNDPOLAR survey (DataverseNL doi:10.34894/IME1EY), Ελλάδα", "url": "https://doi.org/10.34894/IME1EY",
        "wave": "2022-01", "waveApprox": False, "n": int(len(g)), "weightVar": "Weight_GenderAgeEducation_Region", "licence": "CC BY 4.0",
        "tier": "open", "commercialUse": "allowed_with_attribution", "mode": "online πάνελ με ποσοστώσεις (όχι πιθανοτικό)", "population": "Ελλάδα 18+",
        "anchors": sorted(c for c in ANCHORS + DEMO if c in out and out[c].notna().any()), "pvElection": None, "nItems": len(items),
    })
    print(f"{file_id}: n={len(g)} items={len(items)} anchors={files_meta[-1]['anchors']}")



# ---------------------------------------------------------------- MAPLE II (Ελλάδα, προ/μετεκλογικά 2019· CC0)
MAPLE_REGION = {1: "north", 2: "north", 3: "north", 4: "north", 5: "centre", 6: "centre", 7: "centre", 8: "centre", 9: "attica", 10: "centre",
                11: "islands", 12: "islands", 13: "islands"}
MAPLE_REGION13 = {1: "GRCr105", 2: "GRCr106", 3: "GRCr107", 4: "GRCr108", 5: "GRCr109", 6: "GRCr110", 7: "GRCr111", 8: "GRCr112", 9: "GRCr101",
                  10: "GRCr113", 11: "GRCr102", 12: "GRCr103", 13: "GRCr104"}
MAPLE_PV2015 = {1: "syriza", 2: "nd", 3: "pasok", 5: "xa", 6: "kke", 7: "ek", 8: "anel", 9: "potami", 66: "other", 77: "blank", 88: "dk"}
MAPLE_VI2019 = {1: "syriza", 2: "nd", 3: "pasok", 4: "xa", 5: "kke", 6: "anel", 7: "ek", 8: "el", 9: "mera25", 66: "other", 76: "undecided",
                77: "blank", 78: "abstain", 88: "dk"}
MAPLE_PV2019 = {1: "syriza", 2: "nd", 3: "pasok", 4: "xa", 5: "kke", 6: "ek", 7: "el", 8: "mera25", 66: "other", 77: "blank", 88: "dk"}


def harmonize_maple(files_meta, bank):
    path = os.path.join(DATA, "raw/political/repos/harvard_10.7910_DVN_RCNK8E/files/wave3_4merged_new.dta")
    df, meta = pyreadstat.read_dta(path)
    vls = meta.variable_value_labels or {}
    g = df[df.country == "Greece"].reset_index(drop=True)
    for w, wave, pv_map, election in (("w3", "2019-06", MAPLE_PV2015, "2015-09"), ("w4", "2019-07", MAPLE_PV2019, "2019-07")):
        sub = g[g.wave.isin([1, 3] if w == "w3" else [2, 3])].reset_index(drop=True)
        file_id = f"maple2019{'pre' if w == 'w3' else 'post'}"
        out = pd.DataFrame(index=sub.index)
        out["rid"] = [rid(file_id, i) for i in range(len(sub))]
        wv = pd.to_numeric(sub.get(f"weight1_gr_{w}"), errors="coerce") if f"weight1_gr_{w}" in sub else pd.Series(1.0, index=sub.index)
        wv = wv.fillna(wv.mean() if wv.notna().any() else 1.0)
        out["weight"] = (wv / wv.mean()).round(5)
        out["age_band"] = sub[f"Q4_{w}"].map(age_band)
        out["gender"] = sub[f"Q3_{w}"].map({1: "female", 2: "male"})
        out["edu3"] = sub[f"Q5_{w}"].map(lambda v: None if v != v else "low" if v <= 2 else "medium" if v <= 5 else "high" if v <= 9 else None)
        out["nuts1"] = sub[f"Q6_{w}"].map(MAPLE_REGION)
        out["region13"] = sub[f"Q6_{w}"].map(MAPLE_REGION13)
        emp_lab = vls.get(f"Q63_{w}", {})
        out["emp"] = sub[f"Q63_{w}"].map(lambda v: None if v != v else (lambda t: "employed" if re.search(r"employed - |^employed", t) else "self_emp" if "self" in t else
                                                                         "unemployed" if "unemploy" in t else "student" if "student" in t or "education" in t else
                                                                         "retired" if "retire" in t else "homemaker" if "house" in t or "home" in t else "other")(str(emp_lab.get(v, "")).lower()))
        turned = sub[f"Q27_{w}"]
        pv = sub[f"Q28_{w}"].map(lambda v: pv_map.get(int(v)) if v == v else None)
        out["pv"] = [("abstain" if t in (2, 3, 4) else p) for t, p in zip(turned, pv)]
        out["pv_election"] = election
        if w == "w3":
            out["vi"] = sub["Q38_w3"].map(lambda v: MAPLE_VI2019.get(int(v)) if v == v else None)
            out["vi_wave"] = "2019-06"
            out["vi_lean"] = sub["Q38A_gr_w3"].map(lambda v: MAPLE_VI2019.get(int(v)) if v == v else None)
        skip = {c for c in sub.columns if not c.endswith(f"_{w}") or re.search(r"_(pt|ie|es|ger)_", c)}
        skip |= {f"Q{k}_{w}" for k in ("3", "4", "4A", "5", "5A", "6", "27", "28", "38", "38A_gr", "63", "66")} | {"country", "wave"}
        skip |= {c for c in sub.columns if c.startswith("weight") or re.match(r"Q(82|85)_\d+_", c)}
        items, data = build_items(sub, meta, skip, file_id, wave)
        for k, s_ in data.items():
            out[k] = s_.values
        write_file(file_id, out)
        bank.extend(items)
        files_meta.append({
            "fileId": file_id, "family": "maple", "source": f"MAPLE II, Ελλάδα, κύμα {w[-1]} (Harvard Dataverse doi:10.7910/DVN/RCNK8E)", "url": "https://doi.org/10.7910/DVN/RCNK8E",
            "wave": wave, "waveApprox": False, "n": int(len(sub)), "weightVar": f"weight1_gr_{w}", "licence": "CC0 1.0", "tier": "open",
            "commercialUse": "allowed", "mode": "online πάνελ (πεδίο 07–21/06/2019 και 09–18/07/2019)", "population": "Ελλάδα 18+",
            "anchors": sorted(c for c in ANCHORS + DEMO if c in out and out[c].notna().any()), "pvElection": election, "nItems": len(items),
        })
        print(f"{file_id}: n={len(sub)} items={len(items)} anchors={files_meta[-1]['anchors']}")


# MAPLE I (κύμα 1, 2–4/2019): πρόθεση ψήφου × ανάκληση 2015. Οι κωδικοί των μικρών κομμάτων στην πρόθεση δεν τεκμηριώνονται
# στο codebook («Party N»)· επιβεβαιώθηκαν μόνο τα μεγάλα με τη μέση αυτοτοποθέτηση των ψηφοφόρων τους (ΣΥΡΙΖΑ 3,3· ΝΔ 6,9·
# ΚΙΝΑΛ 4,5· ΧΑ 7,1· ΚΚΕ 1,9)· όλα τα άλλα → other (sprint 10/2026).
MAPLE1_VI = {1: "syriza", 2: "nd", 3: "pasok", 5: "xa", 6: "kke", 66: "other", 77: "blank", 78: "abstain", 88: "undecided"}


def harmonize_maple1(files_meta, bank):
    path = os.path.join(DATA, "raw/political/repos/harvard_10.7910_DVN_AGFZFO/files/wave1_2_merged.dta")
    df, meta = pyreadstat.read_dta(path)
    vls = meta.variable_value_labels or {}
    sub = df[df.Country == "Greece"].reset_index(drop=True)
    w, file_id, wave = "w1", "maple2019feb", "2019-03"
    out = pd.DataFrame(index=sub.index)
    out["rid"] = [rid(file_id, i) for i in range(len(sub))]
    wv = pd.to_numeric(sub["WEIGHT_RIM_w1"], errors="coerce")
    wv = wv.fillna(wv.mean())
    out["weight"] = (wv / wv.mean()).round(5)
    out["age_band"] = sub["Q4_w1"].map(age_band)
    out["gender"] = sub["Q3_w1"].map({1: "female", 2: "male"})
    out["edu3"] = sub["Q5_w1"].map(lambda v: None if v != v else "low" if v <= 2 else "medium" if v <= 5 else "high" if v <= 9 else None)
    out["nuts1"] = sub["Q6_w1"].map(MAPLE_REGION)
    out["region13"] = sub["Q6_w1"].map(MAPLE_REGION13)
    emp_lab = vls.get("Q63_w1", {})
    if "Q63_w1" in sub:
        out["emp"] = sub["Q63_w1"].map(lambda v: None if v != v else (lambda t: "employed" if re.search(r"employed - |^employed", t) else "self_emp" if "self" in t else
                                                                    "unemployed" if "unemploy" in t else "student" if "student" in t or "education" in t else
                                                                    "retired" if "retire" in t else "homemaker" if "house" in t or "home" in t else "other")(str(emp_lab.get(v, "")).lower()))
    pv = sub["Q28_w1"].map(lambda v: MAPLE_PV2015.get(int(v), "other") if v == v else None)
    out["pv"] = [("abstain" if t in (2, 3, 4) else p) for t, p in zip(sub["Q27_w1"], pv)]
    out["pv_election"] = "2015-09"
    out["vi"] = sub["Q38_w1"].map(lambda v: MAPLE1_VI.get(int(v), "other") if v == v else None)
    out["vi_wave"] = wave
    out["lr11"] = sub["Q39_w1"].map(lambda v: v if v == v and 0 <= v <= 10 else None)
    out["lr_none"] = sub["Q39_w1"].map(lambda v: None if v != v else 1 if v == 88 else 0 if 0 <= v <= 10 else None)
    skip = {c for c in sub.columns if not c.endswith("_w1")} | {"Country"}
    skip |= {f"Q{k}_w1" for k in ("3", "4", "4A", "5", "5A", "6", "27", "28", "38", "39", "42", "63", "66")}
    skip |= {c for c in sub.columns if c.startswith(("WEIGHT", "Rd_", "recall_", "vote_", "id_", "soph_", "maplenews", "TotalEU", "MeanEU", "EUsalience"))}
    items, data = build_items(sub, meta, skip, file_id, wave)
    for k, s_ in data.items():
        out[k] = s_.values
    write_file(file_id, out)
    bank.extend(items)
    files_meta.append({
        "fileId": file_id, "family": "maple", "source": "MAPLE I, Ελλάδα, κύμα 1 (Harvard Dataverse doi:10.7910/DVN/AGFZFO)", "url": "https://doi.org/10.7910/DVN/AGFZFO",
        "wave": wave, "waveApprox": False, "n": int(len(sub)), "weightVar": "WEIGHT_RIM_w1", "licence": "CC0 1.0", "tier": "open",
        "commercialUse": "allowed", "mode": "online πάνελ (πεδίο 15/02–26/04/2019)", "population": "Ελλάδα 18+",
        "anchors": sorted(c for c in ANCHORS + DEMO if c in out and out[c].notna().any()), "pvElection": "2015-09", "nItems": len(items),
    })
    print(f"{file_id}: n={len(sub)} items={len(items)} anchors={files_meta[-1]['anchors']}")


# DEMOTEC (H2020), ελληνικό δείγμα 9–11/2022, online πάνελ CINT, n=3.000 — ΣΥΝΟΛΟ VALIDATION του sprint (ποτέ στην εκπαίδευση).
# Το CSV δεν έχει ετικέτες· οι ετικέτες πιο κάτω είναι από το επίσημο codebook (DEMOTEC_citizenSurveyData_codebook.pdf).
DEMOTEC_TRUST = [(1, "Καθόλου εμπιστοσύνη"), (2, "Όχι πολλή εμπιστοσύνη"), (3, "Αρκετή εμπιστοσύνη"), (4, "Πολλή εμπιστοσύνη")]
DEMOTEC_MEDIA = [(1, "Ποτέ"), (2, "Λιγότερο από μία φορά τον μήνα"), (3, "Μηνιαία"), (4, "Εβδομαδιαία"), (5, "Καθημερινά")]
DEMOTEC_ITEMS = [
    ("trust_institutional_government", "Πόση εμπιστοσύνη έχετε στην Κυβέρνηση;", DEMOTEC_TRUST, "pol.trust"),
    ("trust_institutional_parliament", "Πόση εμπιστοσύνη έχετε στη Βουλή;", DEMOTEC_TRUST, "pol.trust"),
    ("trust_institutional_polParties", "Πόση εμπιστοσύνη έχετε στα πολιτικά κόμματα;", DEMOTEC_TRUST, "pol.trust"),
    ("trust_institutional_Courts", "Πόση εμπιστοσύνη έχετε στα δικαστήρια;", DEMOTEC_TRUST, "pol.trust"),
    ("trust_institutional_EU", "Πόση εμπιστοσύνη έχετε στην Ευρωπαϊκή Ένωση;", DEMOTEC_TRUST, "pol.trust"),
    ("trust_institutional_localGovernment", "Πόση εμπιστοσύνη έχετε στην τοπική αυτοδιοίκηση;", DEMOTEC_TRUST, "pol.trust"),
    ("trust_institutional_media", "Πόση εμπιστοσύνη έχετε στα μέσα ενημέρωσης;", DEMOTEC_TRUST, "pol.trust"),
    ("trust_institutional_church", "Πόση εμπιστοσύνη έχετε στην Εκκλησία;", DEMOTEC_TRUST, "pol.trust"),
    ("mediaUse_newspapers", "Πόσο συχνά ενημερώνεστε από ημερήσιες εφημερίδες;", DEMOTEC_MEDIA, "cons.media"),
    ("mediaUse_tvRadio", "Πόσο συχνά ενημερώνεστε από τηλεόραση/ραδιόφωνο;", DEMOTEC_MEDIA, "cons.media"),
    ("mediaUse_internet", "Πόσο συχνά ενημερώνεστε από το διαδίκτυο;", DEMOTEC_MEDIA, "cons.media"),
    ("mediaUse_socialMedia", "Πόσο συχνά ενημερώνεστε από τα κοινωνικά δίκτυα;", DEMOTEC_MEDIA, "cons.media"),
    ("pol_voteNational", "Στις εθνικές εκλογές ψηφίζετε πάντα, συνήθως ή ποτέ;", [(1, "Ποτέ"), (2, "Συνήθως"), (3, "Πάντα")], "pol.participation"),
    ("pol_efficacy", "Πόσο σίγουρος/η νιώθετε για την ικανότητά σας να συμμετέχετε στην πολιτική;",
     [(1, "Καθόλου"), (2, "Λίγο"), (3, "Αρκετά"), (4, "Πολύ"), (5, "Απόλυτα")], "pol.participation"),
    ("pol_leftRight", "Αυτοτοποθέτηση αριστερά (1) – δεξιά (10)", [(k, str(k)) for k in range(1, 11)], "pol.left_right"),
]


def harmonize_demotec(files_meta, bank):
    path = os.path.join(DATA, "raw/political/repos/zenodo_14591024/files/DEMOTEC_citizenSurveyData.csv")
    g = pd.read_csv(path, low_memory=False)
    g = g[g.country == "gr"].reset_index(drop=True)
    file_id, wave = "demotec2022", "2022-10"
    out = pd.DataFrame(index=g.index)
    out["rid"] = [rid(file_id, i) for i in range(len(g))]
    w = pd.to_numeric(g.psWeight, errors="coerce").fillna(1.0)
    out["weight"] = (w / w.mean()).round(5)
    out["age_band"] = g.demo_age.map(age_band)
    out["gender"] = g.demo_sex.map({0: "male", 1: "female"})
    out["edu3"] = g.demo_education.map({"gr_1": "low", "gr_2": "low", "gr_3": "medium", "gr_4": "medium", "gr_5": "high", "gr_6": "high"})
    out["nuts1"] = g.demo_region.map({"gr_1": "attica", "gr_2": "islands", "gr_3": "north", "gr_4": "centre"})
    out["urban"] = g.demo_urbanRural.map({1: "rural", 2: "urban", 3: "urban", 4: "urban"})
    # «Δυσκολεύομαι πολύ / δυσκολεύομαι / τα βγάζω πέρα / ζω άνετα» ↔ άγκυρα econ4 (ρητή παραδοχή ισοδυναμίας)
    out["econ4"] = g.demo_income.map({1: 1, 2: 2, 3: 3, 4: 4})
    out["polint4"] = g.pol_interestInPolitics.map({4: 1, 3: 2, 2: 3, 1: 4})
    items = []
    for var, text, opts, construct in DEMOTEC_ITEMS:
        iid = f"{file_id}::{var}"
        valid = {k for k, _ in opts}
        out[iid] = g[var].map(lambda v: str(int(v)) if v == v and int(v) in valid else ("dk" if v == v and int(v) in (-900, -998) else None))
        items.append({"id": iid, "file": file_id, "wave": wave, "var": var, "text": text, "type": "ordinal",
                      "options": [{"code": str(k), "label": l} for k, l in opts], "dkCode": "dk", "construct": construct})
    write_file(file_id, out)
    bank.extend(items)
    files_meta.append({
        "fileId": file_id, "family": "demotec", "source": "DEMOTEC citizen survey, Ελλάδα (Zenodo 14591024)", "url": "https://zenodo.org/records/14591024",
        "wave": wave, "waveApprox": True, "n": int(len(g)), "weightVar": "psWeight", "licence": "CC BY 4.0", "tier": "open",
        "commercialUse": "allowed_with_attribution", "mode": "online πάνελ CINT (πεδίο 9–11/2022)", "population": "Ελλάδα, ενήλικες χρήστες διαδικτύου",
        "anchors": sorted(c for c in ANCHORS + DEMO if c in out and out[c].notna().any()), "pvElection": None, "nItems": len(items),
        "role": "validation", "realRespondents": True,
    })
    print(f"{file_id}: n={len(g)} items={len(items)}")


# European Social Survey, Ελλάδα (sprint 10/2026). Ρόλοι κατά την προκαταχώριση: R10 (11/2021–4/2022) validation, R11 (2–5/2024) ΤΕΛΙΚΟ holdout.
ESS_FILES = [
    ("ess10", "raw/sprint/microdata/harvard_10.7910_DVN_7QODL6_ess10/ESS10.dta", "2022-01", "prtvtdgr", "2019-07", "validation",
     {1: "nd", 2: "syriza", 3: "pasok", 4: "kke", 5: "el", 6: "mera25", 7: "xa", 8: "plefsi", 9: "ek"}, "prtcldgr"),
    ("ess11", "raw/sprint/microdata/harvard_10.7910_DVN_CUT5RQ/ESS11.dta", "2024-03", "prtvtegr", "2023-06", "final_holdout",
     {1: "nd", 2: "syriza", 3: "pasok", 4: "kke", 5: "el", 6: "spartiates", 7: "niki", 8: "plefsi", 10: "nea_aristera", 11: "mera25", 15: "ek"}, "prtclegr"),
]
ESS_NUTS = {"EL30": "attica", "EL41": "islands", "EL42": "islands", "EL43": "islands", "EL51": "north", "EL52": "north", "EL53": "north", "EL54": "north",
            "EL61": "centre", "EL62": "centre", "EL63": "centre", "EL64": "centre", "EL65": "centre"}


def harmonize_ess(files_meta, bank):
    for file_id, rel, wave, vote_var, election, role, parties, close_var in ESS_FILES:
        path = os.path.join(DATA, rel)
        if not os.path.exists(path):
            continue
        df, meta = pyreadstat.read_dta(path)
        g = df[df.cntry == "GR"].reset_index(drop=True)
        out = pd.DataFrame(index=g.index)
        out["rid"] = [rid(file_id, i) for i in range(len(g))]
        w = pd.to_numeric(g.get("anweight", g.get("pspwght")), errors="coerce").fillna(1.0)
        out["weight"] = (w / w.mean()).round(5)
        out["age_band"] = pd.to_numeric(g.agea, errors="coerce").map(age_band)
        out["gender"] = g.gndr.map({1: "male", 2: "female"})
        out["edu3"] = pd.to_numeric(g.eisced, errors="coerce").map(lambda v: None if v != v or v < 1 or v > 7 else "low" if v <= 2 else "medium" if v <= 5 else "high")
        out["nuts1"] = g.region.astype(str).str[:4].map(ESS_NUTS)
        out["urban"] = pd.to_numeric(g.domicil, errors="coerce").map({1: "urban", 2: "urban", 3: "urban", 4: "rural", 5: "rural"})
        out["emp"] = pd.to_numeric(g.mnactic, errors="coerce").map({1: "employed", 2: "student", 3: "unemployed", 4: "unemployed", 6: "retired", 8: "homemaker", 5: "other", 7: "other", 9: "other"})
        out["econ4"] = pd.to_numeric(g.hincfel, errors="coerce").map({1: 4, 2: 3, 3: 2, 4: 1})
        out["polint4"] = pd.to_numeric(g.polintr, errors="coerce").map({1: 1, 2: 2, 3: 3, 4: 4})
        lr = pd.to_numeric(g.lrscale, errors="coerce")
        out["lr11"] = lr.where(lr.between(0, 10))
        out["lr_none"] = g.lrscale.map(lambda v: None if v is None or v != v else 0 if isinstance(v, (int, float)) and 0 <= v <= 10 else 1 if v in ("b",) else None)
        voted = pd.to_numeric(g.vote, errors="coerce")
        pv = pd.to_numeric(g[vote_var], errors="coerce").map(lambda v: None if v != v else parties.get(int(v), "other"))
        out["pv"] = [("abstain" if vt == 2 else p if vt == 1 else None) for vt, p in zip(voted, pv)]
        out["pv_election"] = election
        # κόμμα που νιώθει πιο κοντά (μέτρηση μετά τις εκλογές· για τον έλεγχο του μοντέλου μετακινήσεων)
        cl = pd.to_numeric(g.get(close_var), errors="coerce") if close_var in g else pd.Series(np.nan, index=g.index)
        out["pclose"] = cl.map(lambda v: None if v != v else parties.get(int(v), "other"))
        out.loc[g.get("clsprty") == 2, "pclose"] = "none"
        skip = {c for c in g.columns if re.match(r"^(name|essround|edition|proddate|idno|cntry|dweight|pspwght|pweight|anweight|prob|stratum|psu|region|inw|ainw|binw|cinw|dinw|einw|finw|ginw|hinw|iinw|kinw|supq|vdcond|vdovexre|vdtype|vdtpsvre|vdtpitre|vdtpscre|vdtpaure|vdtpvire|vdtpoire|vdtpntre|vdtpapre|vdtprere|vdtpdkre|vdtpnare|inwtm|mode|domain|prtv|prtc|prtm|rshpsgr|edlvd|edupl|edagegr|eduagegr|icpart|lnghom|cntbrth|ctzship|cntryp|fbrncnt|mbrncnt|pdjobyr|isco|nace|tporgwk|emprm|edlvp|edlvf|edlvm|emplrel|emplno|wkhct|wkhtot|hinctnta|agea|gndr|yrbrn|eisced|domicil|mnactic|hincfel|polintr|lrscale|vote|clsprty)", c)}
        items, data = build_items(g, meta, skip, file_id, wave)
        for k, s_ in data.items():
            out[k] = s_.values
        write_file(file_id, out)
        bank.extend(items)
        files_meta.append({
            "fileId": file_id, "family": "ess", "source": f"European Social Survey {file_id.upper()}, Ελλάδα (αντίγραφο Harvard Dataverse, CC0· ESS: CC BY 4.0)",
            "url": "https://www.europeansocialsurvey.org/", "wave": wave, "waveApprox": True, "n": int(len(g)), "weightVar": "anweight", "licence": "CC BY 4.0 (ESS ERIC)",
            "tier": "open", "commercialUse": "allowed_with_attribution", "mode": "προσωπική συνέντευξη (CAPI)", "population": "Ελλάδα 15+",
            "anchors": sorted(c for c in ANCHORS + DEMO if c in out and out[c].notna().any()), "pvElection": election, "nItems": len(items),
            "role": role, "realRespondents": True,
        })
        print(f"{file_id}: n={len(g)} items={len(items)} role={role}")


# ---------------------------------------------------------------- Έρευνα Οικογενειακών Προϋπολογισμών (ΕΛΣΤΑΤ), μικροδεδομένα ενέργειας (Zenodo 7487147, CC BY 4.0)
HBS_NUTS = {"Attica": "attica", "Central_Macedonia": "north", "East_Maced_Thrace": "north", "Western_Macedonia": "north", "Epirus": "north",
            "Thessaly": "centre", "Western_GR": "centre", "Central_GR": "centre", "Peloponnese": "centre", "Ionian_Islands": "centre",
            "Crete": "islands", "North_Aegean": "islands", "South_Aegean": "islands"}
HBS_ITEMS = [
    ("Car", "Το νοικοκυριό διαθέτει αυτοκίνητο"), ("PC", "Το νοικοκυριό διαθέτει υπολογιστή"), ("Mobile", "Το νοικοκυριό διαθέτει κινητό τηλέφωνο"),
    ("DishWash", "Το νοικοκυριό διαθέτει πλυντήριο πιάτων"), ("Freezer", "Το νοικοκυριό διαθέτει καταψύκτη"), ("DVD", "Το νοικοκυριό διαθέτει συσκευή DVD"),
    ("Camera", "Το νοικοκυριό διαθέτει φωτογραφική/βιντεοκάμερα"), ("Game", "Το νοικοκυριό διαθέτει κονσόλα παιχνιδιών"),
    ("Solar_water", "Το νοικοκυριό διαθέτει ηλιακό θερμοσίφωνα"), ("Aircon", "Το νοικοκυριό διαθέτει κλιματιστικό"), ("Double_glaze", "Η κατοικία έχει διπλά τζάμια"),
    ("Public_transport", "Μέλη του νοικοκυριού χρησιμοποιούν δημόσια συγκοινωνία"),
    ("fuel_Oil", "Το νοικοκυριό αγόρασε πετρέλαιο θέρμανσης"), ("fuel_Nat_gas", "Το νοικοκυριό χρησιμοποιεί φυσικό αέριο"),
    ("fuel_Liq_gas", "Το νοικοκυριό αγόρασε υγραέριο"), ("fuel_Wood", "Το νοικοκυριό αγόρασε καυσόξυλα"), ("Heat_electr", "Το νοικοκυριό θερμαίνεται με ηλεκτρισμό"),
]


def harmonize_hbs(files_meta, bank):
    import numpy as np

    path = os.path.join(DATA, "lake/raw/zenodo/7487147/HBS_final.csv")
    d = pd.read_csv(path, low_memory=False)
    fuels = d.pivot_table(index=["Year", "Hh_ID"], columns="GS010", values="Expenditure", aggfunc="sum").fillna(0) > 0
    h = d.drop_duplicates(["Year", "Hh_ID"]).set_index(["Year", "Hh_ID"])
    for f in ("Oil", "Nat_gas", "Liq_gas", "Wood"):
        h[f"fuel_{f}"] = fuels[f].reindex(h.index).fillna(False) if f in fuels else False
    h = h.reset_index()
    for year, g in h.groupby("Year"):
        g = g.reset_index(drop=True)
        file_id = f"hbs{year}"
        out = pd.DataFrame(index=g.index)
        out["rid"] = [rid(file_id, i) for i in range(len(g))]
        w = pd.to_numeric(g.Sample_weight, errors="coerce").fillna(1.0)
        out["weight"] = (w / w.mean()).round(5)
        out["age_band"] = g.Age_head.map(age_band)
        out["gender"] = g.Gender_head.map({"Male": "male", "Female": "female"})
        hi = (g["AEI-TEI"] + g["MSc"] + g["PhD"]) > 0
        mid = (g["Lyceum"] + g["IEK"] + g["Gymnasium"]) > 0
        out["edu3"] = np.where(hi, "high", np.where(mid, "medium", "low"))
        out["nuts1"] = g.NUTS2.map(HBS_NUTS)
        out["urban"] = g.Urb_degree.map({1.0: "urban", 2.0: "urban", 3.0: "rural"})
        out["emp"] = g.Activity_head.map({"Employed": "employed", "Retired": "retired", "Unemployed": "unemployed", "Non_active": "other"})
        # εισοδηματικό πεμπτημόριο μέσα στο έτος (σταθμισμένο) — συγκρίσιμο διαχρονικά, σε αντίθεση με το ονομαστικό εισόδημα
        order = np.argsort(g.HH_inc.values)
        cw = np.cumsum(w.values[order]) / w.sum()
        q = np.empty(len(g), dtype=int)
        q[order] = np.minimum((cw * 5).astype(int) + 1, 5)
        out["incq5"] = q
        out["hhsize5"] = g.Hh_size.clip(upper=5)
        items = []
        for var, text in HBS_ITEMS:
            if var not in g:
                continue
            v = g[var]
            if v.isna().mean() > 0.7:
                continue
            iid = f"{file_id}::{var}"
            out[iid] = v.map(lambda x: None if x != x else ("1" if bool(x) else "0"))
            items.append({"id": iid, "file": file_id, "wave": f"{year}-12", "var": var, "text": text, "type": "binary",
                          "options": [{"code": "0", "label": "Όχι"}, {"code": "1", "label": "Ναι"}], "dkCode": None, "construct": "household_consumption"})
        write_file(file_id, out)
        bank.extend(items)
        files_meta.append({
            "fileId": file_id, "family": "hbs", "source": f"ΕΛΣΤΑΤ, Έρευνα Οικογενειακών Προϋπολογισμών {year} — μικροδεδομένα ενέργειας (Zenodo 7487147)",
            "url": "https://doi.org/10.5281/zenodo.7487147", "wave": f"{year}-12", "waveApprox": True, "n": int(len(g)), "weightVar": "Sample_weight",
            "licence": "CC BY 4.0", "tier": "open", "commercialUse": "allowed_with_attribution", "mode": "συνέντευξη νοικοκυριού (ΕΛΣΤΑΤ)",
            "population": "Ιδιωτικά νοικοκυριά Ελλάδας (μονάδα: νοικοκυριό· δημογραφικά = υπεύθυνος νοικοκυριού, μόρφωση = υψηλότερη του νοικοκυριού)",
            "anchors": sorted(c for c in ANCHORS + DEMO + ["incq5", "hhsize5"] if c in out and out[c].notna().any()), "pvElection": None, "nItems": len(items),
            "realRespondents": True,
        })
    print(f"hbs: {h.Year.nunique()} έτη, {len(h)} νοικοκυριά")

# ---------------------------------------------------------------- διαχρονική σύνδεση items (οικογένειες)
def tokens(text):
    t = norm(fix_text(text))
    t = re.sub(r"^[\[\(]?[a-zα-ω]{0,3}\d+[\w.]*[\]\)]?[.)]?\s*", "", t)
    return {w for w in re.findall(r"[a-zα-ω]{3,}", t) if w not in {"και", "που", "την", "τον", "της", "του", "τις", "των", "για", "απο", "στην", "στο", "στη", "ποσο", "θεωρειτε", "πιστευετε", "σασ", "θα", "ηθελα", "παρακατω", "μου", "πειτε"}}


def link_families(bank):
    """Ίδια ερώτηση σε διαφορετικά κύματα. Απαιτεί: ίδιο τύπο και ίδιες ουσιαστικές επιλογές, Jaccard όλου του κειμένου ≥ 0,5,
    και Jaccard του ΔΙΑΚΡΙΤΙΚΟΥ τμήματος ≥ 0,5. Διακριτικό = λέξεις που δεν ανήκουν στον κοινό «κορμό» μιας μπαταρίας
    (λέξεις που εμφανίζονται σε ≥ 3 items του ίδιου αρχείου). Η σύνδεση μεταξύ δύο αρχείων είναι ένα-προς-ένα (άπληστη, κατά σκορ)."""
    def okey(it):
        return tuple(sorted(re.sub(r"[^a-zα-ω0-9]", "", norm(fix_text(o["label"]))) for o in it["options"]))
    # κορμός μπαταριών ανά αρχείο
    stem = {}
    by_file = defaultdict(list)
    for it in bank:
        by_file[it["file"]].append(it)
    for f, its in by_file.items():
        c = Counter(w for it in its for w in tokens(it["text"]))
        stem[f] = {w for w, k in c.items() if k >= 3}
    tok = {it["id"]: tokens(it["text"]) for it in bank}
    spec = {it["id"]: tok[it["id"]] - stem[it["file"]] for it in bank}
    groups = defaultdict(list)
    for it in bank:
        groups[(it["type"], okey(it))].append(it)
    parent = {it["id"]: it["id"] for it in bank}

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for _, its in groups.items():
        edges = []
        for i in range(len(its)):
            for j in range(i + 1, len(its)):
                a, b = its[i], its[j]
                if a["file"] == b["file"] or not tok[a["id"]] or not tok[b["id"]]:
                    continue
                ja = len(tok[a["id"]] & tok[b["id"]]) / len(tok[a["id"]] | tok[b["id"]])
                sa, sb = spec[a["id"]], spec[b["id"]]
                if sa and sb:
                    js = len(sa & sb) / len(sa | sb)
                    ok = ja >= 0.5 and js >= 0.5
                else:
                    js = ja
                    ok = ja >= 0.75 and not (sa or sb)
                if ok:
                    edges.append((0.5 * ja + 0.5 * js, a, b))
        used = set()
        for score, a, b in sorted(edges, key=lambda e: -e[0]):
            if (a["id"], b["file"]) in used or (b["id"], a["file"]) in used:
                continue
            used.add((a["id"], b["file"]))
            used.add((b["id"], a["file"]))
            parent[find(a["id"])] = find(b["id"])
    roots = defaultdict(list)
    for it in bank:
        roots[find(it["id"])].append(it)
    fam = 0
    for members in roots.values():
        # μία οικογένεια δεν περιέχει δύο items του ίδιου αρχείου
        files = Counter(m["file"] for m in members)
        if max(files.values()) > 1:
            for m in members:
                fam += 1
                m["family"] = f"fam{fam:05d}"
                m["familyWaves"] = [m["wave"]]
            continue
        fam += 1
        fid = f"fam{fam:05d}"
        waves = sorted({m["wave"] for m in members})
        for m in members:
            m["family"] = fid
            m["familyWaves"] = waves


def equate_lr(files_meta):
    """Κλίμακα 0–10 (CSES, UNDPOLAR) → 7 κατηγορίες της διαΝΕΟσις με ισο-εκατοστημοριακή αντιστοίχιση (equipercentile)
    προς το χρονικά πλησιέστερο κύμα της διαΝΕΟσις. Η απλή αντιστοίχιση (lr7_of_11) κρατιέται ως lr7_naive."""
    import numpy as np

    dn = {}
    for f in files_meta:
        if f["family"] == "dianeosis_tpe" and "lr7" in f["anchors"]:
            d = pd.read_csv(os.path.join(OUT, "resp", f"{f['fileId']}.csv.gz"), usecols=["lr7", "weight"])
            d = d[d.lr7.notna()]
            dn.setdefault(f["wave"], []).append(d)
    ref = {w: pd.concat(v) for w, v in dn.items()}

    def ym(w):
        y, m = w.split("-")
        return int(y) * 12 + int(m)
    for f in files_meta:
        path = os.path.join(OUT, "resp", f"{f['fileId']}.csv.gz")
        cols = pd.read_csv(path, nrows=0).columns
        if f["family"] == "dianeosis_tpe" or "lr11" not in cols:
            continue
        d = pd.read_csv(path, dtype={c: str for c in cols if "::" in c}, low_memory=False)
        w0 = min(ref, key=lambda w: abs(ym(w) - ym(f["wave"])))
        r = ref[w0]
        rc = np.cumsum([r.weight[r.lr7 == k].sum() for k in range(1, 8)]) / r.weight.sum()
        src = d[d.lr11.notna()]
        sc = np.cumsum([src.weight[src.lr11 == v].sum() for v in range(11)]) / src.weight.sum()
        lo = np.concatenate([[0], sc[:-1]])
        mapping = {v: int(np.searchsorted(rc, (lo[v] + sc[v]) / 2) + 1) for v in range(11)}
        d["lr7_naive"] = d["lr7"] if "lr7" in d else None
        d["lr7"] = d.lr11.map(lambda v: mapping.get(int(v)) if v == v else None)
        d.to_csv(path, index=False, compression="gzip")
        f["lrEquating"] = {"referenceWave": w0, "map0to10": mapping}
        f["anchors"] = sorted(set(f["anchors"]) | {"lr7"} | ({"lr_none"} if "lr_none" in d else set()))
        print(f"  lr equating {f['fileId']} → {w0}: {mapping}")


def main():
    os.makedirs(OUT, exist_ok=True)
    files_meta, bank = [], []
    harmonize_dianeosis(files_meta, bank)
    harmonize_cses(files_meta, bank)
    harmonize_undpolar(files_meta, bank)
    harmonize_maple(files_meta, bank)
    harmonize_maple1(files_meta, bank)
    harmonize_demotec(files_meta, bank)
    harmonize_ess(files_meta, bank)
    harmonize_hbs(files_meta, bank)
    equate_lr(files_meta)
    link_families(bank)
    multi = Counter(it["family"] for it in bank)
    print(f"items: {len(bank)} · οικογένειες με ≥2 κύματα: {sum(1 for f, c in multi.items() if c > 1)}")
    json.dump(files_meta, open(os.path.join(OUT, "files.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(bank, open(os.path.join(OUT, "item_bank.json"), "w"), ensure_ascii=False, indent=0)


if __name__ == "__main__":
    main()
