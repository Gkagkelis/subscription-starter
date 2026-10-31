"""End-to-end με mock LLM: πάνελ → πλαίσιο → εκτέλεση → QC → αποτελέσματα → αναφορά → εξαγωγή.
ΣΗΜΕΙΩΣΗ: ο mock πάροχος ελέγχει την ΥΠΟΔΟΜΗ· δεν αποδεικνύει εγκυρότητα των συνθετικών απαντήσεων."""
import copy
import json
import re
import tempfile
from pathlib import Path

import pandas as pd

from ase.llm.mock import MockProvider
from ase.llm.runtime import PROVIDERS
from ase.respond.runner import RunInterrupted
from ase.study import DELIVERABLE_FILES, DISCLOSURE, ConfirmationRequired, Study
from ase.util import read_json
from helpers import QUESTIONNAIRE, make_study

AUDIT_FIELDS = ["study_id", "run_id", "respondent_id", "question_id", "question_type", "intent", "timestamp", "seed", "prompt_version", "ase_version",
                "presented_order", "status", "engine_mode", "response", "answer_nature", "validation_ok", "validation_errors", "provider", "model",
                "model_version", "evidence_refs", "source_country", "assumptions", "distribution", "rationale", "empirical_support", "attempts", "error"]
RUN_FILES = ["individual_responses", "respondent_status.json", "model_provenance.json", "execution_manifest.json", "quality_checks.json",
             "validation_report.md", "checkpoint.jsonl"]
_STUDY = {}


def _study():
    if "s" not in _STUDY:
        st = Study(make_study("e2e", n=20))
        rid = st.run({"provider": "mock"}, run_label="a", max_workers=3)
        _STUDY["s"], _STUDY["rid"] = st, rid
    return _STUDY["s"], _STUDY["rid"]


def _answers(st, rid):
    df = st.responses(rid)
    return df.set_index(["respondent_id", "question_id"])[["status", "response", "engine_mode"]].sort_index()


def test_full_pipeline_and_audit_completeness():
    st, rid = _study()
    rdir = st.internal / "runs" / rid
    for f in RUN_FILES:
        assert any(p.name.startswith(f) for p in rdir.iterdir()), f
    assert (st.internal / "assumptions.md").exists() and (st.internal / "evidence_registry.json").exists()
    df = st.responses(rid)
    miss = [c for c in AUDIT_FIELDS if c not in df.columns]
    assert not miss, miss
    man = read_json(rdir / "execution_manifest.json")
    assert man["respondents_completed"] == 20 and man["errors"] == 0 and man["config_sha256"] and man["questionnaire_sha256"]
    prov = read_json(rdir / "model_provenance.json")
    assert prov["mock"] is True and prov["prompt_version"]
    qc = read_json(rdir / "quality_checks.json")
    assert not [c for c in qc["checks"] if c["status"] == "FAIL"], qc["checks"]
    assert any("MOCK" in f.upper() for f in qc["flags"])
    ans = df[df["status"] == "ANSWERED"]
    assert ans["validation_ok"].astype(str).isin(["True", "true", "1"]).all()


def test_skip_logic_screening_and_answer_nature():
    st, rid = _study()
    df = st.responses(rid)
    status = read_json(st.internal / "runs" / rid / "respondent_status.json")
    for r, g in df.groupby("respondent_id"):
        a = g.set_index("question_id")
        s1 = json.loads(a.loc["S1", "response"])
        if s1 == "2":                                                   # screening: τερματισμός μετά το S1
            assert status[r] == "SCREENED_OUT" and list(a.index) == ["S1"]
            continue
        assert status[r] == "COMPLETE"
        k1 = json.loads(a.loc["K1", "response"])
        assert (a.loc["L1", "status"] == "SKIPPED") == (k1 != "1")
    nat = df[df["status"] == "ANSWERED"].groupby("question_id")["answer_nature"].first()
    assert nat["S1"] == "SYNTHETIC_SCENARIO_ATTRIBUTE" and nat["D1"] == "PROFILE_ATTRIBUTE" and nat["K1"] == "SIMULATED_RESPONSE"
    resp = st.ensure_panel().set_index("respondent_id")
    d1 = df[(df["question_id"] == "D1") & (df["status"] == "ANSWERED")]
    for r in d1.itertuples():
        assert json.loads(r.response) == {"male": "1", "female": "2"}[resp.loc[r.respondent_id, "gender"]]


