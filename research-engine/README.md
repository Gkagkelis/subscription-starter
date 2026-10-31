# research-engine — Adaptive Synthetic Research Engine (ASE v2.0)

Γενικός μηχανισμός συνθετικής καταναλωτικής έρευνας για την Ελλάδα. Δουλεύει με οποιοδήποτε ερωτηματολόγιο, πελάτη, κλάδο, μέγεθος δείγματος και κοινό-στόχο.

> Οι μελέτες βασίζονται σε συνθετικά προφίλ και προσομοιωμένες απαντήσεις. Δεν είναι δειγματοληπτικές έρευνες με πραγματικούς καταναλωτές.

- Οδηγός χρήσης (ελληνικά): [`docs/architecture/ADAPTIVE_ENGINE_GUIDE_GR.md`](../docs/architecture/ADAPTIVE_ENGINE_GUIDE_GR.md)
- Audit και αρχιτεκτονική: [`docs/architecture/ADAPTIVE_ENGINE_BASELINE.md`](../docs/architecture/ADAPTIVE_ENGINE_BASELINE.md)
- Αλλαγές: [`CHANGELOG.md`](CHANGELOG.md)
- Πιλοτική μελέτη: [`studies/kotsovolos_trust_2026/`](../studies/kotsovolos_trust_2026/)

```
ase/
  population/   frame.py (πλαίσιο GLOPOP-S + raking Eurostat 2025), panel.py (δυναμικό πάνελ, quotas, extensions)
  questionnaire/model.py   YAML/JSON, 8 τύποι, intents, skip logic (ασφαλές AST), τυχαιοποίηση, DCE, JSON schema
  evidence/context.py      Research Context Builder (lake, επίσημα, επιμελημένες πηγές, web μόνο αν ενεργό)
  llm/          base, anthropic_provider, other_providers (OpenAI/Gemini, πειραματικοί), mock, runtime (retry, budget, rate limit)
  respond/      prompts (guard κατά εντολών-στόχων), runner (modes A/B/C, checkpoint/resume, audit), empirical (CCE adapter)
  qc/checks.py  έλεγχοι ποιότητας
  results.py    results.csv / crosstabs.csv
  report/       αναφορά πελάτη HTML + PDF
  calibration/realdata.py  εισαγωγή πραγματικών δεδομένων, σύγκριση, βαθμονόμηση με holdout, dashboard
  study.py      ενορχήστρωση μελέτης, εκτίμηση κόστους, εξαγωγή μόνο παραδοτέων
ase_cli.py      γραμμή εντολών
config/llm_pricing.yaml   τιμές (μόνο Anthropic· καμία επινοημένη τιμή για άλλους)
tests/          python3 -I research-engine/tests/run_tests.py
```

Απαιτήσεις: Python 3.11+ με numpy, pandas, scipy, pyyaml, jsonschema. Το Node/Playwright χρειάζεται μόνο για το PDF. Προαιρετικά: `anthropic`, `openai`, `google-genai`, `pyarrow`.
