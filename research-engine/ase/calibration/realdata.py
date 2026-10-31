"""Τριμηνιαία μάθηση από πραγματικά δεδομένα (ASE).

1. import_real: CSV ή Parquet (+ metadata.yaml). Υποχρεωτικά: respondent_id, questionnaire_id, fieldwork_date· προαιρετικά weight
   και χαρακτηριστικά (age_band, gender, region, …)· στήλες απαντήσεων = id ερωτήσεων. Metadata: source, sample_design,
   consent_status ∈ {consented_research_use, licensed_commercial, open_licence}, licence. Έλεγχοι: άδεια/συναίνεση, διπλά IDs,
   κενά, μη έγκυροι κωδικοί, θετικά βάρη.
2. compare: συνθετική (κληρωμένες απαντήσεις) έναντι πραγματικής (σταθμισμένης) κατανομής ανά ερώτηση και υποομάδα:
   TVD, μέγιστη απόκλιση (μονάδες), Jensen–Shannon.
3. calibrate: τυχαίος διαχωρισμός πραγματικών ερωτωμένων σε fit / holdout. Για ερωτήσεις με n_fit ≥ min_n: συντελεστές ανά
   επιλογή r_k = real_k / synth_k με shrinkage λ = n/(n+κ). Η νέα έκδοση ΓΙΝΕΤΑΙ ΔΕΚΤΗ ανά ερώτηση μόνο αν μειώνει την
   απόκλιση στο holdout· αλλιώς κρατείται η προηγούμενη. Οι εκδόσεις δεν αντικαθίστανται ποτέ (calibrations/vN.json).
   Η προσθήκη δεδομένων ΔΕΝ θεωρείται ότι βελτιώνει αυτόματα κάθε κατηγορία ερωτήσεων.
4. dashboard: εσωτερικό HTML σύγκρισης πραγματικών/συνθετικών απαντήσεων.
Τα ακατέργαστα πραγματικά δεδομένα αποθηκεύονται μόνο στον εσωτερικό φάκελο της μελέτης.
"""
from __future__ import annotations

import html
import json
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

from ..util import derive_seed, load_structured, now_iso, read_json, sha256_file, write_json, write_table

ALLOWED_CONSENT = {"consented_research_use", "licensed_commercial", "open_licence"}


def _read(path: Path) -> pd.DataFrame:
    if path.suffix == ".parquet":
        try:
            return pd.read_parquet(path)
        except ImportError as e:
            raise RuntimeError("Για Parquet απαιτείται pyarrow (pip install pyarrow)· εναλλακτικά CSV.") from e
    return pd.read_csv(path, dtype=str, keep_default_na=False)


def import_real(study, data_path, meta_path, mapping_path) -> str:
    data_path, meta_path = Path(data_path), Path(meta_path)
    meta = load_structured(meta_path)
    mapping = load_structured(mapping_path)
    errs, warns = [], []
    if meta.get("consent_status") not in ALLOWED_CONSENT:
        raise PermissionError(f"Μη αποδεκτή κατάσταση συναίνεσης/άδειας: {meta.get('consent_status')} (επιτρεπτές: {sorted(ALLOWED_CONSENT)})")
    for k in ("source", "sample_design", "fieldwork_start", "fieldwork_end", "licence"):
        if not meta.get(k):
            errs.append(f"metadata: λείπει {k}")
    df = _read(data_path)
    for c in ("respondent_id", "questionnaire_id", "fieldwork_date"):
        if c not in df.columns:
            errs.append(f"λείπει στήλη {c}")
    if errs:
        raise ValueError("; ".join(errs))
    if df["respondent_id"].duplicated().any():
        errs.append(f"{int(df['respondent_id'].duplicated().sum())} διπλά respondent_id")
    if "weight" in df.columns:
        w = pd.to_numeric(df["weight"], errors="coerce")
        if w.isna().any() or (w <= 0).any():
            errs.append("μη έγκυρα βάρη (κενά ή ≤ 0)")
    else:
        df["weight"] = "1"
        warns.append("Χωρίς βάρη: όλοι οι ερωτώμενοι με βάρος 1")
    qby = study.qn.by_id()
    rows = []
    for real_q, m in (mapping.get("questions") or {}).items():
        sq = m["synthetic"] if isinstance(m, dict) else m
        recode = {str(k): str(v) for k, v in (m.get("recode") or {}).items()} if isinstance(m, dict) else {}
        if sq not in qby:
            errs.append(f"αντιστοίχιση σε άγνωστη συνθετική ερώτηση {sq}")
            continue
        if real_q not in df.columns:
            errs.append(f"λείπει στήλη πραγματικής ερώτησης {real_q}")
            continue
        valid = set(qby[sq].codes)
        for r in df.itertuples(index=False):
            v = str(getattr(r, real_q)).strip()
            if v == "":
                continue
            code = recode.get(v, v)
            if valid and code not in valid:
                warns.append(f"{real_q}: μη έγκυρος κωδικός {v}")
                continue
            rows.append({"respondent_id": r.respondent_id, "question_id": sq, "real_question": real_q, "code": code, "weight": float(r.weight),
                         **{a: getattr(r, a) for a in ("age_band", "gender", "region", "income_quintile", "education") if a in df.columns}})
    if errs:
        raise ValueError("; ".join(errs))
    import_id = f"{now_iso()[:10]}_{data_path.stem}"
    d = study.internal / "real_data" / import_id
    long = pd.DataFrame(rows)
    write_table(long, d / "responses_long")
    warn_c = Counter(w.split(":")[0] for w in warns)
    write_json(d / "import_manifest.json", {"import_id": import_id, "imported_at": now_iso(), "source_file": data_path.name, "sha256": sha256_file(data_path),
                                            "metadata": meta, "mapping": mapping, "n_respondents": int(df["respondent_id"].nunique()), "n_answers": len(long),
                                            "questionnaire_ids": sorted(df["questionnaire_id"].unique().tolist()), "warnings": dict(warn_c)})
    return import_id


