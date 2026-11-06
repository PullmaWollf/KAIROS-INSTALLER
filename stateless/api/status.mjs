import {call} from '../src/providers.mjs';
import {InstallationError} from '../src/validation.mjs';
import {respond,requireSameOrigin,bodyFrom,fail} from '../src/transport.mjs';
export default async function handler(req,res){
 try{
  if(req.method!=='POST')return respond(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  requireSameOrigin(req);
  const {githubToken,owner,repo}=await bodyFrom(req);
  if(typeof githubToken!=='string'||githubToken.length<20||
   !/^[a-z0-9-]{1,39}$/i.test(owner||'')||!/^kairos-hml-[a-z0-9-]{3,45}$/.test(repo||''))
   throw new InstallationError('BAD_REQUEST');
  const runs=await call(fetch,'github',githubToken,'/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo)+'/actions/workflows/kairos-install.yml/runs?per_page=1');
  const one=runs.workflow_runs?.[0];
  return respond(res,200,{ok:true,status:one?.status||'not_started',conclusion:one?.conclusion||null,
   url:one?.html_url||'https://github.com/'+owner+'/'+repo+'/actions'});
 }catch(e){return fail(res,e);}
}