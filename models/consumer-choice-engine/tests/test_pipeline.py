"""Έλεγχος ΚΩΔΙΚΑ της διαδρομής δεδομένων πεδίου (όχι επικύρωση μοντέλου):
σχεδιασμός (cce.design) → αρχείο απαντήσεων τύπου ερευνητικής πλατφόρμας → cce.ingest.wide_tasks (QC, test-retest)
→ cce.train (holdout tasks εκτός εκπαίδευσης) → artifact. Οι απαντήσεις προσομοιώνονται από γνωστούς συντελεστές σε
προσωρινό φάκελο και διαγράφονται· δεν αποθηκεύονται ποτέ ως δεδομένα ή μοντέλο της CCE."""
import json
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

from cce import design as D
from cce.ingest import wide_tasks
from cce.schema import DatasetManifest
from cce.train import run

SPEC = Path(__file__).resolve().parents[1] / "specs" / "gr-min-experiment-washing-machine.json"


def test_field_pipeline_end_to_end():
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    spec["candidates"] = 50
    blocks, _ = D.generate(spec)
    ing = D.export_ingest_design(spec, blocks)
    beta = D.prior_beta(spec, 0.618)
    rng = np.random.default_rng(0)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "design.json").write_text(json.dumps(ing), encoding="utf-8")
        K = len(ing["blocks"]["1"])
        rows = []
        for r in range(450):
            b = str(r % 3 + 1)
            row = {"respondent_id": f"T{r:04d}", "block": b}
            for i, t in enumerate(ing["blocks"][b]):
                X = np.array([[1.0 if n == f"asc_{a}" else float(t["alts"][a].get(n, 0.0)) for n in spec["terms"]] for a in ing["alternatives"]])
                # η επανάληψη παίρνει την ίδια απάντηση με την αρχική για το 80% (έλεγχος του μετρητή test-retest)
                if t["type"].startswith("repeat_of_") and rng.random() < 0.8:
                    row[f"task_{i+1}"] = row[f"task_{int(t['type'].split('_')[-1])}"]
                    continue
                row[f"task_{i+1}"] = ing["alternatives"][int(np.argmax(X @ beta + rng.gumbel(size=len(X))))]
            rows.append(row)
        pd.DataFrame(rows).to_csv(tmp / "responses.csv", index=False)
        m = DatasetManifest(dataset_id="pipeline_test", title="pipeline test (simulated)", source_url="simulated", licence="n/a", country="XX", years="n/a",
                            population="simulated", collection="simulated", unit="test")
        df = wide_tasks(tmp / "responses.csv", tmp / "design.json", tmp / "data", m, [f"task_{i+1}" for i in range(K)])
        man = json.loads((tmp / "data" / "pipeline_test.manifest.json").read_text(encoding="utf-8"))
        qc = json.loads(man["notes"][-1].split("QC: ", 1)[1])
        assert 0.8 <= qc["test_retest_agreement"] <= 1.0
        assert set(df["task_type"]) == {"design", "holdout_H1", "holdout_H2", "repeat_of_1"}
        (tmp / "specs").mkdir()
        tr = {"model_id": "pipeline-test", "data": str(tmp / "data" / "pipeline_test.csv"), "manifest": "pipeline_test.manifest.json",
              "terms": [{"name": n, "kind": "asc", "alt": n[4:]} if n.startswith("asc_") else {"name": n, "kind": "attr", "col": n} for n in spec["terms"]],
              "price_only_terms": [{"name": n, "kind": "asc", "alt": n[4:]} for n in spec["terms"] if n.startswith("asc_")] + [{"name": "price_100eur", "kind": "attr", "col": "price_100eur"}],
              "domain": {"categories": ["test"], "populations": ["XX"]}, "status": "TEST"}
        (tmp / "specs" / "t.json").write_text(json.dumps(tr), encoding="utf-8")
        art = run(str(tmp / "specs" / "t.json"))
        h = art["validation"]["holdout_tasks"]
        assert set(h) == {"holdout_H1", "holdout_H2"} and all(v["n_respondents"] > 50 for v in h.values())
        assert art["selected"] in ("conditional_logit", "price_only_logit")
        b = dict(zip(art["model"]["features"], art["model"]["coef"]))
        assert b["repair_cost_100eur"] < 0 and b["price_100eur"] < 0 and b["tradein_100eur"] > 0
        assert (tmp / "artifacts" / "pipeline-test.json").exists()
