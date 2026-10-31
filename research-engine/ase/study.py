"""Ενορχήστρωση μελέτης (ASE): config → πάνελ → ερευνητικό πλαίσιο → εκτίμηση κόστους → εκτέλεση → audit → QC →
αποτελέσματα → αναφορά → εξαγωγή παραδοτέων.

Δομή:
  studies/<study_id>/config.yaml, questionnaire.yaml, sources.yaml (προαιρετικό)
  studies/<study_id>/internal/      ΕΣΩΤΕΡΙΚΟ ερευνητικό αρχείο (ποτέ σε παραδοτέα πελάτη)
      respondents.*, panel_report.json, evidence_registry.json, runs/<run_id>/{individual_responses.*, model_provenance.json,
      execution_manifest.json, quality_checks.json, validation_report.md, checkpoint.jsonl, preview/}, assumptions.md
  studies/<study_id>/deliverables/  ΜΟΝΟ: results.csv, crosstabs.csv, executive_report.html, executive_report.pdf
Κανόνες εκτέλεσης: πραγματικός (μη mock) πάροχος → απαιτείται budget_usd και ρητό confirm· dry run περιορίζεται σε ≤ 20 προφίλ.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from . import ASE_VERSION
from .evidence.context import build_context
from .llm.runtime import CHARS_PER_TOKEN, Pricing, make_provider
from .population.completes import completes_report, completes_spec, draw_profiles
from .population.panel import generate_panel
from .questionnaire import model as QM
from .respond import prompts as P
from .respond.runner import StudyRun
from .util import derive_seed, now_iso, read_json, read_table, sha256_file, write_json, write_table

DELIVERABLE_FILES = ("results.csv", "crosstabs.csv", "executive_report.html", "executive_report.pdf")
DRY_RUN_MAX = 20
SYNTH_LABEL = "ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ"
DISCLOSURE = ("Η παρούσα μελέτη βασίζεται σε συνθετικά καταναλωτικά προφίλ και προσομοιωμένες απαντήσεις. "
              "Δεν αποτελεί δειγματοληπτική έρευνα με συνεντεύξεις πραγματικών καταναλωτών.")


class ConfirmationRequired(Exception):
    pass


class AnswersPending(Exception):
    """Πάροχος συνεδρίας: υπάρχουν ερωτώμενοι που περιμένουν απαντήσεις AI· συνέχεια με --resume μετά το session-import."""


def _git_commit():
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=Path(__file__).parent).stdout.strip()
    except Exception:
        return None


class Study:
    def __init__(self, study_dir):
        from .util import load_structured
        self.dir = Path(study_dir).resolve()
        self.cfg = load_structured(self.dir / "config.yaml")
        self.study_id = self.cfg["study_id"]
        self.cfg.setdefault("panel", {})
        self.cfg["panel"].setdefault("random_seed", 20261031)
        self.qn = QM.load(self.dir / self.cfg.get("questionnaire", "questionnaire.yaml"))
        self.internal = self.dir / "internal"
        self.deliv = self.dir / "deliverables"
        self._registry = None

    # ------------------------------------------------------------ πάνελ και πλαίσιο
    def ensure_panel(self, regenerate=False) -> pd.DataFrame:
        base = self.internal / "respondents"
        if not regenerate:
            try:
                return read_table(base)
            except FileNotFoundError:
                pass
        df, rep = generate_panel(self.cfg["panel"], self.study_id)
        write_table(df, base)
        write_json(self.internal / "panel_report.json", rep)
        return read_table(base)

    @property
    def registry(self):
        if self._registry is None:
            p = self.internal / "evidence_registry.json"
            self._registry = read_json(p) if p.exists() else self.build_context()
        return self._registry

    def build_context(self):
        reg = build_context(self.dir, self.cfg, self.qn)
        write_json(self.internal / "evidence_registry.json", reg)
        self._registry = reg
        return reg

    # ------------------------------------------------------------ εκτίμηση κόστους
    def estimate(self, provider_cfg: dict, n: int | None = None, question_ids=None, batching="per_question", thinking_tokens=(0, 600)) -> dict:
        """Εκτίμηση πριν από την εκτέλεση. Είσοδος: πραγματικό μέγεθος prompts (από δείγμα προφίλ) / CHARS_PER_TOKEN·
        έξοδος: εκτίμηση ανά τύπο ερώτησης + εύρος για tokens συλλογιστικής του μοντέλου. Αν υπάρχει dry run με τον ίδιο
        πάροχο/μοντέλο, χρησιμοποιούνται οι ΜΕΤΡΗΜΕΝΟΙ μέσοι όροι tokens ανά κλήση (calibrated)."""
        resp = self.ensure_panel()
        n = n or int(self.cfg["panel"]["sample_size"])
        qs = [q for q in self.qn.questions if (not question_ids or q.id in question_ids)]
        llm_qs = [q for q in qs if not (q.intent == "demographic" and q.profile_field)]
        sample_prompts = []
        prov = make_provider({"provider": "mock"})
        for prof in resp.head(5).to_dict("records"):
            run = StudyRun(self, prov, run_id="estimate", dry_run=True, max_workers=1)
            for q in llm_qs:
                o = QM.presented_options(q, run.seed, self.study_id, prof["respondent_id"])
                task = QM.dce_task(q, run.seed, self.study_id, prof["respondent_id"]) if q.type == "dce" else None
                blk = P.question_block(q, [(x.code, x.label) for x in o], task, (q.numeric.get("min"), q.numeric.get("max")) if q.type == "numeric" else None)
                sample_prompts.append(len(P.SYSTEM) + len(P.user_prompt(prof, ["Qx: ..."] * min(20, len(qs)), "- [ref] ..." * 3, [blk], run.brief)))
        avg_in = (sum(sample_prompts) / len(sample_prompts) / CHARS_PER_TOKEN) if sample_prompts else 0
        out_per_q = {q.id: 40 + 10 * max(1, len(q.options)) + (120 if q.type == "open" else 0) for q in llm_qs}
        if batching == "per_block_dep":
            ids = {q.id for q in llm_qs}
            n_units = sum(1 for u in QM.split_units(self.qn, self.qn.questions) if any(q.id in ids for q in u))
        else:
            n_units = len({q.block for q in llm_qs})
        calls = n * (len(llm_qs) if batching == "per_question" else n_units)
        in_tok = calls * avg_in if batching == "per_question" else n * n_units * avg_in * 1.6
        base_out = n * sum(out_per_q.values())
        measured = self._measured_usage(provider_cfg)
        if measured:
            in_tok = calls * measured["in_per_call"]
            lo_out = hi_out = calls * measured["out_per_call"]
        else:
            lo_out, hi_out = base_out + calls * thinking_tokens[0], base_out + calls * thinking_tokens[1]
        pr = Pricing()
        name, model = provider_cfg.get("provider", "mock"), provider_cfg.get("model", "mock-1")
        c_lo, c_hi = pr.cost(name, model, in_tok, lo_out), pr.cost(name, model, in_tok, hi_out)
        return {"study_id": self.study_id, "provider": name, "model": model, "respondents": n, "questions": len(qs), "llm_questions": len(llm_qs),
                "batching": batching, "llm_calls": int(calls), "input_tokens": int(in_tok), "output_tokens_range": [int(lo_out), int(hi_out)],
                "cost_usd_range": None if c_lo is None else [round(c_lo, 2), round(c_hi, 2)],
                "price_source": pr.cfg.get("source_note"), "calibrated_from_dry_run": bool(measured),
                "assumptions": [f"{CHARS_PER_TOKEN} χαρακτήρες ανά token (συντηρητικό για ελληνικά)" if not measured else "Μετρημένα tokens ανά κλήση από προηγούμενο dry run",
                                f"Tokens συλλογιστικής ανά κλήση: {thinking_tokens[0]}–{thinking_tokens[1]} (μοντέλα με προσαρμοστική σκέψη)" if not measured else "",
                                "Όλες οι ερωτήσεις θεωρείται ότι ερωτώνται (το skip logic μειώνει το πραγματικό κόστος)",
                                "Χωρίς prompt caching και χωρίς Batches API (−50%)" ]}

    def _measured_usage(self, provider_cfg):
        runs = self.internal / "runs"
        if not runs.exists():
            return None
        for d in sorted(runs.iterdir(), reverse=True):
            m = d / "execution_manifest.json"
            if m.exists():
                mm = read_json(m)
                led = mm.get("ledger", {})
                if led.get("provider") == provider_cfg.get("provider") and led.get("model") == provider_cfg.get("model") and led.get("calls") and led["provider"] != "mock":
                    return {"in_per_call": led["input_tokens"] / led["calls"], "out_per_call": led["output_tokens"] / led["calls"]}
        return None

    # ------------------------------------------------------------ εκτέλεση
    def run(self, provider_cfg: dict, *, n=None, question_ids=None, dry_run=False, confirm=False, budget_usd=None, resume_run_id=None,
            stop_after=None, max_workers=4, batching="per_question", requests_per_minute=50, sleep=None, run_label=None, forced_answers=None) -> str:
        if not dry_run and str(self.cfg.get("status", "")).upper().startswith("DRAFT"):
            # πύλη έγκρισης: ερωτηματολόγιο σε εκκρεμότητα (π.χ. DRAFT_PENDING_PARTNER_APPROVAL) → μόνο dry-run / πιλοτική
            raise ConfirmationRequired(f"Η μελέτη {self.study_id} έχει status «{self.cfg['status']}». Πλήρης εκτέλεση μόνο μετά από έγκριση: "
                                       "ορίστε status: APPROVED στο config.yaml. Για πιλοτική χρησιμοποιήστε dry-run.")
        provider = make_provider(provider_cfg)
        ok, why = provider.available()
        if not ok:
            raise RuntimeError(f"Ο πάροχος {provider.name} δεν είναι διαθέσιμος: {why}")
        resp = self.ensure_panel()
        cs = completes_spec(self.cfg["panel"])           # None → n = αρχικά προφίλ (όπως πριν)· αλλιώς n = ολοκληρωμένα ερωτηματολόγια
        if dry_run:
            n = min(n or int(self.cfg["panel"]["sample_size"]), DRY_RUN_MAX)
        sel = resp.head(n) if n else resp
        if cs is not None:
            target_n = int(n or self.cfg["panel"]["sample_size"])
            cap = int(np.ceil(cs["max_profiles"] * target_n / int(self.cfg["panel"]["sample_size"])))
            sel = resp.head(target_n) if cs["quota_basis"] != "documented_target" else resp.head(0)
        if provider.name != "mock" and not dry_run and not getattr(provider, "metered", True):
            # μη χρεούμενος πάροχος (συνεδρία): ρητή επιβεβαίωση όγκου, χωρίς προϋπολογισμό σε USD
            est = self.estimate(provider_cfg, n=len(sel), question_ids=question_ids, batching=batching)
            if not confirm:
                raise ConfirmationRequired(f"Πλήρης εκτέλεση με {provider.name}: εκτίμηση έως {est['llm_calls']} αιτήματα AI για {len(sel)} "
                                           f"{'ολοκληρωμένα' if cs is not None else 'προφίλ'}. Απαιτείται --confirm (μη χρεούμενος πάροχος, χωρίς --budget-usd).")
            budget_usd = None
        elif provider.name != "mock" and not dry_run:
            est = self.estimate(provider_cfg, n=len(sel), question_ids=question_ids, batching=batching)
            if budget_usd is None or not confirm:
                raise ConfirmationRequired(f"Πραγματική εκτέλεση με {provider.name}/{provider.model}: εκτίμηση {est['cost_usd_range']} USD για {est['llm_calls']} κλήσεις. "
                                           "Απαιτούνται --budget-usd και --confirm.")
        run_id = resume_run_id or f"{now_iso().replace(':', '').replace('-', '')}_{provider.name}_{'dry' if dry_run else 'full'}{'_' + run_label if run_label else ''}"
        rdir = self.internal / "runs" / run_id
        rdir.mkdir(parents=True, exist_ok=True)
        print(f"[ase] run_id: {run_id} (συνέχεια μετά από διακοπή: --resume {run_id})", file=sys.stderr)
        _ = self.registry
        started = now_iso()
        if hasattr(provider, "bind"):
            provider.bind(rdir / "session")  # πάροχος συνεδρίας Claude Code: αιτήματα/απαντήσεις ως αρχεία του run
        if provider.name in ("mock", "claude_session"):
            requests_per_minute = 0          # χωρίς rate limit για τοπικούς παρόχους (mock / συνεδρία)
        if self.evidence_plan() and not (rdir / "evidence_plan_used.json").exists():
            from .evidence.plan import serializable
            write_json(rdir / "evidence_plan_used.json", serializable(self.evidence_plan()))
        if not (rdir / "evidence_registry_used.json").exists():
            write_json(rdir / "evidence_registry_used.json", self.registry)   # το πλαίσιο πηγών που είδε ΑΥΤΗ η εκτέλεση (audit)
        sr = StudyRun(self, provider, run_id=run_id, dry_run=dry_run, budget_usd=budget_usd, max_workers=max_workers, requests_per_minute=requests_per_minute,
                      batching=batching, sleep=sleep, question_ids=question_ids, forced_answers=forced_answers)
        added_path = rdir / "added_profiles"                # αρχικά προφίλ documented_target και αντικαταστάτες (completes)
        comp_notes, stop_reason = [], None
        while True:
            added = self._added_profiles(rdir)
            profiles = pd.concat([sel, added], ignore_index=True) if len(added) else sel
            results = sr.execute(self.with_lab_state(profiles).to_dict("records"), rdir / "checkpoint.jsonl", stop_after=stop_after)
            if getattr(sr, "pending", 0):
                from .llm.session_provider import status
                st_ = status(rdir / "session")
                raise AnswersPending(f"run {run_id}: {len(results)} ερωτώμενοι ολοκληρώθηκαν, {sr.pending} περιμένουν· "
                                     f"{len(st_['waiting'])} αιτήματα χωρίς απάντηση στο {rdir / 'session' / 'pending'}. "
                                     f"Μετά τις απαντήσεις: session-import και ξανά --resume {run_id}.")
            if cs is None:
                break
            stat = {x["respondent_id"]: x["status"] for x in results}
            short = target_n - sum(1 for v in stat.values() if v == "COMPLETE")
            if short <= 0:
                stop_reason = "target_reached"
                break
            if len(profiles) >= cap:
                stop_reason = "max_profiles_reached"
                break
            wave = int(added["wave"].max()) + 1 if len(added) else (1 if cs["quota_basis"] == "documented_target" and not len(sel) else 2)
            replaced = set(added["replaces"]) if len(added) else set()
            so = profiles[profiles["respondent_id"].map(stat).eq("SCREENED_OUT") & ~profiles["respondent_id"].isin(replaced)]
            k = min(short, cap - len(profiles))
            new, notes = draw_profiles(self.cfg["panel"], self.study_id, cs, k, wave=wave, start_number=len(resp) + len(added) + 1,
                                       exclude=set(resp["frame_record"]) | (set(added["frame_record"]) if len(added) else set()), screened_out=so)
            comp_notes += [f"κύμα {wave}: {n_}" for n_ in notes]
            if not len(new):
                stop_reason = "frame_exhausted"
                break
            write_table(pd.concat([added, new], ignore_index=True) if len(added) else new, added_path)
        sel = profiles
        rows = [r for x in results for r in x["rows"]]
        status = {x["respondent_id"]: x["status"] for x in results}
        df = pd.DataFrame(rows)
        if len(df):
            df.insert(0, "data_status", SYNTH_LABEL)
        write_table(df, rdir / "individual_responses")
        write_json(rdir / "respondent_status.json", status)
        write_json(rdir / "model_provenance.json", {
            "provider": provider.describe(), "model_versions_seen": sorted({v for v in df.get("model_version", pd.Series(dtype=str)) if v}),
            "prompt_version": P.PROMPT_VERSION, "system_prompt_sha256": __import__("hashlib").sha256(P.SYSTEM.encode()).hexdigest(),
            "empirical_models": {qid: ad.describe() for qid, ad in sr.adapters.items()}, "mock": provider.name == "mock",
            "note": "Mock provider: χωρίς ερευνητική αξία — μόνο δοκιμή υποδομής." if provider.name == "mock" else ""})
        manifest = {"label": SYNTH_LABEL, "study_id": self.study_id, "run_id": run_id, "ase_version": ASE_VERSION, "git_commit": _git_commit(), "started_at": started, "finished_at": now_iso(),
                    "dry_run": dry_run, "respondents_requested": int(len(sel)), "respondents_completed": len(results),
                    "status_counts": pd.Series(list(status.values())).value_counts().to_dict(), "question_subset": sorted(question_ids) if question_ids else None,
                    "batching": batching, "seed": int(self.cfg["panel"]["random_seed"]), "max_workers": max_workers,
                    "config_sha256": sha256_file(self.dir / "config.yaml"), "questionnaire_sha256": sha256_file(self.dir / self.cfg.get("questionnaire", "questionnaire.yaml")),
                    "ledger": sr.ledger.summary(), "errors": int((df["status"] == "ERROR").sum()) if len(df) else 0,
                    "sample_size_basis": "completes" if cs else "initial_profiles"}
        if cs is not None:
            crep = completes_report(sel, status, cs, target_n, self.cfg["panel"], self.study_id)
            crep.update(stop_reason=stop_reason, notes=comp_notes, max_profiles_this_run=cap,
                        documented_target_source=cs.get("source") or ({"status": "assumption", "justification": cs.get("justification")} if cs.get("status") else None))
            write_json(rdir / "completes_report.json", crep)
            manifest["completes"] = {k: crep[k] for k in ("target_completes", "achieved_completes", "profiles_used", "screened_out", "replacements",
                                                          "quota_basis", "incidence_pct", "stop_reason")}
        prev_p = rdir / "execution_manifest.json"
        if resume_run_id and prev_p.exists():
            # σε resume όπου όλοι οι ερωτώμενοι ήταν ήδη ολοκληρωμένοι, ο ledger αυτής της κλήσης είναι 0: κρατάμε τον προηγούμενο
            pl = (read_json(prev_p) or {}).get("ledger") or {}
            if int(pl.get("calls") or 0) > int(manifest["ledger"].get("calls") or 0):
                manifest["ledger"] = {**pl, "note": "από προηγούμενη κλήση του ίδιου run (αυτή η συνέχεια δεν χρειάστηκε νέες κλήσεις)"}
        write_json(rdir / "execution_manifest.json", manifest)
        self.write_assumptions()
        from .qc.checks import run_qc
        qc = run_qc(self, run_id)
        write_json(rdir / "quality_checks.json", qc)
        (rdir / "validation_report.md").write_text(qc_markdown(self, run_id, qc, manifest), encoding="utf-8")
        return run_id

    @staticmethod
    def _added_profiles(rdir) -> pd.DataFrame:
        try:
            a = read_table(rdir / "added_profiles")
        except FileNotFoundError:
            return pd.DataFrame()
        a["wave"] = pd.to_numeric(a["wave"], errors="coerce").astype(int)
        a["replaces"] = a["replaces"].fillna("").astype(str)
        return a

    def profiles(self, run_id=None) -> pd.DataFrame:
        """Προφίλ μιας εκτέλεσης: πάνελ της μελέτης + (completes) αρχικά/αντικαταστάτες που κληρώθηκαν στο run."""
        base = read_table(self.internal / "respondents")
        if run_id is None:
            return base
        added = self._added_profiles(self.internal / "runs" / run_id)
        return pd.concat([base, added], ignore_index=True) if len(added) else base

    # ------------------------------------------------------------ κανονική κατάσταση ερωτώμενου (ASE + Lab)
    def lab_cfg(self) -> dict:
        lab = dict(self.cfg.get("lab") or {})
        lab.setdefault("model", "pie-0.7")
        lab.setdefault("ref", "2026-10")
        lab.setdefault("prompt_anchors", ["emp", "econ4", "class3"])
        return lab

    def with_lab_state(self, df: pd.DataFrame) -> pd.DataFrame:
        """Προσθέτει στα προφίλ τις άγκυρες PIE (ίδια πρόσωπα, ίδια IDs). Αποθήκευση στο internal/respondent_state με κλειδί
        (respondent_id, frame_record)· οι άγκυρες είναι ΕΚΤΙΜΗΣΕΙΣ μοντέλου από ελληνικά μικροδεδομένα, όχι γνωστά στοιχεία."""
        lab = self.lab_cfg()
        if not lab.get("enabled") or not len(df):
            return df
        from .lab.bridge import ANCHOR_COLS, call, respondent_payload
        cond = lab.get("condition_on")            # None (όπως πριν) ή "income_quintile" (βλ. _anchors_conditioned)
        path = self.internal / "respondent_state" / f"lab_anchors_{lab['model'].replace('.', '_')}{'_incq' if cond == 'income_quintile' else ''}"
        try:
            state = read_table(path)
        except FileNotFoundError:
            state = pd.DataFrame(columns=["respondent_id", "frame_record"])
        key = lambda d: d["respondent_id"].astype(str) + "|" + d["frame_record"].astype(str)   # noqa: E731
        have = set(key(state)) if len(state) else set()
        miss = df[~key(df).isin(have)]
        if len(miss):
            seed = int(self.cfg["panel"]["random_seed"])
            fr = dict(zip(miss["respondent_id"], miss["frame_record"]))
            if cond == "income_quintile":
                new = self._anchors_conditioned(miss, lab, seed, path)
            else:
                res = call("anchors", {"model": lab["model"], "respondents": [
                    respondent_payload(p, derive_seed(seed, self.study_id, p["respondent_id"], p["frame_record"], "lab-anchors")) for p in miss.to_dict("records")]})
                new = pd.DataFrame([{"respondent_id": r["id"], "frame_record": fr[r["id"]], **{f"lab_{k}": r["anchors"].get(k) for k in ANCHOR_COLS},
                                     "lab_model": res["model"], "lab_bridge": res["bridge"]} for r in res["respondents"]])
            state = pd.concat([state, new], ignore_index=True) if len(state) else new
            write_table(state, path)
        state = state.drop_duplicates(["respondent_id", "frame_record"], keep="last")
        out = df.drop(columns=[c for c in df.columns if c.startswith("lab_")], errors="ignore").merge(state, on=["respondent_id", "frame_record"], how="left")
        out["lab_prompt_anchors"] = ",".join(lab["prompt_anchors"])
        return out

    def _anchors_conditioned(self, miss: pd.DataFrame, lab: dict, seed: int, path: Path) -> pd.DataFrame:
        """Άγκυρες PIE ΣΥΝΕΠΕΙΣ με το εισοδηματικό πεμπτημόριο του προφίλ (sampling–importance–resampling).

        Το PIE (διαΝΕΟσις) δεν έχει το πεμπτημόριο ως είσοδο· το inc6 (μηνιαίο εισόδημα νοικοκυριού) παράγεται μόνο από
        δημογραφικά/απασχόληση και από αυτό εξαρτώνται econ4, class3 κ.λπ. Για κάθε πρόσωπο παράγονται K υποψήφιες αλυσίδες του ΙΔΙΟΥ
        μοντέλου· επιλέγεται μία με βάρος P(πεμπτημόριο | inc6). Η πιθανότητα προκύπτει από ΚΑΤΑΤΑΞΗ: η κατανομή του inc6 που δίνει το
        μοντέλο για το πάνελ ορίζει διαστήματα εκατοστημορίων [F(k−1), F(k)]· P(q | k) = επικάλυψη με [0,2(q−1), 0,2q] / πλάτος.
        Παραδοχή: η κατάταξη εισοδήματος νοικοκυριού στο PIE και στο GLOPOP-S αφορά το ίδιο μέγεθος. Κανένας αριθμός εκτός μοντέλου."""
        from .lab.bridge import ANCHOR_COLS, call, respondent_payload
        K = int(lab.get("candidates", 40))
        recs = miss.to_dict("records")
        payload = [respondent_payload({**p, "respondent_id": f"{p['respondent_id']}#{k}"},
                                      derive_seed(seed, self.study_id, p["respondent_id"], p["frame_record"], "lab-anchors", k)) for p in recs for k in range(K)]
        res = call("anchors", {"model": lab["model"], "respondents": payload})
        cand = {}
        for r in res["respondents"]:
            rid, k = r["id"].rsplit("#", 1)
            cand.setdefault(rid, []).append(r["anchors"])
        cdf_p = path.parent / f"{path.name}_inc6_cdf.json"
        if cdf_p.exists():
            cdf = read_json(cdf_p)["cdf"]
        else:
            vals = pd.Series([int(a["inc6"]) for c in cand.values() for a in c if a.get("inc6") is not None])
            share = vals.value_counts(normalize=True).reindex(range(1, 7), fill_value=0.0)
            cdf = [0.0] + list(np.cumsum(share.values).round(6))
            write_json(cdf_p, {"cdf": cdf, "n_candidates": int(len(vals)), "model": res["model"],
                               "note": "Κατανομή inc6 του PIE για το πάνελ της μελέτης· ορίζει την αντιστοίχιση inc6 → εκατοστημόρια εισοδήματος"})

        def p_q_given_k(q, k):
            lo, hi = cdf[k - 1], cdf[k]
            if hi - lo <= 0:
                return 0.0
            return max(0.0, min(hi, 0.2 * q) - max(lo, 0.2 * (q - 1))) / (hi - lo)
        rows = []
        for p in recs:
            rid = p["respondent_id"]
            cs = cand.get(rid, [])
            q = pd.to_numeric(p.get("income_quintile"), errors="coerce")
            w = np.array([(p_q_given_k(int(q), int(a["inc6"])) if (q == q and a.get("inc6") is not None) else 1.0) * _age_emp_plausible(p.get("age_band"), a.get("emp"))
                          for a in cs])
            rng = np.random.default_rng(derive_seed(seed, self.study_id, rid, "lab-anchors-sir"))
            if w.sum() > 0:
                i = int(rng.choice(len(cs), p=w / w.sum()))
                status = f"income_quintile_sir:{K}"
            else:
                i, status = 0, f"income_quintile_sir:{K}:no_compatible_candidate"
            a = cs[i]
            rows.append({"respondent_id": rid, "frame_record": p["frame_record"], **{f"lab_{k}": a.get(k) for k in ANCHOR_COLS},
                         "lab_model": res["model"], "lab_bridge": res["bridge"], "lab_conditioning": status,
                         "lab_compatible_candidates": int((w > 0).sum())})
        return pd.DataFrame(rows)

    def evidence_plan(self) -> dict | None:
        """Σχέδιο τεκμηρίωσης (lake + Lab + δηλωμένες σχέσεις μέτρησης). Χτίζεται όταν η μελέτη έχει evidence_map.yaml ή Lab."""
        if getattr(self, "_plan", None) is not None:
            return self._plan
        if not ((self.dir / "evidence_map.yaml").exists() or self.lab_cfg().get("enabled")) or (self.cfg.get("evidence") or {}).get("enabled") is False:
            self._plan = None
            return None
        from .evidence.plan import build, serializable
        self._plan = build(self)
        write_json(self.internal / "evidence_plan.json", serializable(self._plan))
        return self._plan

    def responses(self, run_id) -> pd.DataFrame:
        return read_table(self.internal / "runs" / run_id / "individual_responses")

    def write_assumptions(self):
        fm = read_json(self.internal / "panel_report.json")
        lines = [f"# {self.study_id} — Παραδοχές (εσωτερικό)", "", "## Πάνελ", *[f"- {a}" for a in fm["frame_manifest"]["assumptions"]],
                 f"- {fm['disclaimer']}", "", "## Απαντήσεις",
                 "- MODE B: το LLM εκτιμά κατανομή πιθανοτήτων για το συγκεκριμένο προφίλ· η απάντηση κληρώνεται με σταθερό seed ανά (ερωτώμενο, ερώτηση).",
                 "- Ερωτήσεις εμπειρίας: συνθετικά χαρακτηριστικά σεναρίου (SYNTHETIC_SCENARIO_ATTRIBUTE), όχι πραγματικό ιστορικό.",
                 "- Συνδυασμός δεδομένων–AI: μόνο ως εμπειρικό όριο ανά πρόσωπο ή ως πλαίσιο· ποσοτική στάθμιση μόνο με δηλωμένη επικύρωση (hybrid.validation_ref). Κανένα προεπιλεγμένο βάρος.",
                 "- Μοντέλα άλλης χώρας: ποτέ αυτόματα ως επικυρωμένες ελληνικές προβλέψεις.",
                 "- Το ερευνητικό πλαίσιο εμπλουτίζει τις απαντήσεις· δεν ορίζει στόχους. Οι οδηγίες προς το μοντέλο ελέγχονται για εντολές-στόχους.",
                 "", "## Αναφορά", "- Δεν χρησιμοποιείται στατιστικό περιθώριο σφάλματος (το πάνελ δεν είναι δειγματοληπτική έρευνα)."]
        (self.internal / "assumptions.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    # ------------------------------------------------------------ αποτελέσματα, αναφορά, εξαγωγή
    def build_deliverables(self, run_id, out_dir: Path | None = None, pdf=True):
        from .report.client import render_report
        from .results import aggregate
        man = read_json(self.internal / "runs" / run_id / "execution_manifest.json")
        prov = read_json(self.internal / "runs" / run_id / "model_provenance.json")
        preview = man["dry_run"] or prov.get("mock")
        out = out_dir or (self.internal / "runs" / run_id / "preview" if preview else self.deliv)
        out.mkdir(parents=True, exist_ok=True)
        res, xt = aggregate(self, run_id)
        for t in (res, xt):
            t.insert(0, "data_status", SYNTH_LABEL)
        res.to_csv(out / "results.csv", index=False)
        xt.to_csv(out / "crosstabs.csv", index=False)
        from .analysis.sensitivity import run as sensitivity
        sens = sensitivity(self, run_id)
        write_json(self.internal / "runs" / run_id / "sensitivity.json", {"label": SYNTH_LABEL, "questions": sens,
                   "method": "Μετατόπιση της άγνωστης βάσης της μάρκας στην κλίμακα logit (δ ∈ −1…+1) πάνω στις αποθηκευμένες ατομικές κατανομές."})
        self.evidence_coverage(run_id)
        html = render_report(self, run_id, res.drop(columns="data_status"), xt.drop(columns="data_status"), preview=preview, sensitivity=sens)
        (out / "executive_report.html").write_text(html, encoding="utf-8")
        if pdf:
            js = Path(__file__).parent / "report" / "render_pdf.cjs"
            subprocess.run(["node", str(js), str(out / "executive_report.html"), str(out / "executive_report.pdf")], check=True, cwd="/tmp")
        return out

    def evidence_coverage(self, run_id) -> Path:
        """ΕΣΩΤΕΡΙΚΟ: κάλυψη τεκμηρίωσης ανά ερώτηση/συνιστώσα (άμεσο / μεταφερμένο / πλαίσιο / AI) από τις ατομικές γραμμές του run."""
        rdir = self.internal / "runs" / run_id
        df = self.responses(run_id)
        plan = read_json(rdir / "evidence_plan_used.json") if (rdir / "evidence_plan_used.json").exists() else {"questions": {}}
        rows = []
        for q in self.qn.questions:
            g = df[df["question_id"] == q.id] if "question_id" in df else df.iloc[0:0]
            modes = g["inference_mode"].value_counts().to_dict() if "inference_mode" in g else {}
            e = plan["questions"].get(q.id) or {}
            comps = e.get("components") or []
            rows.append({"data_status": SYNTH_LABEL, "question_id": q.id, "type": q.type, "plan_mode": e.get("mode", "—"),
                         "brand_dependent": bool(e.get("brand_dependent")), "rows_answered": int((g["status"] == "ANSWERED").sum()) if len(g) else 0,
                         **{f"n_{m}": int(modes.get(m, 0)) for m in ("A_EMPIRICAL", "C_EVIDENCE_CONSTRAINED", "C_EVIDENCE_INFORMED", "D_AI", "PROFILE", "SKIP")},
                         # πόσες φορές το εμπειρικό όριο ΑΛΛΑΞΕ πράγματι την κατανομή του AI (ελέγχθηκε ≠ επηρέασε)
                         "n_bound_binding": int(g["assumptions"].fillna("").astype(str).str.contains("(ενεργό)", regex=False).sum()) if "assumptions" in g else 0,
                         "components": "; ".join(f"{c['spec']['source']['dataset']}:{c['spec']['source']['indicator']}|{c['spec']['relation']}|{c['class']}|"
                                                 f"{_role(c)}|μεταφερμένα κελιά={len((c.get('data') or {}).get('transported_cells') or [])}"
                                                 for c in comps),
                         "lab_tier": (e.get("lab") or {}).get("tier"), "lab_abstain": (e.get("lab") or {}).get("abstain")})
        p = rdir / "evidence_coverage.csv"
        pd.DataFrame(rows).to_csv(p, index=False)
        return p

    def export(self, dest: Path, source: Path | None = None) -> list:
        """Αντιγράφει ΜΟΝΟ τα επιτρεπτά παραδοτέα· ό,τι άλλο (internal, audit) αποκλείεται ρητά."""
        src = source or self.deliv
        if self.internal in src.resolve().parents or src.resolve() == self.internal.resolve():
            if src.name != "preview":
                raise PermissionError("Δεν επιτρέπεται εξαγωγή από τον εσωτερικό φάκελο.")
        if not any((src / f).exists() for f in DELIVERABLE_FILES):
            raise FileNotFoundError(f"Δεν υπάρχουν παραδοτέα στο {src}. Τα dry/mock runs παράγουν μόνο εσωτερική προεπισκόπηση "
                                    "(internal/runs/<run>/preview)· παραδοτέα πελάτη δημιουργούνται μόνο από πλήρη εκτέλεση με πραγματικό πάροχο.")
        dest.mkdir(parents=True, exist_ok=True)
        copied = []
        for f in DELIVERABLE_FILES:
            if (src / f).exists():
                shutil.copy2(src / f, dest / f)
                copied.append(f)
        leaked = [p.name for p in dest.iterdir() if p.name not in DELIVERABLE_FILES]
        if leaked:
            raise PermissionError(f"Μη επιτρεπτά αρχεία στον φάκελο εξαγωγής: {leaked}")
        return copied


def _age_emp_plausible(age, emp) -> float:
    """Κανόνας αληθοφάνειας για τις άγκυρες PIE (κανόνας της ενοποίησης, όχι εμπειρική εκτίμηση): συνταξιούχος κάτω των 35 ή
    φοιτητής 45+ αποκλείονται στην επιλογή υποψηφίων· όλα τα άλλα αφήνονται στο μοντέλο."""
    if emp == "retired" and str(age) in ("18-24", "25-34"):
        return 0.0
    if emp == "student" and str(age) in ("45-54", "55-64", "65+"):
        return 0.0
    return 1.0


def _role(c) -> str:
    """Πραγματικός ρόλος μιας δηλωμένης συνιστώσας στην εκτέλεση (ίδιοι κανόνες με τον Orchestrator)."""
    if not c.get("usable"):
        return "απόρριψη"
    rel = c["spec"]["relation"]
    if rel in ("lower_bound", "lower_bound_union"):
        return "όριο ανά πρόσωπο" if c["class"] == "DIRECT_EMPIRICAL" else "μόνο καταγραφή (υποβαθμίστηκε· δεν εφαρμόζεται)"
    return "πλαίσιο στο prompt" if rel == "proxy" else "μόνο καταγραφή"


def qc_markdown(study, run_id, qc, man) -> str:
    L = [f"# Validation report — {study.study_id} / {run_id}", "", f"- Dry run: {man['dry_run']} · ερωτώμενοι: {man['respondents_completed']} · σφάλματα: {man['errors']}",
         f"- Ledger: {json.dumps(man['ledger'], ensure_ascii=False)}", "", "| Έλεγχος | Κατάσταση | Λεπτομέρεια |", "|---|---|---|"]
    for c in qc["checks"]:
        L.append(f"| {c['check']} | {c['status']} | {str(c.get('detail', ''))[:220].replace('|', '/')} |")
    L += ["", "## Επισημάνσεις", *([f"- {x}" for x in qc.get("flags", [])] or ["- Καμία"]), "",
          "Οι έλεγχοι συνέπειας δεν αποτελούν από μόνοι τους απόδειξη πραγματικής προβλεπτικής εγκυρότητας."]
    return "\n".join(L) + "\n"
