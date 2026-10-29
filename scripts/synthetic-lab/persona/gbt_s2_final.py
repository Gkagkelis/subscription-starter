"""
PHASE5 S2 — τελική επιβεβαίωση (νέες συγγενικές ερωτήσεις) στα κλειδωμένα ελληνικά holdouts F1–F3. ΜΙΑ εκτέλεση.

Στόχοι: σταθερό δείγμα έως 30 items ανά κλειδωμένη έρευνα (σειρά hash). Η οικογένεια κάθε στόχου κρύβεται σε ΟΛΕΣ τις χώρες και
στην ελληνική βάση· η ίδια η έρευνα αποκλείεται ως τεκμήριο. Παραλλαγές IQGE: A (ελληνική βάση), A+ (+ ελληνικά περιθώρια διεθνών
ερευνών ανάπτυξης), C (+ μόνο-ξένα items με ελληνικό επίπεδο από το διεθνές μοντέλο). Φάση Α: προβλέψεις με sha256· Φάση Β: βαθμολόγηση.

  python3 -I scripts/synthetic-lab/persona/gbt_s2_final.py --root . --phase predict --rank 1 --lam 10
  python3 -I scripts/synthetic-lab/persona/gbt_s2_final.py --root . --phase score
"""
import argparse
import hashlib
import json
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gbt  # noqa: E402
import gbt_eval as GE  # noqa: E402
from gbt_final import FINAL, families_for  # noqa: E402
from gbt_s2 import BANK_FILE, extend_lake  # noqa: E402
from iqge_core import IQGE  # noqa: E402

PER = 30


