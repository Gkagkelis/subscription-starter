"""
PHASE5 — πακέτο διεθνούς μεταφοράς για το IQGE (εκτός σύνδεσης· διαβάζεται από iqge.py).

Για κάθε item της διεθνούς βάσης (όχι πολιτικά excludedFromTransfer, ≥ 3 ξένες χώρες):
  - ελληνικό περιθώριο: ΠΡΑΓΜΑΤΙΚΟ αν η Ελλάδα απάντησε (ελληνικές γραμμές ανάπτυξης), αλλιώς πρόβλεψη με την κλειδωμένη
    διαμόρφωση gbt-1 (B5|R0: 5 πλησιέστερες χώρες ως προς ΟΛΕΣ τις ορατές ελληνικές απαντήσεις, χωρίς προσαρμογή σύνθεσης)·
  - δεσμευμένες αποκλίσεις υποομάδων (ridit) ως μέσος όλων των χωρών (καλύτερο στο τελικό holdout: −30% σφάλμα έναντι μηδενικών)·
  - 80% διάστημα και αναμενόμενο MAE ανά τομέα (από την ανάπτυξη)· χώρες-πηγές·
  - levelC: ελληνικό επίπεδο της κλειδωμένης παραλλαγής C του S2 (ALS rank 1, λ 10, με προσαρμογή σύνθεσης, fold-in της Ελλάδας
    σε όλες τις ορατές στήλες) — χρησιμοποιείται ΜΟΝΟ ως τεκμήριο συγγενών ερωτήσεων (iqge.py --international-lake).
Οι κλειδωμένες ελληνικές γραμμές ΔΕΝ χρησιμοποιούνται.

  python3 -I scripts/synthetic-lab/persona/gbt_export.py --root .
"""
import argparse
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gbt  # noqa: E402
import gbt_eval as GE  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--config", default="config/synthetic-lab/persona/gbt/final-config.json")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    gd = gbt.root_dir(root)
    cfg = json.load(open(os.path.join(root, a.config)))
    sv, stats, items = GE.load_all(root)
    dom_all = json.load(open(os.path.join(gd, "domains_all.json")))
    countries, cols, Z, N = gbt.build_matrix(stats, items, use_adj=cfg["adj"])
    gr = countries.index("GR")
    foreign = [i for i, c in enumerate(countries) if c != "GR"]
    mask = ~np.isnan(Z)
    vis = np.where(mask[gr])[0]
    d = []
    for i in foreign:
        o = vis[mask[i, vis]]
        if len(o) >= 10:
            d.append((float(np.sqrt(np.mean((Z[i, o] - Z[gr, o]) ** 2))), i))
    d.sort()
    col_of = {}
    for j, c in enumerate(cols):
        col_of.setdefault(c["item"], []).append(j)
    # παραλλαγή C (S2, Τροπ. Γ): διεθνές μοντέλο χωρίς ελληνικές απαντήσεις + fold-in της Ελλάδας
    cC, colsC, ZC, _ = gbt.build_matrix(stats, items, use_adj=True)
    grC = cC.index("GR")
    maskC = ~np.isnan(ZC)
    mf = maskC.copy()
    mf[grC] = False
    mC, _, VC = gbt.als(ZC, mf, cfg["s2"]["rank"], cfg["s2"]["lam"])
    visC = np.where(maskC[grC])[0]
    uC = gbt.fold_in(ZC[grC, visC], VC[visC], mC[visC], cfg["s2"]["lam"])
    colC = {}
    for j, c in enumerate(colsC):
        colC.setdefault(c["item"], []).append(j)
    out = []
    for sid in items:
        for it in items[sid]:
            js = col_of.get(it["id"])
            if not js or it.get("excludedFromTransfer"):
                continue
            K = len(it["options"])
            st = stats[sid]["items"][it["id"]]
            have = {i for i in foreign if all(mask[i, j] for j in js)}
            if len(have) < 3:
                continue
            dom = dom_all.get(it["id"], "SOCIAL")
            if "GR" in st:
                level, basis, nb = np.array(st["GR"]["p"]), "greek_observed", []
                exp_mae = None
                levelC = level
            else:
                nb = [x for x in d if x[1] in have][: cfg["k"]]
                w = np.array([1 / max(x, 0.05) ** 2 for x, _ in nb])
                level = gbt.from_cols(np.average(Z[np.ix_([i for _, i in nb], js)], axis=0, weights=w), it["type"], K)
                basis = "international_transfer"
                exp_mae = cfg["expectedMAE"].get(dom, cfg["expectedMAE"]["ALL"])
                jc = colC[it["id"]]
                levelC = gbt.from_cols(mC[jc] + VC[jc] @ uC, it["type"], K)
            gaps = {}
            for c, r in st.items():
                if c == "GR":
                    continue
                for k, v in r["gaps"].items():
                    gaps.setdefault(k, []).append(v)
            out.append({"id": it["id"], "var": it["var"], "survey": sid, "wave": (sv[sid].get("countries", {}).get("GR") or {}).get("wave") or sv[sid].get("wave"),
                        "text": it["text"], "options": it["options"], "type": it["type"], "domain": dom, "basis": basis,
                        "level": np.round(level, 5).tolist(), "levelC": np.round(levelC, 5).tolist(), "nGR": int(st["GR"]["n"]) if "GR" in st else 0, "q80": cfg["q80"].get(dom, cfg["q80"]["ALL"]), "expectedMAE": exp_mae,
                        "countries": [countries[i] for _, i in nb], "nCountries": len(have),
                        "gaps": {k: round(float(np.mean(v)), 4) for k, v in gaps.items() if len(v) >= 3},
                        "licence": sv[sid].get("licence"), "commercialUse": sv[sid].get("commercialUse")})
    od = os.path.join(gd, "runtime")
    os.makedirs(od, exist_ok=True)
    json.dump({"version": cfg["version"], "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "items": out}, open(os.path.join(od, "gbt-items.json"), "w"))
    import embed

    E = embed.Embedder(root)
    np.save(os.path.join(od, "gbt-items-emb.npy"), E.encode([embed.item_text(x) for x in out]).astype(np.float32))
    print(len(out), "items", sum(1 for x in out if x["basis"] == "greek_observed"), "με πραγματικό ελληνικό περιθώριο")


if __name__ == "__main__":
    main()
