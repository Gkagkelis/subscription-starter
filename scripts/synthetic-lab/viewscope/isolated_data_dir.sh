#!/bin/bash
# Δημιουργεί απομονωμένο φάκελο δεδομένων για επανεκτελέσεις/ελέγχους: σύνδεσμοι μόνο-ανάγνωσης προς τα δεδομένα,
# ενώ οι φάκελοι όπου γράφουν τα scripts (benchmarks, research, panels, studies) είναι νέοι φάκελοι με συνδέσμους ανά αρχείο.
# Έτσι καμία επανεκτέλεση δεν προσθέτει/σβήνει αρχεία στα πραγματικά δεδομένα.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/../../.." && pwd)/.synthetic-lab-data"
DST="${1:?χρήση: isolated_data_dir.sh <φάκελος>}"
rm -rf "$DST"; mkdir -p "$DST"
for e in "$SRC"/*; do
  n=$(basename "$e")
  case "$n" in
    benchmarks) mkdir -p "$DST/$n" ;;
    research|panels|studies) mkdir -p "$DST/$n"; for f in "$e"/*; do [ -e "$f" ] && ln -s "$f" "$DST/$n/$(basename "$f")"; done ;;
    *) ln -s "$e" "$DST/$n" ;;
  esac
done
echo "$DST"
