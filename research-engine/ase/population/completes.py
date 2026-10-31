"""Μέγεθος δείγματος σε ΟΛΟΚΛΗΡΩΜΕΝΑ ερωτηματολόγια (completes) με ελεγχόμενη αντικατάσταση (ASE).

config.yaml → panel:
  sample_size: 500
  sample_size_basis: completes            # ή initial_profiles (προεπιλογή: όπως πριν)
  completes:
    quota_basis: natural_incidence        # ΥΠΟΧΡΕΩΤΙΚΟ — βλ. παρακάτω
    max_profiles: 1500                    # ανώτατο πλήθος προφίλ (προεπιλογή 3 × sample_size)
    target_quotas: {...}                  # μόνο για documented_target
    source: {...} | status: assumption + justification   # μόνο για documented_target

Βάσεις quotas (ποια δημογραφική σύνθεση πρέπει να έχουν τα completes):
  natural_incidence   Ο πληθυσμός-στόχος ΔΕΝ έχει τεκμηριωμένη δημογραφική κατανομή (π.χ. «πρόσφατοι αγοραστές»).
                      Αρχικά προφίλ και αντικαταστάτες κληρώνονται αναλογικά με τον πληθυσμό του πλαισίου· η σύνθεση των
                      completes προκύπτει από το screening και ΔΕΝ εξαναγκάζεται στα quotas του γενικού πληθυσμού.
  general_population  Ο πληθυσμός-στόχος είναι ο γενικός πληθυσμός του πλαισίου (το screening δεν ορίζει ειδικό κοινό).
                      Κάθε αποκλεισμένο προφίλ αντικαθίσταται από προφίλ του ΙΔΙΟΥ κελιού περιφέρεια × ηλικία × φύλο.
  documented_target   Υπάρχει τεκμηριωμένη (ή ρητά δηλωμένη) δημογραφική κατανομή του ειδικού κοινού. Αρχικά προφίλ και
                      αντικαταστάτες κληρώνονται με βάρη που στρέφουν το δείγμα προς τα target_quotas· η απόκλιση των
                      completes από τους στόχους ελέγχεται στο QC.
Κανένα από τα τρία δεν επικυρώνει ότι οι απαντήσεις αντιστοιχούν σε πραγματικές συμπεριφορές.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..util import derive_seed
from .panel import UNKNOWN_ATTRIBUTES, VAR_ALIAS, _apply_filters, _used_frame_ids, load_frame

QUOTA_BASES = ("natural_incidence", "general_population", "documented_target")
CELL = ["region", "age_band", "gender"]


def completes_spec(panel_cfg: dict) -> dict | None:
    """None για τη συμβατική λειτουργία (αρχικά προφίλ). Αλλιώς έλεγχος και κανονικοποίηση των ρυθμίσεων."""
    basis = panel_cfg.get("sample_size_basis", "initial_profiles")
    if basis == "initial_profiles":
        return None
    if basis != "completes":
        raise ValueError(f"sample_size_basis: {basis} (επιτρεπτά: initial_profiles, completes)")
    c = dict(panel_cfg.get("completes") or {})
    qb = c.get("quota_basis")
    if qb not in QUOTA_BASES:
        raise ValueError("Για sample_size_basis: completes ορίστε ρητά completes.quota_basis ∈ "
                         f"{QUOTA_BASES}. Τα quotas του γενικού πληθυσμού δεν θεωρούνται αυτόματα σωστά για ειδικό κοινό.")
    if qb == "documented_target":
        tq = c.get("target_quotas") or {}
        if not tq:
            raise ValueError("documented_target: λείπουν τα target_quotas")
        if not c.get("source") and c.get("status") != "assumption":
            raise ValueError("documented_target: τα target_quotas χρειάζονται πηγή (source) ή ρητή παραδοχή (status: assumption + justification)")
        if c.get("status") == "assumption" and not c.get("justification"):
            raise ValueError("documented_target: η παραδοχή χρειάζεται αιτιολόγηση (justification)")
        norm = {}
        for var, levels in tq.items():
            col = VAR_ALIAS.get(var, var)
            s = float(sum(levels.values()))
            if not 0.98 <= s <= 1.02:
                raise ValueError(f"target_quotas.{var}: τα μερίδια αθροίζουν {s:.3f}, όχι 1")
            norm[col] = {str(k): float(v) / s for k, v in levels.items()}
        c["target_quotas"] = norm
    c["quota_basis"] = qb
    c["max_profiles"] = int(c.get("max_profiles") or 3 * int(panel_cfg["sample_size"]))
    return c


def _pool(panel_cfg: dict, study_id: str, exclude: set) -> pd.DataFrame:
    fr = load_frame(panel_cfg.get("frame_id", "gr_adults_2025_v1"))
    target = _apply_filters(fr, panel_cfg)
    used = set(exclude)
    if panel_cfg.get("avoid_overlap", True):
        used |= _used_frame_ids(study_id)
    return target, target[~target["frame_id"].isin(used)]


def _tilt(target: pd.DataFrame, pool: pd.DataFrame, tq: dict) -> np.ndarray:
    """Πολλαπλασιαστής βάρους ανά εγγραφή: Π_v στόχος_v(επίπεδο) / πληθυσμός_v(επίπεδο). Επίπεδα χωρίς στόχο → 0."""
    m = np.ones(len(pool))
    W = target["w"].sum()
    for col, shares in tq.items():
        pop = (target.groupby(col)["w"].sum() / W).to_dict()
        vals = pool[col].astype(str).to_numpy()
        m *= np.array([shares.get(v, 0.0) / pop[v] if pop.get(v) else 0.0 for v in vals])
    return m


def _weighted_draw(ix: np.ndarray, w: np.ndarray, k: int, rng) -> list:
    ok = w > 0
    ix, w = ix[ok], w[ok]
    if k <= 0 or len(ix) == 0:
        return []
    keys = rng.random(len(ix)) ** (1.0 / w)                    # Efraimidis–Spirakis: σταθμισμένη χωρίς επανάθεση
    return list(ix[np.argsort(-keys)][:k])


def draw_profiles(panel_cfg: dict, study_id: str, spec: dict, k: int, *, exclude: set, wave: int, start_number: int,
                  screened_out: pd.DataFrame | None = None) -> tuple[pd.DataFrame, list]:
    """Κληρώνει k νέα προφίλ από το πλαίσιο σύμφωνα με τη βάση quotas. Επιστρέφει (προφίλ, σημειώσεις)."""
    target, pool = _pool(panel_cfg, study_id, exclude)
    pool = pool.reset_index(drop=True)
    seed = int(panel_cfg.get("random_seed", 20261031))
    rng = np.random.default_rng(derive_seed(seed, study_id, "completes", spec["quota_basis"], wave))
    w = pool["w"].to_numpy(dtype=float)
    notes, chosen, replaces = [], [], []
    qb = spec["quota_basis"]
    if qb == "general_population" and screened_out is not None and len(screened_out):
        cells = pool.groupby(CELL).indices
        taken = set()
        for r in screened_out.head(k).itertuples(index=False):
            key = tuple(getattr(r, c) for c in CELL)
            ix = np.array([i for i in cells.get(key, []) if i not in taken], dtype=int)
            pick = _weighted_draw(ix, w[ix], 1, rng) if len(ix) else []
            if not pick:                                        # εξαντλημένο κελί: σπάνιο· καταγράφεται
                rest = np.array([i for i in range(len(pool)) if i not in taken], dtype=int)
                pick = _weighted_draw(rest, w[rest], 1, rng)
                notes.append(f"Το κελί {key} εξαντλήθηκε· αντικατάσταση εκτός κελιού")
            chosen += pick
            replaces += [r.respondent_id] * len(pick)
            taken |= set(pick)
    else:
        if qb == "documented_target":
            w = w * _tilt(target, pool, spec["target_quotas"])
        chosen = _weighted_draw(np.arange(len(pool)), w, k, rng)
        replaces = [""] * len(chosen)
    if len(chosen) < k:
        notes.append(f"Διαθέσιμα μόνο {len(chosen)} από {k} ζητούμενα προφίλ στο πλαίσιο")
    sel = pool.iloc[chosen].copy().reset_index(drop=True)
    sel.insert(0, "respondent_id", [f"R{start_number + i:05d}" for i in range(len(sel))])
    sel.insert(1, "study_id", study_id)
    sel = sel.rename(columns={"frame_id": "frame_record"})
    sel["unknown_attributes"] = ",".join(UNKNOWN_ATTRIBUTES)
    sel["wave"] = wave
    sel["replaces"] = replaces
    return sel, notes


def completes_report(profiles: pd.DataFrame, status: dict, spec: dict, target_n: int, panel_cfg: dict, study_id: str) -> dict:
    """Σύνθεση: προφίλ που χρησιμοποιήθηκαν, αποκλεισμοί, completes, ποσοστό διέλευσης screening ανά ομάδα και — ανάλογα με
    τη βάση — απόκλιση των completes από τους στόχους."""
    p = profiles[profiles["respondent_id"].isin(status)].copy()
    p["status"] = p["respondent_id"].map(status)
    p["wave"] = pd.to_numeric(p["wave"], errors="coerce").fillna(1).astype(int) if "wave" in p else 1
    comp = p[p["status"] == "COMPLETE"]
    out = {"target_completes": target_n, "achieved_completes": int(len(comp)), "profiles_used": int(len(p)),
           "screened_out": int((p["status"] == "SCREENED_OUT").sum()), "replacements": int((p["wave"] > 1).sum()),
           "quota_basis": spec["quota_basis"], "max_profiles": spec["max_profiles"],
           "incidence_pct": round(100 * len(comp) / max(1, len(p)), 1), "by_group": {}, "deviation": {}}
    for col in ("age_band", "gender", "region"):
        g = p.groupby(col)["status"].agg(profiles="size", completes=lambda s: int((s == "COMPLETE").sum()))
        out["by_group"][col] = {str(k): {"profiles": int(r.profiles), "completes": int(r.completes),
                                         "incidence_pct": round(100 * r.completes / r.profiles, 1)} for k, r in g.iterrows()}
    if len(comp):
        if spec["quota_basis"] == "documented_target":
            ref = spec["target_quotas"]
            ref_name = "target_quotas"
        else:
            fr = _apply_filters(load_frame(panel_cfg.get("frame_id", "gr_adults_2025_v1")), panel_cfg)
            W = fr["w"].sum()
            ref = {c: (fr.groupby(c)["w"].sum() / W).astype(float).to_dict() for c in ("age_band", "gender", "region")}
            ref_name = "frame_population"
        for col, shares in ref.items():
            got = comp[col].astype(str).value_counts(normalize=True).to_dict()
            dev = {str(l): round(100 * (got.get(str(l), 0.0) - s), 1) for l, s in shares.items()}
            out["deviation"][col] = {"reference": ref_name, "max_abs_pp": max(abs(v) for v in dev.values()), "by_level_pp": dev}
    return out
