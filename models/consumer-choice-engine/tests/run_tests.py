"""Απλός runner χωρίς εξαρτήσεις: εκτελεί κάθε συνάρτηση test_* των αρχείων tests/test_*.py.
    python3 -I tests/run_tests.py            (από τον φάκελο models/consumer-choice-engine)"""
import importlib.util
import sys
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))
fails = 0
total = 0
for f in sorted((ROOT / "tests").glob("test_*.py")):
    spec = importlib.util.spec_from_file_location(f.stem, f)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for name in sorted(n for n in dir(mod) if n.startswith("test_")):
        total += 1
        t0 = time.time()
        try:
            getattr(mod, name)()
            print(f"PASS {f.name}::{name} ({time.time() - t0:.1f}s)")
        except Exception:
            fails += 1
            print(f"FAIL {f.name}::{name}")
            traceback.print_exc()
print(f"{total - fails}/{total} πέρασαν")
sys.exit(1 if fails else 0)
