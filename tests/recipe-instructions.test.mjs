import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildInstructions,name} from '../scripts/recipe-instructions.mjs';
import {validateRecipePreferences} from '../scripts/planner.mjs';
const read=async file=>JSON.parse(await fs.readFile(new URL('../'+file,import.meta.url),'utf8'));
const catalog=await read('data/catalog.json'),bank=await read('data/recipe-library.json');
const all=[...catalog.recipes,...Object.values(bank.variants).flat()];
test('48 receptuose yra tik ingredientų sąrašo produktai, su gramais',()=>{
 assert.equal(all.length,48);
 for(const r of all){
  assert.equal(r.instructionsFollowIngredients,true,r.id);
  assert.deepEqual(r.steps,buildInstructions(r),r.id);
  assert.ok(r.steps.length>=5,r.id);
  for(const [id,g] of Object.entries(r.ingredients))assert.ok(r.steps[0].includes(g+' g '+name[id]),r.id+': '+id);
  assert.doesNotMatch([r.title,r.subtitle,...r.steps].join(' '),/česnak|citrin|drusk|pipir|kmyn|krap|bazilik|rozmarin|čiobrel|raudonėl|prieskon|žolel/i,r.id);
 }
});
test('Keičiant ingredientus be instrukcijų atnaujinimo, atmetama',()=>{
 const r=JSON.parse(JSON.stringify(all[0]));
 r.ingredients.carrot+=25;
 assert.throws(()=>validateRecipePreferences({recipes:[r]}),/instrukcijos neatitinka ingredientų/);
 r.steps=buildInstructions(r);
 assert.doesNotThrow(()=>validateRecipePreferences({recipes:[r]}));
});
test('Aštuonios savaitės ir aktyvus meniu naudoja vienodą receptų tekstą',async()=>{
 const canonical=new Map(all.map(r=>[r.id,r])),index=await read('data/history/index.json');
 assert.equal(index.length,8);
 for(const path of ['data/menu.json',...index.map(e=>'data/history/'+e.weekStart+'.json')]){
  const m=await read(path);
  for(const r of m.recipes){
   const v=canonical.get(r.id);
   assert.ok(v,r.id);
   assert.deepEqual(r.steps,v.steps,r.id);
   assert.deepEqual(r.ingredients,v.ingredients,r.id);
   assert.equal(r.title,v.title,r.id);
  }
  validateRecipePreferences(m);
 }
});