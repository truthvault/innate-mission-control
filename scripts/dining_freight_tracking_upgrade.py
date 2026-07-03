#!/usr/bin/env python3
from __future__ import annotations
import datetime, json, os, pathlib, re, sys, urllib.parse, urllib.request

THEME_ID = 141308166203
ASSET_KEY = 'snippets/product-blocks.liquid'
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_dining_freight_tracking')
BACKUP.mkdir(parents=True, exist_ok=True)

for envp in ['/Users/mack-mini/.hermes/profiles/website/.env','/Users/mack-mini/.env','/Users/mack-mini/.hermes/.env']:
    p=pathlib.Path(envp)
    if p.exists():
        for line in p.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                k,v=line.split('=',1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
store=(os.environ.get('SHOPIFY_STORE') or '').replace('https://','').rstrip('/')
token=os.environ.get('SHOPIFY_ADMIN_API_TOKEN')
if not store or not token:
    raise SystemExit('Missing Shopify store/token environment')
base=f'https://{store}/admin/api/2025-01'
headers={'X-Shopify-Access-Token':token,'Content-Type':'application/json'}

def req(method,path,data=None):
    body=None if data is None else json.dumps(data).encode()
    r=urllib.request.Request(base+path,data=body,headers=headers,method=method)
    with urllib.request.urlopen(r,timeout=90) as resp:
        return json.loads(resp.read().decode())

def get_asset(theme_id,key):
    q=urllib.parse.urlencode({'asset[key]':key})
    return req('GET',f'/themes/{theme_id}/assets.json?{q}')['asset']['value']

def put_asset(theme_id,key,value):
    return req('PUT',f'/themes/{theme_id}/assets.json',{'asset':{'key':key,'value':value}})

def replace_once(text, old, new, label):
    count=text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old,new,1)

def replace_all_required(text, old, new, label, min_count=1):
    count=text.count(old)
    if count < min_count:
        raise SystemExit(f'{label}: expected at least {min_count} matches, found {count}')
    return text.replace(old,new), count

themes=req('GET','/themes.json')['themes']
theme=next((t for t in themes if int(t['id'])==THEME_ID),None)
if not theme:
    raise SystemExit('Live theme not found')
if theme.get('role') != 'main':
    raise SystemExit(f'Refusing: theme {THEME_ID} role is {theme.get("role")}, not main')

orig=get_asset(THEME_ID,ASSET_KEY)
(BACKUP/'before_product-blocks.liquid').write_text(orig, encoding='utf-8')
patched=orig

# Add privacy-safe shared helpers to the delegated freight script, before the click listener.
old = """            function dollars(n){ return '$'+Number(n).toLocaleString('en-NZ',{maximumFractionDigits:0}); }
            document.addEventListener('click', function(event){"""
