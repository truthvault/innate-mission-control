#!/usr/bin/env python3
from __future__ import annotations

import base64
import datetime as dt
import html
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

PROFILE = pathlib.Path('/Users/mack-mini/.hermes/profiles/website')
ROOT = pathlib.Path('/Users/mack-mini/innate-mission-control')
RUN_ID = dt.datetime.now().strftime('%Y-%m-%d_%H%M%S')
OUT = ROOT / 'seo' / 'beech-decking-audit' / RUN_ID
OUT.mkdir(parents=True, exist_ok=True)

SITE = 'https://innatefurniture.co.nz'
PRODUCT_PATH = '/products/west-coast-beech-decking'
PRODUCT_URL = SITE + PRODUCT_PATH
KWILA_PATH = '/blogs/our-purpose/the-hidden-cost-of-kwila-why-new-zealand-should-support-local-timber-instead'
BEECH_BLOG_PATH = '/blogs/our-purpose/decking'
COLLECTION_PATH = '/collections/decking-flooring'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36 SEOAudit/1.0'


def load_env() -> None:
    for path in [PROFILE / '.env', PROFILE / '.env.local']:
        if not path.exists():
            continue
        for line in path.read_text(errors='ignore').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def request_json(url: str, method: str = 'GET', payload: Any | None = None, headers: dict[str, str] | None = None, timeout: int = 90) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode()
    h = {'User-Agent': UA, 'Content-Type': 'application/json'}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode(errors='replace')
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors='replace')
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {'raw': body[:1000]}
        return {'_http_error': e.code, 'error': parsed}
    except Exception as e:
        return {'_error': type(e).__name__, 'message': str(e)}


def fetch_text(url: str, timeout: int = 90) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            text = raw.decode('utf-8', errors='replace')
            return {'ok': True, 'status': r.status, 'final_url': r.geturl(), 'headers': dict(r.headers), 'text': text}
    except urllib.error.HTTPError as e:
        text = e.read().decode('utf-8', errors='replace')
        return {'ok': False, 'status': e.code, 'final_url': e.geturl(), 'headers': dict(e.headers), 'text': text}
    except Exception as e:
        return {'ok': False, 'error': type(e).__name__, 'message': str(e), 'text': ''}


def strip_tags(s: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html.unescape(s or ''))).strip()


def first(pattern: str, text: str, flags=re.I | re.S) -> str | None:
    m = re.search(pattern, text, flags)
    return html.unescape(m.group(1).strip()) if m else None


