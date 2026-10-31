"""Εκτέλεση μελέτης (ASE): δρομολόγηση ανά ερώτηση, κλήρωση απαντήσεων, checkpoint/resume, ταυτόχρονη εκτέλεση.

Τρόποι απάντησης (engine_mode):
  PROFILE      δημογραφικό χαρακτηριστικό από το συνθετικό προφίλ (profile_field + profile_map)
  A_EMPIRICAL  εμπειρικό μοντέλο εντός πεδίου και ίδιας χώρας (ή ρητά επιτρεπόμενο)
  B_LLM        evidence-grounded προσομοίωση: το LLM δίνει κατανομή, το σύστημα κληρώνει με seed
  C_HYBRID     γραμμική σύνθεση (linear opinion pool) εμπειρικής κατανομής και ανεξάρτητης LLM κατανομής, βάρος w από config
Κάθε απάντηση φέρει answer_nature: PROFILE_ATTRIBUTE / EMPIRICAL_MODEL_PREDICTION / SIMULATED_RESPONSE /
SYNTHETIC_SCENARIO_ATTRIBUTE (ερωτήσεις εμπειρίας — ποτέ «πραγματικό ιστορικό»).
"""
from __future__ import annotations

import json
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np

from .. import ASE_VERSION
from ..evidence.context import context_text
from ..llm.runtime import Ledger, Pricing, RateLimiter, call_with_retry
from ..llm.session_provider import PendingAnswer
from ..questionnaire import model as QM
from ..util import derive_seed, now_iso
from . import prompts as P
from .empirical import make_adapter

NATURE = {"PROFILE": "PROFILE_ATTRIBUTE", "A_EMPIRICAL": "EMPIRICAL_MODEL_PREDICTION"}


class RunInterrupted(Exception):
    pass


def _norm(d: dict, codes: list) -> np.ndarray:
    v = np.array([max(0.0, float(d.get(c, 0.0))) for c in codes])
    return v / v.sum() if v.sum() > 0 else np.ones(len(codes)) / len(codes)


def sample_answer(q, parsed: dict, codes: list, rng: np.random.Generator):
    """Κλήρωση απάντησης από την κατανομή (αναπαραγώγιμη)· επιστρέφει (απάντηση, κατανομή για audit)."""
    if q.type in ("single_choice", "likert", "scenario", "dce"):
        p = _norm(parsed["probabilities"], codes)
        return codes[int(rng.choice(len(codes), p=p))], dict(zip(codes, p.round(4).tolist()))
    if q.type == "multiple_choice":
        pr = {c: min(1.0, max(0.0, float(parsed["inclusion_probabilities"].get(c, 0)))) for c in codes}
        pick = [c for c in codes if rng.random() < pr[c]]
        excl = {o.code for o in q.options if o.exclusive}
        if len(pick) > 1 and excl & set(pick):
            best = max(pick, key=lambda c: pr[c])
            pick = [best] if best in excl else [c for c in pick if c not in excl]
        mx = q.max_choices or len(codes)
        if len(pick) > mx:
            pick = sorted(pick, key=lambda c: -pr[c])[:mx]
        if len(pick) < q.min_choices:
            rest = [c for c in sorted(codes, key=lambda c: -pr[c]) if c not in pick and c not in excl]
            pick += rest[: q.min_choices - len(pick)]
        return [c for c in codes if c in pick], {c: round(v, 4) for c, v in pr.items()}
    if q.type == "ranking":
        s = np.array([max(1e-6, float(parsed["importance_scores"].get(c, 0))) for c in codes])
        g = np.log(s) + rng.gumbel(size=len(codes))          # Plackett–Luce με Gumbel-max
        order = [codes[i] for i in np.argsort(-g)]
        k = int(q.raw.get("rank_k", len(codes)))
        return order[:k], dict(zip(codes, (s / s.sum()).round(4).tolist()))
    if q.type == "numeric":
        lo_b, hi_b = float(q.numeric["min"]), float(q.numeric["max"])
        lo, mode, hi = sorted([float(parsed["low"]), float(parsed["typical"]), float(parsed["high"])])
        lo, hi = max(lo_b, lo), min(hi_b, hi)
        mode = min(max(mode, lo), hi)
        v = float(rng.triangular(lo, mode, hi)) if hi > lo else lo
        if q.numeric.get("integer"):
            v = float(round(v))
        return min(max(v, lo_b), hi_b), {"low": lo, "typical": mode, "high": hi}
    return str(parsed.get("text", "")).strip(), None


