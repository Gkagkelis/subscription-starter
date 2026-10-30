"""Έλεγχοι ΟΡΘΟΤΗΤΑΣ ΚΩΔΙΚΑ των εκτιμητών (όχι επικύρωση μοντέλου).

Χρησιμοποιούν προσομοιωμένα δεδομένα με ΓΝΩΣΤΟΥΣ συντελεστές μόνο για να ελέγξουν ότι ο κώδικας ανακτά τους συντελεστές
(parameter recovery) και ότι οι αναλυτικές κλίσεις είναι σωστές. Τα δεδομένα αυτά δεν χρησιμοποιούνται ποτέ ως εκπαίδευση
ή αξιολόγηση της CCE· δεν παράγουν κανένα ποσοστό καταναλωτικής προτίμησης.
    python3 -I -m pytest -q tests   (από τον φάκελο models/consumer-choice-engine)
"""
import numpy as np
import pandas as pd
from scipy.optimize import approx_fprime

from cce.evaluate import metrics, respondent_split
from cce.models import ConditionalLogit, MixedLogit
from cce.schema import build_design, validate

TERMS = [{"name": "price", "kind": "attr", "col": "price"}, {"name": "warranty", "kind": "attr", "col": "warranty"}, {"name": "asc_none", "kind": "asc", "alt": "none"}]


def simulate(R=400, T=6, beta=(-1.5, 0.6, -0.4), sd_price=0.0, seed=1):
    rng = np.random.default_rng(seed)
    rows = []
    for r in range(R):
        bp = beta[0] + sd_price * rng.normal()
        for t in range(T):
            alts = [("A", rng.choice([1.0, 1.5, 2.0]), rng.choice([1, 2, 3])), ("B", rng.choice([1.0, 1.5, 2.0]), rng.choice([1, 2, 3])), ("none", 0.0, 0)]
            v = np.array([bp * p + beta[1] * w + (beta[2] if a == "none" else 0) for a, p, w in alts])
            ch = np.argmax(v + rng.gumbel(size=3))
            for j, (a, p, w) in enumerate(alts):
                rows.append({"respondent_id": f"r{r}", "situation_id": f"r{r}_t{t}", "alt_id": a, "chosen": int(j == ch), "price": p, "warranty": w})
    return pd.DataFrame(rows)


def test_schema_and_split():
    df = simulate(R=50, T=2)
    assert validate(df, ["price", "warranty"]) == []
    sp = respondent_split(df["respondent_id"].unique())
    assert set(sp.values()) <= {"train", "validation", "test"}
    # κανένας ερωτώμενος σε δύο σύνολα (από κατασκευή), και αναπαραγώγιμο
    assert sp == respondent_split(df["respondent_id"].unique())


def test_conditional_logit_gradient_and_recovery():
    df = simulate()
    A = build_design(df, TERMS)
    m = ConditionalLogit()
    b = np.array([-1.0, 0.3, 0.1])
    f = lambda x: m._nll(x, A)[0]
    num = approx_fprime(b, f, 1e-6)
    assert np.allclose(num, m._nll(b, A)[1], atol=1e-3)
    m.fit(A)
    assert np.all(np.abs(m.coef - np.array([-1.5, 0.6, -0.4])) < 3 * m.se + 0.05)
    mt = metrics(A, m.predict_rows(A))
    assert mt["log_loss"] < mt["null_log_loss_uniform"]


def test_mixed_logit_gradient_and_recovery():
    df = simulate(R=300, T=8, sd_price=0.8, seed=3)
    A = build_design(df, TERMS)
    mx = MixedLogit({"price": "normal"}, draws=100)
    mx._setup(A)
    th = np.array([0.5, -0.2, -1.2, np.log(0.5)])
    f = lambda x: mx._nll(x, A)[0]
    num = approx_fprime(th, f, 1e-6)
    assert np.allclose(num, mx._nll(th, A)[1], rtol=1e-3, atol=1e-2)
    cl = ConditionalLogit().fit(A)
    mx.fit(A, init_coef=cl.coef)
    names = mx.param_names()
    est = dict(zip(names, mx.theta))
    assert abs(est["price:mu"] + 1.5) < 0.35
    assert 0.4 < np.exp(est["price:log_sd"]) < 1.3
    assert mx.loglik > cl.loglik
