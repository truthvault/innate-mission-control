#!/usr/bin/env python3
import json, time, urllib.request, websocket, itertools, sys

def get_page_ws(match='clarity.microsoft.com'):
    pages=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list'))
    for p in pages:
        if p.get('type')=='page' and match in p.get('url',''):
            return p['webSocketDebuggerUrl']
    for p in pages:
        if p.get('type')=='page': return p['webSocketDebuggerUrl']
    raise SystemExit('no page')
class CDP:
    def __init__(self, wsurl):
        self.ws=websocket.create_connection(wsurl, timeout=20)
        self.ids=itertools.count(1)
    def call(self, method, params=None):
        i=next(self.ids); self.ws.send(json.dumps({'id':i,'method':method,'params':params or {}}))
        while True:
            msg=json.loads(self.ws.recv())
            if msg.get('id')==i: return msg
    def eval(self, expr, awaitPromise=False):
        r=self.call('Runtime.evaluate', {'expression':expr,'returnByValue':True,'awaitPromise':awaitPromise,'timeout':60000})
        if 'exceptionDetails' in r.get('result',{}): print('EXC', json.dumps(r,indent=2), file=sys.stderr)
        return r.get('result',{}).get('result',{}).get('value')
cdp=CDP(get_page_ws())
cdp.call('Runtime.enable'); cdp.call('Page.enable')
print('before', json.dumps(cdp.eval("({url:location.href,title:document.title,text:document.body.innerText.slice(0,500)})"), indent=2))
click_expr = """
(() => {
 const els=[...document.querySelectorAll('a,button')];
 const el=els.find(e=>/Sign in to Google/i.test(e.innerText||e.textContent||'')) || els.find(e=>/Sign in/i.test(e.innerText||e.textContent||''));
 if (!el) return {clicked:false, labels:els.map(e=>(e.innerText||e.textContent||'').trim()).slice(0,20)};
 el.click(); return {clicked:true,label:(el.innerText||el.textContent||'').trim()};
})()
"""
print('click', json.dumps(cdp.eval(click_expr), indent=2))
time.sleep(5)
for i in range(15):
    # reconnect maybe page changed still same ws maybe okay
    val=cdp.eval("({url:location.href,title:document.title,text:document.body.innerText.slice(0,1200)})")
    print('state', i, json.dumps(val, indent=2))
    if val and ('Dashboard' in val.get('text','') or 'Recordings' in val.get('text','') or 'Heatmaps' in val.get('text','') or 'Projects' in val.get('text','')) and 'Welcome back' not in val.get('text',''):
        break
    time.sleep(2)
