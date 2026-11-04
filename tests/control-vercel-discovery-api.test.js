import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createHostedHandler} from '../api/index.js';
import {csrfFor} from '../control/http.js';

const token='safe-token-1234567890123456789';
const env={KAIROS_INSTALLER_PUBLIC_ORIGIN:'https://installer.example.com',
 KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url')};
const session='z'.repeat(43);
const resp=()=>({statusCode:200,setHeader(){},end(body){this.body=body;}});
function req({origin=env.KAIROS_INSTALLER_PUBLIC_ORIGIN,cookie=session,csrf=csrfFor(session,{env})}={}){
 return {url:'/api/connections/vercel/teams',method:'POST',body:{accessToken:token},
  headers:{host:'installer.example.com',origin,
   ...(cookie?{cookie:'kairos_control_session='+cookie}:{}),
   ...(csrf?{'x-kairos-csrf':csrf}:{})}};
}
test('signed-in team discovery is read-only, origin protected and redacted',async()=>{
 let writes=0;
 const store={async session(){return {id:55,login:'customer'};},
  async saveConnection(){writes++;}};
 const fetcher=async(url,init)=>{
  assert.equal(init.method,'GET');
  return {status:200,json:async()=>({teams:[{id:'team_customer_123456',slug:'client'}]})};
 };
 const handler=createHostedHandler({env,fetcher,storeFactory:()=>store});
 const result=resp();await handler(req(),result);
 assert.equal(result.statusCode,200);
 assert.equal(JSON.parse(result.body).teams[0].teamId,'team_customer_123456');
 assert.equal(result.body.includes(token),false);
 assert.equal(writes,0);
 const blocked=resp();await handler(req({origin:'https://other.example'}),blocked);
 assert.equal(blocked.statusCode,400);
 assert.equal(JSON.parse(blocked.body).error,'BAD_ORIGIN');
 const anon=resp();await createHostedHandler({env,storeFactory:()=>({
  async session(){return null;}})})(req({cookie:''}),anon);
 assert.equal(anon.statusCode,401);
});
