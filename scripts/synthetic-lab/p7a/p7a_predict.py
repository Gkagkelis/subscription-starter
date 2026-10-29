"""
PHASE7A — παγωμένες προβλέψεις για τα ερωτηματολόγια της αναδρομικής τυφλής δοκιμής.

ΤΡΕΧΕΙ ΩΣ ΑΠΟΜΟΝΩΜΕΝΟΣ ΧΡΗΣΤΗΣ p7apred (χωρίς δικαίωμα ανάγνωσης στα sealed/ και keys/):
  runuser -u p7apred -- env HOME=/tmp/p7apred-home SYNTHETIC_LAB_DATA_DIR=/tmp/p7apred-data PATH=/opt/node22/bin:/usr/bin:/bin \
      python3 -I scripts/synthetic-lab/p7a/p7a_predict.py --root .

Είσοδοι (ΜΟΝΟ): .synthetic-lab-data/p7a/questionnaires/*.json (χωρίς αποτελέσματα· ελέγχονται με p7a_seal.py check),
config/synthetic-lab/p7a/mappings.json (αποφάσεις αντιστοίχισης, γραμμένες ΠΡΙΝ από τις απαντήσεις), παγωμένα μοντέλα.
Μέθοδοι:
  pie-0.2        παραγωγική προεπιλογή του PIE, όπως θα λειτουργούσε σήμερα: χωρίς χειροκίνητους συνδέσμους, αυτόματη ερμηνεία
  pie-0.6        χειροκίνητοι σύνδεσμοι (ψήφος, ίδια ερώτηση) + IQGE (ελληνικά συγγενή + αυστηρή διεθνής ισοδυναμία S1)
  pie-0.7        ίδιοι σύνδεσμοι με pie-0.6 + πολιτική τεκμηρίωσης (βαθμίδες, αποχή)
  pie-0.7x       ίδιοι + διεθνής βάση IQGE (S2) και allowExperimental (Tier 4)
  IQGE           το επίπεδο της ερμηνείας IQGE απευθείας (ελληνική βάση) — γραμμή βάσης «μόνο ελληνικά»
  UNIF           ομοιόμορφη στις ουσιαστικές επιλογές
  POLL_AVG       (ψήφος) μέσος των δημοσκοπήσεων του αρχείου με λήξη πεδίου ΠΡΙΝ από την έναρξη της έρευνας-στόχου (14 ημέρες,
                 τελευταία δημοσκόπηση κάθε εταιρείας, ίδιο μέτρο: πρόθεση ή εκτίμηση), ΧΩΡΙΣ την ίδια την έρευνα-στόχο
  PREV_POLLSTER  (ψήφος) η τελευταία προηγούμενη δημοσκόπηση της ίδιας εταιρείας στο αρχείο (ίδιο μέτρο)
"""
import argparse
import glob
import hashlib
import json
import os
import re
import subprocess
import sys
import time

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
P = os.path.join(ROOT, ".synthetic-lab-data", "p7a")
N, SEED = 2000, 20261029
DK_RE = re.compile(r"(δεν ξέρω|δε ξέρω|δξ|δα|δεν απαντ|αρνησ|ξ/ΔΑ|don.?t know|no answer)", re.I)


def sh(cmd, env=None):
    r = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd[:4])}…: {r.stderr[-800:]}")
    return r.stdout


def subst(opts):
    return [o for o in opts if not DK_RE.search(o)]


