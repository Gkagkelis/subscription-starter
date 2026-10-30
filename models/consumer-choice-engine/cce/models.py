"""CCE — εκτιμητές διακριτής επιλογής (χωρίς εξωτερικές βιβλιοθήκες choice modelling· numpy/scipy).

  MarginalShares   baseline «πλειοψηφίας»: μερίδιο κάθε alt_id στα δεδομένα εκπαίδευσης (καμία εξάρτηση από χαρακτηριστικά)
  ConditionalLogit MNL/conditional logit με μέγιστη πιθανοφάνεια· αναλυτική κλίση και Hessian· τυπικά σφάλματα sandwich
                   ομαδοποιημένα ανά ερωτώμενο (οι επιλογές του ίδιου ατόμου δεν είναι ανεξάρτητες)
  MixedLogit       panel mixed logit (κανονικοί ή αρνητικοί-λογαριθμοκανονικοί τυχαίοι συντελεστές), simulated ML με
                   scrambled Halton draws, ίδιες κληρώσεις για όλες τις επιλογές του ίδιου ερωτώμενου
Όλοι οι συντελεστές προκύπτουν από εκτίμηση σε δεδομένα· δεν υπάρχουν σταθερές «παραδοχές» μέσα στους εκτιμητές.
"""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize
from scipy.stats import norm, qmc

from .schema import ChoiceArrays


def _seg_logsumexp(v, starts, n):
    m = np.maximum.reduceat(v, starts)
    rep = np.repeat(m, np.diff(np.r_[starts, n]))
    s = np.add.reduceat(np.exp(v - rep), starts)
    return m + np.log(s)


def _probs(v, starts, n):
    lse = _seg_logsumexp(v, starts, n)
    return np.exp(v - np.repeat(lse, np.diff(np.r_[starts, n])))


class MarginalShares:
    kind = "marginal_shares"

    def fit(self, A: ChoiceArrays):
        alts, inv = np.unique(A.alt_ids, return_inverse=True)
        w = np.bincount(inv, weights=A.y, minlength=len(alts))
        self.shares = dict(zip(alts.tolist(), ((w + 0.5) / (w.sum() + 0.5 * len(alts))).tolist()))
        return self

    def predict_rows(self, A: ChoiceArrays):
        s = np.array([self.shares.get(a, 1e-6) for a in A.alt_ids])
        tot = np.add.reduceat(s, A.sit_start)
        return s / np.repeat(tot, np.diff(np.r_[A.sit_start, len(s)]))

    def to_dict(self):
        return {"kind": self.kind, "shares": self.shares}


class ConditionalLogit:
    kind = "conditional_logit"

    def __init__(self, l2=0.0):
        self.l2 = l2

    def _nll(self, b, A):
        v = A.X @ b
        n = len(v)
        lse = _seg_logsumexp(v, A.sit_start, n)
        ll = (v * A.y).sum() - lse.sum()
        p = np.exp(v - np.repeat(lse, np.diff(np.r_[A.sit_start, n])))
        g = A.X.T @ (A.y - p)
        return -ll + 0.5 * self.l2 * b @ b, -g + self.l2 * b

    def fit(self, A: ChoiceArrays, b0=None):
        p = A.X.shape[1]
        r = minimize(self._nll, np.zeros(p) if b0 is None else b0, args=(A,), jac=True, method="BFGS", options={"gtol": 1e-7, "maxiter": 2000})
        self.coef = r.x
        self.converged = bool(r.success)
        self.loglik = -r.fun + 0.5 * self.l2 * r.x @ r.x
        self.feature_names = list(A.feature_names)
        self._cov(A)
        return self

    def _cov(self, A):
        """Hessian (αναλυτικό) και sandwich ομαδοποιημένο ανά ερωτώμενο."""
        n = len(A.y)
        p = _probs(A.X @ self.coef, A.sit_start, n)
        Xp = A.X * p[:, None]
        sx = np.add.reduceat(Xp, A.sit_start)                      # E[x] ανά κατάσταση
        H = A.X.T @ Xp - sx.T @ sx                                  # πληροφορία Fisher
        H += self.l2 * np.eye(len(self.coef))
        sc = np.add.reduceat(A.X * (A.y - p)[:, None], A.sit_start)  # score ανά κατάσταση
        R = A.sit_resp.max() + 1
        cl = np.zeros((R, sc.shape[1]))
        np.add.at(cl, A.sit_resp, sc)
        try:
            Hi = np.linalg.inv(H)
        except np.linalg.LinAlgError:
            Hi = np.linalg.pinv(H)
        self.cov_model = Hi
        self.cov_robust = Hi @ (cl.T @ cl) @ Hi * (R / max(R - 1, 1))
        self.se = np.sqrt(np.clip(np.diag(self.cov_robust), 0, None))

    def predict_rows(self, A: ChoiceArrays, coef=None):
        return _probs(A.X @ (self.coef if coef is None else coef), A.sit_start, len(A.y))

    def to_dict(self):
        return {"kind": self.kind, "features": self.feature_names, "coef": self.coef.tolist(), "se_robust": self.se.tolist(),
                "cov_robust": self.cov_robust.tolist(), "loglik": float(self.loglik), "converged": self.converged, "l2": self.l2}


