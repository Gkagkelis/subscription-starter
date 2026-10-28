"""
Πίνακες μετακινήσεων ψηφοφόρων (συσπειρώσεις/εκροές) από δημοσιευμένες δημοσκοπήσεις → ενιαία μορφή.

Είσοδος: .synthetic-lab-data/persona/pdf/tables_visual*.jsonl (οπτική μεταγραφή, κάθε αριθμός επαληθευμένος στο κείμενο της σελίδας).
Έξοδος:  .synthetic-lab-data/persona/flows/flows.csv — μία γραμμή ανά (δημοσκόπηση, κόμμα προέλευσης, προορισμός):
         docId, page, org, fieldwork_end, n, past_election, from_key, to_key, pct, partition, kind
  to_key: κλειδί κόμματος, ή other / undecided / abstain / moved_any / σύνθετο (π.χ. other+undecided+abstain).
Αποκλείονται: εισροές («από Χ»: σύνθεση ψηφοφόρων, όχι εκροή), σύνθεση εκλογικής βάσης, περιφερειακές έρευνες.
Διαμέρισμα κατά SPRINT_PREREGISTRATION: ≤2026-04 calibration · 2026-05..07 validation · ≥2026-08 final.

  python3 scripts/synthetic-lab/persona/flows.py --root .
"""
import argparse
import csv
import json
import os
import re
import unicodedata

PARTY_RX = [
    ("nd", r"^(ΝΔ|Ν Δ|ΝΕΑ ΔΗΜΟΚΡΑΤΙΑ)$"), ("syriza", r"^ΣΥΡΙΖΑ"), ("pasok", r"^(ΠΑΣΟΚ|ΚΙΝΑΛ|ΚΙΝΗΜΑ ΑΛΛΑΓΗΣ)"), ("kke", r"^ΚΚΕ$"),
    ("el", r"^(ΕΛΛΗΝΙΚΗ ΛΥΣΗ|ΕΛ ΛΥΣΗ)$"), ("mera25", r"^ΜΕΡΑ ?25$"), ("plefsi", r"^ΠΛΕΥΣΗ"), ("niki", r"^ΝΙΚΗ$"),
    ("spartiates", r"^ΣΠΑΡΤΙΑΤΕΣ$"), ("nea_aristera", r"^ΝΕΑ ΑΡΙΣΤΕΡΑ$"), ("dpk", r"^(ΔΗΜΟΚΡΑΤΕΣ|ΚΙΝΗΜΑ ΔΗΜΟΚΡΑΤΙΑΣ)"),
    ("foni_logikis", r"^ΦΩΝΗ ΛΟΓΙΚΗΣ$"), ("elas", r"^ΕΛ ?Α ?Σ$"), ("elpida", r"^ΕΛΠΙΔΑ"), ("xa", r"^ΧΡΥΣΗ ΑΥΓΗ$"), ("kosmos", r"^ΚΟΣΜΟΣ$"),
    ("antarsya", r"^ΑΝΤΑΡΣΥΑ$"), ("ellines", r"^(ΕΘΝΙΚΟ ΚΟΜΜΑ ΕΛΛΗΝΕΣ|ΕΛΛΗΝΕΣ ΓΙΑ ΤΗΝ ΠΑΤΡΙΔΑ)$"),
]
NONPARTY = [("other+undecided+abstain", r"ΑΛΛ.*ΑΝΑΠΟΦΑΣ.*ΑΠΟΧ"), ("other+abstain", r"^ΑΛΛΟ ΚΟΜΜΑ ?/? ?ΑΠΟΧΗ$"),
            ("undecided+abstain", r"(ΑΝΑΠΟΦΑΣ.*ΑΠΟΧ|ΑΠΟΧ.*ΑΝΑΠΟΦΑΣ|ΔΕΝ ΑΠΟΦΑΣΙΣΑ.*ΑΠΟΧ)"),
            ("abstain", r"(ΑΚΥΡΟ|ΛΕΥΚΟ|ΑΠΟΧΗ|ΔΕΝ ΘΑ ΨΗΦΙΣΩ)"), ("undecided", r"(ΑΝΑΠΟΦΑΣΙΣΤ|ΔΕΝ ΕΧΩ ΑΠΟΦΑΣΙΣΕΙ|ΑΔΙΕΥΚΡΙΝΙΣΤ|ΓΚΡΙΖΑ ΖΩΝΗ|ΔΓ.?ΔΑ|ΔΕΝ ΑΠΑΝΤΩ)"),
            ("moved_any", r"^ΜΕΤΑΚΙΝΗΣΕΙΣ$"), ("other", r"^(ΑΛΛΟ|ΑΛΛΑ|ΛΟΙΠΑ)"), ("retention", r"^ΣΥΣΠΕΙΡΩΣΗ$")]


