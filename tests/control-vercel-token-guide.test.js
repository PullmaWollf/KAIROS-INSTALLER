import test from 'node:test';
import assert from 'node:assert/strict';
import {VERCEL_TOKEN_URL,VERCEL_TOKEN_NAME,VERCEL_TOKEN_STEPS,VERCEL_TOKEN_SAFETY} from '../vercel-token-guide.js';

test('token guide matches the fields shown by Vercel and explains each choice',()=>{
 assert.equal(VERCEL_TOKEN_URL,'https://vercel.com/account/tokens');
 assert.equal(VERCEL_TOKEN_NAME,'KAIROS-INSTALLER');
 assert.deepEqual(VERCEL_TOKEN_STEPS.map(step=>step.field),
  ['TOKEN NAME','SCOPE','EXPIRATION']);
 assert.match(VERCEL_TOKEN_STEPS[1].value,/Personal Account/);
 assert.match(VERCEL_TOKEN_STEPS[2].value,/30 Days/);
 assert.match(VERCEL_TOKEN_SAFETY,/conta Vercel do titular/);
});
test('guide contains no credentials or secret-bearing instructions',()=>{
 assert.equal(JSON.stringify(VERCEL_TOKEN_STEPS).includes('sk_'),false);
 assert.equal(JSON.stringify(VERCEL_TOKEN_STEPS).includes('Bearer '),false);
 assert.ok(VERCEL_TOKEN_STEPS.every(step=>step.value&&step.explanation));
});