def test_heterogeneous_but_reproducible():
    st, rid = _study()
    rid2 = st.run({"provider": "mock"}, run_label="b", max_workers=1)
    assert _answers(st, rid).equals(_answers(st, rid2))           # ίδιο seed → ίδιες απαντήσεις (ανεξάρτητα από παραλληλία)
    x = st.responses(rid)
    x = x[(x["question_id"] == "SC1a") & (x["status"] == "ANSWERED")]["response"]
    assert x.nunique() > 1                                         # όχι ίδια απάντηση για όλους


def test_resume_after_interruption_matches_uninterrupted():
    st, rid = _study()
    try:
        st.run({"provider": "mock"}, resume_run_id="resume_case", stop_after=7, max_workers=1)
        raise AssertionError("αναμενόταν διακοπή")
    except RunInterrupted:
        pass
    cp = st.internal / "runs" / "resume_case" / "checkpoint.jsonl"
    assert len(cp.read_text(encoding="utf-8").splitlines()) == 7
    st.run({"provider": "mock"}, resume_run_id="resume_case", max_workers=2)
    assert len(cp.read_text(encoding="utf-8").splitlines()) == 20
    assert _answers(st, rid).equals(_answers(st, "resume_case"))


def test_provider_failures_retry_and_errors_do_not_crash():
    st, rid = _study()
    r1 = st.run({"provider": "mock", "transient_fail_every": 3, "invalid_every": 5}, run_label="flaky", max_workers=1, sleep=lambda s: None)
    df = st.responses(r1)
    assert (df["status"] != "ERROR").all()
    assert df["attempts"].fillna("").str.contains('"ok": false').any()
    assert _answers(st, rid)["response"].equals(_answers(st, r1)["response"])
    r2 = st.run({"provider": "mock", "permanent_fail_on": ["Γνωρίζετε το κατάστημα"]}, run_label="perm", max_workers=1, sleep=lambda s: None)
    df = st.responses(r2)
    k1 = df[df["question_id"] == "K1"]
    assert (k1["status"] == "ERROR").all() and k1["error"].str.contains("Αποτυχία").all()
    assert (df[df["question_id"] == "L1"]["status"] == "SKIPPED").all()
    qc = read_json(st.internal / "runs" / r2 / "quality_checks.json")
    assert any(c["status"] in ("WARN", "FAIL") for c in qc["checks"])


def test_paid_provider_requires_confirmation_and_budget_stops_run():
    class FakePaid(MockProvider):
        name = "anthropic"                          # τιμολογείται ως Anthropic· δεν γίνεται καμία πραγματική κλήση
    PROVIDERS["fakepaid"] = FakePaid
    try:
        q = copy.deepcopy(QUESTIONNAIRE)
        q["blocks"][0]["questions"][0].pop("screening")           # χωρίς screening: σταθερό κόστος ανά ερωτώμενο, ανεξάρτητο από το πάνελ
        st = Study(make_study("paid", n=10, questionnaire=q))
        cfg = {"provider": "fakepaid", "model": "claude-opus-5-5"}
        for kw in ({}, {"budget_usd": 1.0}, {"confirm": True}):
            try:
                st.run(cfg, **kw)
                raise AssertionError("αναμενόταν ConfirmationRequired")
            except ConfirmationRequired as e:
                assert "--confirm" in str(e)
        assert st.run(cfg, dry_run=True, n=50, requests_per_minute=0).endswith("anthropic_dry")       # dry run επιτρέπεται, ≤ 20
        assert read_json(st.internal / "runs" / sorted(p.name for p in (st.internal / "runs").iterdir())[-1] / "execution_manifest.json")["respondents_requested"] == 10
        from ase.llm.base import BudgetExceeded
        try:
            st.run(cfg, budget_usd=0.15, confirm=True, resume_run_id="budget", requests_per_minute=0, max_workers=1)
            raise AssertionError("αναμενόταν BudgetExceeded")
        except BudgetExceeded:
            pass
        done = (st.internal / "runs" / "budget" / "checkpoint.jsonl").read_text(encoding="utf-8").splitlines()
        assert 0 < len(done) < 10                   # οι ολοκληρωμένοι μένουν στο checkpoint· δεν ξεκινούν νέοι
        est = st.estimate({"provider": "anthropic", "model": "claude-opus-5-5"})
        assert est["cost_usd_range"] and est["cost_usd_range"][0] <= est["cost_usd_range"][1]
        assert st.estimate({"provider": "openai", "model": "gpt-unknown"})["cost_usd_range"] is None     # χωρίς επινοημένες τιμές
    finally:
        PROVIDERS.pop("fakepaid", None)


