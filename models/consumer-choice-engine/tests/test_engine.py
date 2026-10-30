"""Έλεγχοι ΣΥΜΠΕΡΙΦΟΡΑΣ ΤΟΥ API (όχι επικύρωση μοντέλου): άρνηση χωρίς εκπαίδευση, πύλη εφαρμοσιμότητας,
αναπαραγωγιμότητα, κοινοί τυχαίοι αριθμοί μεταξύ σεναρίων. Το artifact των ελέγχων φτιάχνεται στη μνήμη από
προσομοιωμένα δεδομένα γνωστής δομής και δεν αποθηκεύεται ποτέ ως μοντέλο της CCE."""
import numpy as np

from cce.engine import ChoiceEngine
from cce.models import ConditionalLogit, MixedLogit
from cce.schema import build_design

from test_estimators import TERMS, simulate


def _artifact(kind="cl"):
    df = simulate(R=300, T=6, sd_price=0.6 if kind == "mx" else 0.0, seed=5)
    A = build_design(df, TERMS)
    cl = ConditionalLogit().fit(A)
    m = cl if kind == "cl" else MixedLogit({"price": "neglognormal"}, draws=100).fit(A, init_coef=cl.coef)
    return {"model": m.to_dict(), "terms": TERMS, "domain": {"categories": ["test_category"], "populations": ["XX"], "alternatives": ["A", "B", "none"],
            "attributes": {"price": {"range": [0.0, 2.0]}, "warranty": {"range": [0, 3]}}}, "validation": {"external": {}}}


CTX = {"category": "test_category"}
ALTS = [{"alt_id": "A", "price": 1.5, "warranty": 2}, {"alt_id": "B", "price": 1.5, "warranty": 1}, {"alt_id": "none", "price": 0.0, "warranty": 0}]


def test_not_trained_refuses():
    e = ChoiceEngine(None)
    r = e.predict_proba({}, CTX, ALTS)
    assert r["status"] == "NOT_TRAINED" and r["probabilities"] is None


def test_gate():
    e = ChoiceEngine(_artifact())
    assert e.predict_proba({}, {"category": "washing_machine_repair"}, ALTS)["status"] == "NOT_SUPPORTED"
    out = [dict(a) for a in ALTS]
    out[0]["price"] = 5.0
    assert e.predict_proba({}, CTX, out)["status"] == "EXTRAPOLATION"
    bad = [dict(a) for a in ALTS]
    bad[0]["delivery_days"] = 3
    assert e.predict_proba({}, CTX, bad)["status"] == "NOT_SUPPORTED"
    r = e.predict_proba({}, CTX, ALTS)
    assert r["status"] == "SUPPORTED" and abs(sum(r["probabilities"].values()) - 1) < 1e-9
    assert r["transfer"] == "SOURCE_POPULATION_ONLY"   # ο πληθυσμός εκπαίδευσης δεν είναι ελληνικός


def test_panel_repeatable_and_consistent():
    for kind in ("cl", "mx"):
        e = ChoiceEngine(_artifact(kind))
        panel = [{"respondent_id": f"C{i:03d}"} for i in range(200)]
        scen = {}
        for p in (1.0, 1.25, 1.5, 1.75, 2.0):
            alts = [dict(a) for a in ALTS]
            alts[0]["price"] = p
            scen[f"p{p}"] = alts
        r1 = e.simulate_panel(panel, CTX, scen, "task1", seed=3)
        r2 = e.simulate_panel(panel, CTX, scen, "task1", seed=3)
        assert r1 == r2
        # κοινοί τυχαίοι αριθμοί: όποιος επιλέγει A σε υψηλότερη τιμή, την επιλέγει και σε κάθε χαμηλότερη
        names = list(scen)
        for i in range(200):
            ch = [r1["scenarios"][n]["individual"][i]["choice"] == "A" for n in names]
            assert all(not (ch[k + 1] and not ch[k]) for k in range(len(ch) - 1))
        sh = [r1["scenarios"][n]["expected_shares"]["A"] for n in names]
        assert all(np.diff(sh) < 0)
