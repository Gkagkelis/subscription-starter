"""Έλεγχοι ποιότητας και συνέπειας (ASE). Δεν διορθώνουν απαντήσεις· καταγράφουν και επισημαίνουν.
Οι έλεγχοι συνέπειας δεν αποδεικνύουν από μόνοι τους πραγματική προβλεπτική εγκυρότητα."""
from __future__ import annotations

import json
from collections import Counter

import numpy as np
import pandas as pd

from ..questionnaire import model as QM
from ..util import read_json, read_table


def _tvd(a: dict, b: dict) -> float:
    keys = set(a) | set(b)
    sa, sb = sum(a.values()) or 1, sum(b.values()) or 1
    return 0.5 * sum(abs(a.get(k, 0) / sa - b.get(k, 0) / sb) for k in keys)


def _dist(sub):
    out = Counter()
    for r in sub["response"]:
        v = json.loads(r)
        for x in (v if isinstance(v, list) else [v]):
            out[str(x)] += 1
    return out


def run_qc(study, run_id) -> dict:
    df = study.responses(run_id)
    df["validation_ok"] = df["validation_ok"].astype(str).isin(["True", "true", "1"])
    status = read_json(study.internal / "runs" / run_id / "respondent_status.json")
    man = read_json(study.internal / "runs" / run_id / "execution_manifest.json")
    resp = read_table(study.internal / "respondents")
    qn = study.qn
    qby = qn.by_id()
    checks, flags = [], []

    def add(name, ok, detail, warn=False):
        checks.append({"check": name, "status": "PASS" if ok else ("WARN" if warn else "FAIL"), "detail": detail})

    ans = df[df["status"] == "ANSWERED"]
    bad = df[(df["status"] == "ANSWERED") & (~df["validation_ok"])]
    add("Έγκυρες απαντήσεις ανά τύπο", len(bad) == 0 and (df["status"] != "ERROR").all(),
        f"{len(ans)} απαντήσεις, {int((df['status'] == 'ERROR').sum())} σφάλματα, {len(bad)} μη έγκυρες", warn=(df["status"] == "ERROR").any() and len(bad) == 0)
    # skip logic: επανυπολογισμός συνθηκών από τις απαντήσεις
    prof = resp.set_index("respondent_id").to_dict("index")
    viol = 0
    for rid, g in df.groupby("respondent_id"):
        answers = {}
        for r in g.itertuples():
            q = qby[r.question_id]
            should = QM.evaluate_condition(q.condition, answers, {**prof.get(rid, {}), "respondent_id": rid})
            if should != (r.status != "SKIPPED"):
                viol += 1
            answers[r.question_id] = json.loads(r.response) if r.response else None
    add("Σωστή εφαρμογή skip logic", viol == 0, f"{viol} παραβιάσεις")
    req = man["respondents_requested"]
    missing = req - len(status)
    add("Μηδενικά χαμένα respondent IDs", missing == 0 and set(df["respondent_id"]) <= set(resp["respondent_id"]), f"ζητήθηκαν {req}, ολοκληρώθηκαν {len(status)}")
    dup = int(df.duplicated(["respondent_id", "question_id"]).sum())
    add("Διπλοεγγραφές", dup == 0, f"{dup} διπλές (respondent, question)")
    pr = read_json(study.internal / "panel_report.json")
    add("Δημογραφικές quotas πάνελ", pr["all_within_tolerance"], f"μέγιστη απόκλιση {pr['max_abs_deviation_pp']} μον. (ανοχή {pr['tolerance_pp']})")
    # αντιφατικές απαντήσεις (κανόνες του ερωτηματολογίου)
    rules = qn.meta.get("consistency_rules") or []
    contra = Counter()
    if rules:
        for rid, g in ans.groupby("respondent_id"):
            a = {r.question_id: json.loads(r.response) for r in g.itertuples()}
            for rule in rules:
                try:
                    if all(k in a for k in QM.condition_refs(rule["when"])) and QM.evaluate_condition(rule["when"], a, {}):
                        contra[rule["id"]] += 1
                except Exception:
                    pass
    nres = max(1, ans["respondent_id"].nunique())
    worst = max(contra.values(), default=0) / nres
    add("Αντιφατικές απαντήσεις", worst <= 0.10, f"{len(rules)} κανόνες· {dict(contra)}" if rules else "δεν ορίστηκαν κανόνες συνέπειας", warn=True)
    if worst > 0.10:
        flags.append(f"Υψηλό ποσοστό αντιφάσεων: {dict(contra)}")
    # υπερβολικά ομοιόμορφες απαντήσεις
    uni = []
    for qid, g in ans.groupby("question_id"):
        q = qby[qid]
        if q.type in ("single_choice", "likert", "scenario", "dce") and len(g) >= 10:
            d = _dist(g)
            top = max(d.values()) / sum(d.values())
            if top > 0.95:
                uni.append(f"{qid}: {top:.0%} στην ίδια επιλογή")
    likert = [q.id for q in qn.questions if q.type == "likert"]
    sl = 0
    if len(likert) >= 5:
        for rid, g in ans[ans["question_id"].isin(likert)].groupby("respondent_id"):
            if len(g) >= 5 and g["response"].nunique() == 1:
                sl += 1
    add("Υπερβολικά ομοιόμορφες απαντήσεις", not uni and sl / nres <= 0.10, f"{uni or 'καμία ερώτηση >95%'}; straight-lining Likert: {sl}/{nres}", warn=True)
    flags += uni
    # ευαισθησία σεναρίων: ερωτήσεις ίδιας sensitivity_group με διαφορετικές παραλλαγές
    groups = {}
    for q in qn.questions:
        sg = q.raw.get("sensitivity_group")
        if sg:
            groups.setdefault(sg, []).append(q.id)
    sens = {}
    for sg, ids in groups.items():
        ds = {i: _dist(ans[ans["question_id"] == i]) for i in ids if (ans["question_id"] == i).any()}
        pairs = [(a, b) for k, a in enumerate(ds) for b in list(ds)[k + 1:]]
        sens[sg] = {f"{a}~{b}": round(_tvd(ds[a], ds[b]), 3) for a, b in pairs}
    insens = [f"{g}:{p}" for g, v in sens.items() for p, t in v.items() if t < 0.02]
    add("Ευαισθησία σε αλλαγές σεναρίων", not insens, f"TVD ανά ζεύγος: {sens}" if sens else "καμία ομάδα σεναρίων στο ερωτηματολόγιο", warn=True)
    flags += [f"Μη ευαίσθητο ζεύγος σεναρίων: {x}" for x in insens]
    # επαναληψιμότητα και διαφορές παρόχων: σύγκριση με άλλες εκτελέσεις της ίδιας μελέτης
    rep, provs = {}, {}
    runs = study.internal / "runs"
    for d in sorted(runs.iterdir()):
        if d.name == run_id or not (d / "execution_manifest.json").exists():
            continue
        try:
            other = read_table(d / "individual_responses")
        except FileNotFoundError:
            continue
        m2 = read_json(d / "model_provenance.json")
        merged = df.merge(other, on=["respondent_id", "question_id"], suffixes=("", "_o"))
        merged = merged[(merged["status"] == "ANSWERED") & (merged["status_o"] == "ANSWERED")]
        if merged.empty:
            continue
        same = float((merged["response"] == merged["response_o"]).mean())
        key = f"{d.name} ({m2['provider']['provider']}/{m2['provider']['model']})"
        if m2["provider"]["provider"] == read_json(runs / run_id / "model_provenance.json")["provider"]["provider"]:
            rep[key] = round(same, 3)
        else:
            tv = [ _tvd(_dist(merged[merged["question_id"] == q][["response"]]), _dist(merged[merged["question_id"] == q][["response_o"]].rename(columns={"response_o": "response"})))
                   for q in merged["question_id"].unique()]
            provs[key] = {"exact_agreement": round(same, 3), "mean_tvd": round(float(np.mean(tv)), 3)}
    add("Επαναληψιμότητα (ίδιος πάροχος, ίδιο seed)", all(v >= 0.999 for v in rep.values()) if rep else True,
        f"ταύτιση απαντήσεων: {rep}" if rep else "δεν υπάρχει άλλη εκτέλεση για σύγκριση", warn=True)
    add("Διαφορές μεταξύ LLM providers", True, provs or "μόνο ένας πάροχος", warn=False)
    # μη αντιγραφή ποσοστών αναφοράς (π.χ. Brand Intelligence)
    refs = study.cfg.get("reference_distributions") or []
    hits = []
    for ref in refs:
        for qid in ref.get("questions") or ans["question_id"].unique():
            g = ans[ans["question_id"] == qid]
            if g.empty:
                continue
            d = _dist(g)
            tot = sum(d.values())
            for code, c in d.items():
                if abs(100 * c / tot - float(ref["pct"])) <= float(ref.get("tolerance_pp", 1.0)):
                    hits.append(f"{qid}[{code}]≈{ref['label']} ({ref['pct']}%)")
    add("Μη αντιγραφή ποσοστών Brand Intelligence", len(hits) <= len(refs), f"{len(refs)} αναφορές· συμπτώσεις: {hits}" if refs else
        "Δεν δόθηκαν ποσοστά αναφοράς (η αναφορά Brand Intelligence δεν βρέθηκε στο repository)", warn=True)
    if hits:
        flags.append(f"Συμπτώσεις με ποσοστά αναφοράς (ελέγξτε): {hits}")
    # ανεπαρκής εμπειρική στήριξη
    sup = ans["empirical_support"].value_counts().to_dict()
    add("Εμπειρική στήριξη απαντήσεων", True, sup)
    if sup.get("NONE", 0):
        flags.append(f"{sup.get('NONE', 0)} απαντήσεις χωρίς συναφή τεκμηρίωση στο ερευνητικό πλαίσιο (μόνο LLM).")
    if read_json(runs / run_id / "model_provenance.json").get("mock"):
        flags.append("MOCK PROVIDER: τα αποτελέσματα δεν έχουν ερευνητική αξία· μόνο δοκιμή υποδομής.")
    return {"run_id": run_id, "checks": checks, "flags": flags, "note": "Οι έλεγχοι συνέπειας δεν αποτελούν από μόνοι τους απόδειξη προβλεπτικής εγκυρότητας."}
