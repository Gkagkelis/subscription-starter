"""Anthropic Claude μέσω του επίσημου Python SDK (`pip install anthropic`). Δομημένη έξοδος: output_config.format
(json_schema). Credentials: ANTHROPIC_API_KEY ή προφίλ `ant auth login` (το SDK τα επιλύει). Τα retries γίνονται από τον
runtime του ASE (max_retries=0 στο SDK) ώστε κάθε προσπάθεια να καταγράφεται στο audit."""
from __future__ import annotations

import json
import os

from .base import LLMProvider, LLMResult, ProviderError, ProviderUnavailable


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def available(self):
        try:
            import anthropic  # noqa: F401
        except Exception:
            return False, "Λείπει το Python SDK: pip install anthropic"
        if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_PROFILE")):
            return False, "Δεν βρέθηκαν credentials (ANTHROPIC_API_KEY ή `ant auth login`)"
        return True, "ok"

    def _client(self):
        try:
            import anthropic
        except Exception as e:
            raise ProviderUnavailable("pip install anthropic") from e
        if not hasattr(self, "_c"):
            self._c = anthropic.Anthropic(max_retries=0, timeout=float(self.options.get("timeout_s", 120)))
            self._mod = anthropic
        return self._c

    def generate(self, system, user, schema, max_tokens=2000):
        c = self._client()
        a = self._mod
        try:
            r = c.messages.create(model=self.model, max_tokens=max_tokens, system=system, messages=[{"role": "user", "content": user}],
                                  output_config={"effort": self.options.get("effort", "low"), "format": {"type": "json_schema", "schema": schema}})
        except a.RateLimitError as e:
            ra = None
            try:
                ra = float(e.response.headers.get("retry-after"))
            except Exception:
                pass
            raise ProviderError(str(e), retryable=True, status=429, retry_after=ra)
        except a.APIStatusError as e:
            raise ProviderError(str(e), retryable=e.status_code >= 500 or e.status_code in (408, 409), status=e.status_code)
        except a.APIConnectionError as e:
            raise ProviderError(str(e), retryable=True)
        if r.stop_reason == "refusal":
            raise ProviderError(f"refusal: {getattr(r, 'stop_details', None)}", retryable=False)
        text = next((b.text for b in r.content if b.type == "text"), "")
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as e:
            raise ProviderError(f"μη έγκυρο JSON: {e}", retryable=True)
        return LLMResult(parsed=parsed, text=text, input_tokens=r.usage.input_tokens, output_tokens=r.usage.output_tokens, model=self.model,
                         model_version=getattr(r, "model", self.model), provider=self.name, request_id=getattr(r, "id", None), stop_reason=r.stop_reason)
