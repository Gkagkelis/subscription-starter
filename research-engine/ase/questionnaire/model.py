"""Universal questionnaire engine (ASE): φόρτωση YAML/JSON, έλεγχος, ταξινόμηση πρόθεσης ερώτησης, skip logic,
τυχαιοποίηση, πειράματα επιλογής, έλεγχος εγκυρότητας απαντήσεων και JSON schema για δομημένη έξοδο.

Τύποι: single_choice, multiple_choice, likert, numeric, ranking, open, scenario (single choice με σενάριο), dce.
Κάθε ερώτηση: μοναδικό id, ακριβές κείμενο, τύπος, επιτρεπόμενες τιμές, κανόνες ελέγχου, προαιρετικά condition (skip
logic), screening (terminate_if), randomize_options / anchor, intent (ή αυτόματη ταξινόμηση).
"""
from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field

import numpy as np

from ..util import derive_seed, load_structured

TYPES = {"single_choice", "multiple_choice", "likert", "numeric", "ranking", "open", "scenario", "dce"}
INTENTS = {"demographic", "experience", "knowledge", "attitude", "hypothetical_choice", "intention"}
INTENT_LABEL = {"demographic": "Δημογραφικό χαρακτηριστικό", "experience": "Πραγματικό γεγονός / προσωπική εμπειρία", "knowledge": "Γνώση / ενημέρωση",
                "attitude": "Στάση / αντίληψη", "hypothetical_choice": "Υποθετική επιλογή", "intention": "Πρόθεση μελλοντικής συμπεριφοράς"}
_KW = [
    ("hypothetical_choice", r"ας υποθέσουμε|φανταστείτε|υποθετικ|σε περίπτωση που|αν (?:σας )?(?:πρότειναν|προσφερόταν|χαλούσε|καθυστερούσε)|ποια (?:από τις )?(?:επιλογ|προσφορ)"),
    ("experience", r"έχετε (?:ποτέ )?(?:αγοράσει|επισκεφθεί|χρησιμοποιήσει|επιστρέψει|αντιμετωπίσει|παραλάβει)|τους τελευταίους \d+|την τελευταία φορά|σας έχει (?:τύχει|συμβεί)|πόσες φορές"),
    ("knowledge", r"γνωρίζετε|έχετε ακούσει|ξέρετε|είστε ενήμερ"),
    ("intention", r"θα (?:αγοράζατε|αγοράσετε|συστήνατε|προτείνατε|ξαναψωνίζατε|επιλέγατε στο μέλλον)|σκοπεύετε|πρόθεση|πόσο πιθανό (?:είναι|θα ήταν) να"),
]


@dataclass
class Option:
    code: str
    label: str
    exclusive: bool = False


@dataclass
class Question:
    id: str
    text: str
    type: str
    block: str
    options: list = field(default_factory=list)
    intent: str = "attitude"
    intent_source: str = "explicit"
    condition: str | None = None
    screening: dict | None = None
    randomize_options: bool = False
    anchor: list = field(default_factory=list)
    min_choices: int = 1
    max_choices: int | None = None
    numeric: dict = field(default_factory=dict)
    scale: dict = field(default_factory=dict)
    scenario: dict | None = None
    dce: dict | None = None
    profile_field: str | None = None
    profile_map: dict = field(default_factory=dict)
    empirical_model: dict | None = None
    required: bool = True
    raw: dict = field(default_factory=dict)

    @property
    def codes(self):
        return [o.code for o in self.options]


@dataclass
class Questionnaire:
    id: str
    title: str
    language: str
    blocks: list
    questions: list
    meta: dict

    def by_id(self):
        return {q.id: q for q in self.questions}


def classify_intent(q: dict, qtype: str) -> tuple[str, str]:
    if q.get("intent"):
        if q["intent"] not in INTENTS:
            raise ValueError(f"{q['id']}: άγνωστο intent {q['intent']}")
        return q["intent"], "explicit"
    if q.get("profile_field"):
        return "demographic", "profile_field"
    if qtype in ("dce", "scenario"):
        return "hypothetical_choice", "type"
    text = (q.get("text", "") + " " + (q.get("scenario") or {}).get("text", "")).lower()
    for intent, pat in _KW:
        if re.search(pat, text):
            return intent, "keywords"
    return "attitude", "default"


def _options(q: dict) -> list:
    out = []
    for i, o in enumerate(q.get("options") or []):
        if isinstance(o, dict):
            out.append(Option(str(o.get("code", i + 1)), str(o["label"]), bool(o.get("exclusive", False))))
        else:
            out.append(Option(str(i + 1), str(o)))
    return out


