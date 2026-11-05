import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {selectWeeklyRecipes} from '../scripts/rotation.mjs';
import {validate} from '../scripts/planner.mjs';

const catalog=JSON.parse(await fs.readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
const bank=JSON.parse(await fs.readFile(new URL('../data/recipe-library.json',import.meta.url),'utf8'));
const plusWeeks=(n)=>new Date(Date.parse('2026-11-09T00:00:00Z')+n*7*86400000).toISOString().slice(0,10);
function weeklyPlan(n) {
  const weekStart=plusWeeks(n);
  const {recipes,pairs}=selectWeeklyRecipes(catalog.recipes,bank,weekStart);
  const dates=Array.from({length:7},(_,i)=>new Date(Date.parse(weekStart+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
  const m=structuredClone(catalog);
  m.meta.weekStart=weekStart;
  m.recipes=recipes;
  m.days=dates.map((date,i)=>({date,lunch:pairs[i<3?0:1][0],dinner:pairs[i<3?0:1][1]}));
  m.sessions=pairs.map((pair,i)=>({servings:Object.fromEntries(pair.map(id=>[id,i===0?3:4]))}));
  return m;
}
test('16 skirtingų realių receptų ir 256 skirtingos savaitinės kombinacijos',()=>{
  const seen=new Set(), allRecipes=new Set();
  for(let n=0;n<256;n++){
    const week=weeklyPlan(n);
    const signature=week.recipes.map(r=>r.id).join('|');
    assert.ok(!seen.has(signature), 'Savaitė pasikartojo: '+n);
    seen.add(signature);
    for(const r of week.recipes) allRecipes.add(r.id);
    validate(week,false);
    for(const day of week.days) {
      const calc=id=>{const r=week.recipes.find(x=>x.id===id);return Object.entries(r.ingredients).reduce((sum,[k,g])=>sum + g*week.nutrients[k].carbs/100,0);};
      assert.ok(calc(day.lunch)>=calc(day.dinner), 'Angliavandenių daugiau vakarienei: '+n);
    }
  }
  assert.equal(allRecipes.size,16);
  assert.equal(seen.size,256);
});
test('pakartotinis generavimas tai pačiai savaitei deterministinis, kitą savaitę keičia receptus',()=>{
  const a=selectWeeklyRecipes(catalog.recipes,bank,'2026-11-16');
  const b=selectWeeklyRecipes(catalog.recipes,bank,'2026-11-16');
  const next=selectWeeklyRecipes(catalog.recipes,bank,'2026-11-23');
  assert.deepEqual(a,b);
  assert.notDeepEqual(a.recipes.map(x=>x.id),next.recipes.map(x=>x.id));
  assert.deepEqual(weeklyPlan(0).recipes.map(x=>x.id),catalog.recipes.map(x=>x.id));
});
test('neteisingos savaitės ir trūkstamų variantų nepriima',()=>{
  assert.throws(()=>selectWeeklyRecipes(catalog.recipes,bank,'2026-11-10'),/pirmadienį/);
  assert.throws(()=>selectWeeklyRecipes(catalog.recipes,{variants:{}},'2026-11-16'),/Trūksta/);
});
