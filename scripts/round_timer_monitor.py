"""Privacy-safe Round Timer Cloudflare aggregate error monitor."""
from __future__ import annotations
import hashlib
import json
import os
import re
import sys
from datetime import date, datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

REPO = "mastyukov/round-timer"
LABEL = "round-timer-diagnostics"
OWNER_LOGIN = "mastyukov-cyber"
START_DATE = date(2026, 11, 11)
EVENTS = {"app_error", "asset_error", "audio_failure"}
CODES = {"UNHANDLED_ERROR", "AUDIO_PLAY_REJECTED", "CACHE_INSTALL_FAILED", "ASSET_LOAD_FAILED", "UNKNOWN"}
COMPONENTS = {"ui", "audio", "cache", "assets", "other"}
SQL = ("SELECT blob1 AS event, blob2 AS code, blob3 AS component, "
       "blob4 AS version, COUNT() AS total FROM round_timer_error_events "
       "WHERE timestamp > NOW() - INTERVAL '72' HOUR "
       "GROUP BY blob1, blob2, blob3, blob4 ORDER BY total DESC LIMIT 100 FORMAT JSON")


def is_due(day):
    delta = (day - START_DATE).days
    return delta >= 0 and delta % 3 == 0


def signature(row):
    return hashlib.sha256("|".join(str(row[k]) for k in ("event", "code", "component", "version")).encode()).hexdigest()[:16]


def extract_rows(result):
    if not isinstance(result, dict) or not isinstance(result.get("data"), list):
        raise RuntimeError("Unexpected Analytics Engine response format")
    cleaned = []
    for row in result["data"]:
        if (not isinstance(row, dict)
                or row.get("event") not in EVENTS or row.get("code") not in CODES
                or row.get("component") not in COMPONENTS
                or not isinstance(row.get("version"), str)
                or not re.fullmatch(r"\d{1,3}\.\d{1,3}\.\d{1,3}", row["version"])
                or not str(row.get("total", "")).isdigit()):
            raise RuntimeError("Unexpected aggregated diagnostic code")
        count = int(row["total"])
        if count:
            cleaned.append({**{key: row[key] for key in ("event", "code", "component", "version")}, "total": count})
    cleaned.sort(key=lambda value: -value["total"])
    if len(cleaned) > 30:
        raise RuntimeError("Too many different errors; manual review required")
    return cleaned


def api(url, token, method="GET", payload=None, sql=False):
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json",
               "User-Agent": "round-timer-3-day-monitor"}
    raw = None
    if payload is not None:
        if sql:
            headers["Content-Type"] = "text/plain; charset=utf-8"
            raw = payload.encode()
        else:
            headers["Content-Type"] = "application/json"
            raw = json.dumps(payload).encode()
    try:
        with urlopen(Request(url, data=raw, method=method, headers=headers), timeout=30) as response:
            content = response.read(512000)
            return json.loads(content) if content else {}
    except HTTPError as error:
        raise RuntimeError(f"Remote API HTTP {error.code}; no credentials displayed") from None
    except URLError:
        raise RuntimeError("Remote API unavailable; no credentials displayed") from None


def read_aggregates(token):
    accounts = api("https://api.cloudflare.com/client/v4/accounts?per_page=100", token)
    found = accounts.get("result") if accounts.get("success") else None
    if not isinstance(found, list) or len(found) != 1:
        raise RuntimeError("Cloudflare account discovery did not return exactly one account")
    account_id = found[0].get("id", "")
    if not re.fullmatch(r"[a-fA-F0-9]{32}", str(account_id)):
        raise RuntimeError("Invalid Cloudflare account ID")
    result = api("https://api.cloudflare.com/client/v4/accounts/" + account_id + "/analytics_engine/sql",
                 token, "POST", SQL, True)
    if result.get("errors"):
        raise RuntimeError("Cloudflare SQL query returned error")
    return extract_rows(result)


def gh(token, path, method="GET", payload=None):
    return api("https://api.github.com/repos/" + REPO + path, token, method, payload)


def ensure_label(token):
    try:
        gh(token, "/labels/" + LABEL)
    except RuntimeError as err:
        if "HTTP 404" not in str(err):
            raise
        gh(token, "/labels", "POST", {"name": LABEL, "color": "e6d5ff",
                                      "description": "Aggregated minimal error codes only"})


