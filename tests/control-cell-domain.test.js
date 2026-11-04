import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSlugForCell,proposedCellDomain,ensureCellDomain,verifiedCellDomain} from '../provisioner/cell-domain.js';

const teamId='team_customer_123456',projectId='prj_1234567890',token='test-provider-token-123456';
function remote({hasDomain=true,postStatus=200}={}){
 let posts=0;
 const fetcher=async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer '+token);
  if(options.method==='POST'){
   posts++;
   return {status:postStatus,json:async()=>({name:'celula-esperanca.vercel.app',projectId})};
  }
  if(url.includes('/domains?'))return {status:200,json:async()=>({domains:hasDomain?[{
   name:'celula-esperanca.vercel.app',projectId}]:[]})};
  if(url.includes('/v9/projects/'))return {status:200,json:async()=>({id:projectId,accountId:teamId})};
  throw Error('Unknown remote endpoint');
 };
 return {fetcher,posts:()=>posts};
}
const args={teamId,projectId,token,cellName:'Célula Esperança'};
test('cell name creates safe deterministic Vercel hostname',()=>{
 assert.equal(projectSlugForCell(args.cellName),'celula-esperanca');
 assert.equal(proposedCellDomain(args.cellName),'celula-esperanca.vercel.app');
 assert.throws(()=>projectSlugForCell('🏠🏠🏠'),{code:'BAD_CELL_NAME'});
});
test('existing customer domain is verified without another POST',async()=>{
 const {fetcher,posts}=remote();
 const result=await ensureCellDomain({...args,fetcher});
 assert.equal(result.status,'linked');
 assert.equal(result.url,'https://celula-esperanca.vercel.app');
 assert.equal(posts(),0);
});
test('absent domain can be added with one authorized write',async()=>{
 const {fetcher,posts}=remote({hasDomain:false});
 const result=await ensureCellDomain({...args,fetcher});
 assert.equal(result.status,'added');assert.equal(posts(),1);
});
test('occupied domain stops safely and never retries mutation',async()=>{
 const {fetcher,posts}=remote({hasDomain:false,postStatus:409});
 await assert.rejects(ensureCellDomain({...args,fetcher}),{code:'DOMAIN_UNAVAILABLE'});
 assert.equal(posts(),1);
});
test('domain verification refuses project owned by another team',async()=>{
 const {fetcher}=remote();
 const wrong=async(url,options)=>url.includes('/domains?')?fetcher(url,options):
  {status:200,json:async()=>({id:projectId,accountId:'team_wrong_123456'})};
 await assert.rejects(verifiedCellDomain({...args,fetcher:wrong}),{code:'WRONG_PROJECT'});
});