new = """            function dollars(n){ return '$'+Number(n).toLocaleString('en-NZ',{maximumFractionDigits:0}); }
            function cleanText(value){ return String(value == null ? '' : value).replace(/\s+/g,' ').trim(); }
            function regionFromCity(city, postcode){
              var c=cleanText(city).toLowerCase();
              var pc=String(postcode || '');
              if(/auckland/.test(c) || /^0[6-9]|^10|^11|^12|^21/.test(pc)) return 'Auckland';
              if(/christchurch|rangiora|rolleston|kaiapoi|selwyn|waimakariri/.test(c) || /^7[6-9]|^80|^81|^82/.test(pc)) return 'Canterbury';
              if(/wellington|lower hutt|upper hutt|porirua/.test(c) || /^50|^51|^52|^53|^60|^61|^62/.test(pc)) return 'Wellington';
              if(/hamilton|waikato|cambridge|te awamutu|taupo/.test(c) || /^32|^33|^34/.test(pc)) return 'Waikato';
              if(/tauranga|rotorua|whakatane|bay of plenty/.test(c) || /^30|^31/.test(pc)) return 'Bay of Plenty';
              if(/dunedin|queenstown|wanaka|alexandra|otago/.test(c) || /^90|^91|^92|^93/.test(pc)) return 'Otago';
              if(/invercargill|southland/.test(c) || /^98/.test(pc)) return 'Southland';
              if(/nelson|tasman|motueka|richmond/.test(c) || /^70|^71/.test(pc)) return 'Nelson Tasman';
              if(/new plymouth|taranaki/.test(c) || /^43/.test(pc)) return 'Taranaki';
              if(/napier|hastings|hawke/.test(c) || /^41/.test(pc)) return 'Hawke’s Bay';
              if(/palmerston north|whanganui|manawatu/.test(c) || /^44|^45|^46|^47|^48/.test(pc)) return 'Manawatū-Whanganui';
              if(/gisborne/.test(c) || /^40/.test(pc)) return 'Gisborne';
              if(/whangarei|northland|kerikeri|kaitaia/.test(c) || /^01|^02|^03|^04/.test(pc)) return 'Northland';
              if(/blenheim|marlborough/.test(c) || /^72/.test(pc)) return 'Marlborough';
              if(/greymouth|hokitika|west coast/.test(c) || /^78/.test(pc)) return 'West Coast';
              return '';
            }
            function parseVariantContext(variant){
              var parts=String((variant && variant.title) || '').split('/').map(function(p){ return cleanText(p); });
              var timber=cleanText((variant && variant.option1) || parts[0] || '');
              var size=cleanText((variant && variant.option2) || parts[1] || '');
              var bench=cleanText((variant && variant.option3) || parts[2] || '');
              if(/^\d+$/.test(size)) size=size+' cm';
              return {timber_species:timber, table_size:size, bench_option:bench};
            }
            function freightDestinationContext(destination){
              destination=destination || {};
              var suburb=cleanText(destination.suburb);
              var city=cleanText(destination.city);
              var postcode=cleanText(destination.postCode || destination.postcode);
              return {
                freight_suburb:suburb,
                freight_city:city,
                freight_region:cleanText(destination.region || regionFromCity(city, postcode)),
                freight_postcode:postcode
              };
            }
            function productContext(root, variant){
              var vc=parseVariantContext(variant || {});
              return {
                product_handle:(root && root.getAttribute('data-product-handle')) || '',
                product_category:'dining_table',
                variant_id:(variant && variant.id) || '',
                variant_title:(variant && variant.title) || '',
                timber_species:vc.timber_species,
                table_size:vc.table_size,
                bench_option:vc.bench_option,
                table_length_mm:parseLengthMm(variant || {}),
                bench_count:parseBenchCount(variant || {})
              };
            }
            document.addEventListener('click', function(event){"""
patched = replace_once(patched, old, new, 'insert delegated privacy helpers')

# Add requested/product/destination context to the freight request event.
old = """              var variant=selectedVariant(variants);
              innateFreightTrack('dining_freight_quote_requested', {product_handle:root.getAttribute('data-product-handle') || '', variant_id:variant.id || '', variant_title:variant.title || ''});
              result.textContent='Checking Mainfreight 2 Home estimate…';"""
new = """              var variant=selectedVariant(variants);
              var destination=(window.__innateFreightSelectedDestination && window.__innateFreightSelectedDestination.sourceValue === address)
                ? window.__innateFreightSelectedDestination
                : parseAddress(address);
              var productPayload=productContext(root, variant);
              var destinationPayload=freightDestinationContext(destination);
              innateFreightTrack('dining_freight_quote_requested', Object.assign({}, productPayload, destinationPayload));
              result.textContent='Checking Mainfreight 2 Home estimate…';"""
patched = replace_once(patched, old, new, 'insert request context variables')

old = """                window.__innateLastFreightEstimate=data;
                innateFreightTrack('dining_freight_quote_returned', {product_handle:root.getAttribute('data-product-handle') || '', ok:!!(data && data.ok), status:(data && (data.status || data.reason || data.label)) || '', estimate_incl_gst:(data && data.estimateInclGst) || null, raw_mainfreight_incl_gst:(data && data.rawMainfreightInclGst) || null, manual_check_offered:!!(data && data.manualCheckOffered)});"""
