"""Tests αποδοχής της ενοποίησης Lab (TypeScript) + ASE (Python) + lake + διεθνές επίπεδο.
Όπου χρειάζονται τα ιδιωτικά δεδομένα (lake, μοντέλο PIE, λήψεις Eurostat) και λείπουν, τα tests ΠΑΡΑΛΕΙΠΟΝΤΑΙ ρητά (BLOCKED),
δεν «περνούν» σιωπηρά."""
import copy
import json
from pathlib import Path

import yaml

from ase.evidence import lake_index as LX
from ase.evidence.interpret import interpret
from ase.evidence.suitability import assess_candidate, assess_component
from ase.llm.mock import MockProvider
from ase.llm.runtime import PROVIDERS
from ase.questionnaire import model as QM
from ase.study import Study
from ase.util import read_json
from helpers import QUESTIONNAIRE, make_study

ROOT = Path(__file__).resolve().parents[2]
KOTS = ROOT / "studies" / "kotsovolos_trust_2026"


class Blocked(Exception):
    pass


def _need(*paths):
    for p in paths:
        if not Path(p).exists():
            raise Blocked(f"λείπει {p}")


def _lab_ok():
    from ase.lab.bridge import available
    ok, why = available("pie-0.7")
    if not ok:
        raise Blocked(why)


ECON = {"id": "E1", "text": "Με το συνολικό εισόδημα του νοικοκυριού σας, πώς τα βγάζετε πέρα;", "type": "single_choice",
        "options": ["Δεν τα βγάζουμε πέρα", "Τα βγάζουμε πέρα με δυσκολία", "Τα βγάζουμε πέρα αλλά δεν περισσεύουν", "Τα βγάζουμε πέρα άνετα"]}


class Recording(MockProvider):
    name = "mock"
    prompts: list = []

    def generate(self, system, user, schema, max_tokens=2000):
        Recording.prompts.append(user)
        return super().generate(system, user, schema, max_tokens)


def test_shared_identity_lab_and_ai_in_same_study():
    _lab_ok()
    q = copy.deepcopy(QUESTIONNAIRE)
    q["blocks"][1]["questions"].insert(0, ECON)
    st = Study(make_study("int_lab", n=8, questionnaire=q, extra_cfg={"lab": {"enabled": True, "model": "pie-0.7"}}))
    PROVIDERS["recmock"] = Recording
    Recording.prompts = []
    try:
        rid = st.run({"provider": "recmock", "model": "mock-1"}, max_workers=1)
    finally:
        PROVIDERS.pop("recmock", None)
    df = st.responses(rid)
    e1 = df[(df.question_id == "E1") & (df.status == "ANSWERED")]
    assert len(e1) and (e1.inference_mode == "A_EMPIRICAL").all() and (e1.provider == "lab").all()          # Lab απαντά
    k1 = df[(df.question_id == "K1") & (df.status == "ANSWERED")]
    assert len(k1) and set(k1.inference_mode) <= {"D_AI", "C_EVIDENCE_INFORMED"}                              # AI στην ίδια έρευνα
    state = st.with_lab_state(st.profiles(rid)).set_index("respondent_id")
    for r in e1.itertuples():                                                                                 # ίδια κατάσταση/ταυτότητα
        econ = int(float(state.loc[r.respondent_id, "lab_econ4"]))
        assert json.loads(r.response) == str(econ), (r.respondent_id, r.response, econ)
    assert any("Εκτιμώμενα χαρακτηριστικά" in p and "οικονομική κατάσταση" in p for p in Recording.prompts)     # το AI βλέπει την ίδια κατάσταση
    plan = read_json(st.internal / "runs" / rid / "evidence_plan_used.json")
    assert plan["questions"]["E1"]["mode"] == "A_EMPIRICAL" and plan["questions"]["E1"]["lab"]["tier"] == 4


