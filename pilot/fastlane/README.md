# APP-001 — FAST LANE Runtime & CI Optimization Pilot

ISOLATED / SYNTHETIC / NO DEPLOY. No modifications to the application's code, existing workflows, tests, audio, UI, rollback or main.

Audit baselines (14 Nov 2026):
- FINAL mastyukov/round-timer main: 87dbba4623a2e626d863343297ef92f5303c8992 (v0.8.17)
- TEST mastyukov-cyber/round-timer-pages-test main: 021a17337f339e0a1b98f5cc90862a741aa01ad0 (RC19)
- Archive mastyukov-cyber/round-timer-pwa main: dde5b4b78ecb76f743ed365f170a6b461a811484
- MAIN ROLLBACK: rollback/round-timer-v0.8.15-stable = bfa13c8aabb1fd49b042c58ce130d4abf0ed9499.

Proposed CI levels, not activated in production:
- FAST (each commit): Node.js 26, node --check and narrow synthetic timer/model tests. No Python or Playwright.
- STANDARD (completed feature): existing settings, rounds/rest, timing, UI portrait/landscape model regressions.
- CRITICAL (risky feature): cold start, background-return behavior, deferred audio, offline CacheStorage contract, studio MP3 byte hashes, real Safari/iPhone verification as needed.
- RELEASE (owner approval only): exact source SHA, full regression, Python 3.12 diagnostic tests, approved audio file hashes, evidence and rollback validity, deployment gate. Never automatic merge or deploy. Python 3.14 and Playwright 1.65.1 require separate necessity/compatibility review.

The pilot workflow performs FAST on its isolated branch. Its single initial [pilot-full] commit also performs a full release-like synthetic compatibility run (Node 26 + Python 3.12). Subsequent ordinary pilot pushes run only FAST. It has read-only GitHub permission; there is no workflow_dispatch, deployment, publishing or package installation.

Evidence reuse is a synthetic contract, NOT a deployed GitHub API verification service: require authenticated GitHub Actions result, matching repository, 40-char exact commit SHA, SHA-256 test-manifest hash, successful completed result and trusted workflow/run IDs plus sufficient tier. RELEASE cannot be approved solely by reusing results; fresh integrity checks and explicit owner confirmation remain required.

Observed GitHub Actions wall times (run created_at to updated_at; includes orchestration, not isolated test CPU):
- FINAL FAST run 43575207889: 7s.
- FINAL release PR run 43574778232: 9s; same exact SHA's release push run 43574694965: 12s.
- FINAL Pages publish 43575207846: 43s including deployment.
- TEST main QA 43302138896: 9s.
Timing comparisons must use actual pilot runs, not assert savings in advance.
No existing workflow pins Node or Python; exact historical runner language versions not established. No package.json, requirements or Playwright dependency in FINAL root.
