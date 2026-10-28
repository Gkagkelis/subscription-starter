"""Eurobarometer — 2η φάση (Volume C, διασπάσεις για την Ελλάδα). Η ουρά γεμίζει από το `run eurobarometer`."""

from . import eurobarometer


def discover(con, limit=None):
    return 0


def run(con, max_tasks=None):
    return eurobarometer.run_c(con, max_tasks)
