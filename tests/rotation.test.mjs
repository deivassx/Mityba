import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {selectWeeklyRecipes} from '../scripts/rotation.mjs';
import {validate,validateRecipePreferences} from '../scripts/planner.mjs';

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
  const allowedNew=['turkey','beef','chicken','beef_steak','beef_strips','beef_roast','cheese','feta','tomato','onion','cabbage','sauerkraut','cucumber'];
  m.meta={...m.meta,isPlanningSeries:true,purchaseReady:false,recipePreferencesApplied:true,
    unresolvedIngredientIds:[...new Set(recipes.flatMap(r=>Object.keys(r.ingredients)).filter(id=>allowedNew.includes(id)))]};
  m.products=m.products.filter(p=>!m.meta.unresolvedIngredientIds.includes(p.id));
  m.days=dates.map((date,i)=>({date,lunch:pairs[i<3?0:1][0],dinner:pairs[i<3?0:1][1]}));
  m.sessions=pairs.map((pair,i)=>({servings:Object.fromEntries(pair.map(id=>[id,i===0?3:4]))}));
  return m;
}
test('32 skirtingi patiekalai ir bent 256 unikalios savaitės',()=>{
  const seen=new Set(), allRecipes=new Set();
  for(let n=0;n<256;n++){
    const week=weeklyPlan(n);
    const signature=week.recipes.map(r=>r.id).join('|');
    assert.ok(!seen.has(signature), 'Savaitė pasikartojo: '+n);
    seen.add(signature);
    for(const r of week.recipes) allRecipes.add(r.id);
    validate(week,false);
    validateRecipePreferences(week);
    for(const day of week.days) {
      const calc=id=>{const r=week.recipes.find(x=>x.id===id);return Object.entries(r.ingredients).reduce((sum,[k,g])=>sum + g*week.nutrients[k].carbs/100,0);};
      assert.ok(calc(day.lunch)>=calc(day.dinner), 'Angliavandenių daugiau vakarienei: '+n);
    }
  }
  assert.equal(allRecipes.size,32);
  assert.equal(seen.size,256);
});
test('pakartotinis generavimas tai pačiai savaitei deterministinis, kitą savaitę keičia receptus',()=>{
  const a=selectWeeklyRecipes(catalog.recipes,bank,'2026-11-16');
  const b=selectWeeklyRecipes(catalog.recipes,bank,'2026-11-16');
  const next=selectWeeklyRecipes(catalog.recipes,bank,'2026-11-23');
  assert.deepEqual(a,b);
  assert.notDeepEqual(a.recipes.map(x=>x.id),next.recipes.map(x=>x.id));
  assert.deepEqual(weeklyPlan(0).recipes.map(x=>x.id).sort(),catalog.recipes.map(x=>x.id).sort());
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

test('Per aštuonias savaites nei vienas patiekalas nepasikartoja savo grupėje',()=>{
 const seen=new Set();
 for(let n=0;n<8;n++)for(const r of weeklyPlan(n).recipes){assert.ok(!seen.has(r.id),r.id);seen.add(r.id);}
 assert.equal(seen.size,32);
 const beef=[...new Set(Array.from({length:8},(_,i)=>weeklyPlan(i).recipes.find(r=>r.slot==='VAKARIENĖ'&&Object.keys(r.ingredients).some(k=>k.startsWith('beef')))).map(r=>Object.keys(r.ingredients).find(k=>k.startsWith('beef'))))];
 assert.ok(beef.length>=4);
 assert.ok([...seen].some(id=>id.includes('surin')));
});
