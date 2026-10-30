"""CCE — experimental_transfer_mode: ΕΡΕΥΝΗΤΙΚΗ εφαρμογή εκπαιδευμένων μοντέλων σε πληθυσμό άλλης χώρας.

Αρχές:
  * Ενεργοποιείται ΜΟΝΟ ρητά (experimental_transfer_mode=True)· αλλιώς PermissionError.
  * ΔΕΝ αλλάζει τα εκπαιδευμένα μοντέλα: διαβάζει το artifact, ελέγχει το SHA-256 του αρχείου πριν και μετά.
  * ΔΕΝ καταργεί την πύλη εφαρμοσιμότητας: κάθε σενάριο, ΑΦΟΥ μετατραπούν τα νομισματικά χαρακτηριστικά στις μονάδες του
    μοντέλου, περνά από ChoiceEngine.assess (κατηγορία, εναλλακτικές, χαρακτηριστικά, εύρη) και από τυχόν αυστηρότερα εύρη
    ανά κατηγορία. NOT_SUPPORTED → καμία απάντηση. EXTRAPOLATION → καμία απάντηση (EXTRAPOLATION_REJECTED).
  * Κάθε αποτέλεσμα σφραγίζεται EXPERIMENTAL_CROSS_COUNTRY_TRANSFER με χώρα/έτος προέλευσης, υπόθεση μεταφοράς και
    συντελεστή μετατροπής. Δεν είναι επικυρωμένη πρόβλεψη για τη χώρα-στόχο.

Μετατροπή χρηματικού ποσού P (ευρώ, έτος αναφοράς R, Ελλάδα) σε νόμισμα πηγής s, έτος έρευνας t:
    P_s = P × [HICP_GR(t) / HICP_GR(R)] × [PPP_s(t) / PPP_GR(t)] × [Y_s(t) / Y_GR(t)]^ε          (υποθέσεις PPP/εισοδήματος)
    P_s = P × [HICP_GR(t) / HICP_GR(R)] × XR_s/EUR(t)                                             (υπόθεση ονομαστικής ισοτιμίας)
PPP = PPP ιδιωτικής κατανάλωσης (World Bank PA.NUS.PRVT.PP), Y = ΑΕΠ κατά κεφαλή σε PPP (NY.GDP.PCAP.PP.CD),
XR = επίσημη ισοτιμία (PA.NUS.FCRF), HICP = Eurostat prc_hicp_aind (CP00, EL). Το ε είναι ΥΠΟΘΕΣΗ μεταφοράς
(ελαστικότητα της αξίας του χρήματος ως προς το εισόδημα), όχι εκτιμημένη ελληνική παράμετρος.
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

from .engine import ChoiceEngine

TRANSFER_STATUS = "EXPERIMENTAL_CROSS_COUNTRY_TRANSFER"
ISO3 = {"CH": "CHE", "US": "USA", "GR": "GRC"}


def build_macro(raw_dir, out_json, ref_year="2025"):
    """Από τα ακατέργαστα αρχεία World Bank / Eurostat → μικρό JSON εισόδων με πηγές (αναπαραγώγιμο)."""
    raw = Path(raw_dir)
    out = {"reference_year_greek_prices": ref_year, "sources": {}, "series": {}}
    for ind in ("PA.NUS.PRVT.PP", "NY.GDP.PCAP.PP.CD", "PA.NUS.FCRF"):
        d = json.loads((raw / f"wb_{ind}.json").read_text())
        out["sources"][ind] = {"provider": "World Bank WDI API", "url": f"https://api.worldbank.org/v2/country/GRC;CHE;USA;EMU/indicator/{ind}",
                               "lastupdated": d[0].get("lastupdated"), "licence": "CC BY 4.0"}
        s = {}
        for r in d[1]:
            if r["value"] is not None:
                s.setdefault(r["countryiso3code"], {})[r["date"]] = r["value"]
        out["series"][ind] = s
    h = json.loads((raw / "hicp_el.json").read_text())
    idx = {v: k for k, v in h["dimension"]["time"]["category"]["index"].items()}
    out["series"]["HICP_EL_CP00"] = {idx[int(k)]: v for k, v in h["value"].items()}
    out["sources"]["HICP_EL_CP00"] = {"provider": "Eurostat prc_hicp_aind (CP00, EL, INX_A_AVG, 2015=100)",
                                      "url": "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_aind?geo=EL&coicop=CP00&unit=INX_A_AVG",
                                      "updated": h.get("updated"), "licence": "Eurostat reuse policy (CC BY 4.0)"}
    Path(out_json).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    return out


class TransferAssumption:
    def __init__(self, macro: dict, assumption_id: str, label: str, method: str, epsilon: float | None = None):
        assert method in ("ppp_income", "nominal")
        self.macro, self.id, self.label, self.method, self.epsilon = macro, assumption_id, label, method, epsilon

    def factor(self, src_country: str, src_year: str) -> dict:
        """Μονάδες νομίσματος πηγής (έτος έρευνας) ανά 1 ευρώ ελληνικής τιμής του έτους αναφοράς."""
        S, s, t, R = self.macro["series"], ISO3[src_country], str(src_year), self.macro["reference_year_greek_prices"]
        defl = S["HICP_EL_CP00"][t] / S["HICP_EL_CP00"][R]
        if self.method == "nominal":
            xr = S["PA.NUS.FCRF"][s][t] / S["PA.NUS.FCRF"]["GRC"][t]          # (LCU_s/USD) / (EUR/USD)
            f = defl * xr
            parts = {"deflator_gr": defl, "exchange_rate_src_per_eur": xr}
        else:
            ppp = S["PA.NUS.PRVT.PP"][s][t] / S["PA.NUS.PRVT.PP"]["GRC"][t]
            inc = S["NY.GDP.PCAP.PP.CD"][s][t] / S["NY.GDP.PCAP.PP.CD"]["GRC"][t]
            f = defl * ppp * inc ** self.epsilon
            parts = {"deflator_gr": defl, "ppp_ratio": ppp, "income_ratio": inc, "epsilon": self.epsilon}
        return {"factor": f, **parts, "src_country": src_country, "src_year": t, "ref_year": R}


def file_sha256(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


class ExperimentalTransfer:
    """money_map: {πεδίο_σε_ευρώ: (πεδίο_μοντέλου, μονάδα)} π.χ. {"price_eur": ("price_100chf", 100)}.
    extra_ranges: {κατηγορία: {χαρακτηριστικό: [min, max]}}: αυστηρότερα εύρη (π.χ. ανά τύπο προϊόντος του πειράματος)."""

    def __init__(self, artifact_path, assumption: TransferAssumption, src_country: str, src_year: str, money_map: dict,
                 extra_ranges: dict | None = None, *, experimental_transfer_mode: bool = False):
        if experimental_transfer_mode is not True:
            raise PermissionError("Η ερευνητική μεταφορά μεταξύ χωρών πρέπει να ενεργοποιηθεί ρητά: experimental_transfer_mode=True")
        self.path = Path(artifact_path)
        self.sha_before = file_sha256(self.path)
        self.engine = ChoiceEngine.load(self.path)
        self.assumption, self.src_country, self.src_year = assumption, src_country, str(src_year)
        self.money_map, self.extra_ranges = money_map, extra_ranges or {}
        self.conv = assumption.factor(src_country, self.src_year)

    def to_model_units(self, alts_eur):
        out = []
        for a in alts_eur:
            b = {}
            for k, v in a.items():
                if k in self.money_map:
                    col, unit = self.money_map[k]
                    b[col] = v * self.conv["factor"] / unit
                else:
                    b[k] = v
            out.append(b)
        return out

    def _extra_gate(self, context, alts):
        reasons = []
        for k, (lo, hi) in self.extra_ranges.get(context.get("category"), {}).items():
            for a in alts:
                if k in a and not (lo - 1e-9 <= float(a[k]) <= hi + 1e-9):
                    reasons.append(f"{a['alt_id']}.{k}={a[k]:.3g} εκτός εύρους της κατηγορίας στο πείραμα [{lo}, {hi}]")
        return reasons

    def stamp(self):
        m = self.engine.art["dataset"]["manifest"]
        return {"status": TRANSFER_STATUS, "model_id": self.engine.art["model_id"], "source_population": m["country"], "source_years": m["years"],
                "source_dataset": m["title"], "licence": m["licence"], "assumption_id": self.assumption.id, "assumption": self.assumption.label,
                "conversion": self.conv, "external_validation_for_target": False}

    def run_panel(self, panel, context, scenarios_eur: dict, task_key: str, seed=20261030, uncertainty_draws=0):
        """Επιστρέφει {σενάριο: αποτέλεσμα}· μόνο σενάρια που περνούν την πύλη έχουν απαντήσεις."""
        res = {}
        for name, alts_eur in scenarios_eur.items():
            alts = self.to_model_units(alts_eur)
            a = self.engine.assess(context, alts, "GR")
            extra = self._extra_gate(context, alts)
            base = {"scenario": name, "task_key": task_key, "model_units": alts, **self.stamp()}
            if a.status == "NOT_SUPPORTED":
                res[name] = {**base, "status": "NOT_SUPPORTED", "reasons": a.reasons}
            elif a.status == "EXTRAPOLATION" or extra:
                res[name] = {**base, "status": "EXTRAPOLATION_REJECTED", "reasons": a.reasons + extra}
            else:
                sim = self.engine.simulate_panel(panel, context, {name: alts}, task_key, seed=seed, uncertainty_draws=uncertainty_draws)
                res[name] = {**base, **sim["scenarios"][name], "status": TRANSFER_STATUS, "engine_transfer_flag": a.transfer}
        assert file_sha256(self.path) == self.sha_before, "Το artifact άλλαξε κατά την εκτέλεση"
        return res
