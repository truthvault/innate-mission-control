/**
 * Monday → app mapping for the Production Plan board (id 7301377614).
 *
 * Structure (confirmed from live data on 2026-04-23):
 *   - Monday GROUPS = weeks. e.g. "April 20 - 23", "April 27 -30", "Done and dusted".
 *   - Each ITEM within a group = a topic/job to work on during that week.
 *   - 8 TEXT columns per item = sparse per-day-per-person task fragments.
 *   - `connect_boards__1` = optional link to an Orders board row.
 *
 * Every transformed row preserves the raw Monday values alongside derived fields.
 */

import type { MondayItem } from "./client";

// Column ID map — hardcoded because Monday's board has two columns titled "T NICK"
// and two titled "T DYLAN" (Tuesday vs Thursday). Only the column ID disambiguates.
export const PLAN_COLUMNS = {
  name: "name",
  notes: "long_text_mkwe3bs4",
  linkedOrders: "connect_boards__1",
  lastUpdated: "pulse_updated_mm0wzeh7",
  // 4 days × 2 people, each cell a free-text column.
  days: {
    monday: { nick: "text_mkwexq19", dylan: "text_mkwe44bc" },
    tuesday: { nick: "text_mkwe54gw", dylan: "text_mkwe2vqg" },
    wednesday: { nick: "text_mky6fdym", dylan: "text_mky67jq5" },
    thursday: { nick: "text_mkyejh95", dylan: "text_mkye6mpw" },
  },
} as const;

export type DayKey = keyof typeof PLAN_COLUMNS.days;
export type Person = "nick" | "dylan";

export const DAYS: readonly DayKey[] = ["monday", "tuesday", "wednesday", "thursday"];
export const PEOPLE: readonly Person[] = ["nick", "dylan"];

/** A `connect_boards__1` entry as returned by Monday. */
export type PlanLinkedOrder = {
  mondayItemId: string;
  name: string;
  boardId: string;
  boardName: string;
};

export type PlanRow = {
  id: string;
  name: string;
  weekGroupId: string;
  weekGroupTitle: string;
  notes: string | null;
  mondayUrl: string;
  updatedAt: string;
  /** Raw day-cell text, null when empty. */
  dayTasks: Record<DayKey, Record<Person, string | null>>;
  /** All connected orders, regardless of which Orders board they live on. */
  linkedOrders: PlanLinkedOrder[];
  /**
   * True when at least one linked order's board matches MONDAY_ORDERS_BOARD_ID
   * (i.e. it IS in our Phase 1 sync). Used to decide whether to render as a
   * clickable cross-link or plain text per Guido's rule.
   */
  hasAppLinkedOrder: boolean;
};

export type DayTask = {
  text: string;
  day: DayKey;
  person: Person;
  sourceRowId: string;
  sourceRowName: string;
  sourceRowUrl: string;
  linkedAppOrderId: number | null;
  linkedOrdersText: string | null;
};

export type PlanGrid = Record<DayKey, Record<Person, DayTask[]>>;

function columnText(item: MondayItem, columnId: string): string | null {
  const col = item.column_values.find((c) => c.id === columnId);
  const raw = col?.text?.trim();
  return raw ? raw : null;
}

/**
 * `connect_boards__1` values come in via the `BoardRelationValue` GraphQL
 * fragment (queried in lib/monday/production-plan.ts), not via plain text/value
 * on the column. The caller builds this map and passes it in.
 */
export type RawLinkedOrdersByItemId = Map<string, PlanLinkedOrder[]>;

export function transformPlanItem(
  item: MondayItem,
  weekGroup: { id: string; title: string },
  linkedByItemId: RawLinkedOrdersByItemId
): PlanRow {
  const linkedOrders = linkedByItemId.get(item.id) ?? [];
  const ordersBoardId = process.env.MONDAY_ORDERS_BOARD_ID;
  const hasAppLinkedOrder = ordersBoardId
    ? linkedOrders.some((l) => l.boardId === ordersBoardId)
    : false;

  const dayTasks: PlanRow["dayTasks"] = {
    monday: {
      nick: columnText(item, PLAN_COLUMNS.days.monday.nick),
      dylan: columnText(item, PLAN_COLUMNS.days.monday.dylan),
    },
    tuesday: {
      nick: columnText(item, PLAN_COLUMNS.days.tuesday.nick),
      dylan: columnText(item, PLAN_COLUMNS.days.tuesday.dylan),
    },
    wednesday: {
      nick: columnText(item, PLAN_COLUMNS.days.wednesday.nick),
      dylan: columnText(item, PLAN_COLUMNS.days.wednesday.dylan),
    },
    thursday: {
      nick: columnText(item, PLAN_COLUMNS.days.thursday.nick),
      dylan: columnText(item, PLAN_COLUMNS.days.thursday.dylan),
    },
  };

  return {
    id: item.id,
    name: item.name,
    weekGroupId: weekGroup.id,
    weekGroupTitle: weekGroup.title,
    notes: columnText(item, PLAN_COLUMNS.notes),
    mondayUrl: `https://innate-furniture.monday.com/boards/${
      process.env.MONDAY_PRODUCTION_BOARD_ID ?? "7301377614"
    }/pulses/${item.id}`,
    updatedAt: item.updated_at,
    dayTasks,
    linkedOrders,
    hasAppLinkedOrder,
  };
}

/**
 * Collapse a flat list of PlanRows for a single week into a 4-days × 2-people grid
 * of DayTasks. Rows without any day-column content are not represented in the grid
 * (they remain visible only in the list view).
 */
export function derivePlanGrid(rowsForOneWeek: PlanRow[]): PlanGrid {
  const ordersBoardId = process.env.MONDAY_ORDERS_BOARD_ID;
  const grid: PlanGrid = {
    monday: { nick: [], dylan: [] },
    tuesday: { nick: [], dylan: [] },
    wednesday: { nick: [], dylan: [] },
    thursday: { nick: [], dylan: [] },
  };

  for (const row of rowsForOneWeek) {
    const linkedAppOrder = ordersBoardId
      ? row.linkedOrders.find((l) => l.boardId === ordersBoardId)
      : undefined;
    const linkedOrdersText =
      row.linkedOrders.length > 0
        ? row.linkedOrders.map((l) => l.name).join(" · ")
        : null;

    for (const day of DAYS) {
      for (const person of PEOPLE) {
        const text = row.dayTasks[day][person];
        if (!text) continue;
        grid[day][person].push({
          text,
          day,
          person,
          sourceRowId: row.id,
          sourceRowName: row.name,
          sourceRowUrl: row.mondayUrl,
          linkedAppOrderId: linkedAppOrder ? Number(linkedAppOrder.mondayItemId) : null,
          linkedOrdersText,
        });
      }
    }
  }

  return grid;
}

/**
 * Group the flat PlanRow[] by weekGroupId, preserving the order in which groups
 * first appear (which matches Monday's top-down group order in the query).
 */
export function groupPlanRowsByWeek(
  rows: PlanRow[]
): Array<{ id: string; title: string; rows: PlanRow[] }> {
  const order: string[] = [];
  const titles: Record<string, string> = {};
  const bucket: Record<string, PlanRow[]> = {};
  for (const row of rows) {
    if (!(row.weekGroupId in bucket)) {
      order.push(row.weekGroupId);
      titles[row.weekGroupId] = row.weekGroupTitle;
      bucket[row.weekGroupId] = [];
    }
    bucket[row.weekGroupId].push(row);
  }
  return order.map((id) => ({ id, title: titles[id], rows: bucket[id] }));
}
