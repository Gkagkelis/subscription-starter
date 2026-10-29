"""
PHASE7A — σφράγιση πραγματικών απαντήσεων (τεχνική απομόνωση πρόβλεψης/βαθμολόγησης).

  python3 -I scripts/synthetic-lab/p7a/p7a_seal.py seal  --survey <id> --answers <plaintext.json>   (διαγράφει το plaintext)
  python3 -I scripts/synthetic-lab/p7a/p7a_seal.py check --questionnaire <q.json>                  (κανένα αποτέλεσμα στο ερωτηματολόγιο)
  python3 -I scripts/synthetic-lab/p7a/p7a_seal.py open  --survey <id>                             (ΜΟΝΟ από τη βαθμολόγηση)

Απομόνωση:
  - sealed/ και keys/ έχουν δικαιώματα 700 (root)· η πρόβλεψη τρέχει ως χρήστης p7apred, που ΔΕΝ μπορεί να τα διαβάσει·
  - οι απαντήσεις κρυπτογραφούνται (AES-256-CBC, PBKDF2) με τυχαίο κλειδί ανά έρευνα· το plaintext διαγράφεται·
  - το sealed_manifest.json (μόνο sha256, χωρίς τιμές) είναι αναγνώσιμο και δεσμεύει το περιεχόμενο πριν από τις προβλέψεις.
"""
import argparse
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
P = os.path.join(ROOT, ".synthetic-lab-data", "p7a")
NUM_RE = re.compile(r"\d+([.,]\d+)?\s?%|ποσοστό\s+\d|\b(πλειοψηφία|majority)\b", re.I)


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def seal(sid, plain):
    d = json.load(open(plain))
    assert d.get("surveyId") == sid and d.get("items"), "λάθος μορφή απαντήσεων"
    key = secrets.token_hex(32)
    kp = os.path.join(P, "keys", f"{sid}.key")
    with open(os.open(kp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        f.write(key)
    out = os.path.join(P, "sealed", f"{sid}.answers.enc")
    subprocess.run(["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-in", plain, "-out", out, "-pass", f"file:{kp}"], check=True)
    os.chmod(out, 0o600)
    plain_sha = sha(plain)
    os.remove(plain)
    mp = os.path.join(P, "sealed_manifest.json")
    m = json.load(open(mp)) if os.path.exists(mp) else {"surveys": {}}
    m["surveys"][sid] = {"sealedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "plaintextSha256": plain_sha, "encryptedSha256": sha(out), "nItems": len(d["items"])}
    json.dump(m, open(mp, "w"), indent=1)
    print("σφραγίστηκε", sid, len(d["items"]), "ερωτήσεις")


def check(q):
    d = json.load(open(q))
    bad = []
    for it in d["questions"]:
        txt = json.dumps(it, ensure_ascii=False)
        if NUM_RE.search(txt):
            bad.append(it["qid"])
        for k in ("shares", "result", "results", "pct", "percent", "value"):
            if k in it:
                bad.append(f"{it['qid']}:{k}")
    if bad:
        sys.exit(f"Το ερωτηματολόγιο περιέχει πιθανά αποτελέσματα: {bad}")
    print("ok", d["surveyId"], len(d["questions"]), "ερωτήσεις")


def open_sealed(sid):
    kp = os.path.join(P, "keys", f"{sid}.key")
    out = os.path.join(P, "sealed", f"{sid}.answers.enc")
    r = subprocess.run(["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-in", out, "-pass", f"file:{kp}"], check=True, capture_output=True)
    m = json.load(open(os.path.join(P, "sealed_manifest.json")))
    assert hashlib.sha256(r.stdout).hexdigest() == m["surveys"][sid]["plaintextSha256"], "το σφραγισμένο αρχείο άλλαξε"
    return json.loads(r.stdout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["seal", "check", "open"])
    ap.add_argument("--survey")
    ap.add_argument("--answers")
    ap.add_argument("--questionnaire")
    a = ap.parse_args()
    if a.cmd == "seal":
        seal(a.survey, a.answers)
    elif a.cmd == "check":
        check(a.questionnaire)
    else:
        json.dump(open_sealed(a.survey), sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
