import unittest
from datetime import date
from unittest.mock import patch
from scripts.round_timer_monitor import is_due, extract_rows, signature, marker, last_day, reconcile, SQL, read_aggregates

SAMPLE = {"event":"audio_failure","code":"AUDIO_PLAY_REJECTED","component":"audio","version":"0.8.5","total":4}

class MonitorTests(unittest.TestCase):
    def test_three_day_schedule_across_months(self):
        for d in (date(2026,11,11),date(2026,11,14),date(2026,11,29),date(2026,12,2)):
            self.assertTrue(is_due(d),d)
        for d in (date(2026,11,10),date(2026,11,12),date(2026,11,30),date(2026,12,1)):
            self.assertFalse(is_due(d),d)

    def test_minimal_aggregates(self):
        self.assertEqual(extract_rows({"data":[SAMPLE,{**SAMPLE,"total":0}]}),[SAMPLE])

    def test_rejects_non_error_events(self):
        with self.assertRaises(RuntimeError):
            extract_rows({"data":[{**SAMPLE,"event":"workout_start"}]})

    def test_rejects_id_and_negative_counts(self):
        for row in ({**SAMPLE,"version":"device-id"},{**SAMPLE,"total":-1}):
            with self.assertRaises(RuntimeError):
                extract_rows({"data":[row]})

    def test_bad_cloudflare_structure_fails(self):
        with self.assertRaises(RuntimeError):
            extract_rows({"errors":["something went wrong"]})

    def test_sql_only_grouped_minimal_fields(self):
        self.assertIn("COUNT() AS total",SQL)
        self.assertIn("INTERVAL '72' HOUR",SQL)
        self.assertIn("GROUP BY blob1, blob2, blob3, blob4",SQL)
        for forbidden in ("ipAddress","user_id","stack","userAgent"):
            self.assertNotIn(forbidden,SQL)

    def test_fingerprint_not_per_user(self):
        self.assertEqual(signature(SAMPLE),signature({**SAMPLE,"total":100}))
        self.assertEqual(len(signature(SAMPLE)),16)
        self.assertEqual(last_day(marker(signature(SAMPLE),"2026-11-11"),signature(SAMPLE)),"2026-11-11")

    def test_no_errors_no_issue_write(self):
        with patch("scripts.round_timer_monitor.gh") as gh:
            self.assertEqual(reconcile([],"dummy","2026-11-11"),(0,0,0))
            gh.assert_not_called()

    def test_idempotent_same_day(self):
        issue={"number":7,"state":"open","body":marker(signature(SAMPLE),"2026-11-11")}
        with patch("scripts.round_timer_monitor.ensure_label"), \
             patch("scripts.round_timer_monitor.existing_issues",return_value=[issue]), \
             patch("scripts.round_timer_monitor.gh") as gh:
            self.assertEqual(reconcile([SAMPLE],"dummy","2026-11-11"),(0,0,1))
            gh.assert_not_called()

    def test_issue_created_from_aggregate_only(self):
        with patch("scripts.round_timer_monitor.ensure_label"), \
             patch("scripts.round_timer_monitor.existing_issues",return_value=[]), \
             patch("scripts.round_timer_monitor.gh") as gh:
            self.assertEqual(reconcile([SAMPLE],"dummy","2026-11-11"),(1,0,0))
            self.assertEqual(gh.call_count,1)
            data=gh.call_args.args[3]
            self.assertEqual(data["labels"],["round-timer-diagnostics"])
            self.assertIn("AUDIO_PLAY_REJECTED",data["body"])
            self.assertNotIn("device-id",data["body"])

    def test_reopen_and_comment_on_recurring_error(self):
        issue={"number":9,"state":"closed","body":marker(signature(SAMPLE),"2026-11-11")}
        with patch("scripts.round_timer_monitor.ensure_label"), \
             patch("scripts.round_timer_monitor.existing_issues",return_value=[issue]), \
             patch("scripts.round_timer_monitor.gh") as gh:
            self.assertEqual(reconcile([SAMPLE],"dummy","2026-11-14"),(0,1,0))
            self.assertEqual(gh.call_count,2)
            self.assertEqual(gh.call_args_list[0].args[3]["state"],"open")

    def test_cloudflare_api_denial_is_explicit_fail_not_silent_empty_success(self):
        with patch("scripts.round_timer_monitor.api", side_effect=RuntimeError("Remote API HTTP 403")):
            with self.assertRaisesRegex(RuntimeError,"HTTP 403"):
                read_aggregates("test-token")

    def test_missing_cloudflare_account_never_creates_empty_report(self):
        with patch("scripts.round_timer_monitor.api", return_value={"success":True,"result":[]}):
            with self.assertRaisesRegex(RuntimeError,"exactly one account"):
                read_aggregates("test-token")

if __name__=="__main__":
    unittest.main()