new = """                window.__innateLastFreightEstimate=data;
                var freightMethod=(data && data.localDeliveryProvider) ? 'local_delivery' : ((data && data.manualCheckOffered) ? 'manual_check' : 'mainfreight');
                var resultPayload={};
                Object.assign(resultPayload, productPayload, destinationPayload, {
                  ok:!!(data && data.ok),
                  freight_result:(data && data.ok) ? 'success' : 'manual_or_error',
                  freight_status:(data && (data.status || data.reason || data.label)) || '',
                  freight_method:freightMethod,
                  estimate_incl_gst:(data && data.estimateInclGst) || null,
                  raw_mainfreight_incl_gst:(data && data.rawMainfreightInclGst) || null,
                  manual_check_offered:!!(data && data.manualCheckOffered),
                  currency:'NZD'
                });
                innateFreightTrack('dining_freight_quote_returned', resultPayload);"""
patched = replace_once(patched, old, new, 'replace quote returned payload')

old = """                    innateFreightTrack('dining_freight_manual_check_shown', {product_handle:root.getAttribute('data-product-handle') || '', estimate_incl_gst:data.estimateInclGst || null});"""
new = """                    var manualPayload={};
                    Object.assign(manualPayload, productPayload, destinationPayload, {freight_result:'manual_check', freight_method:'manual_check', estimate_incl_gst:data.estimateInclGst || null, currency:'NZD'});
                    innateFreightTrack('dining_freight_manual_check_shown', manualPayload);"""
patched = replace_once(patched, old, new, 'replace manual check payload')

old = """              var destination=(window.__innateFreightSelectedDestination && window.__innateFreightSelectedDestination.sourceValue === address)
                ? window.__innateFreightSelectedDestination
                : parseAddress(address);
              var query={callback:callbackName,source:'shopify_dining_freight_checker',productHandle:root.getAttribute('data-product-handle'),tableLengthMm:parseLengthMm(variant),tableWidthMm:1000,benchCount:parseBenchCount(variant),suburb:destination.suburb,city:destination.city,postCode:destination.postCode,addressEntered:address,formattedAddress:destination.formattedAddress || address,pageUrl:window.location.href,variantId:variant.id || '',variantTitle:variant.title || ''};"""
# Destination is now defined before the request event; replace only the freight endpoint query.
old = """              var query={callback:callbackName,source:'shopify_dining_freight_checker',productHandle:root.getAttribute('data-product-handle'),tableLengthMm:parseLengthMm(variant),tableWidthMm:1000,benchCount:parseBenchCount(variant),suburb:destination.suburb,city:destination.city,postCode:destination.postCode,addressEntered:address,formattedAddress:destination.formattedAddress || address,pageUrl:window.location.href,variantId:variant.id || '',variantTitle:variant.title || ''};"""
new = """              var query={callback:callbackName,source:'shopify_dining_freight_checker',productHandle:root.getAttribute('data-product-handle'),tableLengthMm:productPayload.table_length_mm,tableWidthMm:1000,benchCount:productPayload.bench_count,suburb:destination.suburb,city:destination.city,postCode:destination.postCode,addressEntered:address,formattedAddress:destination.formattedAddress || address,pageUrl:window.location.href,variantId:variant.id || '',variantTitle:variant.title || ''};"""
patched = replace_once(patched, old, new, 'replace freight query context')

# Add region + product category to autocomplete selected event; no full address/place ID.
old = """                  window.__innateFreightSelectedDestination={
                    sourceValue: input.value,
                    suburb: data.destination.suburb || input.value,
                    city: data.destination.city || data.destination.suburb || input.value,
                    postCode: data.destination.postCode || '',
                    formattedAddress: data.destination.formattedAddress || input.value
                  };
                  innateFreightTrack('dining_freight_address_selected', {suburb:data.destination.suburb || '', city:data.destination.city || '', postcode:data.destination.postCode || ''});"""
