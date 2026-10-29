"""
PHASE4 IQGE (Intelligent Question Generalization Engine) — πυρήνας.

Για μια ΝΕΑ ερώτηση (κείμενο + επιλογές), χωρίς πραγματικές απαντήσεις:
  1. κατανόηση: πολυγλωσσικά embeddings (εκτός σύνδεσης) ερώτησης, επιμέρους θέματος μπαταρίας και ετικετών επιλογών·
  2. ανάκτηση τεκμηρίων: items της βάσης (πραγματικά σταθμισμένα περιθώρια) και items του μοντέλου PIE (λανθάνοντα)·
  3. επίπεδο: μαθημένη «κάρτα ταιριάσματος» — βάρη τεκμηρίων από χαρακτηριστικά ταιριάσματος (ομοιότητες, λεξική κάλυψη,
     ομοιότητα κλίμακας, χρονική απόσταση) + βάση τύπου κλίμακας + λεξική σύνδεση pie-0.4· βάρη μαθημένα σε ανάπτυξη
     leave-one-family-out (διαΝΕΟσις 2022/2024)·
  4. σειρά προσώπων: σταθμισμένο άθροισμα λανθανόντων των πλησιέστερων ordinal items του μοντέλου, με εξασθένιση ανά βαθμίδα·
  5. αβεβαιότητα: εμπειρικό 80% διάστημα ανά βαθμίδα (G5).
Κανένα ποσοστό δεν παράγεται από γλωσσικό μοντέλο· τα embeddings χρησιμοποιούνται μόνο για ανάκτηση/ταίριασμα.
Οι συναρτήσεις χαρακτηριστικών είναι ΟΙ ΙΔΙΕΣ με το benchmark ανάπτυξης (eval_unseen.py / analyze_unseen.py).
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import pie  # noqa: E402
from analyze_unseen import FEATS, base as lev_base, card_level, cands  # noqa: E402
from eval_unseen import (OptVecs, align, coverage, is_demo, label_key, lake_marginals, latent_score, months, orientation,  # noqa: E402
                         scale_sim, split_spec, stems, wdist)

IQGE_VERSION = "iqge-1"
SKEL = ["age_band", "gender", "edu3", "nuts1", "urban", "weight"]


# Αρχεία της βάσης φάσης 4 που ΔΕΝ επιτρέπονται ως τεκμήριο: πιθανή ταύτιση με τελικό holdout (H7 Dinas–Fouka–Schläpfer).
P4_EXCLUDE = {"p4_owt_dinas"}


def p4_lake(root):
    """Πρόσθετη βάση τεκμηρίων της φάσης 4 (Τροποποίηση Α): items + σταθμισμένα περιθώρια· κενή αν δεν υπάρχει."""
    d = os.path.join(root, ".synthetic-lab-data", "persona", "phase4")
    bp = os.path.join(d, "lake_bank.json")
    if not os.path.exists(bp):
        return [], {}
    bank = [b for b in json.load(open(bp)) if b["file"] not in P4_EXCLUDE and isinstance(b.get("wave"), str) and len(b["wave"]) >= 7]
    mp = os.path.join(d, "lake_marginals_p4.json")
    if os.path.exists(mp):
        m = json.load(open(mp))
        return bank, {k: v for k, v in m.items() if k.split("::")[0] not in P4_EXCLUDE}
    out, by_file = {}, {}
    for b in bank:
        by_file.setdefault(b["file"], []).append(b)
    for f, its in by_file.items():
        fp = os.path.join(d, "resp", f"{f}.csv.gz")
        if not os.path.exists(fp):
            continue
        real = pie.read_resp(fp)
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
    json.dump(out, open(mp, "w"))
    return bank, out


class IQGE:
    def __init__(self, root, model_dir, params, use_p4_lake=False, ref_skeleton="dn2024a"):
        import embed

        import eval_unseen as eu

        self.root = root
        eu.HZ = os.path.join(root, ".synthetic-lab-data", "persona", "harmonized")
        self.HZ = eu.HZ
        self.model = json.load(open(os.path.join(model_dir, "model.json")))
        self.pool_all = json.load(open(os.path.join(model_dir, "items.json")))
        self.params = params
        bank = json.load(open(os.path.join(self.HZ, "item_bank.json")))
        marg = dict(lake_marginals(root, bank))
        if use_p4_lake:
            b4, m4 = p4_lake(root)
            bank = bank + b4
            marg.update(m4)
        # ενεργό snapshot ερευνών πελατών (client_surveys.py integrate --activate)· κενό αν δεν υπάρχει
        from client_surveys import active_client_lake

        bc, mc = active_client_lake(root)
        bank = bank + bc
        marg.update(mc)
        self.clientItems = len(bc)
        self.marg = marg
        self.lake_all = [b for b in bank if b["id"] in marg and 2 <= len(b["options"]) <= 11 and not is_demo(b)]
        self.E = embed.Embedder(root)
        self.embed = embed
        self.OV = OptVecs(self.E)
        self.lv = self.E.encode([embed.item_text(b) for b in self.lake_all])
        self.lq = self.E.encode([embed.clean(b["text"]) for b in self.lake_all])
        self.pv = self.E.encode([embed.item_text(t) for t in self.pool_all])
        self.spec_l = [split_spec(b["text"])[1] for b in self.lake_all]
        self.SV = {}
        self._encode_specs([x for x in self.spec_l if x])
        self.lake_st = [stems(b["text"]) for b in self.lake_all]
        df_ = {}
        for st in self.lake_st:
            for w_ in st:
                df_[w_] = df_.get(w_, 0) + 1
        self.idf = {w_: math.log((len(self.lake_all) + 1) / (c + 1)) + 1 for w_, c in df_.items()}
        self.lake_K = np.array([len(b["options"]) for b in self.lake_all])
        self.lake_file = np.array([b["file"] for b in self.lake_all])
        self.lake_fam = np.array([b.get("family") or "" for b in self.lake_all])
        self.lake_wave = np.array([b["wave"] for b in self.lake_all])
        self.lake_lk = [label_key(b["options"]) for b in self.lake_all]
        self.pool_fam = np.array([p.get("family") or "" for p in self.pool_all])
        self.pool_ids = np.array([p["id"] for p in self.pool_all])
        self.lake_ids = np.array([b["id"] for b in self.lake_all])
        self.pool_wave = np.array([p["wave"] for p in self.pool_all])
        # πληθυσμός αναφοράς για ροπές λανθανόντων (πραγματικός δημογραφικός σκελετός)
        real = pie.read_resp(os.path.join(self.HZ, "resp", f"{ref_skeleton}.csv.gz"))
        skel = real[[c for c in SKEL if c in real]].copy()
        self.refP = pie.generate_anchors(self.model, skel, np.random.default_rng(9090))
        self.refX = pie.feature_columns(self.refP)

    def _encode_specs(self, xs):
        miss = sorted({x for x in xs if x not in self.SV})
        if miss:
            for x, v in zip(miss, self.E.encode(miss)):
                self.SV[x] = v

    def interpret(self, t, ref, exclude_file=None, exclude_family=None, exclude_ids=None, exclude_files=None):
        """t: {id, text, options:[{code,label}], type, wave}. Επιστρέφει ερμηνεία χωρίς καμία πραγματική απάντηση του στόχου."""
        E, OV, embed = self.E, self.OV, self.embed
        K = len(t["options"])
        tv = E.encode([embed.item_text(t)])[0]
        tq = E.encode([embed.clean(t["text"])])[0]
        spec_t = split_spec(t["text"])[1]
        if spec_t:
            self._encode_specs([spec_t])
        At = OV(t)
        fam = exclude_family or "__none__"
        lmask = (self.lake_wave <= ref) & (self.lake_file != (exclude_file or "__none__")) & (self.lake_fam != fam)
        if exclude_ids:
            lmask &= ~np.isin(self.lake_ids, list(exclude_ids))
        if exclude_files:
            lmask &= ~np.isin(self.lake_file, list(exclude_files))
        lsims = np.where(lmask, self.lv @ tv, -1.0)
        ltop = np.argsort(-lsims)[:30]
        s1 = float(lsims[ltop[0]])
        tier = "paraphrase" if s1 >= 0.85 else "related" if s1 >= 0.65 else "weak"
        r = {"item": t["id"], "K": K, "type": t["type"], "text": t["text"][:160], "sim1": round(s1, 4), "tier": tier, "lev": {}, "nb": []}
        lk = label_key(t["options"])
        ex = [np.array(self.marg[self.lake_all[j]["id"]]["dist"]) for j in np.where(lmask)[0] if self.lake_lk[j] == lk]
        r["lev"]["scale"] = np.mean(ex, axis=0).tolist() if ex else None
        soft = []
        for j in np.where(lmask & (self.lake_K == K))[0]:
            ss, sg = scale_sim(At, OV(self.lake_all[j]))
            if ss >= 0.85:
                d = np.array(self.marg[self.lake_all[j]["id"]]["dist"])
                soft.append(d if sg > 0 else d[::-1])
        r["lev"]["scalesoft"] = np.mean(soft, axis=0).tolist() if soft else None
        tst = stems(t["text"])
        for j in ltop:
            if lsims[j] < 0.4:
                break
            b = self.lake_all[j]
            As = OV(b)
            d = np.array(self.marg[b["id"]]["dist"])
            ent = {"id": b["id"], "sim": round(float(lsims[j]), 4), "K": int(self.lake_K[j]), "simQ": round(float(self.lq[j] @ tq), 4),
                   "cover": round(coverage(tst, self.lake_st[j], self.idf), 3), "months": months(b["wave"], t["wave"]),
                   "sameSeries": b["file"][:2] == (exclude_file or t["id"])[:2], "type": b["type"], "text": b["text"][:120]}
            ss_ = self.spec_l[j]
            if spec_t and ss_:
                ent["simSpec"] = round(float(self.SV[spec_t] @ self.SV[ss_]), 4)
            elif spec_t:
                ent["simSpec"] = round(float(self.SV[spec_t] @ self.lq[j]), 4)
            elif ss_:
                ent["simSpec"] = round(float(self.SV[ss_] @ tq), 4)
            if self.lake_K[j] == K:
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
            r["nb"].append(ent)
        r["nb"] = r["nb"][:15]
        # επίπεδο: κάρτα ταιριάσματος (+ λεξική σύνδεση αν δοθεί στο t["lex"])
        if t.get("lex") is not None:
            r["lev"]["lex"] = t["lex"]
            r["lexConf"] = t.get("lexConf")
        th = np.array(self.params["card"])
        level = card_level(r, th)
        r["level"] = level.tolist()
        # βάρη τεκμηρίων (για την προέλευση)
        nf = len(FEATS)
        C = cands(r)
        ws = [math.exp(min(float(th[:nf] @ f), 30)) for f, _ in C]
        tot = sum(ws) + math.exp(th[nf]) + math.exp(th[nf + 1])
        used = [e for e in r["nb"][:8] if (e.get("dist") is not None or e.get("aligned") is not None)]
        r["evidence"] = [{"id": e["id"], "sim": e["sim"], "text": e["text"], "weight": round(w_ / tot, 4)} for e, w_ in zip(used, ws)]
        r["evidence"].sort(key=lambda x: -x["weight"])
        r["baseWeight"] = round(math.exp(th[nf]) / tot, 4)
        r["baseKind"] = lev_base(r)[1]
        q80 = self.params.get("q80", {}).get(tier)
        r["int80"] = [[max(0.0, x * 100 - q80), min(100.0, x * 100 + q80)] for x in level] if q80 else None
        r["expectedMAE"] = self.params["tiers"][tier].get("cardFitMAE")
        # σειρά προσώπων: έως 3 ordinal items του μοντέλου
        pmask = (self.pool_wave <= ref) & (self.pool_fam != fam)
        if exclude_ids:
            pmask &= ~np.isin(self.pool_ids, list(exclude_ids))
        if exclude_files:
            pmask &= ~np.isin(np.array([p["file"] for p in self.pool_all]), list(exclude_files))
        psims = np.where(pmask, self.pv @ tv, -1.0)
        ptop = [j for j in np.argsort(-psims)[:40] if self.pool_all[j]["model"]["kind"] == "ordinal" and psims[j] > 0.3][:3]
        r["rank"] = []
        if ptop and t["type"] != "nominal":
            ws_ = np.array([max(psims[j], 0) ** 4 for j in ptop])
            ws_ = ws_ / ws_.sum()
            rng = np.random.default_rng(31)
            tot_s = np.zeros(len(self.refP))
            for j, wt in zip(ptop, ws_):
                src = self.pool_all[j]
                sc = latent_score(src, self.refP, self.refX, rng, self.model)
                sg = orientation(At, OV(src))
                m_, s_ = float(sc.mean()), float(sc.std())
                r["rank"].append({"itemId": src["id"], "weight": round(float(wt), 4), "sign": int(sg), "mean": round(m_, 5), "sd": round(s_, 5), "sim": round(float(psims[j]), 4)})
                tot_s += wt * sg * (sc - m_) / (s_ + 1e-9)
            r["scoreSd"] = round(float(tot_s.std()), 5)
        else:
            r["scoreSd"] = 1.0
        r["atten"] = float(self.params.get("alpha", {}).get(tier, 1.0)) if r["rank"] else 0.0
        return r

    def link(self, r, option_labels):
        """Μετατροπή ερμηνείας σε IqgeLink (lib/synthetic-lab/types.ts) για τις ουσιαστικές επιλογές της ερώτησης."""
        return {"version": IQGE_VERSION, "modelVersion": self.model["version"], "level": {o: round(float(x), 5) for o, x in zip(option_labels, r["level"])},
                "int80": {o: [round(a, 1), round(b, 1)] for o, (a, b) in zip(option_labels, r["int80"])} if r["int80"] else None,
                "rank": [{k: x[k] for k in ("itemId", "weight", "sign", "mean", "sd")} for x in r["rank"]], "scoreSd": r["scoreSd"], "atten": r["atten"],
                "tier": r["tier"], "expectedMAE": r["expectedMAE"] or 0.0, "evidence": r["evidence"][:5]}
