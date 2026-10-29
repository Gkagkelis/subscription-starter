"""
PHASE4 (παραδοτέο D) — Survey Concept Graph όλης της βάσης τεκμηρίων.

Κόμβοι:  ερώτηση (item) · έννοια (construct) · τύπος κλίμακας (κανονικοποιημένες ετικέτες) · σύνολο δεδομένων · λανθάνον
         χαρακτηριστικό μοντέλου (μπαταρία factorKey) · μοντέλο.
Ακμές:   item→έννοια, item→κλίμακα, item→σύνολο, item→λανθάνον (αν το item είναι στο μοντέλο), λανθάνον→μοντέλο·
         item↔item «ισοδύναμη» (ομοιότητα ≥ 0,85, συνεπές επιμέρους θέμα, διαφορετικά αρχεία) και «συγγενής» (0,65–0,85)·
         item↔item «συνυπάρχει» = ίδιοι πραγματικοί ερωτώμενοι (ίδιο αρχείο) — η μόνη πηγή από κοινού κατανομών.
Τίποτα δεν επινοείται: οι ακμές ομοιότητας είναι ανακτήσεις υποψηφίων, όχι απόδειξη ίδιας κατανομής.

  python3 scripts/synthetic-lab/persona/survey_concept_graph.py --root . --model pie-0.4 --out .synthetic-lab-data/persona/phase4/concept_graph.json
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eval_unseen import is_demo, label_key, split_spec  # noqa: E402
from iqge_core import p4_lake  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--model", default="pie-0.4")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    import embed

    bank = json.load(open(os.path.join(root, ".synthetic-lab-data/persona/harmonized/item_bank.json")))
    b4, _ = p4_lake(root)
    items = [b for b in bank + b4 if 2 <= len(b["options"]) <= 11 and not is_demo(b)]
    model_items = {i["id"]: i for i in json.load(open(os.path.join(root, ".synthetic-lab-data/persona/models", a.model, "items.json")))}
    E = embed.Embedder(root)
    V = E.encode([embed.item_text(b) for b in items]).astype(np.float32)
    specs = [split_spec(b["text"])[1] for b in items]
    us = sorted({s for s in specs if s})
    SV = dict(zip(us, E.encode(us))) if us else {}
    files = np.array([b["file"] for b in items])
    scale_ids, scales = {}, []
    for b in items:
        k = label_key(b["options"])
        if k not in scale_ids:
            scale_ids[k] = f"scale:{len(scale_ids)}"
            scales.append({"id": scale_ids[k], "labels": [o["label"] for o in b["options"]], "K": len(b["options"])})
    eq, rel = [], []
    for i in range(len(items)):
        s = V[i + 1:] @ V[i]
        for jj in np.where(s >= 0.65)[0]:
            j = i + 1 + int(jj)
            if files[i] == files[j]:
                continue
            sim = float(s[jj])
            si, sj = specs[i], specs[j]
            spec_ok = (si is None and sj is None) or (si and sj and float(SV[si] @ SV[sj]) >= 0.8)
            (eq if sim >= 0.85 and spec_ok else rel).append([items[i]["id"], items[j]["id"], round(sim, 3)])
    nodes = {"items": [{"id": b["id"], "file": b["file"], "wave": b["wave"], "construct": b.get("construct"), "scale": scale_ids[label_key(b["options"])],
                        "trait": (model_items.get(b["id"]) or {}).get("factorKey"), "inModel": b["id"] in model_items, "text": b["text"][:160]} for b in items],
             "scales": scales, "datasets": sorted(set(files.tolist())),
             "constructs": sorted({b.get("construct") or "other" for b in items}),
             "traits": sorted({i.get("factorKey") for i in model_items.values() if i.get("factorKey")})}
    by_file = {}
    for b in items:
        by_file.setdefault(b["file"], 0)
        by_file[b["file"]] += 1
    co_pairs = sum(n * (n - 1) // 2 for n in by_file.values())
    stats = {"items": len(items), "datasets": len(by_file), "scaleTypes": len(scales), "constructs": len(nodes["constructs"]), "traits": len(nodes["traits"]),
             "itemsInModel": sum(1 for b in items if b["id"] in model_items), "equivalentEdges": len(eq), "relatedEdges": len(rel),
             "cooccurrencePairs": co_pairs,
             "itemsWithEquivalentElsewhere": len({x for e in eq for x in e[:2]}),
             "itemsWithOnlyRelated": len({x for e in rel for x in e[:2]} - {x for e in eq for x in e[:2]})}
    json.dump({"stats": stats, "nodes": nodes, "edges": {"equivalent": eq, "related": rel}}, open(a.out, "w"), ensure_ascii=False)
    print(json.dumps(stats, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
