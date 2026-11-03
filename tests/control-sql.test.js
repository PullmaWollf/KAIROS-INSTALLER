import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../control/migrations/20261103000000_control_plane.sql',import.meta.url),'utf8');
test('control-plane schema keeps tenant credentials private and services authenticated',()=>{
 for(const name of ['kairos_control_sessions','kairos_control_connections',
  'kairos_control_installations','kairos_control_install_secrets','kairos_control_operations'])
  assert.ok(sql.includes(name));
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on function public\.kairos_control_claim/);
 assert.match(sql,/to service_role/);
});
test('claim and finish are transactional and do not auto-retry existing operations',()=>{
 assert.match(sql,/for update/i);
 assert.match(sql,/review_existing_attempt/);
 assert.match(sql,/unique\(installation_id, phase\)/);
 assert.match(sql,/kairos_control_finish/);
 assert.match(sql,/p_attempt/);
});