def technical_extract(name: str, url: str) -> dict[str, Any]:
    res = fetch_text(url + ('&' if '?' in url else '?') + 'seo_audit=' + RUN_ID)
    text = res.get('text') or ''
    (OUT / f'{name}.html').write_text(text, errors='ignore')
    links = []
    for m in re.finditer(r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', text, re.I | re.S):
        href = html.unescape(m.group(1))
        label = strip_tags(m.group(2))[:160]
        if href.startswith('/') or 'innatefurniture.co.nz' in href:
            links.append({'href': href, 'text': label})
    imgs = re.findall(r'<img\b[^>]*>', text, re.I)
    missing_alt = sum(1 for tag in imgs if not re.search(r'\salt=["\'][^"\']+["\']', tag, re.I))
    headings = []
    for level, body in re.findall(r'<h([1-6])[^>]*>(.*?)</h\1>', text, re.I | re.S):
        headings.append({'level': int(level), 'text': strip_tags(body)[:220]})
    visible = strip_tags(re.sub(r'<script.*?</script>|<style.*?</style>', ' ', text, flags=re.I | re.S))
    return {
        'name': name,
        'url': url,
        'ok': res.get('ok'),
        'status': res.get('status'),
        'final_url': res.get('final_url'),
        'server_theme_header': (res.get('headers') or {}).get('Server-Timing'),
        'title': strip_tags(first(r'<title[^>]*>(.*?)</title>', text) or ''),
        'meta_description': first(r'<meta\s+name=["\']description["\'][^>]*content=["\']([^"\']*)', text),
        'canonical': first(r'<link\s+rel=["\']canonical["\'][^>]*href=["\']([^"\']*)', text),
        'robots': first(r'<meta\s+name=["\']robots["\'][^>]*content=["\']([^"\']*)', text),
        'h1s': [h['text'] for h in headings if h['level'] == 1],
        'headings': headings[:40],
        'word_count_estimate': len(visible.split()),
        'image_count': len(imgs),
        'missing_alt_count': missing_alt,
        'internal_links_sample': links[:80],
        'counts': {
            'maintenance_free': text.lower().count('maintenance-free'),
            'fit_and_forget': text.lower().count('fit and forget'),
            'kwila': text.lower().count('kwila'),
            'beech': text.lower().count('beech'),
            'factory_oil': text.lower().count('factory oil'),
            'dining_template_leak': text.lower().count('dining-table lead time') + text.lower().count('core dining timbers'),
            'old_build_legacy': text.count('Build a Legacy'),
        },
        'visible_text_start': visible[:2500],
    }


def get_google_creds():
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
    except Exception as e:
        return None, {'available': False, 'reason': f'google libs missing: {e}'}
    token_path = PROFILE / 'google_website_readonly_token.json'
    if not token_path.exists():
        return None, {'available': False, 'reason': 'token_missing'}
    scopes = ['https://www.googleapis.com/auth/webmasters.readonly', 'https://www.googleapis.com/auth/analytics.readonly']
    creds = Credentials.from_authorized_user_file(str(token_path), scopes=scopes)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_path.write_text(creds.to_json())
    return creds, {'available': True, 'account': getattr(creds, 'id_token', None) is not None}


def gsc_query(creds, payload: dict[str, Any]) -> dict[str, Any]:
    from googleapiclient.discovery import build
    service = build('searchconsole', 'v1', credentials=creds, cache_discovery=False)
    return service.searchanalytics().query(siteUrl='sc-domain:innatefurniture.co.nz', body=payload).execute()


def collect_gsc(creds) -> dict[str, Any]:
    end = dt.date.today() - dt.timedelta(days=2)
    start28 = end - dt.timedelta(days=27)
    prev_end = start28 - dt.timedelta(days=1)
    prev_start = prev_end - dt.timedelta(days=27)
    start90 = end - dt.timedelta(days=89)
    base = {'type': 'web', 'rowLimit': 25000, 'dataState': 'final'}
    def run(name, start, endd, dimensions, filters=None):
        payload = dict(base)
        payload.update({'startDate': start.isoformat(), 'endDate': endd.isoformat(), 'dimensions': dimensions})
        if filters:
            payload['dimensionFilterGroups'] = [{'filters': filters}]
        try:
            res = gsc_query(creds, payload)
            (OUT / 'gsc').mkdir(exist_ok=True)
            (OUT / 'gsc' / f'{name}.json').write_text(json.dumps(res, indent=2, ensure_ascii=False))
            return res
        except Exception as e:
            return {'_error': type(e).__name__, 'message': str(e), 'payload': payload}
    page_filter = [{'dimension': 'page', 'operator': 'contains', 'expression': PRODUCT_PATH}]
    deck_filter = [{'dimension': 'query', 'operator': 'includingRegex', 'expression': '(?i)(beech|decking|deck|kwila|merbau|hardwood|timber)'}]
    return {
        'windows': {'last28': [start28.isoformat(), end.isoformat()], 'prev28': [prev_start.isoformat(), prev_end.isoformat()], 'last90': [start90.isoformat(), end.isoformat()]},
        'product_queries_28': run('product_queries_28', start28, end, ['query'], page_filter),
        'product_queries_prev28': run('product_queries_prev28', prev_start, prev_end, ['query'], page_filter),
        'product_pages_queries_90': run('product_pages_queries_90', start90, end, ['page', 'query'], page_filter),
        'decking_queries_90': run('decking_queries_90', start90, end, ['query', 'page'], deck_filter),
        'product_devices_90': run('product_devices_90', start90, end, ['device'], page_filter),
        'product_countries_90': run('product_countries_90', start90, end, ['country'], page_filter),
    }


def ga4_report(creds, payload: dict[str, Any]) -> dict[str, Any]:
    token = creds.token
    return request_json('https://analyticsdata.googleapis.com/v1beta/properties/385933347:runReport', method='POST', payload=payload, headers={'Authorization': 'Bearer ' + token}, timeout=90)


def collect_ga4(creds) -> dict[str, Any]:
    (OUT / 'ga4').mkdir(exist_ok=True)
    base_dates = [{'startDate': '90daysAgo', 'endDate': 'yesterday'}]
    def run(name, dimensions, metrics, path_contains=None, event_contains=None, limit='10000'):
        payload: dict[str, Any] = {'dateRanges': base_dates, 'dimensions': [{'name': d} for d in dimensions], 'metrics': [{'name': m} for m in metrics], 'limit': limit}
        filters = []
        if path_contains:
            filters.append({'filter': {'fieldName': 'landingPagePlusQueryString', 'stringFilter': {'matchType': 'CONTAINS', 'value': path_contains}}})
        if event_contains:
            filters.append({'filter': {'fieldName': 'eventName', 'stringFilter': {'matchType': 'CONTAINS', 'value': event_contains}}})
        if filters:
            payload['dimensionFilter'] = filters[0] if len(filters) == 1 else {'andGroup': {'expressions': filters}}
        res = ga4_report(creds, payload)
        (OUT / 'ga4' / f'{name}.json').write_text(json.dumps(res, indent=2, ensure_ascii=False))
        return res
    return {
        'product_landing_90': run('product_landing_90', ['landingPagePlusQueryString', 'sessionSourceMedium'], ['sessions', 'activeUsers', 'screenPageViews', 'engagedSessions'], PRODUCT_PATH),
        'decking_flooring_landing_90': run('decking_flooring_landing_90', ['landingPagePlusQueryString', 'sessionSourceMedium'], ['sessions', 'activeUsers', 'screenPageViews', 'engagedSessions'], COLLECTION_PATH),
        'beech_blog_landing_90': run('beech_blog_landing_90', ['landingPagePlusQueryString', 'sessionSourceMedium'], ['sessions', 'activeUsers', 'screenPageViews', 'engagedSessions'], BEECH_BLOG_PATH),
        'kwila_landing_90': run('kwila_landing_90', ['landingPagePlusQueryString', 'sessionSourceMedium'], ['sessions', 'activeUsers', 'screenPageViews', 'engagedSessions'], KWILA_PATH),
        'product_events_90': run('product_events_90', ['eventName', 'landingPagePlusQueryString'], ['eventCount'], PRODUCT_PATH, limit='1000'),
    }


def d4s_auth() -> str | None:
    auth = os.environ.get('DATAFORSEO_AUTH_B64')
    if auth:
        return auth
    login = os.environ.get('DATAFORSEO_LOGIN'); password = os.environ.get('DATAFORSEO_PASSWORD')
    if login and password:
        return base64.b64encode(f'{login}:{password}'.encode()).decode()
    return None


def d4s_req(path: str, payload: Any | None = None, method='GET', auth: str | None = None, timeout=180) -> dict[str, Any]:
    headers = {'Authorization': 'Basic ' + (auth or ''), 'Content-Type': 'application/json'}
    return request_json('https://api.dataforseo.com' + path, method=method, payload=payload, headers=headers, timeout=timeout)


def clean_url(url: str | None) -> str | None:
    if not url:
        return url
    return re.sub(r'([?&])srsltid=[^&]+&?', r'\1', url).rstrip('?&')


def collect_dataforseo() -> dict[str, Any]:
    auth = d4s_auth()
    ddir = OUT / 'dataforseo'; ddir.mkdir(exist_ok=True)
    if not auth:
        return {'available': False, 'reason': 'missing_credentials'}
    balance = d4s_req('/v3/appendix/user_data', auth=auth)
    (ddir / 'balance.json').write_text(json.dumps({'status_code': balance.get('status_code'), 'status_message': balance.get('status_message'), 'tasks': balance.get('tasks')}, indent=2, ensure_ascii=False))
    # Avoid printing credentials; only preserve API's own balance payload locally.
    try:
        money = float(((balance.get('tasks') or [{}])[0].get('result') or [{}])[0].get('money', 0))
    except Exception:
        money = 0.0
    if money < 0.30:
        return {'available': True, 'balance_money': money, 'skipped': True, 'reason': 'low_balance'}
    keywords = [
        'west coast beech decking', 'beech decking nz', 'nz beech decking', 'red beech decking nz',
        'native timber decking nz', 'hardwood decking nz', 'kwila alternative decking',
        'kwila vs beech decking', 'timber decking nz', 'decking timber nz', 'outdoor timber decking nz',
        'kwila decking nz'
    ]
    locs = [('New Zealand', 2554), ('Christchurch', 1011065), ('Auckland', 1000286)]
    rows = []
    total_cost = 0.0
    raw_tasks = []
    for loc, code in locs:
        for kw in keywords:
            payload = [{'language_code': 'en', 'location_code': code, 'keyword': kw, 'device': 'mobile', 'os': 'ios', 'depth': 20, 'tag': f'{loc}|{kw}'}]
            res = d4s_req('/v3/serp/google/organic/live/advanced', payload=payload, method='POST', auth=auth, timeout=180)
            total_cost += float(res.get('cost') or 0)
            raw_tasks.extend(res.get('tasks') or [])
            time.sleep(0.15)
    for task in raw_tasks:
        tag = ((task.get('data') or {}).get('tag') or '|')
        loc, kw = tag.split('|', 1)
        result = (task.get('result') or [{}])[0] if task.get('result') else {}
        items = result.get('items') or []
        innate = []
        competitors = []
        features = []
        for item in items:
            typ = item.get('type')
            blob = json.dumps(item, ensure_ascii=False).lower()
            if typ != 'organic':
                if len(features) < 8:
                    features.append({'type': typ, 'rank_group': item.get('rank_group'), 'title': item.get('title') or item.get('name') or item.get('text')})
            if 'innatefurniture.co.nz' in blob or 'innate furniture' in blob:
                innate.append({'type': typ, 'rank_group': item.get('rank_group'), 'rank_absolute': item.get('rank_absolute'), 'title': item.get('title') or item.get('name'), 'url': clean_url(item.get('url')), 'domain': item.get('domain')})
            elif typ == 'organic' and len(competitors) < 10:
                competitors.append({'rank_group': item.get('rank_group'), 'title': item.get('title'), 'domain': item.get('domain'), 'url': clean_url(item.get('url'))})
        organic = [x for x in innate if x.get('type') == 'organic']
        best = min(organic, key=lambda x: x.get('rank_group') or 999) if organic else (innate[0] if innate else None)
        rows.append({'location': loc, 'keyword': kw, 'status': task.get('status_message'), 'innate_rank': best.get('rank_group') if best else None, 'innate_url': best.get('url') if best else None, 'innate_title': best.get('title') if best else None, 'innate_results': innate[:5], 'top_competitors': competitors[:7], 'features': features[:5]})
    (ddir / 'serp_raw.json').write_text(json.dumps({'generated_at': dt.datetime.now().isoformat(), 'cost': total_cost, 'tasks': raw_tasks}, indent=2, ensure_ascii=False))
    (ddir / 'serp_summary.json').write_text(json.dumps({'generated_at': dt.datetime.now().isoformat(), 'cost': total_cost, 'summary': rows}, indent=2, ensure_ascii=False))
    return {'available': True, 'balance_money': money, 'cost': total_cost, 'rows': rows}


def summarize_rows(rows: list[dict[str, Any]], max_rows=12):
    out = []
    for r in rows[:max_rows]:
        out.append({'keys': r.get('keys'), 'clicks': r.get('clicks'), 'impressions': r.get('impressions'), 'ctr': r.get('ctr'), 'position': r.get('position')})
    return out


def summarize_ga_rows(report: dict[str, Any], max_rows=12):
    rows = []
    for row in report.get('rows', [])[:max_rows]:
        dims = [d.get('value') for d in row.get('dimensionValues', [])]
        mets = [m.get('value') for m in row.get('metricValues', [])]
        rows.append({'dimensions': dims, 'metrics': mets})
    return rows


def main():
    load_env()
    pages = {
        'product': technical_extract('product', PRODUCT_URL),
        'collection_decking_flooring': technical_extract('collection_decking_flooring', SITE + COLLECTION_PATH),
        'beech_decking_blog': technical_extract('beech_decking_blog', SITE + BEECH_BLOG_PATH),
        'kwila_article': technical_extract('kwila_article', SITE + KWILA_PATH),
    }
    product_js = fetch_text(PRODUCT_URL + '.js?seo_audit=' + RUN_ID)
    try:
        product_json = json.loads(product_js.get('text') or '{}')
    except Exception:
        product_json = {'_parse_error': (product_js.get('text') or '')[:500]}
    (OUT / 'product.js.json').write_text(json.dumps(product_json, indent=2, ensure_ascii=False))
    creds, google_status = get_google_creds()
    gsc = {'available': False, 'google_status': google_status}
    ga4 = {'available': False, 'google_status': google_status}
    if creds:
        try:
            gsc = collect_gsc(creds)
            gsc['available'] = True
        except Exception as e:
            gsc = {'available': False, 'error': type(e).__name__, 'message': str(e)}
        try:
            ga4 = collect_ga4(creds)
            ga4['available'] = True
        except Exception as e:
            ga4 = {'available': False, 'error': type(e).__name__, 'message': str(e)}
    d4s = collect_dataforseo()

    concise = {
        'run_id': RUN_ID,
        'out': str(OUT),
        'pages': {k: {kk: v.get(kk) for kk in ['status','title','meta_description','canonical','h1s','word_count_estimate','image_count','missing_alt_count','counts']} for k, v in pages.items()},
        'product_js': {'title': product_json.get('title'), 'handle': product_json.get('handle'), 'id': product_json.get('id'), 'description_has_factory_oil': 'factory oil' in (product_json.get('description') or '').lower(), 'description_has_dining_leak': 'core dining timbers' in (product_json.get('description') or '').lower()},
        'gsc_windows': gsc.get('windows'),
        'gsc_product_queries_28': summarize_rows((gsc.get('product_queries_28') or {}).get('rows', []), 20),
        'gsc_product_queries_prev28': summarize_rows((gsc.get('product_queries_prev28') or {}).get('rows', []), 20),
        'gsc_decking_queries_90_top': summarize_rows((gsc.get('decking_queries_90') or {}).get('rows', []), 30),
        'ga4_product_landing_90': summarize_ga_rows(ga4.get('product_landing_90') or {}, 20),
        'ga4_related_landing_90': {
            'collection': summarize_ga_rows(ga4.get('decking_flooring_landing_90') or {}, 10),
            'beech_blog': summarize_ga_rows(ga4.get('beech_blog_landing_90') or {}, 10),
            'kwila': summarize_ga_rows(ga4.get('kwila_landing_90') or {}, 10),
            'events': summarize_ga_rows(ga4.get('product_events_90') or {}, 20),
        },
        'dataforseo': {k: v for k, v in d4s.items() if k != 'rows'},
        'dataforseo_rows': (d4s.get('rows') or [])[:60],
    }
    (OUT / 'summary.json').write_text(json.dumps(concise, indent=2, ensure_ascii=False))
    print(json.dumps({'ok': True, 'run_id': RUN_ID, 'out': str(OUT), 'dataforseo': concise['dataforseo'], 'gsc_available': gsc.get('available'), 'ga4_available': ga4.get('available'), 'product_title': concise['pages']['product']['title']}, indent=2))

if __name__ == '__main__':
    main()
