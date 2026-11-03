import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {configuredOrigin,cookieValue,csrfFor,requireMutation,sealOAuth,openOAuth} from '../control/http.js';
const env={KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),
 KAIROS_INSTALLER_PUBLIC_ORIGIN:'https://installer.example.com'};
test('server enforces fixed HTTPS origin and CSRF on cookie mutations',()=>{
 assert.equal(configuredOrigin(env),'https://installer.example.com');
 const token='x'.repeat(43),csrf=csrfFor(token,{env});
 assert.doesNotThrow(()=>requireMutation({headers:{origin:env.KAIROS_INSTALLER_PUBLIC_ORIGIN,'x-kairos-csrf':csrf}},token,{env}));
 assert.throws(()=>requireMutation({headers:{origin:'https://evil.example','x-kairos-csrf':csrf}},token,{env}),e=>e.code==='BAD_ORIGIN');
 assert.throws(()=>requireMutation({headers:{origin:env.KAIROS_INSTALLER_PUBLIC_ORIGIN,'x-kairos-csrf':'wrong'}},token,{env}),e=>e.code==='BAD_CSRF');
});
test('OAuth cookie is encrypted, binds state to the browser and expires',()=>{
 const tx={provider:'github',state:'random-state',verifier:'random-verifier'};
 const encrypted=sealOAuth(tx,123,{env});
 assert.equal(encrypted.includes('random-verifier'),false);
 assert.equal(openOAuth(encrypted,{env}).subject,123);
});

test('authentication cookie parser rejects duplicate names',()=>{
 assert.equal(cookieValue({headers:{cookie:'other=1; kairos_control_session=abc'}},'kairos_control_session'),'abc');
 assert.equal(cookieValue({headers:{cookie:'kairos_control_session_extra=x'}},'kairos_control_session'),null);
 assert.throws(()=>cookieValue({headers:{cookie:'kairos_control_session=abc; kairos_control_session=def'}},'kairos_control_session'),e=>e.code==='BAD_COOKIE');
});
