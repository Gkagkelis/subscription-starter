"""
PHASE4: benchmark γενίκευσης σε ΝΕΕΣ ερωτήσεις (PHASE4_PREREGISTRATION §1–§5).

Για κάθε ερώτηση-στόχο T ενός αρχείου-στόχου F (πραγματικοί ερωτώμενοι):
  - τα τεκμήρια είναι τα items ενός μοντέλου εκπαιδευμένου ΠΡΙΝ από το F (το F δεν υπάρχει στα τεκμήρια)·
  - η οικογένεια της T κρύβεται από όλα τα τεκμήρια (leave-one-family-out), εκτός αν mode=seen·
  - τα πρόσωπα παράγονται από τον δημογραφικό σκελετό του F· οι πραγματικές απαντήσεις διαβάζονται μόνο στη βαθμολόγηση.
Μέθοδοι:
  crude   ο παλιός αντιστοιχιστής μεταφοράς (ίδια έννοια/Κ/Jaccard) — B_crude
  lex     λεξική αυτόματη σύνδεση του runtime pie-0.4 (autolink-1, αποφάσεις από το TS) — B_pie04
  scale   μόνο επίπεδο από ίδιο τύπο κλίμακας (μέση κατανομή items με ίδιες ετικέτες), ανεξάρτητες απαντήσεις — B_scale
  unif    ομοιόμορφη
  sem     G1: πολυγλωσσική σημασιολογική ανάκτηση + σειρά προσώπων από το λανθάνον του τεκμηρίου· επίπεδο = τεκμήριο (ίδιο Κ) ή B_scale
  semlev  G2: όπως sem, επίπεδο = w_tier·τεκμήριο + (1−w_tier)·B_scale (w από αρχείο βαρών, μάθηση σε άλλο αρχείο ανάπτυξης)
  semens  G3: όπως semlev, σειρά από σταθμισμένο άθροισμα των k πρώτων τεκμηρίων

  python3 scripts/synthetic-lab/persona/eval_unseen.py --root . --model-dir <dir> --files dn2024a,dn2024b,dn2024c --ref 2023-12 --out <json>
"""
import argparse
import json
import math
import os
import re
import sys
import unicodedata

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import pie  # noqa: E402

HZ = None
SKEL = ["age_band", "gender", "edu3", "nuts1", "urban", "weight"]