def test_lake_values_are_real_and_crosschecked():
    _need(LX.QB, LX.DB)
    from ase.evidence.plan import lake_crosscheck
    from ase.global_evidence.eurostat import ROOT as GROOT
    _need(GROOT / "isoc_ec_ibgs")
    from ase.evidence.bounds import greek_targets
    t = greek_targets("isoc_ec_ibgs", "I_BEEQU1", "PC_IND")
    cc = lake_crosscheck("isoc_ec_ibgs", "I_BEEQU1", t["year"], t["total"])
    assert cc["status"] == "MATCH", cc                                                                          # ίδια τιμή lake και επίσημου API
    hits = LX.find_by_text("eurostat:isoc_ec_ibgs", "consumer electronics or household appliances")
    vals = [v for h in hits for v in LX.values("eurostat:isoc_ec_ibgs", h["code"]) if v["group_dim"] == "all" and v["year"] == "2023"]
    assert any(abs(v["value"] - 8.78) < 1e-6 for v in vals)


def test_missed_eurostat_discoverable_and_false_matches_rejected():
    _need(LX.QB, LX.DB)
    c = LX.candidates("delivery_problem", limit=20)
    assert any(x["study_id"] == "eurostat:isoc_ec_iprb21" and "delivery_problem" in x["constructs"] for x in c)
    qn = QM.load(KOTS / "questionnaire.yaml")
    qi_s1, qi_q7 = interpret(qn.by_id()["S1"]), interpret(qn.by_id()["Q7"])
    dvd = assess_candidate({"text": "Το νοικοκυριό διαθέτει συσκευή DVD", "constructs": ["appliance_ownership"], "years": "2020"}, qi_s1)
    rec = assess_candidate({"text": "Ζητάτε αποδείξεις αγοράς", "constructs": [], "years": "2024"}, qi_q7)
    assert dvd["rejected"] and "purchase" in dvd["checks"][0]["detail"]
    assert rec["rejected"] and "trust" in rec["checks"][0]["detail"]


def test_kotsovolos_plan_generic_vs_brand_and_option_level():
    _need(LX.QB, LX.DB, KOTS / "evidence_map.yaml")
    from ase.evidence.plan import build
    p = build(Study(KOTS), use_lab=False)
    q = p["questions"]
    s1 = [c for c in q["S1"]["components"] if c["spec"]["source"]["indicator"] == "I_BEEQU1"][0]
    assert s1["class"] == "DIRECT_EMPIRICAL" and q["S1"]["mode"] == "C_EVIDENCE_CONSTRAINED"                     # γενική ερώτηση σε έρευνα μάρκας
    assert q["Q7"]["mode"] == "D_AI" and q["Q7"]["brand_dependent"] and not q["Q7"]["components"]               # εμπιστοσύνη μάρκας: όχι γενικό ποσοστό
    assert all(any(k["check"] == "μάρκα" and not k["pass"] for k in c["checks"]) for c in q["Q7"]["lake_candidates"] if not c["rejected"])
    assert set(q["Q1"]["option_modes"]) == {"2", "3", "4", "7"}                                                 # ίδια ερώτηση: εμπειρικές + AI επιλογές
    bh = [c for c in q["S1"]["components"] if c["spec"]["source"]["indicator"] == "I_BHARD1"][0]
    assert bh["class"] != "DIRECT_EMPIRICAL" and any(not k["pass"] and "ανακατασκευή" in k["check"] for k in bh["checks"])   # μη χρήσιμο μοντέλο: δεν εφαρμόζεται
    assert p["brand"]["baseline_evidence"] == "none"


