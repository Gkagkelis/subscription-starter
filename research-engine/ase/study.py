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
        calls = n * (len(llm_qs) if batching == "per_question" else len({q.block for q in llm_qs}))
        in_tok = calls * avg_in if batching == "per_question" else n * len({q.block for q in llm_qs}) * avg_in * 1.6
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
            stop_after=None, max_workers=4, batching="per_question", requests_per_minute=50, sleep=None, run_label=None) -> str:
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
        if provider.name != "mock" and not dry_run:
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
        if not (rdir / "evidence_registry_used.json").exists():
            write_json(rdir / "evidence_registry_used.json", self.registry)   # το πλαίσιο πηγών που είδε ΑΥΤΗ η εκτέλεση (audit)
        sr = StudyRun(self, provider, run_id=run_id, dry_run=dry_run, budget_usd=budget_usd, max_workers=max_workers, requests_per_minute=requests_per_minute,
                      batching=batching, sleep=sleep, question_ids=question_ids)
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
        write_table(df, rdir / "individual_responses")
        write_json(rdir / "respondent_status.json", status)
        write_json(rdir / "model_provenance.json", {
            "provider": provider.describe(), "model_versions_seen": sorted({v for v in df.get("model_version", pd.Series(dtype=str)) if v}),
            "prompt_version": P.PROMPT_VERSION, "system_prompt_sha256": __import__("hashlib").sha256(P.SYSTEM.encode()).hexdigest(),
            "empirical_models": {qid: ad.describe() for qid, ad in sr.adapters.items()}, "mock": provider.name == "mock",
            "note": "Mock provider: χωρίς ερευνητική αξία — μόνο δοκιμή υποδομής." if provider.name == "mock" else ""})
        manifest = {"study_id": self.study_id, "run_id": run_id, "ase_version": ASE_VERSION, "git_commit": _git_commit(), "started_at": started, "finished_at": now_iso(),
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
        path = self.internal / "respondent_state" / f"lab_anchors_{lab['model'].replace('.', '_')}"
        try:
            state = read_table(path)
        except FileNotFoundError:
            state = pd.DataFrame(columns=["respondent_id", "frame_record"])
        key = lambda d: d["respondent_id"].astype(str) + "|" + d["frame_record"].astype(str)   # noqa: E731
        have = set(key(state)) if len(state) else set()
        miss = df[~key(df).isin(have)]
        if len(miss):
            seed = int(self.cfg["panel"]["random_seed"])
            res = call("anchors", {"model": lab["model"], "respondents": [
                respondent_payload(p, derive_seed(seed, self.study_id, p["respondent_id"], p["frame_record"], "lab-anchors")) for p in miss.to_dict("records")]})
            fr = dict(zip(miss["respondent_id"], miss["frame_record"]))
            new = pd.DataFrame([{"respondent_id": r["id"], "frame_record": fr[r["id"]], **{f"lab_{k}": r["anchors"].get(k) for k in ANCHOR_COLS},
                                 "lab_model": res["model"], "lab_bridge": res["bridge"]} for r in res["respondents"]])
            state = pd.concat([state, new], ignore_index=True) if len(state) else new
            write_table(state, path)
        state = state.drop_duplicates(["respondent_id", "frame_record"], keep="last")
        out = df.drop(columns=[c for c in df.columns if c.startswith("lab_")], errors="ignore").merge(state, on=["respondent_id", "frame_record"], how="left")
        out["lab_prompt_anchors"] = ",".join(lab["prompt_anchors"])
        return out

    def responses(self, run_id) -> pd.DataFrame:
        return read_table(self.internal / "runs" / run_id / "individual_responses")

    def write_assumptions(self):
        fm = read_json(self.internal / "panel_report.json")
        lines = [f"# {self.study_id} — Παραδοχές (εσωτερικό)", "", "## Πάνελ", *[f"- {a}" for a in fm["frame_manifest"]["assumptions"]],
                 f"- {fm['disclaimer']}", "", "## Απαντήσεις",
                 "- MODE B: το LLM εκτιμά κατανομή πιθανοτήτων για το συγκεκριμένο προφίλ· η απάντηση κληρώνεται με σταθερό seed ανά (ερωτώμενο, ερώτηση).",
                 "- Ερωτήσεις εμπειρίας: συνθετικά χαρακτηριστικά σεναρίου (SYNTHETIC_SCENARIO_ATTRIBUTE), όχι πραγματικό ιστορικό.",
                 "- MODE C: linear opinion pool εμπειρικής και LLM κατανομής με βάρος hybrid_weight· δεν είναι στατιστικά επικυρωμένο.",
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
        res.to_csv(out / "results.csv", index=False)
        xt.to_csv(out / "crosstabs.csv", index=False)
        html = render_report(self, run_id, res, xt, preview=preview)
        (out / "executive_report.html").write_text(html, encoding="utf-8")
        if pdf:
            js = Path(__file__).parent / "report" / "render_pdf.cjs"
            subprocess.run(["node", str(js), str(out / "executive_report.html"), str(out / "executive_report.pdf")], check=True, cwd="/tmp")
        return out

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


def qc_markdown(study, run_id, qc, man) -> str:
    L = [f"# Validation report — {study.study_id} / {run_id}", "", f"- Dry run: {man['dry_run']} · ερωτώμενοι: {man['respondents_completed']} · σφάλματα: {man['errors']}",
         f"- Ledger: {json.dumps(man['ledger'], ensure_ascii=False)}", "", "| Έλεγχος | Κατάσταση | Λεπτομέρεια |", "|---|---|---|"]
    for c in qc["checks"]:
        L.append(f"| {c['check']} | {c['status']} | {str(c.get('detail', ''))[:220].replace('|', '/')} |")
    L += ["", "## Επισημάνσεις", *([f"- {x}" for x in qc.get("flags", [])] or ["- Καμία"]), "",
          "Οι έλεγχοι συνέπειας δεν αποτελούν από μόνοι τους απόδειξη πραγματικής προβλεπτικής εγκυρότητας."]
    return "\n".join(L) + "\n"
