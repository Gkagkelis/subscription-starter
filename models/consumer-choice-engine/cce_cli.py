"""Σημείο εκκίνησης των εργαλείων της CCE σε isolated mode (python3 -I), που δεν προσθέτει τον φάκελο στο sys.path.
    python3 -I cce_cli.py <module> [args…]      π.χ.  python3 -I cce_cli.py train specs/cce-0.1-swiss-ce-washing-machine.json
modules: train, check, summarize, design, transfer_check, adapters.brugge2024_swiss_ce, adapters.kurdhi2023_refurb, adapters.berke2023_drone, adapters.train_electricity
"""
import runpy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
mod = sys.argv[1]
sys.argv = [mod] + sys.argv[2:]
runpy.run_module(f"cce.{mod}", run_name="__main__")
