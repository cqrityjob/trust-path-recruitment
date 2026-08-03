#!/usr/bin/env bash
#
# Replay every migration, in filename order, into the LOCAL Supabase stack.
#
# `supabase start` applies migrations all-or-nothing and aborts on the first
# error. Twenty migrations in this repository are KNOWN to fail on a clean
# replay -- Lovable Cloud re-issued them under generated filenames while the
# repository already carried the authored originals, so the second copy hits
# "already exists". scripts/db-test.sh documents and asserts that exact
# baseline, and this script reuses it rather than inventing a second one.
#
# LOCAL ONLY. Refuses to run against anything that is not 127.0.0.1.

set -Eeuo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

case "$DB_URL" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "REFUSING: DB_URL is not local: ${DB_URL%%@*}@..." >&2; exit 1 ;;
esac

# Pull the allowlist straight out of db-test.sh so the two can never drift.
# bash 3.2 on macOS has no mapfile; read into the array the portable way.
KNOWN=()
while IFS= read -r line; do
  KNOWN+=("$line")
# The expected-error strings contain ESCAPED quotes (\"already exists\"), so a
# naive [^"]+ stops at the first one and truncates the needle. Strip the outer
# quotes and unescape instead.
done < <(sed -n '/^KNOWN_FAILURES=(/,/^)/p' scripts/db-test.sh \
  | grep '|||' \
  | sed -E 's/^[[:space:]]*"//; s/"[[:space:]]*$//; s/\\"/"/g')

expected_error_for() {
  local f="$1"
  for entry in "${KNOWN[@]}"; do
    [ "${entry%%|||*}" = "$f" ] && { echo "${entry##*|||}"; return 0; }
  done
  return 1
}

applied=0; skipped=0; failed=0
for path in $(ls supabase/migrations/*.sql | sort); do
  f="$(basename "$path")"
  if out=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$path" 2>&1); then
    applied=$((applied+1))
    printf '    ok  %s\n' "$f"
  else
    if needle=$(expected_error_for "$f"); then
      if grep -qF "$needle" <<<"$out"; then
        skipped=$((skipped+1))
        printf '    --  %s (known failure, expected error confirmed)\n' "$f"
      else
        failed=$((failed+1))
        printf '    XX  %s DEVIATED: expected %q\n%s\n' "$f" "$needle" "$out" >&2
      fi
    else
      failed=$((failed+1))
      printf '    XX  %s FAILED (not allowlisted)\n%s\n' "$f" "$out" >&2
    fi
  fi
done

echo ""
echo "applied=$applied  known-failures=$skipped  unexpected=$failed"
[ "$failed" -eq 0 ] || exit 1
