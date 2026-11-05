import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validate} from '../scripts/planner.mjs';

test('8 ankstesnių savaičių pavyzdžiai pažymėti ir atitinka mitybos kriterijus',async()=>{
  const index=JSON.parse(await fs.readFile('data/history/index.json','utf8'));
  const examples=index.filter(entry=>entry.isExample);
  assert.equal(examples.length,8);
  const current=JSON.parse(await fs.readFile('data/menu.json','utf8'));
  for(const entry of examples) {
    assert.ok(entry.weekStart<current.meta.weekStart);
    const menu=JSON.parse(await fs.readFile('data/history/'+entry.weekStart+'.json','utf8'));
    assert.equal(menu.meta.isExample,true);
    assert.match(menu.meta.pricingNotice,/nėra šios praeities savaitės kainos/);
    validate(menu,false);
  }
});
