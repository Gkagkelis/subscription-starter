"""
Persona Intelligence Engine (PIE) — στατιστικός πυρήνας (εκπαίδευση + γεννήτρια για αξιολόγηση).

Αρχιτεκτονική (δύο στάδια, όπως και στο runtime του Lab σε TypeScript):
  Στάδιο Α — συνθετικό πρόσωπο:
      δημογραφικά (από τον βαθμονομημένο πληθυσμό)  →  άγκυρες με αλυσίδα δεσμευμένων μοντέλων
      (emp → inc6 → econ4 → class3 → lr7 → pv → believer → polint4, κάθε κόμβος = πολυωνυμικό logit
      στα δημογραφικά + στους προηγούμενους κόμβους)  →  λανθάνοντα χαρακτηριστικά θ_c ~ N(0,1) ανά κατασκευή.
  Στάδιο Β — απάντηση ανά ερώτηση:
      item ordinal: πιθανότητα ΔΞ/ΔΑ (logit) · αλλιώς ordinal probit  y* = η(x) + λ·θ_c + √(1−λ²)·ε
      item nominal: πολυωνυμικό logit (Gumbel-max)
      Όλα εκτιμώνται σε ΠΡΑΓΜΑΤΙΚΑ μικροδεδομένα του ίδιου αρχείου (σταθμισμένα, L2).
Κανένα συγκεντρωτικό ποσοστό δεν μπαίνει ως στόχος· τα ποσοστά βγαίνουν μόνο από τις ατομικές απαντήσεις.
"""
import math

import numpy as np
from scipy.optimize import minimize
from scipy.special import log_ndtr, ndtr, ndtri, expit, logsumexp

# ------------------------------------------------------------------ χαρακτηριστικά (ίδια λογική με το TS runtime)
FEATURES = [
    "age_17_24", "age_25_34", "age_35_44", "age_55_64", "age_65p", "female", "edu_low", "edu_high",
    "n_attica", "n_north", "n_islands", "rural",
    "emp_unemp", "emp_retired", "emp_student", "emp_home", "emp_public", "emp_self", "emp_other",
    "inc", "econ", "cls_low", "cls_high", "lr", "lr2", "lr_none",
    "pv_nd", "pv_syriza", "pv_pasok", "pv_kke", "pv_farright", "pv_leftother", "pv_centre", "pv_other",
    "believer", "polint", "inc_q", "hhsize",
]
# ποια μεταβλητή του προσώπου χρειάζεται κάθε ομάδα χαρακτηριστικών
FEATURE_SOURCE = {
    **{f: "age_band" for f in ["age_17_24", "age_25_34", "age_35_44", "age_55_64", "age_65p"]},
    "female": "gender", "edu_low": "edu3", "edu_high": "edu3", "n_attica": "nuts1", "n_north": "nuts1", "n_islands": "nuts1",
    "rural": "urban", **{f: "emp" for f in ["emp_unemp", "emp_retired", "emp_student", "emp_home", "emp_other"]},
    "emp_public": "emp_detail", "emp_self": "emp_detail", "inc": "inc6", "econ": "econ4", "cls_low": "class3", "cls_high": "class3",
    "lr": "lr7", "lr2": "lr7", "lr_none": "lr7",
    **{f: "pv" for f in ["pv_nd", "pv_syriza", "pv_pasok", "pv_kke", "pv_farright", "pv_leftother", "pv_centre", "pv_other"]},
    "believer": "believer", "polint": "polint4", "inc_q": "incq5", "hhsize": "hhsize5",
}
PV_FAMILY = {"nd": "nd", "syriza": "syriza", "pasok": "pasok", "kke": "kke", "xa": "farright", "el": "farright", "spartiates": "farright",
             "niki": "farright", "laos": "farright", "anel": "farright", "potami": "centre", "ek": "centre", "dimar": "centre",
             "lae": "leftother", "mera25": "leftother", "plefsi": "leftother", "antarsya": "leftother", "nea_aristera": "leftother",
             "other": "other"}
