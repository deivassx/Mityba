import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../js/two-week.js',import.meta.url),'utf8');
const win={};
const context=vm.createContext({window:win,URL,Intl,Date,localStorage:{getItem(){return null}}});
vm.runInContext(source,context);
const {build,demand,copyText}=win.TwoWeekShop;
const load=async week=>JSON.parse(await fs.readFile(new URL('../data/history/'+week+'.json',import.meta.url),'utf8'));
const a=await load('2026-11-09'),b=await load('2026-11-16'),c=await load('2026-11-23');

test('14 dienų užsakymas sumuoja tikrą 2 savaičių meniu ir mėsą perka vienu kartu',()=>{
  const plan=build(a,b);
  assert.equal(plan.groups.length,3);
  assert.equal(plan.firstWeek,'2026-11-09');
  assert.equal(plan.secondWeek,'2026-11-16');
  assert.equal(plan.lastDay,'2026-11-22');
  assert.equal(plan.budgetTargetEur,200);
  assert.equal(plan.budgetToleranceEur,220);
  assert.deepEqual([...plan.suppliers].sort(),['barbora','farmlio']);
  assert.equal(plan.maxStores,2);
  const proteins=plan.groups[0].lines;
  assert.ok(proteins.length>=4);
  const grams=Object.fromEntries(proteins.map(x=>[x.id,x.grams]));
  for(const product of proteins) {
    assert.equal(grams[product.id],(demand(a)[product.id]||0)+(demand(b)[product.id]||0));
  }
  assert.ok(grams.turkey>0 && grams.chicken>0 && grams.catfish>0 && grams.salmon>0 && grams.lamb>0 && grams.cod>0 && grams.pork_tenderloin>0);
  assert.ok(grams.beef>0);
  assert.equal(proteins.find(p=>p.id==='catfish').packs,Math.ceil(grams.catfish/300));
  assert.ok(!proteins.find(p=>p.id==='turkey').url);
  assert.ok(!proteins.find(p=>p.id==='beef').url);
  assert.ok(!proteins.find(p=>p.id==='chicken').url);
  assert.ok(!proteins.find(p=>p.id==='lamb').url);
  assert.ok(!proteins.find(p=>p.id==='salmon').url);
  assert.equal(plan.orderReady,false);
  assert.equal(plan.priceIncludesDelivery,false);
  assert.ok(plan.partialGoodsEstimateEur>0);
  assert.ok(plan.missing.length>=3);
  assert.match(copyText(plan),/Kalakutienos krūtinėlės filė/);
  assert.match(copyText(plan),/Dalinė/);
});
test('Šviežius produktus dalina į dvi savaites, ne vieną 14 d. pakuotę',()=>{
 const plan=build(a,b);
 const fresh=plan.groups.slice(1);
 const carrots=fresh.map(group=>group.lines.find(p=>p.id==='carrot'));
 assert.ok(carrots.every(Boolean));
 assert.equal(carrots[0].grams,demand(a).carrot);
 assert.equal(carrots[1].grams,demand(b).carrot);
 assert.equal(carrots[0].packs,Math.ceil(carrots[0].grams/carrots[0].packGrams));
 assert.equal(carrots[1].packs,Math.ceil(carrots[1].grams/carrots[1].packGrams));
 const all=plan.groups.flatMap(g=>g.lines);
 assert.equal(all.filter(x=>x.id==='catfish').length,1);
 assert.ok(all.some(x=>x.id==='walnut' && x.cost===null));
});
test('Negalima apeiti max 2 parduotuvių ribos / nepatvirtintų prekių',()=>{
 const a2=structuredClone(a),b2=structuredClone(b);
 // Deliberately insert a farm source for a previously unresolved protein: third store.
 const farm={id:'turkey',store:'newFarm',url:'https://example.org/turkey',name:'Kalakutiena',packGrams:1000,priceEur:10};
 a2.products.push(farm);b2.products.push({...farm});
 const result=build(a2,b2);
 assert.equal(result.tooManyStores,true);
 assert.equal(result.orderReady,false);
 assert.equal(result.suppliers.length,3);
 assert.throws(()=>build(b,a),/eilės/);
 assert.throws(()=>build(b,c2NotExist()),/eilės|savaitės/);
 function c2NotExist(){return {meta:{weekStart:'2027-01-04'},days:[]};}
});
test('Sąraše nėra sugalvotų kainų ar nuorodų ir atskiriami 2 savaitės poreikiai',()=>{
 const plan=build(b,c);
 for(const product of plan.items){
  if(product.unavailable)assert.equal(product.cost,null);
  if(product.packs!==null)assert.ok(product.packs>0);
  assert.ok(product.group==='baltymai'||product.group==='savaite-1'||product.group==='savaite-2');
 }
 assert.match(copyText(plan),/KAINA NEŽINOMA/);
});

test('Be kainos rodomos Farmlio ir ūkininko nuorodos, ne išgalvotas SKU',async()=>{
 const sources=JSON.parse(await fs.readFile(new URL('../data/sourcing-links.json',import.meta.url),'utf8'));
 const plan=build(a,b,sources),turkey=plan.groups[0].lines.find(p=>p.id==='turkey');
 const beef=plan.groups[0].lines.find(p=>p.id==='beef');
 assert.equal(turkey.cost,null);
 assert.equal(turkey.url,null);
 assert.equal(turkey.packs,null);
 assert.match(turkey.sourcing.farmlio.url,/farmlio.lt\/prekes/);
 assert.ok(turkey.sourcing.farmers.some(p=>p.url.includes('baltuoniu')));
 assert.match(beef.sourcing.farmlio.url,/smulkinta-jautiena/);
 assert.equal(plan.suppliers.length,2);
 assert.match(copyText(plan),/Farmlio/);
 assert.match(copyText(plan),/Baltuonių kalakutai/);
 assert.equal(plan.orderReady,false);
});