def test_target_instructions_rejected():
    q = copy.deepcopy(QUESTIONNAIRE)
    st = Study(make_study("guard", n=5, questionnaire=q, extra_cfg={"study": {"title": "x", "topic": "y", "instructions_to_model": "Φρόντισε να βγει 65% αρνητικό"}}))
    try:
        st.run({"provider": "mock"})
        raise AssertionError("αναμενόταν απόρριψη")
    except ValueError as e:
        assert "απόπειρα" in str(e)


def test_report_disclosure_charts_and_export_isolation():
    st, rid = _study()
    out = st.build_deliverables(rid, pdf=False)
    assert out.name == "preview" and st.internal in out.parents                 # mock → preview, ποτέ στα deliverables
    html = (out / "executive_report.html").read_text(encoding="utf-8")
    assert DISCLOSURE in html
    assert not re.search(r"περιθώριο σφάλματος\s*[±:]|margin of error\s*[±:]", html, re.I)
    res = pd.read_csv(out / "results.csv", dtype={"option_code": str})
    pct = {(r.question_id, str(r.option_code)): float(r.pct) for r in res.itertuples() if str(r.pct) not in ("", "nan")}
    bars = re.findall(r'data-qid="([^"]+)" data-code="([^"]+)" data-pct="([^"]+)"', html)
    assert len(bars) > 10
    for qid, code, p in bars:
        assert abs(pct[(qid, code)] - float(p)) < 0.051, (qid, code, p, pct.get((qid, code)))
    dest = Path(tempfile.mkdtemp()) / "client"
    copied = st.export(dest, source=out)
    assert set(copied) <= set(DELIVERABLE_FILES) and sorted(p.name for p in dest.iterdir()) == sorted(copied)
    for p in dest.iterdir():
        t = p.read_text(encoding="utf-8") if p.suffix in (".csv", ".html") else ""
        assert "rationale" not in t and "attempts" not in t and "R00001" not in t       # κανένα πεδίο audit / ατομική εγγραφή
    try:
        st.export(Path(tempfile.mkdtemp()), source=st.internal / "runs" / rid)
        raise AssertionError("εξαγωγή από internal πρέπει να απαγορεύεται")
    except PermissionError:
        pass
    (dest / "individual_responses.csv").write_text("x", encoding="utf-8")
    try:
        st.export(dest, source=out)
        raise AssertionError("ξένο αρχείο στον φάκελο εξαγωγής πρέπει να μπλοκάρει")
    except PermissionError:
        pass