EMP_WORKING = {"public_emp", "private_emp", "self_emp", "farmer", "employed"}


def feature_columns(df):
    """Πίνακας χαρακτηριστικών (n × len(FEATURES)) από harmonised στήλες· NaN όπου λείπει η πηγή."""
    n = len(df)
    X = np.full((n, len(FEATURES)), np.nan)
    col = {f: i for i, f in enumerate(FEATURES)}

    def put(name, values):
        X[:, col[name]] = values

    if "age_band" in df:
        a = df["age_band"].values
        ok = df["age_band"].notna().values
        for f, b in [("age_17_24", "17-24"), ("age_25_34", "25-34"), ("age_35_44", "35-44"), ("age_55_64", "55-64"), ("age_65p", "65+")]:
            put(f, np.where(ok, (a == b).astype(float), np.nan))
    if "gender" in df:
        g = df["gender"]
        put("female", np.where(g.notna(), (g == "female").astype(float), np.nan))
    if "edu3" in df:
        e = df["edu3"]
        put("edu_low", np.where(e.notna(), (e == "low").astype(float), np.nan))
        put("edu_high", np.where(e.notna(), (e == "high").astype(float), np.nan))
    if "nuts1" in df:
        r = df["nuts1"]
        for f, v in [("n_attica", "attica"), ("n_north", "north"), ("n_islands", "islands")]:
            put(f, np.where(r.notna(), (r == v).astype(float), np.nan))
    if "urban" in df:
        u = df["urban"]
        put("rural", np.where(u.notna(), (u == "rural").astype(float), np.nan))
    if "emp" in df:
        e = df["emp"]
        ok = e.notna()
        for f, v in [("emp_unemp", "unemployed"), ("emp_retired", "retired"), ("emp_student", "student"), ("emp_home", "homemaker"), ("emp_other", "other")]:
            put(f, np.where(ok, (e == v).astype(float), np.nan))
        detail = ok & ~(e == "employed")
        put("emp_public", np.where(detail, (e == "public_emp").astype(float), np.nan))
        put("emp_self", np.where(detail, e.isin(["self_emp", "farmer"]).astype(float), np.nan))
    if "inc6" in df:
        put("inc", (pd_num(df["inc6"]) - 3.5) / 1.5)
    if "econ4" in df:
        put("econ", (pd_num(df["econ4"]) - 2.5) / 1.0)
    if "class3" in df:
        c = pd_num(df["class3"])
        put("cls_low", np.where(np.isnan(c), np.nan, (c == 1).astype(float)))
        put("cls_high", np.where(np.isnan(c), np.nan, (c == 3).astype(float)))
    if "lr7" in df:
        l = pd_num(df["lr7"])
        none = pd_num(df["lr_none"]) if "lr_none" in df else np.zeros(n)
        none = np.where(np.isnan(none), np.where(np.isnan(l), np.nan, 0.0), none)
        z = (l - 4.0) / 1.5
        put("lr", np.where(none == 1, 0.0, z))
        put("lr2", np.where(none == 1, 0.0, z * z - 1.0))
        put("lr_none", none)
    if "pv" in df:
        p = df["pv"]
        fam = p.map(lambda v: PV_FAMILY.get(v, "nonvote") if isinstance(v, str) else None)
        ok = fam.notna().values
        for f, v in [("pv_nd", "nd"), ("pv_syriza", "syriza"), ("pv_pasok", "pasok"), ("pv_kke", "kke"), ("pv_farright", "farright"),
                     ("pv_leftother", "leftother"), ("pv_centre", "centre"), ("pv_other", "other")]:
            put(f, np.where(ok, (fam == v).astype(float), np.nan))
    if "believer" in df:
        put("believer", pd_num(df["believer"]))
    if "polint4" in df:
        put("polint", (pd_num(df["polint4"]) - 2.5) / 1.0)
    if "incq5" in df:
        put("inc_q", (pd_num(df["incq5"]) - 3.0) / 1.41)
    if "hhsize5" in df:
        put("hhsize", (pd_num(df["hhsize5"]) - 2.5) / 1.2)
    return X


