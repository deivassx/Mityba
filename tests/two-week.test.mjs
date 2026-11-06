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
const d=await load('2026-11-30');

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
  assert.ok(grams.turkey>0 && grams.chicken>0 && grams.catfish>0 && grams.cod>0 && grams.pork_tenderloin>0);
  assert.ok(!grams.salmon && !grams.lamb,'Pirmos 2 savaitės pakeistos ir nebeturi lašišos arba ėrienos');
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
 assert.ok(turkey.sourcing.farmers.some(p=>p.url.includes('pilnaspuodas.lt/preke/kalakuto-krutineles-file')));
 assert.match(beef.sourcing.farmlio.url,/smulkinta-jautiena/);
 assert.equal(plan.suppliers.length,2);
 assert.match(copyText(plan),/Farmlio/);
 assert.match(copyText(plan),/Baltuonių krūtinėlės filė/);
 assert.equal(plan.orderReady,false);
});


test('Jei ūkininkų SKU ar kaina nepatvirtinti, prie lašišos rodoma tikra Barbora filė nuoroda (ne krepšelio kaina)',async()=>{
 const sources=JSON.parse(await fs.readFile(new URL('../data/sourcing-links.json',import.meta.url),'utf8'));
 const plan=build(c,d,sources), salmon=plan.groups[0].lines.find(x=>x.id==='salmon');
 assert.ok(salmon,'Salmon planned for the first two weeks');
 assert.equal(salmon.cost,null);
 assert.equal(salmon.needsReview,true);
 assert.equal(salmon.url,null);
 assert.equal(salmon.sourcing.barbora.kind,'exact_sku');
 assert.match(salmon.sourcing.barbora.url,/^https:\/\/barbora\.lt\/produktai\/sviezia-atlantiniu-lasisu-file/);
 assert.equal(salmon.sourcing.barbora.priceObservedEurPerKg,13.99);
 assert.equal(plan.suppliers.length,2,'Barbora fallback does not become a third checkout store');
 assert.equal(plan.partialGoodsEstimateEur,build(c,d).partialGoodsEstimateEur,'Observation price must not enter totals');
 assert.match(copyText(plan),/BARBORA ATSARGINIS VARIANTAS: Šviežia atlantinių lašišų filė/);
 assert.match(copyText(plan),/2026-11-05/);
 assert.equal(plan.orderReady,false);
});

test('Nepatikrinta pakaitinė žuvis ir kategorijos nėra laikomos patvirtintais SKU',async()=>{
 const sources=JSON.parse(await fs.readFile(new URL('../data/sourcing-links.json',import.meta.url),'utf8'));
 const plan=build(b,c,sources),cod=plan.items.find(x=>x.id==='cod');
 assert.equal(cod.sourcing.barbora.kind,'similar_sku');
 assert.equal(cod.unavailable,true);
 assert.equal(cod.cost,null);
 assert.match(cod.sourcing.barbora.confidence,/ne ta pati rūšis/);
 assert.ok(plan.items.find(x=>x.id==='lamb').sourcing.barbora.kind==='category');
});

test('Mėsos ir žuvies ūkių nuorodos rodo konkrečius produktus, ne pradžios puslapius',async()=>{
 const sources=JSON.parse(await fs.readFile(new URL('../data/sourcing-links.json',import.meta.url),'utf8'));
 for(const [id,source] of Object.entries(sources.products)){
   const matched=win.TwoWeekShop.farmerProductLinks(source);
   assert.equal(matched.length,source.farmers.length,id+' - ne produkto puslapis');
   for(const entry of matched){
     assert.ok(['/produktas/','/product/','/preke/'].some(prefix=>new URL(entry.url).pathname.startsWith(prefix)),id);
     assert.ok(!['farmer_home','seller_directory','farmlio_seller'].includes(entry.kind),id);
   }
 }
 assert.ok(sources.products.lamb.farmers.some(x=>x.url.includes('eriuko-kumpis-be-kaulo')));
 assert.ok(sources.products.turkey.farmers.some(x=>x.url.includes('kalakuto-krutineles-file')));
 assert.equal(sources.products.beef.farmers.length,0);
 const plan=build(a,b,sources),list=copyText(plan);
 assert.match(list,/Ūkio prekė per pardavėją/);
 assert.ok(!list.includes('https://kazlauskuekoukis.lt/'));
 assert.ok(!list.includes('https://baltuoniu.kalakutai.lt/'));
 assert.match(list,/Tiesioginės ūkininko prekės nuorodos nerasta/);
});
test('Bendri ūkio puslapiai atsitiktinai grįžę į duomenis vis tiek nebus rodomi',()=>{
 const fake={farmers:[
  {name:'Ūkio pradžia',url:'https://sesuoleliuukis.lt/',kind:'farmer_home'},
  {name:'Netikra SKU žyma',url:'https://sesuoleliuukis.lt/',kind:'farmer_product'},
  {name:'Kategorija',url:'https://pilnaspuodas.lt/kategorija/mesa/kalakutiena/',kind:'producer_product_reseller'},
  {name:'Tikra prekė',url:'https://pilnaspuodas.lt/preke/kiaulienos-ispjova-be-kaulo/',kind:'retailer_product'}
 ]};
 const found=win.TwoWeekShop.farmerProductLinks(fake);
 assert.equal(found.length,1);
 assert.equal(found[0].name,'Tikra prekė');
});
