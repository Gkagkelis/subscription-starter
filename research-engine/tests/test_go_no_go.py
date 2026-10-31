"""Έλεγχοι του ελέγχου GO/NO-GO: εργαλείο QA διαδρομών (ορισμένες πύλες) και audit εκτέλεσης (mock, αντίγραφο της μελέτης)."""
import json
import shutil
import tempfile
from pathlib import Path

import pandas as pd
import yaml

from ase import results
from ase.qc import audit_run as AR
from ase.study import Study
from ase.util import load_structured

ROOT = Path(__file__).resolve().parents[2]
K500 = ROOT / "studies" / "kotsovolos_signalyth_2026_500"
MOCK = {"provider": "mock", "model": "mock-1"}


def _copy(n=6):
    d = Path(tempfile.mkdtemp()) / "k500"
    shutil.copytree(K500, d, ignore=shutil.ignore_patterns("runs", "respondent_state"))
    cfg = load_structured(d / "config.yaml")
    cfg["panel"]["sample_size"] = n
    cfg["panel"]["completes"]["max_profiles"] = n + 4
    cfg["lab"]["enabled"] = False
    (d / "config.yaml").write_text(yaml.safe_dump(cfg, allow_unicode=True), encoding="utf-8")
    return Study(d)


def test_forced_branch_answers_only_in_dry_run_and_never_in_results():
    st = _copy()
    ids = list(st.ensure_panel()["respondent_id"])
    forced = {ids[0]: {"Q04": "1"}, ids[1]: {"Q01": "1", "Q02": ["1"], "Q04": "3", "Q05": "1", "Q15": "1", "Q17": "1"}}
    try:                                                                  # ποτέ σε πραγματική (μη δοκιμαστική) εκτέλεση
        st.run(MOCK, max_workers=1, batching="per_block_dep", forced_answers=forced, confirm=True)
        raise AssertionError("έπρεπε να απορριφθεί εκτός dry-run")
    except Exception as e:
        assert not isinstance(e, AssertionError), e
    rid = st.run(MOCK, max_workers=1, batching="per_block_dep", dry_run=True, forced_answers=forced)
    df = st.responses(rid)
    a = {(r.respondent_id, r.question_id): r for r in df.itertuples()}
    assert a[(ids[0], "Q04")].inference_mode == "FORCED_QA" and json.loads(a[(ids[0], "Q04")].response) == "1"
    assert a[(ids[0], "Q05")].status == "SKIPPED"                         # μη γνώστης ⇒ καμία αξιολόγηση μάρκας
    for q in ("Q16", "Q18", "Q19"):                                       # ορισμένη διαδρομή επιστροφής ⇒ οι κλάδοι ρωτήθηκαν
        assert a[(ids[1], q)].status == "ANSWERED", q
    rows, _ = results.aggregate(st, rid)
    q04 = rows[rows["question_id"] == "Q04"]
    assert len(q04) and (q04["n_base"] == df["respondent_id"].nunique() - 2).all()          # οι 2 ερωτώμενοι QA δεν μετρούν στα αποτελέσματα
    au = AR.audit_run(st, rid)
    assert au["summary"]["branching_or_validity_issues"] == 0 and au["summary"]["hard_violations"] == 0


class _Tampered:
    """Ίδια μελέτη, αλλά οι αποθηκευμένες απαντήσεις αντικαθίστανται με την ΛΙΓΟΤΕΡΟ πιθανή επιλογή (σφάλμα κλήρωσης/κωδικών)."""

    def __init__(self, st):
        self.st = st

    def responses(self, rid):
        df = self.st.responses(rid).copy()
        m = (df["status"] == "ANSWERED") & df["distribution"].astype(str).str.startswith("{")
        for i in df.index[m]:
            d = json.loads(df.at[i, "distribution"])
            if isinstance(json.loads(df.at[i, "response"]), list):
                continue
            df.at[i, "response"] = json.dumps(min(d, key=lambda k: float(d[k])))
        return df


def test_audit_detects_sampling_error_and_report_mismatch():
    st = _copy(n=12)
    st.cfg["status"] = "APPROVED"
    rid = st.run(MOCK, max_workers=1, batching="per_block_dep", dry_run=True)
    ok = AR.audit_sampling(st, rid)
    assert ok["n"] > 50 and ok["ok"]
    bad = AR.audit_sampling(_Tampered(st), rid)
    assert not bad["ok"] and bad["drawn_from_options_below_10pct"] > ok["drawn_from_options_below_10pct"]
    st.build_deliverables(rid, pdf=False)
    rep = AR.audit_report(st, rid)
    assert rep["count_mismatches"] == [] and rep["multi_select_note_in_report"]
    res = st.internal / "runs" / rid / "preview" / "results.csv"
    t = pd.read_csv(res)
    i = t.index[(t["question_id"] == "Q01") & (t["option_code"].astype(str) == "1")][0]
    t.at[i, "n"] = int(t.at[i, "n"]) + 1                                  # αλλοιωμένος πίνακας αποτελεσμάτων
    t.to_csv(res, index=False)
    assert AR.audit_report(st, rid)["count_mismatches"]
