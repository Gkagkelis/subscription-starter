"""
Model Registry του Persona Intelligence Engine (μεταδεδομένα στο repo· οι παράμετροι μένουν ιδιωτικές).

  python3 scripts/synthetic-lab/persona/registry.py register --version pie-0.1 [--evaluation <path>] [--notes "..."]
  python3 scripts/synthetic-lab/persona/registry.py compare  --candidate pie-0.2 --baseline pie-0.1
  python3 scripts/synthetic-lab/persona/registry.py approve  --version pie-0.1 --by "Όνομα" [--force-without-eval]
  python3 scripts/synthetic-lab/persona/registry.py list

Κανόνες προώθησης (Continuous Persona Learning, βήμα 8):
  - Νέα έκδοση καταχωρείται ΠΑΝΤΑ ως 'candidate'· τα αποτελέσματα παραγωγής δεν αλλάζουν αυτόματα.
  - 'approved' μόνο με ρητή εντολή προσώπου (--by) ΚΑΙ αποτέλεσμα αξιολόγησης σε ανεξάρτητο holdout που δεν χειροτερεύει
    τα M1/M3 της προηγούμενης εγκεκριμένης πέρα από τα όρια ανοχής (0,5 π.μ. / 0,01).
  - Η έγκριση νέας έκδοσης αποσύρει την προηγούμενη εγκεκριμένη της ίδιας πολιτικής αδειών ('retired').
  - register --staged: «έτοιμη προς ενεργοποίηση» — δεν επιλέγεται ΠΟΤΕ αυτόματα από το runtime (ούτε ως πιο πρόσφατη υποψήφια)·
    ενεργοποιείται μόνο με approve --by ή ρητή επιλογή έκδοσης στο σχέδιο μελέτης.
"""
import argparse
import json
import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
REG = os.path.join(ROOT, "config", "synthetic-lab", "persona", "registry.json")
MODELS = os.path.join(ROOT, ".synthetic-lab-data", "persona", "models")
TOL = {"M1_marginal_MAE_pp": 0.5, "M3_assoc_abs_err": 0.01}


def load():
    return json.load(open(REG)) if os.path.exists(REG) else {"policy": __doc__.strip().splitlines()[0], "versions": []}


def save(r):
    os.makedirs(os.path.dirname(REG), exist_ok=True)
    json.dump(r, open(REG, "w"), ensure_ascii=False, indent=1)


def summary_of(path):
    if not path or not os.path.exists(path):
        return None
    d = json.load(open(path))
    s = d.get("summary", {})
    return {"M1_marginal_MAE_pp": (s.get("M1_marginal_MAE_pp") or {}).get("PIE"), "M3_assoc_abs_err": (s.get("M3_assoc_abs_err") or {}).get("PIE"),
            "split": d.get("split"), "lock": d.get("predictionsLockSha256")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["register", "approve", "compare", "list", "reject"])
    ap.add_argument("--version")
    ap.add_argument("--evaluation", default=None)
    ap.add_argument("--notes", default="")
    ap.add_argument("--by", default=None)
    ap.add_argument("--candidate")
    ap.add_argument("--baseline")
    ap.add_argument("--force-without-eval", action="store_true")
    ap.add_argument("--staged", action="store_true", help="καταχώριση ως 'staged' (όχι αυτόματη επιλογή στο runtime)")
    a = ap.parse_args()
    r = load()
    if a.cmd == "list":
        for v in r["versions"]:
            print(f"{v['version']:16s} {v['status']:9s} {v['licencePolicy']:10s} cutoff={v['cutoff']} snapshot={v['dataSnapshot'][:12]} eval={v.get('evaluationSummary')}")
        return
    if a.cmd == "register":
        m = json.load(open(os.path.join(MODELS, a.version, "model.json")))
        if m.get("syntheticInputs") is not False:
            sys.exit("Άρνηση: το μοντέλο δεν πιστοποιεί πραγματικές εισόδους.")
        r["versions"] = [v for v in r["versions"] if v["version"] != a.version]
        r["versions"].append({
            "version": a.version, "status": "staged" if a.staged else "candidate", "licencePolicy": m["licencePolicy"], "cutoff": m["cutoff"], "dataSnapshot": m["dataSnapshot"],
            "createdAt": m["createdAt"], "codeCommit": m.get("codeCommit"), "nItems": m["nItems"], "sources": [s["fileId"] for s in m["sources"]],
            "evaluation": os.path.relpath(a.evaluation, ROOT) if a.evaluation else None, "evaluationSummary": summary_of(a.evaluation),
            "approvedBy": None, "approvedAt": None, "notes": a.notes,
            "scope": "household" if {s["family"] for s in m["sources"]} == {"hbs"} else "general",
        })
        save(r)
        print("registered", a.version, "staged" if a.staged else "candidate")
    elif a.cmd == "compare":
        c = next(v for v in r["versions"] if v["version"] == a.candidate)
        b = next(v for v in r["versions"] if v["version"] == a.baseline)
        cs, bs = c.get("evaluationSummary") or {}, b.get("evaluationSummary") or {}
        rows = []
        for k, tol in TOL.items():
            if cs.get(k) is None or bs.get(k) is None:
                rows.append((k, None, None, "no-eval"))
                continue
            diff = cs[k] - bs[k]
            rows.append((k, bs[k], cs[k], "ok" if diff <= tol else "worse"))
        for row in rows:
            print(*row)
    elif a.cmd in ("approve", "reject"):
        v = next(x for x in r["versions"] if x["version"] == a.version)
        if a.cmd == "reject":
            v["status"] = "rejected"
            v["notes"] = (v.get("notes") or "") + f" · rejected {time.strftime('%Y-%m-%d')}"
            save(r)
            return
        if not a.by:
            sys.exit("Η έγκριση απαιτεί ρητό όνομα εγκρίνοντος (--by). Καμία αυτόματη προώθηση.")
        if not v.get("evaluationSummary") and not a.force_without_eval:
            sys.exit("Άρνηση: δεν υπάρχει αξιολόγηση σε ανεξάρτητο holdout για αυτή την έκδοση.")
        prev = [x for x in r["versions"] if x["status"] == "approved" and x["licencePolicy"] == v["licencePolicy"] and x["version"] != v["version"]]
        for p in prev:
            ps, vs = p.get("evaluationSummary") or {}, v.get("evaluationSummary") or {}
            for k, tol in TOL.items():
                if ps.get(k) is not None and vs.get(k) is not None and vs[k] - ps[k] > tol:
                    sys.exit(f"Άρνηση: {k} χειροτερεύει ({ps[k]} → {vs[k]}) πέρα από την ανοχή {tol}.")
        for p in prev:
            p["status"] = "retired"
        v["status"] = "approved"
        v["approvedBy"] = a.by
        v["approvedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        save(r)
        print("approved", a.version)


if __name__ == "__main__":
    main()