def read_resp(path, **kw):
    """Harmonised αρχείο: οι στήλες items (με «::») διαβάζονται ΩΣ ΚΕΙΜΕΝΟ (κωδικοί «1», όχι 1.0)."""
    import pandas as pd

    cols = pd.read_csv(path, nrows=0).columns
    return pd.read_csv(path, dtype={c: str for c in cols if "::" in c}, low_memory=False, **kw)


def pd_num(s):
    import pandas as pd

    return pd.to_numeric(s, errors="coerce").values.astype(float)


def usable_features(X, min_cov=0.7, exclude=()):
    """Χαρακτηριστικά με κάλυψη ≥ min_cov και διακύμανση στο αρχείο."""
    out = []
    for i, f in enumerate(FEATURES):
        if f in exclude:
            continue
        c = X[:, i]
        ok = ~np.isnan(c)
        if ok.mean() >= min_cov and np.nanstd(c) > 1e-6:
            out.append(f)
    return out


def design(X, feats, means=None):
    idx = [FEATURES.index(f) for f in feats]
    Z = X[:, idx].copy()
    if means is None:
        means = np.nanmean(Z, axis=0) if len(idx) else np.zeros(0)
    for j in range(Z.shape[1]):
        m = np.isnan(Z[:, j])
        Z[m, j] = means[j]
    return Z, means


# ------------------------------------------------------------------ εκτιμητές (σταθμισμένοι, L2)
def fit_logit(Z, y, w, lam=1.0):
    """P(y=1) = σ(a + Z·b)."""
    p = Z.shape[1]
    w = w / w.mean()

    def f(th):
        a, b = th[0], th[1:]
        eta = a + Z @ b
        ll = w * (y * eta - np.logaddexp(0, eta))
        r = expit(eta) - y
        g = np.concatenate([[np.sum(w * r)], Z.T @ (w * r) + lam * b])
        return -ll.sum() + 0.5 * lam * b @ b, g
    th0 = np.zeros(p + 1)
    pm = np.clip(np.average(y, weights=w), 1e-4, 1 - 1e-4)
    th0[0] = math.log(pm / (1 - pm))
    res = minimize(f, th0, jac=True, method="L-BFGS-B", options={"maxiter": 400})
    return {"a": float(res.x[0]), "b": res.x[1:].tolist()}


