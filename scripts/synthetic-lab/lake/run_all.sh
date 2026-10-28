#!/bin/bash
# Πλήρης (επανεκκινήσιμη) συλλογή του Greek Research Data Lake σε παράλληλες «λωρίδες».
# Κάθε λωρίδα συνεχίζει από την ουρά/τα checkpoints αν διακοπεί· τρεις προσπάθειες ανά βήμα.
#   PY=/path/to/python scripts/synthetic-lab/lake/run_all.sh
# Logs: <LAKE>/logs/lane_*.log · Δεδομένα: <LAKE> (= $SYNTHETIC_LAB_LAKE_DIR ή .synthetic-lab-data/lake)
set -u
cd "$(dirname "$0")/.."
PY=${PY:-python3}
LAKE=${SYNTHETIC_LAB_LAKE_DIR:-$(cd ../.. && pwd)/.synthetic-lab-data/lake}
mkdir -p "$LAKE/logs"
lane() {
  local log="$LAKE/logs/$1.log"; shift
  for c in "$@"; do
    echo "=== $(date -u +%FT%TZ) $c" >> "$log"
    for attempt in 1 2 3; do
      $PY -m lake.pipeline ${c%%:*} ${c##*:} >> "$log" 2>&1 && break
      echo "!!! $(date -u +%FT%TZ) $c απέτυχε (προσπάθεια $attempt)" >> "$log"; sleep 20
    done
  done
}
$PY -m lake.pipeline sources > "$LAKE/logs/sources.log" 2>&1
lane eurostat discover:eurostat run:eurostat &
LAKE_QUEUE_ORDER=desc lane eurostat_desc run:eurostat &
lane eurobarometer discover:eurobarometer run:eurobarometer run:eurobarometer_c &
lane repos discover:repos run:repos &
lane catalogs discover:worldbank run:worldbank discover:existing discover:catalogs run:catalogs &
wait
$PY -m lake.pipeline run catalogs   # επανέλεγχος διπλοτύπων μετά από όλες τις πηγές
$PY -m lake.pipeline export
$PY -m lake.pipeline report
