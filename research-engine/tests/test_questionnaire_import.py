"""Εισαγωγή ερωτηματολογίου partner JSON, λογικοί περιορισμοί, batching με διαχωρισμό εξαρτήσεων, διαδρομές skip logic."""
import copy
import json
from pathlib import Path

import numpy as np

from ase.questionnaire import model as QM
from ase.questionnaire.convert import convert, convert_condition, roundtrip_check
from ase.questionnaire.paths import enumerate_paths
from ase.respond.runner import sample_constrained
from ase.study import Study
from ase.util import load_structured
from helpers import make_study

ROOT = Path(__file__).resolve().parents[2]
K500 = ROOT / "studies" / "kotsovolos_signalyth_2026_500"
SRC = K500 / "source" / "kotsovolos_500_questionnaire.json"


def test_partner_json_converts_losslessly_and_validates():
    spec = json.loads(SRC.read_text(encoding="utf-8"))
    native, rep = convert(spec, load_structured(K500 / "integration_overlay.yaml"))
    assert roundtrip_check(spec, native) == []
    qn = QM.parse(native)
    assert [q.id for q in qn.questions] == [q["id"] for q in spec["questions"]]            # καμία ερώτηση δεν χάθηκε/συγχωνεύθηκε
    assert rep["exclusive_detected"] == {"Q02": ["7: Δεν θυμάμαι"], "Q23": ["9: Δεν γνωρίζω"], "Q30": ["10: Καμία από τις παραπάνω"]}
    assert qn.by_id()["Q19"].condition == "Q15 == '1' and Q17 == '1'"
    assert qn.by_id()["Q05"].condition == "Q04 != '1'"
    assert all(c["origin"] == "integration_overlay" for c in native["constraints"] + native["consistency_rules"])
    # το αρχείο της μελέτης είναι ακριβώς η μετατροπή (κανείς δεν το άλλαξε με το χέρι)
    on_disk = load_structured(K500 / "questionnaire.yaml")
    assert on_disk["blocks"] == native["blocks"] and on_disk["constraints"] == native["constraints"]
    # ο overlay δεν μπορεί να αλλάξει κείμενο ή επιλογές
    try:
        convert(spec, {"questions": {"Q01": {"text": "άλλο"}}})
        raise AssertionError("έπρεπε να απορριφθεί")
    except ValueError:
        pass


def test_condition_syntax_and_errors():
    types = {"A": "single", "M": "multi"}
    assert convert_condition("all", types) is None
    assert convert_condition("A=1 OR A!=2", types) == "A == '1' or A != '2'"
    assert convert_condition("M=3", types) == "contains(M, '3')"
    for bad in ("A>1", "Z=1"):
        try:
            convert_condition(bad, types)
            raise AssertionError(bad)
        except ValueError:
            pass


def test_all_paths_reachable_and_constraints_satisfiable():
    st = Study(K500)
    r = enumerate_paths(st.qn)
    assert r["ok"] and not r["never_asked"] and r["distinct_paths"] == 10
    assert set(r["gates"]) == {"Q01", "Q04", "Q05", "Q15", "Q17"}
    # Q04=1 (δεν γνωρίζει την αλυσίδα) ⇒ καμία ερώτηση αξιολόγησης μάρκας
    unaware = [p for p in r["paths"] if any(g.get("Q04") == "1" for g in p["gate_values"])]
    assert unaware and all({"Q05", "Q08", "Q09", "Q24", "Q34"} <= set(p["skipped"]) for p in unaware)
    assert all(not any(g.get("Q01") == "2" and g.get("Q05") == "1" for g in p["gate_values"]) for p in r["paths"])   # C1


def test_constraints_truncate_single_and_multi_choice():
    st = Study(K500)
    qby = st.qn.by_id()
    q05, q23 = qby["Q05"], qby["Q23"]
    rng = np.random.default_rng(1)
    cons = QM.constraints_for(st.qn, "Q05")
    for _ in range(50):
        a, d, notes = sample_constrained(q05, {"probabilities": {"1": .9, "2": .05, "3": .05}}, ["1", "2", "3"], rng, cons, {"Q01": "2"}, {})
        assert a != "1" and d["1"] == 0 and notes
    a, d, notes = sample_constrained(q05, {"probabilities": {"1": .9, "2": .05, "3": .05}}, ["1", "2", "3"], rng, cons,
                                     {"Q01": "1", "Q02": ["1"]}, {})
    assert notes == []                                                                       # χωρίς ενεργό περιορισμό: τίποτα δεν αλλάζει
    cons23 = QM.constraints_for(st.qn, "Q23")
    probs = {c: (0.95 if c == "7" else 0.01) for c in q23.codes}
    for _ in range(50):
        a, d, notes = sample_constrained(q23, {"inclusion_probabilities": probs}, q23.codes, rng, cons23, {"Q04": "1"}, {})
        assert a and "7" not in a and len(a) >= 1


