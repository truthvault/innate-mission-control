/**
 * Manual refresh endpoint.
 *
 *   GET  /api/monday/refresh?dryRun=1&scope=orders|plan|all
 *     Fetch + transform, return JSON, no writes, no cache invalidation.
 *
 *   POST /api/monday/refresh?scope=orders|plan|all  (scope defaults to "all")
 *     Fetch + transform, write snapshot Blob, invalidate cache tags + paths, return result.
 *
 * Both paths are protected by the app's auth middleware (site password cookie).
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { getOrdersFresh, ORDERS_CACHE_TAG } from "@/lib/monday/fetch-orders";
import { getPlanFresh, PLAN_CACHE_TAG } from "@/lib/monday/fetch-plan";

export const dynamic = "force-dynamic";

type Scope = "orders" | "plan" | "all";

function parseScope(url: URL): Scope {
  const raw = url.searchParams.get("scope");
  if (raw === "orders" || raw === "plan") return raw;
  return "all";
}

export async function GET(request: Request) {
  const started = Date.now();
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const scope = parseScope(url);

  if (!dryRun) {
    return Response.json(
      {
        ok: false,
        error: "GET is dry-run only. Use ?dryRun=1, or POST to force a real refresh.",
      },
      { status: 400 }
    );
  }

  try {
    const wantOrders = scope === "orders" || scope === "all";
    const wantPlan = scope === "plan" || scope === "all";

    const [orders, plan] = await Promise.all([
      wantOrders
        ? getOrdersFresh({ writeSnapshot: false })
        : Promise.resolve(null),
      wantPlan ? getPlanFresh({ writeSnapshot: false }) : Promise.resolve(null),
    ]);

    return Response.json({
      ok: true,
      dryRun: true,
      scope,
      elapsedMs: Date.now() - started,
      orders: orders && {
        syncedAt: orders.syncedAt,
        itemCount: orders.items.length,
        itemIds: orders.items.map((o) => o.id),
        warnings: orders.warnings,
        items: orders.items,
      },
      plan: plan && {
        syncedAt: plan.syncedAt,
        rowCount: plan.rows.length,
        rows: plan.rows,
      },
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        scope,
        error: err instanceof Error ? err.message : String(err),
        elapsedMs: Date.now() - started,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const started = Date.now();
  const url = new URL(request.url);
  const scope = parseScope(url);

  try {
    const wantOrders = scope === "orders" || scope === "all";
    const wantPlan = scope === "plan" || scope === "all";

    const [orders, plan] = await Promise.all([
      wantOrders ? getOrdersFresh({ writeSnapshot: true }) : Promise.resolve(null),
      wantPlan ? getPlanFresh({ writeSnapshot: true }) : Promise.resolve(null),
    ]);

    if (wantOrders) {
      revalidateTag(ORDERS_CACHE_TAG, "max");
      revalidatePath("/production");
    }
    if (wantPlan) {
      revalidateTag(PLAN_CACHE_TAG, "max");
      revalidatePath("/production/plan");
    }

    console.log(
      `[monday] Manual refresh complete — scope=${scope} orders=${
        orders?.items.length ?? "skip"
      } plan=${plan?.rows.length ?? "skip"} elapsed=${Date.now() - started}ms`
    );

    return Response.json({
      ok: true,
      scope,
      elapsedMs: Date.now() - started,
      orders: orders && {
        syncedAt: orders.syncedAt,
        itemCount: orders.items.length,
        warnings: orders.warnings,
      },
      plan: plan && {
        syncedAt: plan.syncedAt,
        rowCount: plan.rows.length,
      },
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        scope,
        error: err instanceof Error ? err.message : String(err),
        elapsedMs: Date.now() - started,
      },
      { status: 500 }
    );
  }
}
