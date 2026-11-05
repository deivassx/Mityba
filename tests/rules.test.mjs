import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readRules, validate } from '../scripts/planner.mjs';

const rules=readRules();
const sample=JSON.parse(await fs.readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
function fixture(){
  const m=structuredClone(sample);
  m.sessions=[{servings:{kalakutiena:3,samas:3}},{servings:{vistiena:4,jautiena:4}}];
  for(const p of m.products) { p.priceEur=2; p.verification={url:p.url,checkedAt:new Date().toISOString()}; }
  return m;
}
test('Taisykles skaitomos is vieno failo kiekvieno paleidimo metu',()=>{
  assert.equal(rules.nutrition.maxKcalPerDay,2100);
  assert.equal(rules.mealPlan.cookSessions,2);
  assert.ok(rules.shopping.allowedProductDomains.includes('farmlio.lt'));
  assert.doesNotThrow(()=>validate(fixture()));
});
test('Siekis riboti parduotuves keiciamas taisyklemis',()=>{
  const r=structuredClone(rules);r.shopping.maxStoresPerWeek=1;
  assert.throws(()=>validate(fixture(),true,r),/tiekėjų/);
});
test('Nezinoma parduotuve atmetama',()=>{
  const m=fixture();m.products[0].url='https://fake-food.example/file';m.products[0].verification.url=m.products[0].url;
  assert.throws(()=>validate(m),/Neleistina produkto parduotuvė/);
});
test('Kaloriju riba nuskaitoma is taisykliu',()=>{
  const r=structuredClone(rules);r.nutrition.maxKcalPerDay=1900;
  assert.throws(()=>validate(fixture(),true,r),/Kalorijų riba/);
});
