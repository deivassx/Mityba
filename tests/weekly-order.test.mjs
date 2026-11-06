import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const script=await fs.readFile(new URL('../js/weekly-order.js',import.meta.url),'utf8');
const win={};
vm.runInNewContext(script,{window:win,URL,Intl,Date,localStorage:{getItem(){return null}}});
const {build,demand,copyText,farmerProductLinks,choose}=win.WeeklyShop;
const load=async week=>JSON.parse(await fs.readFile(new URL('../data/history/'+week+'.json',import.meta.url),'utf8'));
const rules=JSON.parse(await fs.readFile(new URL('../config/planavimo-taisykles.json',import.meta.url),'utf8'));
const sources=JSON.parse(await fs.readFile(new URL('../data/sourcing-links.json',import.meta.url),'utf8'));
const week1=await load('2026-11-09');
const last=await load('2027-01-04');

test('7 dienų užsakymas sumuoja tik vieną savaitę (14 valgių), ne dvi',()=>{
  const plan=build(week1,sources,rules);
  assert.equal(rules.shopping.bulkPurchase.planningHorizonDays,7);
  assert.equal(plan.days,7);
  assert.equal(plan.meals,14);
  assert.equal(plan.weekStart,'2026-11-09');
  assert.equal(plan.lastDay,'2026-11-15');
  assert.equal(plan.groups.length,2);
  assert.equal(plan.budgetTargetEur,100);
  assert.equal(plan.budgetToleranceEur,110);
  assert.equal(plan.maxStores,2);
  assert.equal(plan.tooManyStores,false);
  const needed=demand(week1);
  for(const item of plan.items)assert.equal(item.grams,needed[item.id],item.id);
  const catfish=plan.items.find(x=>x.id==='catfish');
  assert.equal(catfish.packs,null,'Pakuočių skaičius neapskaičiuojamas be tiekėjo pasirinkimo');
  const catfishOffer=catfish.choices.find(c=>c.kind==='catalog');
  assert.ok(choose(plan,'catfish',catfishOffer.key));
  assert.equal(catfish.packs,Math.ceil(needed.catfish/catfishOffer.packGrams));
  assert.equal(plan.orderReady,false);
  assert.equal(plan.priceIncludesDelivery,false);
  const copied=copyText(plan);
  assert.match(copied,/PIRKINIŲ PLANAS 7 DIENOMS/);
  assert.doesNotMatch(copied,/14 DIENŲ|II sav\./);
});

test('Nereikia kitos savaitės – galima pirkti paskutinės meniu savaitės produktus',()=>{
  const plan=build(last,sources,rules);
  assert.equal(plan.weekStart,'2027-01-04');
  assert.equal(plan.lastDay,'2027-01-10');
  assert.ok(plan.items.length>0);
  assert.ok(plan.groups[0].lines.some(x=>x.id==='turkey'));
  assert.ok(plan.groups[0].lines.some(x=>x.id==='chicken'));
});

test('Nepatikrintos kainos ir ūkininkų nuorodos nėra laikomos patvirtintais užsakymais',()=>{
  const plan=build(week1,sources,rules);
  const turkey=plan.items.find(p=>p.id==='turkey');
  assert.equal(turkey.cost,null);
  assert.equal(turkey.packs,null);
  assert.equal(turkey.unavailable,true);
  assert.equal(turkey.sourcing.farmers[0].kind,'farmer_product');
  assert.ok(farmerProductLinks(turkey.sourcing).some(p=>p.url.includes('baltuoniu.kalakutai.lt/product/')));
  assert.match(copyText(plan),/baltuoniu\.kalakutai\.lt\/product\/kalakutu-krutineliu-file-1kg/);
  assert.match(copyText(plan),/KAINA NEPATVIRTINTA/);
  assert.equal(plan.orderReady,false);
});

test('Krūtinėlės kandidatas rodomas atskirai nuo smulkintos vištienos',()=>{
  const plan=build(last,sources,rules);
  const chicken=plan.items.find(x=>x.id==='chicken');
  assert.equal(chicken.sourcing.farmers[0].kind,'farmer_product_candidate');
  assert.equal(chicken.unavailable,true);
  const links=farmerProductLinks(chicken.sourcing);
  assert.equal(links.length,1);
  assert.match(links[0].url,/ekologiska-vistienos-krutinele/);
  assert.doesNotMatch(copyText(plan),/smulkinta-vistiena/);
  assert.match(copyText(plan),/Ūkio kandidatas, atitiktis nepatvirtinta/);
});

