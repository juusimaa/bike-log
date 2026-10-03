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
            assert response.status==status, f'{method} {path}: unexpected status'
            raw=response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path}: HTTP {e.code}; acceptance failed.') from None
start=datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=3)
time=lambda delta:(start+datetime.timedelta(hours=delta)).isoformat()
request('GET','/health/ready')
request('GET','/openapi/v1.json')
bike=request('POST','/api/bikes',{'name':'Acceptance synthetic '+uuid.uuid4().hex[:8], 'make':'Synthetic', 'model':'Test', 'kind':'gravel', 'year':2026},201)['id']
a=request('POST','/api/components',{'make':'Synthetic','type':'chain','model':'Acceptance synthetic chain A'},201)['id']
b=request('POST','/api/components',{'make':'Synthetic','type':'chain','model':'Acceptance synthetic chain B'},201)['id']
i=request('POST','/api/installations',{'bikeId':bike,'componentId':a,'position':'chain','startUtc':time(0)},201)['id']
request('POST','/api/rides',{'bikeId':bike,'startUtc':time(1),'distanceMetres':65000,'durationSeconds':3600},201)
assert request('GET',f'/api/components/{a}/usage')['lifetimeMetres']==65000
request('POST','/api/maintenance',{'bikeId':bike,'componentId':a,'task':'Lubrication','performedUtc':time(2),'notes':'Synthetic acceptance only'},201)
assert request('GET',f'/api/components/{a}/usage')['lifetimeMetres']==65000
request('POST',f'/api/installations/{i}/replacement',{'newComponentId':b,'replacedAtUtc':time(24),'expectedInstallationVersion':1})
request('POST','/api/rides',{'bikeId':bike,'startUtc':time(25),'distanceMetres':10000},201)
assert request('GET',f'/api/components/{a}/usage')['lifetimeMetres']==65000
assert request('GET',f'/api/components/{b}/usage')['lifetimeMetres']==10000
assert len(request('GET',f'/api/bikes/{bike}/maintenance'))==1
usage=request('GET',f'/api/bikes/{bike}/usage')
assert usage['currentChain']['componentId']==b
assert usage['currentChain']['currentInstallationMetres']==10000
assert not usage['unallocatedRideIds']
print('Acceptance PASS: synthetic chain A retains 65000 m; chain B has 10000 m; maintenance/history preserved.')
print('Synthetic acceptance bike ID: '+bike)
PY
