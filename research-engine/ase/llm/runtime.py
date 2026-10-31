"""Runtime κλήσεων LLM: rate limiting, retry με εκθετικό backoff + jitter, προϋπολογισμός, καταμέτρηση tokens/κόστους,
εκτίμηση κόστους πριν από την εκτέλεση, factory παρόχων."""
from __future__ import annotations

import random
import threading
import time
from pathlib import Path

import jsonschema

from ..paths import ENGINE_ROOT
from ..util import load_structured
from .anthropic_provider import AnthropicProvider
from .base import BudgetExceeded, LLMResult, ProviderError
from .mock import MockProvider
from .other_providers import GeminiProvider, OpenAIProvider
from .session_provider import ClaudeSessionProvider

PROVIDERS = {"anthropic": AnthropicProvider, "openai": OpenAIProvider, "google": GeminiProvider, "mock": MockProvider, "claude_session": ClaudeSessionProvider}
CHARS_PER_TOKEN = 2.5        # συντηρητική παραδοχή για ελληνικό κείμενο· αντικαθίσταται από μετρήσεις dry run όταν υπάρχουν


def make_provider(cfg: dict):
    name = cfg.get("provider", "mock")
    if name not in PROVIDERS:
        raise ValueError(f"Άγνωστος πάροχος {name} (διαθέσιμοι: {', '.join(PROVIDERS)})")
    kw = {k: v for k, v in cfg.items() if k not in ("provider", "model")}
    if cfg.get("model"):
        return PROVIDERS[name](cfg["model"], **kw)
    if name in ("mock", "claude_session"):
        return PROVIDERS[name](**kw)                 # προεπιλεγμένη ετικέτα του ίδιου του παρόχου (ποτέ «mock-1» σε μη-mock)
    raise ValueError(f"Ο πάροχος {name} χρειάζεται ρητό μοντέλο (--model)")


class Pricing:
    def __init__(self, path: Path | None = None):
        self.cfg = load_structured(path or ENGINE_ROOT / "config" / "llm_pricing.yaml")

    def rate(self, provider: str, model: str):
        r = (self.cfg.get("providers", {}).get(provider) or {}).get(model)
        return None if not r else (float(r["input_per_mtok"]), float(r["output_per_mtok"]))

    def cost(self, provider, model, tin, tout):
        r = self.rate(provider, model)
        return None if r is None else (tin * r[0] + tout * r[1]) / 1e6


class RateLimiter:
    def __init__(self, per_minute: float):
        self.interval = 60.0 / per_minute if per_minute else 0.0
        self.lock = threading.Lock()
        self.next_t = 0.0

    def wait(self, sleep=time.sleep, now=time.monotonic):
        if not self.interval:
            return
        with self.lock:
            t = now()
            start = max(t, self.next_t)
            self.next_t = start + self.interval
        if start > t:
            sleep(start - t)


class Ledger:
    """Καταμέτρηση tokens/κόστους με όριο προϋπολογισμού (thread-safe)."""

    def __init__(self, pricing: Pricing, provider: str, model: str, budget_usd: float | None):
        self.pricing, self.provider, self.model, self.budget = pricing, provider, model, budget_usd
        self.lock = threading.Lock()
        self.calls = self.tin = self.tout = self.failed = 0
        self.cost = 0.0
        self.unpriced = pricing.rate(provider, model) is None

    def reserve(self, est_in: int, est_out: int):
        if self.budget is None:
            return
        if self.unpriced:
            raise BudgetExceeded(f"Δεν υπάρχει τιμή για {self.provider}/{self.model}· ορίστε τη στο config/llm_pricing.yaml πριν από εκτέλεση με όριο.")
        est = self.pricing.cost(self.provider, self.model, est_in, est_out)
        with self.lock:
            if self.cost + est > self.budget:
                raise BudgetExceeded(f"Το όριο προϋπολογισμού {self.budget} USD θα ξεπερνιόταν (τρέχον {self.cost:.4f} + εκτίμηση {est:.4f}).")

    def add(self, res: LLMResult | None, failed=False):
        with self.lock:
            if failed:
                self.failed += 1
                return
            self.calls += 1
            self.tin += res.input_tokens
            self.tout += res.output_tokens
            c = self.pricing.cost(self.provider, self.model, res.input_tokens, res.output_tokens)
            self.cost += c or 0.0

    def summary(self):
        return {"provider": self.provider, "model": self.model, "calls": self.calls, "failed_calls": self.failed, "input_tokens": self.tin,
                "output_tokens": self.tout, "cost_usd": None if self.unpriced else round(self.cost, 6), "budget_usd": self.budget}


def call_with_retry(provider, system, user, schema, *, max_tokens=1500, max_attempts=5, base_delay=1.0, max_delay=60.0, limiter: RateLimiter | None = None,
                    ledger: Ledger | None = None, semantic_check=None, sleep=time.sleep, rng=random.Random(0)):
    """Επιστρέφει (result | None, attempts). attempts: [{attempt, error, retryable, delay}] για το audit."""
    attempts = []
    est_in = int(len(system + user) / CHARS_PER_TOKEN)
    for k in range(1, max_attempts + 1):
        if ledger:
            ledger.reserve(est_in, max_tokens // 4)
        if limiter:
            limiter.wait(sleep=sleep)
        try:
            res = provider.generate(system, user, schema, max_tokens=max_tokens)
            jsonschema.validate(res.parsed, schema)
            if semantic_check:
                err = semantic_check(res.parsed)
                if err:
                    raise ProviderError(f"σημασιολογικά μη έγκυρη έξοδος: {err}", retryable=True)
            if ledger:
                ledger.add(res)
            attempts.append({"attempt": k, "ok": True})
            return res, attempts
        except jsonschema.ValidationError as e:
            err, retryable, ra = f"schema: {e.message}", True, None
        except ProviderError as e:
            err, retryable, ra = str(e), e.retryable, e.retry_after
        if ledger:
            ledger.add(None, failed=True)
        delay = min(max_delay, ra if ra else base_delay * (2 ** (k - 1))) * (1 + 0.25 * rng.random())
        attempts.append({"attempt": k, "ok": False, "error": err[:300], "retryable": retryable, "delay_s": round(delay, 2) if retryable and k < max_attempts else 0})
        if not retryable or k == max_attempts:
            return None, attempts
        sleep(delay)
    return None, attempts
