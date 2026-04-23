/**
 * Read-only guard for Monday integration.
 *
 * Asserts at module-load that READ_ONLY_MONDAY_SYNC is set to "true".
 * If any code path ever attempts a GraphQL mutation body, `assertReadOnlyBody`
 * throws before the request leaves the process.
 *
 * This is one of four independent safeguards (see plan):
 * 1. this env-flag assertion
 * 2. runtime mutation-body throw (below)
 * 3. CI grep ban on mutation operation names
 * 4. Vercel runtime log audit of operation names
 */

const READ_ONLY_ENV_KEY = "READ_ONLY_MONDAY_SYNC";

if (process.env[READ_ONLY_ENV_KEY] !== "true") {
  throw new Error(
    `[monday] ${READ_ONLY_ENV_KEY} must be "true" — refusing to load Monday client. Current value: ${JSON.stringify(
      process.env[READ_ONLY_ENV_KEY]
    )}`
  );
}

/**
 * GraphQL operation names that would mutate Monday state.
 * Banned by CI grep and by runtime body inspection.
 */
export const BANNED_MONDAY_OPERATIONS = [
  "create_item",
  "create_update",
  "change_item_column_values",
  "change_multiple_column_values",
  "change_simple_column_value",
  "delete_item",
  "archive_item",
  "duplicate_item",
  "move_item_to_group",
  "move_item_to_board",
  "update_item",
  "create_board",
  "archive_board",
  "create_column",
  "delete_column",
  "change_column_metadata",
  "create_group",
  "delete_group",
  "create_webhook",
  "delete_webhook",
  "create_notification",
  "add_teams_to_board",
  "remove_teams_from_board",
  "add_users_to_board",
  "remove_users_from_board",
  "create_subitem",
] as const;

/**
 * Asserts a GraphQL request body is read-only.
 * Throws if the query starts with `mutation` (case-insensitive, whitespace-tolerant)
 * or references any banned operation name.
 */
export function assertReadOnlyBody(query: string): void {
  const trimmed = query.trimStart();
  if (/^mutation\b/i.test(trimmed)) {
    throw new Error(
      "[monday] Refusing to send mutation — this integration is read-only."
    );
  }
  for (const op of BANNED_MONDAY_OPERATIONS) {
    if (query.includes(op)) {
      throw new Error(
        `[monday] Refusing to send query containing banned operation "${op}" — this integration is read-only.`
      );
    }
  }
}
