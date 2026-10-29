"""
PHASE5 — αντιστοίχιση νέας ερώτησης με ΙΣΟΔΥΝΑΜΗ ερώτηση της διεθνούς βάσης (σενάριο S1, επικυρωμένο στο τελικό holdout)
και κατασκευή του επιπέδου/μετατοπίσεων υποομάδων για το IqgeLink. Ίδιοι κανόνες ισοδυναμίας με την αξιολόγηση:
ομοιότητα ≥ 0,85, ίδιο πλήθος επιλογών, συνεπές επιμέρους θέμα, ομοιότητα κλίμακας ≥ 0,8 (προσανατολισμός από τις ετικέτες άκρων).
"""
import json
import os

import numpy as np

from eval_unseen import OptVecs, scale_sim, split_spec

AGE3_BANDS = {"y": ["17-24", "25-34"], "m": ["35-44", "45-54"], "o": ["55-64", "65+"]}
RIDIT_PER_Z = 0.282  # μέση μεταβολή ridit ανά μονάδα μετατόπισης λανθάνουσας N(0,1)
SEEN_MAE = 5.4  # ίδια ερώτηση με πραγματικά ελληνικά δεδομένα (Phase 3, διαΝΕΟσις 2024)


class GlobalMatcher:
    def __init__(self, root, E):
        d = os.path.join(root, ".synthetic-lab-data", "global-behavior-evidence", "v1", "runtime")
        pkg = json.load(open(os.path.join(d, "gbt-items.json")))
        self.version = pkg["version"]
        self.items = pkg["items"]
        self.V = np.load(os.path.join(d, "gbt-items-emb.npy"))
        self.E = E
        self.OV = OptVecs(E)
        self.spec = [split_spec(x["text"])[1] for x in self.items]

    def match(self, t):
        import embed

        v = self.E.encode([embed.item_text(t)])[0]
        sims = self.V @ v
        K = len(t["options"])
        st = split_spec(t["text"])[1]
        At = self.OV(t)
        best = None
        for j in np.argsort(-sims)[:20]:
            if sims[j] < 0.85:
                break
            it = self.items[j]
            if len(it["options"]) != K:
                continue
            sj = self.spec[j]
            if (st is None) != (sj is None):
                continue
            if st and sj:
                a, b = self.E.encode([st, sj])
                if float(a @ b) < 0.8:
                    continue
            ss, sg = scale_sim(At, self.OV(it))
            if ss < 0.8:
                continue
            best = (float(sims[j]), sg, it)
            break
        return best

    def link_parts(self, m, option_labels):
        sim, sg, it = m
        lv = np.array(it["level"])
        if sg < 0:
            lv = lv[::-1]
        shift = {}
        for k, gap in it["gaps"].items():
            dim, val = k.split(":", 1)
            z = (gap if sg > 0 else -gap) / RIDIT_PER_Z
            if dim == "a3":
                for b in AGE3_BANDS.get(val, []):
                    shift[f"age_band:{b}"] = round(z, 4)
            else:
                shift[f"{dim}:{val}"] = round(z, 4)
        q = it["q80"]
        exp = it["expectedMAE"] if it["expectedMAE"] is not None else SEEN_MAE
        return {"level": {o: round(float(x), 5) for o, x in zip(option_labels, lv)},
                "int80": {o: [round(max(0.0, x * 100 - q), 1), round(min(100.0, x * 100 + q), 1)] for o, x in zip(option_labels, lv)},
                "groupShift": shift or None, "expectedMAE": exp,
                "international": {"basis": it["basis"], "countries": it["countries"], "survey": it["survey"], "itemId": it["id"]},
                "evidence": [{"id": it["id"], "sim": round(sim, 3), "text": it["text"][:120], "weight": 1.0}]}


def extend_iqge(G, root):
    """PHASE5 S2 (staged): προσθήκη των διεθνών items στη βάση τεκμηρίων του IQGE, όπως στην κλειδωμένη παραλλαγή C
    (ελληνικό επίπεδο: πραγματικό περιθώριο ή levelC). Οι έρευνες που ήδη υπάρχουν στην ελληνική βάση (ESS10/11) παραλείπονται."""
    from gbt_s2 import BANK_FILE, extend_lake

    pkg = json.load(open(os.path.join(root, ".synthetic-lab-data", "global-behavior-evidence", "v1", "runtime", "gbt-items.json")))
    have = set(G.lake_ids.tolist())
    items, marg = [], {}
    for x in pkg["items"]:
        if x["survey"] in BANK_FILE or x["id"] in have or "levelC" not in x:
            continue
        items.append({"id": x["id"], "var": x.get("var") or x["id"].split("::")[-1], "text": x["text"], "options": x["options"], "type": x["type"], "file": x["survey"], "wave": x["wave"], "family": f"g:{x['id']}"})
        marg[x["id"]] = {"n": x.get("nGR", 0), "dist": x["levelC"]}
    return len(extend_lake(G, items, marg))
