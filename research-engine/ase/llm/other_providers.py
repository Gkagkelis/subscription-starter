"""OpenAI GPT και Google Gemini — adapters που ενεργοποιούνται με configuration.

ΠΕΙΡΑΜΑΤΙΚΑ / ΜΗ ΔΟΚΙΜΑΣΜΕΝΑ σε αυτό το περιβάλλον: τα SDK (`openai`, `google-genai`) δεν είναι εγκατεστημένα και δεν
υπάρχουν credentials. Ο κώδικας ακολουθεί τη δημόσια διεπαφή δομημένης εξόδου κάθε SDK· πριν από παραγωγική χρήση
απαιτείται δοκιμή με mock-free run μικρής κλίμακας. Τιμές: πρέπει να οριστούν στο config/llm_pricing.yaml."""
from __future__ import annotations

import json
import os

from .base import LLMProvider, LLMResult, ProviderError, ProviderUnavailable


class OpenAIProvider(LLMProvider):
    name = "openai"

    def available(self):
        try:
            import openai  # noqa: F401
        except Exception:
            return False, "Λείπει το SDK: pip install openai"
        if not os.environ.get("OPENAI_API_KEY"):
            return False, "Λείπει OPENAI_API_KEY"
        return True, "ok (μη δοκιμασμένος adapter)"

    def generate(self, system, user, schema, max_tokens=2000):
        try:
            import openai
        except Exception as e:
            raise ProviderUnavailable("pip install openai") from e
        c = openai.OpenAI(max_retries=0)
        try:
            r = c.chat.completions.create(model=self.model, max_completion_tokens=max_tokens,
                                          messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                                          response_format={"type": "json_schema", "json_schema": {"name": "response", "schema": schema, "strict": True}})
        except openai.RateLimitError as e:
            raise ProviderError(str(e), retryable=True, status=429)
        except openai.APIStatusError as e:
            raise ProviderError(str(e), retryable=e.status_code >= 500, status=e.status_code)
        except openai.APIConnectionError as e:
            raise ProviderError(str(e), retryable=True)
        text = r.choices[0].message.content or ""
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as e:
            raise ProviderError(f"μη έγκυρο JSON: {e}", retryable=True)
        return LLMResult(parsed=parsed, text=text, input_tokens=r.usage.prompt_tokens, output_tokens=r.usage.completion_tokens, model=self.model,
                         model_version=r.model, provider=self.name, request_id=r.id, stop_reason=r.choices[0].finish_reason)


class GeminiProvider(LLMProvider):
    name = "google"

    def available(self):
        try:
            from google import genai  # noqa: F401
        except Exception:
            return False, "Λείπει το SDK: pip install google-genai"
        if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
            return False, "Λείπει GEMINI_API_KEY"
        return True, "ok (μη δοκιμασμένος adapter)"

    def generate(self, system, user, schema, max_tokens=2000):
        try:
            from google import genai
        except Exception as e:
            raise ProviderUnavailable("pip install google-genai") from e
        c = genai.Client()
        try:
            r = c.models.generate_content(model=self.model, contents=user,
                                          config={"system_instruction": system, "response_mime_type": "application/json", "response_json_schema": schema,
                                                  "max_output_tokens": max_tokens})
        except Exception as e:  # το SDK δεν εκθέτει σταθερή ιεραρχία σφαλμάτων σε όλες τις εκδόσεις
            raise ProviderError(str(e), retryable=True)
        text = r.text or ""
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as e:
            raise ProviderError(f"μη έγκυρο JSON: {e}", retryable=True)
        um = getattr(r, "usage_metadata", None)
        return LLMResult(parsed=parsed, text=text, input_tokens=getattr(um, "prompt_token_count", 0) or 0, output_tokens=getattr(um, "candidates_token_count", 0) or 0,
                         model=self.model, model_version=getattr(r, "model_version", self.model) or self.model, provider=self.name)
