import { listQuoteEvents, type FreightQuoteRow } from "@/lib/freight/quoteLog";

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

function calcStats(rows: FreightQuoteRow[]): Stat[] {
  const total = rows.length;
  const manual = rows.filter((row) => row.manualCheckOffered).length;
  const estimated = rows.filter((row) => row.status === "estimated").length;
  const latest = rows[0]?.timestamp ? timeAgo(rows[0].timestamp) : "—";
  const avg = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + (row.estimateInclGst || 0), 0) / rows.filter((row) => row.estimateInclGst !== undefined).length || 0)
    : 0;

  return [
    { label: "Recent checks", value: String(total), tone: "normal" },
    { label: "Successful estimates", value: String(estimated), tone: "good" },
    { label: "Manual-check prompts", value: String(manual), tone: manual ? "warn" : "normal" },
    { label: "Latest", value: latest, tone: "normal" },
    { label: "Average shown", value: avg ? money(avg) : "—", tone: "normal" },
  ];
}

function QuoteCard({ row }: { row: FreightQuoteRow }) {
  return (
    <article className={`quote-card ${row.manualCheckOffered ? "quote-card--warn" : ""}`}>
      <div className="quote-card__topline">
        <span>{formatDate(row.timestamp)}</span>
        <span className={`pill ${row.manualCheckOffered ? "pill--warn" : "pill--ok"}`}>
          {row.manualCheckOffered ? "Manual check offered" : row.status || "logged"}
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
      {row.pageUrl ? (
        <a className="source-link" href={row.pageUrl} target="_blank" rel="noreferrer">
          Open product page
        </a>
      ) : null}
    </article>
  );
}

export default async function FreightQuotesPage() {
  const { rows, error } = await listQuoteEvents(75);
  const stats = calcStats(rows);

  return (
    <main className="page">
      <style>{`
        :root{color-scheme:light;background:#f4f1eb;color:#283229;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        body{margin:0;background:#f4f1eb;color:#283229}
        .page{max-width:1180px;margin:0 auto;padding:34px 20px 56px}
        .eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#6c7568;margin:0 0 10px}
        h1{font-family:Georgia,serif;font-size:clamp(34px,6vw,62px);line-height:.95;margin:0 0 12px;font-weight:500;color:#283229}
        .intro{max-width:760px;color:#586354;font-size:17px;line-height:1.55;margin:0 0 24px}
        .stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:24px 0 26px}
        .stat{background:#fff;border:1px solid #ded8cd;padding:15px 16px;border-radius:16px;box-shadow:0 12px 30px rgba(40,50,41,.06)}
        .stat span{display:block;color:#6c7568;font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}.stat strong{font-size:25px}
        .stat--warn strong{color:#9a5b20}.stat--good strong{color:#2f6e47}
        .error{background:#fff2ed;border:1px solid #f1b89f;color:#783716;padding:14px 16px;border-radius:14px;margin:16px 0}
        .empty{background:#fff;border:1px solid #ded8cd;border-radius:18px;padding:28px;color:#586354}
        .quotes{display:grid;gap:14px}
        .quote-card{background:#fff;border:1px solid #ded8cd;border-radius:18px;padding:18px;box-shadow:0 14px 34px rgba(40,50,41,.07)}
        .quote-card--warn{border-color:#d9aa74;background:#fffaf2}
        .quote-card__topline,.quote-card__main{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.quote-card__topline{font-size:13px;color:#6c7568;margin-bottom:13px}
        .quote-card h2{margin:0 0 5px;font-size:20px;line-height:1.2}.muted{margin:0;color:#596457}.price{font-size:34px;font-weight:750;white-space:nowrap}
        .pill{display:inline-flex;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:700}.pill--ok{background:#e8f0e8;color:#285537}.pill--warn{background:#f7dfbe;color:#76430f}
        .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:17px 0 0}.grid div{background:#f7f4ee;border-radius:12px;padding:10px}.grid dt{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#777f72;margin-bottom:4px}.grid dd{margin:0;font-weight:650;color:#283229}
        .packages{margin:13px 0 0;color:#596457;font-size:13px;line-height:1.45}.source-link{display:inline-block;margin-top:12px;color:#283229;text-decoration-thickness:1px;text-underline-offset:3px}
        @media(max-width:850px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.quote-card__main{display:block}.price{margin-top:12px}.quote-card__topline{display:block}.pill{margin-top:8px}}
      `}</style>
      <p className="eyebrow">Mission Control · Freight estimator</p>
      <h1>Dining freight quote log</h1>
      <p className="intro">
        Address checks from the Shopify dining-table estimator. This shows what people entered, what table/options were priced, the customer-facing estimate, raw Mainfreight rate, and whether the quote nudged them toward a manual check.
      </p>

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
    </main>
  );
}
