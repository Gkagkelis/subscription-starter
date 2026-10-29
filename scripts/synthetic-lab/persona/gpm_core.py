"""
PHASE6 — Greek Population Foundation Model (GPM): κοινός πυρήνας.

  - φόρτωση του πίνακα GRIM (gpm_matrix.py)·
  - κανονικά σκορ ανά ερώτηση (σταθμισμένα, εντός έρευνας): κατηγορία k → Φ⁻¹((F_{k−1}+F_k)/2)·
  - πολυδιάστατο γραμμικό-γκαουσιανό λανθάνον μοντέλο σε μπλοκ ερευνών με ΚΟΙΝΕΣ φορτίσεις για συνδεδεμένες ερωτήσεις
    (EM-ALS με συμπλήρωση των ελλειπουσών τιμών· μέτρηση της αμεταβλητότητας ως υπόθεση, όχι ως δεδομένο)·
  - μάσκες διασταυρούμενης επικύρωσης σε επίπεδο κελιού.
Κανένα συγκεντρωτικό ποσοστό δεν χρησιμοποιείται ως στόχος· όλα εκτιμώνται από ατομικές απαντήσεις.
"""
import json
import os

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.special import ndtri

DIMS = {  # υποψήφιες διαστάσεις (Phase 6, Μέρος C) — ΔΕΝ θεωρούνται δεδομένες· ελέγχονται εμπειρικά
    "econ_ideology": "economic ideology: state versus market, redistribution, income equality, taxes, privatisation, role of government in the economy",
    "cultural_ideology": "social and cultural values: immigration, gay rights, abortion, traditional family values, nationalism, law and order",
    "institutional_trust": "trust in parliament, government, political parties, politicians, justice, police, institutions",
    "eu_orientation": "attitudes to the European Union, euro, EU membership, European integration, attachment to Europe",
    "political_engagement": "interest in politics, voting, participation, signing petitions, discussing politics, political efficacy",
    "religiosity": "religion, belief in God, church attendance, praying, how religious are you",
    "economic_insecurity": "household financial situation, difficulty paying bills, income adequacy, fear of job loss, economic hardship",
    "economic_outlook": "national economic situation, expectations for the economy next twelve months, assessment of economy",
    "risk_tolerance": "willingness to take risks, risk aversion, uncertainty, gambling, investing",
    "price_sensitivity": "price, cost, affordability, discounts, cheaper products, value for money when shopping",
    "brand_loyalty": "brand loyalty, preferred brands, switching providers, trust in brands and companies",
    "technology_adoption": "internet use, online shopping, smartphones, digital technology, artificial intelligence, new technologies",
    "environmental_orientation": "climate change, environment, recycling, sustainable consumption, pollution, green energy",
    "social_trust": "most people can be trusted, people are fair, people try to be helpful, trust in other people",
    "media_consumption": "television, newspapers, radio, social media use, news consumption, trust in media",
    "science_health": "trust in science and scientists, medicine, vaccines, doctors, health information",
    "wellbeing": "life satisfaction, happiness, health status, feeling about life",
    "democracy_satisfaction": "satisfaction with democracy, how democracy works, government performance evaluation",
}


def gdir(root):
    return os.path.join(root, ".synthetic-lab-data", "gpm", "v1")


def load_grim(root):
    d = gdir(root)
    R = pd.read_csv(os.path.join(d, "respondents.csv.gz"), dtype=str, keep_default_na=False, na_values=[""], low_memory=False)
    R["weight"] = pd.to_numeric(R["weight"], errors="coerce")
    for c in ("survey", "wave", "age_band", "gender", "edu3", "urban", "nuts1"):
        R[c] = np.array(R[c].fillna("nan").astype(object).values, dtype=object).astype(str)
    X = sparse.load_npz(os.path.join(d, "values.npz")).tocsc()
    meta = json.load(open(os.path.join(d, "items.json")))
    return R, X, meta


def wnorm(w):
    w = np.asarray(w, dtype=float)
    w = np.where(np.isfinite(w) & (w > 0), w, 0.0)
    return w / w.mean() if w.sum() > 0 else np.ones_like(w)


def category_scores(codes, w, K):
    """Σταθμισμένα κανονικά σκορ μεσαίου σημείου για κωδικούς 0..K−1."""
    p = np.bincount(codes, weights=w, minlength=K).astype(float)
    p = p / p.sum()
    F = np.cumsum(p)
    lo = np.concatenate([[0.0], F[:-1]])
    mid = np.clip((lo + F) / 2, 1e-4, 1 - 1e-4)
    return ndtri(mid)


