"""Διαδρομές: repo, ιδιωτικός φάκελος δεδομένων (gitignored), μελέτες."""
from __future__ import annotations

import os
from pathlib import Path

ENGINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ENGINE_ROOT.parent
DATA_ROOT = Path(os.environ.get("SYNTHETIC_LAB_DATA", REPO_ROOT / ".synthetic-lab-data"))
ASE_DATA = DATA_ROOT / "ase"
STUDIES_ROOT = Path(os.environ.get("ASE_STUDIES_ROOT", REPO_ROOT / "studies"))
OFFICIAL_TS = REPO_ROOT / "lib" / "synthetic-lab" / "data" / "official"
OFFICIAL_ASE = ENGINE_ROOT / "data" / "official"
GLOPOP_RAW = DATA_ROOT / "raw" / "glopop" / "GRC"
CCE_ROOT = REPO_ROOT / "models" / "consumer-choice-engine"
