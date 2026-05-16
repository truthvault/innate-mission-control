/**
 * Cached / fresh / fallback fetch layer for Samples stock.
 */

import { unstable_cache } from "next/cache";
import { put, get, BlobNotFoundError } from "@vercel/blob";
import { getSampleStockBoard } from "./sample-stock";
import type { SampleStockBoard } from "./sample-stock-types";

export const SAMPLE_STOCK_CACHE_TAG = "monday-sample-stock";
const CACHE_REVALIDATE_SECONDS = 15 * 60;
const SNAPSHOT_PATH = "debug/sample-stock-latest.json";

export type SampleStockFetchResult = {
  syncedAt: string;
  board: SampleStockBoard | null;
  source: "fresh" | "cache" | "snapshot" | "none";
  mondayError?: string;
};

type SampleStockSnapshot = {
  syncedAt: string;
  board: SampleStockBoard;
};

async function fetchFresh(): Promise<SampleStockFetchResult> {
  const board = await getSampleStockBoard();
  return {
    syncedAt: new Date().toISOString(),
    board,
    source: "fresh",
  };
}

const cachedFetch = unstable_cache(
  async (): Promise<SampleStockFetchResult> => {
    const result = await fetchFresh();
    return { ...result, source: "cache" };
  },
  ["monday-sample-stock-v1"],
  { tags: [SAMPLE_STOCK_CACHE_TAG], revalidate: CACHE_REVALIDATE_SECONDS }
);

export async function getSampleStockCached(): Promise<SampleStockFetchResult> {
  return cachedFetch();
}

export async function getSampleStockFresh(
  opts: { writeSnapshot?: boolean } = {}
): Promise<SampleStockFetchResult> {
  const result = await fetchFresh();
  if (opts.writeSnapshot && result.board) {
    try {
      const snap: SampleStockSnapshot = {
        syncedAt: result.syncedAt,
        board: result.board,
      };
      const body = JSON.stringify(snap);
      await put(SNAPSHOT_PATH, body, {
        access: "private",
        contentType: "application/json",
        allowOverwrite: true,
        addRandomSuffix: false,
      });
      console.log(
        `[monday] Sample stock snapshot written (${body.length}b, cells=${result.board.cells.length})`
      );
    } catch (err) {
      console.log(
        `[monday] sample-stock writeSnapshot failed (non-fatal): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
  return result;
}

async function readSnapshot(): Promise<SampleStockSnapshot | null> {
  try {
    const result = await get(SNAPSHOT_PATH, { access: "private" });
    if (!result || result.stream == null) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as SampleStockSnapshot;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    console.log(
      `[monday] sample-stock readSnapshot failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

export async function getSampleStockWithFallback(): Promise<SampleStockFetchResult> {
  try {
    return await getSampleStockCached();
  } catch (err) {
    const mondayError = err instanceof Error ? err.message : String(err);
    console.log(`[monday] sample-stock cached fetch failed, trying snapshot: ${mondayError}`);
    const snap = await readSnapshot();
    if (snap) {
      return {
        syncedAt: snap.syncedAt,
        board: snap.board,
        source: "snapshot",
        mondayError,
      };
    }
    return {
      syncedAt: new Date().toISOString(),
      board: null,
      source: "none",
      mondayError,
    };
  }
}
