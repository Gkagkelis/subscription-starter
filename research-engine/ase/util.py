"""Βοηθητικά: σταθερά seeds, hashing, αποθήκευση πινάκων (Parquet αν υπάρχει pyarrow, αλλιώς CSV.gz), χρόνος."""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
from pathlib import Path

import pandas as pd


def derive_seed(*parts) -> int:
    """Αιτιοκρατικός seed από οποιαδήποτε στοιχεία (π.χ. seed μελέτης, study_id, respondent_id, question_id)."""
    return int(hashlib.sha256("|".join(map(str, parts)).encode("utf-8")).hexdigest()[:15], 16)


def sha256_file(p) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parquet_available() -> bool:
    try:
        import pyarrow  # noqa: F401
        return True
    except Exception:
        return False


def write_table(df: pd.DataFrame, path_without_ext: Path) -> Path:
    """Parquet όταν υπάρχει pyarrow· αλλιώς CSV.gz με το ίδιο schema. Επιστρέφει την πραγματική διαδρομή."""
    path_without_ext.parent.mkdir(parents=True, exist_ok=True)
    if parquet_available():
        p = path_without_ext.with_suffix(".parquet")
        df.to_parquet(p, index=False)
    else:
        p = path_without_ext.with_suffix(".csv.gz")
        df.to_csv(p, index=False, compression="gzip")
    return p


def read_table(path_without_ext: Path) -> pd.DataFrame:
    for ext in (".parquet", ".csv.gz", ".csv"):
        p = path_without_ext.with_suffix(ext)
        if p.exists():
            return pd.read_parquet(p) if ext == ".parquet" else pd.read_csv(p, dtype=str, keep_default_na=False)
    raise FileNotFoundError(path_without_ext)


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1, default=str), encoding="utf-8")


def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_structured(path) -> dict:
    """YAML ή JSON ανάλογα με την κατάληξη."""
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if p.suffix.lower() in (".yaml", ".yml"):
        import yaml
        return yaml.safe_load(text)
    return json.loads(text)