def halton_normals(R, D, seed):
    eng = qmc.Halton(d=max(D, 1), scramble=True, seed=seed)
    u = eng.random(R)
    return norm.ppf(np.clip(u, 1e-10, 1 - 1e-10))[:, :D]


class MixedLogit:
    """Panel mixed logit. random: {feature_name: 'normal'|'neglognormal'}. Παράμετροι: [σταθεροί β] + [μ, log σ] ανά τυχαίο."""
    kind = "mixed_logit"

    def __init__(self, random: dict, draws=200, seed=20261030):
        self.random = dict(random)
        self.draws = draws
        self.seed = seed

    def _setup(self, A):
        names = list(A.feature_names)
        self.rand_idx = [names.index(k) for k in self.random]
        self.fix_idx = [i for i in range(len(names)) if i not in self.rand_idx]
        self.dist = [self.random[names[i]] for i in self.rand_idx]
        R_resp = A.sit_resp.max() + 1
        # ανεξάρτητες scrambled Halton ακολουθίες ανά ερωτώμενο (ίδιες για όλες τις επιλογές του)
        self.Z = np.stack([halton_normals(self.draws, len(self.rand_idx), self.seed + r) for r in range(R_resp)])  # (R_resp, D, K)

    def _betas(self, theta):
        nf = len(self.fix_idx)
        bf = theta[:nf]
        mu = theta[nf::2][: len(self.rand_idx)]
        ls = theta[nf + 1::2][: len(self.rand_idx)]
        sd = np.exp(ls)
        raw = mu[None, None, :] + sd[None, None, :] * self.Z                     # (R, D, K)
        br = raw.copy()
        for k, d in enumerate(self.dist):
            if d == "neglognormal":
                br[..., k] = -np.exp(raw[..., k])
        return bf, mu, sd, raw, br

    def _nll(self, theta, A):
        bf, mu, sd, raw, br = self._betas(theta)
        n = len(A.y)
        Xf = A.X[:, self.fix_idx]
        Xr = A.X[:, self.rand_idx]
        resp_row = A.sit_resp[A.row_sit]
        vfix = Xf @ bf                                                           # (n,)
        vr = np.einsum("nk,ndk->nd", Xr, br[resp_row])                           # (n, D)
        v = vfix[:, None] + vr
        # πιθανότητα επιλεγμένης ανά κατάσταση και κλήρωση
        m = np.maximum.reduceat(v, A.sit_start, axis=0)
        e = np.exp(v - np.repeat(m, np.diff(np.r_[A.sit_start, n]), axis=0))
        den = np.add.reduceat(e, A.sit_start, axis=0)
        num = np.add.reduceat(e * A.y[:, None], A.sit_start, axis=0)
        lp_sit = np.log(np.maximum(num, 1e-300)) - np.log(den)                   # (S, D)· προστασία υποροής
        R = A.sit_resp.max() + 1
        lp_resp = np.zeros((R, self.draws))
        np.add.at(lp_resp, A.sit_resp, lp_sit)
        mx = lp_resp.max(1, keepdims=True)
        L = np.exp(lp_resp - mx)                                                 # (R, D)
        ll = (mx[:, 0] + np.log(L.mean(1))).sum()
        # κλίση
        P = e / np.repeat(den, np.diff(np.r_[A.sit_start, n]), axis=0)          # (n, D)
        w = L / L.sum(1, keepdims=True)                                          # βάρη κληρώσεων ανά ερωτώμενο
        wrow = w[resp_row]                                                       # (n, D)
        res = (A.y[:, None] - P) * wrow                                          # (n, D)
        g_fix = Xf.T @ res.sum(1)
        g = [g_fix]
        for k, d in enumerate(self.dist):
            xk = Xr[:, k][:, None] * res                                         # (n, D)
            z = self.Z[resp_row, :, k]
            if d == "normal":
                dmu = 1.0
                dsd = z
            else:  # β = -exp(μ + σ z)
                bk = br[resp_row, :, k]
                dmu = bk
                dsd = bk * z
            g.append(np.array([(xk * dmu).sum(), (xk * dsd).sum() * sd[k]]))
        grad = np.concatenate([g[0]] + [x for x in g[1:]])
        return -ll, -grad

    def fit(self, A: ChoiceArrays, init_coef=None):
        self._setup(A)
        nf = len(self.fix_idx)
        th0 = np.zeros(nf + 2 * len(self.rand_idx))
        if init_coef is not None:
            th0[:nf] = np.asarray(init_coef)[self.fix_idx]
            for k, i in enumerate(self.rand_idx):
                c = init_coef[i]
                th0[nf + 2 * k] = c if self.dist[k] == "normal" else np.log(max(-c, 1e-3))
                th0[nf + 2 * k + 1] = np.log(0.5 * abs(c) + 0.1) if self.dist[k] == "normal" else np.log(0.5)
        r = minimize(self._nll, th0, args=(A,), jac=True, method="BFGS", options={"gtol": 1e-5, "maxiter": 3000})
        self.theta = r.x
        self.converged = bool(r.success)
        self.loglik = -r.fun
        self.feature_names = list(A.feature_names)
        # αριθμητικό Hessian από την αναλυτική κλίση → τυπικά σφάλματα
        eps = 1e-4
        k = len(r.x)
        H = np.zeros((k, k))
        for j in range(k):
            d = np.zeros(k)
            d[j] = eps
            H[:, j] = (self._nll(r.x + d, A)[1] - self._nll(r.x - d, A)[1]) / (2 * eps)
        H = 0.5 * (H + H.T)
        try:
            self.cov = np.linalg.inv(H)
        except np.linalg.LinAlgError:
            self.cov = np.linalg.pinv(H)
        self.se = np.sqrt(np.clip(np.diag(self.cov), 0, None))
        return self

    def param_names(self):
        nf = [self.feature_names[i] for i in self.fix_idx]
        out = list(nf)
        for i in self.rand_idx:
            out += [f"{self.feature_names[i]}:mu", f"{self.feature_names[i]}:log_sd"]
        return out

    def individual_betas(self, theta, z):
        """z: (K,) κανονικές κληρώσεις ενός ατόμου → πλήρες διάνυσμα συντελεστών."""
        nf = len(self.fix_idx)
        b = np.zeros(len(self.feature_names))
        b[self.fix_idx] = theta[:nf]
        for k, i in enumerate(self.rand_idx):
            mu, sd = theta[nf + 2 * k], np.exp(theta[nf + 2 * k + 1])
            b[i] = mu + sd * z[k] if self.dist[k] == "normal" else -np.exp(mu + sd * z[k])
        return b

    def predict_rows(self, A: ChoiceArrays, theta=None, draws=500, seed=7):
        """Πρόβλεψη για ΝΕΟΥΣ ερωτώμενους: ολοκλήρωση στην κατανομή του πληθυσμού (όχι ατομικές κληρώσεις εκπαίδευσης)."""
        th = self.theta if theta is None else theta
        Z = halton_normals(draws, len(self.rand_idx), seed)
        n = len(A.y)
        acc = np.zeros(n)
        for d in range(draws):
            b = self.individual_betas(th, Z[d])
            acc += _probs(A.X @ b, A.sit_start, n)
        return acc / draws

    def to_dict(self):
        return {"kind": self.kind, "features": self.feature_names, "random": self.random, "draws": self.draws, "seed": self.seed,
                "params": self.param_names(), "theta": self.theta.tolist(), "se": self.se.tolist(), "cov": self.cov.tolist(),
                "loglik": float(self.loglik), "converged": self.converged}
