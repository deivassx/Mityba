import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {auditShopping} from '../scripts/shopping-audit.mjs';
const menu=JSON.parse(await fs.readFile(new URL('../data/menu.json',import.meta.url),'utf8'));
const rules=JSON.parse(await fs.readFile(new URL('../config/planavimo-taisykles.json',import.meta.url),'utf8'));
test('Pirkinių auditas apima pakuotes, pristatymą, pakavimą, biudžetą',()=>{
  const a=auditShopping(menu,rules);
  assert.equal(a.targetEur,100);
  assert.equal(a.softLimitEur,110);
  assert.ok(a.estimatedTotalEur>110);
  assert.ok(a.warnings.some(w=>w.includes('BARBORA_NETINKA: turkey')));
  assert.ok(a.warnings.some(w=>w.includes('BARBORA_NETINKA: beef')));
  assert.ok(a.warnings.some(w=>w.includes('BARBORA_VISTIENA: chicken')));
  assert.ok(a.warnings.some(w=>w.includes('VIRS_TOLERANCIJOS')));
});
test('Biudžeto įspėjimai nedingsta jei trūksta kainos',()=>{
  const m=structuredClone(menu);
  m.products.find(p=>p.id==='oil').priceEur=null;
  assert.ok(auditShopping(m,rules).warnings.some(w=>w.includes('NEPATIKRINTOS_KAINOS: oil')));
});
