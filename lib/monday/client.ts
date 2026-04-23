/**
 * Read-only Monday.com GraphQL client.
 * No mutations, ever. See lib/monday/read-only-guard.ts for safeguards.
 */

import { assertReadOnlyBody } from "./read-only-guard";

const MONDAY_GRAPHQL_URL = "https://api.monday.com/v2";

export type MondayColumnValue = {
  id: string;
  type: string;
  text: string | null;
  value: string | null;
};

export type MondayItem = {
  id: string;
  name: string;
  updated_at: string;
  column_values: MondayColumnValue[];
};

type MondayGraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; [k: string]: unknown }>;
  error_code?: string;
  error_message?: string;
};

async function mondayGraphql<T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  assertReadOnlyBody(query);

  const token = process.env.MONDAY_API_TOKEN;
  if (!token) {
    throw new Error("[monday] MONDAY_API_TOKEN not set");
  }

  const res = await fetch(MONDAY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });

  // Log only the operation name and item count for auditability.
  // Do NOT log variables (may contain board IDs fine, but keep the log tidy).
  console.log(
    `[monday] ${operationName} → HTTP ${res.status}`
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `[monday] ${operationName} HTTP ${res.status}: ${body.slice(0, 500)}`
    );
  }

  const json = (await res.json()) as MondayGraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    throw new Error(
      `[monday] ${operationName} GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  if (!json.data) {
    throw new Error(
      `[monday] ${operationName} returned no data. Full response: ${JSON.stringify(
        json
      ).slice(0, 500)}`
    );
  }

  return json.data;
}

const GET_ORDERS_PAGE = `
  query GetOrders($boardId: [ID!], $cursor: String, $limit: Int) {
    boards(ids: $boardId) {
      id
      name
      items_page(limit: $limit, cursor: $cursor) {
        cursor
        items {
          id
          name
          updated_at
          column_values {
            id
            type
            text
            value
          }
        }
      }
    }
  }
`;

const ME_QUERY = `
  query Me {
    me { id name email }
  }
`;

export async function getMe(): Promise<{
  id: string;
  name: string;
  email: string;
}> {
  const data = await mondayGraphql<{
    me: { id: string; name: string; email: string };
  }>("Me", ME_QUERY);
  return data.me;
}

type GetOrdersData = {
  boards: Array<{
    id: string;
    name: string;
    items_page: {
      cursor: string | null;
      items: MondayItem[];
    };
  }>;
};

/**
 * Fetches all items on a board, paginating via cursor until has_more is false.
 * Safe even if the board grows beyond one page.
 */
export async function getBoardItems(boardId: string): Promise<MondayItem[]> {
  const items: MondayItem[] = [];
  let cursor: string | null = null;

  do {
    const data: GetOrdersData = await mondayGraphql<GetOrdersData>(
      "GetOrders",
      GET_ORDERS_PAGE,
      { boardId: [boardId], cursor, limit: 100 }
    );

    const page = data.boards[0]?.items_page;
    if (!page) {
      throw new Error(`[monday] GetOrders returned no items_page for board ${boardId}`);
    }

    items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);

  console.log(
    `[monday] GetOrders board=${boardId} fetched ${items.length} item(s) — ids: ${items
      .map((i) => i.id)
      .join(",")}`
  );

  return items;
}

export async function getOrders(): Promise<MondayItem[]> {
  const boardId = process.env.MONDAY_ORDERS_BOARD_ID;
  if (!boardId) {
    throw new Error("[monday] MONDAY_ORDERS_BOARD_ID not set");
  }
  return getBoardItems(boardId);
}
