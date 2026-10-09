# ADR 0001: cognitive-complexity measurement

Status: accepted (2026-10-09, #29).

## Decision

The pre-push gate keeps its local cognitive-complexity walk in
`tools/python/structure_check.py`. The measure's authority is the pinned
`scb-check==0.2.0`, and the two are held together by a differential test that
runs in CI.

## Why

The gate runs in every consuming repository's pre-push. Reusing scb-check there
means `uvx` and, on a cold cache, a download on every push; scb-check pulls
tree-sitter and ast-grep, so the hook becomes slower and needs the network. The
local walk is pure `ast`, offline and fast, and matches scb-check's number for
every construct the gate gates on (see `python/tests/test_structure.py`).

## Rejected alternative

Running `scb-check==0.2.0` at gate time. It would be exact by construction, but
the runtime and dependency cost above is paid per push, and its public output is
aggregate composites plus a heavy-function list rather than a per-function
number — the gate would end up on its internal API anyway.

## Obligations

- The pin is `SCB_CHECK = "scb-check==0.2.0"` in `tools/python/structure_check.py`.
  `--score` and the differential test both use it.
- Upgrading the pin means re-reading `uvx scb-check==<new> check <fixture> --report`
  and updating the fixtures and expected numbers; the differential test fails
  until they agree.
- The differential test compares scb-check's public `--report` fields
  `total_functions` and `total_cog_mass` with the local measure for a loop `else`
  at the limit (the #25 reproducer), nested conditionals, boolean operators over
  and under the limit, exception handling and a function nested inside another.
  CI installs `uvx`, so drift fails CI rather than being an optional manual check.
- Offline: the gate never calls scb-check. Only `--score` and the differential
  test do; without `uvx` on `PATH` they are unavailable (the test skips, and
  `--score` reports that `uvx` is missing).