def nrm(s):
    s = unicodedata.normalize("NFD", str(s).lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("ς", "σ")
    s = re.sub(r"^\s*\d+\s*[.)]?\s*", "", s)
    return re.sub(r"[^\w ]+", " ", re.sub(r"\s+", " ", s)).strip()


def label_key(options):
    return tuple(nrm(o["label"]) for o in options)


def wdist(vals, w, codes):
    d = np.array([w[vals == c].sum() for c in codes], dtype=float)
    return d / d.sum() if d.sum() > 0 else np.full(len(codes), np.nan)


def ridit(x, w):
    out = np.full(len(x), np.nan)
    ok = ~np.isnan(x)
    if not ok.any():
        return out
    tot, cum = w[ok].sum(), 0.0
    for v in np.unique(x[ok]):
        m = ok & (x == v)
        p = w[m].sum() / tot
        out[m] = cum + p / 2
        cum += p
    return out


def wspear(a, b, w):
    ok = ~np.isnan(a) & ~np.isnan(b)
    if ok.sum() < 100:
        return np.nan
    ra, rb = ridit(a[ok], w[ok]), ridit(b[ok], w[ok])
    ww = w[ok]
    ma, mb = np.average(ra, weights=ww), np.average(rb, weights=ww)
    cov = np.average((ra - ma) * (rb - mb), weights=ww)
    sa, sb = math.sqrt(np.average((ra - ma) ** 2, weights=ww)), math.sqrt(np.average((rb - mb) ** 2, weights=ww))
    return cov / (sa * sb) if sa > 0 and sb > 0 else np.nan


# ------------------------------------------------------------------ λανθάνουσα βαθμολογία ενός τεκμηρίου για κάθε πρόσωπο
CONCEPTS = {}


def latent_score(item, P, X, rng, model):
    """y* = η + e (ordinal, ίδια λογική με pie.answer_item)· για nominal: None. Με G4 (CONCEPTS): κοινό λανθάνον μεταξύ ερευνών."""
    if item["model"]["kind"] != "ordinal":
        return None
    Z, _ = pie.design(X, item["feats"], np.array(item["means"]))
    eta = Z @ np.array(item["model"]["b"])
    lam = float(item.get("lambda", 0.0))
    n = len(P)
    ck = CONCEPTS.get(item.get("factorKey") or item["id"])
    if item.get("factorKey") and lam != 0:
        th = pie.theta(P, item["factorKey"])
        if ck:
            th = ck["g"] * pie.theta(P, ck["key"]) + math.sqrt(max(1 - ck["g"] ** 2, 0.0)) * th
        e = lam * th + math.sqrt(max(1 - lam * lam, 0.0)) * rng.standard_normal(n)
    elif ck:
        e = ck["g"] * pie.theta(P, ck["key"]) + math.sqrt(max(1 - ck["g"] ** 2, 0.0)) * rng.standard_normal(n)
    else:
        e = rng.standard_normal(n)
    return eta + e


def expected_probs(item, X):
    Z, _ = pie.design(X, item["feats"], np.array(item["means"]))
    if item["model"]["kind"] == "ordinal":
        return pie.ordinal_probs(Z, {"b": np.array(item["model"]["b"]), "tau": np.array(item["model"]["tau"])})
    return pie.mnl_probs(Z, {"a": np.array(item["model"]["a"]), "B": np.array(item["model"]["B"])})


def rank_assign(score, w, p):
    """Κατηγορία ανά πρόσωπο: τομή της σταθμισμένης σειράς του score στις αθροιστικές πιθανότητες p (comonotone)."""
    order = np.argsort(score, kind="stable")
    cw = np.cumsum(w[order]) / w.sum()
    cuts = np.cumsum(p)[:-1]
    cat = np.searchsorted(cuts, cw, side="left")
    out = np.empty(len(score), dtype=int)
    out[order] = np.minimum(cat, len(p) - 1)
    return out


def orientation(Et_opts, Es_opts):
    """+1 αν το «υψηλό» άκρο του τεκμηρίου αντιστοιχεί στο «υψηλό» της ερώτησης (σημασιολογική σύγκριση ετικετών άκρων), αλλιώς −1."""
    a = Et_opts[0] @ Es_opts[0] + Et_opts[-1] @ Es_opts[-1]
    b = Et_opts[0] @ Es_opts[-1] + Et_opts[-1] @ Es_opts[0]
    return 1 if a >= b else -1


DEMO_RE = re.compile(r"^(nuts\d?|age|gender|sex|edu\w*|region|urban|weight)$|ηλικια|φυλο|nuts|περιοχη κατοικιασ|εκπαιδευσ|επιπεδο σπουδων|ποσα παιδια|εχετε παιδια")


def is_demo(b):
    return bool(DEMO_RE.search(b["var"].lower()) or DEMO_RE.search(nrm(b["text"])))


def lake_marginals(root, bank):
    """Σταθμισμένα περιθώρια όλων των items της βάσης (από τα αρχεία ερωτώμενων)· κρύπτη στο ιδιωτικό phase4/."""
    p = os.path.join(root, ".synthetic-lab-data", "persona", "phase4", "lake_marginals.json")
    if os.path.exists(p):
        return json.load(open(p))
    out, by_file = {}, {}
    for b in bank:
        by_file.setdefault(b["file"], []).append(b)
    for f, its in by_file.items():
        real = pie.read_resp(os.path.join(HZ, "resp", f"{f}.csv.gz"))
        w = real["weight"].values.astype(float) if "weight" in real else np.ones(len(real))
        w = np.where(np.isfinite(w) & (w > 0), w, 0.0)
        for b in its:
            if b["id"] not in real:
                continue
            codes = [o["code"] for o in b["options"]]
            rc = real[b["id"]].astype(str).where(real[b["id"]].notna(), None)
            ok = rc.isin(codes).values & (w > 0)
            if ok.sum() < 100:
                continue
            out[b["id"]] = {"n": int(ok.sum()), "dist": wdist(rc.values[ok], w[ok], codes).tolist()}
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(out, open(p, "w"))
    return out


SPEC_RES = [re.compile(r"^\s*\[([^\]]+)\]"), re.compile(r"^\s*\d+(?:\.\d+)+\.?\s*(.+?)\s+-\s+"), re.compile(r"αναφερει: «([^»]+)»"),
             re.compile(r"«([^»]{3,80})»\s*$"), re.compile(r"(?:παρακάτω|following)[^,]{0,140},\s*([^,?;]{3,60})\s*$")]


def split_spec(text):
    """(εισαγωγή, επιμέρους θέμα) μιας ερώτησης-μπαταρίας· θέμα None αν δεν βρεθεί."""
    for rx in SPEC_RES:
        m = rx.search(text)
        if m and "ΕΠΙΛΟΓΗ" not in m.group(1).upper():
            return (text[:m.start(1)] + text[m.end(1):]).strip(), m.group(1).strip()
    return text, None


def stems(t):
    return {w[:5] for w in nrm(t).split() if len(w) > 3}


def coverage(ts, ss, idf):
    tot = sum(idf.get(w, 1.0) for w in ts)
    return sum(idf.get(w, 1.0) for w in ts if w in ss) / tot if tot else 0.0


def months(a, b):
    ya, ma = map(int, a.split("-")[:2])
    yb, mb = map(int, b.split("-")[:2])
    return abs((yb * 12 + mb) - (ya * 12 + ma))


class OptVecs:
    """Κρύπτη embeddings ετικετών επιλογών."""

    def __init__(self, E):
        self.E, self.c = E, {}

    def __call__(self, item):
        labs = [o["label"] for o in item["options"]]
        miss = [x for x in dict.fromkeys(labs) if x not in self.c]
        if miss:
            for x, v in zip(miss, self.E.encode(miss)):
                self.c[x] = v
        return np.array([self.c[x] for x in labs])


def scale_sim(A, B):
    """Ομοιότητα δύο κλιμάκων ίδιου Κ: μέση ομοιότητα ετικετών ανά θέση, στον καλύτερο προσανατολισμό → (sim, sgn)."""
    f = float(np.mean(np.sum(A * B, axis=1)))
    r = float(np.mean(np.sum(A * B[::-1], axis=1)))
    return (f, 1) if f >= r else (r, -1)


def align(At, As):
    """Χαρτογράφηση επιλογών πηγής → στόχου με τη μεγαλύτερη ομοιότητα ετικέτας (για ονομαστικές/διαφορετικό Κ)."""
    S = As @ At.T
    return S.argmax(axis=1), S.max(axis=1)


# ------------------------------------------------------------------ κύρια ροή
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--files", required=True)
    ap.add_argument("--ref", required=True)
    ap.add_argument("--mode", choices=["unseen", "seen"], default="unseen")
    ap.add_argument("--lex", default=None, help="JSON αποφάσεων autolink (TS) για τις ερωτήσεις-στόχους")
    ap.add_argument("--seeds", type=int, default=2)
    ap.add_argument("--out", required=True)
    ap.add_argument("--concepts", default=None, help="G4: concepts.json (concept_graph.py)")
    ap.add_argument("--assoc-only", action="store_true", help="μόνο σειρά προσώπων/συσχετίσεις (χωρίς επίπεδα και βάσεις σύγκρισης)")
    ap.add_argument("--p4-lake", action="store_true", help="πρόσθετη βάση τεκμηρίων της φάσης 4 (Τροποποίηση Α)")
    ap.add_argument("--save-latent", default=None, help="npz με τα λανθάνοντα σειράς ανά στόχο + πραγματικές απαντήσεις (για εξασθένιση εκτός γραμμής)")
    a = ap.parse_args()
    LAT = {}
    if a.concepts:
        CONCEPTS.update(json.load(open(a.concepts))["units"])
    root = os.path.abspath(a.root)
    global HZ
    HZ = os.path.join(root, ".synthetic-lab-data", "persona", "harmonized")
    md = a.model_dir if os.path.isabs(a.model_dir) else os.path.join(root, a.model_dir)
    model = json.load(open(os.path.join(md, "model.json")))
    pool = [t for t in json.load(open(os.path.join(md, "items.json"))) if t["wave"] <= a.ref]
    bank = json.load(open(os.path.join(HZ, "item_bank.json")))
    marg = dict(lake_marginals(root, bank))
    files = a.files.split(",")
    lake_bank = bank
    if a.p4_lake:
        from iqge_core import p4_lake  # noqa: E402

        b4, m4 = p4_lake(root)
        lake_bank = bank + b4
        marg.update(m4)
        print(f"p4 lake: {len(b4)} items, {len(m4)} με περιθώρια")
    targets = [b for b in bank if b["file"] in files and b["type"] in ("ordinal", "binary", "nominal") and 2 <= len(b["options"]) <= 11 and not is_demo(b)]
    lake = [b for b in lake_bank if b["wave"] <= a.ref and b["id"] in marg and 2 <= len(b["options"]) <= 11 and not is_demo(b)]
    import embed  # noqa: E402

    E = embed.Embedder(root)
    OV = OptVecs(E)
    pv = E.encode([embed.item_text(t) for t in pool])
    lv = E.encode([embed.item_text(t) for t in lake])
    tv = E.encode([embed.item_text(t) for t in targets])
    lq = E.encode([embed.clean(b["text"]) for b in lake])
    tq = E.encode([embed.clean(b["text"]) for b in targets])
    spec_l = [split_spec(b["text"])[1] for b in lake]
    spec_t = [split_spec(b["text"])[1] for b in targets]
    uniq = sorted({x for x in spec_l + spec_t if x})
    SV = dict(zip(uniq, E.encode(uniq))) if uniq else {}
    lake_st = [stems(b["text"]) for b in lake]
    df_ = {}
    for st in lake_st:
        for w_ in st:
            df_[w_] = df_.get(w_, 0) + 1
    idf = {w_: math.log((len(lake) + 1) / (c + 1)) + 1 for w_, c in df_.items()}
    lake_K = np.array([len(b["options"]) for b in lake])
    lake_file = np.array([b["file"] for b in lake])
    lake_fam = np.array([b.get("family") or "" for b in lake])
    pool_fam = np.array([p.get("family") or "" for p in pool])
    lake_lk = [label_key(b["options"]) for b in lake]
    lex = json.load(open(a.lex)) if a.lex else {}
    import eval_persona as ep  # noqa: E402

    res = []
    for fid in files:
        real = pie.read_resp(os.path.join(HZ, "resp", f"{fid}.csv.gz"))
        w = real["weight"].values.astype(float)
        skel = real[[c for c in SKEL if c in real]].copy()
        tgts = [(i, t) for i, t in enumerate(targets) if t["file"] == fid and t["id"] in real]
        personas = []
        for s in range(a.seeds):
            P = pie.generate_anchors(model, skel, np.random.default_rng(4100 + s))
            personas.append((P, pie.feature_columns(P)))
        Pw0, X0 = personas[0][0]["weight"].values, personas[0][1]
        syn_cols = {}
        for ti, t in tgts:
            codes = [o["code"] for o in t["options"]]
            K = len(codes)
            rc = real[t["id"]].astype(str).where(real[t["id"]].notna(), None)
            ok = rc.isin(codes).values
            if ok.sum() < 150:
                continue
            truth = wdist(rc.values[ok], w[ok], codes)
            fam = t.get("family") or "__none__"
            hide = a.mode == "unseen"
            At = OV(t)
            # ---- τεκμήρια βάσης (περιθώρια): όχι το ίδιο αρχείο· όχι η ίδια οικογένεια (unseen)
            lmask = (lake_file != fid) & ~((lake_fam == fam) & hide)
            lsims = np.where(lmask, lv @ tv[ti], -1.0)
            # ---- τεκμήρια μοντέλου (σειρά προσώπων): όχι η ίδια οικογένεια
            pmask = ~((pool_fam == fam) & hide)
            psims = np.where(pmask, pv @ tv[ti], -1.0)
            row = {"item": t["id"], "file": fid, "K": K, "type": t["type"], "construct": t.get("construct"), "text": t["text"][:160], "n": int(ok.sum()),
                   "truth": np.round(truth * 100, 2).tolist()}
            ltop = np.argsort(-lsims)[:30]
            s1 = float(lsims[ltop[0]])
            row["sim1"] = round(s1, 4)
            row["tier"] = "paraphrase" if s1 >= 0.85 else "related" if s1 >= 0.65 else "weak"
            row["top"] = [{"id": lake[j]["id"], "sim": round(float(lsims[j]), 3), "K": int(lake_K[j]), "text": lake[j]["text"][:100]} for j in ltop[:5]]
            lev = {}
            # B_scale (ακριβείς ετικέτες) και B_scale_soft (ίδιο Κ, ετικέτες σημασιολογικά ίδιες ανά θέση)
            lk = label_key(t["options"])
            ex = [np.array(marg[lake[j]["id"]]["dist"]) for j in np.where(lmask)[0] if lake_lk[j] == lk]
            lev["scale"] = np.mean(ex, axis=0).tolist() if ex else None
            soft = []
            for j in (np.where(lmask & (lake_K == K))[0] if not a.assoc_only else []):
                ss, sg = scale_sim(At, OV(lake[j]))
                if ss >= 0.85:
                    d = np.array(marg[lake[j]["id"]]["dist"])
                    soft.append((ss, d if sg > 0 else d[::-1]))
            lev["scalesoft"] = np.mean([d for _, d in soft], axis=0).tolist() if soft else None
            row["nSoft"] = len(soft)
            # γείτονες ίδιου Κ (προσανατολισμένα περιθώρια) + ευθυγράμμιση επιλογών για οποιοδήποτε Κ
            nb = []
            for j in (ltop if not a.assoc_only else []):
                if lsims[j] < 0.4:
                    break
                As = OV(lake[j])
                d = np.array(marg[lake[j]["id"]]["dist"])
                ent = {"id": lake[j]["id"], "sim": round(float(lsims[j]), 4), "K": int(lake_K[j]), "simQ": round(float(lq[j] @ tq[ti]), 4),
                       "cover": round(coverage(stems(t["text"]), lake_st[j], idf), 3), "months": months(lake[j]["wave"], t["wave"]),
                       "sameSeries": lake[j]["file"][:2] == fid[:2], "type": lake[j]["type"]}
                st_, ss_ = spec_t[ti], spec_l[j]
                if st_ and ss_:
                    ent["simSpec"] = round(float(SV[st_] @ SV[ss_]), 4)
                elif st_:
                    ent["simSpec"] = round(float(SV[st_] @ lq[j]), 4)
                elif ss_:
                    ent["simSpec"] = round(float(SV[ss_] @ tq[ti]), 4)
                if lake_K[j] == K:
                    ss, sg = scale_sim(At, As)
                    ent["optSim"] = round(ss, 3)
                    ent["dist"] = (d if sg > 0 else d[::-1]).tolist()
                mp, ms = align(At, As)
                ent["alignSim"] = round(float(np.mean(ms)), 3)
                al = np.zeros(K)
                for ci, (tk, sv) in enumerate(zip(mp, ms)):
                    if sv >= 0.6:
                        al[tk] += d[ci]
                if al.sum() >= 0.7:
                    ent["aligned"] = (al / al.sum()).tolist()
                nb.append(ent)
            row["nb"] = nb[:15]
            row["spec"] = spec_t[ti]
            # ---- σειρά προσώπων από το λανθάνον των k πρώτων ordinal τεκμηρίων του μοντέλου
            ptop = [j for j in np.argsort(-psims)[:40] if pool[j]["model"]["kind"] == "ordinal" and psims[j] > 0.3][:3]
            row["rankSrc"] = [{"id": pool[j]["id"], "sim": round(float(psims[j]), 3)} for j in ptop]
            if ptop and len(pool[ptop[0]]["options"]) == K:
                src = pool[ptop[0]]
                sg = orientation(At, OV(src))
                pr = np.average(expected_probs(src, X0), axis=0, weights=Pw0)
                lev["src1"] = (pr if sg > 0 else pr[::-1]).tolist()
            # crude (B_crude) με κρυμμένη οικογένεια
            cp = [p for p, m in zip(pool, pmask) if m]
            mt = ep.match_items([t], cp) if not a.assoc_only else []
            mt = mt[0] if mt else None
            if mt and mt["kind"] != "not_estimable" and mt["train"]["model"]["kind"] == "ordinal":
                src = mt["train"]
                inv = {v: k for k, v in mt["map"].items()}
                pr = np.average(expected_probs(src, X0), axis=0, weights=Pw0)
                dist = np.zeros(K)
                for ci, c in enumerate(o["code"] for o in src["options"]):
                    if c in inv:
                        dist[codes.index(inv[c])] += pr[ci]
                if dist.sum() > 0:
                    lev["crude"] = (dist / dist.sum()).tolist()
            d = lex.get(t["id"])
            if d:
                row["lexConf"] = d.get("confidence")
            if d and d.get("accepted") and d.get("itemId"):
                src = next((p for p in pool if p["id"] == d["itemId"]), None)
                if src is not None and not (hide and (src.get("family") or "") == fam):
                    pr = np.average(expected_probs(src, X0), axis=0, weights=Pw0)
                    scodes = [o["code"] for o in src["options"]]
                    labs = [o["label"] for o in t["options"]]
                    dist = np.zeros(K)
                    for opt, cs in d["optionMap"].items():
                        if opt in labs:
                            for c in cs:
                                if c in scodes:
                                    dist[labs.index(opt)] += pr[scodes.index(c)]
                    if dist.sum() > 0:
                        lev["lex"] = (dist / dist.sum()).tolist()
            row["lev"] = lev
            # ---- συνθετικές ατομικές απαντήσεις (σειρά από τεκμήρια, επίπεδο: μέση κατανομή γειτόνων ή B_scale)
            if ptop and t["type"] != "nominal":
                ws = np.array([max(psims[j], 0) ** 4 for j in ptop])
                ws = ws / ws.sum()
                P, X = personas[0]
                rng = np.random.default_rng(777 + ti)
                total, used = np.zeros(len(P)), 0
                for j, wt in zip(ptop, ws):
                    sc = latent_score(pool[j], P, X, rng, model)
                    if sc is None:
                        continue
                    total += wt * orientation(At, OV(pool[j])) * (sc - sc.mean()) / (sc.std() + 1e-9)
                    used += 1
                if used:
                    if a.save_latent:
                        LAT[f"{t['id']}|lat"] = total.astype(np.float32)
                        LAT[f"{t['id']}|real"] = np.array([codes.index(v) if v in codes else -1 for v in rc.values], dtype=np.int8)
                        LAT[f"{t['id']}|w"] = w.astype(np.float32)
                        LAT[f"{t['id']}|pw"] = P["weight"].values.astype(np.float32)
                        LAT[f"{t['id']}|base"] = np.array(lev.get("scale") or lev.get("scalesoft") or np.full(K, 1 / K), dtype=np.float32)
                    base = np.array(lev.get("scale") or lev.get("scalesoft") or np.full(K, 1 / K))
                    xs = rank_assign(total, P["weight"].values, base / base.sum()).astype(float)
                    xr = np.array([codes.index(v) if v in codes else np.nan for v in rc.values], dtype=float)
                    rr_r, rr_s = ridit(xr, w), ridit(xs, w)
                    gaps, gaps0 = [], []
                    for g in ("age_band", "gender", "edu3"):
                        if g not in real:
                            continue
                        gv = real[g].values
                        for lv_ in [x for x in pd.unique(gv) if isinstance(x, str)]:
                            mm = gv == lv_
                            if (mm & ~np.isnan(rr_r)).sum() < 60:
                                continue
                            dr = np.nanmean(rr_r[mm]) - np.nanmean(rr_r)
                            ds = np.nanmean(rr_s[mm]) - np.nanmean(rr_s)
                            gaps.append(abs(dr - ds))
                            gaps0.append(abs(dr))
                    row["condErr"] = round(float(np.mean(gaps)), 4) if gaps else None
                    row["condErrIndep"] = round(float(np.mean(gaps0)), 4) if gaps0 else None
                    syn_cols[t["id"]] = xs
            res.append(row)
        # συσχετίσεις μεταξύ ερωτήσεων-στόχων (R1): συνθετικές vs ανεξάρτητες (r=0)
        ids = list(syn_cols)
        errs = []
        tmap = {t["id"]: t for _, t in tgts}
        enc = {}
        for i in ids:
            c1 = [o["code"] for o in tmap[i]["options"]]
            enc[i] = np.array([c1.index(v) if v in c1 else np.nan for v in real[i].astype(str)], dtype=float)
        for x in range(len(ids)):
            for y in range(x + 1, len(ids)):
                rr_ = wspear(enc[ids[x]], enc[ids[y]], w)
                rs_ = wspear(syn_cols[ids[x]], syn_cols[ids[y]], w)
                if rr_ == rr_ and rs_ == rs_:
                    errs.append((abs(rr_ - rs_), abs(rr_), np.sign(rr_) == np.sign(rs_)))
        strong = [e for e in errs if e[1] > 0.2]
        res.append({"file": fid, "assoc": True, "pairs": len(errs),
                    "R1": round(float(np.mean([e[0] for e in errs])), 4) if errs else None,
                    "R1_indep": round(float(np.mean([e[1] for e in errs])), 4) if errs else None,
                    "R1_strong": round(float(np.mean([e[0] for e in strong])), 4) if strong else None,
                    "R1_strong_indep": round(float(np.mean([e[1] for e in strong])), 4) if strong else None,
                    "signAgreeStrong": round(float(np.mean([e[2] for e in strong])), 3) if strong else None})
    json.dump(res, open(a.out, "w"), ensure_ascii=False, indent=1, default=float)
    if a.save_latent:
        np.savez_compressed(a.save_latent, **LAT)
    summarize(res)


def summarize(res):
    rows = [r for r in res if "lev" in r]
    print(f"targets: {len(rows)}")
    for tier in ("paraphrase", "related", "weak", "ALL"):
        rs = [r for r in rows if tier == "ALL" or r.get("tier") == tier]
        if not rs:
            continue
        line = f"{tier:10s} n={len(rs):3d} "
        for m in ("scale", "scalesoft", "src1", "crude", "lex"):
            v = [(np.mean(np.abs(np.array(r["lev"][m]) * 100 - np.array(r["truth"]))), np.mean(np.abs(100 / r["K"] - np.array(r["truth"]))))
                 for r in rs if r["lev"].get(m) is not None]
            if v:
                line += f"| {m} {np.mean([x for x, _ in v]):5.1f} (unif {np.mean([u for _, u in v]):4.1f}) cov {len(v) / len(rs) * 100:3.0f}% "
        print(line)
    for r in res:
        if "assoc" in r:
            print("assoc", r)


if __name__ == "__main__":
    main()