def parse(spec: dict) -> Questionnaire:
    errs = []
    seen = set()
    qs, blocks = [], []
    for b in spec.get("blocks") or []:
        blocks.append({"id": b["id"], "title": b.get("title", b["id"]), "randomize_questions": bool(b.get("randomize_questions", False))})
        for q in b.get("questions") or []:
            qid = str(q.get("id", ""))
            if not qid:
                errs.append(f"Ερώτηση χωρίς id στο block {b['id']}")
                continue
            if qid in seen:
                errs.append(f"Διπλό id ερώτησης {qid}")
            seen.add(qid)
            qtype = q.get("type")
            if qtype not in TYPES:
                errs.append(f"{qid}: άγνωστος τύπος {qtype}")
                continue
            if not str(q.get("text", "")).strip():
                errs.append(f"{qid}: κενό κείμενο")
            opts = _options(q)
            if qtype == "likert" and not opts:
                sc = q.get("scale") or {}
                pts = int(sc.get("points", 5))
                lab = {str(k): v for k, v in (sc.get("labels") or {}).items()}
                opts = [Option(str(i), lab.get(str(i), str(i))) for i in range(1, pts + 1)]
            if qtype in ("single_choice", "multiple_choice", "likert", "ranking", "scenario") and len(opts) < 2:
                errs.append(f"{qid}: χρειάζονται τουλάχιστον 2 επιλογές")
            if len({o.code for o in opts}) != len(opts):
                errs.append(f"{qid}: διπλοί κωδικοί επιλογών")
            if qtype == "numeric":
                nm = q.get("numeric") or {}
                if "min" not in nm or "max" not in nm or nm["min"] >= nm["max"]:
                    errs.append(f"{qid}: numeric χρειάζεται min < max")
            if qtype == "dce":
                d = q.get("dce") or {}
                if not d.get("alternatives") or not d.get("attributes"):
                    errs.append(f"{qid}: dce χρειάζεται alternatives και attributes")
            if qtype == "scenario" and not (q.get("scenario") or {}).get("text"):
                errs.append(f"{qid}: scenario χρειάζεται scenario.text")
            intent, isrc = classify_intent(q, qtype)
            qs.append(Question(id=qid, text=str(q.get("text", "")).strip(), type=qtype, block=b["id"], options=opts, intent=intent, intent_source=isrc,
                               condition=q.get("condition"), screening=q.get("screening"), randomize_options=bool(q.get("randomize_options", False)),
                               anchor=[str(a) for a in q.get("anchor", [])], min_choices=int(q.get("min_choices", 1)), max_choices=q.get("max_choices"),
                               numeric=q.get("numeric") or {}, scale=q.get("scale") or {}, scenario=q.get("scenario"), dce=q.get("dce"),
                               profile_field=q.get("profile_field"), profile_map={str(k): str(v) for k, v in (q.get("profile_map") or {}).items()},
                               empirical_model=q.get("empirical_model"), required=bool((q.get("validation") or {}).get("required", True)), raw=q))
    ids = [q.id for q in qs]
    for i, q in enumerate(qs):
        if q.condition:
            try:
                refs = condition_refs(q.condition)
            except ValueError as e:
                errs.append(f"{q.id}: μη έγκυρη συνθήκη ({e})")
                continue
            for r in refs:
                if r not in ids:
                    errs.append(f"{q.id}: η συνθήκη αναφέρεται σε άγνωστη ερώτηση {r}")
                elif ids.index(r) >= i:
                    errs.append(f"{q.id}: η συνθήκη αναφέρεται σε μεταγενέστερη ερώτηση {r}")
    if errs:
        raise ValueError("Μη έγκυρο ερωτηματολόγιο:\n- " + "\n- ".join(errs))
    return Questionnaire(id=spec.get("questionnaire_id", "questionnaire"), title=spec.get("title", ""), language=spec.get("language", "el"),
                         blocks=blocks, questions=qs, meta={k: v for k, v in spec.items() if k != "blocks"})


def load(path) -> Questionnaire:
    return parse(load_structured(path))


# ------------------------------------------------------------------ skip logic: ασφαλής αξιολόγηση έκφρασης
_ALLOWED = (ast.Expression, ast.BoolOp, ast.And, ast.Or, ast.UnaryOp, ast.Not, ast.Compare, ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
            ast.In, ast.NotIn, ast.Name, ast.Constant, ast.List, ast.Tuple, ast.Load, ast.Call, ast.Attribute)
_FUNCS = {"answered", "contains", "count", "num"}


