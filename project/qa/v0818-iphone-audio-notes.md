# APP-001 v0.8.18 — iPhone audio QA (CANDIDATE ONLY)

**User observation, 14.11.2026:** Intermittent audio playback delay or silence after changing iPhone apps. This remains an OPEN issue on physical iPhone, even though old synthetic tests passed. Do NOT claim it is fixed.

Changes approved for this candidate:
- 10-second double wooden sticks: 145 ms apart in Web Audio and HTML fallback.
- Buttons: 7x quieter than the earlier Web Audio gain of 0.72 (new amplitude 0.10285714285714286). This is not a mathematically impossible “700% volume reduction” and is not a decibel claim.
- Round end before the final round: the existing single *start* gong recording, for example after rounds 1/3 and 2/3.
- Only the completed last round, e.g. 3/3: the existing approved triple *end* gong.
- Settings credit: `미하일 ВЕРСИЯ · v0.8.18`.
- No changes to original MP3 bytes, session timing, layout, application switching, live analytics, or background audio.

**Safe iPhone tests before any production release:**
1. Start with 3 rounds, 60 s work, 30 s rest, 0 s preparation. Check start gong, 1/3 end single, 2/3 end single, 3/3 end triple. Check next-round start gong still sounds.
2. With 1/1, verify that final triple sounds only once at completion.
3. Verify 145 ms double clacks near 10 s, button audio sufficiently quiet, and portrait/landscape presentation.
4. Try at least ten controlled switches to other apps and back, both near a cue and far from a cue. Record exact symptom, iOS version and whether audio resumes when tapping the recovery button. Use no personal or third-party recordings.
5. Verify complete app closure then start with 0 s preparation.
6. Verify offline cache after fully loading over Wi-Fi, then testing with network off.

Some WebKit reports (bugs 323104, 291892, 263627) describe no audio despite healthy API states. These reports suggest a possible OS contribution but do not establish causation for this app. Do not alter audio lifecycle without device evidence and separate approval.

**Rollback:** FINAL main v0.8.17 `87dbba4623a2e626d863343297ef92f5303c8992`; primary stable rollback v0.8.15 `bfa13c8aabb1fd49b042c58ce130d4abf0ed9499`.
**Publication:** NOT authorized. Isolated branch only. Existing QA and publish workflows remain untouched. PR #28 (runtime pilot) remains separate.
