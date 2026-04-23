/**
 * Last-known-good snapshot of the transformed Orders list.
 *
 * Written on every successful refresh; read as a fallback when Monday is
 * unreachable and the cache is cold.
 *
 * Access is private — requires the store's read token; not publicly URL-accessible.
 */

import { put, get, BlobNotFoundError } from "@vercel/blob";
import type { UiOrder, TransformWarning } from "./mapping";

const SNAPSHOT_PATH = "debug/orders-latest.json";

export type OrdersSnapshot = {
  syncedAt: string;
  itemCount: number;
  items: UiOrder[];
  warnings: TransformWarning[];
};

export async function writeSnapshot(
  snapshot: OrdersSnapshot
): Promise<{ url: string; uploadedAt: string }> {
  const body = JSON.stringify(snapshot);
  const result = await put(SNAPSHOT_PATH, body, {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
  });
  const uploadedAt = new Date().toISOString();
  console.log(
    `[monday] Snapshot written → ${result.url} (${body.length}b, items=${snapshot.itemCount})`
  );
  return { url: result.url, uploadedAt };
}

export async function readSnapshot(): Promise<OrdersSnapshot | null> {
  try {
    const result = await get(SNAPSHOT_PATH, { access: "private" });
    if (!result || result.stream == null) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as OrdersSnapshot;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    console.log(
      `[monday] readSnapshot failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}
