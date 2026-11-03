import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightSupabase,preflightVercel,targetsFromEnv} from '../provisioner/providers.js';
import {providerGet} from '../provisioner/provider-http.js';
const ok=(data,status=200)=>({status,async json(){return data;}});
test('Supabase somente GET, confirma seleção e marca titularidade não verificada',async()=>{
 let calls=[];
 const fetcher=async (url,opts)=>{calls.push({url,method:opts.method});return ok([{id:'org_123456',slug:'comunidade-testes',name:'Minha Comunidade'}]);};
 const result=await preflightSupabase({fetcher,token:'fake-token',organizationId:'org_123456'});
 assert.equal(result.accessible,true);
 assert.equal(result.organizationSlug,'comunidade-testes');
 assert.equal(result.ownership,'not-verified');
 assert.equal(result.createsResources,false);
 assert.deepEqual(calls,[{url:'https://api.supabase.com/v1/organizations',method:'GET'}]);
});
test('Supabase recusa organização não acessível e conta do mantenedor',async()=>{
 await assert.rejects(preflightSupabase({token:'fake',organizationId:'org_123456',fetcher:async()=>ok([])}),e=>e.code==='NOT_MEMBER');
 await assert.rejects(preflightSupabase({token:'fake',organizationId:'org_123456',fetcher:async()=>ok([{id:'org_123456',name:'PullmaWollf'}])}),e=>e.code==='MAINTAINER_ACCOUNT');
});
test('Vercel consulta usuário e lista de times sem enviar POST',async()=>{
 let methods=[];
 const fetcher=async (url,opts)=>{
  methods.push(opts.method);
  return ok(url.endsWith('/v2/user')?{user:{username:'operador-celula'}}:{teams:[{id:'team_123456',slug:'minha-celula'}]});
 };
 const result=await preflightVercel({fetcher,token:'fake',teamId:'team_123456'});
 assert.equal(result.teamSlug,'minha-celula');
 assert.equal(result.ownership,'not-verified');
 assert.deepEqual(methods,['GET','GET']);
});
test('Vercel bloqueia mantenedor e time desconhecido',async()=>{
 await assert.rejects(preflightVercel({fetcher:async url=>ok(url.endsWith('/v2/user')?{user:{username:'PullmaWollf'}}:{teams:[]}),token:'fake',teamId:'team_123456'}),e=>e.code==='MAINTAINER_ACCOUNT');
 await assert.rejects(preflightVercel({fetcher:async url=>ok(url.endsWith('/v2/user')?{user:{username:'ccliente'}}:{teams:[]}),token:'fake',teamId:'team_123456'}),e=>e.code==='NOT_MEMBER');
});
test('HTTP errors sanitized and missing tokens fail before network',async()=>{
 const error=async()=>ok({message:'secret leaked'},403);
 await assert.rejects(providerGet({fetcher:error,base:'https://api.supabase.com',path:'/v1/organizations',token:'hidden',provider:'Supabase'}),e=>e.code==='PERMISSION'&&!e.message.includes('secret'));
 await assert.rejects(providerGet({fetcher:async()=>{throw Error('secret leak')},base:'https://api.vercel.com',path:'/v2/user',token:'hidden',provider:'Vercel'}),e=>e.code==='NETWORK'&&!e.message.includes('secret'));
 await assert.rejects(providerGet({fetcher:()=>{throw Error('must not call')},base:'https://api.vercel.com',path:'/v2/user',token:'',provider:'Vercel'}),e=>e.code==='NO_AUTH');
});
test('Exige destinos explícitos sem valores padrão do mantenedor',()=>{
 assert.throws(()=>targetsFromEnv({}),e=>e.code==='MISSING_TARGET');
 assert.deepEqual(targetsFromEnv({KAIROS_SUPABASE_ORG_ID:'org_123456',KAIROS_VERCEL_TEAM_ID:'team_123456'}),{organizationId:'org_123456',teamId:'team_123456'});
});
