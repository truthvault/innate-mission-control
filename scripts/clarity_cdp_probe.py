#!/usr/bin/env python3
import json, time, urllib.request, websocket, itertools

def page_ws():
    pages=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list'))
    for p in pages:
        if p.get('type')=='page' and 'clarity.microsoft.com' in p.get('url',''):
            return p['webSocketDebuggerUrl']
    raise SystemExit('no clarity page')

class CDP:
    def __init__(self, wsurl):
        self.ws=websocket.create_connection(wsurl, timeout=10)
        self.ids=itertools.count(1)
    def call(self, method, params=None):
        i=next(self.ids)
        self.ws.send(json.dumps({'id':i,'method':method,'params':params or {}}))
        while True:
            msg=json.loads(self.ws.recv())
            if msg.get('id')==i:
                return msg
    def eval(self, expr, awaitPromise=False):
        return self.call('Runtime.evaluate', {'expression':expr,'returnByValue':True,'awaitPromise':awaitPromise,'timeout':30000})

cdp=CDP(page_ws())
cdp.call('Runtime.enable')
cdp.call('Page.enable')
# wait
for _ in range(20):
    res=cdp.eval("({url:location.href,title:document.title,text:document.body && document.body.innerText.slice(0,2000)})")
    val=res.get('result',{}).get('result',{}).get('value')
    if val:
        print(json.dumps(val, indent=2))
        if 'Your session has expired' not in val.get('text','') and 'Welcome back' not in val.get('text',''):
            break
    time.sleep(1)
