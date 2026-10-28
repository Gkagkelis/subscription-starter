#!/usr/bin/env bash
# Αναπαραγωγή όλης της ροής: λήψη πηγών -> ανάλυση -> tidy CSV + έλεγχοι.
# Χρήση (από τη ρίζα του repo):  bash scripts/synthetic-lab/political/polls_elections/run_all.sh [--refetch]
# Τα κατεβασμένα αρχεία είναι μη έμπιστα δεδομένα: διαβάζονται μόνο ως δεδομένα (python3 -I, διαδρομές ως ορίσματα).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
D="$ROOT/scripts/synthetic-lab/political/polls_elections"
RAW="$ROOT/.synthetic-lab-data/raw/political"
TIDY="$RAW/tidy"
WORK="$RAW/_work"
mkdir -p "$RAW/polls" "$RAW/elections" "$TIDY" "$WORK"
SKIP="--skip-existing"
[[ "${1:-}" == "--refetch" ]] && SKIP=""
python3 -I "$D/fetch_sources.py" "$RAW" $SKIP
python3 -I "$D/parse_polls.py" "$RAW" "$D/party_map_source.csv" "$WORK/polls_parsed.csv" "$WORK/party_auto.csv"
python3 -I "$D/parse_results.py" "$RAW" "$D/party_map_source.csv" "$TIDY"
python3 -I "$D/build_tidy.py" "$TIDY" "$WORK/polls_parsed.csv" "$D/party_map_source.csv" "$WORK/party_auto.csv"
python3 -I "$D/make_readme.py" "$RAW"
echo "OK -> $TIDY"
