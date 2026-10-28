"""
Greek Research Data Lake — ενιαίο CLI ingestion pipeline (επανεκκινήσιμο, με checkpoints).

  python -m lake.pipeline sources                 # registry πηγών + έλεγχος προσβασιμότητας
  python -m lake.pipeline discover <connector>    # ανακάλυψη → studies (DISCOVERED) + ουρά
  python -m lake.pipeline run <connector> [--max N]
  python -m lake.pipeline export                  # εξαγωγή για το simulation engine
  python -m lake.pipeline report                  # coverage_report από τη βάση
  python -m lake.pipeline monitor                 # νέες εκδόσεις/νέες έρευνες → ουρά (επαυξητικά)
  python -m lake.pipeline status                  # σύνοψη καταστάσεων

Εκτέλεση από scripts/synthetic-lab:  python -m lake.pipeline ...
"""

import argparse
import importlib
import sys

from . import db

CONNECTORS = {
    "eurostat": "lake.eurostat",
    "repos": "lake.repos",
    "catalogs": "lake.catalogs",
    "worldbank": "lake.worldbank",
    "existing": "lake.existing",
    "eurobarometer": "lake.eurobarometer",
    "eurobarometer_c": "lake.eurobarometer_c",
    "cessda": "lake.catalogs",
}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="lake.pipeline")
    ap.add_argument("cmd", choices=["sources", "discover", "run", "export", "report", "status", "monitor"])
    ap.add_argument("connector", nargs="?")
    ap.add_argument("--max", type=int, default=None)
    ap.add_argument("--limit", type=int, default=None)
    a = ap.parse_args(argv)
    con = db.connect()
    if a.cmd == "sources":
        from . import sources
        sources.register_and_probe(con)
    elif a.cmd in ("discover", "run"):
        mod = importlib.import_module(CONNECTORS[a.connector])
        n = mod.discover(con, limit=a.limit) if a.cmd == "discover" else mod.run(con, max_tasks=a.max)
        print(f"✓ {a.cmd} {a.connector}: {n}")
    elif a.cmd == "export":
        from . import export
        export.run(con)
    elif a.cmd == "monitor":
        from . import monitor
        monitor.run(con)
    elif a.cmd == "report":
        from . import report
        report.run(con)
    elif a.cmd == "status":
        for r in con.execute("SELECT source_id, status, COUNT(*) c FROM studies GROUP BY 1,2 ORDER BY 1,2"):
            print(f"  {r['source_id']:14} {r['status']:11} {r['c']}")
        for r in con.execute("SELECT kind, state, COUNT(*) c FROM queue GROUP BY 1,2 ORDER BY 1,2"):
            print(f"  queue {r['kind']:20} {r['state']:8} {r['c']}")
    con.commit()


if __name__ == "__main__":
    sys.exit(main())
