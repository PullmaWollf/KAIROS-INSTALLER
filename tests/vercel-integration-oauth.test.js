import test from 'node:test';
import assert from 'node:assert/strict';
import {integrationAuthorizationUrl} from '../control/vercel-oauth.js';

test('Vercel integration starts from official installation URL',()=>{
 const env={KAIROS_VERCEL_INTEGRATION_SLUG:'kairos-demo',KAIROS_VERCEL_CLIENT_ID:'demo-client-id',KAIROS_VERCEL_CLIENT_SECRET:'example-placeholder-only'};
 const url=new URL(integrationAuthorizationUrl({state:'a'.repeat(43),env}));
 assert.equal(url.hostname,'vercel.com');
 assert.equal(url.pathname,'/integrations/kairos-demo/new');
 assert.equal(url.searchParams.get('state'),'a'.repeat(43));
});

test('Reject untrusted OAuth state',()=>{
 assert.throws(()=>integrationAuthorizationUrl({state:'wrong',env:{}}));
});
