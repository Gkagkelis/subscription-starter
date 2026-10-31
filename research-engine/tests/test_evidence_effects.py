"""Αναπαραγώγιμες αποδείξεις ότι τα εμπειρικά στοιχεία ΕΠΗΡΕΑΖΟΥΝ τις απαντήσεις όπου πρέπει — και μόνο εκεί.

Χρησιμοποιεί την πραγματική μελέτη kotsovolos_signalyth_2026_500 (αντίγραφο), τα πραγματικά δεδομένα Eurostat και το σχέδιο
τεκμηρίωσης της μηχανής. Αν λείπουν τα ιδιωτικά δεδομένα, τα tests δηλώνονται BLOCKED (όχι PASS)."""
import json
import shutil
import tempfile
from pathlib import Path

import numpy as np
import yaml

from ase.evidence import plan as EP
from ase.llm.mock import MockProvider
from ase.llm.runtime import PROVIDERS
from ase.respond.orchestrator import Orchestrator
from ase.study import Study
from ase.util import load_structured

ROOT = Path(__file__).resolve().parents[2]
K500 = ROOT / "studies" / "kotsovolos_signalyth_2026_500"
EUROSTAT = ROOT / ".synthetic-lab-data" / "ase" / "global" / "eurostat" / "isoc_ec_ibgs"


class Blocked(Exception):
    pass


def _need():
    if not EUROSTAT.exists():
        raise Blocked(f"λείπει {EUROSTAT}")


def _copy(n=10, evidence=True, lab=False):
    d = Path(tempfile.mkdtemp()) / "k500"
    shutil.copytree(K500, d, ignore=shutil.ignore_patterns("runs", "respondent_state"))
    cfg = load_structured(d / "config.yaml")
    cfg["panel"]["sample_size"] = n
    cfg["panel"]["completes"]["max_profiles"] = n + 5
    cfg["lab"]["enabled"] = lab
    cfg["status"] = "APPROVED"
    (d / "config.yaml").write_text(yaml.safe_dump(cfg, allow_unicode=True), encoding="utf-8")
    if not evidence:
        (d / "evidence_map.yaml").write_text("components: []\n", encoding="utf-8")
    (d / "internal" / "evidence_plan.json").unlink(missing_ok=True)
    return Study(d)


class ZeroQ01(MockProvider):
    """«AI» που δίνει σκόπιμα P(Q01 = Ναι) = 0 και πολύ χαμηλή πιθανότητα online καναλιών στο Q02."""
    name = "mock"

    def generate(self, system, user, schema, max_tokens=2000):
        r = super().generate(system, user, schema, max_tokens)
        if "Q01" in r.parsed:
            r.parsed["Q01"]["probabilities"] = {"1": 0.0, "2": 0.9, "3": 0.1}
        if "Q02" in r.parsed:
            r.parsed["Q02"]["inclusion_probabilities"] = {c: (0.9 if c == "1" else 0.0) for c in r.parsed["Q02"]["inclusion_probabilities"]}
        return r


def _run(st):
    PROVIDERS["zeroq01"] = ZeroQ01
    try:
        return st.run({"provider": "zeroq01", "model": "mock-1"}, max_workers=1, batching="per_block_dep")
    finally:
        PROVIDERS.pop("zeroq01", None)


def test_empirical_bound_changes_probabilities_end_to_end():
    _need()
    with_ev, without = _copy(evidence=True), _copy(evidence=False)
    r1, r0 = _run(with_ev), _run(without)
    d1, d0 = with_ev.responses(r1), without.responses(r0)
    q1 = d1[(d1.question_id == "Q01") & (d1.status == "ANSWERED")]
    q0 = d0[(d0.question_id == "Q01") & (d0.status == "ANSWERED")]
    p1 = q1["distribution"].map(lambda s: json.loads(s)["1"])
    p0 = q0["distribution"].map(lambda s: json.loads(s)["1"])
    assert (p0 == 0).all()                                                     # χωρίς τεκμηρίωση: ό,τι είπε το «AI»
    assert (p1 > 0).all() and p1.nunique() > 1                                 # με τεκμηρίωση: όριο Eurostat ΑΝΑ ΠΡΟΣΩΠΟ
    assert q1["assumptions"].str.contains("ενεργό").all()                      # καταγράφεται ως δεσμευτικό
    assert (q1["inference_mode"] == "C_EVIDENCE_CONSTRAINED").all() and (q0["inference_mode"] == "D_AI").all()
    # Q02: ένωση online καναλιών για όσους αγόρασαν (αν υπάρχουν)· το όριο ανεβάζει τις πιθανότητες ένταξης 2/4/5/6
    q2 = d1[(d1.question_id == "Q02") & (d1.status == "ANSWERED")]
    for s in q2["distribution"]:
        d = json.loads(s)
        assert 1 - np.prod([1 - d[c] for c in ("2", "4", "5", "6")]) > 0


