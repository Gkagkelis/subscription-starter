"""
PHASE7A — έλεγχος διαρροής για κάθε έρευνα/ερώτηση-στόχο (διαβάζει ΜΟΝΟ ερωτηματολόγια· όχι απαντήσεις).

Έλεγχοι:
  1. οργανισμός + ημερομηνίες πεδίου έναντι: PDF του Lab (documents.json), λίμνης (lake.sqlite: studies), αρχείου δημοσκοπήσεων
     (polls_toplines.csv), διεθνούς βάσης (surveys*.json), μητρώου holdouts (Phase 4/5/6)·
  2. ακριβές και κανονικοποιημένο κείμενο ερώτησης έναντι: κειμένου σελίδων PDF (pages.jsonl), τράπεζας ερωτήσεων (item_bank),
     βάσης φάσης 4 (lake_bank), διεθνών items, πακέτου gbt-items·
  3. σχεδόν-διπλότυπα: ομοιότητα ενσωμάτωσης ≥ 0,90 με ίδιο πλήθος επιλογών → «επαναλαμβανόμενη ερώτηση» (νόμιμο ιστορικό
     τεκμήριο ΜΟΝΟ αν η πηγή είναι παλαιότερη από το πεδίο της έρευνας-στόχου).
Επίπεδα: 0 μολυσμένο (ίδια έρευνα ή ίδια αποτελέσματα διαθέσιμα) · 1 πιθανή μόλυνση · 2 αναδρομικά επιλέξιμο · 3 προοπτικά τυφλό.

  python3 -I scripts/synthetic-lab/p7a/p7a_leakage.py --root . --out docs/synthetic-lab/PHASE7A_LEAKAGE_AUDIT.json
"""
import argparse
import glob
import json
import os
import re
import sqlite3
import sys
import unicodedata

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
D = os.path.join(ROOT, ".synthetic-lab-data")


def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-zα-ω0-9 ]+", " ", s).split()


