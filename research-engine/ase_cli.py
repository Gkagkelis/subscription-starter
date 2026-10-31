"""Adaptive Synthetic Research Engine — γραμμή εντολών.

    python3 -I research-engine/ase_cli.py <εντολή> [επιλογές]

Εντολές:
  build-frame                                   πλαίσιο δειγματοληψίας (GLOPOP-S + Eurostat/ΕΛΣΤΑΤ 2025)
  init-study <dir> --id ID --title ... [--sample-size N]   νέα μελέτη από πρότυπο
  validate <dir>                                έλεγχος ερωτηματολογίου (τύποι, skip logic, intents)
  panel <dir> [--regenerate]                    συνθετικό πάνελ + έλεγχος quotas
  context <dir>                                 ερευνητικό πλαίσιο (lake, επίσημα, επιμελημένες πηγές, web αν ενεργό)
  estimate <dir> --provider P --model M [--n N] εκτίμηση tokens/κόστους πριν από εκτέλεση
  dry-run <dir> [--n 15] [--questions Q1,Q2] [--provider mock]     δοκιμαστική εκτέλεση ≤ 20 προφίλ
  run <dir> --provider P --model M --budget-usd X --confirm [--resume RUN_ID]   πλήρης εκτέλεση
  report <dir> --run RUN_ID [--no-pdf]          results/crosstabs/αναφορά (preview για dry/mock)
  export <dir> <dest>                           εξαγωγή ΜΟΝΟ παραδοτέων πελάτη
  import-real <dir> <data.csv> <metadata.yaml> <mapping.yaml>
  compare <dir> --run RUN_ID --import IMPORT_ID [--dashboard]
  calibrate <dir> --run RUN_ID --import IMPORT_ID [--min-n 200]
  providers                                     διαθεσιμότητα παρόχων LLM
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ase.llm.runtime import PROVIDERS, make_provider  # noqa: E402


def _print(o):
    print(json.dumps(o, ensure_ascii=False, indent=1, default=str))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="ase", description="Adaptive Synthetic Research Engine v2.0")
    sp = ap.add_subparsers(dest="cmd", required=True)
    sp.add_parser("build-frame").add_argument("--size", type=int, default=250_000)
    a = sp.add_parser("init-study")
    a.add_argument("dir"); a.add_argument("--id", required=True); a.add_argument("--title", required=True); a.add_argument("--client", default="")
    a.add_argument("--sample-size", type=int, default=500); a.add_argument("--regions", default=""); a.add_argument("--filters", default="{}")
    for c in ("validate", "context", "providers"):
        x = sp.add_parser(c)
        if c != "providers":
            x.add_argument("dir")
    a = sp.add_parser("panel"); a.add_argument("dir"); a.add_argument("--regenerate", action="store_true")
    a = sp.add_parser("estimate"); a.add_argument("dir"); a.add_argument("--provider", default="anthropic"); a.add_argument("--model", default="claude-opus-5-5")
    a.add_argument("--n", type=int); a.add_argument("--questions"); a.add_argument("--batching", default="per_question")
    for c in ("dry-run", "run"):
        a = sp.add_parser(c); a.add_argument("dir"); a.add_argument("--provider", default="mock"); a.add_argument("--model", default="mock-1")
        a.add_argument("--n", type=int); a.add_argument("--questions"); a.add_argument("--budget-usd", type=float); a.add_argument("--confirm", action="store_true")
        a.add_argument("--resume"); a.add_argument("--workers", type=int, default=4); a.add_argument("--rpm", type=float, default=50); a.add_argument("--batching", default="per_question")
        a.add_argument("--effort", default="low")
    a = sp.add_parser("report"); a.add_argument("dir"); a.add_argument("--run", required=True); a.add_argument("--no-pdf", action="store_true")
    a = sp.add_parser("export"); a.add_argument("dir"); a.add_argument("dest")
    a = sp.add_parser("import-real"); a.add_argument("dir"); a.add_argument("data"); a.add_argument("meta"); a.add_argument("mapping")
    a = sp.add_parser("compare"); a.add_argument("dir"); a.add_argument("--run", required=True); a.add_argument("--import", dest="imp", required=True); a.add_argument("--dashboard", action="store_true")
    a = sp.add_parser("calibrate"); a.add_argument("dir"); a.add_argument("--run", required=True); a.add_argument("--import", dest="imp", required=True); a.add_argument("--min-n", type=int, default=200)
    args = ap.parse_args(argv)

    if args.cmd == "build-frame":
        from ase.population.frame import build_frame
        print(build_frame(frame_size=args.size))
        return
    if args.cmd == "providers":
        out = {}
        for n, cls in PROVIDERS.items():
            ok, why = cls("x").available()
            out[n] = {"available": ok, "detail": why}
        _print(out)
        return
    if args.cmd == "init-study":
        from ase.templates import init_study
        print(init_study(Path(args.dir), args.id, args.title, args.client, args.sample_size, [r for r in args.regions.split(",") if r], json.loads(args.filters)))
        return
    from ase.study import Study
    st = Study(args.dir)
    if args.cmd == "validate":
        from collections import Counter
        _print({"questionnaire": st.qn.id, "questions": len(st.qn.questions), "blocks": len(st.qn.blocks), "types": Counter(q.type for q in st.qn.questions),
                "intents": {q.id: f"{q.intent} ({q.intent_source})" for q in st.qn.questions}, "status": "VALID"})
    elif args.cmd == "panel":
        df = st.ensure_panel(regenerate=args.regenerate)
        rep = json.loads((st.internal / "panel_report.json").read_text(encoding="utf-8"))
        _print({"respondents": len(df), "max_abs_deviation_pp": rep["max_abs_deviation_pp"], "all_within_tolerance": rep["all_within_tolerance"], "disclaimer": rep["disclaimer"]})
    elif args.cmd == "context":
        reg = st.build_context()
        _print({"accepted": len(reg["accepted"]), "rejected": len(reg["rejected"]), "notes": reg["notes"], "top": [a["title"] for a in reg["accepted"][:8]]})
    elif args.cmd == "estimate":
        _print(st.estimate({"provider": args.provider, "model": args.model}, n=args.n, question_ids=args.questions.split(",") if args.questions else None, batching=args.batching))
    elif args.cmd in ("dry-run", "run"):
        pc = {"provider": args.provider, "model": args.model, "effort": args.effort}
        rid = st.run(pc, n=args.n, question_ids=args.questions.split(",") if args.questions else None, dry_run=args.cmd == "dry-run", confirm=args.confirm,
                     budget_usd=args.budget_usd, resume_run_id=args.resume, max_workers=args.workers, batching=args.batching, requests_per_minute=args.rpm)
        man = json.loads((st.internal / "runs" / rid / "execution_manifest.json").read_text(encoding="utf-8"))
        qc = json.loads((st.internal / "runs" / rid / "quality_checks.json").read_text(encoding="utf-8"))
        _print({"run_id": rid, "respondents": man["respondents_completed"], "errors": man["errors"], "ledger": man["ledger"],
                "qc": {c["check"]: c["status"] for c in qc["checks"]}, "flags": qc["flags"]})
    elif args.cmd == "report":
        print(st.build_deliverables(args.run, pdf=not args.no_pdf))
    elif args.cmd == "export":
        print(st.export(Path(args.dest)))
    elif args.cmd == "import-real":
        from ase.calibration.realdata import import_real
        print(import_real(st, args.data, args.meta, args.mapping))
    elif args.cmd == "compare":
        from ase.calibration.realdata import compare, dashboard
        c = compare(st, args.run, args.imp)
        _print({q: {k: v[k] for k in ("n_real", "n_synth", "tvd", "max_abs_diff_pp")} for q, v in c["questions"].items()})
        if args.dashboard:
            print(dashboard(st, args.run, args.imp))
    elif args.cmd == "calibrate":
        from ase.calibration.realdata import calibrate
        print(calibrate(st, args.run, args.imp, min_n=args.min_n))


if __name__ == "__main__":
    from ase.study import ConfirmationRequired
    from ase.llm.base import BudgetExceeded
    try:
        main()
    except (ConfirmationRequired, BudgetExceeded, RuntimeError, PermissionError, FileNotFoundError, FileExistsError, ValueError) as e:
        print(f"[ase] {e.__class__.__name__}: {e}", file=sys.stderr)
        sys.exit(2)