def predict(root, a):
    gd = gbt.root_dir(root)
    sv, stats, items = GE.load_all(root)
    sids = [s for s in FINAL if s in stats and (not a.surveys or s in a.surveys.split(","))]
    fams = families_for(root, set(sids), items, sv)
    G = IQGE(root, os.path.join(root, ".synthetic-lab-data", "persona", "models", "pie-0.4"), json.load(open(os.path.join(root, "config/synthetic-lab/persona/iqge/params.json"))))
    countries, cols, Z, N = gbt.build_matrix(stats, items, use_adj=True)
    gr = countries.index("GR")
    mask_all = ~np.isnan(Z)
    mask_f = mask_all.copy()
    mask_f[gr] = False
    m_, U, V = gbt.als(Z, mask_f, a.rank, a.lam)
    col_of = {}
    for j, c in enumerate(cols):
        col_of.setdefault(c["item"], []).append(j)
    gitems, gr_obs, foreign_only = [], set(), set()
    marg0 = {}
    for sid in items:
        if sid in BANK_FILE:
            continue
        for it in items[sid]:
            rec = stats[sid]["items"].get(it["id"])
            if not rec or it.get("excludedFromTransfer"):
                continue
            gw = (sv[sid].get("countries", {}).get("GR") or {}).get("wave") or sv[sid].get("wave")
            if "GR" in rec:
                gr_obs.add(it["id"])
                marg0[it["id"]] = {"n": rec["GR"]["n"], "dist": rec["GR"]["p"]}
            elif it["id"] in col_of:
                foreign_only.add(it["id"])
            else:
                continue
            gitems.append(dict(it, file=sid, wave=gw, family=f"g:{it['id']}"))
    gids = set(extend_lake(G, gitems, marg0))
    meta = {g["id"]: g for g in gitems}
    P = {"createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "rank": a.rank, "lam": a.lam, "surveys": {}}
    for sid in sids:
        tids = sorted([it["id"] for it in items[sid] if not it.get("excludedFromTransfer")],
                      key=lambda x: hashlib.sha256(x.encode()).hexdigest())[:PER]
        hide = set()
        for it in items[sid]:
            hide |= set(fams.get(it["id"], {}).get("famGlobal", []))
        vis = np.array([j for j in range(len(cols)) if mask_all[gr, j] and cols[j]["item"] not in hide], dtype=int)
        u = gbt.fold_in(Z[gr, vis], V[vis], m_[vis], a.lam)
        for iid in foreign_only:
            js = col_of[iid]
            it = meta[iid]
            G.marg[iid] = {"n": 0, "dist": gbt.from_cols(m_[js] + V[js] @ u, it["type"], len(it["options"])).tolist()}
        gw = (sv[sid].get("countries", {}).get("GR") or {}).get("wave") or sv[sid].get("wave")
        recs = []
        for tid in tids:
            it = next(x for x in items[sid] if x["id"] == tid)
            f = fams.get(tid, {})
            ex = set(f.get("famBank", [])) | set(f.get("famGlobal", []))
            tt = {"id": tid, "var": it["var"], "text": it["text"], "options": it["options"], "type": it["type"], "wave": gw}
            row = {"item": tid, "K": len(it["options"])}
            for name, extra in (("A", gids), ("A+", foreign_only), ("C", set())):
                r = G.interpret(tt, gw, exclude_ids=ex | extra, exclude_files={sid})
                row[name] = np.round(np.array(r["level"]) * 100, 3).tolist()
            recs.append(row)
        P["surveys"][sid] = {"holdout": FINAL[sid], "items": recs}
        print(sid, len(recs), flush=True)
    json.dump(P, open(os.path.join(gd, f"s2-predictions-final.part{a.part}.json"), "x"))
    print("μέρος", a.part, "έτοιμο")


def merge(root, a):
    """Ένωση των μερών και κλείδωμα (sha256) ΠΡΙΝ από τη βαθμολόγηση."""
    gd = gbt.root_dir(root)
    P = {"surveys": {}}
    for f in sorted(os.listdir(gd)):
        if f.startswith("s2-predictions-final.part"):
            q = json.load(open(os.path.join(gd, f)))
            P["surveys"].update(q["surveys"])
            P["rank"], P["lam"] = q["rank"], q["lam"]
    P["createdAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    P["lockSha256"] = hashlib.sha256(json.dumps(P, sort_keys=True).encode()).hexdigest()
    json.dump(P, open(os.path.join(gd, "s2-predictions-final.json"), "x"))
    print(len(P["surveys"]), "έρευνες· κλείδωμα:", P["lockSha256"])


def score(root, a):
    gd = gbt.root_dir(root)
    P = json.load(open(os.path.join(gd, "s2-predictions-final.json")))
    rows = []
    for sid, S in P["surveys"].items():
        df = pd.read_csv(os.path.join(gd, "locked", f"{sid}.GR.csv.gz"), dtype=str, keep_default_na=False, na_values=[""])
        w = pd.to_numeric(df["weight"], errors="coerce").fillna(1.0).values
        its = {it["id"]: it for it in gbt.load_items(root, sid)}
        for r in S["items"]:
            codes = [o["code"] for o in its[r["item"]]["options"]]
            if r["item"] not in df:
                continue
            v = df[r["item"]]
            ok = v.isin(codes).values
            if ok.sum() < 150:
                continue
            truth = gbt.wdist(v.values[ok], w[ok], codes) * 100
            rows.append({"holdout": S["holdout"], "survey": sid, "item": r["item"], **{m: float(np.mean(np.abs(np.array(r[m]) - truth))) for m in ("A", "A+", "C")},
                         "unif": float(np.mean(np.abs(100 / r["K"] - truth)))})
    d = pd.DataFrame(rows)

    def ci(x, cl):
        rng = np.random.default_rng(9)
        u = np.unique(cl)
        idx = {c: np.where(cl == c)[0] for c in u}
        bs = [np.concatenate([x[idx[c]] for c in rng.choice(u, len(u))]).mean() for _ in range(4000)]
        return [round(float(np.quantile(bs, 0.1)), 3), round(float(np.quantile(bs, 0.9)), 3)]

    out = {"lockSha256": P["lockSha256"], "n": int(len(d)), "means": {m: round(float(d[m].mean()), 2) for m in ("A", "A+", "C", "unif")}}
    for m in ("A+", "C"):
        x = (d[m] - d["A"]).values
        out[f"{m}-A"] = {"diff": round(float(x.mean()), 3), "ci80": ci(x, d.holdout.values), "beats": round(float((x < 0).mean()) * 100, 1)}
    per = []
    for h in sorted(d.holdout.unique()):
        q = d[d.holdout == h]
        x = (q["C"] - q["A"]).values
        rng = np.random.default_rng(3)
        bs = [rng.choice(x, len(x)).mean() for _ in range(4000)]
        per.append({"holdout": h, "n": int(len(q)), "A": round(float(q["A"].mean()), 2), "A+": round(float(q["A+"].mean()), 2), "C": round(float(q["C"].mean()), 2),
                    "unif": round(float(q["unif"].mean()), 2), "C-A": round(float(x.mean()), 3), "ci80": [round(float(np.quantile(bs, 0.1)), 3), round(float(np.quantile(bs, 0.9)), 3)]})
    out["perHoldout"] = per
    out["criteria"] = {"S2_C_vs_A_ge1pp_in_ge2_holdouts": sum(1 for p in per if p["C-A"] <= -1.0 and p["ci80"][1] < 0) >= 2}
    json.dump({"summary": out, "rows": rows}, open(os.path.join(gd, "s2-scores-final.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--phase", choices=["predict", "merge", "score"], required=True)
    ap.add_argument("--surveys", default=None)
    ap.add_argument("--part", default="0")
    ap.add_argument("--rank", type=int, default=1)
    ap.add_argument("--lam", type=float, default=10.0)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    {"predict": predict, "merge": merge, "score": score}[a.phase](root, a)


if __name__ == "__main__":
    main()
