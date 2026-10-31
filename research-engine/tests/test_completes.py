"""Μέγεθος δείγματος σε ολοκληρωμένα ερωτηματολόγια (completes) και ελεγχόμενη αντικατάσταση."""
import json

from ase.llm.mock import MockProvider
from ase.population.completes import completes_spec
from ase.study import AnswersPending, Study
from ase.util import read_json
from helpers import make_study

AGE_TARGET = {"18-24": .25, "25-34": .30, "35-44": .25, "45-54": .10, "55-64": .06, "65+": .04}


def _run(name, n=20, **completes):
    st = Study(make_study(name, n=n, sample_size_basis="completes", completes=completes))
    rid = st.run({"provider": "mock"}, max_workers=2)
    return st, rid, read_json(st.internal / "runs" / rid / "completes_report.json")


def test_spec_requires_explicit_quota_basis_and_documented_source():
    assert completes_spec({"sample_size": 10}) is None                                    # προεπιλογή: αρχικά προφίλ (όπως πριν)
    for bad, msg in [({}, "δεν θεωρούνται αυτόματα σωστά"), ({"quota_basis": "documented_target"}, "target_quotas"),
                     ({"quota_basis": "documented_target", "target_quotas": {"age": AGE_TARGET}}, "πηγή"),
                     ({"quota_basis": "documented_target", "target_quotas": {"age": {"18-24": .5}}, "status": "assumption", "justification": "x"}, "αθροίζουν")]:
        try:
            completes_spec({"sample_size": 10, "sample_size_basis": "completes", "completes": bad})
            raise AssertionError(bad)
        except ValueError as e:
            assert msg in str(e), str(e)


def test_natural_incidence_reaches_exact_completes_with_replacements():
    st, rid, cr = _run("ci_nat", quota_basis="natural_incidence")
    status = read_json(st.internal / "runs" / rid / "respondent_status.json")
    assert cr["achieved_completes"] == 20 == sum(v == "COMPLETE" for v in status.values()) and cr["stop_reason"] == "target_reached"
    assert cr["screened_out"] > 0 and cr["replacements"] == cr["profiles_used"] - 20
    prof = st.profiles(rid)
    assert prof["respondent_id"].is_unique and prof["frame_record"].is_unique                    # μοναδικά IDs και προφίλ
    added = st._added_profiles(st.internal / "runs" / rid)
    assert not set(added["frame_record"]) & set(st.ensure_panel()["frame_record"])               # αντικαταστάτες εκτός πάνελ
    assert (added["replaces"] == "").all()                                                         # δεν εξαναγκάζεται κελί
    qc = {c["check"]: c["status"] for c in read_json(st.internal / "runs" / rid / "quality_checks.json")["checks"]}
    assert qc["Ολοκληρωμένα ερωτηματολόγια"] == "PASS" and "Σύνθεση completes (natural incidence)" in qc
    rid2 = st.run({"provider": "mock"}, max_workers=1, run_label="again")                          # αναπαραγωγιμότητα
    a2 = st._added_profiles(st.internal / "runs" / rid2)
    assert list(a2["frame_record"]) == list(added["frame_record"])
    man = read_json(st.internal / "runs" / rid / "execution_manifest.json")
    assert man["sample_size_basis"] == "completes" and man["completes"]["achieved_completes"] == 20


def test_general_population_replaces_within_same_cell():
    st, rid, cr = _run("ci_gen", quota_basis="general_population")
    assert cr["achieved_completes"] == 20 and cr["replacements"] > 0
    prof = st.profiles(rid).set_index("respondent_id")
    added = st._added_profiles(st.internal / "runs" / rid)
    for r in added.itertuples():
        old = prof.loc[r.replaces]
        assert (r.region, r.age_band, r.gender) == (old["region"], old["age_band"], old["gender"])
    status = read_json(st.internal / "runs" / rid / "respondent_status.json")
    assert all(status[x] == "SCREENED_OUT" for x in added["replaces"])                            # αντικαθίστανται μόνο αποκλεισμένοι


def test_documented_target_tilts_sample_and_is_checked():
    st, rid, cr = _run("ci_doc", n=40, quota_basis="documented_target", target_quotas={"age": AGE_TARGET},
                       status="assumption", justification="δοκιμαστική κατανομή")
    _, _, nat = _run("ci_doc_nat", n=40, quota_basis="natural_incidence")
    young = lambda c: sum(v["profiles"] for k, v in c["by_group"]["age_band"].items() if k in ("18-24", "25-34"))   # noqa: E731
    assert young(cr) / cr["profiles_used"] > young(nat) / nat["profiles_used"] + 0.15                 # στροφή προς τους στόχους
    assert cr["deviation"]["age_band"]["reference"] == "target_quotas"
    qc = {c["check"]: c for c in read_json(st.internal / "runs" / rid / "quality_checks.json")["checks"]}
    assert "Σύνθεση completes έναντι στόχων" in qc and "στόχους του ειδικού κοινού" in qc["Σύνθεση completes έναντι στόχων"]["detail"]


def test_max_profiles_cap_stops_and_flags():
    st, rid, cr = _run("ci_cap", quota_basis="natural_incidence", max_profiles=22)
    assert cr["profiles_used"] <= 22 and cr["achieved_completes"] < 20 and cr["stop_reason"] == "max_profiles_reached"
    qc = read_json(st.internal / "runs" / rid / "quality_checks.json")
    assert {c["check"]: c["status"] for c in qc["checks"]}["Ολοκληρωμένα ερωτηματολόγια"] == "WARN"
    assert any("Δεν συμπληρώθηκαν" in f for f in qc["flags"])


def test_initial_profiles_mode_unchanged():
    st = Study(make_study("ci_init", n=12))
    rid = st.run({"provider": "mock"}, max_workers=1)
    rdir = st.internal / "runs" / rid
    assert not (rdir / "completes_report.json").exists() and read_json(rdir / "execution_manifest.json")["respondents_requested"] == 12
    assert read_json(rdir / "execution_manifest.json")["sample_size_basis"] == "initial_profiles"


def test_completes_with_session_provider_survive_pending_rounds():
    from ase.llm.session_provider import import_answers, status
    st = Study(make_study("ci_sess", n=4, sample_size_basis="completes", completes={"quota_basis": "natural_incidence"}))
    root, helper = st.internal / "runs" / "cs" / "session", MockProvider()
    for _ in range(40):
        try:
            st.run({"provider": "claude_session"}, dry_run=True, resume_run_id="cs", batching="per_block", max_workers=1)
            break
        except AnswersPending:
            pass
        for k in status(root)["waiting"]:
            req = json.loads((root / "pending" / f"{k}.json").read_text(encoding="utf-8"))
            ans = helper.generate("s", req["user_prompt"], req["schema"]).parsed
            (root / "inbox" / f"{k}.json").write_text(json.dumps({"answer": ans, "answered_by": "test-helper"}), encoding="utf-8")
        import_answers(root, st.qn)
    cr = read_json(st.internal / "runs" / "cs" / "completes_report.json")
    assert cr["achieved_completes"] == 4 and cr["stop_reason"] == "target_reached"
