#!/usr/bin/env python3
from __future__ import annotations
import datetime as dt, json, os
from pathlib import Path
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

PROFILE_HOME = Path('/Users/mack-mini/.hermes/profiles/website')
TOKEN_PATH=PROFILE_HOME / 'google_website_readonly_token.json'
SCOPES = [
  'openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/webmasters.readonly','https://www.googleapis.com/auth/analytics.readonly','https://www.googleapis.com/auth/drive'
]
PROPERTY = 'properties/385933347'

def creds():
    c = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if c.expired and c.refresh_token:
        c.refresh(Request())
        payload = json.loads(c.to_json()); payload['scopes'] = SCOPES
        TOKEN_PATH.write_text(json.dumps(payload, indent=2))
    return c

svc = build('analyticsdata','v1beta',credentials=creds(),cache_discovery=False)
admin = build('analyticsadmin','v1beta',credentials=creds(),cache_discovery=False)

def run(name, days, metrics, dimensions=None, limit=20, dimension_filter=None, order_metric=None):
    end = dt.date.today()
    start = end - dt.timedelta(days=days)
    body = {
        'dateRanges':[{'startDate':start.isoformat(),'endDate':end.isoformat()}],
        'metrics':[{'name':m} for m in metrics],
        'limit':limit,
    }
    if dimensions:
        body['dimensions']=[{'name':d} for d in dimensions]
    if dimension_filter:
        body['dimensionFilter'] = dimension_filter
    if order_metric:
        body['orderBys']=[{'metric':{'metricName':order_metric},'desc':True}]
    try:
        resp=svc.properties().runReport(property=PROPERTY,body=body).execute()
        rows=[]
        for r in resp.get('rows',[]):
            row={}
            for i,d in enumerate(dimensions or []): row[d]=r.get('dimensionValues',[])[i].get('value')
            for i,m in enumerate(metrics): row[m]=r.get('metricValues',[])[i].get('value')
            rows.append(row)
        return {'ok':True,'name':name,'days':days,'rows':rows,'rowCount':resp.get('rowCount',len(rows))}
    except HttpError as e:
        return {'ok':False,'name':name,'error':str(e)[:500]}

def filt_dim_exact(dim, val):
    return {'filter': {'fieldName': dim, 'stringFilter': {'matchType':'EXACT','value': val}}}

def filt_dim_contains(dim, val):
    return {'filter': {'fieldName': dim, 'stringFilter': {'matchType':'CONTAINS','value': val}}}

reports = []
# Global snapshots
for days in (7,30,90):
    reports.append(run(f'overview_{days}d', days, ['activeUsers','sessions','screenPageViews','engagedSessions','engagementRate','averageSessionDuration','eventCount','conversions','totalRevenue'], None, 1))
reports.append(run('daily_30d',30,['activeUsers','sessions','screenPageViews','engagedSessions','conversions'],['date'],35,order_metric='sessions'))
reports.append(run('top_events_90d',90,['eventCount','activeUsers'],['eventName'],50,order_metric='eventCount'))
reports.append(run('key_events_90d',90,['eventCount','activeUsers'],['eventName'],50, {'orGroup': {'expressions':[filt_dim_exact('eventName',x) for x in ['purchase','contact_us_form_submission','form_submit','add_to_cart','begin_checkout','view_cart','benchtop_configurator_view','benchtop_configurator_start','benchtop_quote_submit','dining_freight_quote_returned','dining_size_calculator_used']]}} ,order_metric='eventCount'))
reports.append(run('top_pages_90d',90,['screenPageViews','activeUsers','sessions','engagedSessions','eventCount'],['pagePathPlusQueryString','pageTitle'],40,order_metric='screenPageViews'))
reports.append(run('top_landing_pages_90d',90,['sessions','activeUsers','engagedSessions','conversions'],['landingPagePlusQueryString'],30,order_metric='sessions'))
reports.append(run('traffic_sources_90d',90,['sessions','activeUsers','engagedSessions','conversions','totalRevenue'],['sessionDefaultChannelGroup','sessionSourceMedium'],40,order_metric='sessions'))
reports.append(run('devices_90d',90,['sessions','activeUsers','engagedSessions','conversions'],['deviceCategory','browser','operatingSystem'],30,order_metric='sessions'))
reports.append(run('regions_90d',90,['sessions','activeUsers','engagedSessions','conversions'],['country','region','city'],40,order_metric='sessions'))
reports.append(run('site_search_terms_90d',90,['eventCount','activeUsers'],['searchTerm'],30, {'notExpression': filt_dim_exact('searchTerm','(not set)')}, order_metric='eventCount'))
reports.append(run('view_item_products_90d',90,['eventCount','activeUsers'],['itemName','itemCategory'],40, filt_dim_exact('eventName','view_item'), order_metric='eventCount'))
reports.append(run('item_list_products_90d',90,['eventCount','activeUsers'],['itemListName','itemName'],40, filt_dim_exact('eventName','view_item_list'), order_metric='eventCount'))
reports.append(run('purchase_items_90d',90,['itemsPurchased','itemRevenue'],['itemName','itemCategory'],30, None, order_metric='itemRevenue'))
reports.append(run('benchtop_page_events_90d',90,['eventCount','activeUsers'],['eventName'],30, filt_dim_contains('pagePath','timber-panels'), order_metric='eventCount'))
reports.append(run('dining_collection_events_90d',90,['eventCount','activeUsers'],['eventName'],30, filt_dim_contains('pagePath','collections/dining-tables'), order_metric='eventCount'))
reports.append(run('product_page_events_90d',90,['eventCount','activeUsers'],['eventName'],30, filt_dim_contains('pagePath','/products/'), order_metric='eventCount'))
reports.append(run('new_tracking_events_7d',7,['eventCount','activeUsers'],['eventName'],50, {'orGroup': {'expressions':[filt_dim_exact('eventName',x) for x in ['page_context_view','cta_click','navigation_click','product_card_click','collection_filter_used','timber_swatch_selected','product_variant_selected','contact_enquiry_started','commercial_enquiry_started','boardroom_enquiry_started','form_start_contextual','form_submit_contextual','add_to_cart_contextual','faq_opened','dining_freight_quote_returned','benchtop_quote_submit']]}} ,order_metric='eventCount'))

# Custom definitions list
try:
    dims = admin.properties().customDimensions().list(parent=PROPERTY).execute().get('customDimensions',[])
    metrics = admin.properties().customMetrics().list(parent=PROPERTY).execute().get('customMetrics',[])
    defs = {'dimensions':[{'displayName':d.get('displayName'),'parameterName':d.get('parameterName'),'scope':d.get('scope')} for d in dims], 'metrics':[{'displayName':m.get('displayName'),'parameterName':m.get('parameterName'),'scope':m.get('scope'),'measurementUnit':m.get('measurementUnit')} for m in metrics]}
except Exception as e:
    defs = {'error':str(e)[:500]}

print(json.dumps({'property':PROPERTY,'generated':dt.datetime.now().isoformat(),'reports':reports,'custom_definitions':defs}, indent=2))
