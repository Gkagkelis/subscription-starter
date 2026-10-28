"""
Εφάπαξ sprint βελτίωσης του Persona Engine (10/2026): κατάσταση εργασίας, checkpoints, μητρώο πειραμάτων.

Δεν είναι μόνιμος μηχανισμός αυτο-εκπαίδευσης: καταγράφει μία συγκεκριμένη διαδικασία, ώστε να συνεχίζει μετά από διακοπή.

  python3 scripts/synthetic-lab/persona/sprint.py status
  python3 scripts/synthetic-lab/persona/sprint.py done <stage> [--note "..."] [--artifact path ...]
  python3 scripts/synthetic-lab/persona/sprint.py fail <stage> --note "..."
  python3 scripts/synthetic-lab/persona/sprint.py experiments

Από Python: `from sprint import checkpoint, log_experiment, stage_done`.
"""
import argparse
import json
import os
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DIR = os.path.join(ROOT, ".synthetic-lab-data", "persona", "sprint")
STATE = os.path.join(DIR, "state.json")
EXPS = os.path.join(DIR, "experiments.jsonl")
LOG = os.path.join(DIR, "log.jsonl")
STAGES = [
    "p1_snapshot", "p1_scale_fix", "p1_weights_audit",
    "p2_pdf_download", "p2_microdata_download", "p2_consumer_download", "p2_pdf_parse", "p2_microdata_adapters", "p2_lake_integration",
    "p3_c2_new_microdata", "p3_c3_temporal", "p3_c4_vote", "p3_c5_aggregate_items", "p3_c6_autolink",
    "p4_validation_benchmarks", "p5_diagnosis",
    "p6_lock_candidate", "p6_final_holdout",
    "p7_release",
]


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def load():
    if os.path.exists(STATE):
        return json.load(open(STATE))
    return {"createdAt": _now(), "stages": {s: {"status": "pending"} for s in STAGES}}


def save(st):
    os.makedirs(DIR, exist_ok=True)
    tmp = STATE + ".tmp"
    json.dump(st, open(tmp, "w"), ensure_ascii=False, indent=1)
    os.replace(tmp, STATE)


def _log(rec):
    os.makedirs(DIR, exist_ok=True)
    with open(LOG, "a") as f:
        f.write(json.dumps({"at": _now(), **rec}, ensure_ascii=False) + "\n")


def checkpoint(stage, status, note="", artifacts=None, **extra):
    st = load()
    st["stages"].setdefault(stage, {})
    st["stages"][stage].update({"status": status, "at": _now(), "note": note, "artifacts": artifacts or [], **extra})
    save(st)
    _log({"stage": stage, "status": status, "note": note})


def stage_done(stage):
    return load()["stages"].get(stage, {}).get("status") == "done"


def log_experiment(exp_id, change, config, metrics, decision, split, notes=""):
    """Κάθε πείραμα: τι άλλαξε, σε ποια δεδομένα, με ποιο αποτέλεσμα και ποια απόφαση."""
    os.makedirs(DIR, exist_ok=True)
    with open(EXPS, "a") as f:
        f.write(json.dumps({"at": _now(), "id": exp_id, "change": change, "split": split, "config": config, "metrics": metrics,
                            "decision": decision, "notes": notes}, ensure_ascii=False) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["status", "done", "fail", "experiments"])
    ap.add_argument("stage", nargs="?")
    ap.add_argument("--note", default="")
    ap.add_argument("--artifact", nargs="*", default=[])
    a = ap.parse_args()
    if a.cmd == "status":
        for s, v in load()["stages"].items():
            print(f"{v.get('status', 'pending'):8s} {s:26s} {v.get('at', '')}  {v.get('note', '')[:90]}")
    elif a.cmd in ("done", "fail"):
        checkpoint(a.stage, "done" if a.cmd == "done" else "failed", a.note, a.artifact)
    else:
        if os.path.exists(EXPS):
            for line in open(EXPS):
                e = json.loads(line)
                print(f"{e['id']:22s} {e['split']:12s} {e['decision']:9s} {json.dumps(e['metrics'], ensure_ascii=False)[:120]}")


if __name__ == "__main__":
    main()
