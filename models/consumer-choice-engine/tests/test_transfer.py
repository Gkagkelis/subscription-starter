"""Έλεγχοι του experimental_transfer_mode (κώδικας, όχι επικύρωση): ρητή ενεργοποίηση, αμετάβλητο artifact,
διατήρηση της πύλης μετά τη μετατροπή νομίσματος, σφράγιση αποτελεσμάτων."""
import json
import tempfile
from pathlib import Path

from cce.transfer import TRANSFER_STATUS, ExperimentalTransfer, TransferAssumption, file_sha256

from test_engine import _artifact

MACRO = {"reference_year_greek_prices": "2025", "series": {
    "HICP_EL_CP00": {"2022": 100.0, "2025": 125.0},
    "PA.NUS.PRVT.PP": {"XXX": {"2022": 1.2}, "GRC": {"2022": 0.6}},
    "NY.GDP.PCAP.PP.CD": {"XXX": {"2022": 90000.0}, "GRC": {"2022": 40000.0}},
    "PA.NUS.FCRF": {"XXX": {"2022": 0.95}, "GRC": {"2022": 0.95}}}}


def _setup(tmp):
    import cce.transfer as T
    T.ISO3["XX"] = "XXX"
    art = _artifact()
    art["model_id"] = "transfer-test"
    art["dataset"] = {"manifest": {"country": "XX", "years": "2022", "title": "test", "licence": "n/a"}}
    p = Path(tmp) / "a.json"
    p.write_text(json.dumps(art), encoding="utf-8")
    return p


def test_requires_explicit_activation():
    with tempfile.TemporaryDirectory() as tmp:
        p = _setup(tmp)
        a = TransferAssumption(MACRO, "T0", "test", "ppp_income", 0.5)
        try:
            ExperimentalTransfer(p, a, "XX", "2022", {"price_eur": ("price", 1)})
            raise AssertionError("έπρεπε να αρνηθεί")
        except PermissionError:
            pass


def test_conversion_gate_and_stamp():
    with tempfile.TemporaryDirectory() as tmp:
        p = _setup(tmp)
        sha = file_sha256(p)
        a = TransferAssumption(MACRO, "T0", "test", "ppp_income", 0.5)
        tr = ExperimentalTransfer(p, a, "XX", "2022", {"price_eur": ("price", 1)}, experimental_transfer_mode=True)
        f = tr.conv["factor"]
        assert abs(f - 0.8 * 2.0 * 1.5) < 1e-12          # αποπληθωρισμός 100/125 × PPP 2 × (2,25)^0,5
        panel = [{"respondent_id": f"C{i:03d}"} for i in range(50)]
        ok = [{"alt_id": "A", "price_eur": 0.5, "warranty": 2}, {"alt_id": "B", "price_eur": 0.5, "warranty": 1}, {"alt_id": "none", "price_eur": 0.0, "warranty": 0}]
        out = [dict(x) for x in ok]
        out[0]["price_eur"] = 2.0                           # 2 € × 2,4 = 4,8 > 2 (εύρος εκπαίδευσης)
        r = tr.run_panel(panel, {"category": "test_category"}, {"ok": ok, "out": out}, "t1")
        assert r["ok"]["status"] == TRANSFER_STATUS and len(r["ok"]["individual"]) == 50
        assert abs(r["ok"]["model_units"][0]["price"] - 0.5 * f) < 1e-12
        assert r["ok"]["external_validation_for_target"] is False and r["ok"]["source_population"] == "XX"
        assert r["out"]["status"] == "EXTRAPOLATION_REJECTED" and "individual" not in r["out"]
        r2 = tr.run_panel(panel, {"category": "washing_machine_repair"}, {"x": ok}, "t2")
        assert r2["x"]["status"] == "NOT_SUPPORTED" and "individual" not in r2["x"]
        assert file_sha256(p) == sha
        n = TransferAssumption(MACRO, "T3", "nominal", "nominal")
        assert abs(n.factor("XX", "2022")["factor"] - 0.8) < 1e-12
