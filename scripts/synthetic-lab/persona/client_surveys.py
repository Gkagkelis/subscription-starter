"""
PHASE4 (P4.4): εκμάθηση από ΠΡΑΓΜΑΤΙΚΕΣ έρευνες πελατών (π.χ. τριμηνιαίες) — ελεγχόμενη, εκτός σύνδεσης, με εκδόσεις.

Καμία αυτόματη επανεκπαίδευση: κάθε βήμα είναι ρητή εντολή, κάθε ενσωμάτωση είναι νέο αμετάβλητο snapshot με δυνατότητα επαναφοράς.

  register   εισαγωγή ερωτηματολογίου (JSON ερωτήσεων) + ανώνυμων απαντήσεων (CSV) + στήλης βάρους + περιόδου + μεθοδολογίας.
             Έλεγχοι: απόρριψη άμεσων αναγνωριστικών (όνομα, email, τηλέφωνο, διεύθυνση, IP, ελεύθερο κείμενο), ελάχιστο n,
             κωδικοί μέσα στις επιλογές, βάρη > 0. Αποθήκευση ΜΟΝΟ στο ιδιωτικό .synthetic-lab-data/persona/client/<id>/.
  evaluate   ΤΥΦΛΗ αξιολόγηση πριν από κάθε ενσωμάτωση: το IQGE ερμηνεύει τις ερωτήσεις ΧΩΡΙΣ να βλέπει τις απαντήσεις (η έρευνα
             δεν είναι ακόμη στο τεκμήριο) και μετά συγκρίνεται με τα πραγματικά σταθμισμένα περιθώρια (MAE, κάλυψη 80%,
             έναντι βάσης κλίμακας και ομοιόμορφης). Το αποτέλεσμα κρατιέται ως μάρτυρας προόδου (learning curve).
  integrate  προσθήκη της έρευνας στο τεκμήριο (επίπεδα για μελλοντικές συγγενείς ερωτήσεις) ως νέο snapshot client-lake-vN.
             Ενεργοποιείται μόνο με --activate· ο προηγούμενος δείκτης κρατιέται για επαναφορά.
  rollback   επαναφορά του ενεργού snapshot σε προηγούμενη έκδοση (κανένα δεδομένο δεν διαγράφεται).
  status     κατάσταση ερευνών, snapshots, καμπύλη μάθησης.

Ο κανόνας εξέλιξης του μοντέλου: τα δεδομένα πελατών δεν αλλάζουν ποτέ σιωπηρά την παραγωγή (pie-0.2)· νέα έκδοση μοντέλου
(αν εκπαιδευτεί) καταχωρείται ως staged με registry.py και εγκρίνεται μόνο από πρόσωπο.

  python3 -I scripts/synthetic-lab/persona/client_surveys.py register --id acme-2027q1 --questions q.json --responses r.csv \\
          --weight w --period 2027-01 --method "CATI, n=1.000, ποσοστώσεις ηλικίας×φύλου×περιφέρειας" --population "Ελλάδα 18+"
  python3 -I scripts/synthetic-lab/persona/client_surveys.py evaluate --id acme-2027q1 --model pie-0.4
  python3 -I scripts/synthetic-lab/persona/client_surveys.py integrate --id acme-2027q1 --activate
  python3 -I scripts/synthetic-lab/persona/client_surveys.py rollback --to client-lake-v1
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ID_RE = re.compile(r"(name|ονομ|email|e-mail|mail|phone|τηλ|κινητ|address|διευθ|οδος|ip_?addr|^ip$|lat|lon|gps|afm|αφμ|amka|αμκα|id_?card|ταυτοτ|comment|σχολ|open|text|free)", re.I)
MIN_N = 100


def cdir(root, sid=None):
    d = os.path.join(root, ".synthetic-lab-data", "persona", "client")
    return os.path.join(d, sid) if sid else d


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def state(root):
    p = os.path.join(cdir(root), "state.json")
    return json.load(open(p)) if os.path.exists(p) else {"surveys": {}, "snapshots": [], "active": None, "log": []}


def save_state(root, st):
    os.makedirs(cdir(root), exist_ok=True)
    json.dump(st, open(os.path.join(cdir(root), "state.json"), "w"), ensure_ascii=False, indent=1)


def register(a, root):
    st = state(root)
    if a.id in st["surveys"]:
        sys.exit(f"Η έρευνα {a.id} υπάρχει ήδη (αμετάβλητη)· χρησιμοποιήστε νέο id.")
    qs = json.load(open(a.questions))
    qs = qs["questions"] if isinstance(qs, dict) else qs
    df = pd.read_csv(a.responses, dtype=str)
    bad = [c for c in df.columns if ID_RE.search(c) and c != a.weight and c not in {q.get("column", q["id"]) for q in qs}]
    if bad:
        sys.exit(f"Πιθανά άμεσα αναγνωριστικά/ελεύθερο κείμενο: {bad}. Αφαιρέστε τα πριν από την εισαγωγή (καμία αποθήκευση).")
    if len(df) < MIN_N:
        sys.exit(f"n={len(df)} < {MIN_N}.")
    w = pd.to_numeric(df[a.weight], errors="coerce") if a.weight else pd.Series(1.0, index=df.index)
    if (w.isna() | (w <= 0)).any():
        sys.exit("Μη έγκυρα βάρη (κενά ή ≤ 0).")
    items, problems = [], []
    out = pd.DataFrame({"weight": (w / w.mean()).round(6)})
    for c in ("age_band", "gender", "edu3", "nuts1", "urban"):
        if c in df:
            out[c] = df[c]
    for q in qs:
        col = q.get("column", q["id"])
        if col not in df:
            problems.append(f"{q['id']}: λείπει η στήλη {col}")
            continue
        opts = q.get("options") or q.get("scale") or []
        codes = {str(i + 1): o for i, o in enumerate(opts)}
        vals = df[col].where(df[col].isin(list(codes) + list(opts)))
        vals = vals.map(lambda v: v if v in codes or v != v else next((k for k, o in codes.items() if o == v), None))
        iid = f"cl_{a.id}::{q['id']}"
        out[iid] = vals
        items.append({"id": iid, "file": f"cl_{a.id}", "wave": a.period, "var": q["id"], "text": q.get("text", ""), "type": q.get("itemType", "ordinal"),
                      "options": [{"code": k, "label": v} for k, v in codes.items()], "dkCode": None, "construct": "other", "family": f"clfam_{a.id}_{q['id']}",
                      "familyWaves": [a.period]})
    d = cdir(root, a.id)
    os.makedirs(d, exist_ok=False)
    out.to_csv(os.path.join(d, "resp.csv.gz"), index=False, compression="gzip")
    json.dump(items, open(os.path.join(d, "items.json"), "w"), ensure_ascii=False, indent=1)
    meta = {"id": a.id, "period": a.period, "method": a.method, "population": a.population, "n": int(len(df)), "nItems": len(items), "problems": problems,
            "registeredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "sha256": {"responses": sha(a.responses), "questions": sha(a.questions)},
            "status": "registered", "licence": a.licence}
    json.dump(meta, open(os.path.join(d, "meta.json"), "w"), ensure_ascii=False, indent=1)
    st["surveys"][a.id] = {"status": "registered", "period": a.period, "n": meta["n"]}
    st["log"].append({"t": meta["registeredAt"], "op": "register", "id": a.id})
    save_state(root, st)
    print(json.dumps(meta, ensure_ascii=False, indent=1))


def evaluate(a, root):
    from eval_unseen import wdist
    from iqge_core import IQGE

    d = cdir(root, a.id)
    meta = json.load(open(os.path.join(d, "meta.json")))
    items = json.load(open(os.path.join(d, "items.json")))
    params = json.load(open(os.path.join(root, a.params)))
    G = IQGE(root, os.path.join(root, ".synthetic-lab-data", "persona", "models", a.model), params)
    # 1) ερμηνεία ΧΩΡΙΣ απαντήσεις (η έρευνα δεν είναι στο ενεργό τεκμήριο)
    preds = {it["id"]: G.interpret(dict(it, wave=meta["period"]), meta["period"], exclude_file=it["file"]) for it in items}
    lock = hashlib.sha256(json.dumps({k: v["level"] for k, v in preds.items()}, sort_keys=True).encode()).hexdigest()
    # 2) βαθμολόγηση
    resp = pd.read_csv(os.path.join(d, "resp.csv.gz"), dtype=str)
    w = resp["weight"].astype(float).values
    rows = []
    for it in items:
        codes = [o["code"] for o in it["options"]]
        v = resp[it["id"]]
        ok = v.isin(codes).values
        if ok.sum() < 50:
            continue
        truth = wdist(v.values[ok], w[ok], codes) * 100
        p = preds[it["id"]]
        lv = np.array(p["level"]) * 100
        base = np.array(p["lev"].get("scale") or p["lev"].get("scalesoft") or np.full(len(codes), 1 / len(codes))) * 100
        rows.append({"item": it["id"], "tier": p["tier"], "MAE": float(np.mean(np.abs(lv - truth))), "MAE_base": float(np.mean(np.abs(base - truth))),
                     "MAE_unif": float(np.mean(np.abs(100 / len(codes) - truth))),
                     "cov80": float(np.mean([a_ <= t <= b_ for (a_, b_), t in zip(p["int80"], truth)])) if p["int80"] else None})
    summ = {"n": len(rows), "MAE": float(np.mean([r["MAE"] for r in rows])) if rows else None, "MAE_base": float(np.mean([r["MAE_base"] for r in rows])) if rows else None,
            "MAE_unif": float(np.mean([r["MAE_unif"] for r in rows])) if rows else None,
            "cov80": float(np.mean([r["cov80"] for r in rows if r["cov80"] is not None])) if rows else None}
    res = {"id": a.id, "model": a.model, "params": a.params, "predictionLock": lock, "evaluatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "summary": summ, "items": rows}
    json.dump(res, open(os.path.join(d, f"eval-{a.model}.json"), "w"), ensure_ascii=False, indent=1)
    st = state(root)
    st["surveys"][a.id]["status"] = "evaluated"
    st["surveys"][a.id].setdefault("evaluations", []).append({"model": a.model, "summary": summ, "lock": lock})
    st["log"].append({"t": res["evaluatedAt"], "op": "evaluate", "id": a.id, "summary": summ})
    save_state(root, st)
    print(json.dumps(summ, ensure_ascii=False, indent=1))


def integrate(a, root):
    st = state(root)
    if a.id not in st["surveys"] or st["surveys"][a.id]["status"] not in ("evaluated", "integrated"):
        sys.exit("Πρώτα evaluate (τυφλή αξιολόγηση πριν από την ενσωμάτωση).")
    prev = next((s for s in st["snapshots"] if s["name"] == st["active"]), None)
    members = sorted(set((prev["members"] if prev else []) + [a.id]))
    name = f"client-lake-v{len(st['snapshots']) + 1}"
    st["snapshots"].append({"name": name, "members": members, "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "parent": st["active"]})
    st["surveys"][a.id]["status"] = "integrated"
    if a.activate:
        st["active"] = name
    st["log"].append({"t": st["snapshots"][-1]["createdAt"], "op": "integrate", "id": a.id, "snapshot": name, "activated": bool(a.activate)})
    save_state(root, st)
    print(f"{name}: {members} ({'ενεργό' if a.activate else 'ανενεργό — ενεργοποίηση με rollback --to ' + name})")


def rollback(a, root):
    st = state(root)
    if a.to not in [s["name"] for s in st["snapshots"]] + ["none"]:
        sys.exit(f"Άγνωστο snapshot {a.to}.")
    st["log"].append({"t": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "op": "rollback", "from": st["active"], "to": a.to})
    st["active"] = None if a.to == "none" else a.to
    save_state(root, st)
    print("ενεργό:", st["active"])


def active_client_lake(root):
    """Για το iqge_core: items + περιθώρια των ερευνών του ενεργού snapshot (κενό αν δεν υπάρχει)."""
    from eval_unseen import wdist

    st = state(root)
    snap = next((s for s in st["snapshots"] if s["name"] == st["active"]), None)
    bank, marg = [], {}
    for sid in snap["members"] if snap else []:
        d = cdir(root, sid)
        items = json.load(open(os.path.join(d, "items.json")))
        resp = pd.read_csv(os.path.join(d, "resp.csv.gz"), dtype=str)
        w = resp["weight"].astype(float).values
        for it in items:
            codes = [o["code"] for o in it["options"]]
            v = resp[it["id"]]
            ok = v.isin(codes).values
            if ok.sum() >= 100:
                bank.append(it)
                marg[it["id"]] = {"n": int(ok.sum()), "dist": wdist(v.values[ok], w[ok], codes).tolist()}
    return bank, marg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("register")
    for k in ("--id", "--questions", "--responses", "--period", "--method"):
        r.add_argument(k, required=True)
    r.add_argument("--weight", default=None)
    r.add_argument("--population", default="")
    r.add_argument("--licence", default="ιδιοκτησία πελάτη· μόνο εσωτερική χρήση")
    e = sub.add_parser("evaluate")
    e.add_argument("--id", required=True)
    e.add_argument("--model", default="pie-0.4")
    e.add_argument("--params", default="config/synthetic-lab/persona/iqge/params.json")
    i = sub.add_parser("integrate")
    i.add_argument("--id", required=True)
    i.add_argument("--activate", action="store_true")
    b = sub.add_parser("rollback")
    b.add_argument("--to", required=True)
    sub.add_parser("status")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    if a.cmd == "status":
        print(json.dumps(state(root), ensure_ascii=False, indent=1))
    else:
        {"register": register, "evaluate": evaluate, "integrate": integrate, "rollback": rollback}[a.cmd](a, root)


if __name__ == "__main__":
    main()
