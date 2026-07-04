import { MissionControlShell } from "@/components/mission-control-shell";
import { getFreightPublicAccessStatus } from "@/lib/freight/publicAccess";
import { getFreightQuoteLogStatus, listQuoteEvents, type FreightQuoteRow } from "@/lib/freight/quoteLog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Stat = {
  label: string;
  value: string;
  tone?: "normal" | "warn" | "good";
};

function money(value: number | undefined) {
  if (value === undefined) return "—";
  return `$${value.toLocaleString("en-NZ", { maximumFractionDigits: 0 })}`;
}

function timeAgo(iso: string) {
  if (!iso) return "—";
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return iso;
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-NZ", {
      timeZone: "Pacific/Auckland",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function productLabel(row: FreightQuoteRow) {
  const handleTitle = row.productHandle
    ? row.productHandle
        .split("-")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    : "Dining table";
  const variant = row.variantTitle && !/^default title$/i.test(row.variantTitle)
    ? row.variantTitle.replace(/\s*\/\s*/g, " · ")
    : "";
  return variant ? `${handleTitle} · ${variant}` : handleTitle;
}

function destinationLabel(row: FreightQuoteRow) {
  return row.addressEntered || [row.suburb, row.city, row.postCode].filter(Boolean).join(", ") || "—";
}

function deviceLabel(row: FreightQuoteRow) {
  const ua = row.userAgent || "";
  if (!ua) return "Unknown device";

  const device = /iphone/i.test(ua)
    ? "iPhone"
    : /ipad/i.test(ua)
      ? "iPad"
      : /android/i.test(ua)
        ? "Android"
        : /macintosh|mac os x/i.test(ua)
          ? "Mac"
          : /windows/i.test(ua)
            ? "Windows"
            : /linux/i.test(ua)
              ? "Linux"
              : "Device unknown";

  const browser = /crios/i.test(ua)
    ? "Chrome iOS"
    : /fxios/i.test(ua)
      ? "Firefox iOS"
      : /edgios/i.test(ua)
        ? "Edge iOS"
        : /chrome\//i.test(ua) && !/edg\//i.test(ua)
          ? "Chrome"
          : /safari/i.test(ua) && !/chrome|crios|android/i.test(ua)
            ? "Safari"
            : /firefox/i.test(ua)
              ? "Firefox"
              : /edg\//i.test(ua)
                ? "Edge"
                : "Browser unknown";

  return `${device} · ${browser}`;
}

function referrerLabel(row: FreightQuoteRow) {
  if (!row.referer) return "Direct / unknown";
  try {
    const url = new URL(row.referer);
    if (url.hostname.includes("innatefurniture.co.nz")) return `Innate site${url.pathname === "/" ? " home" : ` · ${url.pathname}`}`;
    return url.hostname;
  } catch {
    return row.referer.slice(0, 80);
  }
}

function locationDetailLabel(row: FreightQuoteRow) {
  const fields = [
    row.suburb ? `Suburb: ${row.suburb}` : "Suburb: —",
    row.city ? `City: ${row.city}` : "City: —",
    row.postCode ? `Postcode: ${row.postCode}` : "Postcode: —",
  ];
  return fields.join(" · ");
}

function uniqueVisitorCount(rows: FreightQuoteRow[]) {
  const keys = new Set<string>();
  rows.forEach((row) => {
    keys.add(row.clientIpHash || `${row.userAgent.slice(0, 42)}|${row.city || row.suburb}|${row.timestamp.slice(0, 10)}`);
  });
  return keys.size;
}

function locationCount(rows: FreightQuoteRow[]) {
  return new Set(rows.map((row) => `${row.suburb}|${row.city}|${row.postCode}`).filter((key) => key !== "||")).size;
}

function topDeviceLabel(rows: FreightQuoteRow[]) {
  if (!rows.length) return "—";
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const label = deviceLabel(row).split(" · ")[0] || "Unknown";
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  const [label, count] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0] || ["—", 0];
  return count ? `${label} · ${count}` : "—";
}

