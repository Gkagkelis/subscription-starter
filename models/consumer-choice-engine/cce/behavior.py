"""CCE — αυτοματοποιημένοι έλεγχοι συμπεριφορικής συνέπειας (A–F) πάνω σε εκπαιδευμένο artifact.

Οι έλεγχοι ΔΕΝ διορθώνουν προβλέψεις· απλώς καταγράφουν αν οι πιθανότητες κινούνται στη σωστή κατεύθυνση.
Περνούν μόνο αν το μοντέλο έχει την κατάλληλη οικονομική δομή· δεν αποτελούν απόδειξη ακρίβειας.
Κάθε έλεγχος δέχεται «προδιαγραφή» από το artifact (ποια εναλλακτική/χαρακτηριστικό αντιστοιχεί σε τιμή, εγγύηση, κ.λπ.)·
αν το μοντέλο δεν περιέχει το χαρακτηριστικό, ο έλεγχος δηλώνεται NOT_APPLICABLE — όχι PASS.
"""
from __future__ import annotations

import copy

import numpy as np

from .engine import ChoiceEngine


def _p(engine, profile, ctx, alts, alt):
    r = engine.predict_proba(profile, ctx, alts)
    return None if r["probabilities"] is None else r["probabilities"][alt]


def monotone(engine, profile, ctx, base_alts, alt, attr, values, direction):
    """direction: 'nonincreasing' ή 'nondecreasing' για την πιθανότητα της alt όταν μεταβάλλεται το attr της ίδιας alt."""
    ps = []
    for v in values:
        alts = copy.deepcopy(base_alts)
        for a in alts:
            if a["alt_id"] == alt:
                a[attr] = v
        ps.append(_p(engine, profile, ctx, alts, alt))
    if any(p is None for p in ps):
        return {"status": "NOT_APPLICABLE", "values": values, "probabilities": ps}
    d = np.diff(ps)
    ok = (d <= 1e-12).all() if direction == "nonincreasing" else (d >= -1e-12).all()
    return {"status": "PASS" if ok else "FAIL", "values": values, "probabilities": ps}


def run_suite(engine: ChoiceEngine, spec: dict, profiles: list[dict]):
    """spec (από το artifact): {"context":…, "base_alternatives":[…], "tests": {"A_repair_cost": {"alt","attr","values","direction"}, …},
    "dominance": {"alt_better", "alt_worse", "attr", "better_value"}}"""
    out = {}
    if not engine.art:
        return {k: {"status": "NOT_TRAINED"} for k in ("A_repair_cost", "B_trade_in", "C_warranty", "D_delivery", "E_dominance", "F_repeatability")}
    ctx = spec["context"]
    names = ["A_repair_cost", "B_trade_in", "C_warranty", "D_delivery"] + [k for k in spec["tests"] if k not in ("A_repair_cost", "B_trade_in", "C_warranty", "D_delivery")]
    for name in names:
        t = spec["tests"].get(name)
        if not t or t["attr"] not in engine.art["domain"]["attributes"]:
            out[name] = {"status": "NOT_APPLICABLE", "reason": "Το χαρακτηριστικό δεν υπάρχει στο εκπαιδευμένο μοντέλο."}
            continue
        per = [monotone(engine, pr, ctx, spec["base_alternatives"], t["alt"], t["attr"], t["values"], t["direction"]) for pr in profiles]
        st = "PASS" if all(x["status"] == "PASS" for x in per) else ("NOT_APPLICABLE" if all(x["status"] == "NOT_APPLICABLE" for x in per) else "FAIL")
        out[name] = {"status": st, "n_profiles": len(profiles), "n_fail": sum(x["status"] == "FAIL" for x in per), "example": per[0]}
    d = spec.get("dominance")
    if d and d["attr"] in engine.art["domain"]["attributes"]:
        res = []
        for pr in profiles:
            alts = copy.deepcopy(spec["base_alternatives"])
            # κάνουμε την alt_better ίδια με την alt_worse σε όλα τα χαρακτηριστικά εκτός από ένα όπου είναι καλύτερη
            worse = next(a for a in alts if a["alt_id"] == d["alt_worse"])
            better = next(a for a in alts if a["alt_id"] == d["alt_better"])
            for k, v in worse.items():
                if k != "alt_id":
                    better[k] = v
            better[d["attr"]] = d["better_value"]
            r = engine.predict_proba(pr, ctx, alts)
            if r["probabilities"] is None:
                res.append(None)
                continue
            # συγκρίνουμε με την ίδια κατάσταση όπου οι δύο είναι πανομοιότυπες (αφαιρεί τις σταθερές ASC)
            alts2 = copy.deepcopy(alts)
            next(a for a in alts2 if a["alt_id"] == d["alt_better"])[d["attr"]] = worse[d["attr"]]
            r2 = engine.predict_proba(pr, ctx, alts2)
            res.append(r["probabilities"][d["alt_better"]] >= r2["probabilities"][d["alt_better"]] - 1e-12)
        out["E_dominance"] = {"status": "PASS" if all(x is True for x in res) else ("NOT_APPLICABLE" if all(x is None for x in res) else "FAIL"),
                              "note": "Η βελτίωση ενός χαρακτηριστικού, με τα υπόλοιπα ίσα, δεν μειώνει την πιθανότητα επιλογής."}
    else:
        out["E_dominance"] = {"status": "NOT_APPLICABLE"}
    a = engine.simulate_panel(profiles, ctx, {"s": spec["base_alternatives"]}, "rep", seed=11)
    b = engine.simulate_panel(profiles, ctx, {"s": spec["base_alternatives"]}, "rep", seed=11)
    same = a == b
    out["F_repeatability"] = {"status": "PASS" if same else "FAIL"}
    return out
