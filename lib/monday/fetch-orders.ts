/**
 * High-level fetch layer for Orders.
 *
 * Three entry points:
 * - `getOrdersCached()` — TTL + tag-invalidated cache; the default read path.
 * - `getOrdersFresh()` — bypasses cache; used by the refresh endpoint and dry-run.
 * - `getOrdersWithFallback()` — tries cached; on Monday failure, reads the Blob snapshot.
 *
 * The snapshot write is a side-effect of `getOrdersFresh()` when `writeSnapshot=true`.
 */

import { unstable_cache } from "next/cache";
import { getOrders } from "./client";
import { transformAllOrders, type UiOrder, type TransformWarning } from "./mapping";
import { writeSnapshot, readSnapshot } from "./snapshot-blob";

export const ORDERS_CACHE_TAG = "monday-orders";
const CACHE_REVALIDATE_SECONDS = 15 * 60; // 15 minutes

export type OrdersFetchResult = {
  syncedAt: string;
  items: UiOrder[];
  warnings: TransformWarning[];
  source: "fresh" | "cache" | "snapshot" | "none";
  mondayError?: string;
};

async function fetchAndTransform(): Promise<OrdersFetchResult> {
  const raw = await getOrders();
  const { orders, warnings } = transformAllOrders(raw);
  return {
    syncedAt: new Date().toISOString(),
    items: orders,
    warnings,
    source: "fresh",
  };
}

// Cached variant — invalidated by `revalidateTag(ORDERS_CACHE_TAG)` in the webhook.
// 15-minute TTL is the backstop if webhooks miss.
const cachedFetch = unstable_cache(
  async (): Promise<OrdersFetchResult> => {
    const result = await fetchAndTransform();
    return { ...result, source: "cache" };
  },
  ["monday-orders-v1"],
  {
    tags: [ORDERS_CACHE_TAG],
    revalidate: CACHE_REVALIDATE_SECONDS,
  }
);

export async function getOrdersCached(): Promise<OrdersFetchResult> {
  return cachedFetch();
}

export async function getOrdersFresh(
  opts: { writeSnapshot?: boolean } = {}
): Promise<OrdersFetchResult> {
  const result = await fetchAndTransform();
  if (opts.writeSnapshot) {
    try {
      await writeSnapshot({
        syncedAt: result.syncedAt,
        itemCount: result.items.length,
        items: result.items,
        warnings: result.warnings,
      });
    } catch (err) {
      // Non-fatal — logged; the fetch still succeeded, snapshot is a debug aid.
      console.log(
        `[monday] writeSnapshot failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return result;
}

export async function getOrdersWithFallback(): Promise<OrdersFetchResult> {
  try {
    return await getOrdersCached();
  } catch (err) {
    const mondayError = err instanceof Error ? err.message : String(err);
    console.log(`[monday] cached fetch failed, trying snapshot: ${mondayError}`);
    const snap = await readSnapshot();
    if (snap) {
      return {
        syncedAt: snap.syncedAt,
        items: snap.items,
        warnings: snap.warnings,
        source: "snapshot",
        mondayError,
      };
    }
    return {
      syncedAt: new Date().toISOString(),
      items: [],
      warnings: [],
      source: "none",
      mondayError,
    };
  }
}