def _wdist(sub: pd.DataFrame) -> dict:
    s = sub.groupby("code")["weight"].sum()
    return (s / s.sum()).to_dict()


def _sdist(sub: pd.DataFrame) -> dict:
    c = Counter()
    for r in sub["response"]:
        v = json.loads(r)
        for x in (v if isinstance(v, list) else [v]):
            c[str(x)] += 1
    t = sum(c.values()) or 1
    return {k: v / t for k, v in c.items()}


def _metrics(a: dict, b: dict) -> dict:
    keys = sorted(set(a) | set(b))
    p = np.array([a.get(k, 0) for k in keys])
    q = np.array([b.get(k, 0) for k in keys])
    m = (p + q) / 2

    def kl(x, y):
        mask = x > 0
        return float((x[mask] * np.log2(x[mask] / y[mask])).sum())
    return {"tvd": round(0.5 * float(np.abs(p - q).sum()), 4), "max_abs_diff_pp": round(100 * float(np.abs(p - q).max()), 2), "js": round(0.5 * kl(p, m) + 0.5 * kl(q, m), 4)}


def compare(study, run_id, import_id) -> dict:
    from ..util import read_table
    real = read_table(study.internal / "real_data" / import_id / "responses_long")
    real["weight"] = real["weight"].astype(float)
    syn = study.responses(run_id)
    syn = syn[syn["status"] == "ANSWERED"]
    resp = study.profiles(run_id)
    syn = syn.merge(resp[["respondent_id", "age_band", "gender"]], on="respondent_id", how="left")
    out = {"run_id": run_id, "import_id": import_id, "compared_at": now_iso(), "questions": {}}
    for qid, g in real.groupby("question_id"):
        s = syn[syn["question_id"] == qid]
        if s.empty:
            continue
        rd, sd = _wdist(g), _sdist(s)
        sub = {}
        for var in ("age_band", "gender"):
            if var in g.columns:
                for lvl, gg in g.groupby(var):
                    ss = s[s[var] == lvl]
                    if len(gg) >= 30 and len(ss) >= 30:
                        sub[f"{var}={lvl}"] = {**_metrics(_wdist(gg), _sdist(ss)), "n_real": len(gg), "n_synth": len(ss)}
        out["questions"][qid] = {"n_real": int(g["respondent_id"].nunique()), "n_synth": int(len(s)), "real": rd, "synthetic": sd, **_metrics(rd, sd), "subgroups": sub}
    write_json(study.internal / "real_data" / import_id / f"comparison_{run_id}.json", out)
    return out


