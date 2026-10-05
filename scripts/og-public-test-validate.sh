#!/usr/bin/env bash
# Validates the inputs of .github/workflows/og-public-test.yml BEFORE any step
# that holds a Cloudflare credential uses them.
#
# Inputs arrive ONLY through the environment (OG_ACTION, OG_SHARE), never
# interpolated into a command line, and are only ever expanded quoted. Nothing
# here evaluates them: a value such as `$(touch x)` is a 24-character-or-not
# string to be compared, not a command. Each is matched against a closed list:
# the two actions this workflow has, and the synthetic share ids the stand-in
# knows (scripts/og-worker-fixture.ts; the guard keeps this list equal to it).
#
# Exit 0 and, when GITHUB_OUTPUT is set, write the validated values there.
# Exit 2 on anything else, saying which input was refused and never echoing an
# unquoted value.
set -euo pipefail

ALLOWED_ACTIONS="deploy teardown"
ALLOWED_SHARES="AbCdEfGhIjKlMnOpQrStUvWx LongLongLongLongLongLong ArabicArabicArabicArabic FounderFounderFounderFou RevokedRevokedRevokedRev ExpiredExpiredExpiredExp ReadErrorReadErrorReadEr"

action="${OG_ACTION:-}"
share="${OG_SHARE:-}"

in_list() {
  # $1: candidate, $2: space-separated allowlist. Exact, whole-word match.
  local candidate="$1" list="$2" item
  for item in $list; do
    if [ "$candidate" = "$item" ]; then return 0; fi
  done
  return 1
}

if ! [[ "$action" =~ ^[a-z]+$ ]] || ! in_list "$action" "$ALLOWED_ACTIONS"; then
  printf 'og-public-test-validate: REFUSED action (not one of: %s)\n' "$ALLOWED_ACTIONS" >&2
  exit 2
fi
if ! [[ "$share" =~ ^[A-Za-z0-9_-]{24}$ ]] || ! in_list "$share" "$ALLOWED_SHARES"; then
  printf 'og-public-test-validate: REFUSED share (not a known synthetic id)\n' >&2
  exit 2
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'action=%s\nshare=%s\n' "$action" "$share" >> "$GITHUB_OUTPUT"
fi
printf 'og-public-test-validate: ok (%s, share %s)\n' "$action" "$share"
