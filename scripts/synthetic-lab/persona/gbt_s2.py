"""
PHASE5 S2 — πραγματικά νέες συγγενικές ερωτήσεις (η οικογένεια του στόχου κρυμμένη σε ΟΛΕΣ τις χώρες και στην ελληνική βάση).

Παραλλαγές IQGE (ίδια κλειδωμένη κάρτα ταιριάσματος της Phase 4· καμία νέα παράμετρος):
  A    μόνο η ελληνική βάση τεκμηρίων (Phase 4)
  A+   + ελληνικά περιθώρια των διεθνών ερευνών (ελληνικές γραμμές ανάπτυξης) — περισσότερα ελληνικά δεδομένα, όχι ξένη μεταφορά
  C    + items που υπάρχουν ΜΟΝΟ σε άλλες χώρες, με ελληνικό επίπεδο εκτιμημένο από το διεθνές μοντέλο (fold-in R0 χωρίς την έρευνα-στόχο)
Η έρευνα-στόχος αποκλείεται ολόκληρη ως τεκμήριο. Κανένα κλειδωμένο ελληνικό δεδομένο.

  python3 -I scripts/synthetic-lab/persona/gbt_s2.py --root . --rank 3 --lam 10 [--out <json>]
"""
import argparse
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gbt  # noqa: E402
import gbt_eval as GE  # noqa: E402
from eval_unseen import is_demo, label_key, split_spec, stems  # noqa: E402
from iqge_core import IQGE  # noqa: E402

BANK_FILE = {"ess10": "ess10", "ess11": "ess11"}


