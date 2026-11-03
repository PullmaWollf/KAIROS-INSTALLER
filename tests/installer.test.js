import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGES,normalizeSlug,validateName,validateProjectRef,validateRepo,supabaseCommands,vercelLink,progress} from '../wizard.js';
test('identidade e slug seguro',()=>{
 assert.equal(normalizeSlug('Célula Ágape & Esperança'), 'celula-agape-esperanca');
 assert.equal(normalizeSlug('  CAIXA  123 '),'caixa-123');
 assert.equal(validateName('aa'),false);
 assert.equal(validateName('Célula Esperança'),true);
});
test('validação de referências sem tokens',()=>{
 assert.equal(validateProjectRef('abcdefghijklmnop'),true);
 assert.equal(validateProjectRef('https://example.org'),false);
 assert.deepEqual(validateRepo('https://github.com/minha-conta/minha-celula'),{owner:'minha-conta',repo:'minha-celula',url:'https://github.com/minha-conta/minha-celula'});
 assert.equal(validateRepo('https://evil.com/owner/repo'),null);
});
test('comandos usam o projeto informado, não o do mantenedor',()=>{
 assert.deepEqual(supabaseCommands('abcdefghijklmnop'),['npx supabase login','npx supabase link --project-ref abcdefghijklmnop','npx supabase db push']);
 assert.throws(()=>supabaseCommands('comando;rm -rf .'));
 assert.ok(vercelLink().startsWith('https://vercel.com/new/clone?'));
});
test('progresso contabiliza confirmações sem presumir sucesso',()=>{
 assert.equal(STAGES.length,6);
 assert.equal(progress({identity:true,github:true}),33);
 assert.equal(progress({}),0);
});