def test_per_block_dep_splits_on_dependencies_only():
    st = Study(K500)
    units = QM.split_units(st.qn, st.qn.questions)
    ids = [[q.id for q in u] for u in units]
    assert ["Q01"] in ids and ["Q05"] in ids and ["Q02", "Q03", "Q04"] in ids and ["Q06", "Q07"] in ids
    assert ["Q08"] in ids and ["Q09"] in ids and ["Q10", "Q11"] in ids                     # sequential: συνέπεια εικόνας/εμπιστοσύνης
    for u in units:                                                                          # καμία εξάρτηση μέσα στην ίδια μονάδα
        uid = {q.id for q in u}
        for q in u:
            refs = QM.condition_refs(q.condition) if q.condition else set()
            refs |= {r for c in QM.constraints_for(st.qn, q.id) for r in c["refs"] if r != q.id}
            assert not (refs & uid), (q.id, refs & uid)


def test_k500_mock_run_coherent_reproducible_and_audited(tmp=None):
    """Τεχνικός έλεγχος (mock, χωρίς ερευνητική αξία) σε αντίγραφο της μελέτης: completes, περιορισμοί, missing_reason, ιστορικό."""
    import shutil
    import tempfile
    d = Path(tempfile.mkdtemp()) / "k500"
    shutil.copytree(K500, d, ignore=shutil.ignore_patterns("runs"))
    cfg = load_structured(d / "config.yaml")
    cfg["panel"]["sample_size"] = 40
    cfg["panel"]["completes"]["max_profiles"] = 60
    cfg["lab"]["enabled"] = False
    cfg["status"] = "DRAFT_PENDING_PARTNER_APPROVAL"
    import yaml
    from ase.study import ConfirmationRequired
    (d / "config.yaml").write_text(yaml.safe_dump(cfg, allow_unicode=True), encoding="utf-8")
    try:                                                             # πύλη έγκρισης: DRAFT ⇒ καμία πλήρης εκτέλεση
        Study(d).run({"provider": "mock", "model": "mock-1"}, max_workers=1)
        raise AssertionError("έπρεπε να απορριφθεί όσο το status είναι DRAFT")
    except ConfirmationRequired:
        pass
    cfg["status"] = "APPROVED"
    (d / "config.yaml").write_text(yaml.safe_dump(cfg, allow_unicode=True), encoding="utf-8")
    st = Study(d)
    st.ensure_panel(regenerate=True)
    from ase.llm.mock import MockProvider
    from ase.llm.runtime import PROVIDERS
    seen = []

    class Rec(MockProvider):
        name = "mock"

        def generate(self, system, user, schema, max_tokens=2000):
            seen.append(system + user)
            return super().generate(system, user, schema, max_tokens)
    PROVIDERS["recmock_k500"] = Rec
    try:
        rid = st.run({"provider": "recmock_k500", "model": "mock-1"}, max_workers=1, batching="per_block_dep")
    finally:
        PROVIDERS.pop("recmock_k500", None)
    # η αναφορά Signalyth είναι πηγή σκεπτικού, όχι δεδομένα: δεν εμφανίζεται ποτέ στο prompt (ούτε rationale/source_pages)
    assert seen and not any(w in p for p in seen for w in ("Signalyth", "Viewscope", "source_pages", "Στρωματοποίηση ηλικιών"))
    late = [p for p in seen if "ΕΡΩΤΗΣΗ Q34" in p]
    assert late and all("Q04 «" in p for p in late)                     # οι πύλες μένουν στο ιστορικό ως το τέλος (history_window)
    man = json.loads((st.internal / "runs" / rid / "execution_manifest.json").read_text(encoding="utf-8"))
    assert man["completes"]["achieved_completes"] == 40 and man["errors"] == 0
    df = st.responses(rid)
    assert (df[df.status == "SKIPPED"]["missing_reason"] == "not_applicable").all()
    a = {(r.respondent_id, r.question_id): json.loads(r.response) for r in df[df.status == "ANSWERED"].itertuples()}
    for (r, q), v in a.items():
        if q == "Q05" and v == "1":
            assert a.get((r, "Q01")) != "2"
        if q == "Q23" and "7" in v:
            assert a.get((r, "Q04")) != "1"
    qc = json.loads((st.internal / "runs" / rid / "quality_checks.json").read_text(encoding="utf-8"))
    assert next(c for c in qc["checks"] if c["check"] == "Παραβιάσεις λογικών περιορισμών")["status"] == "PASS"


def test_session_provider_full_run_needs_only_confirm():
    """Ο πάροχος συνεδρίας δεν χρεώνεται ανά κλήση: πλήρης εκτέλεση με --confirm, χωρίς προϋπολογισμό σε USD."""
    from ase.llm.base import LLMProvider
    from ase.llm.session_provider import ClaudeSessionProvider
    assert LLMProvider.metered is True and ClaudeSessionProvider.metered is False