def njoin(s):
    return " ".join(norm(s))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=ROOT)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    sys.path.insert(0, os.path.join(ROOT, "scripts", "synthetic-lab", "persona"))
    import embed

    E = embed.Embedder(ROOT)
    Qs = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(D, "p7a", "questionnaires", "*.json")))]
    docs = json.load(open(os.path.join(D, "persona", "pdf", "documents.json")))
    docs = docs if isinstance(docs, list) else docs.get("documents", [])
    # πλήρες κείμενο των PDF του Lab (pdftotext, .synthetic-lab-data/p7a/pdftext/<docId>.txt)
    page_text = {}
    for d_ in docs:
        fp = os.path.join(D, "p7a", "pdftext", f"{d_['docId']}.txt")
        if os.path.exists(fp):
            page_text[d_["docId"]] = njoin(open(fp, errors="ignore").read())
    con = sqlite3.connect(os.path.join(D, "lake", "lake.sqlite"))
    studies = con.execute("select study_id, title, url, collection_year_start, publication_year from studies").fetchall()
    import pandas as pd

    polls = pd.read_csv(os.path.join(D, "raw", "political", "tidy", "polls_toplines.csv"), dtype=str)
    # τράπεζες ερωτήσεων
    banks = []
    for b in json.load(open(os.path.join(D, "persona", "harmonized", "item_bank.json"))):
        banks.append(("greek_bank", b["id"], b["text"], len(b["options"]), b.get("wave")))
    p4 = os.path.join(D, "persona", "phase4", "lake_bank.json")
    if os.path.exists(p4):
        for b in json.load(open(p4)):
            banks.append(("phase4_lake", b["id"], b.get("text", ""), len(b.get("options", [])), b.get("wave")))
    for f in glob.glob(os.path.join(D, "global-behavior-evidence", "v1", "items", "*.json")):
        for b in json.load(open(f)):
            banks.append(("intl_lake", b["id"], b.get("text", ""), len(b.get("options", [])), None))
    bank_norm = {}
    for src, iid, txt, k, w in banks:
        bank_norm.setdefault(njoin(txt), []).append((src, iid, w))
    with open(os.path.join(D, "persona", "pdf", "tables_text.jsonl")) as f:
        for line in f:
            r = json.loads(line)
            if r.get("question"):
                banks.append(("pdf_tables", f"{r['docId']}:p{r.get('page')}", r["question"], len(r.get("rows") or []), str(r.get("date") or "")[:7]))
    bank_norm = {}
    for src, iid, txt, k, w in banks:
        bank_norm.setdefault(njoin(txt), []).append((src, iid, w))
    print("τράπεζες", len(banks), "PDF με κείμενο", len(page_text), flush=True)
    BV = E.encode([embed.clean(t) for _, _, t, _, _ in banks])
    report = {"surveys": {}}
    for Q in Qs:
        sid, org = Q["surveyId"], Q.get("organisation", "")
        fw0, fw1 = Q.get("fieldworkStart", ""), Q.get("fieldworkEnd", "")
        orgn = njoin(org)
        # 1. ίδια έρευνα στο Lab;
        same_docs = [d for d in docs if orgn and orgn.split()[0] in njoin(f"{d.get('org','')} {d.get('title','')} {d.get('client','')}")
                     and str(d.get("fieldwork_end") or d.get("date") or "")[:7] in (fw0[:7], fw1[:7])]
        lake_hits = [s for s in studies if orgn and orgn.split()[0] in njoin(f"{s[1]} {s[2]}") and str(s[4] or "")[:4] == fw1[:4]]
        poll_hits = polls[(polls.pollster_norm.fillna("").str.lower().map(lambda x: bool(orgn) and orgn.split()[0] in njoin(x)))
                          & (polls.fieldwork_end.fillna("") >= fw0) & (polls.fieldwork_end.fillna("") <= (fw1 or fw0))]
        items = []
        for it in Q["questions"]:
            t = it["text"]
            tn = njoin(t)
            exact_bank = bank_norm.get(tn, [])
            in_pdf = [k for k, v in page_text.items() if len(tn) > 25 and tn in v]
            v = E.encode([embed.clean(t)])[0]
            sims = BV @ v
            near = []
            for j in np.argsort(-sims)[:5]:
                if sims[j] >= 0.90 and banks[j][3] == len(it.get("options", [])):
                    near.append({"src": banks[j][0], "id": banks[j][1], "sim": round(float(sims[j]), 3), "wave": banks[j][4]})
            pdf_docs = [next((d for d in docs if d.get("docId") == k), {}) for k in in_pdf]
            pdf_same = [d for d in pdf_docs if str(d.get("fieldwork_end") or d.get("date") or "")[:7] >= fw0[:7]]
            level = 2
            why = []
            if pdf_same:
                level = 0
                why.append("το κείμενο της ερώτησης βρέθηκε σε PDF του Lab με ημερομηνία ≥ πεδίου στόχου")
            elif in_pdf:
                why.append("ίδια διατύπωση σε παλαιότερο PDF (ιστορική επανάληψη — νόμιμο τεκμήριο αν ≤ πεδίου)")
            if exact_bank or near:
                why.append("επαναλαμβανόμενη/σχεδόν ίδια ερώτηση σε τράπεζα (έλεγχος κύματος)")
                for n in near:
                    if n["wave"] and str(n["wave"]) >= fw0[:7]:
                        level = min(level, 1)
                        why.append(f"σχεδόν ίδια ερώτηση με κύμα ≥ πεδίου: {n['id']}")
            items.append({"qid": it["qid"], "level": level, "exactBank": exact_bank[:5], "nearDuplicates": near, "pdfMatches": [d.get("docId") for d in pdf_docs][:5],
                          "pdfMatchTitles": [str(d.get("title"))[:120] for d in pdf_docs][:3], "notes": why})
        lvl = 0 if same_docs else min([x["level"] for x in items] + [2])
        report["surveys"][sid] = {"organisation": org, "fieldwork": [fw0, fw1], "surveyLevel": lvl,
                                  "sameSurveyInPdfCorpus": [f"{d.get('docId')}: {str(d.get('title'))[:100]} ({d.get('date')})" for d in same_docs][:10],
                                  "lakeStudies": [f"{s[0]}: {str(s[1])[:100]}" for s in lake_hits][:10],
                                  "pollArchiveRows": int(len(poll_hits)), "pollArchivePolls": sorted(set(poll_hits.poll_id))[:10],
                                  "items": items}
        print(sid, "επίπεδο", lvl, "PDF ίδιας έρευνας", len(same_docs), "δημοσκοπήσεις αρχείου", len(poll_hits), flush=True)
    json.dump(report, open(a.out, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
