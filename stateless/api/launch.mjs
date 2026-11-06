import {launch} from '../src/handoff.mjs';
import {planFrom} from '../src/validation.mjs';
import {assertHmlLaunchGuard} from '../src/launch-guard.mjs';
import {respond,requireSameOrigin,bodyFrom,fail} from '../src/transport.mjs';
export default async function handler(req,res){
 try{
  if(req.method!=='POST')return respond(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  requireSameOrigin(req);
  const request=await bodyFrom(req);
  assertHmlLaunchGuard(planFrom(request));
  const outcome=await launch({request});
  return respond(res,202,outcome);
 }catch(e){return fail(res,e);}
}