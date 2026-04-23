#!/usr/bin/env bash
# Fails the build if any Monday mutation operation appears in source.
# Runs as part of CI (see .github/workflows/ci.yml) and can be invoked locally via
#   npm run check:mutations
# Keep this list in sync with BANNED_MONDAY_OPERATIONS in lib/monday/read-only-guard.ts.

set -euo pipefail

BANNED=(
  create_item
  create_update
  change_item_column_values
  change_multiple_column_values
  change_simple_column_value
  delete_item
  archive_item
  duplicate_item
  move_item_to_group
  move_item_to_board
  update_item
  create_board
  archive_board
  create_column
  delete_column
  change_column_metadata
  create_group
  delete_group
  create_webhook
  delete_webhook
  create_notification
  add_teams_to_board
  remove_teams_from_board
  add_users_to_board
  remove_users_from_board
  create_subitem
)

# Search only in source directories. Exclude node_modules, .next, this script
# (which lists the banned strings), and the guard file (which also lists them).
SEARCH_PATHS=(app lib)
EXCLUDES=(
  --exclude-dir=node_modules
  --exclude-dir=.next
  --exclude=check-no-monday-mutations.sh
  --exclude=read-only-guard.ts
)

FAIL=0
for OP in "${BANNED[@]}"; do
  # -w matches whole words only. -R recursive.
  if grep -RnIw "${EXCLUDES[@]}" "$OP" "${SEARCH_PATHS[@]}" 2>/dev/null; then
    echo ""
    echo "FAIL: banned Monday mutation operation '$OP' appears in source." >&2
    FAIL=1
  fi
done

# Also ban GraphQL mutation literals.
if grep -RnIE "${EXCLUDES[@]}" '(^|[^a-zA-Z_])mutation\s+[A-Za-z_]' "${SEARCH_PATHS[@]}" 2>/dev/null; then
  echo ""
  echo "FAIL: a GraphQL 'mutation' block appears in source." >&2
  FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "Monday integration is strictly read-only. Remove any mutation code before merging." >&2
  exit 1
fi

echo "OK: no Monday mutation operations found in app/ or lib/."
