#!/opt/homebrew/bin/python3.11
"""Read-only master deep scan collectors for Innate website.
Writes extra GSC, public crawl, Merchant/GBP/Bing-adjacent evidence into RUN_DIR.
Never prints tokens/secrets. No Shopify/theme/account writes.
"""
from __future__ import annotations
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

PROFILE = Path(os.environ.get("HERMES_HOME", "/Users/mack-mini/.hermes/profiles/website"))
RUN_DIR = Path(os.environ["RUN_DIR"])
BASE = "https://innatefurniture.co.nz"
SITE = "sc-domain:innatefurniture.co.nz"
GA4_PROPERTY = "properties/385933347"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 InnateMasterDeepScan/1.0"

GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/drive",
]
GBP_SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/business.manage"]
MERCHANT_SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/content"]

def write(rel: str, obj: Any):
    path = RUN_DIR / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")

def creds(path: Path, scopes: list[str]) -> Credentials:
    c = Credentials.from_authorized_user_file(str(path), scopes)
    if c.expired and c.refresh_token:
        c.refresh(Request())
        payload = json.loads(c.to_json()); payload["scopes"] = scopes
        path.write_text(json.dumps(payload, indent=2))
    return c

def google_creds():
    return creds(PROFILE / "google_website_readonly_token.json", GOOGLE_SCOPES)

def gsc_query(svc, start, end, dims, row_limit=25000):
    body = {"startDate": start.isoformat(), "endDate": end.isoformat(), "dimensions": dims, "rowLimit": row_limit, "startRow": 0}
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

def collect_gsc():
    svc = build("searchconsole", "v1", credentials=google_creds(), cache_discovery=False)
    today = dt.date.today()
    windows = {
        "last_28_complete_days": (today - dt.timedelta(days=29), today - dt.timedelta(days=2)),
        "previous_28_complete_days": (today - dt.timedelta(days=57), today - dt.timedelta(days=30)),
        "last_90_complete_days": (today - dt.timedelta(days=91), today - dt.timedelta(days=2)),
    }
    out = {"generated_at": dt.datetime.now().isoformat(), "site": SITE, "windows": {}}
    for name, (start, end) in windows.items():
        out["windows"][name] = {
            "start": start.isoformat(), "end": end.isoformat(),
            "queries": gsc_query(svc, start, end, ["query"]),
            "pages": gsc_query(svc, start, end, ["page"]),
            "query_pages": gsc_query(svc, start, end, ["query", "page"]),
            "devices": gsc_query(svc, start, end, ["device"]),
            "countries": gsc_query(svc, start, end, ["country"]),
            "dates": gsc_query(svc, start, end, ["date"]),
        }
    write("gsc/master_gsc_windows.json", out)