def test_bounds_keep_coherent_distributions():
    from ase.respond.orchestrator import Orchestrator
    plan = {"questions": {"X": {"mode": "C_EVIDENCE_CONSTRAINED", "components": [
        {"usable": True, "class": "DIRECT_EMPIRICAL", "spec": {"relation": "lower_bound", "target": {"option": "1"}, "source": {"indicator": "T", "dataset": "d"}},
         "_model": {"usable": True, "intercept": 0.0, "effects": {"age_band": {"35-44": 0.0}, "gender": {"male": 0.0}, "edu3": {"I5_8": 0.0}}}},
        {"usable": True, "class": "DIRECT_EMPIRICAL", "spec": {"relation": "lower_bound_union", "target": {"options": ["2", "3"]}, "source": {"indicator": "U", "dataset": "d"}},
         "_model": {"usable": True, "intercept": 0.0, "effects": {"age_band": {"35-44": 0.0}, "gender": {"male": 0.0}, "edu3": {"I5_8": 0.0}}}}]}}}
    o = Orchestrator(None, plan)
    q = type("Q", (), {"id": "X"})()
    prof = {"age_band": "35-44", "gender": "male", "education": "tertiary"}
    out, rec = o.apply_bounds(q, {"probabilities": {"1": 0.1, "2": 0.6, "3": 0.3}}, ["1", "2", "3"], prof, {})
    p = out["probabilities"]
    assert abs(sum(p.values()) - 1) < 1e-9 and abs(p["1"] - 0.5) < 1e-6 and rec[0]["binding"]                    # όριο 50%, κανονικοποίηση
    out2, rec2 = o.apply_bounds(q, {"inclusion_probabilities": {"1": 0.9, "2": 0.1, "3": 0.1}}, ["1", "2", "3"], prof, {})
    ip = out2["inclusion_probabilities"]
    assert 1 - (1 - ip["2"]) * (1 - ip["3"]) >= 0.5 - 1e-6 and all(0 <= v <= 1 for v in ip.values()) and ip["1"] == 0.9


def test_suitability_downgrades_and_error_semantics():
    qn = QM.load(KOTS / "questionnaire.yaml")
    qi = interpret(qn.by_id()["S1"])
    comp = {"relation": "lower_bound", "justification": "x"}
    old = assess_component(comp, qi, {"greek": True, "year": 2012, "unit": "PC_IND", "model_usable": True, "max_margin_error_pp": 0.5})
    foreign = assess_component({**comp, "relation": "proxy"}, qi, {"greek": False, "year": 2024, "unit": "PC_IND"})
    assert old["class"] == "INSUFFICIENT_EVIDENCE" and foreign["class"] == "INSUFFICIENT_EVIDENCE"
    assert assess_component(comp, qi, {"error_kind": "unavailable", "error": "x"})["class"] == "UNAVAILABLE_SOURCE"
    assert assess_component(comp, qi, {"error_kind": "retrieval", "error": "x"})["class"] == "RETRIEVAL_ERROR"


def test_retrieval_failure_is_not_absence(tmp_path=None):
    import tempfile
    from ase.evidence import plan as EP
    saved = (LX.QB, LX.DB, LX.INDEX)
    LX.QB, LX.DB, LX.INDEX = Path("/nonexistent/qb.csv"), Path("/nonexistent/db.csv.gz"), Path(tempfile.mkdtemp()) / "x.sqlite"
    try:
        p = EP.build(Study(make_study("int_nolake", n=4, extra_cfg={})), use_lab=False)
        assert p["lake_error"] and "λείπει" in p["lake_error"]
    finally:
        LX.QB, LX.DB, LX.INDEX = saved
    from ase.global_evidence.eurostat import SourceUnavailable, load
    try:
        load("no_such_dataset_xyz")
        raise AssertionError
    except SourceUnavailable:
        pass


