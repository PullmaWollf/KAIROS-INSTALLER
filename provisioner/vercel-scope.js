import {ProvisioningError} from './plan.js';

// A personal account is identified internally but never presented as a "team".
// Never send a synthetic personal ID to Vercel as ?teamId.
const team=/^team_[A-Za-z0-9_-]{4,54}$/;
const personal=/^personal_([A-Za-z0-9_-]{6,54})$/;
export function vercelScope(accountId){
 if(typeof accountId!=='string')throw new ProvisioningError('BAD_TARGET','Hospedagem Vercel inválida');
 if(team.test(accountId))return Object.freeze({kind:'team',accountId,providerAccountId:accountId});
 const match=personal.exec(accountId);
 if(match)return Object.freeze({kind:'personal',accountId,providerAccountId:match[1]});
 throw new ProvisioningError('BAD_TARGET','Hospedagem Vercel não identificada');
}
export function vercelQuery(accountId,params={}){
 const scope=vercelScope(accountId);
 const query=new URLSearchParams();
 if(scope.kind==='team')query.set('teamId',scope.providerAccountId);
 for(const [key,val] of Object.entries(params)){
  if(key==='teamId')throw new ProvisioningError('BAD_TARGET');
  query.set(key,String(val));
 }
 return query.size?'?'+query.toString():'';
}
export function personalAccountId(user){
 const id=user?.id;
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{6,54}$/.test(id))
  throw new ProvisioningError('BAD_RESPONSE','A Vercel não forneceu um identificador pessoal válido');
 return vercelScope('personal_'+id).accountId;
}
