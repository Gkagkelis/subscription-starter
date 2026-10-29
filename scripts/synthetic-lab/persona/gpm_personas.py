"""
PHASE6 Part D — σύγκριση τρόπων κατασκευής συνθετικών προσώπων στο ΠΡΟΒΛΗΜΑ 2 (κοινή συμπεριφορά ερωτώμενου).

Ρύθμιση (ανάπτυξη· τα κύματα-στόχοι είναι ήδη γνωστά από προηγούμενες φάσεις, άρα ΟΧΙ τελική επικύρωση):
  στόχος T ∈ {dn2024a, dn2024b, dn2024c} (πεδίο 12/2023)· εκπαίδευση: ελληνικές έρευνες με κύμα ≤ 2023-11, χωρίς T και χωρίς HBS.
  Ερωτήσεις: ordinal/binary του T που έχουν ΙΔΙΑ οικογένεια σε κύμα εκπαίδευσης («γνωστές ερωτήσεις»).
  Σκελετός: τα δημογραφικά (ηλικία, φύλο, μόρφωση, περιοχή, αστικότητα, βάρος) των πραγματικών ερωτώμενων του T — ίδιος για όλες τις μεθόδους.
Μέθοδοι:
  M0  ανεξάρτητα περιθώρια του τελευταίου κύματος (καμία σχέση)
  M1  μόνο δημογραφικά (ανά ερώτηση πολυωνυμική λογιστική στο τελευταίο κύμα· υπό συνθήκη ανεξάρτητες)
  A   υπάρχουσα PIE (eval-final-fix-selected: ίδια διαμόρφωση με pie-0.2, εκπαίδευση ≤ 2023-11)
  A4  υπάρχουσα PIE με λανθάνον e1 (eval-final-p3-e1: διαμόρφωση pie-0.4/0.5/0.6)
  B   GPM: θ ∈ R^k | δημογραφικά ~ N(Bx, Σ)· z = κ·v_f·θ + ε· κατηγορία από τα κατώφλια του τελευταίου κύματος
  C   αγκυρωμένα σε πραγματικούς ερωτώμενους: δότης από πρόσφατες έρευνες εκπαίδευσης (ίδιο κελί ηλικίας×φύλου×μόρφωσης),
      θ = μεταγενέστερη (posterior) εκτίμηση του δότη + θόρυβος· όλες οι απαντήσεις μέσω του μοντέλου (πολλαπλή συμπλήρωση)
  D   υβρίδιο: όπως C, αλλά όπου ο δότης απάντησε ΤΗΝ ΙΔΙΑ οικογένεια ερώτησης κρατείται η πραγματική του απάντηση
Ο συντελεστής κ (διόρθωση εξασθένισης των κανονικών σκορ) επιλέγεται ΜΟΝΟ σε έρευνα εκπαίδευσης (dn2022a).
Μετρικές: περιθώρια (MAE π.μ.), συσχετίσεις ζευγών (|Δ Spearman|, εντός/μεταξύ διαστάσεων), δεσμευμένες κατανομές (TVD),
διαφορές υποομάδων (ridit), εσωτερική συνέπεια (α του Cronbach), ποικιλία (μοναδικά μοτίβα, μειοψηφικές απαντήσεις).

  python3 -I scripts/synthetic-lab/persona/gpm_personas.py --root . --out <json> [--k 6] [--seeds 3]
"""
import argparse
import json
import os
import sys
import time

import numpy as np
import pandas as pd
from scipy.special import ndtri
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gpm_core as GC  # noqa: E402

DEMO = ["age_band", "gender", "edu3", "urban"]
TARGETS = ["dn2024a", "dn2024b", "dn2024c"]
CUTOFF = "2023-11"
DONOR_FROM = "2021-06"


def onehot(df, levels):
    cols = [np.ones(len(df))]
    for c in DEMO:
        v = df[c].astype(str).values
        for lev in levels[c][1:]:
            cols.append((v == lev).astype(float))
    return np.column_stack(cols)


def wspear(x, y, w):
    ok = (x >= 0) & (y >= 0)
    if ok.sum() < 50:
        return np.nan
    x, y, w = x[ok], y[ok], w[ok]

    def rk(v):
        out = np.zeros(len(v))
        for u in np.unique(v):
            m = v == u
            below = w[v < u].sum()
            out[m] = below + w[m].sum() / 2
        return out / w.sum()

    a, b = rk(x), rk(y)
    a, b = a - np.average(a, weights=w), b - np.average(b, weights=w)
    d = np.sqrt(np.average(a * a, weights=w) * np.average(b * b, weights=w))
    return float(np.average(a * b, weights=w) / d) if d > 0 else np.nan


