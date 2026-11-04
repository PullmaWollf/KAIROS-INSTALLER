import {planFrom,validateCredentials} from '../src/validation.mjs';
import {audit} from '../src/providers.mjs';
import {respond,requireSameOrigin,bodyFrom,fail} from '../src/transport.mjs';
export default async function handler(req,res){
 try{
  if(req.method!=='POST')return respond(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  requireSameOrigin(req);
  const request=await bodyFrom(req);
  const outcome=await audit({plan:planFrom(request),credentials:validateCredentials(request)});
  return respond(res,200,outcome);
 }catch(e){return fail(res,e);}
}