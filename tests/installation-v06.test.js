import test from 'node:test';
import assert from 'node:assert/strict';
import {migrationPlan} from '../provisioner/migrations.js';
import {bootstrapPlan,bootstrapAdmin} from '../provisioner/bootstrap.js';
import {smokePlan,smokeTest} from '../provisioner/smoke.js';
test('migração usa link explícito e somente db push --linked',()=>{
 const p=migrationPlan({projectRef:'abcdefghij123456',repoOwner:'cliente',coreDir:'/tmp/cliente'});
 assert.deepEqual(p.link,['link','--project-ref','abcdefghij123456']);
 assert.deepEqual(p.preview,['db','push','--linked','--dry-run']);
 assert.deepEqual(p.apply,['db','push','--linked','--yes']);
 assert.equal(JSON.stringify(p).includes('--remote='),false);
});
test('bootstrap bloqueia destino do mantenedor e não possui senha no plano',()=>{
 assert.throws(()=>bootstrapPlan({coreDir:'/tmp',repoOwner:'PullmaWollf',adminLogin:'administrador',adminName:'Admin'}),e=>e.code==='MAINTAINER_ACCOUNT');
 const p=bootstrapPlan({coreDir:'/tmp',repoOwner:'cliente',adminLogin:'administrador',adminName:'Admin'});
 assert.equal(JSON.stringify(p).includes('ADMIN_PASSWORD'),true);
 assert.equal(Object.keys(p).includes('password'),false);
});
test('bootstrap não realiza operações sem consentimento',async()=>{
 const p=bootstrapPlan({coreDir:'/tmp',repoOwner:'cliente',adminLogin:'admin',adminName:'Admin'});
 const runner=()=>{throw Error('executou sem autorização');};
 await assert.rejects(bootstrapAdmin({plan:p,runner}),e=>e.code==='CONSENT');
});
test('smoke verifica API pública, manifesto e proteção de /api/me sem senha',async()=>{
 const calls=[];
 const fetcher=async(url,opts)=>{
  calls.push([url,opts.method]);
  let status=200,body={};
  if(url.endsWith('/api/public'))body={ok:true,branding:{name:'Célula Teste'},posts:[]};
  if(url.endsWith('/manifest.webmanifest'))body={display:'standalone',icons:[{src:'/icon.png'}]};
  if(url.endsWith('/api/me')){status=401;body={ok:false,error:'Sessão expirada'};}
  return {status,async json(){return body;},async text(){
   if(url.endsWith('/sw.js'))return "self.addEventListener('fetch',()=>{}); url.pathname.startsWith('/api/');";
   return '<!doctype html><link href="/manifest.webmanifest"><script src="/src/app.js"></script>';
  }};
 };
 const r=await smokeTest({url:'https://minha-celula.vercel.app/',fetcher,approved:true});
 assert.equal(r.status,'smoke-passed');assert.equal(calls.length,5);assert.equal(calls.every(x=>x[1]==='GET'),true);
});
test('smoke recusa sites arbitrários e não acessa sem consentimento',async()=>{
 assert.throws(()=>smokePlan({url:'https://evil.example/'}),e=>e.code==='BAD_URL');
 assert.throws(()=>smokePlan({url:'https://user:pass@celula.vercel.app/'}),e=>e.code==='BAD_URL');
 await assert.rejects(smokeTest({url:'https://celula.vercel.app/',fetcher:()=>{throw Error('not called')}}),e=>e.code==='CONSENT');
});
test('smoke não marca sucesso com rota auth aberta',async()=>{
 const fetcher=async url=>({status:200,async json(){return url.endsWith('/api/public')?{ok:true,branding:{name:'Teste'},posts:[]}:url.endsWith('manifest.webmanifest')?{display:'standalone',icons:[]}:{ok:true,user:{id:'x'}};}});
 await assert.rejects(smokeTest({url:'https://celula.vercel.app/',fetcher,approved:true}),e=>e.code==='AUTH_FAILED');
});

test('smoke bloqueia HTML sem app e Service Worker incorreto',async()=>{
 const fake=async url=>({
  status:url.endsWith('/api/me')?401:200,
  async json(){return url.endsWith('/api/public')?{ok:true,branding:{name:'Célula'},posts:[]}:url.endsWith('/manifest.webmanifest')?{display:'standalone',icons:[{src:'/favicon.svg'}]}:{ok:false};},
  async text(){return 'unexpected document';}
 });
 await assert.rejects(smokeTest({url:'https://cliente.vercel.app/',fetcher:fake,approved:true}),e=>e.code==='PWA_FAILED');
});