def wdist(y, w, K):
    ok = y >= 0
    p = np.bincount(y[ok], weights=w[ok], minlength=K)
    return p / max(p.sum(), 1e-12)


def ridit_gap(y, w, g, K):
    ok = (y >= 0) & np.isfinite(g)
    if ok.sum() < 100:
        return np.nan
    p = wdist(y[ok], w[ok], K)
    cum = np.cumsum(p) - p / 2
    r = cum[y[ok]]
    gg = g[ok]
    if (gg == 1).sum() > 30 and (gg == 0).sum() > 30:
        return float(np.average(r[gg == 1], weights=w[ok][gg == 1]) - np.average(r[gg == 0], weights=w[ok][gg == 0]))
    return np.nan


def metrics(Y, W, demo, items, dims, real=None):
    """Y: n×m κωδικοί (−1 = λείπει)."""
    m = Y.shape[1]
    out = {"marg": [wdist(Y[:, j], W, items[j]["K"]) for j in range(m)]}
    S = np.full((m, m), np.nan)
    for i in range(m):
        for j in range(i + 1, m):
            S[i, j] = wspear(Y[:, i], Y[:, j], W)
    out["spear"] = S
    groups = {"young": np.where(np.isin(demo["age_band"], ["17-24", "25-34"]), 1.0, np.where(demo["age_band"] == "65+", 0.0, np.nan)),
              "female": np.where(demo["gender"] == "female", 1.0, np.where(demo["gender"] == "male", 0.0, np.nan)),
              "edu_high": np.where(demo["edu3"] == "high", 1.0, np.where(demo["edu3"] == "low", 0.0, np.nan))}
    out["gaps"] = {g: [ridit_gap(Y[:, j], W, v, items[j]["K"]) for j in range(m)] for g, v in groups.items()}
    # ποικιλία: μοναδικά μοτίβα στις 10 πρώτες ερωτήσεις, μέση απόσταση Hamming
    sub = Y[:, : min(10, m)]
    out["uniquePatterns"] = float(len({tuple(r) for r in sub}) / len(sub))
    rng = np.random.default_rng(0)
    a, b = rng.integers(0, len(Y), 3000), rng.integers(0, len(Y), 3000)
    both = (Y[a] >= 0) & (Y[b] >= 0)
    out["hamming"] = float(((Y[a] != Y[b]) & both).sum() / max(both.sum(), 1))
    return out


def cond_tvd(Ys, Ws, Yr, Wr, i, j, Ki, Kj):
    tv, tot = 0.0, 0.0
    for c in range(Ki):
        mr, ms = (Yr[:, i] == c) & (Yr[:, j] >= 0), (Ys[:, i] == c) & (Ys[:, j] >= 0)
        if Wr[mr].sum() < 20 or Ws[ms].sum() < 20:
            continue
        pr, ps = wdist(Yr[mr, j], Wr[mr], Kj), wdist(Ys[ms, j], Ws[ms], Kj)
        wgt = Wr[mr].sum()
        tv += wgt * 0.5 * np.abs(pr - ps).sum()
        tot += wgt
    return tv / tot if tot else np.nan


def cronbach(Y, cols):
    X = Y[:, cols].astype(float)
    X[X < 0] = np.nan
    ok = ~np.isnan(X).any(axis=1)
    X = X[ok]
    if len(X) < 50 or X.shape[1] < 2:
        return np.nan
    k = X.shape[1]
    return float(k / (k - 1) * (1 - X.var(axis=0, ddof=1).sum() / X.sum(axis=1).var(ddof=1)))