test('Barbora atsarginė nuoroda neišgalvoja trečio tiekėjo arba kainos',()=>{
  const plan=build(last,sources,rules);
  assert.ok(plan.items.find(x=>x.id==='salmon').sourcing.barbora.url.includes('barbora.lt'));
  assert.equal(plan.items.find(x=>x.id==='salmon').cost,null);
  assert.ok(plan.suppliers.length<=2);
  assert.match(copyText(plan),/BARBORA ATSARGINIS VARIANTAS/);
  assert.ok(plan.unknownPrice.length>0);
});

test('Trečias tiekėjas nepasirenkamas: riba skaičiuojama pagal sąmoningai pasirinktas prekes',()=>{
  const plan=build(week1,sources,rules);
  assert.deepEqual([...plan.suppliers],[],'Pasenę katalogo tiekėjai nepasirenkami iš anksto');
  const fish=plan.items.find(x=>x.id==='catfish').choices.find(x=>x.store==='farmlio');
  const yogurt=plan.items.find(x=>x.id==='yogurt').choices.find(x=>x.store==='barbora');
  const turkey=plan.items.find(x=>x.id==='turkey').choices.find(x=>x.kind==='farmer');
  assert.ok(fish&&yogurt&&turkey);
  assert.equal(choose(plan,'catfish',fish.key),true);
  assert.equal(choose(plan,'yogurt',yogurt.key),true);
  assert.equal(plan.suppliers.length,2);
  assert.equal(choose(plan,'turkey',turkey.key),false,'Trečia atskira parduotuvė atmetama');
  assert.equal(plan.items.find(x=>x.id==='turkey').selectedKey,'');
  assert.equal(plan.suppliers.length,2);
  assert.equal(plan.tooManyStores,false);
  assert.equal(plan.orderReady,false);
});

test('Senos katalogo kainos nėra patikrinta suma; kaina skaičiuojama tik patvirtintai prekei',()=>{
  const plan=build(week1,sources,rules);
  const fish=plan.items.find(x=>x.id==='catfish');
  assert.equal(choose(plan,'catfish',fish.choices[0].key),true);
  assert.equal(fish.priceFresh,false);
  assert.equal(fish.cost,null);
  assert.equal(plan.pricedCount,0);
  assert.equal(plan.grandTotalEur,null);

  const verified=structuredClone(week1);
  const catfish=verified.products.find(x=>x.id==='catfish');
  catfish.priceEur=4;
  catfish.verification={url:catfish.url,checkedAt:new Date().toISOString(),method:'test only'};
  const fresh=build(verified,sources,rules);
  assert.equal(choose(fresh,'catfish',fresh.items.find(x=>x.id==='catfish').choices.find(x=>x.kind==='catalog').key),true);
  assert.equal(fresh.items.find(x=>x.id==='catfish').cost,16);
  assert.equal(fresh.partialGoodsEstimateEur,16);
  assert.equal(fresh.grandTotalEur,null,'Be patikrinto pristatymo negalima rodyti galutinės sumos');
});

test('Neleidžia 14 dienų taisyklių ir sugadinto savaitės kalendoriaus',()=>{
  const other=structuredClone(rules);
  other.shopping.bulkPurchase.planningHorizonDays=14;
  assert.throws(()=>build(week1,sources,other),/7 dienas/);
  const invalid=structuredClone(week1);invalid.days[6].date='2026-11-23';
  assert.throws(()=>build(invalid,sources,rules),/iš eilės/);
});

test('Ūkininkų produkto nuorodos filtruoja pradžios puslapius ir pašalintą tiekėją',()=>{
  const found=farmerProductLinks({farmers:[
    {name:'Pradžia',url:'https://sesuoleliuukis.lt/',kind:'farmer_product'},
    {name:'Pašalinto pardavėjo SKU',url:'https://pilnaspuodas.lt/preke/kalakutiena/',kind:'farmer_product'},
    {name:'Prekė',url:'https://sesuoleliuukis.lt/produktas/eriuko-kumpis-be-kaulo/',kind:'farmer_product'},
    {name:'Neaiškus kandidatas',url:'https://kazlauskuekoukis.lt/',kind:'farmer_product_candidate',producer:'Kazlauskų ūkis',productMatchVerified:false}
  ]});
  assert.equal(found.length,1);
  assert.equal(found[0].name,'Prekė');
});
