#!/usr/bin/env python3
from __future__ import annotations
import datetime, json, os, pathlib, sys, urllib.parse, urllib.request, hashlib

LIVE_THEME_ID = 141308166203
PREVIEW_THEME_ID = 141408796731
ASSET_KEY = 'assets/innate-intent-tracking.js'
LAYOUT_KEY = 'layout/theme.liquid'
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_preview_intent_tracking_helper_{PREVIEW_THEME_ID}')
BACKUP.mkdir(parents=True, exist_ok=True)

for envp in ['/Users/mack-mini/.hermes/profiles/website/.env','/Users/mack-mini/.env','/Users/mack-mini/.hermes/.env']:
    p = pathlib.Path(envp)
    if p.exists():
        for line in p.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
store = (os.environ.get('SHOPIFY_STORE') or '').replace('https://','').rstrip('/')
token = os.environ.get('SHOPIFY_ADMIN_API_TOKEN')
if not store or not token:
    raise SystemExit('Missing Shopify store/token environment')
base = f'https://{store}/admin/api/2025-01'
headers = {'X-Shopify-Access-Token': token, 'Content-Type': 'application/json'}

def req(method: str, path: str, data=None):
    body = None if data is None else json.dumps(data).encode()
    request = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=90) as response:
        raw = response.read().decode()
        return json.loads(raw) if raw else {}

def get_asset(theme_id: int, key: str) -> str:
    q = urllib.parse.urlencode({'asset[key]': key})
    return req('GET', f'/themes/{theme_id}/assets.json?{q}')['asset']['value']

def put_asset(theme_id: int, key: str, value: str):
    return req('PUT', f'/themes/{theme_id}/assets.json', {'asset': {'key': key, 'value': value}})

themes = req('GET', '/themes.json')['themes']
preview = next((t for t in themes if int(t['id']) == PREVIEW_THEME_ID), None)
live = next((t for t in themes if int(t['id']) == LIVE_THEME_ID), None)
if not live or live.get('role') != 'main':
    raise SystemExit(f'Live theme {LIVE_THEME_ID} missing or not main')
if not preview or preview.get('role') == 'main':
    raise SystemExit(f'Preview theme {PREVIEW_THEME_ID} missing or unsafe role')

layout = get_asset(PREVIEW_THEME_ID, LAYOUT_KEY)
(BACKUP / 'before_theme.liquid').write_text(layout, encoding='utf-8')
try:
    existing = get_asset(PREVIEW_THEME_ID, ASSET_KEY)
except Exception:
    existing = ''
(BACKUP / 'before_innate-intent-tracking.js').write_text(existing, encoding='utf-8')