def test_transport_validated_and_international_not_greek():
    from ase.validation.transport import decisions
    d = decisions()
    if not d:
        raise Blocked("δεν υπάρχει επικύρωση LOCO (ase_cli.py validate-transport)")
    assert d["I_BEEQU1|PC_IND|age"]["approved"] and not d["I_IUIF|PC_IND|sex"]["approved"]
    from ase.evidence.bounds import greek_targets
    t = greek_targets("isoc_ec_ibgs", "I_BEEQU1", "PC_IND")
    tr = {g: c for g, c in t["cells"].items() if c["source"] == "transported"}
    assert tr and all("mae" in c for c in tr.values())                                                         # μεταφερμένα κελιά σημασμένα, με περιθώριο
    assert all(c["source"] != "transported" for g, c in t["cells"].items() if g in ("M_Y16_74", "F_Y16_74"))


def test_no_default_fixed_hybrid_weight():
    src = (ROOT / "research-engine" / "ase" / "respond" / "runner.py").read_text(encoding="utf-8")
    assert "hybrid_weight" not in src and '"hybrid", {}' not in src
    assert "hybrid_weight" not in (ROOT / "research-engine" / "ase" / "templates.py").read_text(encoding="utf-8")


def test_bridge_cache_keys_and_typed_errors():
    _lab_ok()
    from ase.lab.bridge import LabBridgeError, LabUnavailable, call
    a = call("route", {"model": "pie-0.7", "ref": "2026-10", "questions": [ECON]})
    b = call("route", {"model": "pie-0.7", "ref": "2026-10", "questions": [ECON]})
    assert a == b and a["questions"][0]["decision"]["tier"] == 4
    try:
        call("anchors", {"model": "pie-9.9", "respondents": []})
        raise AssertionError
    except LabUnavailable:
        pass
    try:
        call("nonsense", {"model": "pie-0.7"})
        raise AssertionError
    except LabBridgeError:
        pass


def test_synthetic_label_on_every_output_and_brand_sensitivity_in_report():
    """Κάθε έξοδος φέρει «ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ»· οι ερωτήσεις μάρκας παίρνουν ανάλυση ευαισθησίας
    (εσωτερικό JSON + σύντομη ενότητα στην αναφορά) χωρίς ετικέτες προέλευσης ανά ερώτηση."""
    import pandas as pd
    from ase.study import SYNTH_LABEL
    q = copy.deepcopy(QUESTIONNAIRE)
    q["blocks"][1]["questions"][1] = {"id": "L1", "text": "Πόσο εμπιστεύεστε την Κωτσόβολος;", "type": "likert", "condition": "K1 == '1'", "scale": {"points": 5}}
    d = make_study("int_label", n=10, questionnaire=q)
    (d / "evidence_map.yaml").write_text("components: []\n", encoding="utf-8")
    st = Study(d)
    rid = st.run({"provider": "mock", "model": "mock-1"}, max_workers=1)
    assert read_json(st.internal / "runs" / rid / "execution_manifest.json")["label"] == SYNTH_LABEL
    df = st.responses(rid)
    assert (df["data_status"] == SYNTH_LABEL).all()
    assert df[df.question_id == "L1"]["brand_dependent"].astype(str).isin(["True", "true", "1"]).any()
    out = st.build_deliverables(rid, pdf=False)
    for f in ("results.csv", "crosstabs.csv"):
        t = pd.read_csv(out / f, dtype=str)
        assert t.columns[0] == "data_status" and (t["data_status"] == SYNTH_LABEL).all(), f
    html = (out / "executive_report.html").read_text(encoding="utf-8")
    assert html.count(SYNTH_LABEL) >= 2 and "Ευαισθησία συμπερασμάτων" in html
    for banned in ("AI-only", "evidence-grounded", "χωρίς εμπειρική στήριξη", "C_EVIDENCE", "D_AI", "A_EMPIRICAL"):
        assert banned not in html, banned
    sens = read_json(st.internal / "runs" / rid / "sensitivity.json")
    assert sens["label"] == SYNTH_LABEL and "L1" in sens["questions"]
    sh = sens["questions"]["L1"]["share_by_logit_shift"]
    assert sh["-1.0"] <= sh["0.0"] <= sh["1.0"]                                     # μονοτονία ως προς τη βάση της μάρκας
