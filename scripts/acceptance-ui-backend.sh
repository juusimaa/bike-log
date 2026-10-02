#!/usr/bin/env bash
set -euo pipefail
python3 - <<'PY'
import datetime, ipaddress, json, os, urllib.request, urllib.error, urllib.parse, uuid
base=os.environ.get('BIKELOG_API_URL','http://127.0.0.1:5080').rstrip('/')
u=urllib.parse.urlparse(base)
try: loopback=ipaddress.ip_address(u.hostname).is_loopback
except ValueError: loopback=False
if u.scheme!='http' or not loopback or u.username or u.password or u.path or u.query or u.fragment:
    raise SystemExit('Acceptance only permits an explicit loopback HTTP API URL.')
class RefuseRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
opener=urllib.request.build_opener(RefuseRedirect())
def request(method,path,body=None,status=200):
    data=None if body is None else json.dumps(body).encode()
    r=urllib.request.Request(base+path,data=data,method=method,headers={'Content-Type':'application/json'})
    try:
        with opener.open(r,timeout=15) as response:
            assert response.status==status, (path,response.status)
            raw=response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path}: HTTP {e.code}; acceptance failed.') from None
def pages(path):
    cursor=None; result=[]
    while True:
        query={'pageSize':2}
        if cursor: query['cursor']=cursor
        page=request('GET',path+('&' if '?' in path else '?')+urllib.parse.urlencode(query))
        result.extend(page['items']); cursor=page['nextCursor']
        if not cursor: return result
mark='UI acceptance synthetic '+uuid.uuid4().hex
start=datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=3)
time=lambda hours:(start+datetime.timedelta(hours=hours)).isoformat()
request('GET','/health/ready')
for n in range(2):
    bike=request('POST','/api/bikes',{'name':mark+str(n),'make':'Synthetic','model':'Gravel','kind':'gravel','year':2026,'color':'#12AB34'},201)
    for position,kind in [('chain','chain'),('cassette','cassette'),('front-tyre','tyre'),('rear-tyre','tyre')]:
        part=request('POST','/api/components',{'type':kind,'model':mark+str(n)+position},201)
        request('POST','/api/installations',{'bikeId':bike['id'],'componentId':part['id'],'position':position,'startUtc':time(0)},201)
    request('POST','/api/rides',{'bikeId':bike['id'],'name':mark+' ride '+str(n),'startUtc':time(1),'distanceMetres':65000,'durationSeconds':3600},201)
# Reload every identity through public pages; no POST-returned IDs survive this boundary.
bikes=[x for x in pages('/api/bikes') if (x['name'] or '').startswith(mark)]
parts=[x for x in pages('/api/components') if (x['model'] or '').startswith(mark)]
assert len(bikes)==2 and len(parts)==8
bike=next(x for x in bikes if x['name']==mark+'0')
edited=request('PUT','/api/bikes/'+bike['id'],{'name':mark+' renamed','make':'Synthetic','model':'Gravel','kind':'gravel','year':2026,'color':None,'expectedVersion':bike['version']})
cleared=request('PUT','/api/bikes/'+bike['id'],{'name':None,'make':'Synthetic','model':'Gravel','kind':'gravel','year':2026,'color':None,'expectedVersion':edited['version']})
assert cleared['name'] is None and cleared['displayName']=='Synthetic Gravel'
rides=pages('/api/bikes/'+bike['id']+'/rides'); assert any(x['name']==mark+' ride 0' for x in rides)
installations=pages('/api/bikes/'+bike['id']+'/installations?status=all')
rear=next(x for x in parts if x['model']==mark+'0rear-tyre')
chain=next(x for x in parts if x['model']==mark+'0chain')
old=next(x['installation'] for x in installations if x['installation']['componentId']==rear['id'])
assert request('GET','/api/components/'+rear['id']+'/usage')['lifetimeMetres']==65000
replacement=request('POST','/api/installations/'+old['id']+'/replacement-with-service',{'newModel':mark+' replacement rear','replacedAtUtc':time(24),'expectedInstallationVersion':old['version'],'cost':25,'currency':'EUR'})
request('POST','/api/maintenance',{'bikeId':bike['id'],'componentId':chain['id'],'task':'Lubricate chain','taskKey':'chain-lubrication','performedUtc':time(24),'cost':5,'currency':'EUR','notes':mark+' lubrication notes'},201)
request('POST','/api/rides',{'bikeId':bike['id'],'name':mark+' after replacement','startUtc':time(25),'distanceMetres':10000},201)
allparts=pages('/api/components')
assert any(x['id']==rear['id'] for x in allparts)
new=next(x for x in allparts if x['model']==mark+' replacement rear')
assert request('GET','/api/components/'+new['id']+'/usage')['lifetimeMetres']==10000
assert request('GET','/api/components/'+rear['id']+'/usage')['lifetimeMetres']==65000
request('PUT','/api/components/'+rear['id']+'/estimate',{'initialUsageEstimateMetres':120000,'expectedVersion':rear['version']})
assert request('GET','/api/components/'+rear['id']+'/usage')['combinedLifetimeMetres']==185000
rule=request('PUT','/api/bikes/'+bike['id']+'/reminder',{'enabled':True,'method':'oil','oilThresholdMetres':20000,'waxThresholdMetres':40000,'expectedVersion':0})
assert rule['remainingMetres']==10000 and rule['distanceSinceBaselineMetres']==10000
wax=request('PUT','/api/bikes/'+bike['id']+'/reminder',{'enabled':True,'method':'wax','oilThresholdMetres':20000,'waxThresholdMetres':40000,'expectedVersion':rule['ruleVersion']})
assert wax['remainingMetres']==30000 and wax['baselineUtc']==rule['baselineUtc']
overview=request('GET','/api/bikes/'+bike['id']+'/overview')
assert overview['rideCount']==2 and overview['recordedDistanceMetres']==75000
assert overview['spendingByCurrency']==[{'currency':'EUR','amount':30}]
assert len(overview['currentComponents'])==4 and not overview['allocationGaps']
assert request('GET','/api/bikes/'+bike['id']+'/reminder')['method']=='wax'
assert any(x['notes']==mark+' lubrication notes' for x in pages('/api/components/'+chain['id']+'/maintenance'))
other=next(x for x in bikes if x['id']!=bike['id'])
otherinst=pages('/api/bikes/'+other['id']+'/installations?status=all')[0]['installation']
withoutcost=request('POST','/api/installations/'+otherinst['id']+'/replacement-with-service',{'newModel':mark+' no cost','replacedAtUtc':time(24),'expectedInstallationVersion':otherinst['version']})
assert withoutcost['maintenance']['cost'] is None and withoutcost['maintenance']['currency'] is None
print('UI backend acceptance PASS: paged reload, eight parts, retained replacement, 65000/10000 m, 185000 m estimate, EUR stats, oil/wax baseline.')
PY