helper = r"""
/* Innate privacy-safe intent tracking helper. Preview-only build 2026-06-25.
   Sends business-specific events to GA4/dataLayer and Microsoft Clarity without names, emails, phones, full addresses, raw IPs, Google Place IDs, or free-text form values. */
(function(){
  if (window.__innateIntentTrackingLoaded) return;
  window.__innateIntentTrackingLoaded = true;
  var PREVIEW = /preview_theme_id=|_ab=|tracking_preview=/.test(window.location.search);
  var sent = Object.create(null);
  var startedForms = new WeakSet();
  function clean(value, max){
    value = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!value) return '';
    return value.slice(0, max || 120);
  }
  function path(){ return location.pathname || '/'; }
  function pageType(){
    var p = path();
    if (p === '/') return 'home';
    if (/^\/products\//.test(p)) return 'product';
    if (/^\/collections\//.test(p)) return 'collection';
    if (/contact/.test(p)) return 'contact';
    if (/commercial/.test(p)) return 'commercial';
    if (/boardroom/.test(p)) return 'boardroom';
    if (/timber-panels|benchtop/i.test(p) || document.querySelector('main [class*="benchtop"], main [id*="benchtop"]')) return 'benchtop';
    return 'page';
  }
  function productHandle(){
    var m = path().match(/^\/products\/([^/?#]+)/);
    return m ? clean(m[1], 100) : '';
  }
  function collectionHandle(){
    var m = path().match(/^\/collections\/([^/?#]+)/);
    return m ? clean(m[1], 100) : '';
  }
  function productTitle(){
    if (!productHandle()) return '';
    var h1 = document.querySelector('h1');
    return h1 ? clean(h1.textContent, 140) : '';
  }
  function deviceType(){
    var w = Math.min(window.innerWidth || 0, screen.width || 9999);
    if (w && w < 760) return 'mobile';
    if (w && w < 1024) return 'tablet';
    return 'desktop';
  }
  function basePayload(extra){
    var out = {
      page_type: pageType(),
      page_path: path(),
      product_handle: productHandle(),
      product_title: productTitle(),
      collection_handle: collectionHandle(),
      device_type: deviceType(),
      environment: PREVIEW ? 'shopify_preview' : 'shopify_live',
      debug_mode: PREVIEW ? true : undefined
    };
    if (extra) Object.keys(extra).forEach(function(k){ if (extra[k] !== undefined && extra[k] !== null && extra[k] !== '') out[k] = extra[k]; });
    return out;
  }
  function track(name, payload, opts){
    name = clean(name, 80);
    if (!name) return;
    var data = basePayload(payload || {});
    var key = name + '|' + data.page_path + '|' + (data.cta_text || '') + '|' + (data.product_handle || '') + '|' + (data.form_type || '') + '|' + (data.filter_label || '');
    var now = Date.now();
    if (!opts || !opts.allowRepeat) {
      if (sent[key] && now - sent[key] < 1200) return;
      sent[key] = now;
    }
    try { window.dataLayer = window.dataLayer || []; window.dataLayer.push(Object.assign({event: name}, data)); } catch(e) {}
    try { if (typeof window.gtag === 'function') window.gtag('event', name, data); } catch(e) {}
    try {
      if (typeof window.clarity === 'function') {
        window.clarity('event', name);
        ['page_type','product_handle','collection_handle','device_type','journey_stage','product_category','timber_species','table_size','freight_region','freight_result','quote_band'].forEach(function(k){ if (data[k]) window.clarity('set', k, String(data[k]).slice(0, 80)); });
      }
    } catch(e) {}
    try { window.dispatchEvent(new CustomEvent('innate:intent-tracked', {detail: {event: name, payload: data}})); } catch(e) {}
  }
  window.innateIntentTrack = track;

  function textOf(el){ return clean(el.getAttribute('aria-label') || el.textContent || el.value || el.name || el.id || '', 100); }
  function closestInteractive(target){ return target && target.closest && target.closest('a, button, summary, [role="button"], input[type="submit"], input[type="button"], label'); }
  function hrefOf(el){ var a = el && el.closest && el.closest('a[href]'); return a ? a.getAttribute('href') || '' : ''; }
  function ctaLocation(el){
    if (!el || !el.closest) return 'body';
    if (el.closest('header, .site-header, nav')) return 'header';
    if (el.closest('footer')) return 'footer';
    if (el.closest('form')) return 'form';
    if (el.closest('[class*="hero"], [id*="hero"]')) return 'hero';
    if (el.closest('[class*="product"], [id*="product"]')) return 'product';
    if (el.closest('[class*="collection"], [id*="collection"]')) return 'collection';
    return 'body';
  }
  function classifyClick(el, href, label){
    var lower = (href + ' ' + label + ' ' + (el.className || '')).toLowerCase();
    if (/^tel:/.test(href)) return 'phone_click';
    if (/^mailto:/.test(href)) return 'email_click';
    if (/\/cart|checkout/.test(lower)) return 'cart_or_checkout_click';
    if (/\/products\//.test(href) && pageType() === 'collection') return 'product_card_click';
    if (/view .*timber preview|timber preview|swatch/.test(lower)) return 'timber_swatch_selected';
    if (/round|oval|rectangular|steel base|timber base|apply/.test(label.toLowerCase()) && pageType() === 'collection') return 'collection_filter_used';
    if (/faq|details|summary/.test(lower) || (el.tagName || '').toLowerCase() === 'summary') return 'faq_opened';
    if (ctaLocation(el) === 'header' || ctaLocation(el) === 'footer') return 'navigation_click';
    return 'cta_click';
  }
  document.addEventListener('click', function(ev){
    var el = closestInteractive(ev.target); if (!el) return;
    var href = hrefOf(el), label = textOf(el);
    if (!href && !label) return;
    var eventName = classifyClick(el, href, label);
    var payload = {cta_text: label, cta_location: ctaLocation(el), link_url: href && href[0] === '/' ? href.split('?')[0] : (/^https?:/.test(href) ? (function(){ try { var u = new URL(href); return u.hostname + u.pathname; } catch(e){ return ''; } })() : '')};
    if (eventName === 'collection_filter_used') payload.filter_label = label;
    if (eventName === 'timber_swatch_selected') payload.timber_species = label.replace(/^View\s+/i,'').replace(/\s+timber preview$/i,'');
    if (eventName === 'product_card_click') { var m = href.match(/\/products\/([^/?#]+)/); if (m) payload.clicked_product_handle = m[1]; }
    track(eventName, payload, {allowRepeat: eventName === 'timber_swatch_selected'});
  }, true);

  document.addEventListener('change', function(ev){
    var el = ev.target; if (!el || !el.matches) return;
    if (el.matches('select[name="id"], input[name="id"], select[data-product-select], input[type="radio"][name*="option"], select[name*="option"]')) {
      track('product_variant_selected', {journey_stage: 'product_options', option_name: clean(el.name || el.getAttribute('aria-label') || '', 80)});
    }
  }, true);

  document.addEventListener('focusin', function(ev){
    var form = ev.target && ev.target.closest && ev.target.closest('form');
    if (!form || startedForms.has(form)) return;
    startedForms.add(form);
    var type = pageType();
    var eventName = type === 'commercial' ? 'commercial_enquiry_started' : type === 'boardroom' ? 'boardroom_enquiry_started' : type === 'contact' ? 'contact_enquiry_started' : 'form_start_contextual';
    track(eventName, {form_type: type, journey_stage: 'form_started'});
  }, true);

  document.addEventListener('submit', function(ev){
    var form = ev.target; if (!form || !form.matches) return;
    var action = clean(form.getAttribute('action') || '', 120);
    var type = pageType();
    var eventName = /\/cart\/add/.test(action) ? 'add_to_cart_contextual' : type === 'commercial' ? 'commercial_enquiry_submitted' : type === 'boardroom' ? 'boardroom_enquiry_submitted' : type === 'contact' ? 'contact_enquiry_submitted' : 'form_submit_contextual';
    track(eventName, {form_type: type, form_action_type: /\/cart\/add/.test(action) ? 'cart_add' : 'enquiry', journey_stage: 'form_submitted'});
  }, true);

  document.addEventListener('toggle', function(ev){
    var el = ev.target;
    if (el && el.open && el.matches && el.matches('details')) {
      var summary = el.querySelector('summary');
      track('faq_opened', {cta_text: summary ? textOf(summary) : 'details', cta_location: ctaLocation(el)});
    }
  }, true);

  // Mark important page views with richer context than GA4's generic page_view.
  setTimeout(function(){ track('page_context_view', {journey_stage: pageType() + '_view'}, {allowRepeat: true}); }, 800);
})();
""".strip() + "\n"