def _check(node):
    for n in ast.walk(node):
        if not isinstance(n, _ALLOWED):
            raise ValueError(f"μη επιτρεπτό στοιχείο {type(n).__name__}")
        if isinstance(n, ast.Call) and not (isinstance(n.func, ast.Name) and n.func.id in _FUNCS):
            raise ValueError("επιτρέπονται μόνο answered(), contains(), count(), num()")
        if isinstance(n, ast.Attribute) and not (isinstance(n.value, ast.Name) and n.value.id == "profile"):
            raise ValueError("επιτρέπεται μόνο profile.<πεδίο>")


def condition_refs(expr: str) -> set:
    tree = ast.parse(expr, mode="eval")
    _check(tree)
    refs = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Name) and n.id not in _FUNCS and n.id != "profile" and n.id not in ("True", "False", "None"):
            refs.add(n.id)
    return refs


def evaluate_condition(expr: str | None, answers: dict, profile: dict) -> bool:
    """answers: {qid: απάντηση} (κωδικός, λίστα κωδικών, αριθμός, κείμενο ή None αν δεν ρωτήθηκε)."""
    if not expr:
        return True
    tree = ast.parse(expr, mode="eval")
    _check(tree)

    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.BoolOp):
            vals = [ev(v) for v in n.values]
            return all(vals) if isinstance(n.op, ast.And) else any(vals)
        if isinstance(n, ast.UnaryOp):
            return not ev(n.operand)
        if isinstance(n, ast.Constant):
            return n.value
        if isinstance(n, (ast.List, ast.Tuple)):
            return [ev(e) for e in n.elts]
        if isinstance(n, ast.Name):
            return answers.get(n.id)
        if isinstance(n, ast.Attribute):
            return profile.get(n.attr)
        if isinstance(n, ast.Call):
            f = n.func.id
            args = [ev(a) for a in n.args]
            if f == "answered":
                return args[0] is not None
            if f == "contains":
                return args[0] is not None and str(args[1]) in [str(x) for x in (args[0] if isinstance(args[0], list) else [args[0]])]
            if f == "count":
                return len(args[0]) if isinstance(args[0], list) else (0 if args[0] is None else 1)
            if f == "num":
                return float(args[0]) if args[0] not in (None, "") else float("nan")
        if isinstance(n, ast.Compare):
            left = ev(n.left)
            for op, c in zip(n.ops, n.comparators):
                right = ev(c)
                if left is None and not isinstance(op, (ast.Eq, ast.NotEq, ast.In, ast.NotIn)):
                    return False
                if isinstance(op, (ast.In, ast.NotIn)):
                    if isinstance(left, list):
                        ok = any(str(x) in [str(r) for r in right] for x in left)
                    else:
                        ok = left is not None and str(left) in [str(r) for r in right]
                    ok = ok if isinstance(op, ast.In) else not ok
                elif isinstance(op, (ast.Eq, ast.NotEq)):
                    ok = (str(left) == str(right)) if left is not None else (right is None)
                    ok = ok if isinstance(op, ast.Eq) else not ok
                else:
                    lf, rf = float(left), float(right)
                    ok = {ast.Lt: lf < rf, ast.LtE: lf <= rf, ast.Gt: lf > rf, ast.GtE: lf >= rf}[type(op)]
                if not ok:
                    return False
                left = right
            return True
        raise ValueError(type(n).__name__)

    return bool(ev(tree))


# ------------------------------------------------------------------ τυχαιοποίηση και πειράματα επιλογής
def presented_options(q: Question, seed: int, study_id: str, rid: str) -> list:
    opts = list(q.options)
    if q.randomize_options:
        rng = np.random.default_rng(derive_seed(seed, study_id, rid, q.id, "order"))
        fixed = [o for o in opts if o.code in q.anchor]
        move = [o for o in opts if o.code not in q.anchor]
        move = [move[i] for i in rng.permutation(len(move))]
        opts = move + fixed
    return opts


def question_order(qn: Questionnaire, seed: int, study_id: str, rid: str) -> list:
    out = []
    for b in qn.blocks:
        qs = [q for q in qn.questions if q.block == b["id"]]
        if b["randomize_questions"]:
            # οι συνθήκες skip logic απαιτούν σειρά· τυχαιοποιούνται μόνο ερωτήσεις χωρίς εξαρτήσεις μέσα στο block
            dep = {q.id for q in qs if q.condition} | {r for q in qs if q.condition for r in condition_refs(q.condition)}
            free = [q for q in qs if q.id not in dep]
            rng = np.random.default_rng(derive_seed(seed, study_id, rid, b["id"], "qorder"))
            perm = [free[i] for i in rng.permutation(len(free))]
            it = iter(perm)
            qs = [next(it) if q.id not in dep else q for q in qs]
        out += qs
    return out


