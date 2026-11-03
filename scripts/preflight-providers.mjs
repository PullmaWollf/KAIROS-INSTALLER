#!/usr/bin/env node
/* Preflight SOMENTE LEITURA. Credenciais são lidas do ambiente; nenhum segredo é persistido. */
import {preflightSupabase,preflightVercel,targetsFromEnv} from '../provisioner/providers.js';
import {ProvisioningError} from '../provisioner/plan.js';
try{
 if(process.argv.includes('--help')){
  console.log('Uso: npm run providers:check\nVariáveis locais: SUPABASE_ACCESS_TOKEN, VERCEL_TOKEN, KAIROS_SUPABASE_ORG_ID, KAIROS_VERCEL_TEAM_ID.\nVerifica acesso somente por GET. Não cria projetos ou lê chaves de aplicações.');
  process.exit(0);
 }
 if(process.argv.length>2)throw new ProvisioningError('USAGE','Este comando não aceita argumentos de criação ou execução');
 const {organizationId,teamId}=targetsFromEnv();
 const [supabase,vercel]=await Promise.all([
  preflightSupabase({token:process.env.SUPABASE_ACCESS_TOKEN,organizationId}),
  preflightVercel({token:process.env.VERCEL_TOKEN,teamId})
 ]);
 console.log(JSON.stringify({status:'read-only-preflight',supabase,vercel},null,2));
 console.log('Acesso verificado; titularidade e custos ainda exigem confirmação explícita antes de qualquer criação.');
}catch(e){
 console.error('KAIRÓS:',e instanceof ProvisioningError?'['+e.code+'] '+e.message:'Falha inesperada no diagnóstico.');
 process.exitCode=1;
}
