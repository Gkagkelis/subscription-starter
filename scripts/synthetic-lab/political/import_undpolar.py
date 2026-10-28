"""
UNDPOLAR (DataverseNL doi:10.34894/IME1EY, CC BY 4.0), ελληνικό υποδείγμα -> ερευνητικό σύνολο του Lab.

Έρευνα σε online πάνελ με ποσοστώσεις φύλου × ηλικίας × μόρφωσης και περιοχής (όχι πιθανοτικό δείγμα).
Ελλάδα: n = 1.213, πεδίο 10/12/2021 – 12/1/2022 (κύμα 2022-Q1).

Έξοδος: <dataRoot>/research/undpolar-greece.json
  - undpolar:vote:<party_key>   πρόθεση ψήφου («αν είχαμε εκλογές αυτή την εβδομάδα»), % επί όσων δήλωσαν κόμμα
Ομάδες (συμβατές με NORAYA/Eurobarometer): all · gender · age_group (18-24/25-39/40-54/55+) · education_group.
Η μόρφωση της πηγής έχει μόνο «υψηλή» και «χαμηλή/μέση»: το κελί «χαμηλή/μέση» γράφεται και στο low_education
και στο medium_education (δεν διακρίνονται).
Βάρος: Weight_GenderAgeEducation_Region της πηγής. n = ερωτώμενοι, nEff = Kish.

Χρήση:  python3 scripts/synthetic-lab/political/import_undpolar.py <UNDPOLAR_data_full_V12.sav> <out.json>
"""
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone

import pyreadstat

PARTY = {
    "ΝΔ": "nd", "ΣΥ": "syriza", "ΚΙΝ.ΑΛ": "pasok_kinal", "Ελληνική Λύση": "elliniki_lysi", "ΜέΡΑ": "mera25", "ΚΚΕ": "kke", "Other party": "other",
}
LABEL = {"nd": "ΝΔ", "syriza": "ΣΥΡΙΖΑ", "pasok_kinal": "ΚΙΝΑΛ", "elliniki_lysi": "Ελληνική Λύση", "mera25": "ΜέΡΑ25", "kke": "ΚΚΕ", "other": "Άλλο κόμμα"}


def party_key(label):
    for k, v in PARTY.items():
        if k in label:
            return v
    return None  # αποχή/λευκό, χωρίς δικαίωμα, χωρίς απάντηση


def main(src, out_path):
    df, meta = pyreadstat.read_sav(src)
    vl = meta.variable_value_labels
    g = df[df["Country"] == 4]
    acc = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: [0.0, 0.0, 0.0, 0])))
    used = 0
    for _, r in g.iterrows():
        lab = vl["party_vote"].get(r["party_vote"], "") if r["party_vote"] == r["party_vote"] else ""
        pk = party_key(lab)
        if not pk:
            continue
        used += 1
        w = float(r["Weight_GenderAgeEducation_Region"] or 1.0)
        groups = [("all", "all")]
        sex = {1.0: "female", 2.0: "male"}.get(r["gender"])
        if sex:
            groups.append(("gender", sex))
        if r["age"] == r["age"]:
            # η ετικέτα λέει «έτος γέννησης», αλλά στο αρχείο V12 η τιμή είναι ήδη ηλικία (19–87)
            age = 2021 - int(r["age"]) if r["age"] > 1900 else int(r["age"])
            if 18 <= age <= 110:
                groups.append(("age_group", "18-24" if age <= 24 else "25-39" if age <= 39 else "40-54" if age <= 54 else "55+"))
        q = vl["Quota_Gender_Age_Edu"].get(r["Quota_Gender_Age_Edu"], "")
        if q.endswith("High"):
            groups.append(("education_group", "high_education"))
        elif q.endswith("Low/Middle"):
            groups += [("education_group", "low_education"), ("education_group", "medium_education")]
        for d, gg in groups:
            for k in LABEL:
                a = acc[k][d][gg]
                a[0] += w * (k == pk); a[1] += w; a[2] += w * w; a[3] += 1
    metrics = []
    for k, dims in acc.items():
        groups = {}
        for d, gg in dims.items():
            for gname, (sy, sw, sw2, n) in gg.items():
                groups.setdefault(d, {})[gname] = {"value": round(100 * sy / sw, 2), "n": n, "nEff": round(sw * sw / sw2, 1),
                                                   "confidence": "high" if n >= 300 else "medium" if n >= 100 else "low", "sources": 1, "inconsistent": False}
        metrics.append({
            "metric": f"undpolar:vote:{k}", "family": "undpolar_vote",
            "label": f"Πρόθεση ψήφου: {LABEL[k]} (UNDPOLAR, % επί όσων δήλωσαν κόμμα)",
            "semanticsNote": "UNDPOLAR, online πάνελ με ποσοστώσεις (όχι πιθανοτικό), πεδίο 10/12/2021–12/1/2022. Βάρος φύλου×ηλικίας×μόρφωσης και περιοχής της πηγής.",
            "waves": [{"key": "2022-Q1", "year": 2022, "quarter": "Q1", "groups": groups, "source": "UNDPOLAR V12, Country=Greece"}],
            "scheme": "eurobarometer", "datasetId": "undpolar-greece", "question": "Suppose there was a general election this week. For which party would you vote?",
        })
    out = {
        "datasetId": "undpolar-greece", "tier": "research_only",
        "source": "UNDPOLAR survey on threats, identities, and political polarization (Kuppens et al.), DataverseNL doi:10.34894/IME1EY, ελληνικό υποδείγμα",
        "license": "CC BY 4.0 (αναφορά πηγής). Κρατείται ως research_only στο Lab (online πάνελ, όχι πιθανοτικό δείγμα).",
        "importedAt": datetime.now(timezone.utc).isoformat(), "years": [2021, 2022],
        "fieldwork": {"start": "2021-12-10", "end": "2022-01-12", "nGreece": int(len(g)), "nPartyChoice": used},
        "questions": [], "metrics": metrics,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"undpolar-greece: {len(g)} ερωτώμενοι, {used} με κόμμα, {len(metrics)} δείκτες -> {out_path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