def dce_task(q: Question, seed: int, study_id: str, rid: str) -> dict:
    """Τυχαία (seeded) επίπεδα χαρακτηριστικών ανά ερωτώμενο· αποφεύγονται πανομοιότυπες εναλλακτικές."""
    d = q.dce
    rng = np.random.default_rng(derive_seed(seed, study_id, rid, q.id, "dce"))
    for _ in range(50):
        alts = []
        for a in d["alternatives"]:
            fixed = (a.get("fixed") or {}) if isinstance(a, dict) else {}
            lv = {k: (fixed[k] if k in fixed else v[int(rng.integers(len(v)))]) for k, v in d["attributes"].items()}
            alts.append({"id": a["id"] if isinstance(a, dict) else str(a), "label": a.get("label", a["id"]) if isinstance(a, dict) else str(a), "attributes": lv})
        sig = [tuple(sorted(x["attributes"].items())) for x in alts]
        if len(set(sig)) == len(sig):
            break
    if d.get("none_option"):
        alts.append({"id": "none", "label": d.get("none_label", "Καμία από αυτές"), "attributes": {}})
    return {"alternatives": alts}


# ------------------------------------------------------------------ έλεγχος απάντησης και schema δομημένης εξόδου
def validate_answer(q: Question, ans, task: dict | None = None) -> list:
    errs = []
    codes = [a["id"] for a in task["alternatives"]] if (q.type == "dce" and task) else q.codes
    if ans is None:
        return ["κενή απάντηση"] if q.required else []
    if q.type in ("single_choice", "likert", "scenario", "dce"):
        if str(ans) not in codes:
            errs.append(f"μη επιτρεπτή τιμή {ans}")
    elif q.type == "multiple_choice":
        if not isinstance(ans, list):
            return ["αναμενόταν λίστα"]
        if len(set(ans)) != len(ans):
            errs.append("διπλές επιλογές")
        if any(str(a) not in codes for a in ans):
            errs.append("μη επιτρεπτή επιλογή")
        mx = q.max_choices or len(codes)
        if not (q.min_choices <= len(ans) <= mx):
            errs.append(f"πλήθος επιλογών {len(ans)} εκτός [{q.min_choices}, {mx}]")
        excl = {o.code for o in q.options if o.exclusive}
        if len(ans) > 1 and excl & {str(a) for a in ans}:
            errs.append("αποκλειστική επιλογή μαζί με άλλες")
    elif q.type == "ranking":
        if not isinstance(ans, list) or len(set(map(str, ans))) != len(ans) or any(str(a) not in codes for a in ans):
            return ["μη έγκυρη κατάταξη"]
        k = int(q.raw.get("rank_k", len(codes)))
        if isinstance(ans, list) and len(ans) != k:
            errs.append(f"η κατάταξη πρέπει να έχει {k} στοιχεία")
    elif q.type == "numeric":
        try:
            v = float(ans)
        except (TypeError, ValueError):
            return ["μη αριθμητική τιμή"]
        if not (q.numeric["min"] <= v <= q.numeric["max"]):
            errs.append(f"τιμή {v} εκτός [{q.numeric['min']}, {q.numeric['max']}]")
        if q.numeric.get("integer") and not float(v).is_integer():
            errs.append("απαιτείται ακέραιος")
    elif q.type == "open":
        if not isinstance(ans, str) or not ans.strip():
            errs.append("κενό κείμενο")
        elif len(ans) > int(q.raw.get("max_chars", 600)):
            errs.append("υπερβολικά μεγάλο κείμενο")
    return errs


def response_schema(q: Question, codes: list) -> dict:
    """JSON schema για το LLM: ΚΑΤΑΝΟΜΗ πιθανοτήτων (το σύστημα κληρώνει την απάντηση με seed), ή κείμενο για open."""
    rationale = {"type": "string", "description": "Σύντομη, ελέγξιμη αιτιολόγηση (έως 30 λέξεις), χωρίς εσωτερική συλλογιστική."}
    if q.type in ("single_choice", "likert", "scenario", "dce"):
        props = {"probabilities": {"type": "object", "properties": {c: {"type": "number"} for c in codes}, "required": codes, "additionalProperties": False},
                 "rationale": rationale}
    elif q.type == "multiple_choice":
        props = {"inclusion_probabilities": {"type": "object", "properties": {c: {"type": "number"} for c in codes}, "required": codes, "additionalProperties": False},
                 "rationale": rationale}
    elif q.type == "ranking":
        props = {"importance_scores": {"type": "object", "properties": {c: {"type": "number"} for c in codes}, "required": codes, "additionalProperties": False},
                 "rationale": rationale}
    elif q.type == "numeric":
        props = {"low": {"type": "number"}, "typical": {"type": "number"}, "high": {"type": "number"}, "rationale": rationale}
    else:
        props = {"text": {"type": "string"}, "rationale": rationale}
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}