def poll_baselines(q, qn, mp):
    """Γραμμές βάσης ψήφου από το αρχείο δημοσκοπήσεων (μόνο πριν από την έναρξη πεδίου της έρευνας-στόχου)."""
    import pandas as pd

    T = os.path.join(ROOT, ".synthetic-lab-data", "raw", "political", "tidy")
    pm = pd.read_csv(os.path.join(T, "party_map.csv"), dtype=str)
    lin = dict(zip(pm.party_key, pm.lineage_key.fillna(pm.party_key)))
    p = pd.read_csv(os.path.join(T, "polls_toplines.csv"), dtype=str)
    p = p[(p.poll_type == "poll") & (p.measure == mp["measure"]) & (p.scenario == "0") & (p.election_context == "GR_parl_next") & p.possible_duplicate_of.isna()]
    p["v"] = pd.to_numeric(p.value_pct, errors="coerce")
    p["t"] = pd.to_datetime(p.fieldwork_end, errors="coerce")
    start = pd.Timestamp(q["fieldworkStart"])
    p = p[(p.t < start)].dropna(subset=["v", "t"])
    # αποκλεισμός της ίδιας της έρευνας-στόχου (ίδια εταιρεία, λήξη πεδίου εντός του πεδίου της)
    p = p[~((p.pollster_norm.str.lower() == mp["pollster"].lower()) & (p.t >= start))]
    p["party"] = p.party_key.map(lambda k: lin.get(k, k))
    out = {}

    def to_opts(sub):
        g = sub.groupby("party").v.sum()
        dist = {}
        for opt, keys in mp["optionParties"].items():
            dist[opt] = float(sum(g.get(k, 0.0) for k in keys))
        return dist

    rec = p[p.t >= start - pd.Timedelta(days=14)]
    if len(rec):
        last = rec.sort_values("t").groupby("pollster_norm").poll_id.last()
        dists = [to_opts(rec[rec.poll_id == pid]) for pid in last.values]
        out["POLL_AVG"] = {"dist": {o: float(np.mean([d[o] for d in dists])) for o in dists[0]}, "polls": list(last.values), "n": len(dists)}
    own = p[p.pollster_norm.str.lower() == mp["pollster"].lower()]
    if len(own):
        pid = own.sort_values("t").poll_id.iloc[-1]
        out["PREV_POLLSTER"] = {"dist": to_opts(own[own.poll_id == pid]), "poll": pid, "fieldworkEnd": str(own[own.poll_id == pid].t.iloc[0].date())}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=ROOT)
    a = ap.parse_args()
    assert os.geteuid() != 0, "Η πρόβλεψη πρέπει να τρέχει ως απομονωμένος χρήστης (όχι root)."
    for forbidden in ("sealed", "keys"):
        try:
            os.listdir(os.path.join(P, forbidden))
            sys.exit(f"Απομόνωση αποτυχημένη: ο φάκελος {forbidden} είναι αναγνώσιμος.")
        except PermissionError:
            pass
    mappings = json.load(open(os.path.join(ROOT, "config", "synthetic-lab", "p7a", "mappings.json")))
    W = os.path.join(P, "work")
    env = dict(os.environ)
    tsx = os.path.join(ROOT, "node_modules", ".bin", "tsx")
    out = {"createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "n": N, "seed": SEED, "user": os.getuid(), "surveys": {}}
    out["codeCommit"] = sh(["git", "-C", ROOT, "rev-parse", "HEAD"]).strip() if os.path.exists(os.path.join(ROOT, ".git")) else None
    out["modelHashes"] = {m: hashlib.sha256(open(os.path.join(ROOT, ".synthetic-lab-data", "persona", "models", m, "model.json"), "rb").read()).hexdigest()
                          for m in ("pie-0.2", "pie-0.5", "pie-0.6", "pie-0.7")}
    out["policySha256"] = hashlib.sha256(open(os.path.join(ROOT, "config", "synthetic-lab", "persona", "gpm", "evidence-tiers.json"), "rb").read()).hexdigest()
    for qf in sorted(glob.glob(os.path.join(P, "questionnaires", "*.json"))):
        Q = json.load(open(qf))
        sid = Q["surveyId"]
        mp = mappings.get(sid, {})
        fw = Q["fieldworkStart"][:7]
        y, m = map(int, fw.split("-"))
        qs = []
        for it in Q["questions"]:
            if it.get("excluded"):
                continue
            q = {"id": it["qid"], "type": it["type"], "text": it["text"]}
            if it["type"] == "likert":
                q["scale"] = it["options"]
            else:
                q["options"] = it["options"]
            if it.get("followUpOf"):
                q["followUpOf"] = it["followUpOf"]
            qs.append(q)
        base = {"title": Q.get("title"), "referenceYear": y, "referenceMonth": m, "questions": qs}
        f_plain = os.path.join(W, f"{sid}.plain.json")
        json.dump(base, open(f_plain, "w"), ensure_ascii=False)
        # χειροκίνητοι σύνδεσμοι
        linked = json.loads(json.dumps(base))
        for q in linked["questions"]:
            if q["id"] in mp.get("links", {}):
                q["personaLink"] = mp["links"][q["id"]]
        f_link = os.path.join(W, f"{sid}.linked.json")
        json.dump(linked, open(f_link, "w"), ensure_ascii=False)
        runs = {}
        for tag, extra in (("iqge", []), ("iqgex", ["--international-lake"])):
            fo = os.path.join(W, f"{sid}.{tag}.json")
            sh([sys.executable, "-I", os.path.join(ROOT, "scripts", "synthetic-lab", "persona", "iqge.py"), "--root", ROOT, "--model", "pie-0.5", "--ref", fw,
                "--in", f_link, "--out", fo] + extra, env=env)
            runs[tag] = fo
        res = {}
        for name, plan, model, auto, exp in (("pie-0.2", f_plain, "pie-0.2", "1", "0"), ("pie-0.6", runs["iqge"], "pie-0.6", "1", "0"),
                                              ("pie-0.7", runs["iqge"], "pie-0.7", "1", "0"), ("pie-0.7x", runs["iqgex"], "pie-0.7", "1", "1")):
            fo = os.path.join(W, f"{sid}.{name}.out.json")
            sh([tsx, os.path.join(ROOT, "scripts", "synthetic-lab", "p7a", "p7a_run.ts"), plan, model, auto, exp, str(N), str(SEED), fo], env=env)
            res[name] = json.load(open(fo))
        iq = {x["id"]: x for x in json.load(open(runs["iqge"]))["questions"]}
        iqr = {x["id"]: x for x in json.load(open(runs["iqge"])).get("iqgeReport", {}).get("questions", [])}
        items = []
        for q in qs:
            opts = q.get("options") or q.get("scale")
            rec = {"qid": q["id"], "type": q["type"], "options": opts, "predictions": {}}
            for name, r in res.items():
                x = next(z for z in r["questions"] if z["qid"] == q["id"])
                rec["predictions"][name] = {k: x[k] for k in ("answered", "shares", "support", "tier", "abstain", "expectedMAE", "p90", "responseModel", "iqgeTier", "int80", "reason")}
            g = (iq.get(q["id"]) or {}).get("personaLink", {}) or {}
            if g.get("iqge"):
                lv = g["iqge"]["level"]
                rec["predictions"]["IQGE"] = {"answered": True, "shares": {o: 100 * lv.get(o, 0.0) for o in opts if o in lv}, "tier": g["iqge"]["tier"],
                                              "expectedMAE": g["iqge"]["expectedMAE"], "int80": g["iqge"].get("int80")}
            sub = subst(opts)
            rec["predictions"]["UNIF"] = {"answered": True, "shares": {o: (100 / len(sub) if o in sub else 0.0) for o in opts}}
            if q["id"] in mp.get("pollBaselines", {}):
                for k, v in poll_baselines(Q, q, mp["pollBaselines"][q["id"]]).items():
                    rec["predictions"][k] = {"answered": True, "shares": v["dist"], "meta": {kk: vv for kk, vv in v.items() if kk != "dist"}}
            rec["iqgeReport"] = iqr.get(q["id"])
            items.append(rec)
        out["surveys"][sid] = {"questionnaireSha256": hashlib.sha256(open(qf, "rb").read()).hexdigest(), "items": items,
                               "warnings": {k: v["warnings"] for k, v in res.items()}}
        print(sid, len(items), "ερωτήσεις", flush=True)
    body = json.dumps(out, sort_keys=True, ensure_ascii=False)
    out["lockSha256"] = hashlib.sha256(body.encode()).hexdigest()
    fo = os.path.join(P, "predictions", "predictions.json")
    with open(fo, "x") as f:
        json.dump(out, f, ensure_ascii=False)
    print("κλείδωμα", out["lockSha256"])


if __name__ == "__main__":
    main()