def survey_blocks(R, X, meta, min_items=1, types=("ordinal", "binary"), surveys=None, exclude_links=()):
    """Ανά έρευνα: γραμμές, στήλες (μόνο ordinal/binary), πυκνός πίνακας κανονικών σκορ με NaN."""
    by_s = {}
    for j, m in enumerate(meta):
        if m["type"] in types and m["link"] not in exclude_links:
            by_s.setdefault(m["survey"], []).append(j)
    out = {}
    for s, g in R.groupby("survey").groups.items():
        if surveys is not None and s not in surveys:
            continue
        cols = by_s.get(s, [])
        if len(cols) < min_items:
            continue
        rows = np.asarray(g)
        w = wnorm(R["weight"].values[rows])
        sub = X[rows][:, cols].toarray().astype(float)  # 0 = λείπει
        Z = np.full(sub.shape, np.nan)
        for c in range(sub.shape[1]):
            ok = sub[:, c] > 0
            if ok.sum() < 50:
                continue
            K = meta[cols[c]]["K"]
            sc = category_scores(sub[ok, c].astype(int) - 1, w[ok], K)
            Z[ok, c] = sc[sub[ok, c].astype(int) - 1]
        keep = ~np.all(np.isnan(Z), axis=0)
        out[s] = {"rows": rows, "cols": np.asarray(cols)[keep], "Z": Z[:, keep], "w": w}
    return out


def fit_blocks(blocks, fam_of, k, lam=1.0, iters=60, seed=0, tol=1e-5):
    """EM-ALS: z_ij ≈ u_i·v_f(j). Οι στήλες της ίδιας οικογένειας σύνδεσης μοιράζονται φορτίσεις.
    U λευκαίνεται σε κάθε επανάληψη (cov(U)=I), οπότε οι φορτίσεις είναι στην κλίμακα συσχετίσεων."""
    rng = np.random.default_rng(seed)
    fams = sorted({fam_of[j] for b in blocks.values() for j in b["cols"]})
    fidx = {f: i for i, f in enumerate(fams)}
    V = rng.normal(0, 0.1, (len(fams), k))
    U = {s: rng.normal(0, 1, (len(b["rows"]), k)) for s, b in blocks.items()}
    F = {s: np.array([fidx[fam_of[j]] for j in b["cols"]]) for s, b in blocks.items()}
    prev = None
    for it in range(iters):
        A = np.zeros((len(fams), k, k))
        B = np.zeros((len(fams), k))
        sse, nobs = 0.0, 0
        for s, b in blocks.items():
            Z, M = b["Z"], ~np.isnan(b["Z"])
            Vs = V[F[s]]
            P = U[s] @ Vs.T
            Zf = np.where(M, Z, P)
            sse += float(((Z - P)[M] ** 2).sum())
            nobs += int(M.sum())
            G = Vs.T @ Vs + lam * np.eye(k)
            U[s] = np.linalg.solve(G, (Zf @ Vs).T).T
            P = U[s] @ Vs.T
            Zf = np.where(M, Z, P)
            UtU = U[s].T @ U[s]
            np.add.at(A, F[s], UtU)
            np.add.at(B, F[s], (U[s].T @ Zf).T)
        V = np.linalg.solve(A + lam * np.eye(k)[None], B[..., None])[..., 0]
        # λεύκανση
        allU = np.vstack(list(U.values()))
        C = np.cov(allU.T) if k > 1 else np.array([[np.var(allU)]])
        ev, Q = np.linalg.eigh(np.atleast_2d(C))
        ev = np.maximum(ev, 1e-8)
        Wh = Q @ np.diag(ev ** -0.5) @ Q.T
        Wi = Q @ np.diag(ev ** 0.5) @ Q.T
        mu = allU.mean(axis=0)
        for s in U:
            U[s] = (U[s] - mu) @ Wh
        V = V @ Wi
        rmse = (sse / max(nobs, 1)) ** 0.5
        if prev is not None and abs(prev - rmse) < tol:
            break
        prev = rmse
    return {"fams": fams, "V": V, "U": U, "rmse": rmse, "iters": it + 1}


def mask_cells(blocks, frac=0.1, seed=0):
    """Κρύβει τυχαίο ποσοστό παρατηρημένων κελιών ανά μπλοκ. Επιστρέφει (blocks_train, held)."""
    rng = np.random.default_rng(seed)
    tr, held = {}, {}
    for s, b in blocks.items():
        Z = b["Z"].copy()
        M = ~np.isnan(Z)
        h = M & (rng.random(Z.shape) < frac)
        Z[h] = np.nan
        tr[s] = dict(b, Z=Z)
        held[s] = (np.where(h), b["Z"][h])
    return tr, held


def predict_held(model, blocks, held, fam_of):
    fidx = {f: i for i, f in enumerate(model["fams"])}
    err = []
    for s, ((ri, ci), z) in held.items():
        if not len(z):
            continue
        V = model["V"][[fidx[fam_of[j]] for j in blocks[s]["cols"]]]
        p = np.einsum("ik,ik->i", model["U"][s][ri], V[ci])
        err.append(z - p)
    e = np.concatenate(err) if err else np.array([])
    return float(np.sqrt(np.mean(e ** 2))) if len(e) else float("nan"), len(e)