new = """                  var dest={
                    sourceValue: input.value,
                    suburb: data.destination.suburb || input.value,
                    city: data.destination.city || data.destination.suburb || input.value,
                    postCode: data.destination.postCode || '',
                    region: data.destination.region || '',
                    formattedAddress: data.destination.formattedAddress || input.value
                  };
                  window.__innateFreightSelectedDestination=dest;
                  var region=(dest.region || (function(city, postcode){
                    city=String(city || '').toLowerCase(); postcode=String(postcode || '');
                    if(/auckland/.test(city) || /^0[6-9]|^10|^11|^12|^21/.test(postcode)) return 'Auckland';
                    if(/christchurch|rangiora|rolleston|kaiapoi|selwyn|waimakariri/.test(city) || /^7[6-9]|^80|^81|^82/.test(postcode)) return 'Canterbury';
                    if(/wellington|lower hutt|upper hutt|porirua/.test(city) || /^50|^51|^52|^53|^60|^61|^62/.test(postcode)) return 'Wellington';
                    if(/hamilton|waikato|cambridge|te awamutu|taupo/.test(city) || /^32|^33|^34/.test(postcode)) return 'Waikato';
                    if(/tauranga|rotorua|whakatane|bay of plenty/.test(city) || /^30|^31/.test(postcode)) return 'Bay of Plenty';
                    if(/dunedin|queenstown|wanaka|alexandra|otago/.test(city) || /^90|^91|^92|^93/.test(postcode)) return 'Otago';
                    if(/invercargill|southland/.test(city) || /^98/.test(postcode)) return 'Southland';
                    if(/nelson|tasman|motueka|richmond/.test(city) || /^70|^71/.test(postcode)) return 'Nelson Tasman';
                    if(/new plymouth|taranaki/.test(city) || /^43/.test(postcode)) return 'Taranaki';
                    if(/napier|hastings|hawke/.test(city) || /^41/.test(postcode)) return 'Hawke’s Bay';
                    if(/palmerston north|whanganui|manawatu/.test(city) || /^44|^45|^46|^47|^48/.test(postcode)) return 'Manawatū-Whanganui';
                    if(/gisborne/.test(city) || /^40/.test(postcode)) return 'Gisborne';
                    if(/whangarei|northland|kerikeri|kaitaia/.test(city) || /^01|^02|^03|^04/.test(postcode)) return 'Northland';
                    if(/blenheim|marlborough/.test(city) || /^72/.test(postcode)) return 'Marlborough';
                    if(/greymouth|hokitika|west coast/.test(city) || /^78/.test(postcode)) return 'West Coast';
                    return '';
                  })(dest.city, dest.postCode));
                  innateFreightTrack('dining_freight_address_selected', {freight_suburb:dest.suburb || '', freight_city:dest.city || '', freight_region:region || '', freight_postcode:dest.postCode || '', product_category:'dining_table'});"""
patched = replace_once(patched, old, new, 'replace address selected payload')

# Keep existing started event but add product category when present.
patched, started_count = replace_all_required(patched, "innateFreightTrack('dining_freight_address_started', {input_length:value.length});", "innateFreightTrack('dining_freight_address_started', {input_length:value.length, product_category:'dining_table'});", 'address started payload', min_count=1)

markers = [
    'freight_suburb', 'freight_city', 'freight_region', 'freight_postcode',
    'freight_result', 'freight_status', 'freight_method', 'estimate_incl_gst',
    'product_category', 'timber_species', 'table_size', 'bench_count'
]
missing=[m for m in markers if m not in patched]
if missing:
    raise SystemExit('Missing markers after patch: '+', '.join(missing))

if patched == orig:
    raise SystemExit('No changes produced')

(BACKUP/'after_product-blocks.liquid').write_text(patched, encoding='utf-8')
if '--dry-run' in sys.argv:
    print(json.dumps({'ok': True, 'dry_run': True, 'backup': str(BACKUP), 'started_replacements': started_count, 'before_bytes': len(orig), 'after_bytes': len(patched)}, indent=2))
    sys.exit(0)

put_asset(THEME_ID,ASSET_KEY,patched)
readback=get_asset(THEME_ID,ASSET_KEY)
(BACKUP/'readback_product-blocks.liquid').write_text(readback, encoding='utf-8')
readback_missing=[m for m in markers if m not in readback]
print(json.dumps({'ok': not readback_missing, 'theme_id': THEME_ID, 'asset': ASSET_KEY, 'theme_role': theme.get('role'), 'backup': str(BACKUP), 'readback_missing': readback_missing, 'started_replacements': started_count, 'before_bytes': len(orig), 'after_bytes': len(readback)}, indent=2))
