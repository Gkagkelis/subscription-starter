"""Runner χωρίς εξαρτήσεις (το pytest δεν είναι εγκατεστημένο). Οι μελέτες των tests γράφονται σε προσωρινό φάκελο.
    python3 -I research-engine/tests/run_tests.py"""
import importlib
import os
import sys
import tempfile
import time
import traceback
from pathlib import Path

TMP = tempfile.mkdtemp(prefix="ase-tests-")
os.environ["ASE_STUDIES_ROOT"] = str(Path(TMP) / "studies")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from ase.paths import ASE_DATA  # noqa: E402

if not (ASE_DATA / "frames" / "gr_adults_2025_v1.csv.gz").exists():
    from ase.population.frame import build_frame
    print("Δημιουργία πλαισίου δειγματοληψίας…")
    build_frame()

ok = fail = blocked = 0
for f in sorted((ROOT / "tests").glob("test_*.py")):
    mod = importlib.import_module(f.stem)
    for name in sorted(n for n in dir(mod) if n.startswith("test_")):
        t = time.time()
        try:
            getattr(mod, name)()
            ok += 1
            print(f"PASS {f.name}::{name} ({time.time() - t:.1f}s)")
        except Exception as e:
            if type(e).__name__ == "Blocked":
                blocked += 1
                print(f"BLOCKED {f.name}::{name}: {e}")
                continue
            fail += 1
            print(f"FAIL {f.name}::{name}")
            traceback.print_exc()
print(f"{ok}/{ok + fail + blocked} πέρασαν" + (f" · {blocked} BLOCKED (λείπουν ιδιωτικά δεδομένα)" if blocked else ""))
sys.exit(1 if fail else 0)
