"""Τριμηνιαία μάθηση (εισαγωγή πραγματικών δεδομένων, σύγκριση, βαθμονόμηση με holdout, εκδόσεις) και Research Context Builder."""
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from ase.calibration.realdata import calibrate, compare, dashboard, import_real
from ase.study import Study
from ase.util import read_json
from helpers import make_study

META = {"source": "Δοκιμαστικά δεδομένα (συνθετικά για το test)", "sample_design": "test", "fieldwork_start": "2026-07-01", "fieldwork_end": "2026-07-15",
        "licence": "internal-test", "consent_status": "consented_research_use"}
MAPPING = {"questions": {"q_aware": {"synthetic": "K1", "recode": {"yes": "1", "no": "2"}}, "q_sat": "SC1a"}}


def _files(tmp: Path, n=600, meta=None, dup=False):
    rng = np.random.default_rng(1)
    df = pd.DataFrame({"respondent_id": [f"P{i:04d}" for i in range(n)], "questionnaire_id": "test_v1", "fieldwork_date": "2026-07-05",
                       "weight": rng.uniform(0.5, 1.5, n).round(3), "gender": rng.choice(["male", "female"], n),
                       "q_aware": rng.choice(["yes", "no"], n, p=[0.85, 0.15]), "q_sat": [rng.choice(["1", "2", "3"]) if i < 100 else "" for i in range(n)]})
    if dup:
        df.loc[1, "respondent_id"] = df.loc[0, "respondent_id"]
    d, m, mp = tmp / "real.csv", tmp / "meta.yaml", tmp / "mapping.yaml"
    df.to_csv(d, index=False)
    m.write_text(yaml.safe_dump(meta or META, allow_unicode=True), encoding="utf-8")
    mp.write_text(yaml.safe_dump(MAPPING, allow_unicode=True), encoding="utf-8")
    return d, m, mp


def test_import_rejects_bad_consent_and_duplicates():
    st = Study(make_study("cal_reject", n=5))
    tmp = Path(tempfile.mkdtemp())
    try:
        import_real(st, *_files(tmp, meta={**META, "consent_status": "scraped"}))
        raise AssertionError("μη αποδεκτή συναίνεση πρέπει να απορρίπτεται")
    except PermissionError:
        pass
    try:
        import_real(st, *_files(tmp, dup=True))
        raise AssertionError("διπλά IDs πρέπει να απορρίπτονται")
    except ValueError as e:
        assert "διπλά" in str(e)


def test_compare_calibrate_versions_and_apply():
    st = Study(make_study("cal", n=20))
    rid = st.run({"provider": "mock"}, max_workers=2)
    tmp = Path(tempfile.mkdtemp())
    imp = import_real(st, *_files(tmp))
    man = read_json(st.internal / "real_data" / imp / "import_manifest.json")
    assert man["n_respondents"] == 600 and man["sha256"] and (st.internal / "real_data" / imp).exists()
    c = compare(st, rid, imp)
    assert set(c["questions"]) == {"K1", "SC1a"} and 0 <= c["questions"]["K1"]["tvd"] <= 1
    assert abs(c["questions"]["K1"]["real"]["1"] - 0.85) < 0.05
    v1 = calibrate(st, rid, imp, min_n=200)
    cal = read_json(st.internal / "calibrations" / f"{v1}.json")
    assert v1 == "v1" and cal["questions"]["SC1a"]["status"] == "INSUFFICIENT_DATA"           # 100 πραγματικοί < min_n
    k1 = cal["questions"]["K1"]
    assert k1["status"] in ("UPDATED", "KEPT_PREVIOUS") and "holdout_tvd_before" in k1 and k1["n_holdout"] == 300
    if k1["status"] == "UPDATED":
        assert k1["holdout_tvd_after"] < k1["holdout_tvd_before"]
    v2 = calibrate(st, rid, imp, min_n=200)
    assert v2 == "v2" and (st.internal / "calibrations" / "v1.json").exists()                 # οι εκδόσεις δεν αντικαθίστανται
    assert read_json(st.internal / "calibrations" / "v2.json")["previous"] == "v1"
    p = dashboard(st, rid, imp)
    assert p.exists() and "ΕΣΩΤΕΡΙΚΟ" in p.read_text(encoding="utf-8") and st.internal in p.parents
    if k1["status"] == "UPDATED":
        st.cfg["calibration_version"] = "v1"
        r2 = st.run({"provider": "mock"}, max_workers=1, run_label="cal")
        df = st.responses(r2)
        k = df[(df["question_id"] == "K1") & (df["status"] == "ANSWERED")]
        assert (k["engine_mode"] == "B_LLM_CALIBRATED").all() and k["assumptions"].str.contains("Βαθμονόμηση v1").all()
        share = lambda d: (d["response"] == '"1"').mean()  # noqa: E731
        base = st.responses(rid)
        assert share(k) >= share(base[(base["question_id"] == "K1") & (base["status"] == "ANSWERED")])


def test_context_builder_offline_and_curated_sources():
    d = make_study("ctx", n=5)
    (d / "sources.yaml").write_text(yaml.safe_dump({"sources": [
        {"id": "src:ok", "title": "Consumer trust survey Greece", "url": "https://example.org/report", "date": "2025", "country": "GR",
         "population": "Ενήλικες", "sample": 1000, "limitations": "Online πάνελ"},
        {"id": "src:bad", "title": "Χωρίς μεταδεδομένα", "url": "https://example.org/x"}]}, allow_unicode=True), encoding="utf-8")
    st = Study(d)
    reg = st.build_context()
    assert "απενεργοποιημένο" in reg["notes"]["web"] and "δεν χρησιμοποιήθηκαν" in reg["notes"]["web"]
    acc = {a["id"] for a in reg["accepted"]}
    rej = {r["id"]: r["rejected_reason"] for r in reg["rejected"]}
    assert "src:ok" in acc and "src:bad" in rej and "Ελλιπή" in rej["src:bad"]
    assert all(a.get("url") or a.get("path") for a in reg["accepted"])                      # καμία πηγή χωρίς επαληθεύσιμη διαδρομή
    assert set(reg["question_map"]) == {q.id for q in st.qn.questions}
