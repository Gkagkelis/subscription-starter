"""
PHASE4 — τελική επιβεβαίωση στα κλειδωμένα holdouts H1–H7 (PHASE4_PREREGISTRATION §1, §5). ΜΙΑ εκτέλεση.

Φάση Α (predict): για κάθε holdout, ερμηνεία IQGE κάθε ερώτησης ΧΩΡΙΣ ανάγνωση απαντήσεων (μόνο κείμενο/επιλογές από το
          questions.json και δημογραφικός σκελετός για τα πρόσωπα)· βάσεις σύγκρισης B_scale/B_unif/B_pie04 (λεξική σύνδεση,
          αποφάσεις από lex_export.ts). Οι προβλέψεις και οι βαθμίδες γράφονται με sha256 ΠΡΙΝ από τη βαθμολόγηση.
Φάση Β (score): ανάγνωση των πραγματικών στηλών, MAE ανά ερώτηση/βαθμίδα/σύνολο, κάλυψη, κάλυψη 80% διαστήματος,
          ζευγαρωτές διαφορές με 80% bootstrap διάστημα, R1 συσχετίσεων (όπου υπάρχει δημογραφικός σκελετός).

  python3 -I scripts/synthetic-lab/persona/final_holdouts.py --root . --model pie-0.4 --params config/synthetic-lab/persona/iqge/params.json \\
          --lex <lex_holdouts.json> --out .synthetic-lab-data/persona/phase4/final/
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
import pie  # noqa: E402
from eval_unseen import is_demo, latent_score, rank_assign, wdist, wspear  # noqa: E402
from iqge_core import IQGE  # noqa: E402

HOLDOUTS = ["wellcome2020", "tisp", "covidistress", "banksat", "culture", "qog2024", "dinas"]
SKEL = ["age_band", "gender", "edu3", "nuts1", "urban", "weight"]
FALLBACK_WAVE = {"dinas": "2021-06"}  # άγνωστη ημερομηνία πεδίου: συντηρητικά μετά από όλη τη γνωστή δημοσίευση (βλ. meta.json)


def wave_of(meta, hid):
    fw = meta.get("fieldwork")
    s = fw.get("start") if isinstance(fw, dict) else fw
    if isinstance(s, str) and len(s) >= 7 and s[:4].isdigit():
        return s[:7]
    return FALLBACK_WAVE.get(hid, "2023-12")


def boot(d, n=4000, seed=7):
    d = np.asarray(d)
    if len(d) < 3:
        return None
    rng = np.random.default_rng(seed)
    bs = [rng.choice(d, len(d)).mean() for _ in range(n)]
    return [round(float(np.quantile(bs, 0.1)), 3), round(float(np.quantile(bs, 0.9)), 3)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--model", default="pie-0.4")
    ap.add_argument("--params", default="config/synthetic-lab/persona/iqge/params.json")
    ap.add_argument("--lex", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--phase", choices=["predict", "score", "both"], default="both")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    os.makedirs(a.out, exist_ok=True)
    HZ = os.path.join(root, ".synthetic-lab-data", "persona", "harmonized")
    HD = os.path.join(root, ".synthetic-lab-data", "persona", "phase4", "holdouts")
    pred_path = os.path.join(a.out, "predictions.json")
    if a.phase in ("predict", "both"):
        if os.path.exists(pred_path):
            sys.exit("Οι προβλέψεις υπάρχουν ήδη: η τελική εκτέλεση γίνεται ΜΙΑ φορά.")
        params = json.load(open(os.path.join(root, a.params)))
        G = IQGE(root, os.path.join(root, ".synthetic-lab-data", "persona", "models", a.model), params)
        lex = json.load(open(a.lex))
        P = {"createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "model": a.model, "paramsSha256": hashlib.sha256(open(os.path.join(root, a.params), "rb").read()).hexdigest(),
             "holdouts": {}}
        for hid in HOLDOUTS:
            qs = json.load(open(os.path.join(HD, hid, "questions.json")))
            meta = json.load(open(os.path.join(HD, hid, "meta.json")))
            ref = wave_of(meta, hid)
            out = []
            for q in qs:
                b = {"id": q["id"], "var": q.get("variable", ""), "text": q["text"], "options": q["options"], "type": q["type"], "wave": ref}
                if not (2 <= len(q["options"]) <= 11) or is_demo(b):
                    continue
                L = lex.get(q["id"]) or {}
                r = G.interpret(b, ref, exclude_file=hid)
                rec = {"id": q["id"], "K": len(q["options"]), "type": q["type"], "tier": r["tier"], "sim1": r["sim1"], "level": r["level"], "int80": r["int80"],
                       "scale": r["lev"].get("scale"), "scalesoft": r["lev"].get("scalesoft"), "rank": r["rank"], "atten": r["atten"], "scoreSd": r["scoreSd"],
                       "evidence": r["evidence"][:3], "lexConfidence": L.get("confidence")}
                # B_pie04: λεξική σύνδεση του runtime (αποδοχή ≥ κατώφλι) → περιθώριο του item-πηγής στα πρόσωπα του holdout (φάση Β)
                rec["lex"] = {"itemId": L.get("itemId"), "optionMap": L.get("optionMap")} if L.get("accepted") and L.get("itemId") else None
                out.append(rec)
            P["holdouts"][hid] = {"ref": ref, "items": out}
            print(hid, ref, len(out), "ερωτήσεις", {t: sum(1 for x in out if x["tier"] == t) for t in ("paraphrase", "related", "weak")})
        blob = json.dumps(P, sort_keys=True, ensure_ascii=False)
        P["lockSha256"] = hashlib.sha256(blob.encode()).hexdigest()
        json.dump(P, open(pred_path, "w"), ensure_ascii=False, indent=1)
        print("κλείδωμα προβλέψεων:", P["lockSha256"])
    if a.phase in ("score", "both"):
        score(root, HZ, HD, pred_path, a)


def score(root, HZ, HD, pred_path, a):
    P = json.load(open(pred_path))
    model = json.load(open(os.path.join(root, ".synthetic-lab-data", "persona", "models", P["model"], "model.json")))
    items = {i["id"]: i for i in json.load(open(os.path.join(root, ".synthetic-lab-data", "persona", "models", P["model"], "items.json")))}
    rows, assoc = [], []
    for hid, H in P["holdouts"].items():
        real = pie.read_resp(os.path.join(HZ, "resp", f"{hid}.csv.gz"))
        w = real["weight"].values.astype(float) if "weight" in real else np.ones(len(real))
        has_skel = all(c in real for c in ("age_band", "gender"))
        personas = None
        if has_skel:
            skel = real[[c for c in SKEL if c in real]].copy()
            Pp = pie.generate_anchors(model, skel, np.random.default_rng(5150))
            personas = (Pp, pie.feature_columns(Pp))
        # B_pie04 χωρίς δημογραφικά του holdout: πρόσωπα από πραγματικό σκελετό αναφοράς (διαΝΕΟσις 12/2023)
        lexP = personas
        if lexP is None:
            rs_ = pie.read_resp(os.path.join(HZ, "resp", "dn2024a.csv.gz"))
            Pr = pie.generate_anchors(model, rs_[[c for c in SKEL if c in rs_]].copy(), np.random.default_rng(5151))
            lexP = (Pr, pie.feature_columns(Pr))
        syn, enc = {}, {}
        for rec in H["items"]:
            codes = [o["code"] for o in next(q for q in json.load(open(os.path.join(HD, hid, "questions.json"))) if q["id"] == rec["id"])["options"]]
            col = real[rec["id"]].astype(str).where(real[rec["id"]].notna(), None) if rec["id"] in real else None
            if col is None:
                continue
            ok = col.isin(codes).values
            if ok.sum() < 150:
                continue
            truth = wdist(col.values[ok], w[ok], codes) * 100
            K = len(codes)
            m = {"iqge": np.array(rec["level"]) * 100, "unif": np.full(K, 100 / K)}
            base = rec["scale"] or rec["scalesoft"]
            m["scale"] = np.array(base) * 100 if base else None
            m["lex"] = None
            if rec["lex"] and rec["lex"]["itemId"] in items:
                src = items[rec["lex"]["itemId"]]
                from eval_unseen import expected_probs

                pr = np.average(expected_probs(src, lexP[1]), axis=0, weights=lexP[0]["weight"].values)
                sc = [o["code"] for o in src["options"]]
                labs = [o["label"] for o in next(q for q in json.load(open(os.path.join(HD, hid, "questions.json"))) if q["id"] == rec["id"])["options"]]
                dist = np.zeros(K)
                for opt, cs in (rec["lex"]["optionMap"] or {}).items():
                    if opt in labs:
                        for c in cs:
                            if c in sc:
                                dist[labs.index(opt)] += pr[sc.index(c)]
                if dist.sum() > 0:
                    m["lex"] = dist / dist.sum() * 100
            row = {"holdout": hid, "id": rec["id"], "tier": rec["tier"], "K": K, "n": int(ok.sum()), "truth": np.round(truth, 2).tolist()}
            for k, v in m.items():
                row[k] = None if v is None else round(float(np.mean(np.abs(v - truth))), 3)
            if rec["int80"]:
                row["cov80"] = float(np.mean([lo <= t <= hi for (lo, hi), t in zip(rec["int80"], truth)]))
            rows.append(row)
            # συνθετική ατομική απάντηση για R1 (σειρά από λανθάνοντα με εξασθένιση· επίπεδο IQGE)
            if personas is not None and rec["type"] != "nominal":
                Pp, X = personas
                rng = np.random.default_rng(int(hashlib.sha256(rec["id"].encode()).hexdigest()[:8], 16))
                if rec["rank"] and rec["atten"] > 0:
                    s = np.zeros(len(Pp))
                    for rs in rec["rank"]:
                        if rs["itemId"] not in items:
                            continue
                        sc = latent_score(items[rs["itemId"]], Pp, X, rng, model)
                        s += rs["weight"] * rs["sign"] * (sc - rs["mean"]) / rs["sd"]
                    z = rec["atten"] * s / rec["scoreSd"] + np.sqrt(1 - rec["atten"] ** 2) * rng.standard_normal(len(Pp))
                else:
                    z = rng.standard_normal(len(Pp))
                syn[rec["id"]] = rank_assign(z, Pp["weight"].values, np.array(rec["level"])).astype(float)
                enc[rec["id"]] = np.array([codes.index(v) if v in codes else np.nan for v in col.values], dtype=float)
        ids = list(syn)
        errs = []
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                rr = wspear(enc[ids[i]], enc[ids[j]], w)
                rs_ = wspear(syn[ids[i]], syn[ids[j]], w)
                if rr == rr and rs_ == rs_:
                    errs.append((abs(rr - rs_), abs(rr), np.sign(rr) == np.sign(rs_)))
        st = [e for e in errs if e[1] > 0.2]
        assoc.append({"holdout": hid, "pairs": len(errs), "R1": float(np.mean([e[0] for e in errs])) if errs else None,
                      "R1_indep": float(np.mean([e[1] for e in errs])) if errs else None,
                      "R1_strong": float(np.mean([e[0] for e in st])) if st else None, "R1_strong_indep": float(np.mean([e[1] for e in st])) if st else None,
                      "signStrong": float(np.mean([e[2] for e in st])) if st else None, "strongPairs": len(st)})
    df = pd.DataFrame(rows)
    summ = {"lockSha256": P["lockSha256"], "scoredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "nQuestions": len(df), "byTier": {}, "byHoldout": {}, "assoc": assoc}

    def block(d):
        out = {"n": int(len(d))}
        for k in ("iqge", "scale", "lex", "unif"):
            v = d[k].dropna()
            out[k] = {"cov": round(len(v) / max(len(d), 1) * 100, 1), "mean": round(float(v.mean()), 2) if len(v) else None,
                      "median": round(float(v.median()), 2) if len(v) else None, "p90": round(float(v.quantile(0.9)), 2) if len(v) else None}
        for bl in ("lex", "scale", "unif"):
            dd = d.dropna(subset=[bl])
            diff = (dd["iqge"] - dd[bl]).values
            out[f"iqge-{bl}"] = {"n": int(len(dd)), "diff": round(float(diff.mean()), 3) if len(dd) else None, "ci80": boot(diff), "beats": round(float((diff < 0).mean()) * 100, 1) if len(dd) else None}
        if "cov80" in d:
            out["cov80"] = round(float(d["cov80"].dropna().mean()) * 100, 1) if d["cov80"].notna().any() else None
        out["worst"] = d.sort_values("iqge", ascending=False).head(3)[["holdout", "id", "iqge", "scale", "unif"]].to_dict("records")
        return out

    summ["ALL"] = block(df)
    for t in ("paraphrase", "related", "weak"):
        if (df.tier == t).any():
            summ["byTier"][t] = block(df[df.tier == t])
    for h in df.holdout.unique():
        summ["byHoldout"][h] = block(df[df.holdout == h])
    al = summ["ALL"]
    summ["criteria"] = {
        "iqge_better_than_B_pie04_on_common": bool(al["iqge-lex"]["ci80"] is not None and al["iqge-lex"]["ci80"][1] < 0),
        "iqge_better_than_B_scale_on_common": bool(al["iqge-scale"]["ci80"] is not None and al["iqge-scale"]["ci80"][1] < 0),
        "coverage_iqge_gt_B_pie04": bool(al["iqge"]["cov"] > (al["lex"]["cov"] or 0)),
    }
    json.dump({"summary": summ, "rows": rows}, open(os.path.join(a.out, "scores.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps({k: summ[k] for k in ("nQuestions", "criteria")}, ensure_ascii=False, indent=1))
    print(json.dumps(summ["ALL"], ensure_ascii=False, indent=1, default=str)[:3000])


if __name__ == "__main__":
    main()
