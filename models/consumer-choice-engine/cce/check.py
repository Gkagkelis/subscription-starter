"""CCE — έλεγχοι μετά την εκπαίδευση, για κάθε artifact:
  1. behavioral suite A–F (cce.behavior.run_suite) σε προφίλ του ελληνικού συνθετικού πάνελ·
  2. σύνδεση με το πάνελ: (α) ελληνικό σενάριο εκτός πεδίου → πρέπει να επιστραφεί άρνηση (όχι πιθανότητες),
     (β) σενάριο εντός πεδίου → πιθανότητες ΜΕ σήμανση SOURCE_POPULATION_ONLY,
     (γ) ατομική συνέπεια μεταξύ σεναρίων τιμής (κοινοί τυχαίοι αριθμοί) και επαναληψιμότητα.
Δεν αποθηκεύονται μερίδια ως ευρήματα· μόνο καταστάσεις ελέγχων και ποσοστά ατομικής συνέπειας.
    python3 -I cce_cli.py check artifacts/<model>.json [...]
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

from .behavior import run_suite
from .engine import ChoiceEngine
from .panel import load_greek_panel

GREEK_REPAIR_SCENARIO = {"context": {"category": "washing_machine_repair_vs_replace"},
                         "alternatives": [{"alt_id": "repair", "repair_cost_eur": 120}, {"alt_id": "replace_new", "price_eur": 450}]}


def check(path, n_profiles=500):
    eng = ChoiceEngine.load(path)
    art = eng.art
    spec = art["behavior_spec"]
    panel = load_greek_panel()[:n_profiles]
    out = {"model_id": art["model_id"], "artifact_trained_at": art["trained_at"], "n_panel": len(panel)}
    out["behavior"] = run_suite(eng, spec, panel[:100])
    # (α) ελληνικό σενάριο επισκευής/αντικατάστασης: κανένα σημερινό artifact δεν το καλύπτει
    r = eng.predict_proba(panel[0], GREEK_REPAIR_SCENARIO["context"], GREEK_REPAIR_SCENARIO["alternatives"])
    out["greek_repair_scenario"] = {"status": r["status"], "transfer": r["transfer"], "probabilities_returned": r["probabilities"] is not None,
                                    "pass": r["probabilities"] is None}
    # (β) εντός πεδίου: πρέπει να φέρει σήμανση μεταφοράς
    r = eng.predict_proba(panel[0], spec["context"], spec["base_alternatives"])
    out["in_domain_scenario"] = {"status": r["status"], "transfer": r["transfer"], "pass": r["status"] == "SUPPORTED" and r["transfer"] == "SOURCE_POPULATION_ONLY"}
    # (γ) ατομική συνέπεια: σειρά σεναρίων με αυξανόμενη τιμή της ίδιας εναλλακτικής
    t = next((v for k, v in spec["tests"].items() if v and v.get("direction") == "nonincreasing"), None)
    if t:
        scen = {}
        for v in t["values"]:
            alts = copy.deepcopy(spec["base_alternatives"])
            next(a for a in alts if a["alt_id"] == t["alt"])[t["attr"]] = v
            scen[f"{t['attr']}={v}"] = alts
        s1 = eng.simulate_panel(panel, spec["context"], scen, task_key="consistency", seed=20261030)
        s2 = eng.simulate_panel(panel, spec["context"], scen, task_key="consistency", seed=20261030)
        if s1["status"] != "SUPPORTED":
            out["panel_consistency"] = {"status": s1["status"], "scenarios": {k: v.get("reasons") for k, v in s1["scenarios"].items()}}
        else:
            names = list(scen)
            viol = 0
            for i in range(len(panel)):
                ch = [s1["scenarios"][n]["individual"][i]["choice"] == t["alt"] for n in names]
                viol += any(ch[k + 1] and not ch[k] for k in range(len(ch) - 1))
            out["panel_consistency"] = {"status": "PASS" if viol == 0 and s1 == s2 else "FAIL", "attr": t["attr"], "alt": t["alt"],
                                        "respondents_with_reversal": viol, "repeatable": s1 == s2,
                                        "note": "Κανείς καταναλωτής δεν επιλέγει την εναλλακτική σε υψηλότερη τιμή ενώ την απέρριψε σε χαμηλότερη."}
    out["all_pass"] = all(x.get("status") in ("PASS", "NOT_APPLICABLE") for x in out["behavior"].values()) and out["greek_repair_scenario"]["pass"] \
        and out["in_domain_scenario"]["pass"] and out.get("panel_consistency", {}).get("status", "PASS") == "PASS"
    return out


if __name__ == "__main__":
    res = [check(p) for p in sys.argv[1:]]
    d = Path(sys.argv[1]).resolve().parent / "checks"
    d.mkdir(exist_ok=True)
    for r in res:
        (d / f"{r['model_id']}.checks.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
        print(r["model_id"], "all_pass", r["all_pass"], {k: v["status"] for k, v in r["behavior"].items()}, r["greek_repair_scenario"]["status"],
              r["in_domain_scenario"], {k: v for k, v in r.get("panel_consistency", {}).items() if k != "note"})
