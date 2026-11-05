import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import {auditShopping} from '../scripts/shopping-audit.mjs';
const menu=JSON.parse(await fs.readFile(new URL('../data/menu.json',import.meta.url),'utf8'));
const rules=JSON.parse(await fs.readFile(new URL('../config/planavimo-taisykles.json',import.meta.url),'utf8'));
test('Pirkinių auditas žymi nepatvirtintus tiekėjus ir dalinę kainą',()=>{
  const a=auditShopping(menu,rules);
  assert.equal(a.targetEur,100);
  assert.equal(a.softLimitEur,110);
  assert.equal(a.complete,false);
  const unresolved=menu.meta.unresolvedIngredientIds.slice().sort();
  assert.deepEqual([...a.missing].sort(),unresolved);
  assert.ok(a.estimatedTotalEur>0);
  assert.ok(a.warnings.some(w=>w.includes('NEPILNAS_KREPSELIS')));
  assert.ok(a.stores.length<=2);
});
test('Neįtraukia netinkamos jautienos iš Barbora',()=>{
  const m=structuredClone(menu);
  m.products.push({...JSON.parse(fsSync.readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8')).products.find(p=>p.id==='beef')});
  const a=auditShopping(m,rules);
  assert.ok(a.warnings.some(w=>w.includes('BARBORA_NETINKA: beef')));
});
test('Biudžeto įspėjimai nedingsta jei trūksta kainos',()=>{
  const m=structuredClone(menu);
  m.products.find(p=>p.id==='oil').priceEur=null;
  assert.ok(auditShopping(m,rules).warnings.some(w=>w.includes('NEPATIKRINTOS_KAINOS: oil')));
});
