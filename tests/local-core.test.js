import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateCloneDestination,cloneCore} from '../provisioner/local-core.js';
test('clone valida conta, pasta vazia e recusa destino preexistente',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kairos-clone-test-'));
 try{
  const dir=join(root,'core');
  assert.equal(await validateCloneDestination({owner:'cliente',repository:'kairos-cliente',coreDir:dir}),dir);
  await assert.rejects(validateCloneDestination({owner:'PullmaWollf',repository:'KAIROS-CORE',coreDir:dir}),e=>e.code==='BAD_REPO');
  await mkdir(dir);
  await assert.rejects(validateCloneDestination({owner:'cliente',repository:'kairos-cliente',coreDir:dir}),e=>e.code==='DEST_EXISTS');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('GH_TOKEN chega somente pelo ambiente, nunca nos argumentos',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kairos-ghclone-'));
 try{
  const dir=join(root,'core'),calls=[];
  const runner=async(command,args,opts)=>{
   calls.push([command,args,opts.env]);
   if(command==='gh'){
    await mkdir(join(dir,'supabase','migrations'),{recursive:true});
    await writeFile(join(dir,'supabase','migrations','20261103000000_kairos_initial.sql'),'create table if not exists public.app_users (id uuid); alter table public.app_users enable row level security;');
    return {code:0,stdout:''};
   }
   return {code:0,stdout:'https://github.com/cliente/kairos-cliente.git'};
  };
  const result=await cloneCore({owner:'cliente',repository:'kairos-cliente',coreDir:dir,token:'github-private-token',runner});
  assert.equal(result.cloned,true);
  assert.equal(calls[0][0],'gh');
  assert.equal(calls[0][2].GH_TOKEN,'github-private-token');
  assert.equal(JSON.stringify(calls[0][1]).includes('github-private-token'),false);
 }finally{await rm(root,{recursive:true,force:true});}
});
