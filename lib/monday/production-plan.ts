/**
 * Read-only Monday fetcher for the Production Plan board.
 * Traverses board → groups → items_page, preserving week-group membership.
 */

import { assertReadOnlyBody } from "./read-only-guard";
import type { MondayItem } from "./client";
import {
  transformPlanItem,
  type PlanRow,
  type PlanLinkedOrder,
  type RawLinkedOrdersByItemId,
} from "./production-plan-mapping";

const MONDAY_GRAPHQL_URL = "https://api.monday.com/v2";

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; [k: string]: unknown }>;
};

async function graphql<T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  assertReadOnlyBody(query);

  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error("[monday] MONDAY_API_TOKEN not set");

  const res = await fetch(MONDAY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });

  console.log(`[monday] ${operationName} → HTTP ${res.status}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[monday] ${operationName} HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(
      `[monday] ${operationName} GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }
  if (!json.data) throw new Error(`[monday] ${operationName} returned no data`);
  return json.data;
}

// Only the column IDs we actually read — passing `ids:` to column_values keeps
// Monday's GraphQL complexity well under budget.
const PLAN_COLUMN_IDS = [
  "long_text_mkwe3bs4", // Notes
  "text_mkwexq19", // M NICK
  "text_mkwe44bc", // M DYLAN
  "text_mkwe54gw", // T NICK
  "text_mkwe2vqg", // T DYLAN
  "text_mky6fdym", // W NICK
  "text_mky67jq5", // W DYLAN
  "text_mkyejh95", // Thu NICK
  "text_mkye6mpw", // Thu DYLAN
  "connect_boards__1", // Linked orders
];

// Single board-level items_page — much cheaper than iterating groups, and
// gentle on Monday's rate limits (1 request per page of 100, vs 1 per group).
// Group membership comes in on each item via `group { id title }`.
const GET_PLAN_PAGE = `
  query GetProductionPlan($boardId: [ID!], $cursor: String, $columnIds: [String!]) {
    boards(ids: $boardId) {
      id
      items_page(limit: 100, cursor: $cursor) {
        cursor
        items {
          id
          name
          updated_at
          group { id title }
          column_values(ids: $columnIds) {
            id
            type
            text
            value
            ... on BoardRelationValue {
              linked_items {
                id
                name
                board { id name }
              }
            }
          }
        }
      }
    }
  }
`;

type LinkedItemsFragment = {
  linked_items?: Array<{
    id: string;
    name: string;
    board: { id: string; name: string };
  }>;
};

type RawColumnValue = {
  id: string;
  type: string;
  text: string | null;
  value: string | null;
} & LinkedItemsFragment;

type RawItem = {
  id: string;
  name: string;
  updated_at: string;
  column_values: RawColumnValue[];
};

type RawItemWithGroup = RawItem & {
  group: { id: string; title: string } | null;
};

type GetPlanPageData = {
  boards: Array<{
    id: string;
    items_page: {
      cursor: string | null;
      items: RawItemWithGroup[];
    };
  }>;
};

/**
 * Fetches every item on the Production Plan board, preserving group membership
 * (each item carries its group id+title). Single paginated query, cursor-safe.
 */
export async function getProductionPlanRows(): Promise<PlanRow[]> {
  const boardId = process.env.MONDAY_PRODUCTION_BOARD_ID;
  if (!boardId) throw new Error("[monday] MONDAY_PRODUCTION_BOARD_ID not set");

  const rows: PlanRow[] = [];
  const groupSet = new Set<string>();
  let cursor: string | null = null;

  do {
    const data: GetPlanPageData = await graphql<GetPlanPageData>(
      "GetProductionPlan",
      GET_PLAN_PAGE,
      {
        boardId: [boardId],
        cursor,
        columnIds: PLAN_COLUMN_IDS,
      }
    );

    const page = data.boards[0]?.items_page;
    if (!page) break;

    for (const item of page.items) {
      const weekGroup = item.group ?? { id: "_ungrouped", title: "(no group)" };
      groupSet.add(weekGroup.id);

      const linkedByItemId = buildLinkedMap(item);
      const mondayItem: MondayItem = {
        id: item.id,
        name: item.name,
        updated_at: item.updated_at,
        column_values: item.column_values.map((c) => ({
          id: c.id,
          type: c.type,
          text: c.text,
          value: c.value,
        })),
      };
      rows.push(transformPlanItem(mondayItem, weekGroup, linkedByItemId));
    }

    cursor = page.cursor;
  } while (cursor);

  console.log(
    `[monday] GetProductionPlan board=${boardId} fetched ${rows.length} row(s) across ${groupSet.size} group(s)`
  );

  return rows;
}

function buildLinkedMap(item: RawItem): RawLinkedOrdersByItemId {
  const map: RawLinkedOrdersByItemId = new Map();
  const col = item.column_values.find((c) => c.id === "connect_boards__1");
  const linked: PlanLinkedOrder[] = (col?.linked_items ?? []).map((l) => ({
    mondayItemId: l.id,
    name: l.name,
    boardId: l.board.id,
    boardName: l.board.name,
  }));
  map.set(item.id, linked);
  return map;
}
