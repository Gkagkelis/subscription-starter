"""Προκαθορισμένος έλεγχος ποιότητας σταδίου (σημείο ελέγχου μετά τα 50 και στα 500 completes).

ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ.
Τα κριτήρια γράφτηκαν ΠΡΙΝ από τα αποτελέσματα του σταδίου 1 και δεν αλλάζουν κατά την εκτέλεση.
    python3 -I studies/kotsovolos_signalyth_2026_500/analysis/stage_gate.py --run k500_full_v1 --stage 1|2
Γράφει internal/runs/<run>/stage<N>_gate.json και επιστρέφει κωδικό εξόδου 0 μόνο αν όλα τα κριτήρια περνούν.
"""
import argparse
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "research-engine"))
from ase.qc.audit_run import audit_run  # noqa: E402
from ase.study import Study  # noqa: E402
from ase.util import write_json  # noqa: E402

STUDY = ROOT / "studies" / "kotsovolos_signalyth_2026_500"
TARGET = {1: 50, 2: 500}
SOFT_MAX = {1: 0.15, 2: 0.10}        # μέγιστο ποσοστό ανά κανόνα συνέπειας (στάδιο 1: n=50, άρα 1 περίπτωση = 2%)


def gate(run_id, stage):
    st = Study(STUDY)
    rdir = st.internal / "runs" / run_id
    man = json.loads((rdir / "execution_manifest.json").read_text(encoding="utf-8"))
    qc = json.loads((rdir / "quality_checks.json").read_text(encoding="utf-8"))
    au = audit_run(st, run_id)
    write_json(rdir / "audit.json", au)
    df = st.responses(run_id)
    checks = []

    def add(name, ok, detail):
        checks.append({"criterion": name, "status": "PASS" if ok else "FAIL", "detail": detail})

    comp = man.get("completes") or {}
    add("Ολοκληρωμένες συνεντεύξεις = στόχος σταδίου", comp.get("achieved_completes") == TARGET[stage],
        f"{comp.get('achieved_completes')}/{TARGET[stage]} · προφίλ {comp.get('profiles_used')} · αντικαταστάτες {comp.get('replacements')}")
    add("Σφάλματα εκτέλεσης", man.get("errors", 0) == 0, f"{man.get('errors', 0)}")
    add("Εγκεκριμένη (παγωμένη) έκδοση ερωτηματολογίου", au["questionnaire"]["run_used_current_version"]
        and au["questionnaire"]["current_questionnaire_sha256"] == st.cfg["approval"]["frozen"]["questionnaire_sha256"],
        au["questionnaire"]["run_questionnaire_sha256"][:12])
    add("Έγκυρες διαδρομές και απαντήσεις (επανυπολογισμός από τις απαντήσεις)", au["summary"]["branching_or_validity_issues"] == 0,
        f"{au['summary']['branching_or_validity_issues']} ζητήματα")
    add("Δημογραφική συνέπεια D01–D03 με το προφίλ", not any("D0" in str(i) for i in au["records"]["issues"]), "μέρος του προηγούμενου ελέγχου")
    add("Λογικοί περιορισμοί C1–C5", au["summary"]["hard_violations"] == 0, f"{au['summary']['hard_violations']} παραβιάσεις")
    sr = au["records"]["soft_rule_max_rate"]
    add(f"Συνοχή μεταξύ ερωτήσεων: κάθε κανόνας S1–S14 ≤ {SOFT_MAX[stage]:.0%}", sr <= SOFT_MAX[stage],
        f"μέγιστο {sr:.1%} · {au['records']['soft_rule_hits']}")
    sty = au["style"]
    add("Ποικιλία: καμία διπλή αιτιολόγηση > 1%", sty["duplicate_rationales"] <= 0.01 * max(sty["rationales"], 1),
        f"{sty['duplicate_rationales']} από {sty['rationales']}")
    uni = next((c for c in qc["checks"] if c["check"].startswith("Υπερβολικά ομοιόμορφες")), None)
    add("Ποικιλία: καμία ερώτηση > 95% σε μία επιλογή, χωρίς straight-lining", uni is not None and uni["status"] == "PASS", uni["detail"] if uni else "—")
    add("Ρεαλιστική μεταβλητότητα: κλήρωση σύμφωνη με τις κατανομές", bool(au["sampling"].get("ok")), json.dumps(au["sampling"], ensure_ascii=False))
    dup = df.duplicated(["respondent_id", "question_id"]).sum()
    add("Καμία διπλοεγγραφή ερωτώμενου/ερώτησης", dup == 0, f"{dup}")
    prof = st.profiles(run_id)
    used = prof[prof["respondent_id"].isin(df["respondent_id"].unique())]
    add("Κανένας διπλός ερωτώμενος (ίδια εγγραφή πλαισίου)", not used["frame_record"].duplicated().any() and not used["respondent_id"].duplicated().any(),
        f"{used['respondent_id'].nunique()} μοναδικοί")
    if au["report"] is not None:
        add("Σωστοί παρονομαστές και πολλαπλές επιλογές στο report", au["summary"]["report_mismatches"] == 0 and au["report"]["multi_select_note_in_report"],
            f"{au['summary']['report_mismatches']} αποκλίσεις")
    cov = pd.read_csv(rdir / "evidence_coverage.csv")
    c = cov.set_index("question_id")
    ok_ev = (int(c.loc["Q01", "n_C_EVIDENCE_CONSTRAINED"]) == int(c.loc["Q01", "rows_answered"]) and
             int(c.loc["Q02", "n_C_EVIDENCE_CONSTRAINED"]) == int(c.loc["Q02", "rows_answered"]) and
             all(int(c.loc[q, "n_C_EVIDENCE_INFORMED"]) == int(c.loc[q, "rows_answered"]) for q in ("Q14", "Q15", "Q16")) and
             int(c["n_D_AI"].sum()) > 0 and all(int(c.loc[q, "n_PROFILE"]) == int(c.loc[q, "rows_answered"]) for q in ("D01", "D02", "D03")))
    add("Ενοποίηση AI και τεκμηρίων όπως σχεδιάστηκε (όρια Q01/Q02, πλαίσιο Q14–Q16, προφίλ D01–D03)", ok_ev,
        f"όρια που άλλαξαν την κατανομή: {int(c['n_bound_binding'].sum()) if 'n_bound_binding' in c else '—'}")
    add("Καμία διαρροή Signalyth / σκεπτικού στα prompts", au["summary"]["rationale_leaks"] == 0, f"{au['rationale_leak']['prompts_checked']} κείμενα")
    add("Άγκυρες PIE αληθοφανείς", bool(au["summary"]["anchors_ok"]), "")
    fails = [x for x in qc["checks"] if x["status"] == "FAIL"]
    add("Κανένα FAIL στους ελέγχους ποιότητας της μηχανής", not fails, "; ".join(f["check"] for f in fails) or "—")
    out = {"label": "ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ", "run_id": run_id, "stage": stage, "checks": checks,
           "engine_warnings": [{"check": x["check"], "detail": x["detail"]} for x in qc["checks"] if x["status"] == "WARN"],
           "result": "PASS" if all(x["status"] == "PASS" for x in checks) else "FAIL"}
    write_json(rdir / f"stage{stage}_gate.json", out)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--stage", type=int, required=True)
    a = ap.parse_args()
    o = gate(a.run, a.stage)
    for c in o["checks"]:
        print(f"{c['status']:4}  {c['criterion']}  [{c['detail'][:110]}]")
    print("WARN μηχανής:", [w["check"] for w in o["engine_warnings"]])
    print("ΑΠΟΤΕΛΕΣΜΑ:", o["result"])
    sys.exit(0 if o["result"] == "PASS" else 1)