def fetch_text(url: str, accept="text/html,application/xhtml+xml", timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.geturl(), r.headers.get_content_type(), r.read().decode("utf-8", errors="replace")

class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title=[]; self.desc=""; self.canonical=None; self.robots=""; self.h1=[]; self.h2=[]; self.img=0; self.img_missing_alt=0; self.links=[]; self.schema=[]; self.text=[]
        self._tag=None
    def handle_starttag(self, tag, attrs):
        d={k.lower():(v or "") for k,v in attrs}; tag=tag.lower()
        if tag in ("title","h1","h2"): self._tag=tag
        if tag=="meta":
            n=d.get("name","").lower(); p=d.get("property","").lower()
            if n=="description": self.desc=d.get("content","")
            if n=="robots": self.robots=d.get("content","")
        if tag=="link" and "canonical" in d.get("rel","").lower(): self.canonical=d.get("href")
        if tag=="img":
            self.img += 1
            if not d.get("alt","").strip(): self.img_missing_alt += 1
        if tag=="a" and d.get("href"): self.links.append(d.get("href"))
        if tag=="script" and "ld+json" in d.get("type","").lower(): self._tag="schema"
    def handle_endtag(self, tag):
        if tag.lower()==self._tag: self._tag=None
    def handle_data(self, data):
        s=data.strip()
        if not s: return
        self.text.append(s)
        if self._tag=="title": self.title.append(s)
        elif self._tag=="h1": self.h1.append(s)
        elif self._tag=="h2": self.h2.append(s)
        elif self._tag=="schema": self.schema.append(s[:5000])

def sitemap_urls(limit=350):
    urls=[]; errors=[]
    try:
        _,_,_,xml = fetch_text(BASE+"/sitemap.xml", accept="application/xml,text/xml")
        root=ET.fromstring(xml); ns={"sm":"http://www.sitemaps.org/schemas/sitemap/0.9"}
        children=[loc.text for loc in root.findall(".//sm:loc",ns) if loc.text]
        for sm in children:
            try:
                _,_,_,sub=fetch_text(sm, accept="application/xml,text/xml")
                subroot=ET.fromstring(sub)
                for loc in subroot.findall(".//sm:loc",ns):
                    if loc.text and loc.text.startswith(BASE): urls.append(loc.text)
            except Exception as e: errors.append({"sitemap":sm,"error":repr(e)[:300]})
    except Exception as e: errors.append({"sitemap":BASE+"/sitemap.xml","error":repr(e)[:300]})
    priority=[BASE+u for u in ["/","/collections/dining-tables","/pages/timber-panels","/pages/boardroom-tables","/pages/commercial-1","/pages/hospitality-furniture","/collections/outdoor","/products/butchers-block","/products/bar-leaner","/products/custom-crossroads-dining-table","/blogs/our-purpose/the-hidden-cost-of-kwila-why-new-zealand-should-support-local-timber-instead","/blogs/our-purpose/new-zealand-timber-options","/blogs/our-purpose/dining-table-size-guide-nz"]]
    out=[]
    for u in priority+urls:
        if u not in out: out.append(u)
    return out[:limit], errors

def crawl_public():
    urls, sm_errors=sitemap_urls()
    rows=[]
    stale_terms=["maintenance-free","maintenance free","virtually indestructible","lifetime of use","weatherproof","indicative quote","geometry proof only"]
    for i,u in enumerate(urls):
        try:
            sep="&" if "?" in u else "?"
            status, final, ctype, html=fetch_text(u+sep+"master_scan="+str(int(time.time())))
            p=PageParser(); p.feed(html)
            title=" ".join(p.title).strip(); text=" ".join(p.text); lower=text.lower()
            internal=[href for href in p.links if href.startswith("/") or href.startswith(BASE)]
            rows.append({
                "url":u,"status":status,"final_url":final,"content_type":ctype,"title":title,"title_len":len(title),"meta_description":p.desc,"meta_len":len(p.desc),"canonical":p.canonical,"robots":p.robots,
                "h1_count":len(p.h1),"h1s":p.h1[:5],"h2_sample":p.h2[:10],"word_count_est":len(re.findall(r"\w+", text)),"image_count":p.img,"missing_alt_count":p.img_missing_alt,"internal_link_count":len(internal),"schema_blocks":len(p.schema),
                "stale_or_risky_terms_found":[t for t in stale_terms if t in lower],
            })
        except Exception as e:
            rows.append({"url":u,"error":repr(e)[:500]})
        if (i+1)%40==0: time.sleep(1)
    write("crawl/public_crawl_master.json", {"generated_at":dt.datetime.now().isoformat(),"url_count":len(urls),"sitemap_errors":sm_errors,"pages":rows})

def collect_public_json():
    # Public Shopify JSON endpoints only; no Admin writes or secrets.
    endpoints={
        "products":"/products.json?limit=250",
        "collections":"/collections.json?limit=250",
    }
    out={}
    for name,path in endpoints.items():
        try:
            status, final, ctype, body=fetch_text(BASE+path, accept="application/json,text/plain")
            data=json.loads(body)
            if name=="products":
                rows=[]
                for p in data.get("products",[]):
                    rows.append({"id":p.get("id"),"title":p.get("title"),"handle":p.get("handle"),"product_type":p.get("product_type"),"vendor":p.get("vendor"),"tags":p.get("tags"),"images":len(p.get("images",[])),"variants":len(p.get("variants",[])),"published_at":p.get("published_at")})
                out[name]={"status":status,"final_url":final,"count":len(rows),"sample":rows[:250]}
            else:
                out[name]={"status":status,"final_url":final,"keys":list(data)[:10],"raw_sample":str(data)[:5000]}
        except Exception as e: out[name]={"error":repr(e)[:500]}
    write("shopify/public_shopify_json_snapshot.json", out)

def collect_gbp():
    token=PROFILE/"google_gbp_business_manage_token.json"
    if not token.exists():
        write("gbp/gbp_performance.json", {"available":False,"reason":"missing_token"}); return
    c=creds(token, GBP_SCOPES)
    out={"generated_at":dt.datetime.now().isoformat(),"locations":[],"performance":[]}
    try:
        acct_svc=build("mybusinessaccountmanagement","v1",credentials=c,cache_discovery=False)
        bi_svc=build("mybusinessbusinessinformation","v1",credentials=c,cache_discovery=False)
        perf_svc=build("businessprofileperformance","v1",credentials=c,cache_discovery=False)
        accts=acct_svc.accounts().list().execute().get("accounts",[])
        start=dt.date.today()-dt.timedelta(days=90); end=dt.date.today()-dt.timedelta(days=1)
        for acct in accts:
            try:
                locs=bi_svc.accounts().locations().list(parent=acct["name"],readMask="name,title,websiteUri,metadata",pageSize=50).execute().get("locations",[])
            except Exception as e:
                out["locations"].append({"account":acct.get("name"),"error":repr(e)[:300]}); continue
            for loc in locs:
                out["locations"].append({"account":acct.get("name"),"name":loc.get("name"),"title":loc.get("title"),"websiteUri":loc.get("websiteUri"),"metadata":loc.get("metadata")})
                # Try daily metrics. API shape can vary; record errors cleanly.
                for metric in ["WEBSITE_CLICKS","CALL_CLICKS","BUSINESS_DIRECTION_REQUESTS"]:
                    try:
                        body={"dailyMetrics":[metric],"dailyRange":{"startDate":{"year":start.year,"month":start.month,"day":start.day},"endDate":{"year":end.year,"month":end.month,"day":end.day}}}
                        resp=perf_svc.locations().fetchMultiDailyMetricsTimeSeries(location=loc.get("name"), body=body).execute()
                        out["performance"].append({"location":loc.get("name"),"metric":metric,"ok":True,"response":resp})
                    except Exception as e:
                        out["performance"].append({"location":loc.get("name"),"metric":metric,"ok":False,"error":repr(e)[:500]})
    except Exception as e: out["error"]=repr(e)[:1000]
    write("gbp/gbp_performance_90d.json", out)

def collect_merchant():
    token=PROFILE/"google_merchant_content_token.json"
    if not token.exists():
        write("merchant/merchant_deep.json", {"available":False,"reason":"missing_token"}); return
    c=creds(token, MERCHANT_SCOPES)
    svc=build("content","v2.1",credentials=c,cache_discovery=False)
    out={"generated_at":dt.datetime.now().isoformat(),"accounts":[]}
    try:
        auth=svc.accounts().authinfo().execute(); ids=auth.get("accountIdentifiers",[])
        for ident in ids:
            mid=ident.get("merchantId") or ident.get("aggregatorId")
            if not mid: continue
            rec={"merchantId":mid}
            for label,fn in {
                "account": lambda: svc.accounts().get(merchantId=mid, accountId=mid).execute(),
                "accountstatus": lambda: svc.accountstatuses().get(merchantId=mid, accountId=mid).execute(),
                "datafeeds": lambda: svc.datafeeds().list(merchantId=mid, maxResults=250).execute(),
                "products": lambda: svc.products().list(merchantId=mid, maxResults=250).execute(),
                "productstatuses": lambda: svc.productstatuses().list(merchantId=mid, maxResults=250).execute(),
            }.items():
                try: rec[label]=fn()
                except Exception as e: rec[label]={"error":repr(e)[:500]}
            out["accounts"].append(rec)
    except Exception as e: out["error"]=repr(e)[:1000]
    write("merchant/merchant_deep_readonly.json", out)

def collect_bing_more():
    # Use existing helper outputs plus mark deeper traffic methods as not implemented, rather than guessing API calls.
    write("bing/bing_deep_status.json", {"available_helper":"website_bing_webmaster_access.py", "verified_site_check_saved":"bing/sites.json", "deeper_traffic_crawl_keyword_calls":"not_implemented_in_current_helper", "next_step":"add read-only Bing keyword/page/sitemap collectors after confirming method names; no URL submission or settings changes."})

def main():
    steps=[("gsc",collect_gsc),("crawl",crawl_public),("public_json",collect_public_json),("gbp",collect_gbp),("merchant",collect_merchant),("bing",collect_bing_more)]
    status=[]
    for name,fn in steps:
        try:
            fn(); status.append({"step":name,"ok":True})
        except Exception as e:
            status.append({"step":name,"ok":False,"error":repr(e)[:1000]})
    write("context/master_extra_collectors_status.json", {"generated_at":dt.datetime.now().isoformat(),"status":status})
    print(json.dumps(status, indent=2))
if __name__ == "__main__": main()
