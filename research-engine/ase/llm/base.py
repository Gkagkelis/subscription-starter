"""Αφηρημένος πάροχος LLM, αποτελέσματα, σφάλματα. Οι adapters (Anthropic, OpenAI, Google, mock) υλοποιούν generate()."""
from __future__ import annotations

from dataclasses import dataclass, field


class ProviderError(Exception):
    def __init__(self, msg: str, retryable: bool = False, status: int | None = None, retry_after: float | None = None):
        super().__init__(msg)
        self.retryable, self.status, self.retry_after = retryable, status, retry_after


class ProviderUnavailable(Exception):
    """Ο πάροχος δεν μπορεί να λειτουργήσει (λείπει SDK ή credentials)."""


class BudgetExceeded(Exception):
    pass


@dataclass
class LLMResult:
    parsed: dict
    text: str
    input_tokens: int
    output_tokens: int
    model: str
    model_version: str
    provider: str
    request_id: str | None = None
    stop_reason: str | None = None
    meta: dict = field(default_factory=dict)


class LLMProvider:
    name = "base"

    def __init__(self, model: str, **kw):
        self.model = model
        self.options = kw

    def available(self) -> tuple[bool, str]:
        return False, "μη υλοποιημένος πάροχος"

    def generate(self, system: str, user: str, schema: dict, max_tokens: int = 2000) -> LLMResult:
        raise NotImplementedError

    def describe(self) -> dict:
        return {"provider": self.name, "model": self.model, "options": {k: v for k, v in self.options.items() if "key" not in k.lower()}}
