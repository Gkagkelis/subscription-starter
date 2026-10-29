"""
PHASE4 IQGE: πολυγλωσσικές σημασιολογικές αναπαραστάσεις ερωτήσεων (εκτός σύνδεσης).

Μοντέλο: intfloat/multilingual-e5-small (MIT), ONNX quantized (Xenova), στο ιδιωτικό
.synthetic-lab-data/persona/embed/e5-small/ — δεν χρειάζεται διαδίκτυο στην εκτέλεση.
Η ομοιότητα χρησιμοποιείται ΜΟΝΟ για ανάκτηση υποψήφιων τεκμηρίων· δεν θεωρείται απόδειξη ίδιας κατανομής απαντήσεων.

  python3 scripts/synthetic-lab/persona/embed.py --root . items --model pie-0.4   # embeddings όλων των items του μοντέλου
"""
import argparse
import json
import os
import re

import numpy as np

MAX_LEN = 128


class Embedder:
    def __init__(self, root):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        d = os.path.join(root, ".synthetic-lab-data", "persona", "embed", "e5-small")
        self.tok = Tokenizer.from_file(os.path.join(d, "tokenizer.json"))
        self.tok.enable_truncation(MAX_LEN)
        self.tok.enable_padding(length=None)
        so = ort.SessionOptions()
        so.intra_op_num_threads = 2
        self.sess = ort.InferenceSession(os.path.join(d, "onnx", "model_quantized.onnx"), so, providers=["CPUExecutionProvider"])
        self.inputs = {i.name for i in self.sess.get_inputs()}

    def encode(self, texts, prefix="query: ", batch=64):
        out = []
        for i in range(0, len(texts), batch):
            enc = self.tok.encode_batch([prefix + clean(t) for t in texts[i:i + batch]])
            ids = np.array([e.ids for e in enc], dtype=np.int64)
            mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
            feed = {"input_ids": ids, "attention_mask": mask}
            if "token_type_ids" in self.inputs:
                feed["token_type_ids"] = np.zeros_like(ids)
            h = self.sess.run(None, feed)[0]
            v = (h * mask[:, :, None]).sum(1) / np.maximum(mask.sum(1, keepdims=True), 1)
            out.append(v / np.linalg.norm(v, axis=1, keepdims=True))
        return np.vstack(out) if out else np.zeros((0, 384))


def clean(t):
    t = re.sub(r"\[(1η|2η)\s*ΕΠΙΛΟΓΗ\]", " ", t or "")
    t = re.sub(r"^\s*[A-Z]?\d+[._)]?\s*[A-Z]?\d*[._)]?\s*", "", t)
    return re.sub(r"\s+", " ", t).strip()


def item_text(it, with_options=True):
    t = it["text"]
    if with_options:
        t += " | " + " / ".join(o["label"] for o in it.get("options", [])[:12])
    return t


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("cmd", choices=["items", "test"])
    ap.add_argument("--model", default="pie-0.4")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    E = Embedder(root)
    if a.cmd == "test":
        s = ["Πόσο εμπιστεύεστε τη Βουλή;", "How much do you trust the national parliament?", "Καπνίζετε;", "Do you smoke?",
             "Πόσο ικανοποιημένος είστε με τη λειτουργία της δημοκρατίας;", "On the whole, how satisfied are you with the way democracy works?"]
        V = E.encode(s)
        print(np.round(V @ V.T, 2))
    else:
        items = json.load(open(os.path.join(root, ".synthetic-lab-data/persona/models", a.model, "items.json")))
        V = E.encode([item_text(i) for i in items])
        d = os.path.join(root, ".synthetic-lab-data/persona/models", a.model)
        np.save(os.path.join(d, "item_embeddings.npy"), V.astype(np.float32))
        json.dump([i["id"] for i in items], open(os.path.join(d, "item_embeddings_ids.json"), "w"))
        print(V.shape)
