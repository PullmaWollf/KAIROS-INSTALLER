import test from 'node:test';
import assert from 'node:assert/strict';
import {createOAuthServer} from '../oauth/server.js';
const env={KAIROS_GITHUB_CLIENT_ID:'Iv1_example012345',KAIROS_GITHUB_CLIENT_SECRET:'test-secret-for-github-123456789'};
test('POST opera só com origem, CSRF e aceite explícito; nunca devolve token',async()=>{
 const port=43862;let called=0;
 const server=createOAuthServer({env,port,operator:async({consent,tokens})=>{called++;assert.equal(consent.owner,'cliente');assert.equal(tokens.github,undefined);return {status:'dry-run'};}});
 await server.start();
 try{
  const base='http://127.0.0.1:'+port;
  const landing=await fetch(base);
  const cookie=landing.headers.get('set-cookie').split(';')[0],html=await landing.text();
  const csrf=html.match(/name="csrf" value="([^"]+)"/)?.[1];
  assert.ok(csrf);
  const params=new URLSearchParams({csrf,owner:'cliente',organizationId:'org_cliente',teamId:'team_cliente',acceptBilling:'yes'});
  const wrong=await fetch(base+'/operate',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded',Origin:'http://evil.example'},body:params});
  assert.equal(wrong.status,403);assert.equal(called,0);
  const good=await fetch(base+'/operate',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded',Origin:base},body:params});
  assert.equal(good.status,200);assert.equal(called,1);
  assert.deepEqual(await good.json(),{status:'dry-run'});
 }finally{await server.close();}
});
