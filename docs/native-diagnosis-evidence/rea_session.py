import sys, os, json, subprocess, select, time, pathlib
out=pathlib.Path(__file__).parent
env=os.environ.copy()
env.update(GHIDRA_INSTALL_DIR='/Users/baoxingzhang/.local/share/rea/ghidra/ghidra_12.1.4_PUBLIC',JAVA_HOME='/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home',REA_GHIDRA_STARTUP_TIMEOUT_MS='300000')
err=open(out/'rea-server.log','w')
p=subprocess.Popen(['/Users/baoxingzhang/.nvm/versions/node/v24.22.1/bin/node','/Users/baoxingzhang/.nvm/versions/node/v24.22.1/lib/node_modules/rea-agents/scripts/rea.mjs','--mcp'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=err,text=True,bufsize=1,env=env)
i=0
def rpc(method,params,budget=330):
 global i
 i+=1
 p.stdin.write(json.dumps(dict(jsonrpc='2.0',id=i,method=method,params=params))+'\n');p.stdin.flush()
 end=time.monotonic()+budget
 while time.monotonic()<end:
  if not select.select([p.stdout],[],[],min(1,end-time.monotonic()))[0]:continue
  line=p.stdout.readline()
  if not line:raise RuntimeError('Server EOF')
  v=json.loads(line)
  if v.get('id')==i:return v
 raise TimeoutError(method)
try:
 print(json.dumps(rpc('initialize',{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'alpha-static-diagnosis','version':'1.0'}},30)),flush=True)
 p.stdin.write(json.dumps(dict(jsonrpc='2.0',method='notifications/initialized'))+'\n');p.stdin.flush()
 catalog=rpc('tools/list',{},30)
 (out/'tool-schemas.json').write_text(json.dumps(catalog,indent=2))
 print('READY: tool schemas saved',flush=True)
 for line in sys.stdin:
  command=json.loads(line)
  if command.get('stop'):break
  result=rpc('tools/call',{'name':command['tool'],'arguments':command.get('args',{})},command.get('budget',330))
  dest=out/(command.get('save',command['tool'])+'.json')
  dest.write_text(json.dumps(result,indent=2))
  print(json.dumps({'saved':str(dest),'error':result.get('error'),'isError':result.get('result',{}).get('isError')}),flush=True)
finally:
 try:rpc('tools/call',{'name':'close_binary','arguments':{}},30)
 except Exception as e:print(str(e),flush=True)
 p.terminate()
 try:p.wait(timeout=10)
 except subprocess.TimeoutExpired:p.kill();p.wait()
 err.close()
