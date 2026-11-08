import unittest
from scripts.autofix_guard import validate_fields, prompt_for, permitted_path, validate_patch
from scripts.round_timer_monitor import issue_body

SAMPLE = dict(event="audio_failure",code="AUDIO_PLAY_REJECTED",component="audio",version="0.8.5",issue="23")
VALID = (b"diff --git a/site/app.mjs b/site/app.mjs\n"
         b"index 1234567..89abcde 100644\n"
         b"--- a/site/app.mjs\n+++ b/site/app.mjs\n"
         b"@@ -1 +1 @@\n-a\n+b\n")

class AutoFixGuardTests(unittest.TestCase):
    def test_fixed_codes_only(self):
        validate_fields(**SAMPLE)
        for value in ("workout_start","IP_ADDRESS"):
            with self.assertRaises(ValueError):
                validate_fields(**{**SAMPLE,"event":value})

    def test_bad_version_or_issue_denied(self):
        for key,val in (("version","browser-id"),("issue","-9"),
                        ("component","iphone-id")):
            with self.assertRaises(ValueError):
                validate_fields(**{**SAMPLE,key:val})

    def test_safe_prompt_no_untrusted_issue_body(self):
        out=prompt_for(**SAMPLE)
        self.assertIn("reproducible cause",out)
        self.assertIn("ZERO production release privileges",out)
        self.assertIn("NO FILE CHANGES",out)

    def test_allowed_paths(self):
        for path in ("site/app.mjs","site/engine.mjs","site/sw.js",
                     "site/diagnostics/sender.mjs","tests/timer-model.test.mjs"):
            self.assertTrue(permitted_path(path),path)
        for path in (".github/workflows/publish-pages.yml","site/index.html",
                     "receiver/cloudflare-worker/src/index.mjs","../../secret",
                     "tests/evil.py","site/sounds/gong.mp3"):
            self.assertFalse(permitted_path(path),path)

    def test_valid_safe_unified_patch(self):
        self.assertEqual(validate_patch(VALID),["site/app.mjs"])

    def test_disallow_binary(self):
        with self.assertRaises(ValueError):
            validate_patch(VALID+b"GIT binary patch\n")

    def test_disallow_deleted_or_added_files(self):
        for suffix in (b"new file mode 100644\n",b"deleted file mode 100644\n"):
            with self.assertRaises(ValueError):
                validate_patch(VALID+suffix)

    def test_disallow_secrets_or_workflows(self):
        for target in (b".github/workflows/fix.yml",b"project/DECISIONS.md",b"site/index.html"):
            with self.assertRaises(ValueError):
                validate_patch(VALID.replace(b"site/app.mjs",target))

    def test_empty_patch_and_large_patch_rejected(self):
        for data in (b"",VALID+b"p"*51000):
            with self.assertRaises(ValueError):
                validate_patch(data)

    def test_raw_issue_does_not_mention_owner(self):
        row={"event":"app_error","code":"UNKNOWN","component":"ui","version":"0.8.5","total":1}
        self.assertNotIn("@mastyukov-cyber",issue_body(row,"2026-11-11"))

if __name__=="__main__":
    unittest.main()