def compare(syn, real, items, dims, Ys, Yr, Ws, Wr, batteries):
    m = len(items)
    r = {"marginalMAE_pp": float(np.mean([np.mean(np.abs(syn["marg"][j] - real["marg"][j])) * 100 for j in range(m)]))}
    iu = np.triu_indices(m, 1)
    a, b = syn["spear"][iu], real["spear"][iu]
    ok = np.isfinite(a) & np.isfinite(b)
    same = np.array([dims[i] is not None and dims[i] == dims[j] for i, j in zip(*iu)])
    r["assocMAE"] = float(np.mean(np.abs(a - b)[ok]))
    r["assocMAE_sameDim"] = float(np.mean(np.abs(a - b)[ok & same])) if (ok & same).any() else None
    r["assocMAE_crossDim"] = float(np.mean(np.abs(a - b)[ok & ~same]))
    r["assocCorr"] = float(np.corrcoef(a[ok], b[ok])[0, 1])
    strong = ok & (np.abs(b) >= 0.2)
    r["assocMAE_strong"] = float(np.mean(np.abs(a - b)[strong])) if strong.any() else None
    r["signAgree_|r|>0.1"] = float(np.mean(np.sign(a[ok & (np.abs(b) > 0.1)]) == np.sign(b[ok & (np.abs(b) > 0.1)])))
    top = np.argsort(-np.where(ok, np.abs(b), -1))[:150]
    r["condTVD_top150"] = float(np.nanmean([cond_tvd(Ys, Ws, Yr, Wr, iu[0][t], iu[1][t], items[iu[0][t]]["K"], items[iu[1][t]]["K"]) for t in top]))
    r["subgroupGapMAE"] = {g: float(np.nanmean(np.abs(np.array(syn["gaps"][g]) - np.array(real["gaps"][g])))) for g in syn["gaps"]}
    r["uniquePatterns"] = syn["uniquePatterns"]
    r["hamming"] = syn["hamming"]
    al = [(cronbach(Ys, c), cronbach(Yr, c)) for c in batteries]
    al = [(x, y) for x, y in al if np.isfinite(x) and np.isfinite(y)]
    r["cronbachMAE"] = float(np.mean([abs(x - y) for x, y in al])) if al else None
    # μειοψηφικές απαντήσεις: μερίδιο ερωτώμενων με ≥ 2 απαντήσεις σε επιλογές < 20% (πραγματικό περιθώριο)
    def minority(Y, W):
        cnt = np.zeros(len(Y))
        for j in range(m):
            rare = np.where(real["marg"][j] < 0.2)[0]
            cnt += np.isin(Y[:, j], rare) & (Y[:, j] >= 0)
        return float(np.average(cnt >= 2, weights=W))
    r["minorityShare"] = minority(Ys, Ws)
    return r


class GPM:
    """Πολυδιάστατο λανθάνον μοντέλο εκπαίδευσης + κατώφλια από το τελευταίο κύμα κάθε οικογένειας."""

    def __init__(self, R, X, meta, train_surveys, k, seed=0):
        self.meta = meta
        self.fam_of = {mm["col"]: mm["link"] for mm in meta}
        self.blocks = GC.survey_blocks(R, X, meta, surveys=train_surveys, min_items=3)
        self.model = GC.fit_blocks(self.blocks, self.fam_of, k, lam=1.0, iters=60, seed=seed)
        self.fidx = {f: i for i, f in enumerate(self.model["fams"])}
        self.k = k
        U, D = [], []
        self.levels = {c: sorted(set(R[c].astype(str)) - {"nan"}) for c in DEMO}
        for s, b in self.blocks.items():
            U.append(self.model["U"][s])
            D.append(onehot(R.iloc[b["rows"]], self.levels))
        U, D = np.vstack(U), np.vstack(D)
        self.B = np.linalg.lstsq(D, U, rcond=None)[0]
        self.Sres = np.cov((U - D @ self.B).T)
        self.L = np.linalg.cholesky(self.Sres + 1e-6 * np.eye(k))

    def theta_demo(self, demo_df, rng):
        D = onehot(demo_df, self.levels)
        return D @ self.B + rng.standard_normal((len(D), self.k)) @ self.L.T

    def posterior(self, survey, rows_local, rng):
        """Μεταγενέστερη εκτίμηση θ ερωτώμενου εκπαίδευσης + θόρυβος από την προσεγγιστική μεταγενέστερη διασπορά."""
        b = self.blocks[survey]
        U = self.model["U"][survey][rows_local]
        V = self.model["V"][[self.fidx[self.fam_of[j]] for j in b["cols"]]]
        M = ~np.isnan(b["Z"][rows_local])
        out = np.empty_like(U)
        for i in range(len(U)):
            Vi = V[M[i]]
            Pc = np.linalg.inv(Vi.T @ Vi / 0.5 + np.eye(self.k))
            out[i] = U[i] + np.linalg.cholesky(Pc + 1e-9 * np.eye(self.k)) @ rng.standard_normal(self.k)
        return out

    def answer(self, theta, fam, tau, kappa, rng):
        v = self.model["V"][self.fidx[fam]] * kappa
        sv = float(v @ v)
        if sv >= 0.95:
            v = v * np.sqrt(0.95 / sv)
            sv = 0.95
        z = theta @ v + np.sqrt(1 - sv) * rng.standard_normal(len(theta))
        return np.searchsorted(tau, z)


