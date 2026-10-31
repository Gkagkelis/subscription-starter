"""Εμπειρικά μοντέλα για MODE A / MODE C (ASE).

Σήμερα υποστηρίζεται η Consumer Choice Engine (models/consumer-choice-engine). Ορισμός σε ερώτηση:
  empirical_model:
    engine: cce
    artifact: cce-0.1-swiss-ce-washing-machine
    context: {category: washing_machine}
    money: {price_eur: [price_100chf, 100]}
    transfer_assumption: T0            (για μοντέλα άλλης χώρας — experimental_transfer_mode)
    options: {"1": {alt_id: A, price_eur: 549, ...}, "2": {...}}    (κωδικός επιλογής → εναλλακτική του μοντέλου)
Κανόνες:
  * Η πύλη της CCE αποφασίζει αν το σενάριο είναι εντός πεδίου· εκτός πεδίου → το εμπειρικό μοντέλο ΔΕΝ χρησιμοποιείται.
  * Μοντέλο άλλης χώρας από τη χώρα της μελέτης δεν γίνεται ποτέ αυτόματα MODE A: χρησιμοποιείται ως MODE C (υβριδικό) με
    σήμανση EXPERIMENTAL_CROSS_COUNTRY_TRANSFER, ή ως MODE A μόνο αν το config το επιτρέπει ρητά (allow_cross_country_mode_a).
"""
from __future__ import annotations

import json
import sys
from functools import lru_cache

from ..paths import CCE_ROOT


@lru_cache(maxsize=1)
def _cce():
    if str(CCE_ROOT) not in sys.path:
        sys.path.insert(0, str(CCE_ROOT))
    from cce.engine import ChoiceEngine  # noqa: E402
    from cce.transfer import ExperimentalTransfer, TransferAssumption  # noqa: E402
    return ChoiceEngine, ExperimentalTransfer, TransferAssumption


ASSUMPTIONS = {"T0": ("ppp_income", 0.5), "T1": ("ppp_income", 0.0), "T2": ("ppp_income", 1.0), "T3": ("nominal", None)}


class CCEAdapter:
    def __init__(self, spec: dict, study_country: str):
        ChoiceEngine, ExperimentalTransfer, TransferAssumption = _cce()
        self.spec = spec
        art = CCE_ROOT / "artifacts" / f"{spec['artifact']}.json"
        self.engine = ChoiceEngine.load(art)
        if not self.engine.art:
            raise FileNotFoundError(art)
        m = self.engine.art["dataset"]["manifest"]
        self.source_country = m["country"]
        self.cross_country = self.source_country != study_country
        self.licence = m["licence"]
        self.transfer = None
        if self.cross_country:
            years = str(m["years"]).split("-")[-1]
            macro = json.loads((CCE_ROOT / "transfer" / "macro_inputs.json").read_text(encoding="utf-8"))
            aid = spec.get("transfer_assumption", "T0")
            method, eps = ASSUMPTIONS[aid]
            ta = TransferAssumption(macro, aid, aid, method, eps)
            money = {k: tuple(v) for k, v in (spec.get("money") or {}).items()}
            self.transfer = ExperimentalTransfer(art, ta, self.source_country, years, money, experimental_transfer_mode=True)

    def describe(self):
        return {"engine": "cce", "artifact": self.spec["artifact"], "source_country": self.source_country, "cross_country": self.cross_country,
                "licence": self.licence, "transfer_assumption": self.spec.get("transfer_assumption") if self.cross_country else None}

    def probabilities(self, profile: dict, codes: list) -> tuple[dict | None, str, list]:
        """Επιστρέφει ({κωδικός: πιθανότητα} | None, status, reasons) για ένα προφίλ."""
        alts = [dict(self.spec["options"][c]) for c in codes]
        ctx = self.spec.get("context", {})
        prof = {"respondent_id": profile["respondent_id"], "age_band": profile.get("age_band"), "female": int(profile.get("gender") == "female")}
        if self.transfer:
            r = self.transfer.run_panel([prof], ctx, {"s": alts}, task_key="ase", seed=20261031)["s"]
            if r["status"] != "EXPERIMENTAL_CROSS_COUNTRY_TRANSFER":
                return None, r["status"], r.get("reasons", [])
            p = r["individual"][0]["p"]
            return {c: p[a["alt_id"]] for c, a in zip(codes, alts)}, r["status"], []
        r = self.engine.predict_proba(prof, ctx, alts)
        if r["status"] != "SUPPORTED":
            return None, r["status"], r["reasons"]
        return {c: r["probabilities"][a["alt_id"]] for c, a in zip(codes, alts)}, r["status"], []


def make_adapter(spec: dict | None, study_country: str):
    if not spec:
        return None
    if spec.get("engine") != "cce":
        raise ValueError(f"Άγνωστο εμπειρικό engine {spec.get('engine')}")
    return CCEAdapter(spec, study_country)
