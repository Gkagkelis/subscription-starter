"""CCE 0.1 — API πρόβλεψης (inference) πάνω σε ΕΚΠΑΙΔΕΥΜΕΝΟ artifact.

Κανόνες:
  * Χωρίς artifact εκπαιδευμένο σε πραγματικές επιλογές, η μηχανή δεν παράγει πιθανότητες (status NOT_TRAINED).
  * Πύλη εφαρμοσιμότητας: η πρόβλεψη επιτρέπεται μόνο για την κατηγορία προϊόντος, τις εναλλακτικές, τα χαρακτηριστικά και τα
    εύρη τιμών που κάλυπτε η εκπαίδευση. Εκτός εύρους → EXTRAPOLATION (άρνηση, εκτός αν ζητηθεί ρητά)· άγνωστη κατηγορία ή
    χαρακτηριστικό → NOT_SUPPORTED.
  * Πληθυσμός: κάθε artifact δηλώνει τον πληθυσμό εκπαίδευσης και αν έχει ελληνική εξωτερική επικύρωση. Η χρήση σε άλλο
    πληθυσμό επιστρέφει πάντα τη σήμανση transfer (π.χ. SOURCE_POPULATION_ONLY).
  * Συνθετικό πάνελ: κάθε καταναλωτής έχει σταθερούς ατομικούς συντελεστές (mixed logit) και σταθερά τυχαία σφάλματα Gumbel
    ανά (καταναλωτής, task, εναλλακτική), από σπόρο που εξαρτάται ΜΟΝΟ από το ID του και το task — κοινοί τυχαίοι αριθμοί
    μεταξύ σεναρίων· έτσι η αλλαγή μόνο της τιμής δεν δημιουργεί αντιφατικές ατομικές απαντήσεις.
  * Αβεβαιότητα: Krinsky–Robb (κληρώσεις παραμέτρων από την εκτιμημένη ασυμπτωτική κατανομή).
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .models import halton_normals

STATUS_OK = "SUPPORTED"


@dataclass
class Assessment:
    status: str
    reasons: list
    transfer: str


class ChoiceEngine:
    def __init__(self, artifact: dict | None):
        self.art = artifact

    @classmethod
    def load(cls, path):
        p = Path(path)
        if not p.exists():
            return cls(None)
        return cls(json.loads(p.read_text(encoding="utf-8")))

    # ------------------------------------------------------------------ πύλη
    def assess(self, context: dict, alternatives: list[dict], target_population: str = "GR") -> Assessment:
        if not self.art:
            return Assessment("NOT_TRAINED", ["Δεν υπάρχει artifact εκπαιδευμένο σε πραγματικές επιλογές."], "NONE")
        dom = self.art["domain"]
        reasons = []
        if context.get("category") not in dom["categories"]:
            reasons.append(f"Κατηγορία «{context.get('category')}» εκτός πεδίου ({', '.join(dom['categories'])}).")
            return Assessment("NOT_SUPPORTED", reasons, self._transfer(target_population))
        for a in alternatives:
            if a.get("alt_id") not in dom["alternatives"]:
                reasons.append(f"Εναλλακτική «{a.get('alt_id')}» άγνωστη στο μοντέλο.")
            for k, v in a.items():
                if k == "alt_id":
                    continue
                if k not in dom["attributes"]:
                    reasons.append(f"Χαρακτηριστικό «{k}» δεν εκτιμήθηκε από δεδομένα.")
                    continue
                lo, hi = dom["attributes"][k]["range"]
                if not (lo <= float(v) <= hi):
                    reasons.append(f"{k}={v} εκτός εύρους εκπαίδευσης [{lo}, {hi}].")
        if any("άγνωστη" in r or "δεν εκτιμήθηκε" in r for r in reasons):
            return Assessment("NOT_SUPPORTED", reasons, self._transfer(target_population))
        if reasons:
            return Assessment("EXTRAPOLATION", reasons, self._transfer(target_population))
        return Assessment(STATUS_OK, [], self._transfer(target_population))

    def _transfer(self, target):
        pops = self.art["domain"]["populations"]
        if target in pops:
            return "IN_POPULATION" if self.art.get("validation", {}).get("external", {}).get(target) else "IN_POPULATION_NOT_EXTERNALLY_VALIDATED"
        return "SOURCE_POPULATION_ONLY"

    # ------------------------------------------------------------------ σχεδιασμός
    def _x(self, alts: list[dict], profile: dict, context: dict | None = None):
        """Μεταβλητές αλληλεπίδρασης: πρώτα από το προφίλ, μετά από το πλαίσιο (π.χ. product/brand του σεναρίου)."""
        profile = {**(context or {}), **profile}
        feats = self.art["model"]["features"]
        terms = {t["name"]: t for t in self.art["terms"]}
        X = np.zeros((len(alts), len(feats)))
        for j, a in enumerate(alts):
            for f, name in enumerate(feats):
                t = terms[name]
                k = t["kind"]
                if k == "attr":
                    X[j, f] = float(a.get(t["col"], 0.0))
                elif k == "asc":
                    X[j, f] = 1.0 if a["alt_id"] == t["alt"] else 0.0
                elif k in ("attr_x_cov", "asc_x_cov"):
                    if t["cov"] not in profile:
                        raise KeyError(f"Το προφίλ δεν έχει τη μεταβλητή {t['cov']}, που απαιτεί το μοντέλο.")
                    cv = float(profile[t["cov"]] == t["cov_value"]) if "cov_value" in t else float(profile[t["cov"]])
                    base = float(a.get(t["col"], 0.0)) if k == "attr_x_cov" else (1.0 if a["alt_id"] == t["alt"] else 0.0)
                    X[j, f] = base * cv
        return X

    def _coef_draw(self, theta, z):
        m = self.art["model"]
        if m["kind"] == "conditional_logit":
            return np.asarray(theta)
        feats = m["features"]
        rand = m["random"]
        fix = [i for i, f in enumerate(feats) if f not in rand]
        b = np.zeros(len(feats))
        b[fix] = theta[: len(fix)]
        for k, f in enumerate(rand):
            i = feats.index(f)
            mu, sd = theta[len(fix) + 2 * k], np.exp(theta[len(fix) + 2 * k + 1])
            b[i] = mu + sd * z[k] if rand[f] == "normal" else -np.exp(mu + sd * z[k])
        return b

    def _theta(self):
        m = self.art["model"]
        return np.asarray(m["coef"] if m["kind"] == "conditional_logit" else m["theta"])

    def _cov(self):
        m = self.art["model"]
        return np.asarray(m["cov_robust"] if m["kind"] == "conditional_logit" else m["cov"])

    # ------------------------------------------------------------------ πρόβλεψη πληθυσμού
    def predict_proba(self, profile: dict, context: dict, alternatives: list[dict], allow_extrapolation=False, draws=500):
        a = self.assess(context, alternatives, profile.get("population", "GR"))
        if a.status not in (STATUS_OK,) and not (a.status == "EXTRAPOLATION" and allow_extrapolation):
            return {"status": a.status, "reasons": a.reasons, "transfer": a.transfer, "probabilities": None}
        X = self._x(alternatives, profile, context)
        th = self._theta()
        m = self.art["model"]
        if m["kind"] == "conditional_logit":
            v = X @ th
            p = np.exp(v - v.max())
            p /= p.sum()
        else:
            Z = halton_normals(draws, len(m["random"]), 7)
            p = np.zeros(len(alternatives))
            for z in Z:
                v = X @ self._coef_draw(th, z)
                e = np.exp(v - v.max())
                p += e / e.sum()
            p /= draws
        return {"status": a.status, "reasons": a.reasons, "transfer": a.transfer, "probabilities": dict(zip([x["alt_id"] for x in alternatives], p.tolist()))}

    # ------------------------------------------------------------------ συνθετικό πάνελ
    @staticmethod
    def _seed(*parts):
        return int(hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:16], 16)

    def _person_z(self, seed, respondent_id, K):
        """Σταθερές τυπικές κανονικές κληρώσεις του ατόμου (καθορίζουν τους ατομικούς συντελεστές του σε ΚΑΘΕ σενάριο)."""
        return np.random.default_rng(self._seed(seed, "beta", respondent_id)).standard_normal(K) if K else np.zeros(0)

    def simulate_panel(self, panel: list[dict], context: dict, scenarios: dict, task_key: str, seed=20261030, uncertainty_draws=0, allow_extrapolation=False):
        """panel: [{'respondent_id', ...covariates}]· scenarios: {όνομα: [alternatives]}· task_key: σταθερό κλειδί του task.
        Επιστρέφει ατομικές πιθανότητες/επιλογές και συγκεντρωτικά μερίδια ανά σενάριο (ή status άρνησης)."""
        res = {"scenarios": {}, "status": STATUS_OK}
        for name, alts in scenarios.items():
            a = self.assess(context, alts, "GR")
            if a.status != STATUS_OK and not (a.status == "EXTRAPOLATION" and allow_extrapolation):
                res["scenarios"][name] = {"status": a.status, "reasons": a.reasons, "transfer": a.transfer}
                res["status"] = a.status
        if res["status"] != STATUS_OK and not allow_extrapolation:
            return res
        m = self.art["model"]
        th = self._theta()
        K = len(m.get("random", {}))
        for name, alts in scenarios.items():
            ids = [x["alt_id"] for x in alts]
            rows = []
            for c in panel:
                X = self._x(alts, c, context)
                z = self._person_z(seed, c["respondent_id"], K)
                b = self._coef_draw(th, z) if m["kind"] != "conditional_logit" else th
                v = X @ b
                e = np.exp(v - v.max())
                p = e / e.sum()
                g = np.random.default_rng(self._seed(seed, "gumbel", c["respondent_id"], task_key)).gumbel(size=len(alts) + 8)
                # ίδιο σφάλμα για την ίδια ετικέτα εναλλακτικής σε κάθε σενάριο (κοινοί τυχαίοι αριθμοί)
                eps = np.array([g[sorted(set(ids)).index(i) % len(g)] for i in ids])
                choice = ids[int(np.argmax(v + eps))]
                rows.append({"respondent_id": c["respondent_id"], "p": dict(zip(ids, p.tolist())), "choice": choice})
            shares_p = {i: float(np.mean([r["p"][i] for r in rows])) for i in ids}
            shares_c = {i: float(np.mean([r["choice"] == i for r in rows])) for i in ids}
            out = {"status": STATUS_OK if res["status"] == STATUS_OK else res["status"], "expected_shares": shares_p, "simulated_choice_shares": shares_c, "individual": rows}
            if uncertainty_draws:
                rng = np.random.default_rng(seed)
                # εκφυλισμένες παράμετροι (π.χ. τυπική απόκλιση τυχαίου συντελεστή → 0 με SE ~10^4) κρατιούνται στην εκτίμηση·
                # αλλιώς οι κληρώσεις τους δίνουν υπερχείλιση και άκυρα διαστήματα
                cov = self._cov().copy()
                sd = np.sqrt(np.clip(np.diag(cov), 0, None))
                bad = ~np.isfinite(sd) | (sd > 100)
                cov[bad, :] = 0.0
                cov[:, bad] = 0.0
                out["uncertainty_fixed_params"] = int(bad.sum())
                TH = rng.multivariate_normal(th, cov, size=uncertainty_draws, check_valid="ignore")
                sims = []
                for t in TH:
                    acc = np.zeros(len(ids))
                    for c in panel:
                        X = self._x(alts, c, context)
                        z = self._person_z(seed, c["respondent_id"], K)
                        v = X @ (self._coef_draw(t, z) if m["kind"] != "conditional_logit" else t)
                        e = np.exp(v - v.max())
                        acc += e / e.sum()
                    sims.append(acc / len(panel))
                sims = np.array(sims)
                out["expected_shares_ci95"] = {i: [float(np.percentile(sims[:, k], 2.5)), float(np.percentile(sims[:, k], 97.5))] for k, i in enumerate(ids)}
            res["scenarios"][name] = out
        return res
