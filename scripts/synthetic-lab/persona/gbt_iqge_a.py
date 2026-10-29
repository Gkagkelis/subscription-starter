"""
PHASE5 — Μοντέλο A (Greece only) για τους ελληνικούς στόχους ανάπτυξης: IQGE-1 με τις κλειδωμένες παραμέτρους της Phase 4,
πάνω στη βάση ελληνικών τεκμηρίων, χωρίς την έρευνα-στόχο και χωρίς καμία ισοδύναμη ελληνική ερώτηση (σενάριο S1),
μόνο τεκμήρια έως τον μήνα της έρευνας. Επίσης η ελληνική βάση κλίμακας (B_scale) και η ομοιόμορφη.

  python3 -I scripts/synthetic-lab/persona/gbt_iqge_a.py --root . [--out <json>]
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gbt  # noqa: E402
from iqge_core import IQGE  # noqa: E402

BANK_FILE = {"ess10": "ess10", "ess11": "ess11"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--model", default="pie-0.4")
    ap.add_argument("--params", default="config/synthetic-lab/persona/iqge/params.json")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    gd = gbt.root_dir(root)
    fams = json.load(open(os.path.join(gd, "families.json")))
    sv = gbt.load_surveys(root)
    items = {}
    params = json.load(open(os.path.join(root, a.params)))
    G = IQGE(root, os.path.join(root, ".synthetic-lab-data", "persona", "models", a.model), params)
    out = {}
    for n, (tid, f) in enumerate(fams.items()):
        sid = f["survey"]
        if sid not in items:
            items[sid] = {it["id"]: it for it in gbt.load_items(root, sid)}
        it = items[sid][tid]
        gw = (sv[sid].get("countries", {}).get("GR") or {}).get("wave") or sv[sid].get("wave")
        t = {"id": tid, "var": it["var"], "text": it["text"], "options": it["options"], "type": it["type"], "wave": gw}
        r = G.interpret(t, gw, exclude_file=BANK_FILE.get(sid), exclude_ids=set(f["famBank"]))
        base = r["lev"].get("scale") or r["lev"].get("scalesoft")
        out[tid] = {"A": np.round(np.array(r["level"]) * 100, 3).tolist(), "scale": np.round(np.array(base) * 100, 3).tolist() if base else None,
                    "tier": r["tier"], "sim1": r["sim1"], "wave": gw}
        if n % 200 == 0:
            print(n, "/", len(fams), flush=True)
    json.dump(out, open(a.out or os.path.join(gd, "iqge-a-dev.json"), "w"))


if __name__ == "__main__":
    main()
