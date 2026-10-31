"""Πάροχος συνεδρίας Claude Code (claude_session): σύνδεση του μηχανισμού με απαντήσεις AI που δίνονται μέσα σε μια
συνεδρία Claude Code, ΧΩΡΙΣ API key.

Ροή (ανά γύρο):
  1. Η εκτέλεση φτάνει σε κλήση LLM. Αν υπάρχει ήδη ΕΓΚΕΚΡΙΜΕΝΗ απάντηση για το συγκεκριμένο prompt (answers/<key>.json),
     επιστρέφεται όπως θα επέστρεφε το API. Αλλιώς γράφεται αίτημα στο pending/<key>.json και ο ερωτώμενος ΠΕΡΙΜΕΝΕΙ
     (δεν γράφεται ως σφάλμα, δεν μπαίνει στο checkpoint).
  2. Το AI της συνεδρίας γράφει την απάντηση JSON στο inbox/<key>.json.
  3. Το `session-import` ελέγχει κάθε απάντηση με το ίδιο JSON schema και τον ίδιο σημασιολογικό έλεγχο που ισχύουν για το
     API και μόνο τότε τη μεταφέρει στο answers/. Οι μη έγκυρες πηγαίνουν στο rejected/ με αιτιολογία.
  4. Η εκτέλεση ξανατρέχει (--resume): οι ερωτώμενοι προχωρούν στην επόμενη ενότητα με το ιστορικό τους.
Το κλειδί είναι hash του πλήρους prompt + schema: ίδιο prompt → ίδια απάντηση (όπως ένα cache API)· κάθε προφίλ, με το
δικό του ιστορικό, έχει δικό του prompt."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from ..util import now_iso
from .base import LLMProvider, LLMResult

SESSION_MODEL = "claude-code-session"


class PendingAnswer(Exception):
    """Δεν έχει δοθεί ακόμη απάντηση για αυτό το prompt· ο ερωτώμενος περιμένει τον επόμενο γύρο."""

    def __init__(self, key: str):
        super().__init__(f"Αναμονή απάντησης συνεδρίας για {key}")
        self.key = key


def prompt_key(system: str, user: str, schema: dict) -> str:
    return hashlib.sha256((system + "\n\x00" + user + "\n\x00" + json.dumps(schema, sort_keys=True, ensure_ascii=False)).encode("utf-8")).hexdigest()[:20]


class ClaudeSessionProvider(LLMProvider):
    name = "claude_session"

    def __init__(self, model=SESSION_MODEL, **kw):
        super().__init__(model or SESSION_MODEL, **kw)
        self.root: Path | None = None

    def available(self):
        return True, "Απαντήσεις AI από συνεδρία Claude Code μέσω αρχείων (χωρίς API key)"

    def bind(self, root: Path):
        self.root = Path(root)
        for d in ("pending", "inbox", "answers", "rejected"):
            (self.root / d).mkdir(parents=True, exist_ok=True)

    def generate(self, system, user, schema, max_tokens=2000):
        if self.root is None:
            raise RuntimeError("Ο πάροχος συνεδρίας δεν έχει συνδεθεί με φάκελο εκτέλεσης")
        key = prompt_key(system, user, schema)
        ans = self.root / "answers" / f"{key}.json"
        if ans.exists():
            rec = json.loads(ans.read_text(encoding="utf-8"))
            text = json.dumps(rec["answer"], ensure_ascii=False)
            return LLMResult(parsed=rec["answer"], text=text, input_tokens=int(len(system + user) / 2.5), output_tokens=int(len(text) / 2.5),
                             model=self.model, model_version=SESSION_MODEL, provider=self.name, request_id=f"session-{key}", stop_reason="end_turn",
                             meta={"answered_by": rec.get("answered_by"), "imported_at": rec.get("imported_at")})
        sysf = self.root / "system_prompt.txt"
        if not sysf.exists():
            sysf.write_text(system, encoding="utf-8")
        p = self.root / "pending" / f"{key}.json"
        if not p.exists():
            p.write_text(json.dumps({"key": key, "created_at": now_iso(), "question_ids": list(schema.get("properties", {})),
                                     "system_prompt_file": "system_prompt.txt", "user_prompt": user, "schema": schema},
                                    ensure_ascii=False, indent=1), encoding="utf-8")
        raise PendingAnswer(key)


def status(root: Path) -> dict:
    root = Path(root)
    pend = {p.stem for p in (root / "pending").glob("*.json")}
    done = {p.stem for p in (root / "answers").glob("*.json")}
    inbox = {p.stem for p in (root / "inbox").glob("*.json")}
    return {"requests_total": len(pend), "answered": len(pend & done), "waiting": sorted(pend - done - inbox), "in_inbox": len(inbox),
            "rejected": len(list((root / "rejected").glob("*.json")))}


def import_answers(root: Path, qn) -> dict:
    """Έλεγχος και εισαγωγή των απαντήσεων του inbox. Ίδιοι έλεγχοι με το API: JSON schema + σημασιολογικός έλεγχος."""
    import jsonschema

    from ..respond.runner import semantic_check_factory
    root = Path(root)
    qby = qn.by_id()
    ok, bad = [], []
    for f in sorted((root / "inbox").glob("*.json")):
        key = f.stem
        req = root / "pending" / f"{key}.json"
        err = None
        try:
            if not req.exists():
                raise ValueError("δεν υπάρχει αντίστοιχο αίτημα")
            r = json.loads(req.read_text(encoding="utf-8"))
            raw = json.loads(f.read_text(encoding="utf-8"))
            answer = raw.get("answer", raw) if isinstance(raw, dict) else raw
            jsonschema.validate(answer, r["schema"])
            qs = [qby[q] for q in r["question_ids"]]
            codes = {q: list((r["schema"]["properties"][q]["properties"].get("probabilities") or r["schema"]["properties"][q]["properties"].get("inclusion_probabilities")
                              or r["schema"]["properties"][q]["properties"].get("importance_scores") or {}).get("properties", {})) for q in r["question_ids"]}
            e = semantic_check_factory(qs, codes)(answer)
            if e:
                raise ValueError(e)
        except Exception as e:  # noqa: BLE001 — κάθε αποτυχία καταγράφεται, τίποτα δεν διορθώνεται σιωπηρά
            err = f"{e.__class__.__name__}: {str(e)[:300]}"
        if err:
            (root / "rejected" / f"{key}.json").write_text(json.dumps({"key": key, "error": err, "content": f.read_text(encoding="utf-8")}, ensure_ascii=False, indent=1), encoding="utf-8")
            bad.append({"key": key, "error": err})
        else:
            rec = {"key": key, "answer": answer, "answered_by": raw.get("answered_by", "claude-code-session") if isinstance(raw, dict) else "claude-code-session",
                   "imported_at": now_iso(), "source": "Claude Code session (AI), όχι mock"}
            (root / "answers" / f"{key}.json").write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
            ok.append(key)
        f.unlink()
    return {"imported": len(ok), "rejected": bad}