def extend_lake(G, items, marg):
    """Προσθήκη items στη βάση τεκμηρίων του IQGE (ίδιοι υπολογισμοί χαρακτηριστικών με το iqge_core)."""
    import embed

    items = [b for b in items if 2 <= len(b["options"]) <= 11 and not is_demo(b)]
    G.marg.update(marg)
    G.lake_all = G.lake_all + items
    G.lv = np.vstack([G.lv, G.E.encode([embed.item_text(b) for b in items])])
    G.lq = np.vstack([G.lq, G.E.encode([embed.clean(b["text"]) for b in items])])
    sp = [split_spec(b["text"])[1] for b in items]
    G.spec_l = G.spec_l + sp
    G._encode_specs([x for x in sp if x])
    G.lake_st = G.lake_st + [stems(b["text"]) for b in items]
    G.lake_K = np.concatenate([G.lake_K, [len(b["options"]) for b in items]])
    G.lake_file = np.concatenate([G.lake_file, [b["file"] for b in items]])
    G.lake_fam = np.concatenate([G.lake_fam, [b.get("family") or "" for b in items]])
    G.lake_wave = np.concatenate([G.lake_wave, [b["wave"] for b in items]])
    G.lake_lk = G.lake_lk + [label_key(b["options"]) for b in items]
    G.lake_ids = np.concatenate([G.lake_ids, [b["id"] for b in items]])
    return [b["id"] for b in items]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--model", default="pie-0.4")
    ap.add_argument("--params", default="config/synthetic-lab/persona/iqge/params.json")
    ap.add_argument("--rank", type=int, required=True)
    ap.add_argument("--lam", type=float, required=True)
    ap.add_argument("--out", default=None)
    ap.add_argument("--per-survey", type=int, default=0)
    ap.add_argument("--surveys", default=None)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    gd = gbt.root_dir(root)
    sv, stats, items = GE.load_all(root)
    fams = json.load(open(os.path.join(gd, "families.json")))
    params = json.load(open(os.path.join(root, a.params)))
    G = IQGE(root, os.path.join(root, ".synthetic-lab-data", "persona", "models", a.model), params)
    # διεθνές μοντέλο χωρίς ελληνικές απαντήσεις
    countries, cols, Z, N = gbt.build_matrix(stats, items, use_adj=True)
    gr = countries.index("GR")
    mask_all = ~np.isnan(Z)
    mask_f = mask_all.copy()
    mask_f[gr] = False
    m_, U, V = gbt.als(Z, mask_f, a.rank, a.lam)
    col_of = {}
    for j, c in enumerate(cols):
        col_of.setdefault(c["item"], []).append(j)
    # items διεθνούς βάσης ως τεκμήρια (ελληνικά παρατηρημένα → A+· μόνο ξένα → C)
    gitems, gr_obs, foreign_only = [], set(), set()
    for sid in items:
        if sid in BANK_FILE:
            continue  # ήδη στην ελληνική βάση
        cw = sv[sid].get("wave")
        for it in items[sid]:
            if it["id"] not in stats[sid]["items"] or it.get("excludedFromTransfer"):
                continue
            rec = stats[sid]["items"][it["id"]]
            gw = (sv[sid].get("countries", {}).get("GR") or {}).get("wave") or cw
            gitems.append(dict(it, file=sid, wave=gw or cw, family=f"g:{it['id']}"))
            (gr_obs if "GR" in rec else foreign_only).add(it["id"])
    marg0 = {}
    for sid in items:
        if sid in BANK_FILE:
            continue  # ίδια ids με την ελληνική βάση (άλλη κωδικοποίηση επιλογών)· η βάση κρατά τα δικά της
        for it in items[sid]:
            rec = stats[sid]["items"].get(it["id"], {})
            if "GR" in rec:
                marg0[it["id"]] = {"n": rec["GR"]["n"], "dist": rec["GR"]["p"]}
    # μόνο items με διεθνείς στήλες (μόνο-ξένα) ή με ελληνικό περιθώριο (ελληνικά παρατηρημένα)
    gitems = [g for g in gitems if (g["id"] in gr_obs and g["id"] in marg0) or (g["id"] in foreign_only and g["id"] in col_of)]
    gr_obs &= {g["id"] for g in gitems}
    foreign_only &= {g["id"] for g in gitems}
    gids = extend_lake(G, gitems, marg0)
    gid_set = set(gids)
    meta = {it["id"]: it for it in gitems}
    by_s = {}
    for tid, f in fams.items():
        by_s.setdefault(f["survey"], []).append(tid)
    # σταθερό δείγμα στόχων ανά έρευνα (σειρά hash· καθορίζεται πριν από κάθε αποτέλεσμα S2)
    if a.per_survey:
        by_s = {sid: sorted(t, key=GE.hord)[GE.N_CAL:GE.N_CAL + a.per_survey] for sid, t in by_s.items()}
    if a.surveys:
        keep = set(a.surveys.split(","))
        by_s = {k: v for k, v in by_s.items() if k in keep}
    out = {}
    for sid, tids in by_s.items():
        hide = set()
        for t in [x for x, f_ in fams.items() if f_["survey"] == sid]:
            hide |= set(fams[t]["famGlobal"])
        blocked = {sid} | GE.OVERLAP.get(sid, set())
        vis = np.array([j for j in range(len(cols)) if mask_all[gr, j] and cols[j]["survey"] not in blocked and cols[j]["item"] not in hide], dtype=int)
        u = gbt.fold_in(Z[gr, vis], V[vis], m_[vis], a.lam)
        # ελληνικό επίπεδο για τα μόνο-ξένα items (εκτίμηση C)
        for iid in foreign_only:
            js = col_of.get(iid)
            if not js:
                continue
            it = meta[iid]
            p = gbt.from_cols(m_[js] + V[js] @ u, it["type"], len(it["options"]))
            G.marg[iid] = {"n": 0, "dist": p.tolist()}
        hide_all = set()
        for t in [x for x, f_ in fams.items() if f_["survey"] == sid]:
            hide_all |= set(fams[t]["famGlobal"])
        for t in tids:
            f = fams[t]
            it = next(x for x in items[sid] if x["id"] == t)
            gw = (sv[sid].get("countries", {}).get("GR") or {}).get("wave") or sv[sid].get("wave")
            tt = {"id": t, "var": it["var"], "text": it["text"], "options": it["options"], "type": it["type"], "wave": gw}
            truth = np.array(stats[sid]["items"][t]["GR"]["p"]) * 100
            ex_common = set(f["famBank"]) | set(f["famGlobal"])
            rows = {}
            for name, extra_ex in (("A", gid_set), ("A+", foreign_only), ("C", set())):
                r = G.interpret(tt, gw, exclude_file=BANK_FILE.get(sid), exclude_ids=ex_common | extra_ex, exclude_files=blocked)
                rows[name] = {"mae": round(float(np.mean(np.abs(np.array(r["level"]) * 100 - truth))), 3), "tier": r["tier"], "sim1": r["sim1"],
                              "top": r["evidence"][0]["id"] if r["evidence"] else None, "topForeign": bool(r["evidence"] and r["evidence"][0]["id"] in foreign_only)}
            out[t] = {"survey": sid, "domain": f["domain"], "K": len(it["options"]), "unif": round(float(np.mean(np.abs(100 / len(it["options"]) - truth))), 3), **rows}
        print(sid, len(tids), {k: round(float(np.mean([out[t][k]["mae"] for t in tids])), 2) for k in ("A", "A+", "C")}, flush=True)
    json.dump(out, open(a.out or os.path.join(gd, "s2-dev.json"), "w"))


if __name__ == "__main__":
    main()