def calibrate(study, run_id, import_id, min_n=200, kappa=200.0, holdout_frac=0.5, min_improvement=0.005) -> str:
    from ..util import read_table
    real = read_table(study.internal / "real_data" / import_id / "responses_long")
    real["weight"] = real["weight"].astype(float)
    syn = study.responses(run_id)
    syn = syn[syn["status"] == "ANSWERED"]
    ids = sorted(real["respondent_id"].unique())
    rng = np.random.default_rng(derive_seed(study.study_id, import_id, "split"))
    hold = set(rng.choice(ids, size=int(len(ids) * holdout_frac), replace=False))
    cdir = study.internal / "calibrations"
    cdir.mkdir(parents=True, exist_ok=True)
    prev_files = sorted(cdir.glob("v*.json"), key=lambda p: int(p.stem[1:]))
    prev = read_json(prev_files[-1]) if prev_files else {"questions": {}}
    version = f"v{len(prev_files) + 1}"
    res = {"version": version, "created_at": now_iso(), "run_id": run_id, "import_id": import_id, "previous": prev_files[-1].stem if prev_files else None,
           "method": f"Λόγος πραγματικής/συνθετικής κατανομής ανά επιλογή με shrinkage λ = n/(n+{kappa}); αποδοχή μόνο με βελτίωση TVD ≥ {min_improvement} στο holdout ({holdout_frac:.0%}).",
           "questions": {}}
    for qid, g in real.groupby("question_id"):
        q = study.qn.by_id()[qid]
        s = syn[syn["question_id"] == qid]
        if q.type not in ("single_choice", "likert", "scenario") or s.empty:
            res["questions"][qid] = {"status": "NOT_APPLICABLE", **({"factors": prev["questions"].get(qid, {}).get("factors")} if prev["questions"].get(qid) else {})}
            continue
        fit, ho = g[~g["respondent_id"].isin(hold)], g[g["respondent_id"].isin(hold)]
        n_fit = fit["respondent_id"].nunique()
        prev_f = (prev["questions"].get(qid) or {}).get("factors")
        if n_fit < min_n:
            res["questions"][qid] = {"status": "INSUFFICIENT_DATA", "n_fit": int(n_fit), "factors": prev_f}
            continue
        sd, fd, hd = _sdist(s), _wdist(fit), _wdist(ho)
        lam = n_fit / (n_fit + kappa)
        fac = {c: 1 + lam * ((fd.get(c, 0) + 1e-3) / (sd.get(c, 0) + 1e-3) - 1) for c in q.codes}
        cal = {c: sd.get(c, 0) * fac[c] for c in q.codes}
        t = sum(cal.values()) or 1
        cal = {c: v / t for c, v in cal.items()}
        before, after = _metrics(sd, hd)["tvd"], _metrics(cal, hd)["tvd"]
        accepted = before - after >= min_improvement
        res["questions"][qid] = {"status": "UPDATED" if accepted else "KEPT_PREVIOUS", "n_fit": int(n_fit), "n_holdout": int(ho["respondent_id"].nunique()),
                                 "holdout_tvd_before": before, "holdout_tvd_after": after, "factors": fac if accepted else prev_f, "candidate_factors": fac}
    write_json(cdir / f"{version}.json", res)
    return version


def dashboard(study, run_id, import_id) -> Path:
    comp = read_json(study.internal / "real_data" / import_id / f"comparison_{run_id}.json")
    esc = html.escape
    qtext = {q.id: q.text for q in study.qn.questions}
    labels = {q.id: {o.code: o.label for o in q.options} for q in study.qn.questions}
    rows = []
    for qid, c in comp["questions"].items():
        bars = []
        for code in sorted(set(c["real"]) | set(c["synthetic"])):
            r, s = 100 * c["real"].get(code, 0), 100 * c["synthetic"].get(code, 0)
            bars.append(f'<tr><td>{esc(labels.get(qid, {}).get(code, code))}</td><td><div class="b r" style="width:{r * 3:.0f}px"></div>{r:.1f}%</td>'
                        f'<td><div class="b s" style="width:{s * 3:.0f}px"></div>{s:.1f}%</td></tr>')
        sub = "".join(f"<li>{esc(k)}: TVD {v['tvd']}</li>" for k, v in c["subgroups"].items())
        rows.append(f'<section><h3>{esc(qid)} — {esc(qtext.get(qid, ""))}</h3><p>n πραγματικό {c["n_real"]} · n συνθετικό {c["n_synth"]} · TVD <b>{c["tvd"]}</b> · '
                    f'μέγιστη απόκλιση {c["max_abs_diff_pp"]} μον. · JS {c["js"]}</p><table><tr><th>Επιλογή</th><th>Πραγματικό</th><th>Συνθετικό</th></tr>{"".join(bars)}</table>'
                    f'<ul>{sub}</ul></section>')
    page = f'''<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Σύγκριση πραγματικών και συνθετικών</title><style>
body{{font:14px system-ui,sans-serif;max-width:1000px;margin:20px auto;padding:0 16px;color:#16191d;background:#fff}} .b{{display:inline-block;height:10px;margin-right:6px;vertical-align:middle;border-radius:2px}}
.r{{background:#1baf7a}} .s{{background:#2a78d6}} table{{border-collapse:collapse}} td,th{{padding:3px 8px;border-bottom:1px solid #eee;text-align:left}} section{{border:1px solid #e4e6e9;border-radius:8px;padding:8px 14px;margin:12px 0}}
</style></head><body><h1>Εσωτερικό dashboard: πραγματικές έναντι συνθετικών απαντήσεων</h1><p>Μελέτη {esc(study.study_id)} · run {esc(run_id)} · εισαγωγή {esc(import_id)}. ΕΣΩΤΕΡΙΚΟ — όχι παραδοτέο πελάτη.</p>{"".join(rows)}</body></html>'''
    p = study.internal / "real_data" / import_id / f"dashboard_{run_id}.html"
    p.write_text(page, encoding="utf-8")
    return p
