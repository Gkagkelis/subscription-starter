from ase.population.panel import generate_panel

V = ["age", "gender", "region", "household_type", "education", "income_band"]


def _cfg(n, **kw):
    return {"sample_size": n, "random_seed": 20261031, "sampling": {"strategy": "demographic_quota", "variables": V, "tolerance_pp": 2}, "avoid_overlap": False, **kw}


def test_panel_500():
    df, rep = generate_panel(_cfg(500), "t500")
    assert len(df) == 500 and df["respondent_id"].is_unique and df["frame_record"].is_unique
    assert rep["all_within_tolerance"], rep["max_abs_deviation_pp"]
    assert set(df["age_band"]) <= {"18-24", "25-34", "35-44", "45-54", "55-64", "65+"}


def test_panel_1500():
    df, rep = generate_panel(_cfg(1500), "t1500")
    assert len(df) == 1500 and df["respondent_id"].is_unique and rep["all_within_tolerance"]


def test_targeted_attica_women_25_54():
    df, rep = generate_panel(_cfg(750, geography={"regions": ["Αττική"]}, filters={"gender": ["female"], "age_band": ["25-34", "35-44", "45-54"]}), "tatt")
    assert len(df) == 750 and set(df["region"]) == {"Αττική"} and set(df["gender"]) == {"female"}
    assert set(df["age_band"]) == {"25-34", "35-44", "45-54"} and rep["all_within_tolerance"]


def test_deterministic_and_study_specific():
    a, _ = generate_panel(_cfg(200), "same")
    b, _ = generate_panel(_cfg(200), "same")
    c, _ = generate_panel(_cfg(200), "other")
    assert a.equals(b)
    assert list(a["respondent_id"]) == [f"R{i:05d}" for i in range(1, 201)]
    assert len(set(a["frame_record"]) & set(c["frame_record"])) < 20       # διαφορετικά προφίλ ανά μελέτη


def test_no_inconsistent_households_and_extension_requires_source():
    df, _ = generate_panel(_cfg(300), "hh")
    assert not ((df["household_type"] == "single") & (df["household_size"] != "1")).any()
    try:
        generate_panel(_cfg(10, extensions=[{"name": "x_owns_tv", "levels": {"yes": 0.9, "no": 0.1}}]), "ext")
        raise AssertionError("έπρεπε να απορριφθεί χαρακτηριστικό χωρίς πηγή")
    except ValueError:
        pass
    df2, rep2 = generate_panel(_cfg(10, extensions=[{"name": "x_owns_tv", "levels": {"yes": 0.9, "no": 0.1}, "source": {"title": "Πηγή", "url": "https://example.org"}}]), "ext2")
    assert "x_owns_tv" in df2.columns and rep2["extensions"][0]["status"] == "SOURCED"
