import {createPublicKey,verify as verifySignature} from 'node:crypto';
import {ControlError} from './crypto.js';

// Immutable GitHub repository ID prevents a different repo acquiring trust after
// a rename or transfer. The audience identifies this one production endpoint.
export const AUTOMATION_IDENTITY=Object.freeze({
 issuer:'https://token.actions.githubusercontent.com',
 jwksUrl:'https://token.actions.githubusercontent.com/.well-known/jwks',
 audience:'https://kairos-installer-homolog.vercel.app/api/automation/tick',
 repository:'PullmaWollf/KAIROS-INSTALLER',
 repositoryId:'1444670066',
 workflowRef:'PullmaWollf/KAIROS-INSTALLER/.github/workflows/automation.yml@refs/heads/main',
 ref:'refs/heads/main',
 subject:'repo:PullmaWollf/KAIROS-INSTALLER:ref:refs/heads/main'
});
const forbidden=()=>new ControlError('WORKER_UNAUTHORIZED');
function decoded(segment){
 if(typeof segment!=='string'||segment.length<3||segment.length>8192||
    !/^[A-Za-z0-9_-]+$/.test(segment))throw forbidden();
 try{
  const value=JSON.parse(Buffer.from(segment,'base64url').toString('utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value))throw forbidden();
  return value;
 }catch{throw forbidden();}
}
/** Validate the GitHub-signed job identity; NEVER accept unsigned claims.
 * No token or unsigned JWT-provided key URLs are exposed to a network lookup.
 */
export async function verifyAutomationIdentity(authorization,{fetcher=fetch,now=Date.now()}={}){
 if(typeof authorization!=='string'||!authorization.startsWith('Bearer ')||
    authorization.length>16000)throw forbidden();
 const raw=authorization.slice(7);
 const pieces=raw.split('.');
 if(pieces.length!==3||pieces.some(x=>!x))throw forbidden();
 const [headerRaw,claimsRaw,signatureRaw]=pieces;
 const header=decoded(headerRaw),claims=decoded(claimsRaw);
 if(header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid||
    header.kid.length>256||header.jku!==undefined||header.jwk!==undefined||
    header.x5u!==undefined||header.crit!==undefined)throw forbidden();
 if(claims.iss!==AUTOMATION_IDENTITY.issuer||
    claims.aud!==AUTOMATION_IDENTITY.audience||
    claims.repository!==AUTOMATION_IDENTITY.repository||
    String(claims.repository_id)!==AUTOMATION_IDENTITY.repositoryId||
    claims.workflow_ref!==AUTOMATION_IDENTITY.workflowRef||
    claims.ref!==AUTOMATION_IDENTITY.ref||
    claims.sub!==AUTOMATION_IDENTITY.subject||
    !['schedule','workflow_dispatch'].includes(claims.event_name))
   throw forbidden();
 const seconds=Math.floor(now/1000);
 if(!Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||
    claims.iat>seconds+30||claims.iat<seconds-600||
    claims.exp<=seconds||claims.exp>seconds+600||
    claims.exp-claims.iat>600||
    claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>seconds+30))
   throw forbidden();
 let body;
 try{
  const response=await fetcher(AUTOMATION_IDENTITY.jwksUrl,{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),
   headers:{Accept:'application/json'}
  });
  if(response?.status!==200)throw forbidden();
  body=await response.json();
 }catch{throw forbidden();}
 if(!Array.isArray(body?.keys)||body.keys.length>32)throw forbidden();
 const jwk=body.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&
  (k.use===undefined||k.use==='sig')&&
  (k.alg===undefined||k.alg==='RS256'));
 if(!jwk||typeof jwk.n!=='string'||typeof jwk.e!=='string'||
    !/^[A-Za-z0-9_-]+$/.test(jwk.n)||jwk.n.length<300||
    jwk.e!=='AQAB'||!/^[A-Za-z0-9_-]+$/.test(signatureRaw))
   throw forbidden();
 try{
  const key=createPublicKey({key:jwk,format:'jwk'});
  if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails?.modulusLength<2048||
     !verifySignature('RSA-SHA256',Buffer.from(headerRaw+'.'+claimsRaw),
      key,Buffer.from(signatureRaw,'base64url')))
   throw forbidden();
 }catch{throw forbidden();}
 return Object.freeze({valid:true,caller:'github-actions',repositoryId:AUTOMATION_IDENTITY.repositoryId});
}
