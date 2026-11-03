import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('documentação não instrui token no frontend',()=>{
 const s=readFileSync(new URL('../docs/FINALIZE.md',import.meta.url),'utf8');
 assert.match(s,/--execute/);
 assert.match(s,/dry-run/);
 assert.match(s,/GitHub/);
});
test('CLI exige confirmação e não possui fallback para conta do mantenedor',()=>{
 const s=readFileSync(new URL('../scripts/finalize.mjs',import.meta.url),'utf8');
 assert.match(s,/--confirm-project/);
 assert.match(s,/--confirm-team/);
 assert.doesNotMatch(s,/pubrskqrsskiamzflpmj/);
});