def fit_ordinal(Z, y, K, w, lam=1.0):
    """Ordinal probit: P(y≤k) = Φ(τ_k − Z·b), y ∈ {0..K-1}. Κατώφλια: τ_1 = c_1, τ_j = τ_{j-1} + exp(c_j)."""
    n, p = Z.shape
    w = w / w.mean()
    cnt = np.bincount(y, weights=w, minlength=K) + 0.5
    cum = np.cumsum(cnt)[:-1] / cnt.sum()
    tau0 = ndtri(np.clip(cum, 1e-4, 1 - 1e-4))
    c0 = np.concatenate([[tau0[0]], np.log(np.maximum(np.diff(tau0), 1e-3))]) if K > 2 else np.array([tau0[0]])

    def taus(c):
        return np.cumsum(np.concatenate([[c[0]], np.exp(c[1:])]))

    def f(th):
        b, c = th[:p], th[p:]
        tau = taus(c)
        eta = Z @ b
        hi = np.where(y < K - 1, tau[np.minimum(y, K - 2)] - eta, np.inf)
        lo = np.where(y > 0, tau[np.maximum(y - 1, 0)] - eta, -np.inf)
        Phi_hi = np.where(np.isinf(hi), 1.0, ndtr(np.where(np.isinf(hi), 0, hi)))
        Phi_lo = np.where(np.isinf(lo), 0.0, ndtr(np.where(np.isinf(lo), 0, lo)))
        pr = np.maximum(Phi_hi - Phi_lo, 1e-12)
        phi_hi = np.where(np.isinf(hi), 0.0, np.exp(-0.5 * np.where(np.isinf(hi), 0, hi) ** 2) / math.sqrt(2 * math.pi))
        phi_lo = np.where(np.isinf(lo), 0.0, np.exp(-0.5 * np.where(np.isinf(lo), 0, lo) ** 2) / math.sqrt(2 * math.pi))
        nll = -np.sum(w * np.log(pr)) + 0.5 * lam * b @ b
        # παράγωγοι
        d_eta = w * (phi_hi - phi_lo) / pr  # d(-log p)/d eta
        gb = Z.T @ d_eta + lam * b
        # d(-log p)/d tau_k
        gtau = np.zeros(K - 1)
        mhi = y < K - 1
        np.add.at(gtau, y[mhi], -(w * phi_hi / pr)[mhi])
        mlo = y > 0
        np.add.at(gtau, y[mlo] - 1, (w * phi_lo / pr)[mlo])
        # αλυσίδα προς c
        gc = np.zeros_like(c)
        gc[0] = gtau.sum()
        for m in range(1, len(c)):
            gc[m] = np.exp(c[m]) * gtau[m:].sum()
        return nll, np.concatenate([gb, gc])
    th0 = np.concatenate([np.zeros(p), c0])
    res = minimize(f, th0, jac=True, method="L-BFGS-B", options={"maxiter": 500})
    return {"b": res.x[:p].tolist(), "tau": taus(res.x[p:]).tolist(), "converged": bool(res.success)}


def fit_mnl(Z, y, K, w, lam=1.0):
    """Πολυωνυμικό logit με πρώτη κατηγορία αναφοράς."""
    n, p = Z.shape
    w = w / w.mean()
    Y = np.zeros((n, K))
    Y[np.arange(n), y] = 1
    cnt = np.bincount(y, weights=w, minlength=K) + 0.5

    def f(th):
        A = th.reshape(K - 1, p + 1)
        eta = np.column_stack([np.zeros(n), A[:, 0][None, :] + Z @ A[:, 1:].T])
        lse = logsumexp(eta, axis=1)
        nll = -np.sum(w * (np.sum(Y * eta, axis=1) - lse)) + 0.5 * lam * np.sum(A[:, 1:] ** 2)
        P = np.exp(eta - lse[:, None])
        R = (P - Y)[:, 1:] * w[:, None]
        g = np.column_stack([R.sum(axis=0), R.T @ Z + lam * A[:, 1:]])
        return nll, g.ravel()
    A0 = np.zeros((K - 1, p + 1))
    A0[:, 0] = np.log(cnt[1:] / cnt[0])
    res = minimize(f, A0.ravel(), jac=True, method="L-BFGS-B", options={"maxiter": 500})
    A = res.x.reshape(K - 1, p + 1)
    return {"a": [0.0] + A[:, 0].tolist(), "B": [[0.0] * p] + A[:, 1:].tolist(), "converged": bool(res.success)}


# ------------------------------------------------------------------ πιθανότητες / δειγματοληψία
def ordinal_probs(Z, model):
    b = np.array(model["b"])
    tau = np.array(model["tau"])
    eta = Z @ b if len(b) else np.zeros(Z.shape[0])
    cdf = ndtr(tau[None, :] - eta[:, None])
    cdf = np.column_stack([np.zeros(len(eta)), cdf, np.ones(len(eta))])
    return np.diff(cdf, axis=1)


def mnl_probs(Z, model):
    a = np.array(model["a"])
    B = np.array(model["B"])
    eta = a[None, :] + (Z @ B.T if B.shape[1] else 0)
    eta -= eta.max(axis=1, keepdims=True)
    P = np.exp(eta)
    return P / P.sum(axis=1, keepdims=True)