def norm(s):
    s = unicodedata.normalize("NFD", str(s).upper())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\[[^\]]*\]|\((LOGO|ΣΥΣΠΕΙΡΩΣΗ|ΤΩΡΑ|ΕΙΣΡΟΕΣ|ΠΟΙΟ;?|ΠΡΟΘΕΣΗ ΨΗΦΟΥ ΣΗΜΕΡΑ)[^)]*\)", " ", s)
    s = re.sub(r"[*.]", "", s).replace("–", "-").replace("-", " ")
    return re.sub(r"\s+", " ", s).strip()


def key_of(label):
    s = norm(label)
    retained = "ΣΥΣΠΕΙΡΩΣΗ" in unicodedata.normalize("NFD", str(label).upper()).replace("́", "")
    for k, rx in NONPARTY:
        if re.search(rx, s):
            return k, False
    for k, rx in PARTY_RX:
        if re.search(rx, s):
            return k, retained
    return None, False


def partition(month):
    return "calibration" if month <= "2026-04" else ("validation" if month <= "2026-07" else "final")


def records(root):
    for f in ("tables_visual.jsonl", "tables_visual_b.jsonl"):
        p = os.path.join(root, ".synthetic-lab-data/persona/pdf", f)
        if os.path.exists(p):
            for line in open(p):
                yield json.loads(line)


def normalise(root):
    out, skipped = [], []
    for r in records(root):
        if r.get("kind") not in ("flow", "flow_matrix"):
            continue
        title = (r.get("title") or "") + " " + (r.get("base") or "")
        if re.search(r"ΔΟΜΗ|ΚΕΝΤΡΙΚΗ ΜΑΚΕΔΟΝΙΑ|ΠΕΡΙΦΕΡΕΙ", title, re.I) or r.get("org") == "Palmos Analysis":
            skipped.append((r["docId"], r["page"], "σύνθεση/περιφερειακή"))
            continue
        base = dict(docId=r["docId"], page=r["page"], org=r["org"], fieldwork_end=r["fieldwork_end"], n=r.get("n"),
                    past_election=r.get("past_election"), partition=partition(r["fieldwork_end"][:7]), kind=r["kind"])
        rows = []
        if r["kind"] == "flow":
            fp = r.get("from_party")
            for row in r["rows"]:
                lab = row["label"]
                if norm(lab).startswith("ΑΠΟ "):
                    continue  # εισροή
                src = row.get("from_party") or row.get("from") or (fp if isinstance(fp, str) else None)
                fk, _ = key_of(src) if src else (None, False)
                tk, ret = key_of(lab)
                if tk == "retention" or ret:
                    tk = fk
                rows.append((fk, tk, row.get("value"), lab))
        else:
            m = r["matrix"]
            orient = m.get("orientation", "")
            for i, rl in enumerate(m["row_labels"]):
                for j, cl in enumerate(m["col_labels"]):
                    v = m["values"][i][j]
                    src, dst = (cl, rl) if orient.startswith("columns") else (rl, cl)
                    fk, _ = key_of(src)
                    tk, _ = key_of(dst)
                    rows.append((fk, tk, v, dst))
        for fk, tk, v, lab in rows:
            if v is None:
                continue
            if fk is None or tk is None or fk in ("other", "undecided", "abstain", "undecided+abstain"):
                skipped.append((r["docId"], r["page"], f"άγνωστη ετικέτα: {lab}"))
                continue
            out.append({**base, "from_key": fk, "to_key": tk, "pct": float(v)})
    # αφαίρεση διπλοεγγραφών (ίδια δημοσκόπηση, ίδιο ζεύγος από εκροές και εισροές)
    seen, uniq = set(), []
    for o in out:
        k = (o["org"], o["fieldwork_end"], o["past_election"], o["from_key"], o["to_key"])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(o)
    return uniq, skipped


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    rows, skipped = normalise(root)
    d = os.path.join(root, ".synthetic-lab-data/persona/flows")
    os.makedirs(d, exist_ok=True)
    cols = ["docId", "page", "org", "fieldwork_end", "n", "past_election", "from_key", "to_key", "pct", "partition", "kind"]
    with open(os.path.join(d, "flows.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    json.dump(skipped, open(os.path.join(d, "skipped.json"), "w"), ensure_ascii=False, indent=1)
    polls = {(r["org"], r["fieldwork_end"]) for r in rows}
    print(f"{len(rows)} γραμμές ροών από {len(polls)} δημοσκοπήσεις· παραλείφθηκαν {len(skipped)}")