def last_wave_item(meta, R, X, fam, train_surveys):
    cands = [mm for mm in meta if mm["link"] == fam and mm["survey"] in train_surveys and mm["type"] in ("ordinal", "binary")]
    if not cands:
        return None
    wave = dict(R.groupby("survey").wave.first())
    return max(cands, key=lambda mm: wave.get(mm["survey"], ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--out", required=True)
    ap.add_argument("--k", type=int, default=6)
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--n", type=int, default=3000)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    R, X, meta = GC.load_grim(root)
    Xr = X.tocsr()
    wave = dict(R.groupby("survey").wave.first())
    train_s = {s for s, w in wave.items() if w <= CUTOFF and s not in TARGETS and not s.startswith("hbs") and s not in ("dn2024a", "dn2024b", "dn2024c")}
    ident = json.load(open(os.path.join(GC.gdir(root), "identify.json"))) if os.path.exists(os.path.join(GC.gdir(root), "identify.json")) else {}
    gpm = GPM(R, X, meta, train_s, a.k)
    donors_s = sorted(s for s in train_s if wave[s] >= DONOR_FROM and s in gpm.blocks)
    print("εκπαίδευση", len(train_s), "έρευνες· δότες", donors_s, flush=True)
    import embed

    E = None
    report = {"createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "k": a.k, "trainSurveys": sorted(train_s), "donorSurveys": donors_s, "targets": {}}

    def prepare(T):
        rows = np.where(R.survey.values == T)[0]
        tcols = [mm for mm in meta if mm["survey"] == T and mm["type"] in ("ordinal", "binary") and mm["src"] != "anchor"]
        items = []
        for mm in tcols:
            src = last_wave_item(meta, R, X, mm["link"], train_s)
            if src is None or mm["link"] not in gpm.fidx or src["K"] != mm["K"]:
                continue
            items.append(dict(mm, srcCol=src["col"], srcSurvey=src["survey"]))
        Yr = Xr[rows][:, [it["col"] for it in items]].toarray().astype(int) - 1
        keep = (Yr >= 0).mean(axis=0) >= 0.5
        items = [it for it, k in zip(items, keep) if k]
        Yr = Yr[:, keep]
        Wr = GC.wnorm(R.weight.values[rows])
        return rows, items, Yr, Wr

    def src_dist(it):
        rr = np.where(R.survey.values == it["srcSurvey"])[0]
        y = Xr[rr][:, [it["srcCol"]]].toarray().ravel().astype(int) - 1
        return wdist(y, GC.wnorm(R.weight.values[rr]), it["K"]), rr, y

    def tau_of(p):
        c = np.clip(np.cumsum(p)[:-1], 1e-4, 1 - 1e-4)
        return ndtri(c)

    def gen_gpm(items, skel, rng, kappa, mode="B"):
        n = len(skel)
        Y = np.full((n, len(items)), -1)
        if mode == "B":
            th = gpm.theta_demo(skel, rng)
            donor = None
        else:
            # δότες: ίδιο κελί ηλικίας×φύλου×μόρφωσης, με πιθανότητα ∝ βάρος
            pool = np.concatenate([gpm.blocks[s]["rows"] for s in donors_s])
            loc = {}
            for s in donors_s:
                for li, gr in enumerate(gpm.blocks[s]["rows"]):
                    loc[gr] = (s, li)
            key = lambda df: df.age_band.astype(str) + "|" + df.gender.astype(str) + "|" + df.edu3.astype(str)
            pk = key(R.iloc[pool]).values
            pw = GC.wnorm(R.weight.values[pool])
            sk = key(skel).values
            donor = np.empty(n, dtype=int)
            for kk in np.unique(sk):
                m = sk == kk
                cand = np.where(pk == kk)[0]
                if not len(cand):
                    cand = np.arange(len(pool))
                donor[m] = pool[rng.choice(cand, m.sum(), p=pw[cand] / pw[cand].sum())]
            th = np.empty((n, a.k))
            for s in donors_s:
                m = np.array([loc[d][0] == s for d in donor])
                if m.any():
                    th[m] = gpm.posterior(s, np.array([loc[d][1] for d in donor[m]]), rng)
        for j, it in enumerate(items):
            p, _, _ = src_dist(it)
            Y[:, j] = gpm.answer(th, it["link"], tau_of(p), kappa, rng)
            if mode == "D":
                # πραγματική απάντηση του δότη στην ίδια οικογένεια, όπου υπάρχει
                fam_cols = {mm["col"] for mm in meta if mm["link"] == it["link"] and mm["survey"] in donors_s and mm["K"] == it["K"]}
                for c in fam_cols:
                    v = Xr[donor][:, [c]].toarray().ravel().astype(int) - 1
                    Y[v >= 0, j] = v[v >= 0]
        return Y

    def gen_m0(items, skel, rng):
        Y = np.empty((len(skel), len(items)), dtype=int)
        for j, it in enumerate(items):
            p, _, _ = src_dist(it)
            Y[:, j] = rng.choice(it["K"], len(skel), p=p)
        return Y

    def gen_m1(items, skel, rng):
        Y = np.empty((len(skel), len(items)), dtype=int)
        lev = gpm.levels
        Ds = onehot(skel, lev)
        for j, it in enumerate(items):
            _, rr, y = src_dist(it)
            ok = y >= 0
            if len(np.unique(y[ok])) < 2:
                Y[:, j] = y[ok][0]
                continue
            mdl = LogisticRegression(C=1.0, max_iter=300).fit(onehot(R.iloc[rr[ok]], lev), y[ok], sample_weight=GC.wnorm(R.weight.values[rr[ok]]))
            P = np.zeros((len(skel), it["K"]))
            P[:, mdl.classes_] = mdl.predict_proba(Ds)
            Y[:, j] = (rng.random(len(skel))[:, None] > np.cumsum(P, axis=1)).sum(axis=1).clip(0, it["K"] - 1)
        return Y

    def gen_pie(items, skel, rng, model_dir):
        import pie
        from eval_persona import match_items

        mdl = json.load(open(os.path.join(model_dir, "model.json")))
        mitems = json.load(open(os.path.join(model_dir, "items.json")))
        bank = {b["id"]: b for b in json.load(open(os.path.join(root, ".synthetic-lab-data", "persona", "harmonized", "item_bank.json")))}
        hold = [bank[it["id"]] for it in items]
        mp = match_items(hold, mitems)
        sk = skel[["age_band", "gender", "edu3", "nuts1", "urban"]].copy()
        P = pie.generate_anchors(mdl, sk, rng)
        Y = np.full((len(skel), len(items)), -1)
        for j, it in enumerate(items):
            t = mp.get(it["id"]) if isinstance(mp, dict) else None
            if not t:
                continue
            codes = pie.answer_item(t, P, rng, factors=True, model=mdl)
            hc = [o["code"] for o in bank[it["id"]]["options"]]
            tc = [o["code"] for o in t["options"]]
            idx = {c: hc.index(c) if c in hc else (tc.index(c) if c in tc else -1) for c in set(codes)}
            Y[:, j] = [idx.get(c, -1) if c != "dk" else -1 for c in codes]
        return Y

    # κ: επιλογή σε έρευνα ΕΚΠΑΙΔΕΥΣΗΣ (dn2022a), με τον ίδιο σκελετό-λογική
    cal = "dn2022a"
    rows_c = np.where(R.survey.values == cal)[0]
    items_c = []
    for mm in meta:
        if mm["survey"] == cal and mm["type"] in ("ordinal", "binary") and mm["src"] != "anchor" and mm["link"] in gpm.fidx:
            items_c.append(dict(mm, srcCol=mm["col"], srcSurvey=cal))
    items_c = items_c[:60]
    Yc = Xr[rows_c][:, [it["col"] for it in items_c]].toarray().astype(int) - 1
    Wc = GC.wnorm(R.weight.values[rows_c])
    real_c = metrics(Yc, Wc, R.iloc[rows_c][DEMO].astype(str).to_dict("list") | {}, items_c, [None] * len(items_c))
    kap = {}
    for kappa in (1.0, 1.15, 1.3, 1.5):
        rng = np.random.default_rng(1)
        skel = R.iloc[rng.choice(rows_c, a.n, p=Wc / Wc.sum())].reset_index(drop=True)
        Ys = gen_gpm(items_c, skel, rng, kappa, "B")
        s = metrics(Ys, np.ones(len(Ys)), {c: skel[c].astype(str).values for c in DEMO}, items_c, [None] * len(items_c))
        iu = np.triu_indices(len(items_c), 1)
        x, y = s["spear"][iu], real_c["spear"][iu]
        ok = np.isfinite(x) & np.isfinite(y)
        kap[kappa] = float(np.mean(np.abs(x - y)[ok]))
    kappa = min(kap, key=kap.get)
    report["kappaSelection"] = {"survey": cal, "assocMAE": kap, "kappa": kappa}
    print("κ", kap, "→", kappa, flush=True)

    # διαστάσεις ερωτήσεων (από gpm_identify) για εντός/μεταξύ
    dim_names = list(GC.DIMS)
    names, S_, best, top, _ = None, None, None, None, None
    try:
        import gpm_identify as GI

        names, S_, best, top, _ = GI.assign_dims(root, meta)
    except Exception:
        pass
    dim_of = {mm["col"]: (names[best[i]] if top[i] >= 0.40 else None) for i, mm in enumerate(meta)} if names else {}

    models = {"A": os.path.join(root, ".synthetic-lab-data", "persona", "models", "eval", "eval-final-fix-selected"),
              "A4": os.path.join(root, ".synthetic-lab-data", "persona", "models", "eval", "eval-final-p3-e1")}
    for T in TARGETS:
        rows, items, Yr, Wr = prepare(T)
        dims = [dim_of.get(it["col"]) for it in items]
        demo_r = {c: R[c].values[rows].astype(str) for c in DEMO}
        real = metrics(Yr, Wr, demo_r, items, dims)
        bat = {}
        for j, it in enumerate(items):
            v = it["id"].split("::")[1]
            pre = v.rsplit("_", 1)[0] if "_" in v else v
            bat.setdefault(pre, []).append(j)
        batteries = [c for c in bat.values() if 3 <= len(c) <= 15]
        res = {}
        for sd in range(a.seeds):
            rng = np.random.default_rng(100 + sd)
            skel = R.iloc[rng.choice(rows, a.n, p=Wr / Wr.sum())].reset_index(drop=True)
            demo_s = {c: skel[c].astype(str).values for c in DEMO}
            gens = {"M0": lambda: gen_m0(items, skel, rng), "M1": lambda: gen_m1(items, skel, rng),
                    "A": lambda: gen_pie(items, skel, rng, models["A"]), "A4": lambda: gen_pie(items, skel, rng, models["A4"]),
                    "B": lambda: gen_gpm(items, skel, rng, kappa, "B"), "C": lambda: gen_gpm(items, skel, rng, kappa, "C"),
                    "D": lambda: gen_gpm(items, skel, rng, kappa, "D")}
            for name, g in gens.items():
                try:
                    Ys = g()
                except Exception as ex:  # η μέθοδος δεν μπορεί να απαντήσει (π.χ. αντιστοίχιση PIE)
                    print(name, "σφάλμα", repr(ex)[:200], flush=True)
                    continue
                Ws = np.ones(len(Ys))
                s = metrics(Ys, Ws, demo_s, items, dims)
                res.setdefault(name, []).append(compare(s, real, items, dims, Ys, Yr, Ws, Wr, batteries))
        agg = {}
        for name, lst in res.items():
            keys = lst[0].keys()
            agg[name] = {}
            for k_ in keys:
                if isinstance(lst[0][k_], dict):
                    agg[name][k_] = {g: round(float(np.mean([x[k_][g] for x in lst])), 4) for g in lst[0][k_]}
                elif lst[0][k_] is None:
                    agg[name][k_] = None
                else:
                    agg[name][k_] = round(float(np.mean([x[k_] for x in lst])), 4)
        report["targets"][T] = {"nItems": len(items), "nReal": int(len(rows)), "realUniquePatterns": real["uniquePatterns"], "realHamming": real["hamming"],
                                "pieCoverage": None, "results": agg}
        print(T, len(items), json.dumps({k: (v["marginalMAE_pp"], v["assocMAE"], v["assocMAE_crossDim"], v["condTVD_top150"]) for k, v in agg.items()}), flush=True)
    json.dump(report, open(a.out, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
