#!/opt/homebrew/bin/python3.11
"""Read-only SEO tracking audit for Innate: GSC, GA4, public crawl.
Never prints Google tokens. Writes evidence JSON + markdown report.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from googleapiclient.discovery import build

PROFILE_HOME = Path(os.environ.get("HERMES_HOME", "/Users/mack-mini/.hermes/profiles/website"))
sys.path.insert(0, str(PROFILE_HOME / "bin"))
import website_google_access as wga  # noqa: E402

SITE = "sc-domain:innatefurniture.co.nz"
GA4_PROPERTY = "properties/385933347"
BASE = "https://innatefurniture.co.nz"
OUTDIR = Path("/Users/mack-mini/innate-mission-control/seo/tracking-audits") / dt.datetime.now().strftime("%Y-%m-%d_%H%M%S")
OUTDIR.mkdir(parents=True, exist_ok=True)

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 InnateSEOAudit/1.0"
CLUSTERS = {
    "brand": ["innate", "innate furniture"],
    "dining": ["dining", "dining table", "dining tables", "table nz", "custom table", "solid timber", "solid wood", "rimu table", "rimu dining", "oval dining", "round dining", "wooden dining"],
    "benchtops": ["benchtop", "benchtops", "timber panel", "timber panels", "butchers block", "butcher block", "wooden benchtop", "kitchen benchtop"],
    "boardroom_commercial": ["boardroom", "conference table", "commercial furniture", "office table", "meeting table"],
    "outdoor_kwila": ["outdoor", "kwila", "decking", "outdoor table", "patio table"],
    "timber_materials": ["rimu", "totara", "tōtara", "beech", "native timber", "recycled timber"],
}
PRIORITY_URLS = [
    "/",
    "/collections/dining-tables",
    "/pages/timber-panels",
    "/pages/boardroom-tables",
    "/pages/commercial-1",
    "/products/custom-crossroads-dining-table",
    "/products/butchers-block",
    "/blogs/our-purpose/the-hidden-cost-of-kwila-why-new-zealand-should-support-local-timber-instead",
    "/blogs/our-purpose/new-zealand-timber-options",
]


def date_windows():
    today = dt.date.today()
    gsc_end = today - dt.timedelta(days=2)
    cur_start = gsc_end - dt.timedelta(days=27)
    prev_end = cur_start - dt.timedelta(days=1)
    prev_start = prev_end - dt.timedelta(days=27)
    ga4_end = today - dt.timedelta(days=1)
    ga4_start = ga4_end - dt.timedelta(days=27)
    ga4_prev_end = ga4_start - dt.timedelta(days=1)
    ga4_prev_start = ga4_prev_end - dt.timedelta(days=27)
    return {
        "gsc_current": (cur_start, gsc_end),
        "gsc_previous": (prev_start, prev_end),
        "ga4_current": (ga4_start, ga4_end),
        "ga4_previous": (ga4_prev_start, ga4_prev_end),
    }


def pct(now, prev):
    try:
        now = float(now or 0); prev = float(prev or 0)
        if prev == 0:
            return None if now == 0 else 100.0
        return (now - prev) / prev * 100
    except Exception:
        return None


def gsc_query(svc, start, end, dimensions, row_limit=25000, dimension_filter_groups=None):
    body: dict[str, Any] = {
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "dimensions": dimensions,
        "rowLimit": row_limit,
        "startRow": 0,
    }
    if dimension_filter_groups:
        body["dimensionFilterGroups"] = dimension_filter_groups
    rows = []
    while True:
        resp = svc.searchanalytics().query(siteUrl=SITE, body=body).execute()
        batch = resp.get("rows", [])
        rows.extend(batch)
        if len(batch) < row_limit:
            break
        body["startRow"] += row_limit
        if body["startRow"] >= 100000:
            break
    return rows


def row_metrics(rows):
    out = {"clicks": 0, "impressions": 0, "ctr": 0, "position": 0}
    if not rows:
        return out
    clicks = sum(r.get("clicks", 0) for r in rows)
    impr = sum(r.get("impressions", 0) for r in rows)
    pos_weighted = sum(r.get("position", 0) * r.get("impressions", 0) for r in rows)
    out.update({
        "clicks": clicks,
        "impressions": impr,
        "ctr": clicks / impr if impr else 0,
        "position": pos_weighted / impr if impr else 0,
    })
    return out


def cluster_name(query):
    q = (query or "").lower()
    matched = []
    for name, needles in CLUSTERS.items():
        if any(n in q for n in needles):
            matched.append(name)
    return matched or ["other"]


def ga4_report(svc, start, end, dimensions, metrics, limit=10000, order_metric=None, filters=None):
    body: dict[str, Any] = {
        "dateRanges": [{"startDate": start.isoformat(), "endDate": end.isoformat()}],
        "dimensions": [{"name": d} for d in dimensions],
        "metrics": [{"name": m} for m in metrics],
        "limit": limit,
    }
    if order_metric:
        body["orderBys"] = [{"metric": {"metricName": order_metric}, "desc": True}]
    if filters:
        body["dimensionFilter"] = filters
    return svc.properties().runReport(property=GA4_PROPERTY, body=body).execute()


def ga4_rows(resp, dimensions, metrics):
    rows = []
    for r in resp.get("rows", []):
        item = {}
        for i, d in enumerate(dimensions):
            item[d] = r.get("dimensionValues", [{}])[i].get("value")
        for i, m in enumerate(metrics):
            val = r.get("metricValues", [{}])[i].get("value")
            try:
                item[m] = float(val)
            except Exception:
                item[m] = val
        rows.append(item)
    return rows


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.geturl(), r.read().decode("utf-8", errors="replace")


class SimpleHTMLAuditParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title_parts: list[str] = []
        self.h1_parts: list[list[str]] = []
        self.text_parts: list[str] = []
        self.meta_description = ""
        self.canonical = None
        self.img_count = 0
        self.missing_alt_count = 0
        self._in_title = False
        self._in_h1 = False

    def handle_starttag(self, tag, attrs):
        attrs_d = {k.lower(): (v or "") for k, v in attrs}
        tag = tag.lower()
        if tag == "title":
            self._in_title = True
        elif tag == "h1":
            self._in_h1 = True
            self.h1_parts.append([])
        elif tag == "meta" and attrs_d.get("name", "").lower() == "description":
            self.meta_description = attrs_d.get("content", "")
        elif tag == "link" and "canonical" in attrs_d.get("rel", "").lower():
            self.canonical = attrs_d.get("href")
        elif tag == "img":
            self.img_count += 1
            alt = attrs_d.get("alt")
            if alt is None or not alt.strip():
                self.missing_alt_count += 1

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "title":
            self._in_title = False
        elif tag == "h1":
            self._in_h1 = False

    def handle_data(self, data):
        text = data.strip()
        if not text:
            return
        self.text_parts.append(text)
        if self._in_title:
            self.title_parts.append(text)
        if self._in_h1 and self.h1_parts:
            self.h1_parts[-1].append(text)


def crawl_page(path):
    url = path if path.startswith("http") else BASE + path
    try:
        status, final_url, html = fetch(url + (("&" if "?" in url else "?") + "seo_audit=" + str(int(time.time()))))
        parser = SimpleHTMLAuditParser()
        parser.feed(html)
        title = " ".join(parser.title_parts).strip()
        h1s = [" ".join(parts).strip() for parts in parser.h1_parts if " ".join(parts).strip()]
        visible_text = " ".join(parser.text_parts)
        return {
            "url": url,
            "status": status,
            "final_url": final_url,
            "title": title,
            "title_len": len(title),
            "meta_description": parser.meta_description,
            "meta_len": len(parser.meta_description),
            "canonical": parser.canonical,
            "h1_count": len(h1s),
            "h1s": h1s,
            "image_count": parser.img_count,
            "missing_alt_count": parser.missing_alt_count,
            "word_count_est": len(re.findall(r"\w+", visible_text)),
        }
    except Exception as e:
        return {"url": url, "error": repr(e)[:300]}


def discover_sitemap_urls(limit=80):
    urls = []
    try:
        _, _, xml = fetch(BASE + "/sitemap.xml")
        root = ET.fromstring(xml)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        sitemaps = [loc.text for loc in root.findall(".//sm:loc", ns) if loc.text]
        for sm in sitemaps:
            if not any(k in sm for k in ["products", "collections", "pages", "blogs"]):
                continue
            try:
                _, _, subxml = fetch(sm)
                subroot = ET.fromstring(subxml)
                for loc in subroot.findall(".//sm:loc", ns):
                    if loc.text and loc.text.startswith(BASE):
                        urls.append(loc.text.replace(BASE, ""))
            except Exception:
                pass
    except Exception:
        pass
    # Keep priority plus a sample, de-duped.
    combined = []
    for u in PRIORITY_URLS + urls:
        if u not in combined:
            combined.append(u)
    return combined[:limit]


def main():
    windows = date_windows()
    creds = wga._creds()
    gsc = build("searchconsole", "v1", credentials=creds, cache_discovery=False)
    ga = build("analyticsdata", "v1beta", credentials=creds, cache_discovery=False)

    cur_s, cur_e = windows["gsc_current"]
    prev_s, prev_e = windows["gsc_previous"]
    q_cur = gsc_query(gsc, cur_s, cur_e, ["query"], 25000)
    q_prev = gsc_query(gsc, prev_s, prev_e, ["query"], 25000)
    p_cur = gsc_query(gsc, cur_s, cur_e, ["page"], 25000)
    p_prev = gsc_query(gsc, prev_s, prev_e, ["page"], 25000)
    qp_cur = gsc_query(gsc, cur_s, cur_e, ["query", "page"], 25000)

    cluster = defaultdict(lambda: {"clicks":0,"impressions":0,"pos_weight":0})
    for r in q_cur:
        q = r.get("keys", [""])[0]
        for c in cluster_name(q):
            cluster[c]["clicks"] += r.get("clicks", 0)
            cluster[c]["impressions"] += r.get("impressions", 0)
            cluster[c]["pos_weight"] += r.get("position", 0) * r.get("impressions", 0)
    cluster_out = []
    for c, v in cluster.items():
        cluster_out.append({"cluster": c, "clicks": v["clicks"], "impressions": v["impressions"], "ctr": v["clicks"] / v["impressions"] if v["impressions"] else 0, "position": v["pos_weight"] / v["impressions"] if v["impressions"] else 0})
    cluster_out.sort(key=lambda x: x["impressions"], reverse=True)

    top_query_opps = sorted(q_cur, key=lambda r: (r.get("impressions",0) * (1 - r.get("ctr",0))), reverse=True)[:80]
    top_page_opps = sorted(p_cur, key=lambda r: (r.get("impressions",0) * (1 - r.get("ctr",0))), reverse=True)[:50]
    query_page_opps = [r for r in qp_cur if r.get("impressions",0) >= 20 and r.get("position",99) <= 30]
    query_page_opps = sorted(query_page_opps, key=lambda r: (r.get("impressions",0) * (1-r.get("ctr",0))), reverse=True)[:100]

    ga_s, ga_e = windows["ga4_current"]
    gap_s, gap_e = windows["ga4_previous"]
    metrics = ["sessions", "activeUsers", "screenPageViews", "engagedSessions", "eventCount", "totalRevenue", "transactions"]
    ga_over_cur = ga4_report(ga, ga_s, ga_e, [], metrics)
    ga_over_prev = ga4_report(ga, gap_s, gap_e, [], metrics)
    ga_channel = ga4_rows(ga4_report(ga, ga_s, ga_e, ["sessionDefaultChannelGroup"], metrics, 100, "sessions"), ["sessionDefaultChannelGroup"], metrics)
    organic_filter = {"filter": {"fieldName": "sessionDefaultChannelGroup", "stringFilter": {"matchType": "EXACT", "value": "Organic Search"}}}
    ga_landing_org = ga4_rows(ga4_report(ga, ga_s, ga_e, ["landingPagePlusQueryString"], metrics, 50, "sessions", organic_filter), ["landingPagePlusQueryString"], metrics)
    ga_landing_all = ga4_rows(ga4_report(ga, ga_s, ga_e, ["landingPagePlusQueryString"], metrics, 50, "sessions"), ["landingPagePlusQueryString"], metrics)

    crawl_urls = discover_sitemap_urls(80)
    crawl = [crawl_page(u) for u in crawl_urls]

    evidence = {
        "generated_at": dt.datetime.now().isoformat(),
        "windows": {k: [a.isoformat(), b.isoformat()] for k, (a,b) in windows.items()},
        "gsc": {
            "current_summary": row_metrics(q_cur),
            "previous_summary": row_metrics(q_prev),
            "top_queries": q_cur[:100],
            "top_pages": p_cur[:100],
            "cluster_summary": cluster_out,
            "query_opportunities": top_query_opps,
            "page_opportunities": top_page_opps,
            "query_page_opportunities": query_page_opps,
        },
        "ga4": {
            "current_overview_raw": ga_over_cur,
            "previous_overview_raw": ga_over_prev,
            "channels": ga_channel,
            "organic_landing_pages": ga_landing_org,
            "all_landing_pages": ga_landing_all,
        },
        "crawl": crawl,
    }
    (OUTDIR / "evidence.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8")

    cur = evidence["gsc"]["current_summary"]; prev = evidence["gsc"]["previous_summary"]
    ga_cur_vals = ga4_rows(ga_over_cur, [], metrics)[0] if ga_over_cur.get("rows") else {}
    ga_prev_vals = ga4_rows(ga_over_prev, [], metrics)[0] if ga_over_prev.get("rows") else {}
    def fmt_delta(k):
        d = pct(ga_cur_vals.get(k), ga_prev_vals.get(k))
        return "n/a" if d is None else f"{d:+.1f}%"
    lines = []
    lines.append(f"# Innate SEO tracking audit — {dt.datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append("Read-only: DataForSEO output should be read from the same timestamped rank benchmark folder; this file covers GSC, GA4, and public crawl.")
    lines.append("")
    lines.append(f"## Google Search Console ({cur_s} to {cur_e} vs {prev_s} to {prev_e})")
    lines.append(f"- Clicks: {cur['clicks']:.0f} vs {prev['clicks']:.0f} ({pct(cur['clicks'], prev['clicks']) or 0:+.1f}%)")
    lines.append(f"- Impressions: {cur['impressions']:.0f} vs {prev['impressions']:.0f} ({pct(cur['impressions'], prev['impressions']) or 0:+.1f}%)")
    lines.append(f"- CTR: {cur['ctr']*100:.2f}% vs {prev['ctr']*100:.2f}%")
    lines.append(f"- Avg position: {cur['position']:.1f} vs {prev['position']:.1f}")
    lines.append("\n### Cluster snapshot")
    for c in cluster_out[:8]:
        lines.append(f"- {c['cluster']}: {c['clicks']:.0f} clicks / {c['impressions']:.0f} impr / CTR {c['ctr']*100:.2f}% / pos {c['position']:.1f}")
    lines.append("\n### Top page opportunities")
    for r in top_page_opps[:12]:
        page = r.get('keys',[None])[0]
        lines.append(f"- {page}: {r.get('clicks',0):.0f} clicks / {r.get('impressions',0):.0f} impr / CTR {r.get('ctr',0)*100:.2f}% / pos {r.get('position',0):.1f}")
    lines.append("\n### Top query-page opportunities")
    for r in query_page_opps[:16]:
        q, page = r.get('keys',[None,None])
        lines.append(f"- {q} → {page}: {r.get('clicks',0):.0f} clicks / {r.get('impressions',0):.0f} impr / CTR {r.get('ctr',0)*100:.2f}% / pos {r.get('position',0):.1f}")
    lines.append(f"\n## GA4 ({ga_s} to {ga_e} vs {gap_s} to {gap_e})")
    for k in ["sessions", "activeUsers", "screenPageViews", "engagedSessions", "eventCount", "totalRevenue", "transactions"]:
        lines.append(f"- {k}: {ga_cur_vals.get(k, 0):.0f} ({fmt_delta(k)})")
    lines.append("\n### Channel sessions")
    for row in ga_channel[:10]:
        lines.append(f"- {row.get('sessionDefaultChannelGroup')}: {row.get('sessions',0):.0f} sessions, {row.get('activeUsers',0):.0f} users, {row.get('screenPageViews',0):.0f} views")
    lines.append("\n### Organic landing pages")
    for row in ga_landing_org[:15]:
        lines.append(f"- {row.get('landingPagePlusQueryString')}: {row.get('sessions',0):.0f} sessions, {row.get('screenPageViews',0):.0f} views")
    lines.append("\n## Public crawl quick checks")
    problem_pages = []
    for row in crawl:
        if row.get("error") or row.get("h1_count", 1) != 1 or row.get("missing_alt_count", 0) > 3 or row.get("meta_len", 0) < 50 or row.get("title_len", 0) < 20:
            problem_pages.append(row)
    lines.append(f"- Crawled: {len(crawl)} URLs sampled from priority routes + sitemap")
    lines.append(f"- Pages flagged for metadata/H1/alt review: {len(problem_pages)}")
    for row in problem_pages[:20]:
        bits = []
        if row.get('error'): bits.append(row['error'])
        if row.get('h1_count',1) != 1: bits.append(f"H1s={row.get('h1_count')}")
        if row.get('missing_alt_count',0) > 3: bits.append(f"missing_alt={row.get('missing_alt_count')}/{row.get('image_count')}")
        if row.get('meta_len',0) < 50: bits.append(f"meta_len={row.get('meta_len')}")
        if row.get('title_len',0) < 20: bits.append(f"title_len={row.get('title_len')}")
        lines.append(f"- {row.get('url')}: " + ", ".join(bits))
    lines.append("\n## Evidence")
    lines.append(f"- {OUTDIR / 'evidence.json'}")
    (OUTDIR / "report.md").write_text("\n".join(lines), encoding="utf-8")
    print(OUTDIR)
    print("\n".join(lines[:80]))

if __name__ == "__main__":
    main()
