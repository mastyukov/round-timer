# Round Timer RC11 — studio sounds and visual update (DRAFT)

**Not yet ready for TEST deployment.** PR is cumulative from RC10. Do not merge into main or publish until five binary MP3 assets are uploaded and SHA-256 tests PASS.

New real user-recorded MP3 files belong in `site/sounds/` and must exactly match `studio-audio-manifest.json`. No synthetic placeholders. Local package from ChatGPT: APP001_RC11_Studio_Audio_Test_Package.zip.

Changes: short start/end gongs; recorded double clack at 10s only; single clack at 30s and 5–1s, and 60s only when work round >60s; button audio on START/PAUSE/RESET/Settings open/Done; rest defaults to 0s, explicit rest values preserved; lighter lime work #A7FF55 and bright red rest #FF4255. RC10 WebAudio life-cycle protections preserved. No changes to production version or production audio paths.

**Safety gate**: tests/studio-audio-assets.test.mjs requires all five approved exact SHA256 hashes, refuses missing files and different recordings. GitHub Actions FAIL/PARTIAL until the originals are present. Publish TEST only after gate passes, independent CI and real iPhone validation follows.
