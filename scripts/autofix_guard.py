"""Guardrails for autonomous candidate fixes; never publishes to main."""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

EVENTS = frozenset(("app_error", "asset_error", "audio_failure"))
CODES = frozenset(("UNHANDLED_ERROR", "AUDIO_PLAY_REJECTED", "CACHE_INSTALL_FAILED",
                   "ASSET_LOAD_FAILED", "UNKNOWN"))
COMPONENTS = frozenset(("ui", "audio", "cache", "assets", "other"))
VERSION = re.compile(r"\d{1,3}\.\d{1,3}\.\d{1,3}\Z")
SOURCE_PATHS = frozenset(("site/app.mjs", "site/engine.mjs", "site/sw.js",
                          "site/diagnostics/schema.mjs", "site/diagnostics/sender.mjs"))
TEST_PATH = re.compile(r"tests/[a-z0-9_-]+\.test\.mjs\Z")
MAX_PATCH_BYTES = 50_000
MAX_MODIFIED_FILES = 6


def validate_fields(event: str, code: str, component: str, version: str, issue: str) -> None:
    if event not in EVENTS or code not in CODES or component not in COMPONENTS:
        raise ValueError("Unknown fixed technical-error classification")
    if not VERSION.fullmatch(version) or not issue.isdigit() or not 0 < int(issue) < 10_000_000:
        raise ValueError("Invalid version or issue reference")


def prompt_for(event: str, code: str, component: str, version: str, issue: str) -> str:
    validate_fields(event, code, component, version, issue)
    return f"""You are an isolated code repair agent. You have ZERO production release privileges.

Validated structured signal (no raw exception, user data or GitHub Issue content):
- error_type: {event}
- code: {code}
- component: {component}
- affected release: {version}
- internal GitHub Issue number: {issue}

Your task:
1. Inspect the source and existing tests to find whether this fixed-code error has a
   specific, reproducible cause. Generic codes alone may be insufficient.
2. ONLY when a minimal safe correction is demonstrable, implement it and add
   a deterministic regression test by editing existing files.
3. You may edit ONLY existing site/app.mjs, site/engine.mjs, site/sw.js,
   site/diagnostics/schema.mjs, site/diagnostics/sender.mjs,
   tests/*.test.mjs. Do NOT touch HTML, CSS, audio, icons,
   GitHub workflows, docs, settings, secrets, or any other paths.
4. Preserve timer functionality, offline operation, Russian UI, 1-minute
   default, sound rules, and privacy. Never introduce event analytics,
   device IDs, access to secrets or user identifiers.
5. If the diagnostic code does not establish a safe reproducible defect,
   produce NO FILE CHANGES. Never invent a fix or weaken tests.
6. No merges, deploys, releases, GitHub API calls, network calls or
   changes to outside systems.
The CI pipeline independently reviews allowable paths and runs ALL existing
tests. If any test fails, no owner notification and no candidate PR.
"""


def permitted_path(path: str) -> bool:
    return path in SOURCE_PATHS or bool(TEST_PATH.fullmatch(path))


def validate_patch(patch: bytes) -> list[str]:
    if not patch or len(patch) > MAX_PATCH_BYTES:
        raise ValueError("Empty or oversized candidate patch")
    try:
        source = patch.decode("utf-8")
    except UnicodeDecodeError:
        raise ValueError("Patch must contain UTF-8 text only") from None
    if any(tag in source for tag in ("GIT binary patch", "new file mode", "deleted file mode",
                                    "rename from ", "rename to ", "copy from ", "copy to ")):
        raise ValueError("Binary files, additions, deletions and renames are forbidden")
    headers = re.findall(r"^diff --git a/([^ \n]+) b/([^ \n]+)$", source, re.M)
    if not headers or len(headers) > MAX_MODIFIED_FILES:
        raise ValueError("No changes or too many files")
    paths = []
    for old, new in headers:
        if old != new or not permitted_path(old):
            raise ValueError("Disallowed file change")
        if old in paths:
            raise ValueError("Duplicate patch header")
        paths.append(old)
    if len(re.findall(r"^diff --git ", source, re.M)) != len(headers):
        raise ValueError("Malformed diff header")
    return paths


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    gen = sub.add_parser("prompt")
    for key in ("event", "code", "component", "version", "issue"):
        gen.add_argument("--" + key, required=True)
    check = sub.add_parser("check-patch")
    check.add_argument("patch")
    args = parser.parse_args()
    try:
        if args.command == "prompt":
            print(prompt_for(args.event, args.code, args.component, args.version, args.issue))
        else:
            paths = validate_patch(Path(args.patch).read_bytes())
            print("SAFE PATHS: " + ", ".join(paths))
    except (ValueError, OSError) as exc:
        print("AUTOFIX BLOCKED: " + str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
