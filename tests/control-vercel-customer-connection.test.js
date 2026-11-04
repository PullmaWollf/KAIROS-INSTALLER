import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {connectVercel,readVercelConnection,publicVercelConnection} from '../control/vercel-connection.js';
import {encryptControl} from '../control/crypto.js';

const env={KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),
 KAIROS_VERCEL_TEAM_ID:'team_installer_123456'};
const teamId='team_customer_123456',accessToken='test-customer-credential-123456';
const provider=async(url,options)=>{
 assert.equal(options.method,'GET');
 assert.equal(options.headers.Authorization,'Bearer '+accessToken);
 if(url.endsWith('/v2/user'))return {status:200,json:async()=>({user:{username:'client'}})};
 if(url.includes('/v2/teams?'))return {status:200,json:async()=>({teams:[{id:teamId,slug:'client-team'}]})};
 if(url.includes('/v9/projects?'))return {status:200,json:async()=>({projects:[]})};
 throw Error('Unexpected provider URL');
};
test('Vercel connection encrypts credential, returns only public metadata and isolates users',async()=>{
 const store=new Map();
 const db={async saveConnection(id,p,value){assert.equal(p,'vercel');store.set(id,value);},
  async connection(id,p){assert.equal(p,'vercel');return store.get(id)||null;}};
 const value=await connectVercel({db,userId:42,payload:{teamId,accessToken},env,fetcher:provider});
 assert.equal(value.connected,true);
 assert.equal(value.teamId,teamId);
 assert.equal(JSON.stringify(value).includes(accessToken),false);
 assert.equal(store.get(42).includes(accessToken),false);
 const loaded=await readVercelConnection({db,userId:42,env});
 assert.equal(loaded.accessToken,accessToken);
 assert.equal(JSON.stringify(publicVercelConnection(loaded)).includes(accessToken),false);
 assert.equal(await readVercelConnection({db,userId:43,env}),null);
 store.set(43,store.get(42));
 await assert.rejects(readVercelConnection({db,userId:43,env}),{code:'CANNOT_DECRYPT'});
});
test('Vercel rejects controller team and inaccessible teams without persisting',async()=>{
 let saves=0;const db={async saveConnection(){saves++;}};
 await assert.rejects(connectVercel({db,userId:42,payload:{
  teamId:env.KAIROS_VERCEL_TEAM_ID,accessToken},env,fetcher:provider}),{code:'VERCEL_TEAM_FORBIDDEN'});
 await assert.rejects(connectVercel({db,userId:42,payload:{teamId,accessToken},env,
  fetcher:async()=>({status:403})}),{code:'VERCEL_VERIFICATION_FAILED'});
 assert.equal(saves,0);
});
test('identity-only OAuth credential cannot authorize Vercel project creation',async()=>{
 const record=encryptControl({accessToken:'legacy-token'},'oauth:vercel:42',{env});
 const db={async connection(){return record;}};
 assert.equal(await readVercelConnection({db,userId:42,env}),null);
});
