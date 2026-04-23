/**
 * Cached / fresh / fallback fetch layer for Production Plan rows.
 * Mirrors the shape of fetch-orders.ts with its own tag + snapshot path.
 */

import { unstable_cache } from "next/cache";
import { put, get, BlobNotFoundError } from "@vercel/blob";
import { getProductionPlanRows } from "./production-plan";
import type { PlanRow } from "./production-plan-mapping";

export const PLAN_CACHE_TAG = "monday-production-plan";
const CACHE_REVALIDATE_SECONDS = 15 * 60;
const SNAPSHOT_PATH = "debug/plan-latest.json";

export type PlanFetchResult = {
  syncedAt: string;
  rows: PlanRow[];
  source: "fresh" | "cache" | "snapshot" | "none";
  mondayError?: string;
};

type PlanSnapshot = {
  syncedAt: string;
  rowCount: number;
  rows: PlanRow[];
};

async function fetchFresh(): Promise<PlanFetchResult> {
  const rows = await getProductionPlanRows();
  return {
    syncedAt: new Date().toISOString(),
    rows,
    source: "fresh",
  };
}

const cachedFetch = unstable_cache(
  async (): Promise<PlanFetchResult> => {
    const result = await fetchFresh();
    return { ...result, source: "cache" };
  },
  ["monday-production-plan-v1"],
  { tags: [PLAN_CACHE_TAG], revalidate: CACHE_REVALIDATE_SECONDS }
);

export async function getPlanCached(): Promise<PlanFetchResult> {
  return cachedFetch();
}

export async function getPlanFresh(
  opts: { writeSnapshot?: boolean } = {}
): Promise<PlanFetchResult> {
  const result = await fetchFresh();
  if (opts.writeSnapshot) {
    try {
      const snap: PlanSnapshot = {
        syncedAt: result.syncedAt,
        rowCount: result.rows.length,
        rows: result.rows,
      };
      const body = JSON.stringify(snap);
      await put(SNAPSHOT_PATH, body, {
        access: "private",
        contentType: "application/json",
        allowOverwrite: true,
        addRandomSuffix: false,
      });
      console.log(
        `[monday] Plan snapshot written (${body.length}b, rows=${result.rows.length})`
      );
    } catch (err) {
      console.log(
        `[monday] plan writeSnapshot failed (non-fatal): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
  return result;
}

async function readSnapshot(): Promise<PlanSnapshot | null> {
  try {
    const result = await get(SNAPSHOT_PATH, { access: "private" });
    if (!result || result.stream == null) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as PlanSnapshot;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    console.log(
      `[monday] plan readSnapshot failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

export async function getPlanWithFallback(): Promise<PlanFetchResult> {
  try {
    return await getPlanCached();
  } catch (err) {
    const mondayError = err instanceof Error ? err.message : String(err);
    console.log(`[monday] plan cached fetch failed, trying snapshot: ${mondayError}`);
    const snap = await readSnapshot();
    if (snap) {
      return {
        syncedAt: snap.syncedAt,
        rows: snap.rows,
        source: "snapshot",
        mondayError,
      };
    }
    return {
      syncedAt: new Date().toISOString(),
      rows: [],
      source: "none",
      mondayError,
    };
  }
}
