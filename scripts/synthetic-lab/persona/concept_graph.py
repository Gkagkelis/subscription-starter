"""
PHASE4 G4 — Survey Concept Graph: σημασιολογικές συνδέσεις ισοδύναμων ερωτήσεων ΜΕΤΑΞΥ ερευνών → κοινό λανθάνον.

Πρόβλημα (αιτία #7): κάθε μπαταρία κάθε έρευνας έχει δικό της λανθάνον θ_b· η «εμπιστοσύνη στις τράπεζες» της διαΝΕΟσις 2015
και της 2024 δεν συνδέονται στο ίδιο πρόσωπο, άρα οι σχέσεις μεταξύ ερωτήσεων από διαφορετικές πηγές χάνονται.
Γράφος: κόμβοι = μονάδες (μπαταρία factorKey ή μεμονωμένο ordinal item)· ακμή ανάμεσα σε μονάδες ΔΙΑΦΟΡΕΤΙΚΩΝ αρχείων όταν
περιέχουν ισοδύναμες ερωτήσεις: ομοιότητα ερώτησης ≥ 0,85 ΚΑΙ (καμία έχει επιμέρους θέμα ή ομοιότητα θέματος ≥ 0,8) ΚΑΙ
ίδιο πλήθος επιλογών ή ομοιότητα κλίμακας ≥ 0,8· για μπαταρίες απαιτούνται ≥ 2 ισοδύναμα ζεύγη (όχι αλυσίδες από μία σύμπτωση)
και αμοιβαία καλύτερη αντιστοίχιση ανά ζεύγος αρχείων. Πρόσημο από σημασιολογική σύγκριση ετικετών άκρων.
Κοινό λανθάνον ανά συνεκτική συνιστώσα C: θ_b = g·s·C + √(1−g²)·u_b (μπαταρία)· e = g·s·C + √(1−g²)·ε (μεμονωμένο item).
Η φόρτιση g είναι υπερπαράμετρος που επιλέγεται στην ανάπτυξη (R1 συσχετίσεων, διαΝΕΟσις 2022 → έλεγχος 2024).

  python3 scripts/synthetic-lab/persona/concept_graph.py --model-dir <dir> --g 0.8 --out <concepts.json>
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eval_unseen import OptVecs, orientation, scale_sim, split_spec  # noqa: E402


def build(model_dir, root=".", g=0.8, sim_q=0.85, sim_spec=0.8):
    import embed

    items = [i for i in json.load(open(os.path.join(model_dir, "items.json"))) if i["model"]["kind"] == "ordinal"]
    E = embed.Embedder(root)
    OV = OptVecs(E)
    V = E.encode([embed.item_text(i) for i in items])
    specs = [split_spec(i["text"])[1] for i in items]
    us = sorted({s for s in specs if s})
    SV = dict(zip(us, E.encode(us))) if us else {}
    unit = [i.get("factorKey") or i["id"] for i in items]
    files = [i["file"] for i in items]
    S = V @ V.T
    pairs = {}
    for a in range(len(items)):
        for b in np.where(S[a] >= sim_q)[0]:
            if b <= a or files[a] == files[b]:
                continue
            sa, sb = specs[a], specs[b]
            if (sa is None) != (sb is None):
                continue
            if sa and sb and float(SV[sa] @ SV[sb]) < sim_spec:
                continue
            A, B = OV(items[a]), OV(items[b])
            if len(A) == len(B):
                ss, _ = scale_sim(A, B)
                if ss < 0.8:
                    continue
            sg = orientation(A, B)
            key = (unit[a], unit[b]) if unit[a] < unit[b] else (unit[b], unit[a])
            pairs.setdefault(key, []).append((float(S[a, b]), sg, items[a]["id"], items[b]["id"]))
    is_batt = {u: u != i["id"] for u, i in zip(unit, items)}
    # ακμές: ≥2 ζεύγη για μπαταρίες (≥1 αν κάποια μονάδα είναι μεμονωμένο item), συνεπές πρόσημο
    edges = []
    for (u, v), ps in pairs.items():
        need = 2 if (is_batt[u] and is_batt[v]) else 1
        if len(ps) < need:
            continue
        sgs = [p[1] for p in ps]
        if abs(sum(sgs)) < len(sgs) * 0.6:
            continue
        edges.append((u, v, 1 if sum(sgs) > 0 else -1, float(np.mean([p[0] for p in ps])), len(ps)))
    # αμοιβαία καλύτερη ανά (μονάδα, αρχείο του άλλου)
    unit_file = {u: f for u, f in zip(unit, files)}
    best = {}
    for u, v, s, m, n in edges:
        for x, y in ((u, v), (v, u)):
            k = (x, unit_file[y])
            if k not in best or (n, m) > best[k][1]:
                best[k] = (y, (n, m))
    edges = [e for e in edges if best[(e[0], unit_file[e[1]])][0] == e[1] and best[(e[1], unit_file[e[0]])][0] == e[0]]
    # συνιστώσες με προσημασμένο BFS
    adj = {}
    for u, v, s, m, n in edges:
        adj.setdefault(u, []).append((v, s))
        adj.setdefault(v, []).append((u, s))
    comp, sign = {}, {}
    cid = 0
    for r in adj:
        if r in comp:
            continue
        comp[r], sign[r] = cid, 1
        q = [r]
        while q:
            x = q.pop()
            for y, s in adj[x]:
                if y not in comp:
                    comp[y], sign[y] = cid, sign[x] * s
                    q.append(y)
        cid += 1
    units = {u: {"key": f"G4:{comp[u]}", "g": round(g * sign[u], 4)} for u in comp}
    sizes = {}
    for u in comp:
        sizes[comp[u]] = sizes.get(comp[u], 0) + 1
    stats = {"edges": len(edges), "components": cid, "unitsLinked": len(units), "maxComponent": max(sizes.values()) if sizes else 0, "g": g,
             "examples": [{"a": e[0], "b": e[1], "sign": e[2], "sim": round(e[3], 3), "pairs": e[4]} for e in edges[:25]]}
    return {"units": units, "stats": stats}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--g", type=float, default=0.8)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    r = build(a.model_dir, os.path.abspath(a.root), a.g)
    json.dump(r, open(a.out, "w"), ensure_ascii=False, indent=1)
    print(json.dumps(r["stats"], ensure_ascii=False, indent=1)[:2500])
