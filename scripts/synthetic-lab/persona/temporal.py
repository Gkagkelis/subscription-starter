"""
C3 του sprint 10/2026: χρονική ενημέρωση ΕΠΙΠΕΔΟΥ items από συγκεντρωτικές χρονοσειρές της ίδιας μεταβλητής.

Ιδέα: οι ατομικές σχέσεις (δημογραφικά, άγκυρες, λανθάνοντα χαρακτηριστικά) μένουν όπως εκτιμήθηκαν στα μικροδεδομένα·
μετατοπίζεται μόνο ο σταθερός όρος, κατά τη μεταβολή που κατέγραψε ανεξάρτητη επαναλαμβανόμενη μέτρηση (Eurobarometer)
από την ημερομηνία του item έως την ημερομηνία αναφοράς:
    δ = logit(p(t1)) − logit(p(t0))      (p = μερίδιο «τείνω να εμπιστεύομαι» επί των απαντώντων, Ελλάδα)
    Δ (probit) = δ / 1,7  προς την κατεύθυνση των «θετικών» επιλογών του item.
Δεν χρησιμοποιείται κανένα επίπεδο από τη χρονοσειρά· μόνο η μεταβολή (difference-in-differences).
"""
import math
import os
import re
import sqlite3

# Μήνας πεδίου ανά Standard Eurobarometer (επίσημες περίοδοι πεδίου, προσέγγιση μήνα)
EB_MONTH = {85: "2016-05", 86: "2016-11", 87: "2017-05", 88: "2017-11", 89: "2018-03", 90: "2018-11", 91: "2019-06", 92: "2019-11",
            93: "2020-08", 94: "2021-03", 95: "2021-07", 96: "2022-02", 97: "2022-07", 98: "2023-02", 99: "2023-05", 100: "2023-11",
            101: "2024-05", 102: "2024-11", 103: "2025-04", 104: "2025-11", 105: "2026-04"}
INSTITUTIONS = [
    ("government", r"\(NATIONALITY\) Government"), ("parliament", r"PARLIAMENT|Parliament"), ("parties", r"^Political parties"),
    ("justice", r"^Justice"), ("local", r"Regional or local"), ("eu", r"^The European Union"), ("media", r"^The media"),
    ("tv", r"^Television"), ("press", r"press"), ("radio", r"^Radio"), ("internet", r"^The [Ii]nternet"), ("social_networks", r"social networks"),
    ("police", r"^The police"), ("army", r"^The army"), ("public_admin", r"^Public administration"), ("religious", r"^Religious"),
]


def eb_trust_series(root):
    """{θεσμός: [(μήνας, p_trust_valid)]} για την Ελλάδα από το Research Data Lake (Standard Eurobarometer, στήλη EL)."""
    db = sqlite3.connect(os.path.join(root, ".synthetic-lab-data", "lake", "lake.sqlite"))
    q = """select v.var_id, s.title, coalesce(v.question_text, v.label) from variables v join studies s on s.study_id = v.study_id
           where s.source_id = 'eurobarometer' and s.title like 'Standard Eurobarometer%' and lower(coalesce(v.question_text, v.label)) like '%how much trust%'"""
    out = {}
    for vid, title, text in db.execute(q):
        m = re.search(r"(?:Standard Eurobarometer|STD)\s*(\d{2,3})", title)
        num = int(m.group(1)) if m else None
        if num not in EB_MONTH:
            continue
        mi = re.search(r"—\s*(?:\(NOT IN [^)]*\)\s*)?(.*)$", text or "")
        label = mi.group(1).strip() if mi else ""
        key = next((k for k, rx in INSTITUTIONS if re.search(rx, label)), None)
        if not key:
            continue
        rows = dict(db.execute("select option_label, value from distributions where var_id = ? and group_dim = 'all'", (vid,)).fetchall())
        t, n = rows.get("Tend to trust"), rows.get("Tend not to trust")
        if t is None or n is None or t + n <= 0:
            continue
        out.setdefault(key, {})[EB_MONTH[num]] = t / (t + n)
    return {k: sorted(v.items()) for k, v in out.items()}


