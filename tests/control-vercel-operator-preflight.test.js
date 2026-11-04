import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightVercel} from '../provisioner/providers.js';

const teamId='team_aJr2RmvNXTI1eJSKI5ASIyAG';
const fetcher=async url=>{
 if(url.includes('/v2/user'))return {status:200,ok:true,json:async()=>({user:{username:'PullmaWollf'}})};
 if(url.includes('/v2/teams'))return {status:200,ok:true,json:async()=>({teams:[{id:teamId,slug:'pullmawollfs-projects'}]})};
 throw Error('Unexpected URL');
};
test('private operator preflight allows authorized maintainer identity',async()=>{
 const result=await preflightVercel({fetcher,token:'fake-token',teamId,operatorMode:true});
 assert.equal(result.accessible,true);
 assert.equal(result.teamId,teamId);
 assert.equal(result.createsResources,false);
});
test('default customer preflight still rejects maintainer identity',async()=>{
 await assert.rejects(preflightVercel({fetcher,token:'fake-token',teamId}),{code:'MAINTAINER_ACCOUNT'});
});
