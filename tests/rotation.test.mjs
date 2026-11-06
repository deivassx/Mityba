import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {selectWeeklyRecipes,sourceTier} from '../scripts/rotation.mjs';
import {validate,validateRecipePreferences} from '../scripts/planner.mjs';

const catalog=JSON.parse(await fs.readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
const bank=JSON.parse(await fs.readFile(new URL('../data/recipe-library.json',import.meta.url),'utf8'));
const allowedUnverified=JSON.parse(await fs.readFile(new URL('../config/planavimo-taisykles.json',import.meta.url),'utf8')).recipePreferences.unverifiedIngredientIds;
const plusWeeks=(n)=>new Date(Date.parse('2026-11-09T00:00:00Z')+n*7*86400000).toISOString().slice(0,10);
function weeklyPlan(n) {
  const weekStart=plusWeeks(n);
  const {recipes,pairs}=selectWeeklyRecipes(catalog.recipes,bank,weekStart);
  const dates=Array.from({length:7},(_,i)=>new Date(Date.parse(weekStart+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
  const m=structuredClone(catalog);
  m.meta.weekStart=weekStart;
  m.recipes=recipes;
  const allowedNew=allowedUnverified;
  m.meta={...m.meta,isPlanningSeries:true,purchaseReady:false,recipePreferencesApplied:true,
    unresolvedIngredientIds:[...new Set(recipes.flatMap(r=>Object.keys(r.ingredients)).filter(id=>allowedNew.includes(id)))]};
  m.products=m.products.filter(p=>!m.meta.unresolvedIngredientIds.includes(p.id));
  m.days=dates.map((date,i)=>({date,lunch:pairs[i<3?0:1][0],dinner:pairs[i<3?0:1][1]}));
  m.sessions=pairs.map((pair,i)=>({servings:Object.fromEntries(pair.map(id=>[id,i===0?3:4]))}));
  return m;
}
test('48 receptų biblioteka, 8 skirtingos savaitės ir mitybos taisyklės',()=>{
  const seen=new Set(), allUsed=new Set();
  assert.equal(catalog.recipes.length+Object.values(bank.variants).flat().length,48);
  for(let n=0;n<8;n++){
    const m=weeklyPlan(n),signature=m.recipes.map(r=>r.id).join('|');
    assert.ok(!seen.has(signature));seen.add(signature);
    for(const r of m.recipes){assert.ok(!allUsed.has(r.id),'Pasikartojantis patiekalas '+r.id);allUsed.add(r.id);}
    validate(m,false);validateRecipePreferences(m);
  }
  assert.equal(allUsed.size,32);
  const proteins=new Set([...allUsed].map(id=>id.split('_')[0]));
  for(const group of ['eriena','lasisa','menke','kiauliena'])assert.ok(proteins.has(group));
});
test('pakartotinis generavimas tai pačiai savaitei deterministinis, kitą savaitę keičia receptus',()=>{
  const a=selectWeeklyRecipes(catalog.recipes,bank,'2026-11-16');
  const b=selectWeeklyRecipes(catalog.recipes,bank,'2026-11-16');
  const next=selectWeeklyRecipes(catalog.recipes,bank,'2026-11-23');
  assert.deepEqual(a,b);
  assert.notDeepEqual(a.recipes.map(x=>x.id),next.recipes.map(x=>x.id));
  assert.equal(weeklyPlan(0).recipes.length,4);
});
test('neteisingos savaitės ir trūkstamų variantų nepriima',()=>{
  assert.throws(()=>selectWeeklyRecipes(catalog.recipes,bank,'2026-11-10'),/pirmadienį/);
  assert.throws(()=>selectWeeklyRecipes(catalog.recipes,{variants:{}},'2026-11-16'),/Trūksta/);
});

test('atmeta nemėgstamas daržoves, per daug bulvių ir keptuvėje kepamą naują receptą',()=>{
 const recipe=structuredClone(catalog.recipes[0]);
 const menu={recipes:[recipe]};
 assert.doesNotThrow(()=>validateRecipePreferences(menu));
 recipe.ingredients.zucchini=10;
 assert.throws(()=>validateRecipePreferences(menu),/Nemėgstamas ingredientas/);
 delete recipe.ingredients.zucchini;
 recipe.ingredients.potato=201;
 assert.throws(()=>validateRecipePreferences(menu),/Viršyta vienos porcijos/);
 recipe.ingredients.potato=180;
 recipe.method='stovetop';
 assert.throws(()=>validateRecipePreferences(menu),/vienai skardai/);
});


test('Konkrečios ūkių ir Farmlio produktų nuorodos – meniu prioritetas',async()=>{
 const sourcing=JSON.parse(await fs.readFile(new URL('../data/sourcing-links.json',import.meta.url),'utf8'));
 assert.equal(sourceTier('eriena',sourcing),4);
 assert.equal(sourceTier('kalakutiena',sourcing),4);
 assert.equal(sourceTier('vistiena',sourcing),0);
 assert.equal(sourceTier('samas',sourcing),2);
 assert.equal(sourceTier('lasisa',sourcing),0);
 const result=selectWeeklyRecipes(catalog.recipes,bank,'2026-11-09',{sources:sourcing,nutrients:catalog.nutrients});
 assert.ok(result.sourcingPriority.withProductLinks>=1);
 const fake=structuredClone(sourcing);
 fake.products.turkey.farmers=[{kind:'farmer_product',name:'Pagrindinis',producer:'Ūkis',url:'https://ukis.lt/'}];
 assert.equal(sourceTier('kalakutiena',fake),0,'Bendras ūkio puslapis nėra SKU');
 const modified=structuredClone(sourcing);
 modified.products.salmon.farmers=[{kind:'farmer_product',name:'Lašišos filė',producer:'Žuvininkas',url:'https://ukis.lt/produktas/lasisos-file/'}];
 assert.equal(sourceTier('lasisa',modified),4);
 const weekdates=Array.from({length:8},(_,i)=>plusWeeks(i));
 const n=(src)=>weekdates.map(w=>selectWeeklyRecipes(catalog.recipes,bank,w,{sources:src,nutrients:catalog.nutrients})).flatMap(m=>m.sourcingPriority.priorities).filter(p=>p.group==='lasisa').length;
 assert.ok(n(modified)>n(sourcing),'Nauja konkreti ūkininko nuoroda keičia meniu prioritetą');
});

test('Pašalinto pardavėjo SKU nesuteikia prioriteto net rankiniu būdu įrašytas',async()=>{
 const s=JSON.parse(await fs.readFile(new URL('../data/sourcing-links.json',import.meta.url),'utf8'));
 const fake=structuredClone(s);
 fake.products.turkey.farmers=[{kind:'producer_product_reseller',producer:'Ūkis',name:'Kalakutiena',url:'https://pilnaspuodas.lt/preke/kalakuto-krutineles-file/'}];
 assert.equal(sourceTier('kalakutiena',fake),0);
 for(const product of Object.values(s.products))assert.ok((product.farmers||[]).every(f=>!f.url.includes('pilnaspuodas.lt')));
});
