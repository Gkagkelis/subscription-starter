"""Υβριδικός ενορχηστρωτής (ερωτώμενος × ερώτηση × επιλογή). Εφαρμόζει το σχέδιο τεκμηρίωσης κατά την εκτέλεση:
  * A_EMPIRICAL: απάντηση από το Lab (PIE) για ΤΟ ΙΔΙΟ πρόσωπο (κοινή κατάσταση/άγκυρες)·
  * C_EVIDENCE_INFORMED: στο prompt προστίθεται η εμπειρική τιμή της ομάδας του προσώπου (proxy), ρητά «όχι ίδια μέτρηση»·
  * C_EVIDENCE_CONSTRAINED: μετά την κρίση του AI εφαρμόζεται εμπειρικό κάτω όριο ανά πρόσωπο (ελάχιστη αλλαγή, καταγραφή πριν/μετά)·
  * D_AI: AI από προφίλ/ιστορικό/σενάριο.
Δεν υπάρχει σταθερή στάθμιση AI–δεδομένων: τα δεδομένα μπαίνουν ως περιορισμός (όριο) ή ως πλαίσιο, ποτέ ως αυθαίρετος μέσος όρος."""
from __future__ import annotations

import json

import numpy as np

from ..evidence import plan as EP
from ..questionnaire import model as QM


