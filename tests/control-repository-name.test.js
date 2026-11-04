import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestRepositoryName} from '../cell-repository-name.js';

test('normal cell title generates a safe, editable GitHub repository name',()=>{
 assert.equal(suggestRepositoryName('Célula Esperança'),'kairos-celula-esperanca');
 assert.equal(suggestRepositoryName('Célula da Fé 2026'),'kairos-celula-da-fe-2026');
 assert.equal(suggestRepositoryName('  São João!! '),'kairos-sao-joao');
 assert.equal(suggestRepositoryName('   '),'');
});
test('homologation titles suggest a disposable prefix instead of production',()=>{
 assert.equal(suggestRepositoryName('HML Célula Teste'),'kairos-hml-celula-teste');
 const long=suggestRepositoryName('HML '+'Célula'.repeat(30));
 assert.ok(long.length<=63);
 assert.match(long,/^kairos-hml-[a-z0-9-]+$/);
});
