"""Γέφυρα ASE → Lab (TypeScript). Ενιαία κατάσταση ερωτώμενου: το ASE κρατά τα IDs, τους σπόρους και το ιστορικό· το Lab
καλείται ως υπηρεσία για (α) δρομολόγηση/βαθμίδα τεκμηρίωσης ανά ερώτηση, (β) άγκυρες PIE για ΤΑ ΙΔΙΑ πρόσωπα,
(γ) εμπειρικές απαντήσεις PIE όπου η πολιτική τεκμηρίωσης του Lab το επιτρέπει.

Κάθε κλήση αποθηκεύεται σε cache με κλειδί το hash (εντολή + είσοδος + κώδικας γέφυρας + αρχεία μοντέλου): αλλαγή
δεδομένων/μοντέλου/κώδικα ακυρώνει αυτόματα την cache. Σφάλματα: LabUnavailable (λείπει node/μοντέλο) ≠ LabBridgeError
(η κλήση απέτυχε) — ποτέ σιωπηρή μετατροπή σε «δεν υπάρχουν δεδομένα»."""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from ..paths import ASE_DATA, DATA_ROOT, REPO_ROOT

BRIDGE_TS = REPO_ROOT / "scripts" / "synthetic-lab" / "bridge" / "lab_bridge.ts"
CACHE = ASE_DATA / "cache" / "lab"
ANCHOR_LABELS = {
    "emp": {"private_emp": "μισθωτός/ή ιδιωτικού τομέα", "public_emp": "δημόσιος υπάλληλος", "self_emp": "αυτοαπασχολούμενος/η", "farmer": "αγρότης/ισσα",
            "employed": "εργαζόμενος/η", "unemployed": "άνεργος/η", "retired": "συνταξιούχος", "student": "φοιτητής/τρια", "homemaker": "οικιακά", "other": "άλλο"},
    "econ4": {1: "δεν τα βγάζει πέρα", 2: "τα βγάζει πέρα με δυσκολία", 3: "τα βγάζει πέρα χωρίς να περισσεύουν", 4: "τα βγάζει πέρα άνετα"},
    "class3": {1: "χαμηλή", 2: "μεσαία", 3: "υψηλή"},
    "inc6": {1: "έως 500 €", 2: "501–1.000 €", 3: "1.001–1.500 €", 4: "1.501–2.000 €", 5: "2.001–3.000 €", 6: "πάνω από 3.000 €"},
}
ANCHOR_COLS = ["emp", "inc6", "econ4", "class3", "lr7", "lr_none", "pv", "believer", "polint4"]


class LabUnavailable(RuntimeError):
    """Δεν μπορεί να κληθεί το Lab (λείπει node/tsx ή το μοντέλο PIE). Η μελέτη πρέπει να το καταγράψει, όχι να το αγνοήσει."""


class LabBridgeError(RuntimeError):
    """Η κλήση στο Lab απέτυχε (σφάλμα εκτέλεσης ή μη έγκυρη έξοδος)."""


def _fingerprint(model: str) -> str:
    h = hashlib.sha256(BRIDGE_TS.read_bytes())
    mdir = DATA_ROOT / "persona" / "models" / model
    for f in sorted(mdir.glob("*.json")) if mdir.exists() else []:
        st = f.stat()
        h.update(f"{f.name}:{st.st_size}:{int(st.st_mtime)}".encode())
    pol = REPO_ROOT / "config" / "synthetic-lab" / "persona" / "gpm" / "evidence-tiers.json"
    if pol.exists():
        h.update(pol.read_bytes())
    return h.hexdigest()


def available(model: str) -> tuple[bool, str]:
    if not shutil.which("npx"):
        return False, "λείπει το npx (Node.js)"
    if not BRIDGE_TS.exists():
        return False, f"λείπει {BRIDGE_TS}"
    if not (DATA_ROOT / "persona" / "models" / model / "model.json").exists():
        return False, f"λείπει το μοντέλο PIE {model}"
    return True, "ok"


def call(cmd: str, payload: dict, *, timeout: int = 600, use_cache: bool = True) -> dict:
    model = payload.get("model", "")
    ok, why = available(model)
    if not ok:
        raise LabUnavailable(why)
    key = hashlib.sha256((cmd + "\0" + json.dumps(payload, sort_keys=True, ensure_ascii=False) + "\0" + _fingerprint(model)).encode()).hexdigest()
    cp = CACHE / f"{cmd}-{key[:32]}.json"
    if use_cache and cp.exists():
        return json.loads(cp.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as td:
        i, o = Path(td) / "in.json", Path(td) / "out.json"
        i.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        try:
            subprocess.run(["npx", "tsx", str(BRIDGE_TS), cmd, str(i), str(o)], cwd=REPO_ROOT, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired as e:
            raise LabBridgeError(f"{cmd}: λήξη χρόνου {timeout}s") from e
        if not o.exists():
            raise LabBridgeError(f"{cmd}: καμία έξοδος από τη γέφυρα")
        res = json.loads(o.read_text(encoding="utf-8"))
    if not res.get("ok"):
        err = str(res.get("error", ""))
        if err.startswith("MODEL_UNAVAILABLE"):
            raise LabUnavailable(err)
        raise LabBridgeError(f"{cmd}: {err}")
    CACHE.mkdir(parents=True, exist_ok=True)
    tmp = cp.with_suffix(".tmp")
    tmp.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
    tmp.replace(cp)                                                   # ατομική εγγραφή
    return res


# ---------------------------------------------------------------- μετατροπή ερωτήσεων ASE → Lab
LAB_TYPE = {"single_choice": "single_choice", "scenario": "single_choice", "dce": "single_choice", "likert": "likert",
            "multiple_choice": "multiple_choice", "ranking": "ranking", "numeric": "open_ended", "open": "open_ended"}


def to_lab_question(q) -> dict:
    text = q.text if not q.scenario else f"{q.scenario['text']} {q.text}"
    labels = [o.label for o in q.options]
    if q.type == "dce":
        labels = [a["label"] for a in q.raw["dce"]["alternatives"]] + (["Καμία από τις δύο"] if q.raw["dce"].get("none_option") else [])
    d = {"id": q.id, "type": LAB_TYPE[q.type], "text": text}
    if q.type == "likert":
        d["scale"] = labels
    else:
        d["options"] = labels
    if q.raw.get("lab_person_link"):                                    # χειροκίνητη σύνδεση με item του PIE (από τον ερευνητή)
        d["personaLink"] = q.raw["lab_person_link"]
    return d


def lab_route(questionnaire, model: str, ref: str) -> dict:
    return call("route", {"model": model, "ref": ref, "questions": [to_lab_question(q) for q in questionnaire.questions]})


def respondent_payload(p: dict, seed: int) -> dict:
    return {"id": p["respondent_id"], "seed": int(seed) % (2 ** 31), "age_band": str(p.get("age_band")), "gender": str(p.get("gender")),
            "education": str(p.get("education")), "region_code": str(p.get("region_code")), "settlement": str(p.get("settlement")),
            "income_quintile": p.get("income_quintile"), "household_size": str(p.get("household_size"))}
