import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const script=await fs.readFile(new URL('../js/weekly-order.js',import.meta.url),'utf8');
const win={};
vm.runInNewContext(script,{window:win,URL,Intl,Date,localStorage:{getItem(){return null}}});
const {build,demand,copyText,farmerProductLinks}=win.WeeklyShop;
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
  const catfishOffer=catfish.choices.find(c=>c.kind==='catalog');
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
  assert.equal(turkey.packs,Math.ceil(turkey.grams/1000));
  assert.equal(turkey.unavailable,true);
  assert.equal(turkey.sourcing.farmers[0].kind,'farmer_product');
  assert.ok(farmerProductLinks(turkey.sourcing).some(p=>p.url.includes('baltuoniu.kalakutai.lt/product/')));
  assert.match(copyText(plan),/baltuoniu\.kalakutai\.lt\/product\/kalakutu-krutineliu-file-1kg/);
  assert.match(copyText(plan),/31,00|15,00/);
  assert.equal(plan.items.find(p=>p.id==='lamb').quote.unitPrice,31);
  assert.equal(plan.items.find(p=>p.id==='lamb').estimatedCost,32.24);
  assert.equal(turkey.quote.unitPrice,15,'Būsimai savaitei akcijos kaina pasibaigusi');
  assert.equal(turkey.estimatedCost,15);
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
  assert.match(copyText(plan),/Barbora \(atsarginis\)/);
  assert.ok(plan.unknownPrice.length>0);
});

test('Prekių nuorodos nepasirenka atsiskaitymo parduotuvės ir išsaugo daugiausia 2 parduotuvių taisyklę',()=>{
  const plan=build(week1,sources,rules);
  assert.deepEqual([...plan.suppliers],[]);
  assert.equal(plan.maxStores,2);
  assert.equal(plan.orderReady,false);
  assert.equal(plan.tooManyStores,false);
  assert.equal(plan.grandTotalEur,null);
  assert.ok(plan.items.some(x=>x.reference?.kind==='farmer'));
  assert.ok(plan.items.some(x=>x.reference?.kind==='catalog'));
  assert.match(copyText(plan),/daugiausia 2 atsiskaitymo parduotuvės/);
});

test('Istorinės katalogo kainos neįskaitomos, o atnaujinta kaina matoma informaciškai',()=>{
  const plan=build(week1,sources,rules);
  const fish=plan.items.find(x=>x.id==='catfish');
  assert.equal(fish.reference.kind,'catalog');
  assert.equal(fish.priceFresh,false);
  assert.equal(fish.cost,null);
  assert.equal(plan.pricedCount,0);
  assert.equal(plan.grandTotalEur,null);
  const verified=structuredClone(week1);
  const catfish=verified.products.find(x=>x.id==='catfish');
  catfish.priceEur=4;
  catfish.verification={url:catfish.url,checkedAt:new Date().toISOString(),method:'test only'};
  const fresh=build(verified,sources,rules);
  assert.equal(fresh.items.find(x=>x.id==='catfish').cost,16);
  assert.equal(fresh.partialGoodsEstimateEur,16);
  assert.equal(fresh.grandTotalEur,null,'Be pilnos krepšelio ir pristatymo patikros nėra galutinės sumos');
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

test('Svetainėje tik viena pirkinių skiltis ir vienas pirkinių skaičiuotuvas',async()=>{
  const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
  const app=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');
  assert.equal((html.match(/id="pirkiniai"/g)||[]).length,1);
  assert.equal((html.match(/id="weekly-output"/g)||[]).length,1);
  assert.match(html,/Savaitės pirkinių sąrašas/);
  assert.doesNotMatch(html,/Preliminarus apsipirkimas|id="shops"|id="budget"|id="savaites-uzsakymas"|js\/two-week\.js/);
  assert.doesNotMatch(app,/getElementById\('shops'\)|getElementById\('budget'\)|function copyList\(/);
});

test('Viename pirkinių rodinyje yra visi ingredientai ir vienas kopijavimo bei žymėjimo valdymas',()=>{
  const output={innerHTML:'',dataset:{},addEventListener(){}};
  const demoWindow={};
  const fakeDocument={getElementById(id){return id==='weekly-output'?output:null;}};
  vm.runInNewContext(script,{window:demoWindow,document:fakeDocument,URL,Intl,Date,
    localStorage:{getItem(){return null}}});
  const plan=demoWindow.WeeklyShop.build(week1,sources,rules);
  demoWindow.WeeklyShop.render(plan);
  assert.equal((output.innerHTML.match(/class="fortnight-check"/g)||[]).length,plan.items.length);
  assert.doesNotMatch(output.innerHTML,/class="weekly-source"|Pasirink tiekėją|<select/);
  assert.equal((output.innerHTML.match(/id="weekly-copy"/g)||[]).length,1);
  assert.equal((output.innerHTML.match(/id="weekly-clear"/g)||[]).length,1);
  assert.match(output.innerHTML,/Ūkio prekė: Kalakutų krūtinėlių file/);
  assert.doesNotMatch(output.innerHTML,/Preliminarus apsipirkimas/);
});

test('Kai savaitės archyvo kaina neįrašyta, bazinis katalogas leidžia rodyti tik orientacinius senus įverčius',async()=>{
  const catalog=JSON.parse(await fs.readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
  const plan=build(week1,sources,rules,catalog);
  const beef=plan.items.find(p=>p.id==='beef');
  assert.equal(beef.quote.unitPrice,8.45);
  assert.equal(beef.estimatedCost,8.45);
  assert.equal(beef.cost,null);
  assert.ok(plan.estimatedCount>=12);
  assert.ok(plan.estimatedGoodsEur>100);
  assert.equal(plan.grandTotalEur,null);
});
