"""Mock provider για tests και dry runs ΧΩΡΙΣ κόστος.

ΔΕΝ είναι ερευνητικό μοντέλο: παράγει έγκυρες, αιτιοκρατικές (από hash του prompt) κατανομές ώστε να δοκιμάζεται η
υποδομή (parsing, έλεγχοι, skip logic, audit, αναφορές). Οι αριθμοί που προκύπτουν από mock runs δεν έχουν ερευνητική αξία
και σημαίνονται MOCK_PROVIDER σε όλα τα αρχεία. Υποστηρίζει έγχυση σφαλμάτων για έλεγχο retry/resume."""
from __future__ import annotations

import json

import numpy as np

from ..util import derive_seed
from .base import LLMProvider, LLMResult, ProviderError


def _range_for(user: str, lo=0.0, hi=100.0):
    try:
        lo, hi = [float(x) for x in user.split("ΕΥΡΟΣ:")[1].split("\n")[0].strip().split("–")]
    except Exception:
        pass
    return lo, hi


class MockProvider(LLMProvider):
    name = "mock"

    def __init__(self, model="mock-1", transient_fail_every: int = 0, permanent_fail_on: tuple = (), invalid_every: int = 0, **kw):
        super().__init__(model, **kw)
        self.calls = 0
        self.transient_fail_every, self.permanent_fail_on, self.invalid_every = transient_fail_every, tuple(permanent_fail_on), invalid_every

    def available(self):
        return True, "mock (χωρίς ερευνητική αξία)"

    def _one(self, props, rng, user):
        out = {}
        for k, spec in props.items():
            if k in ("probabilities", "inclusion_probabilities", "importance_scores"):
                codes = list(spec["properties"])
                p = rng.dirichlet(np.ones(len(codes)) * 1.5)
                if k == "inclusion_probabilities":
                    p = np.clip(p * len(codes) * 0.4, 0, 1)
                out[k] = {c: round(float(x), 4) for c, x in zip(codes, p)}
            elif k == "text":
                out[k] = "Συνθετική απάντηση mock για δοκιμή υποδομής."
            elif k == "rationale":
                out[k] = "mock: χωρίς ερευνητική αιτιολόγηση"
        if "typical" in props:
            lo, hi = _range_for(user)
            t = float(rng.uniform(lo, hi))
            out.update(low=round(max(lo, t - (hi - lo) * 0.1), 2), typical=round(t, 2), high=round(min(hi, t + (hi - lo) * 0.1), 2))
        return out

    def generate(self, system, user, schema, max_tokens=2000):
        self.calls += 1
        if self.transient_fail_every and self.calls % self.transient_fail_every == 0:
            raise ProviderError("mock: προσωρινό σφάλμα 529", retryable=True, status=529)
        if any(tok in user for tok in self.permanent_fail_on):
            raise ProviderError("mock: μόνιμο σφάλμα 400", retryable=False, status=400)
        rng = np.random.default_rng(derive_seed("mock", system, user))
        props = schema["properties"]
        # σύνθετο schema {id ερώτησης: υπο-schema} ή απλό schema μίας ερώτησης
        nested = all(isinstance(v, dict) and v.get("type") == "object" and "properties" in v for v in props.values())
        out = {k: self._one(v["properties"], rng, user) for k, v in props.items()} if nested else self._one(props, rng, user)
        text = json.dumps(out, ensure_ascii=False)
        if self.invalid_every and self.calls % self.invalid_every == 0:
            text = text[:-5]
            raise ProviderError("mock: μη έγκυρο JSON", retryable=True)
        return LLMResult(parsed=out, text=text, input_tokens=int(len(system + user) / 2.5), output_tokens=int(len(text) / 2.5) + 20,
                         model=self.model, model_version="mock-1.0", provider=self.name, request_id=f"mock-{self.calls}", stop_reason="end_turn")