class Orchestrator:
    def __init__(self, study, plan: dict):
        self.s, self.plan = study, plan
        self.lab_answers: dict = {}
        self.lab_errors: list = []

    def entry(self, qid):
        return self.plan["questions"].get(qid) or {}

    def mode(self, q) -> str:
        return self.entry(q.id).get("mode", "D_AI")

    def components(self, q, kind=None):
        comps = [c for c in self.entry(q.id).get("components", []) if c["usable"]]
        if kind == "bound":
            return [c for c in comps if c["spec"]["relation"] in ("lower_bound", "lower_bound_union") and c["class"] == "DIRECT_EMPIRICAL"]
        if kind == "context":
            return [c for c in comps if c["spec"]["relation"] == "proxy"]
        return comps

    # -------------------------------------------------------- A: Lab ανά πρόσωπο
    def prepare_lab(self, profiles: list[dict]):
        qs = [q for q in self.s.qn.questions if self.mode(q) == "A_EMPIRICAL"]
        if not qs or not profiles:
            return
        from ..lab.bridge import LabBridgeError, LabUnavailable, call, respondent_payload, to_lab_question
        lab = self.s.lab_cfg()
        resp = []
        for p in profiles:
            r = respondent_payload(p, 0)
            r["seed"] = int(abs(hash(p["respondent_id"] + str(p.get("frame_record")))) % (2 ** 31))
            r["anchors"] = {k[4:]: (None if v is None or (isinstance(v, float) and v != v) else v) for k, v in p.items() if k.startswith("lab_") and k[4:] in
                            ("emp", "inc6", "econ4", "class3", "lr7", "lr_none", "pv", "believer", "polint4")}
            resp.append(r)
        try:
            res = call("answer", {"model": lab["model"], "ref": lab["ref"], "questions": [to_lab_question(q) for q in qs], "respondents": resp,
                                  "seed": int(self.s.cfg["panel"]["random_seed"])})
        except (LabUnavailable, LabBridgeError) as e:
            self.lab_errors.append(f"{type(e).__name__}: {e}")
            return
        qby = {q.id: q for q in qs}
        for rid, ans in res["answers"].items():
            for qid, a in ans.items():
                q = qby[qid]
                self.lab_answers.setdefault(rid, {})[qid] = {"code": self._lab_code(q, a), "raw": a, "model": res["model"]}

    @staticmethod
    def _lab_code(q, a):
        v = a.get("value") or {}
        if a.get("skipped") or not v:
            return None
        lab_by_label = {o.label: o.code for o in q.options}
        if "scaleIndex" in v:
            i = int(v["scaleIndex"])
            return q.options[i].code if 0 <= i < len(q.options) else None
        if "choice" in v:
            return lab_by_label.get(v["choice"])
        if "choices" in v:
            return [lab_by_label.get(c) for c in v["choices"] if c in lab_by_label]
        return None

    # -------------------------------------------------------- C: πλαίσιο ομάδας
    def context(self, q, prof) -> str:
        lines = []
        for c in self.components(q, "context"):
            t = c["spec"]["target"]
            tgt = "όλη την ερώτηση" if t.get("question") else f"τις επιλογές {', '.join(t.get('options') or [t.get('option')])}"
            lines.append(f"- [{c['spec']['source']['dataset']}] Σχετικό εμπειρικό στοιχείο για {tgt} (ΣΥΓΓΕΝΗΣ μέτρηση, όχι η ίδια ερώτηση· "
                         f"μην το μετατρέπεις σε πιθανότητα): {EP.group_context(c, prof)}")
        return "\n".join(lines)

    # -------------------------------------------------------- C: εμπειρικά όρια
    def apply_bounds(self, q, parsed: dict, codes: list, prof: dict, answers: dict) -> tuple[dict, list]:
        recs = []
        for c in self.components(q, "bound"):
            spec = c["spec"]
            t = spec["target"]
            if t.get("given") and not QM.evaluate_condition(t["given"], answers, prof):
                recs.append({"source": spec["source"]["indicator"], "relation": spec["relation"], "applied": False, "reason": "συνθήκη στόχου δεν ισχύει"})
                continue
            b = EP.person_bound(c, prof)
            if b is None:
                recs.append({"source": spec["source"]["indicator"], "relation": spec["relation"], "applied": False, "reason": "μη στηριζόμενη ομάδα/μοντέλο"})
                continue
            if spec["relation"] == "lower_bound" and "probabilities" in parsed:
                o = t["option"]
                p = {k: max(0.0, float(parsed["probabilities"].get(k, 0))) for k in codes}
                s = sum(p.values()) or 1.0
                p = {k: v / s for k, v in p.items()}
                before = p.get(o, 0.0)
                if before < b:
                    rest = 1 - before
                    p = {k: (b if k == o else (v * (1 - b) / rest if rest > 0 else (1 - b) / (len(p) - 1))) for k, v in p.items()}
                parsed = {**parsed, "probabilities": p}
                recs.append({"source": spec["source"]["indicator"], "relation": "lower_bound", "option": o, "bound": round(b, 4), "before": round(before, 4),
                             "after": round(p[o], 4), "binding": before < b, "applied": True})
            elif spec["relation"] == "lower_bound_union" and "inclusion_probabilities" in parsed:
                opts = [o for o in t["options"] if o in codes]
                ip = {k: min(1.0, max(0.0, float(v))) for k, v in parsed["inclusion_probabilities"].items()}
                u = lambda k: 1 - np.prod([1 - min(1.0, ip.get(o, 0) * k) for o in opts])   # noqa: E731
                before = float(u(1.0))
                if before < b:
                    if max(ip.get(o, 0) for o in opts) <= 0:
                        for o in opts:
                            ip[o] = 1 - (1 - b) ** (1 / len(opts))
                    else:
                        lo, hi = 1.0, 1e6
                        for _ in range(80):
                            mid = (lo + hi) / 2
                            lo, hi = (mid, hi) if u(mid) < b else (lo, mid)
                        for o in opts:
                            ip[o] = min(1.0, ip.get(o, 0) * hi)
                parsed = {**parsed, "inclusion_probabilities": ip}
                recs.append({"source": spec["source"]["indicator"], "relation": "lower_bound_union", "options": opts, "bound": round(b, 4), "before": round(before, 4),
                             "after": round(float(1 - np.prod([1 - ip.get(o, 0) for o in opts])), 4), "binding": before < b, "applied": True,
                             "assumption": "ανεξάρτητες επιλογές στην ένωση (Bernoulli)"})
        return parsed, recs

    def components_record(self, q, prof) -> list:
        return [{"source": f"{c['spec']['source']['dataset']}:{c['spec']['source']['indicator']}", "relation": c["spec"]["relation"], "class": c["class"],
                 "target": c["spec"]["target"]} for c in self.components(q)]


def dumps(x) -> str:
    return json.dumps(x, ensure_ascii=False, default=str)