def test_bound_is_person_specific_and_only_where_declared():
    _need()
    st = _copy(evidence=True)
    plan = st.evidence_plan()
    orch = Orchestrator(st, plan)
    qby = st.qn.by_id()
    young = {"age_band": "25-34", "gender": "male", "education": "tertiary"}
    old = {"age_band": "65+", "gender": "female", "education": "primary"}
    comp = orch.components(qby["Q01"], "bound")[0]
    by, bo = EP.person_bound(comp, young), EP.person_bound(comp, old)
    assert by > bo > 0                                                         # ίδια πηγή, διαφορετικό πρόσωπο → διαφορετικό όριο
    parsed = {"probabilities": {"1": 0.0, "2": 0.9, "3": 0.1}}
    out, rec = orch.apply_bounds(qby["Q01"], parsed, ["1", "2", "3"], young, {})
    assert abs(out["probabilities"]["1"] - by) < 1e-9 and rec[0]["binding"]
    assert abs(sum(out["probabilities"].values()) - 1) < 1e-9 and out["probabilities"]["2"] / out["probabilities"]["3"] == 9   # ελάχιστη αλλαγή
    out2, rec2 = orch.apply_bounds(qby["Q01"], {"probabilities": {"1": 0.8, "2": 0.15, "3": 0.05}}, ["1", "2", "3"], young, {})
    assert out2["probabilities"]["1"] == 0.8 and not rec2[0]["binding"]       # μη δεσμευτικό: καμία αλλαγή
    # ερωτήσεις μάρκας: καμία αριθμητική συνιστώσα, κανένα εμπειρικό πλαίσιο
    for qid in ("Q04", "Q05", "Q08", "Q09", "Q10", "Q22", "Q24", "Q25"):
        assert not orch.components(qby[qid], "bound") and not orch.context(qby[qid], young)


def test_context_evidence_is_group_specific_text_not_probability():
    _need()
    st = _copy(evidence=True)
    orch = Orchestrator(st, st.evidence_plan())
    q14 = st.qn.by_id()["Q14"]
    a = orch.context(q14, {"age_band": "18-24", "gender": "female", "education": "tertiary"})
    b = orch.context(q14, {"age_band": "65+", "gender": "male", "education": "primary"})
    assert "Eurostat" in a and "μην το μετατρέπεις σε πιθανότητα" in a and a != b   # η τιμή της ΟΜΑΔΑΣ του προσώπου
    assert not orch.components(q14, "bound")                                        # μόνο πλαίσιο, όχι όριο


def test_pie_anchors_follow_income_quintile():
    """Οι άγκυρες PIE (στο prompt) πρέπει να συμφωνούν με το εισοδηματικό πεμπτημόριο του προφίλ."""
    _need()
    from ase.lab.bridge import available
    ok, why = available("pie-0.7")
    if not ok:
        raise Blocked(why)
    st = _copy(n=200, lab=True)
    p = st.with_lab_state(st.ensure_panel())
    e = p.assign(e=p["lab_econ4"].astype(float), q=p["income_quintile"].astype(int)).groupby("q")["e"].mean()
    assert e.loc[5] - e.loc[1] > 0.8
    assert not ((p["age_band"].isin(["18-24", "25-34"])) & (p["lab_emp"] == "retired")).any()
    assert not ((p["age_band"].isin(["45-54", "55-64", "65+"])) & (p["lab_emp"] == "student")).any()
