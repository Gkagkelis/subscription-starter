"""Έλεγχος διαδρομών skip logic και ικανοποιησιμότητας λογικών περιορισμών (στατικός, χωρίς AI).

* Ερωτήσεις-πύλες = όσες αναφέρονται σε συνθήκες. Απαριθμούνται ΟΛΟΙ οι συνδυασμοί των απαντήσεών τους (μόνο όταν ρωτώνται),
  και για κάθε διαδρομή καταγράφεται ποιες ερωτήσεις τίθενται.
* Για κάθε ερώτηση-στόχο περιορισμού ελέγχεται εξαντλητικά ότι, για ΚΑΘΕ δυνατό συνδυασμό των άλλων ερωτήσεων του
  περιορισμού (μονή επιλογή: όλοι οι κωδικοί· πολλαπλή: όλα τα έγκυρα υποσύνολα), μένει τουλάχιστον μία επιτρεπτή απάντηση.
"""
from __future__ import annotations

import itertools

from . import model as QM


def _subsets(q):
    codes = q.codes
    excl = {o.code for o in q.options if o.exclusive}
    mx = q.max_choices or len(codes)
    out = [[c] for c in excl]
    nonex = [c for c in codes if c not in excl]
    for k in range(max(1, q.min_choices), mx + 1):
        out += [list(s) for s in itertools.combinations(nonex, k)]
    return out


def domain(q):
    if q.type == "multiple_choice":
        return _subsets(q)
    return list(q.codes)


def enumerate_paths(qn) -> dict:
    qs = qn.questions
    gates = sorted({r for q in qs if q.condition for r in QM.condition_refs(q.condition)}, key=[q.id for q in qs].index)
    qby = qn.by_id()
    paths = []

    def walk(i, answers, asked):
        if i == len(qs):
            paths.append({"gates": {g: answers.get(g) for g in gates}, "asked": list(asked)})
            return
        q = qs[i]
        if q.condition and not QM.evaluate_condition(q.condition, answers, {}):
            walk(i + 1, {**answers, q.id: None}, asked)
            return
        if q.id in gates:
            # περιορισμοί που αφορούν ΜΟΝΟ πύλες (οι άλλες ερωτήσεις δεν απαριθμούνται εδώ· ελέγχονται παρακάτω εξαντλητικά)
            known = [c for c in QM.constraints_for(qn, q.id) if set(c["refs"]) <= set(gates)]
            for v in domain(q):
                if known and QM.violated(known, q.id, v, answers, {}):
                    continue
                walk(i + 1, {**answers, q.id: v}, asked + [q.id])
        else:
            walk(i + 1, answers, asked + [q.id])

    walk(0, {}, [])
    distinct = {}
    for p in paths:
        distinct.setdefault(tuple(p["asked"]), []).append(p["gates"])
    asked_count = {q.id: sum(1 for p in paths if q.id in p["asked"]) for q in qs}
    never = [q for q, n in asked_count.items() if n == 0]
    # ικανοποιησιμότητα περιορισμών
    sat = {}
    for target in sorted({c["target"] for c in qn.constraints}, key=[q.id for q in qs].index):
        cons = QM.constraints_for(qn, target)
        others = sorted({r for c in cons for r in c["refs"] if r != target}, key=[q.id for q in qs].index)
        doms = [domain(qby[r]) + [None] for r in others]          # None = δεν ρωτήθηκε
        n_comb, dead, removed_any = 0, [], 0
        for combo in itertools.product(*doms):
            a = dict(zip(others, combo))
            n_comb += 1
            allowed = [v for v in domain(qby[target]) if not QM.violated(cons, target, v, a, {})]
            if len(allowed) < len(domain(qby[target])):
                removed_any += 1
            if not allowed:
                dead.append(a)
        sat[target] = {"constraints": [c["id"] for c in cons], "combinations_checked": n_comb, "combinations_with_removed_options": removed_any,
                       "combinations_without_any_allowed_answer": len(dead), "examples_dead": dead[:3]}
    return {"gates": gates, "gate_combinations": len(paths), "distinct_paths": len(distinct),
            "paths": [{"asked_n": len(k), "skipped": [q.id for q in qs if q.id not in k], "gate_values": v[:4], "n_gate_combinations": len(v)}
                      for k, v in sorted(distinct.items(), key=lambda kv: -len(kv[0]))],
            "asked_on_n_paths": asked_count, "never_asked": never, "constraint_satisfiability": sat,
            "ok": not never and all(v["combinations_without_any_allowed_answer"] == 0 for v in sat.values())}