def level_at(series, month, max_gap_months=8):
    """Μέτρηση πλησιέστερη ΠΡΙΝ ή ΙΣΗ με τον μήνα (για το t1) ή πλησιέστερη γενικά (για το t0)· None αν απέχει πολύ."""
    def ym(s):
        y, m = s.split("-")
        return int(y) * 12 + int(m)
    cands = [(abs(ym(m) - ym(month)), m, p) for m, p in series]
    if not cands:
        return None
    d, m, p = min(cands)
    return (m, p) if d <= max_gap_months else None


def latest_before(series, month):
    def ym(s):
        y, m = s.split("-")
        return int(y) * 12 + int(m)
    c = [(m, p) for m, p in series if ym(m) <= ym(month)]
    return max(c) if c else None


def shift_for(series, item_wave, ref_month):
    """Μετατόπιση (probit) για item μετρημένο στο item_wave, ώστε να αντιστοιχεί στον ref_month. None αν λείπουν μετρήσεις."""
    a = level_at(series, item_wave)
    b = latest_before(series, ref_month)
    if not a or not b or b[0] <= a[0]:
        return None
    lg = lambda p: math.log(p / (1 - p))  # noqa: E731
    delta = lg(b[1]) - lg(a[1])
    return {"t0": a[0], "p0": round(a[1], 4), "t1": b[0], "p1": round(b[1], 4), "deltaLogit": round(delta, 4), "deltaProbit": round(delta / 1.7, 4)}


def apply_shift(item, delta_probit, positive_low_codes):
    """Επιστρέφει αντίγραφο του item με μετατοπισμένα κατώφλια (ordinal). positive_low_codes: οι πρώτοι κωδικοί είναι οι «θετικοί»."""
    import copy

    it = copy.deepcopy(item)
    if it["model"]["kind"] != "ordinal":
        return it
    # y* = η + ε· κατηγορία = #κατώφλια κάτω από y*. Περισσότερη εμπιστοσύνη: προς χαμηλούς κωδικούς αν positive_low_codes.
    d = -delta_probit if positive_low_codes else delta_probit
    it["model"]["tau"] = [t - d for t in it["model"]["tau"]]
    return it


# ---------------------------------------------------------------- C3b: κυβερνητικές ερωτήσεις σχετικές με το κυβερνών κόμμα
GOV_RX = re.compile(r"κυβερν|πρωθυπουργ|government|prime minister", re.I)
PV_FEAT = {"nd": "pv_nd", "syriza": "pv_syriza", "pasok": "pv_pasok", "kke": "pv_kke"}


def incumbent_at(month, periods):
    for p in periods:
        if p["from"] <= month < p["to"]:
            return p
    return None


def incumbent_recode(item, ref_month, periods):
    """Ερώτηση αξιολόγησης κυβέρνησης/πρωθυπουργού μετρημένη υπό κυβέρνηση X, που απαντάται για μήνα με κυβέρνηση Y≠X:
    η επίδραση «ψηφοφόρος του X» μεταφέρεται στους ψηφοφόρους του Y (και αντίστροφα), και αν X, Y είναι σε αντίθετες πλευρές,
    αντιστρέφεται το πρόσημο της αυτοτοποθέτησης. Επιστρέφει (νέο item, περιγραφή) ή (item, None) αν δεν εφαρμόζεται."""
    import copy

    if not GOV_RX.search(item.get("text", "")):
        return item, None
    a, b = incumbent_at(item["wave"], periods), incumbent_at(ref_month, periods)
    if not a or not b or not a["party"] or not b["party"] or a["party"] == b["party"]:
        return item, None
    fa, fb = PV_FEAT.get(a["party"]), PV_FEAT.get(b["party"])
    it = copy.deepcopy(item)
    feats = it["feats"]
    coefs = it["model"]["b"] if it["model"]["kind"] == "ordinal" else None
    if coefs is None or fa not in feats or fb not in feats:
        return item, None
    ia, ib = feats.index(fa), feats.index(fb)
    coefs[ia], coefs[ib] = coefs[ib], coefs[ia]
    flipped = False
    if a["side"] and b["side"] and a["side"] != b["side"] and "lr" in feats:
        coefs[feats.index("lr")] = -coefs[feats.index("lr")]
        flipped = True
    return it, f"κυβερνών κόμμα {a['party']}→{b['party']}: ανταλλαγή {fa}↔{fb}" + (", αντιστροφή lr" if flipped else "")