function calcStats(rows: FreightQuoteRow[]): Stat[] {
  const total = rows.length;
  const manual = rows.filter((row) => row.manualCheckOffered).length;
  const estimated = rows.filter((row) => row.status === "estimated").length;
  const latest = rows[0]?.timestamp ? timeAgo(rows[0].timestamp) : "—";
  const pricedRows = rows.filter((row) => row.estimateInclGst !== undefined);
  const avg = pricedRows.length
    ? Math.round(pricedRows.reduce((sum, row) => sum + (row.estimateInclGst || 0), 0) / pricedRows.length)
    : 0;

  return [
    { label: "Freight checks", value: String(total), tone: "normal" },
    { label: "Likely visitors", value: String(uniqueVisitorCount(rows)), tone: "normal" },
    { label: "Locations", value: String(locationCount(rows)), tone: "normal" },
    { label: "Top device", value: topDeviceLabel(rows), tone: "normal" },
    { label: "Successful estimates", value: String(estimated), tone: "good" },
    { label: "Average shown", value: avg ? money(avg) : "—", tone: "normal" },
    { label: "Manual-check prompts", value: String(manual), tone: manual ? "warn" : "normal" },
    { label: "Latest", value: latest, tone: "normal" },
  ];
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function FilterLink({ href, active, children }: { href: string; active?: boolean; children: string }) {
  return <a className={`filter-link ${active ? "filter-link--active" : ""}`} href={href}>{children}</a>;
}

function QuoteCard({ row }: { row: FreightQuoteRow }) {
  return (
    <article className={`quote-card ${row.manualCheckOffered ? "quote-card--warn" : ""}`}>
      <div className="quote-card__topline">
        <span>{formatDate(row.timestamp)}</span>
        <span className={`pill ${row.isInternalTest ? "pill--warn" : row.manualCheckOffered ? "pill--warn" : "pill--ok"}`}>
          {row.isInternalTest ? "Internal/test" : row.manualCheckOffered ? "Manual check offered" : row.status || "logged"}
        </span>
      </div>
      <div className="quote-card__main">
        <div>
          <h2>{productLabel(row)}</h2>
          <p className="muted">{destinationLabel(row)}</p>
        </div>
        <div className="price">{money(row.estimateInclGst)}</div>
      </div>
      <dl className="grid">
        <div>
          <dt>Size</dt>
          <dd>
            {row.tableLengthMm ? `${row.tableLengthMm} × ${row.tableWidthMm || 1000}mm` : "—"}
          </dd>
        </div>
        <div>
          <dt>Benches</dt>
          <dd>{row.benchCount ?? 0}</dd>
        </div>
        <div>
          <dt>Device</dt>
          <dd>{deviceLabel(row)}</dd>
        </div>
        <div>
          <dt>Arrived from</dt>
          <dd>{referrerLabel(row)}</dd>
        </div>
        <div>
          <dt>Location fields</dt>
          <dd>{locationDetailLabel(row)}</dd>
        </div>
        <div>
          <dt>Mainfreight raw</dt>
          <dd>{money(row.rawMainfreightInclGst)}</dd>
        </div>
        <div>
          <dt>Package total</dt>
          <dd>
            {row.packageItems ?? "—"} items · {row.totalCubicMetres ?? "—"}m³ · {row.totalWeightKg ?? "—"}kg
          </dd>
        </div>
      </dl>
      {row.packageSummary ? <p className="packages">{row.packageSummary}</p> : null}
      <p className="packages">
        Source: {row.source || "—"}{row.internalTestReasons?.length ? ` · Test reasons: ${row.internalTestReasons.join(", ")}` : ""}
      </p>
      {row.pageUrl ? (
        <a className="source-link" href={row.pageUrl} target="_blank" rel="noreferrer">
          Open product page
        </a>
      ) : null}
    </article>
  );
}

export default async function FreightQuotesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const internalParam = firstParam(params.internal);
  const areaParam = firstParam(params.area);
  const includeInternal = internalParam === "1" || internalParam === "true";
  const area = areaParam || undefined;
  const { rows, error } = await listQuoteEvents(75, { includeInternal, productArea: area });
  const stats = calcStats(rows);
  const logStatus = getFreightQuoteLogStatus();
  const publicAccessStatus = getFreightPublicAccessStatus();
  const activeStore = logStatus.supabaseConfigured ? "Supabase" : "not configured";

  return (
    <MissionControlShell
      section="freight"
      pageTitle="Freight quotes"
      pageSubtitle="Customer freight-calculator signal and quote-log health. Guido-only so Nick/Dylan stay focused on workshop work."
      syncedAt={new Date().toISOString()}
      source={logStatus.supabaseConfigured ? "supabase" : "none"}
      mondayError={error || undefined}
    >
      <div className="page">
      <style>{`
        :root{color-scheme:light;background:#f5f3ee;color:#27221b;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        body{margin:0;background:#f5f3ee;color:#27221b}
        .page{max-width:1180px;margin:0 auto;padding:34px 20px 56px}
        .eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#7c746b;margin:0 0 10px}
        h1{font-family:Georgia,serif;font-size:clamp(34px,6vw,62px);line-height:.95;margin:0 0 12px;font-weight:500;color:#27221b}
        .intro{max-width:760px;color:#5a5549;font-size:17px;line-height:1.55;margin:0 0 24px}
        .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin:24px 0 26px}
        .stat{background:#ffffff;border:1px solid #e8e2d7;padding:15px 16px;border-radius:16px;box-shadow:0 12px 30px rgba(39,34,27,.06)}
        .stat span{display:block;color:#7c746b;font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}.stat strong{font-size:25px}
        .stat--warn strong{color:#8a5b1f}.stat--good strong{color:#2f6e47}
        .control-panel{display:grid;grid-template-columns:1.4fr .9fr;gap:14px;margin:0 0 24px}.panel{background:#ffffff;border:1px solid #e8e2d7;border-radius:18px;padding:16px;box-shadow:0 12px 30px rgba(39,34,27,.06)}
        .panel h2{font-size:16px;margin:0 0 8px}.panel p{margin:0;color:#5a5549;line-height:1.45}.filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.filter-link{border:1px solid #d7cdbd;border-radius:999px;padding:7px 11px;color:#27221b;text-decoration:none;font-size:13px;background:#f7f5ef}.filter-link--active{background:#27221b;color:#ffffff;border-color:#27221b}
        .status-list{display:grid;gap:8px}.status-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e8e2d7;padding-bottom:7px}.status-row:last-child{border-bottom:0;padding-bottom:0}.status-row span{color:#7c746b}.status-row strong{text-align:right}
        .error{background:#f7f5ef;border:1px solid #e7bbb4;color:#783716;padding:14px 16px;border-radius:14px;margin:16px 0}
        .empty{background:#ffffff;border:1px solid #e8e2d7;border-radius:18px;padding:28px;color:#5a5549}
        .quotes{display:grid;gap:14px}
        .quote-card{background:#ffffff;border:1px solid #e8e2d7;border-radius:18px;padding:18px;box-shadow:0 14px 34px rgba(39,34,27,.07)}
        .quote-card--warn{border-color:#c8a96e;background:#ffffffdf9}
        .quote-card__topline,.quote-card__main{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.quote-card__topline{font-size:13px;color:#7c746b;margin-bottom:13px}
        .quote-card h2{margin:0 0 5px;font-size:20px;line-height:1.2}.muted{margin:0;color:#5a5549}.price{font-size:34px;font-weight:750;white-space:nowrap}
        .pill{display:inline-flex;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:700}.pill--ok{background:#edf4ed;color:#285537}.pill--warn{background:#ead7a7;color:#8a5b1f}
        .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:17px 0 0}.grid div{background:#f7f5ef;border-radius:12px;padding:10px}.grid dt{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#7c746b;margin-bottom:4px}.grid dd{margin:0;font-weight:650;color:#27221b}
        .packages{margin:13px 0 0;color:#5a5549;font-size:13px;line-height:1.45}.source-link{display:inline-block;margin-top:12px;color:#27221b;text-decoration-thickness:1px;text-underline-offset:3px}
        @media(max-width:850px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.control-panel{grid-template-columns:1fr}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.quote-card__main{display:block}.price{margin-top:12px}.quote-card__topline{display:block}.pill{margin-top:8px}}
      `}</style>
      <p className="eyebrow">Tuesday · Freight / Shipping</p>
      <h1>Freight & shipping</h1>
      <p className="intro">
        A running record of what people enter into the website freight calculator: address, product details, customer-facing estimate, raw carrier result where available, and whether the quote needs manual checking. This is the seed of Tuesday&apos;s freight/shipping tab.
      </p>

      <section className="control-panel" aria-label="Freight log controls">
        <div className="panel">
          <h2>Quote log view</h2>
          <p>Default view shows customer-classified rows only. Internal/test traffic is kept separate so the website signal stays clean. Use the chips below for quick freight/shipping slices.</p>
          <div className="filters">
            <FilterLink href="/freight-quotes" active={!area && !includeInternal}>Customer signal</FilterLink>
            <FilterLink href="/freight-quotes?internal=1" active={includeInternal && !area}>Include internal/tests</FilterLink>
            <FilterLink href="/freight-quotes?area=dining" active={area === "dining"}>Dining</FilterLink>
            <FilterLink href="/freight-quotes?area=benchtop" active={area === "benchtop"}>Benchtops</FilterLink>
            <FilterLink href="/freight-quotes?area=outdoor" active={area === "outdoor"}>Outdoor</FilterLink>
          </div>
        </div>
        <div className="panel">
          <h2>Logging status</h2>
          <div className="status-list">
            <div className="status-row"><span>Write gate</span><strong>{logStatus.loggingEnabled ? "enabled" : "off"}</strong></div>
            <div className="status-row"><span>Primary store</span><strong>{activeStore}</strong></div>
            <div className="status-row"><span>Public token</span><strong>{publicAccessStatus.tokenConfigured ? "required" : "origin/referer only"}</strong></div>
            <div className="status-row"><span>Rate guard</span><strong>{publicAccessStatus.rateLimitEnabled ? "on" : "off"}</strong></div>
          </div>
        </div>
      </section>

      <section className="stats" aria-label="Quote log summary">
        {stats.map((stat) => (
          <div className={`stat ${stat.tone ? `stat--${stat.tone}` : ""}`} key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </section>

      {error ? <div className="error">{error}</div> : null}
      {!rows.length ? (
        <div className="empty">No quote checks logged yet. Run a freight estimate from the Shopify preview and refresh this page.</div>
      ) : (
        <section className="quotes" aria-label="Recent freight quote events">
          {rows.map((row) => (
            <QuoteCard row={row} key={row.id} />
          ))}
        </section>
      )}
      </div>
    </MissionControlShell>
  );
}