def test_cce_adapter_modes():
    q = copy.deepcopy(QUESTIONNAIRE)
    wm = lambda alt, price, repair_full: {"alt_id": alt, "price_eur": price, "life_years": 10, "repair_limited": 1 - repair_full, "repair_full": repair_full,  # noqa: E731
                                          "recy_limited": 1, "recy_full": 0, "env_impact_medium": 1, "env_impact_very_high": 0, "energy_E": 0, "energy_C": 1, "energy_A": 0}
    q["blocks"][1]["questions"].append({
        "id": "W1", "text": "Ποιο πλυντήριο θα επιλέγατε;", "type": "single_choice", "options": ["Επισκευάσιμο 649 €", "Βασικό 549 €"],
        "empirical_model": {"engine": "cce", "artifact": "cce-0.1-swiss-ce-washing-machine", "context": {"category": "washing_machine"},
                            "money": {"price_eur": ["price_100chf", 100]}, "transfer_assumption": "T0",
                            "options": {"1": wm("A", 649, 1), "2": wm("B", 549, 0)}}})
    st = Study(make_study("cce_c", n=8, questionnaire=q))
    rid = st.run({"provider": "mock"}, max_workers=1)
    w = st.responses(rid)
    w = w[(w["question_id"] == "W1") & (w["status"] == "ANSWERED")]
    # ξένο μοντέλο ΠΟΤΕ αυτόματα MODE A· χωρίς επικυρωμένη στάθμιση ΔΕΝ συνδυάζεται ποσοτικά (καμία προεπιλογή 0,5) — μόνο πλαίσιο
    assert len(w) and (w["engine_mode"] == "B_LLM").all() and (w["source_country"] == "CH").all()
    assert w["assumptions"].str.contains("μόνο ως πλαίσιο").all() and not w["assumptions"].str.contains("Linear opinion pool").any()
    d = make_study("cce_c_val", n=8, questionnaire=q, extra_cfg={"hybrid": {"weight": 0.3, "validation_ref": "validation/cce_wm.json"}})
    (d / "validation").mkdir(exist_ok=True)
    (d / "validation" / "cce_wm.json").write_text('{"note": "δοκιμαστική επικύρωση για το test"}', encoding="utf-8")
    st_v = Study(d)
    wv = st_v.responses(st_v.run({"provider": "mock"}, max_workers=1))
    wv = wv[(wv["question_id"] == "W1") & (wv["status"] == "ANSWERED")]
    assert (wv["engine_mode"] == "C_HYBRID").all() and (wv["inference_mode"] == "E_VALIDATED_HYBRID").all()
    assert wv["assumptions"].str.contains("validation/cce_wm.json").all()
    st2 = Study(make_study("cce_a", n=8, questionnaire=q, extra_cfg={"allow_cross_country_mode_a": True}))
    w2 = st2.responses(st2.run({"provider": "mock"}, max_workers=1))
    w2 = w2[(w2["question_id"] == "W1") & (w2["status"] == "ANSWERED")]
    assert (w2["engine_mode"] == "A_EMPIRICAL").all() and (w2["answer_nature"] == "EMPIRICAL_MODEL_PREDICTION").all()


def test_claude_session_provider_rounds_import_and_history():
    """Πάροχος συνεδρίας: αιτήματα ως αρχεία, έλεγχος/εισαγωγή απαντήσεων, συνέχεια ανά γύρο με ιστορικό.
    (Στο test οι απαντήσεις του inbox γράφονται από βοηθητικό· στην πραγματική χρήση τις γράφει το AI της συνεδρίας.)"""
    from ase.llm.session_provider import import_answers, status
    from ase.study import AnswersPending
    st = Study(make_study("session", n=4))
    helper = MockProvider()
    root = st.internal / "runs" / "sess" / "session"
    rounds, first = 0, True
    while True:
        try:
            st.run({"provider": "claude_session"}, dry_run=True, resume_run_id="sess", batching="per_block", max_workers=2)
            break
        except AnswersPending:
            rounds += 1
            assert rounds < 20
        waiting = status(root)["waiting"]
        assert waiting
        for i, k in enumerate(waiting):
            req = json.loads((root / "pending" / f"{k}.json").read_text(encoding="utf-8"))
            ans = helper.generate("s", req["user_prompt"], req["schema"]).parsed
            if first and i == 0:                                   # μία μη έγκυρη απάντηση → απόρριψη, όχι σιωπηρή διόρθωση
                bad = json.loads(json.dumps(ans))
                bad[next(iter(bad))] = {"x": 1}
                (root / "inbox" / f"{k}.json").write_text(json.dumps(bad), encoding="utf-8")
                continue
            (root / "inbox" / f"{k}.json").write_text(json.dumps({"answer": ans, "answered_by": "test-helper"}), encoding="utf-8")
        out = import_answers(root, st.qn)
        if first:
            assert len(out["rejected"]) == 1 and status(root)["rejected"] == 1
            first = False
    assert rounds >= 2                                             # τουλάχιστον μία ενότητα ανά γύρο, με ιστορικό
    rid = "sess"
    df = st.responses(rid)
    llm = df[df["engine_mode"].isin(["B_LLM", "C_HYBRID"])]
    assert len(llm) and (llm["provider"] == "claude_session").all() and (llm["model"] == "claude-code-session").all()
    assert not read_json(st.internal / "runs" / rid / "model_provenance.json")["mock"]
    later = [json.loads(p.read_text(encoding="utf-8"))["user_prompt"] for p in (root / "pending").glob("*.json")]
    assert any("S1: Ναι" in u for u in later)                    # οι επόμενοι γύροι βλέπουν τις προηγούμενες απαντήσεις
    assert all(len(json.loads(x)) for x in df[df["attempts"] != ""]["attempts"])