def profile_answer(q, prof: dict):
    v = str(prof.get(q.profile_field))
    if q.type == "numeric":
        return float(v)
    if q.profile_map:
        return q.profile_map.get(v)
    return v if v in q.codes else None


def semantic_check_factory(qs, codes_by_q):
    def chk(parsed):
        for q in qs:
            d = parsed.get(q.id) or {}
            if q.type in ("single_choice", "likert", "scenario", "dce", "multiple_choice", "ranking"):
                key = {"multiple_choice": "inclusion_probabilities", "ranking": "importance_scores"}.get(q.type, "probabilities")
                vals = [float(v) for v in (d.get(key) or {}).values()]
                if not vals or any(v < 0 for v in vals) or sum(vals) <= 0:
                    return f"{q.id}: μη έγκυρη κατανομή"
            if q.type == "numeric" and not (float(d["low"]) <= float(d["typical"]) <= float(d["high"])):
                return f"{q.id}: low ≤ typical ≤ high"
            if q.type == "open" and not str(d.get("text", "")).strip():
                return f"{q.id}: κενό κείμενο"
        return None
    return chk


class StudyRun:
    def __init__(self, study, provider, *, run_id: str, dry_run: bool, budget_usd=None, max_workers=4, requests_per_minute=50,
                 batching="per_question", max_attempts=5, sleep=None, question_ids=None):
        self.s, self.provider, self.run_id, self.dry_run = study, provider, run_id, dry_run
        self.cfg = study.cfg
        self.seed = int(self.cfg["panel"].get("random_seed", 20261031))
        self.batching = batching
        self.max_workers = max_workers
        self.max_attempts = max_attempts
        self.limiter = RateLimiter(requests_per_minute)
        self.ledger = Ledger(Pricing(), provider.name, provider.model, budget_usd)
        self.sleep = sleep
        self.qids = set(question_ids) if question_ids else None
        self.adapters = {q.id: make_adapter(q.empirical_model, self.cfg.get("country", "GR")) for q in study.qn.questions if q.empirical_model}
        self.lock = threading.Lock()
        self.calibration = None
        if self.cfg.get("calibration_version"):
            from ..util import read_json
            self.calibration = read_json(study.internal / "calibrations" / f"{self.cfg['calibration_version']}.json")["questions"]
        brief = self.cfg.get("study", {})
        self.brief = f"{brief.get('title', '')} — {brief.get('topic', '')}. Πληθυσμός: {self.cfg['panel'].get('population')} ({self.cfg.get('country', 'GR')})."
        for txt in (brief.get("instructions_to_model") or "", self.brief):
            v = P.guard(txt)
            if v:
                raise ValueError(f"Οι οδηγίες προς το μοντέλο περιέχουν απόπειρα ορισμού αποτελεσμάτων ({v}). Δεν επιτρέπεται.")

    # ------------------------------------------------------------ ανά ερώτηση
    def _codes(self, q, task):
        return [a["id"] for a in task["alternatives"]] if task else q.codes

    def _route(self, q):
        if q.intent == "demographic" and q.profile_field:
            return "PROFILE"
        ad = self.adapters.get(q.id)
        if ad:
            if not ad.cross_country or self.cfg.get("allow_cross_country_mode_a"):
                return "A_EMPIRICAL"
            return "C_HYBRID"
        return "B_LLM"

    def respondent(self, prof: dict) -> dict:
        rid = prof["respondent_id"]
        answers, history, rows = {}, [], []
        status = "COMPLETE"
        order = QM.question_order(self.s.qn, self.seed, self.s.study_id, rid)
        if self.qids:
            order = [q for q in order if q.id in self.qids]
        units = [[q] for q in order] if self.batching == "per_question" else [[q for q in order if q.block == b["id"]] for b in self.s.qn.blocks]
        for unit in units:
            unit = [q for q in unit]
            if not unit:
                continue
            prep = {}
            for q in unit:
                task = QM.dce_task(q, self.seed, self.s.study_id, rid) if q.type == "dce" else None
                opts = QM.presented_options(q, self.seed, self.s.study_id, rid)
                prep[q.id] = {"task": task, "opts": opts, "codes": [a["id"] for a in task["alternatives"]] if task else [o.code for o in opts], "mode": self._route(q)}
            # προ-αξιολόγηση συνθηκών που δεν εξαρτώνται από ερωτήσεις της ίδιας μονάδας
            unit_ids = {q.id for q in unit}
            ask_llm = []
            for q in unit:
                if q.condition and not (QM.condition_refs(q.condition) & unit_ids) and not QM.evaluate_condition(q.condition, answers, prof):
                    continue
                if prep[q.id]["mode"] in ("B_LLM", "C_HYBRID"):
                    ask_llm.append(q)
            parsed, call_meta = {}, {}
            if ask_llm:
                ctx_lines, ev_ids = [], []
                blocks = []
                for q in ask_llm:
                    t, ids = context_text(self.s.registry, q.id)
                    ctx_lines.append(f"[{q.id}]\n{t}")
                    ev_ids += ids
                    o = prep[q.id]["opts"]
                    nr = (q.numeric["min"], q.numeric["max"]) if q.type == "numeric" else None
                    blocks.append(P.question_block(q, [(x.code, x.label) for x in o] if q.type != "dce" else None, prep[q.id]["task"], nr))
                schema = {"type": "object", "properties": {q.id: QM.response_schema(q, prep[q.id]["codes"]) for q in ask_llm},
                          "required": [q.id for q in ask_llm], "additionalProperties": False}
                user = P.user_prompt(prof, history, "\n".join(ctx_lines), blocks, self.brief)
                kw = {"sleep": self.sleep} if self.sleep else {}
                res, attempts = call_with_retry(self.provider, P.SYSTEM, user, schema, max_tokens=int(self.cfg.get("llm", {}).get("max_tokens", 1500)),
                                                max_attempts=self.max_attempts, limiter=self.limiter, ledger=self.ledger,
                                                semantic_check=semantic_check_factory(ask_llm, {q.id: prep[q.id]["codes"] for q in ask_llm}), **kw)
                call_meta = {"attempts": attempts, "evidence_refs": sorted(set(ev_ids)), "request_id": res.request_id if res else None,
                             "model_version": res.model_version if res else None, "input_tokens": res.input_tokens if res else 0,
                             "output_tokens": res.output_tokens if res else 0, "prompt_chars": len(P.SYSTEM) + len(user)}
                parsed = res.parsed if res else {}
            for q in unit:
                pr = prep[q.id]
                base = {"study_id": self.s.study_id, "run_id": self.run_id, "respondent_id": rid, "question_id": q.id, "block": q.block, "question_type": q.type,
                        "intent": q.intent, "timestamp": now_iso(), "seed": derive_seed(self.seed, self.s.study_id, rid, q.id, "answer") % (2**63),
                        "prompt_version": P.PROMPT_VERSION, "ase_version": ASE_VERSION, "presented_order": json.dumps(pr["codes"], ensure_ascii=False),
                        "dce_task": json.dumps(pr["task"], ensure_ascii=False) if pr["task"] else ""}
                if q.condition and not QM.evaluate_condition(q.condition, answers, prof):
                    rows.append({**base, "status": "SKIPPED", "engine_mode": "SKIP_LOGIC", "response": "", "answer_nature": "", "validation_ok": True,
                                 "validation_errors": "", "provider": "", "model": "", "model_version": "", "evidence_refs": "", "source_country": "",
                                 "assumptions": "", "distribution": "", "rationale": "", "empirical_support": "", "attempts": "", "error": "",
                                 "input_tokens": 0, "output_tokens": 0, "request_id": ""})
                    answers[q.id] = None
                    continue
                rng = np.random.default_rng(base["seed"])
                mode = pr["mode"]
                err, dist, rationale, ans = "", None, "", None
                prov, model, mver = "", "", ""
                src_country, assumptions, support = self.cfg.get("country", "GR"), [], "NONE"
                if mode == "PROFILE":
                    ans = profile_answer(q, prof)
                    src_country, support = "GR (πλαίσιο πληθυσμού)", "PROFILE"
                    assumptions = ["Δημογραφικό από το συνθετικό προφίλ (GLOPOP-S + Eurostat/ΕΛΣΤΑΤ 2025)"]
                else:
                    emp, emp_status = None, ""
                    ad = self.adapters.get(q.id)
                    if ad:
                        emp, emp_status, reasons = ad.probabilities(prof, pr["codes"])
                        src_country = ad.source_country
                        if emp is None:
                            mode = "B_LLM"
                            assumptions.append(f"Εμπειρικό μοντέλο εκτός πεδίου ({emp_status}): {'; '.join(reasons)[:200]}")
                    llm = parsed.get(q.id)
                    if mode == "A_EMPIRICAL":
                        ans, dist = sample_answer(q, {"probabilities": emp}, pr["codes"], rng)
                        prov, model, support = "cce", ad.spec["artifact"], "EMPIRICAL"
                        assumptions.append(f"Εμπειρικό μοντέλο {ad.spec['artifact']} ({ad.source_country})")
                    elif llm is None:
                        err = "Αποτυχία LLM μετά από επαναλήψεις" if ask_llm else "Δεν ζητήθηκε απάντηση"
                    elif mode == "C_HYBRID" and emp is not None and q.type in ("single_choice", "likert", "scenario", "dce"):
                        w = float(self.cfg.get("hybrid_weight", 0.5))
                        pl = _norm(llm["probabilities"], pr["codes"])
                        pe = np.array([emp[c] for c in pr["codes"]])
                        mix = w * pe + (1 - w) * pl
                        ans, dist = sample_answer(q, {"probabilities": dict(zip(pr["codes"], mix))}, pr["codes"], rng)
                        rationale = llm.get("rationale", "")
                        prov, model, mver = self.provider.name, self.provider.model, call_meta.get("model_version") or ""
                        support = "PARTIAL_EMPIRICAL"
                        assumptions.append(f"Linear opinion pool: w={w} × εμπειρικό ({ad.spec['artifact']}, {ad.source_country}, EXPERIMENTAL_CROSS_COUNTRY_TRANSFER) + {1 - w} × LLM")
                    else:
                        mode = "B_LLM"
                        fac = (self.calibration.get(q.id) or {}).get("factors") if self.calibration else None
                        if fac and q.type in ("single_choice", "likert", "scenario"):
                            # εγκεκριμένη (holdout-tested) έκδοση βαθμονόμησης: πολλαπλασιαστικοί συντελεστές ανά επιλογή
                            llm = {**llm, "probabilities": {c: float(llm["probabilities"].get(c, 0)) * float(fac.get(c, 1.0)) for c in pr["codes"]}}
                            assumptions.append(f"Βαθμονόμηση {self.cfg['calibration_version']} (πραγματικά δεδομένα, έλεγχος σε holdout)")
                            mode = "B_LLM_CALIBRATED"
                        ans, dist = sample_answer(q, llm, pr["codes"], rng)
                        rationale = llm.get("rationale", "")
                        prov, model, mver = self.provider.name, self.provider.model, call_meta.get("model_version") or ""
                        support = "CONTEXT_ONLY" if call_meta.get("evidence_refs") else "NONE"
                errs = QM.validate_answer(q, ans, pr["task"]) if not err else [err]
                nature = NATURE.get(mode, "SYNTHETIC_SCENARIO_ATTRIBUTE" if q.intent == "experience" else "SIMULATED_RESPONSE")
                if mode == "PROFILE":
                    nature = "PROFILE_ATTRIBUTE"
                if q.intent == "experience" and mode != "PROFILE":
                    assumptions.append("Ερώτηση εμπειρίας: η απάντηση είναι συνθετικό χαρακτηριστικό σεναρίου, όχι τεκμηριωμένο ιστορικό")
                rows.append({**base, "status": "ANSWERED" if not errs else "ERROR", "engine_mode": mode if not err else "ERROR",
                             "response": json.dumps(ans, ensure_ascii=False) if ans is not None else "", "answer_nature": nature,
                             "validation_ok": not errs, "validation_errors": "; ".join(errs), "provider": prov, "model": model, "model_version": mver,
                             "evidence_refs": ",".join(call_meta.get("evidence_refs", [])) if mode in ("B_LLM", "C_HYBRID") else "",
                             "source_country": src_country, "assumptions": " | ".join(assumptions), "distribution": json.dumps(dist, ensure_ascii=False) if dist else "",
                             "rationale": rationale, "empirical_support": support,
                             "attempts": json.dumps(call_meta.get("attempts", []), ensure_ascii=False) if mode in ("B_LLM", "C_HYBRID") or err else "",
                             "error": err, "input_tokens": call_meta.get("input_tokens", 0) if q is (ask_llm[0] if ask_llm else None) else 0,
                             "output_tokens": call_meta.get("output_tokens", 0) if q is (ask_llm[0] if ask_llm else None) else 0,
                             "request_id": call_meta.get("request_id") or ""})
                answers[q.id] = ans if not errs else None
                if not errs and ans is not None:
                    lab = {o.code: o.label for o in q.options}
                    if isinstance(ans, list):          # πολλαπλή/κατάταξη: ετικέτες, όχι σκέτοι κωδικοί (αλλιώς το μοντέλο δεν ξέρει τι απαντήθηκε)
                        shown = ", ".join(lab.get(str(a), str(a)) for a in ans)
                        shown = f"{shown} (σειρά σημασίας)" if q.type == "ranking" else shown
                    else:
                        shown = lab.get(str(ans), ans)
                    history.append(f"{q.id}: {shown}")
                if q.screening and not errs and str(ans) in [str(x) for x in q.screening.get("terminate_if", [])]:
                    status = "SCREENED_OUT"
                    return {"respondent_id": rid, "status": status, "rows": rows}
        return {"respondent_id": rid, "status": status, "rows": rows}

    # ------------------------------------------------------------ εκτέλεση με checkpoint
    def execute(self, respondents: list[dict], checkpoint: Path, stop_after: int | None = None) -> list:
        checkpoint.parent.mkdir(parents=True, exist_ok=True)
        done = {}
        if checkpoint.exists():
            for line in checkpoint.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    r = json.loads(line)
                    done[r["respondent_id"]] = r
        todo = [p for p in respondents if p["respondent_id"] not in done]
        completed = 0
        self.pending = 0
        stop = threading.Event()

        def work(p):
            if stop.is_set():
                return None
            try:
                r = self.respondent(p)
            except PendingAnswer:
                with self.lock:
                    self.pending += 1
                return None         # πάροχος συνεδρίας: περιμένει απάντηση· συνεχίζει στον επόμενο γύρο (--resume)
            except Exception:
                stop.set()          # π.χ. BudgetExceeded: δεν ξεκινούν νέοι ερωτώμενοι· οι ολοκληρωμένοι μένουν στο checkpoint
                raise
            with self.lock:
                with open(checkpoint, "a", encoding="utf-8") as f:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            return r

        if self.max_workers <= 1:
            for p in todo:
                r = work(p)
                if r is None:
                    continue
                done[p["respondent_id"]] = r
                completed += 1
                if stop_after is not None and completed >= stop_after:
                    raise RunInterrupted(f"Διακοπή μετά από {completed} ερωτώμενους (δοκιμή resume)")
        else:
            with ThreadPoolExecutor(self.max_workers) as ex:
                futs = [ex.submit(work, p) for p in todo]
                for f in as_completed(futs):
                    r = f.result()
                    if r:
                        done[r["respondent_id"]] = r
        order = [p["respondent_id"] for p in respondents]
        return [done[i] for i in order if i in done]
