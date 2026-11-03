import test from 'node:test';
import assert from 'node:assert/strict';
import {readinessReport} from '../provisioner/preflight.js';
const config={owner:'cliente',repository:'kairos-cliente',cellName:'Célula Cliente',visibility:'private',
 supabaseOrgId:'org_abc123',supabaseRef:'',supabaseRegion:'sa-east-1',vercelTeamId:'team_abc123',
 vercelProjectId:'',coreDir:'/tmp/kairos-cliente',adminLogin:'admin',adminName:'Administrador',pwaUrl:''};
test('readiness report nunca exibe tokens nem acessa rede',()=>{
 const token='highly-sensitive-value-should-be-hidden';
 const result=readinessReport(config,{GITHUB_TOKEN:token},{phase:'github'});
 assert.equal(result.canProceed,true);assert.equal(result.remoteCalls,0);
 assert.equal(JSON.stringify(result).includes(token),false);
 assert.equal(result.homologated,false);
});
test('bloqueia fases com credenciais ou destinos ausentes',()=>{
 const a=readinessReport(config,{}, {phase:'github'});
 assert.equal(a.canProceed,false);
 assert.ok(a.findings.some(x=>x.code==='credential-GITHUB_TOKEN'&&x.status==='blocked'));
 const b=readinessReport(config,{VERCEL_TOKEN:'temporary'}, {phase:'deploy'});
 assert.equal(b.canProceed,false);
});
test('bloqueia chaves incompatíveis com a instalação da célula',()=>{
 const c={...config,supabaseRef:'abcdefghijklmnopqrst',vercelProjectId:'prj_example123'};
 const result=readinessReport(c,{VERCEL_TOKEN:'a',SUPABASE_URL:'https://wrong.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'s'.repeat(50),SESSION_SECRET:'s'.repeat(60)},{phase:'env'});
 assert.equal(result.canProceed,false);
 assert.ok(result.findings.some(x=>x.code==='secrets-compatible'&&x.status==='blocked'));
});