include = "{{ 'innate-intent-tracking.js' | asset_url | script_tag }}"
if include not in layout:
    marker = '</body>'
    if marker not in layout:
        raise SystemExit('Could not find </body> in layout')
    patched_layout = layout.replace(marker, '  ' + include + '\n' + marker, 1)
else:
    patched_layout = layout

(BACKUP / 'after_theme.liquid').write_text(patched_layout, encoding='utf-8')
(BACKUP / 'after_innate-intent-tracking.js').write_text(helper, encoding='utf-8')

if '--dry-run' in sys.argv:
    print(json.dumps({'ok': True, 'dry_run': True, 'preview_theme_id': PREVIEW_THEME_ID, 'backup': str(BACKUP), 'asset_sha256': hashlib.sha256(helper.encode()).hexdigest(), 'layout_changed': patched_layout != layout}, indent=2))
    raise SystemExit(0)

put_asset(PREVIEW_THEME_ID, ASSET_KEY, helper)
put_asset(PREVIEW_THEME_ID, LAYOUT_KEY, patched_layout)
read_helper = get_asset(PREVIEW_THEME_ID, ASSET_KEY)
read_layout = get_asset(PREVIEW_THEME_ID, LAYOUT_KEY)
(BACKUP / 'readback_theme.liquid').write_text(read_layout, encoding='utf-8')
(BACKUP / 'readback_innate-intent-tracking.js').write_text(read_helper, encoding='utf-8')
markers = ['innateIntentTrack', 'clarity', 'page_context_view', 'product_variant_selected', 'contact_enquiry_started', 'collection_filter_used', 'timber_swatch_selected']
missing = [m for m in markers if m not in read_helper]
print(json.dumps({
    'ok': not missing and include in read_layout,
    'preview_theme_id': PREVIEW_THEME_ID,
    'preview_theme_name': preview.get('name'),
    'preview_theme_role': preview.get('role'),
    'live_theme_id': LIVE_THEME_ID,
    'asset': ASSET_KEY,
    'layout': LAYOUT_KEY,
    'backup': str(BACKUP),
    'asset_sha256': hashlib.sha256(read_helper.encode()).hexdigest(),
    'include_present': include in read_layout,
    'missing_markers': missing,
    'preview_urls': [
        f'https://innatefurniture.co.nz/products/straight-steel-dining-table?preview_theme_id={PREVIEW_THEME_ID}&tracking_preview=1',
        f'https://innatefurniture.co.nz/pages/timber-panels?preview_theme_id={PREVIEW_THEME_ID}&tracking_preview=1',
        f'https://innatefurniture.co.nz/pages/contact?preview_theme_id={PREVIEW_THEME_ID}&tracking_preview=1'
    ]
}, indent=2))