def logit_prob(Z, model):
    b = np.array(model["b"])
    return expit(model["a"] + (Z @ b if len(b) else 0))


def pit_normal_scores(Z, y, model, rng):
    """Τυχαιοποιημένα PIT υπόλοιπα → κανονικά scores (για εκτίμηση λανθανόντων παραγόντων)."""
    P = ordinal_probs(Z, model)
    C = np.cumsum(P, axis=1)
    lo = np.where(y > 0, C[np.arange(len(y)), np.maximum(y - 1, 0)], 0.0)
    hi = C[np.arange(len(y)), y]
    u = lo + rng.random(len(y)) * np.maximum(hi - lo, 1e-9)
    return ndtri(np.clip(u, 1e-6, 1 - 1e-6))


def one_factor(Zs):
    """Φορτίσεις ενός παράγοντα από πίνακα κανονικών scores (με κενά): πρώτος κύριος άξονας των pairwise συσχετίσεων."""
    m = Zs.shape[1]
    R = np.eye(m)
    for i in range(m):
        for j in range(i + 1, m):
            ok = ~np.isnan(Zs[:, i]) & ~np.isnan(Zs[:, j])
            if ok.sum() >= 50:
                r = np.corrcoef(Zs[ok, i], Zs[ok, j])[0, 1]
                R[i, j] = R[j, i] = 0 if np.isnan(r) else r
    if m == 2:
        r = R[0, 1]
        l = math.sqrt(min(abs(r), 0.9))
        return [l, l if r >= 0 else -l], R
    # principal axis με επαναλήψεις κοινοτήτων
    h = np.clip(np.abs(R - np.eye(m)).max(axis=1), 0.05, 0.9)
    for _ in range(30):
        Rh = R.copy()
        np.fill_diagonal(Rh, h)
        vals, vecs = np.linalg.eigh(Rh)
        lam = vecs[:, -1] * math.sqrt(max(vals[-1], 1e-6))
        h_new = np.clip(lam ** 2, 0.01, 0.9)
        if np.max(np.abs(h_new - h)) < 1e-4:
            break
        h = h_new
    lam = np.clip(lam, -0.95, 0.95)
    return lam.tolist(), R


# ------------------------------------------------------------------ PHASE3 E1: πολυχορική συσχέτιση υπολοίπων υπό συνθήκη
_GL_T, _GL_W = np.polynomial.legendre.leggauss(20)
_GL_T, _GL_W = (_GL_T + 1) / 2, _GL_W / 2


def bvn_cdf(h, k, rho):
    """Φ2(h, k; ρ) διανυσματικά: Φ(h)Φ(k) + ρ/(2π) ∫_0^1 exp(−(h²−2ρthk+k²)/(2(1−ρ²t²))) / √(1−ρ²t²) dt."""
    from scipy.special import ndtr

    h = np.clip(h, -8, 8)[:, None]
    k = np.clip(k, -8, 8)[:, None]
    r = rho * _GL_T[None, :]
    one = 1 - r * r
    f = np.exp(-(h * h - 2 * r * h * k + k * k) / (2 * one)) / np.sqrt(one)
    return ndtr(h[:, 0]) * ndtr(k[:, 0]) + rho / (2 * math.pi) * (f @ _GL_W)


def ordinal_bounds(eta, tau, y):
    """Όρια του υπολοίπου e = y* − η για την παρατηρούμενη κατηγορία (±8 στα άκρα)."""
    tau = np.asarray(tau, dtype=float)
    lo = np.where(y > 0, tau[np.maximum(y - 1, 0)], 8.0 * -1) - eta
    hi = np.where(y < len(tau), tau[np.minimum(y, len(tau) - 1)], 8.0) - eta
    lo = np.where(y > 0, lo, -8.0)
    hi = np.where(y < len(tau), hi, 8.0)
    return lo, hi


