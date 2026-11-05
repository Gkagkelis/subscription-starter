#!/bin/bash
# Αναπαραγωγή της μελέτης kotsovolos_lab_pilot_2026 (ίδιο seed ⇒ ίδιες απαντήσεις). Χωρίς AI, χωρίς δίκτυο, χωρίς κόστος API.
set -euo pipefail
cd "$(dirname "$0")/../../.."
python3 -I scripts/synthetic-lab/structured/pipeline.py --study studies/kotsovolos_lab_pilot_2026 --n 500 --seed 20261105
