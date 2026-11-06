import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validate,validateRecipePreferences} from '../scripts/planner.mjs';
const file=async p=>JSON.parse(await fs.readFile(new URL('../'+p,import.meta.url),'utf8'));
test('Išsaugotos 9 skirtingos savaitės nuo 2026-11-09',async()=>{
 const ix=await file('data/history/index.json');
 assert.equal(ix.length,9);
 const names=(await fs.readdir(new URL('../data/history/',import.meta.url))).filter(f=>/^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
 assert.equal(names.length,9);
 const signatures=new Set();
 for(let i=0;i<9;i++){
  const week=new Date(Date.parse('2026-11-09T00:00:00Z')+i*7*86400000).toISOString().slice(0,10);
  assert.equal(names[i],week+'.json');
  const m=await file('data/history/'+week+'.json');
  validate(m,false);
  validateRecipePreferences(m);
  assert.equal(m.meta.isPlanningSeries,true);
  assert.equal(m.meta.purchaseReady,false);
  assert.equal(m.days.length,7);
  assert.equal(m.recipes.length,4);
  assert.ok(m.stores.length<=2);
  assert.ok(m.meta.unresolvedIngredientIds.some(id=>['lamb','salmon','cod','pork_tenderloin'].includes(id) || ['turkey','chicken','beef','beef_steak','beef_strips','beef_roast'].includes(id)));
  assert.ok(m.meta.unresolvedIngredientIds.length>0);
  assert.ok(m.meta.unresolvedIngredientIds.every(id=>!m.products.some(p=>p.id===id)));
  assert.ok(m.products.every(p=>!m.meta.unresolvedIngredientIds.includes(p.id)));
  assert.ok(ix.some(x=>x.weekStart===week));
  const signature=m.recipes.map(r=>r.id).join(',');
  assert.ok(!signatures.has(signature));signatures.add(signature);
 }
 const main=await file('data/menu.json');
 assert.equal(main.meta.weekStart,'2026-11-09');
 assert.throws(()=>validate(main,true),/Trūksta ingrediento/);
 const invalid=structuredClone(main);invalid.meta.purchaseReady=true;
 assert.throws(()=>validate(invalid,false),/Juodraštis/);
});