def polychoric_cond(b1, b2, w):
    """ρ μέγιστης πιθανοφάνειας για δύο ordinal υπόλοιπα (διμεταβλητό probit με τα δικά τους η, τ). b = (lo, hi)."""
    from scipy.optimize import minimize_scalar

    (l1, h1), (l2, h2) = b1, b2

    def nll(rho):
        p = bvn_cdf(h1, h2, rho) - bvn_cdf(l1, h2, rho) - bvn_cdf(h1, l2, rho) + bvn_cdf(l1, l2, rho)
        return -float(np.sum(w * np.log(np.maximum(p, 1e-12))))
    r = minimize_scalar(nll, bounds=(-0.95, 0.95), method="bounded", options={"xatol": 2e-3})
    return float(r.x)


def one_factor_R(R):
    """Φορτίσεις ενός παράγοντα από ΔΕΔΟΜΕΝΟ πίνακα συσχετίσεων (principal axis)."""
    m = R.shape[0]
    if m == 2:
        r = R[0, 1]
        l = math.sqrt(min(abs(r), 0.9))
        return [l, l if r >= 0 else -l]
    h = np.clip(np.abs(R - np.eye(m)).max(axis=1), 0.05, 0.9)
    lam = np.zeros(m)
    for _ in range(50):
        Rh = R.copy()
        np.fill_diagonal(Rh, h)
        vals, vecs = np.linalg.eigh(Rh)
        lam = vecs[:, -1] * math.sqrt(max(vals[-1], 1e-6))
        h_new = np.clip(lam ** 2, 0.01, 0.9)
        if np.max(np.abs(h_new - h)) < 1e-4:
            break
        h = h_new
    return np.clip(lam, -0.95, 0.95).tolist()


def battery_cholesky(R, lam, shrink=0.2, min_eig=0.05):
    """C7: πίνακας συσχετίσεων μπαταρίας (συρρίκνωση προς λλᵀ, θετικά ορισμένος, διαγώνιος 1) → κάτω τριγωνικός Cholesky."""
    lam = np.asarray(lam, dtype=float)
    F = np.outer(lam, lam)
    np.fill_diagonal(F, 1.0)
    S = (1 - shrink) * np.asarray(R, dtype=float) + shrink * F
    vals, vecs = np.linalg.eigh((S + S.T) / 2)
    S = (vecs * np.maximum(vals, min_eig)) @ vecs.T
    d = np.sqrt(np.diag(S))
    S = S / np.outer(d, d)
    return np.linalg.cholesky(S)


# ------------------------------------------------------------------ γεννήτρια (Python, για αξιολόγηση· ίδια λογική με το TS runtime)
def _sample_rows(P, rng):
    u = rng.random(P.shape[0])
    c = np.cumsum(P, axis=1)
    return np.minimum((u[:, None] > c).sum(axis=1), P.shape[1] - 1)


def generate_anchors(model, skel, rng, constructs=None):
    """Στάδιο Α: σκελετός δημογραφικών → άγκυρες (αλυσίδα) → θ ανά κατασκευή. Επιστρέφει νέο DataFrame."""
    import pandas as pd

    df = skel.copy().reset_index(drop=True)
    for node in model["anchorNodes"]:
        X = feature_columns(df)
        Z, _ = design(X, node["feats"], np.array(node["means"]))
        P = mnl_probs(Z, {"a": node["a"], "B": node["B"]})
        idx = _sample_rows(P, rng)
        vals = [node["categories"][i] for i in idx]
        name = node["node"]
        if name == "lr7":
            df["lr_none"] = [1 if v == "none" else 0 for v in vals]
            df["lr7"] = [np.nan if v == "none" else float(v) for v in vals]
        elif name in ("inc6", "econ4", "class3", "believer", "polint4", "incq5", "hhsize5"):
            df[name] = [float(v) for v in vals]
        else:
            df[name] = vals
    df["_pseed"] = rng.integers(0, 2**31 - 1, len(df))
    return df