def existing_issues(token):
    issues = []
    for page in range(1, 11):
        received = gh(token, f"/issues?state=all&labels={quote(LABEL)}&per_page=100&page={page}")
        if not isinstance(received, list):
            raise RuntimeError("Unexpected GitHub issues response")
        issues.extend(v for v in received if "pull_request" not in v)
        if len(received) < 100:
            break
    return issues


def marker(key, day):
    return f"<!-- round-timer-monitor key={key} day={day} -->"


def last_day(body, key):
    match = re.search(r"<!-- round-timer-monitor key=" + re.escape(key)
                      + r" day=(\d{4}-\d{2}-\d{2}) -->", body or "")
    return match.group(1) if match else None


def issue_body(row, day):
    return "\n".join([
        # No ping for raw error detection: notify owner only on verified PR.
        "Автоматическая проверка Round Timer за последние 72 часа:",
        "",
        "- Тип технической ошибки: " + row["event"],
        "- Код: " + row["code"],
        "- Компонент: " + row["component"],
        "- Версия: " + row["version"],
        "- Событий (не пользователей): " + str(row["total"]),
        "- Проверка UTC: " + day,
        "",
        "Без IP-адресов, идентификаторов телефона, текстов ошибок и параметров тренировок.",
        "Исправления и выпуск требуют отдельного подтверждения владельца.",
        "",
        marker(signature(row), day),
    ])


def reconcile(rows, github_token, day, on_new_issue=None):
    if not rows:
        return (0, 0, 0)
    ensure_label(github_token)
    old = existing_issues(github_token)
    created = updated = unchanged = 0
    for row in rows:
        key = signature(row)
        item = next((v for v in old if last_day(v.get("body"), key)), None)
        if item:
            if last_day(item.get("body"), key) == day:
                unchanged += 1
                continue
            number = item["number"]
            patch = {"body": issue_body(row, day)}
            if item.get("state") == "closed":
                patch["state"] = "open"
            gh(github_token, f"/issues/{number}", "PATCH", patch)
            gh(github_token, f"/issues/{number}/comments", "POST",
               {"body": f"Ошибка повторилась: {row['total']} событий за 72 часа; дата UTC {day}."})
            updated += 1
        else:
            issue = gh(github_token, "/issues", "POST",
               {"title": f"[Round Timer] {row['code']} · {row['component']} · v{row['version']}",
                "labels": [LABEL], "body": issue_body(row, day)})
            created += 1
            if on_new_issue is not None and created == 1:
                number = issue.get("number") if isinstance(issue, dict) else None
                if not isinstance(number, int) or number < 1:
                    raise RuntimeError("GitHub did not return an issue number")
                on_new_issue(number, row)
    return (created, updated, unchanged)


def main():
    event = os.getenv("GITHUB_EVENT_NAME", "manual")
    today = datetime.now(timezone.utc).date()
    if event == "schedule" and not is_due(today):
        print("SKIP: no Cloudflare check today (3-day cadence).")
        return
    token = os.getenv("CLOUDFLARE_WORKER_API_TOKEN", "")
    if not token:
        raise RuntimeError("Cloudflare token unavailable")
    rows = read_aggregates(token)
    print("Cloudflare aggregate SQL: PASS; types=" + str(len(rows))
          + "; events=" + str(sum(v["total"] for v in rows)))
    if event != "schedule":
        print("DRY RUN: no GitHub issues or comments created.")
        return
    gh_token = os.getenv("GITHUB_TOKEN", "")
    if not gh_token:
        raise RuntimeError("GitHub token unavailable")
    def start_autofix(issue_number, row):
        # workflow_dispatch is explicitly allowed to create a new run from GITHUB_TOKEN.
        # Limit to one candidate attempt per real monitoring day.
        if os.getenv("AUTOFIX_ENABLED", "false").lower() != "true":
            print("AI candidate repair not enabled: no dispatch.")
            return
        gh(gh_token, "/actions/workflows/autofix-diagnostics.yml/dispatches", "POST",
           {"ref":"main", "inputs":{
               "issue_number":str(issue_number),
               "error_code":row["code"],
               "component":row["component"],
               "version":row["version"],
               "error_type":row["event"]}})
        print("Automatic repair workflow dispatched; owner not notified before QA.")

    created, updated, unchanged = reconcile(rows, gh_token, today.isoformat(), on_new_issue=start_autofix)
    print(f"PASS: new issues={created}, updated={updated}, unchanged={unchanged}")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print("MONITOR FAILED: " + str(exc), file=sys.stderr)
        sys.exit(1)
