"""
PHASE4 IQGE — ερμηνεία ΝΕΩΝ ερωτήσεων ενός ερωτηματολογίου, εκτός σύνδεσης (χωρίς LLM, χωρίς δίκτυο).

Είσοδος:  JSON με ερωτήσεις (StudyPlan με "questions" ή σκέτη λίστα Question του lib/synthetic-lab/types.ts).
Έξοδος:   ίδιο JSON· στις ερωτήσεις ΧΩΡΙΣ personaLink προστίθεται personaLink {kind:'equivalent', iqge:{…}} και αναφορά.
          Ερωτήσεις με χειροκίνητη σύνδεση δεν αλλάζουν. Πολλαπλή επιλογή/ανοιχτές: δεν ερμηνεύονται (καταγράφεται).

  python3 -I scripts/synthetic-lab/persona/iqge.py --root . --model pie-0.4 --ref 2026-10 --in plan.json --out plan_iqge.json

Οι παράμετροι (κάρτα ταιριάσματος, εξασθένιση ανά βαθμίδα, 80% διαστήματα) βρίσκονται στο config/synthetic-lab/persona/iqge/params.json
και μαθεύτηκαν ΜΟΝΟ σε ανάπτυξη (διαΝΕΟσις 2022/2024, leave-one-family-out)· βλ. docs/synthetic-lab/PHASE4_RESULTS.md.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eval_unseen import nrm  # noqa: E402
from iqge_core import IQGE, IQGE_VERSION  # noqa: E402

DK_RE = re.compile(r"(^|\b)(δξ|δα|δεν ξερ|δεν απαντ|δεν γνωριζ|αρνηση|dk|don t know|refus|no answer|δεν τοποθετ)")
SCALE_RE = re.compile(r"(συμφων|διαφων|πολυ|λιγο|καθολου|αρκετ|ικανοποι|καλ|κακ|θετικ|αρνητικ|πιθαν|σιγουρ|συχν|ποτε|παντα|καθημεριν|εβδομαδ|μηνα|σπανι|φορεσ|daily|weekly|monthly|rarely|agree|disagree|very|fairly|not at all|"
                      r"satisf|good|bad|likely|often|never|always|^\d+\b)")


def substantive(opts):
    keep = [o for o in opts if not DK_RE.search(nrm(o))]
    return keep, [o for o in opts if o not in keep]


def item_type(q, opts):
    if len(opts) == 2:
        return "binary"
    if q.get("type") in ("likert", "concept_test"):
        return "ordinal"
    hits = sum(1 for o in opts if SCALE_RE.search(nrm(o)))
    return "ordinal" if hits >= max(2, len(opts) // 2) else "nominal"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--model", default="pie-0.4")
    ap.add_argument("--ref", required=True, help="μήνας αναφοράς YYYY-MM")
    ap.add_argument("--params", default="config/synthetic-lab/persona/iqge/params.json")
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-international", action="store_true", help="χωρίς τη διεθνή βάση (Phase 5)")
    ap.add_argument("--international-lake", action="store_true",
                    help="PHASE5 S2 (staged): διεθνή items ως τεκμήριο συγγενών ερωτήσεων· ελληνικό επίπεδο πραγματικό ή από την παραλλαγή C")
    ap.add_argument("--p4-lake", action="store_true", help="πρόσθετη βάση φάσης 4 (δεν βελτίωσε την ανάπτυξη· εκτός προεπιλογής)")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    params = json.load(open(os.path.join(root, a.params)))
    G = IQGE(root, os.path.join(root, ".synthetic-lab-data", "persona", "models", a.model), params, use_p4_lake=a.p4_lake)
    gm = None
    if not a.no_international:
        from gbt_runtime import GlobalMatcher

        gm = GlobalMatcher(root, G.E)
    if a.international_lake:
        from gbt_runtime import extend_iqge

        print("διεθνής βάση IQGE:", extend_iqge(G, root), "items")
    doc = json.load(open(a.inp))
    qs = doc["questions"] if isinstance(doc, dict) else doc
    report = []
    for q in qs:
        if q.get("personaLink"):
            report.append({"id": q["id"], "status": "manual_link"})
            continue
        if q.get("type") in ("multiple_choice", "open_text", "open", "numeric"):
            report.append({"id": q["id"], "status": "not_interpreted", "reason": f"τύπος {q.get('type')}: δεν ερμηνεύεται από το {IQGE_VERSION}"})
            continue
        opts = (q.get("scale") if q.get("type") in ("likert", "concept_test") else q.get("options")) or []
        subst, dk = substantive(opts)
        if not 2 <= len(subst) <= 11:
            report.append({"id": q["id"], "status": "not_interpreted", "reason": "χρειάζονται 2–11 ουσιαστικές επιλογές"})
            continue
        t = {"id": f"q::{q['id']}", "text": q.get("text", ""), "options": [{"code": str(i + 1), "label": o} for i, o in enumerate(subst)],
             "type": item_type(q, subst), "wave": a.ref}
        r = G.interpret(t, a.ref)
        link = G.link(r, subst)
        m = gm.match(t) if gm else None
        if m and t["type"] != "nominal":
            # PHASE5 S1: ισοδύναμη ερώτηση σε διεθνή έρευνα (πραγματικό ελληνικό περιθώριο ή μεταφορά από κοντινές χώρες)
            link.update(gm.link_parts(m, subst))
            link["tier"] = "international"
            r["tier"] = "international"
        q["personaLink"] = {"kind": "equivalent", "optionMap": {}, "dkOption": dk[0] if dk else None, "iqge": link,
                            "assumption": f"{IQGE_VERSION}: επίπεδο από πραγματικά περιθώρια συγγενών ερωτήσεων (βαθμίδα {r['tier']}), σειρά από λανθάνοντα του {a.model}."}
        report.append({"id": q["id"], "status": "interpreted", "tier": r["tier"], "international": link.get("international"), "sim1": r["sim1"], "type": t["type"], "expectedMAE": link["expectedMAE"],
                       "level": link["level"], "evidence": r["evidence"][:3], "baseKind": r["baseKind"], "baseWeight": r["baseWeight"], "rank": r["rank"]})
    if isinstance(doc, dict):
        doc["iqgeReport"] = {"version": IQGE_VERSION, "model": a.model, "ref": a.ref, "internationalLake": a.international_lake, "questions": report,
                             "note": "AI-generated synthetic research: τα επίπεδα προέρχονται από πραγματικά δεδομένα συγγενών ερωτήσεων, όχι από γλωσσικό μοντέλο."}
    json.dump(doc, open(a.out, "w"), ensure_ascii=False, indent=1)
    for x in report:
        print(x["id"], x["status"], x.get("tier", ""), x.get("expectedMAE", ""), x.get("reason", ""))


if __name__ == "__main__":
    main()