def theta(personas, key):
    """Λανθάνον χαρακτηριστικό του προσώπου για μια μπαταρία: N(0,1), ντετερμινιστικό από τον σπόρο του προσώπου και το κλειδί."""
    import hashlib

    h = int(hashlib.sha256(key.encode()).hexdigest()[:8], 16)
    seeds = personas["_pseed"].values.astype(np.int64)
    out = np.empty(len(seeds))
    for i, s in enumerate(seeds):
        out[i] = np.random.default_rng([int(s), h]).standard_normal()
    return out


def construct_load(item, model):
    """E2: (κλειδί κοινού λανθάνοντος έννοιας, φόρτιση) για το item, αν το μοντέλο έχει ιεραρχικό λανθάνον."""
    cl = (model or {}).get("constructLatent") or {}
    u = cl.get("units", {}).get(item.get("factorKey") or item["id"])
    if not u:
        return None, 0.0
    return u["key"], float(u["g"])


def answer_item(item, personas, rng, factors=True, theta_override=None, model=None):
    """Στάδιο Β για ένα item: επιστρέφει πίνακα κωδικών (str) ανά πρόσωπο, με 'dk' όπου ο ερωτώμενος δεν απαντά."""
    X = feature_columns(personas)
    Z, _ = design(X, item["feats"], np.array(item["means"]))
    n = len(personas)
    codes = [o["code"] for o in item["options"]]
    out = np.empty(n, dtype=object)
    dk = np.zeros(n, dtype=bool)
    if item.get("dk"):
        p = logit_prob(Z, item["dk"])
        dk = rng.random(n) < p
    m = item["model"]
    if m["kind"] == "ordinal":
        b = np.array(m["b"])
        tau = np.array(m["tau"])
        eta = Z @ b
        lam = float(item.get("lambda", 0.0)) if factors else 0.0
        if factors and item.get("latentRow") and theta_override is None:
            # C7: e_i = Σ_k L[i,k]·z_k, z_k κοινά για όλη τη μπαταρία του προσώπου
            e = np.zeros(n)
            for k, l in enumerate(item["latentRow"]):
                if l:
                    e += l * theta(personas, f"{item['factorKey']}#{k}")
        else:
            ckey, g = construct_load(item, model) if factors else (None, 0.0)
            if item.get("factorKey") and lam != 0:
                th = theta_override if theta_override is not None else theta(personas, item["factorKey"])
                if ckey and theta_override is None:  # θ_b = g·C + √(1−g²)·u_b
                    th = g * theta(personas, ckey) + math.sqrt(max(1 - g * g, 0.0)) * th
                e = lam * th + math.sqrt(max(1 - lam * lam, 0.0)) * rng.standard_normal(n)
            elif ckey:  # μεμονωμένο item: e = κ·C + √(1−κ²)·ε
                e = g * theta(personas, ckey) + math.sqrt(max(1 - g * g, 0.0)) * rng.standard_normal(n)
            else:
                e = rng.standard_normal(n) if theta_override is None else lam * theta_override + math.sqrt(max(1 - lam * lam, 0.0)) * rng.standard_normal(n)
        y = np.searchsorted(tau, eta + e)
    else:
        P = mnl_probs(Z, m)
        y = _sample_rows(P, rng)
    for i in range(n):
        out[i] = "dk" if dk[i] else codes[int(y[i])]
    return out


def expected_dist(item, personas, weights=None):
    """Αναμενόμενη κατανομή (χωρίς δειγματοληπτικό θόρυβο) επί των ουσιαστικών επιλογών — για διαγνωστικά."""
    X = feature_columns(personas)
    Z, _ = design(X, item["feats"], np.array(item["means"]))
    m = item["model"]
    P = ordinal_probs(Z, m) if m["kind"] == "ordinal" else mnl_probs(Z, m)
    w = np.ones(len(personas)) if weights is None else weights
    return np.average(P, axis=0, weights=w)
