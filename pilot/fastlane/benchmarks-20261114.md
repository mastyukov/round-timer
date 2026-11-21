# APP-001 FAST LANE Pilot — Observed benchmark (14 Nov 2026)

Baseline from existing GitHub Actions run metadata:
- FINAL main FAST: run 43575207889, SHA 87dbba4623a2e626d863343297ef92f5303c8992, 7s (created to updated).
- FINAL main Pages publish: run 43575207846, same SHA, 43s including deploy.
- FINAL v0.8.17 PR QA: run 43574778232, SHA c8f9475f7d3afb25d1c02113eb5576045760bf77, 9s.
- FINAL v0.8.17 branch QA: run 43574694965, same SHA, 12s.
- TEST main RC19 QA: run 43302138896, SHA 021a17337f339e0a1b98f5cc90862a741aa01ad0, 9s.

Pilot initial commit SHA 55f8a7f8f152dee70f19218b898186aa8c68d252:
- Run 43632409048, ~13s total for parallel FAST + one-time full compatibility probe.
- Runner logged Node 26.13.1 and Python 3.12.16.
- FAST 19/19 PASS; FULL 61/61 JavaScript PASS + 21/21 Python PASS.
- Original five studio MP3 sha256 and offline/portrait/landscape/cold-start/foreground checks passed.
- The full compatibility probe is intentionally triggered only once via [pilot-full].
- This file commit is the NORMAL FAST-only benchmark (no full-pilot marker). Its run ID, test counts and wall time must be read directly from GitHub before final comparison.

Timing methodology: GitHub run created_at -> updated_at (wall time); GitHub job/step CPU, RAM and disk metrics are not available here. Avoid promising speedups solely on the basis of test-case count.

Everything in this file is read-only audit material. No existing production code or workflow files are changed.
