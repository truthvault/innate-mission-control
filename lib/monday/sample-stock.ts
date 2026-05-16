/**
 * Read-only Monday fetcher + transform for the Samples stock board.
 * Board shape as of May 2026:
 * - groups = sample type buckets (Large boards, Designer samples, Customer samples)
 * - items = timber species (Rimu, Totara, Beech)
 * - numeric columns = finish counts (Clear, Country Bark, Black Wash)
 */

import { assertReadOnlyBody } from "./read-only-guard";
import {
  FINISHES,
  SPECIES,
  type SampleStockBoard,
  type SampleStockCell,
  type SampleStockSummary,
  type StockLevel,
} from "./sample-stock-types";

const MONDAY_GRAPHQL_URL = "https://api.monday.com/v2";
export const DEFAULT_SAMPLE_STOCK_BOARD_ID = "18412532131";

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; [k: string]: unknown }>;
};

type RawColumn = {
  id: string;
  title: string;
  type: string;
};

type RawColumnValue = {
  id: string;
  text: string | null;
  value: string | null;
};

type RawItem = {
  id: string;
  name: string;
  group: { id: string; title: string } | null;
  column_values: RawColumnValue[];
};

type GetSampleStockData = {
  boards: Array<{
    id: string;
    name: string;
    columns: RawColumn[];
    items_page: {
      cursor: string | null;
      items: RawItem[];
    };
  }>;
};

async function graphql<T>(operationName: string, query: string, variables: Record<string, unknown>): Promise<T> {
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
    throw new Error(`[monday] ${operationName} GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  if (!json.data) throw new Error(`[monday] ${operationName} returned no data`);
  return json.data;
}

const GET_SAMPLE_STOCK_PAGE = `
  query GetSampleStock($boardId: [ID!], $cursor: String) {
    boards(ids: $boardId) {
      id
      name
      columns { id title type }
      items_page(limit: 100, cursor: $cursor) {
        cursor
        items {
          id
          name
          group { id title }
          column_values {
            id
            text
            value
          }
        }
      }
    }
  }
`;

export async function getSampleStockBoard(): Promise<SampleStockBoard> {
  const boardId = process.env.MONDAY_SAMPLE_STOCK_BOARD_ID ?? DEFAULT_SAMPLE_STOCK_BOARD_ID;
  const rawItems: RawItem[] = [];
  let boardName = "Samples stock";
  let columns: RawColumn[] = [];
  let cursor: string | null = null;

  do {
    const data: GetSampleStockData = await graphql<GetSampleStockData>("GetSampleStock", GET_SAMPLE_STOCK_PAGE, {
      boardId: [boardId],
      cursor,
    });
    const board: GetSampleStockData["boards"][number] | undefined = data.boards[0];
    if (!board) throw new Error(`[monday] GetSampleStock returned no board for ${boardId}`);
    boardName = board.name;
    columns = board.columns;
    rawItems.push(...board.items_page.items);
    cursor = board.items_page.cursor;
  } while (cursor);

  const finishColumnIds = new Map<string, string>();
  for (const finish of FINISHES) {
    const match = columns.find((c) => c.title.trim().toLowerCase() === finish.toLowerCase());
    if (match) finishColumnIds.set(finish, match.id);
  }

  const cells: SampleStockCell[] = [];
  for (const item of rawItems) {
    const sampleType = item.group?.title ?? "Ungrouped";
    const species = item.name.trim();
    for (const finish of FINISHES) {
      const colId = finishColumnIds.get(finish);
      const raw = colId ? item.column_values.find((c) => c.id === colId)?.text : null;
      const count = parseCount(raw);
      cells.push({
        sampleType,
        species,
        finish,
        count,
        level: stockLevel(count),
        mondayItemId: item.id,
        mondayUrl: `https://innatefurniture.monday.com/boards/${boardId}/pulses/${item.id}`,
      });
    }
  }

  return {
    boardId,
    boardName,
    cells,
    summary: summarize(cells),
  };
}

function parseCount(text: string | null | undefined): number {
  if (!text) return 0;
  const n = Number.parseInt(text.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function stockLevel(count: number): StockLevel {
  if (count <= 0) return "out";
  if (count <= 2) return "low";
  return "ok";
}

function summarize(cells: SampleStockCell[]): SampleStockSummary {
  const total = cells.reduce((sum, c) => sum + c.count, 0);
  const outCount = cells.filter((c) => c.level === "out").length;
  const lowCount = cells.filter((c) => c.level === "low").length;
  const okCount = cells.filter((c) => c.level === "ok").length;
  const topUps = cells
    .filter((c) => c.level !== "ok")
    .sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.sampleType.localeCompare(b.sampleType) || a.species.localeCompare(b.species));

  return {
    total,
    outCount,
    lowCount,
    okCount,
    readyFullSets: countReadyFullSets(cells),
    byType: groupSummary(cells, "sampleType"),
    byFinish: groupSummary(cells, "finish"),
    topUps,
  };
}

function countReadyFullSets(cells: SampleStockCell[]): number {
  return Array.from(new Set(cells.map((c) => c.sampleType))).filter((sampleType) =>
    SPECIES.every((species) => FINISHES.every((finish) => cells.some((c) => c.sampleType === sampleType && c.species === species && c.finish === finish && c.count > 0)))
  ).length;
}

function groupSummary(cells: SampleStockCell[], key: "sampleType" | "finish") {
  return Array.from(new Set(cells.map((c) => c[key]))).map((name) => {
    const group = cells.filter((c) => c[key] === name);
    return {
      [key]: name,
      total: group.reduce((sum, c) => sum + c.count, 0),
      outCount: group.filter((c) => c.level === "out").length,
      lowCount: group.filter((c) => c.level === "low").length,
      okCount: group.filter((c) => c.level === "ok").length,
    } as { sampleType: string; total: number; outCount: number; lowCount: number; okCount: number } & { finish: string };
  });
}

function levelRank(level: StockLevel): number {
  if (level === "out") return 0;
  if (level === "low") return 1;
  return 2;
}
