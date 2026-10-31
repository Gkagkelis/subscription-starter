import copy

from ase.questionnaire import model as QM
from helpers import QUESTIONNAIRE


def test_parse_valid_and_intents():
    qn = QM.parse(QUESTIONNAIRE)
    assert len(qn.questions) == 11
    it = {q.id: q.intent for q in qn.questions}
    assert it["D1"] == "demographic" and it["S1"] == "experience" and it["K1"] == "knowledge" and it["X1"] == "hypothetical_choice" and it["L1"] == "attitude"


def test_invalid_questionnaires_rejected():
    for mutate, msg in [(lambda q: q["blocks"][1]["questions"].append(dict(q["blocks"][1]["questions"][0])), "Διπλό"),
                        (lambda q: q["blocks"][1]["questions"][1].update(condition="Z9 == '1'"), "άγνωστη"),
                        (lambda q: q["blocks"][1]["questions"][0].update(condition="L1 == '1'"), "μεταγενέστερη"),
                        (lambda q: q["blocks"][1]["questions"][1].update(condition="__import__('os')"), "μη έγκυρη"),
                        (lambda q: q["blocks"][1]["questions"][0].update(type="slider"), "τύπος")]:
        q = copy.deepcopy(QUESTIONNAIRE)
        mutate(q)
        try:
            QM.parse(q)
            raise AssertionError(f"έπρεπε να απορριφθεί: {msg}")
        except ValueError as e:
            assert msg in str(e), str(e)


def test_conditions_and_validation():
    assert QM.evaluate_condition("K1 == '1'", {"K1": "1"}, {}) is True
    assert QM.evaluate_condition("K1 == '1'", {"K1": None}, {}) is False
    assert QM.evaluate_condition("contains(M1, '2') and profile.gender == 'female'", {"M1": ["1", "2"]}, {"gender": "female"}) is True
    assert QM.evaluate_condition("num(N1) >= 7", {"N1": 8.0}, {}) is True
    qn = QM.parse(QUESTIONNAIRE)
    q = qn.by_id()
    assert QM.validate_answer(q["M1"], ["1", "4"])            # «Κανένα» είναι αποκλειστική
    assert QM.validate_answer(q["M1"], ["1", "2", "3", "1"])  # διπλές + πλήθος > 3
    assert QM.validate_answer(q["M1"], [])                    # min 1
    assert not QM.validate_answer(q["M1"], ["1", "2"]) and not QM.validate_answer(q["M1"], ["4"])
    assert QM.validate_answer(q["N1"], 11) and not QM.validate_answer(q["N1"], 7)
    assert QM.validate_answer(q["R1"], ["1", "1"]) and not QM.validate_answer(q["R1"], ["2", "3"])
    assert QM.validate_answer(q["L1"], "9") and not QM.validate_answer(q["L1"], "3")


def test_randomization_deterministic_with_anchor():
    q = QM.parse(QUESTIONNAIRE).by_id()["M1"]
    a = [o.code for o in QM.presented_options(q, 1, "s", "R00001")]
    b = [o.code for o in QM.presented_options(q, 1, "s", "R00001")]
    assert a == b and a[-1] == "4"
    t = QM.dce_task(QM.parse(QUESTIONNAIRE).by_id()["X1"], 1, "s", "R00001")
    assert [x["id"] for x in t["alternatives"]] == ["A", "B", "none"] and t["alternatives"][0]["attributes"] != t["alternatives"][1]["attributes"]
