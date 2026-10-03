#!/usr/bin/env bash
set -euo pipefail
# Normalize only this verification process and its owned children.
unset NO_COLOR FORCE_COLOR
export FORCE_COLOR=0
cd "$(dirname "$0")/.."
export PATH="$PWD/.local/tooling/node_modules/node/bin:$PATH"
export BIKELOG_E2E_MANAGED=1
export BIKELOG_E2E_RUN="web-e2e-$(date -u +%Y%m%dT%H%M%S)-$$"
mkdir -p .local/evidence/task9
# Refuse all occupied ports. Never adopt or terminate someone else's process.
node --input-type=module <<'JS'
import net from 'node:net';
for(const port of [5080,3000]) await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(new Error(`Refusing occupied loopback port ${port}`)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});
JS
api_pid= web_pid=
cleanup(){ for pid in "$web_pid" "$api_pid"; do if [[ -n "$pid" ]]; then kill -TERM -- "-$pid" 2>/dev/null || true; fi; done; for pid in "$web_pid" "$api_pid"; do if [[ -n "$pid" ]]; then wait "$pid" 2>/dev/null || true; fi; done; }
trap cleanup EXIT INT TERM
case "${BIKELOG_E2E_WEB_MODE:-dev}" in dev|start) ;; *) echo 'Web mode must be dev or start.' >&2; exit 2;; esac
# Dedicated process groups let cleanup address only descendants we start.
python3 - <<'PY' &
import os
os.setsid();os.execve('/bin/bash',['bash','scripts/dev.sh','run'],dict(os.environ,BIKELOG_DOTNET=os.environ.get('BIKELOG_DOTNET','/usr/local/share/dotnet/dotnet')))
PY
api_pid=$!
python3 - <<'PY' &
import os
os.setsid();os.chdir('apps/web');os.execvp('node',['node','../../node_modules/next/dist/bin/next',os.environ.get('BIKELOG_E2E_WEB_MODE','dev'),'--hostname','127.0.0.1','--port','3000'])
PY
web_pid=$!
node --input-type=module <<'JS'
for(const url of ['http://127.0.0.1:5080/openapi/v1.json','http://127.0.0.1:3000']) {let ready=false;for(let i=0;i<120;i++){try{const response=await fetch(url,{signal:AbortSignal.timeout(2000)});await response.arrayBuffer();if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!ready)throw new Error(`Startup failed: ${url}`);}
process.exit(0);
JS
npm run api:check
if [[ ${BIKELOG_E2E_ACCEPTANCE:-0} == 1 ]]; then
  ./scripts/acceptance.sh
  ./scripts/acceptance-ui-backend.sh
fi
npm run web:e2e -- --project=live-chromium --project=live-webkit "$@"
