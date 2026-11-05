import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { archiveMenu } from './history.mjs';
import { selectWeeklyRecipes } from './rotation.mjs';

export const vegetables = ['broccoli','carrot','beet','zucchini','pepper','mushroom'];
const assert = (condition, message) => { if (!condition) throw Error(message); };
const positive = n => Number.isFinite(n) && n > 0;
export function readRules() {
  // Tikrinant ir generuojant perskaitoma naujausia failo versija, o ne užkoduoti skaičiai.
  const rules = JSON.parse(readFileSync(new URL('../config/planavimo-taisykles.json', import.meta.url),'utf8'));
  assert(rules.schemaVersion === 1 && rules.mealPlan && rules.nutrition && rules.shopping,'Nėra galiojančių mitybos taisyklių');
  const n=rules.nutrition, m=rules.mealPlan, s=rules.shopping;
  for (const v of [m.days,m.mealsPerDay,m.cookSessions,m.minRecipes,m.maxRecipes,n.maxKcalPerDay,n.minKcalPerMeal,n.minProteinGramsPerDay,n.minNonStarchyVegetableGramsPerDay,s.maxStoresPerWeek,s.verifiedPriceMaxAgeHours])
    assert(positive(v),'Blogas taisyklių skaitinis parametras');
  assert(Array.isArray(s.allowedProductDomains) && s.allowedProductDomains.length>0,'Nėra leistinų produktų šaltinių');
  return rules;
}
export function validate(menu, verified = true, rules = readRules()) {
  const ids = list => { const m = new Map(list.map(x => [x.id,x])); assert(m.size === list.length,'Pasikartojantys ID'); return m; };
  const recipes = ids(menu.recipes), products = ids(menu.products), stores = ids(menu.stores);
  const {nutrition:n,mealPlan:m,shopping:s}=rules;
  assert(menu.days.length===m.days && menu.sessions.length===m.cookSessions && m.mealsPerDay===2,'Neteisingas savaites dienų / valgių / gaminimų skaičius');
  assert(stores.size>=1 && stores.size<=s.maxStoresPerWeek,'Per daug tiekėjų');
  assert(menu.meta.kcalLimit===n.maxKcalPerDay,'Kalorijų riba nesutampa su taisyklėmis');
  for (const p of products.values()) {
    const hostname=new URL(p.url).hostname;
    assert(s.allowedProductDomains.some(d=>hostname===d || hostname.endsWith('.'+d)),'Neleistina produkto parduotuvė: '+p.url);
  }
  const start = new Date(menu.meta.weekStart+'T00:00:00Z');
  assert(start.getUTCDay() === 1,'Savaitė turi prasidėti pirmadienį');
  const used = new Set(), counts = {};
  for (const [i,day] of menu.days.entries()) {
    assert(day.date === new Date(+start+i*86400000).toISOString().slice(0,10),'Nenuoseklios dienų datos');
    let kcal=0, protein=0, veg=0;
    const carbsByMeal=[];
    for (const id of [day.lunch,day.dinner]) {
      const r=recipes.get(id); assert(r,'Nežinomas receptas: '+id); used.add(id); counts[id]=(counts[id]||0)+1;
      assert(r.steps.length >= 3 && r.photo?.startsWith('https://'),'Trūksta instrukcijų / nuotraukos');
      let mealKcal=0,mealCarbs=0;
      for(const [key,g] of Object.entries(r.ingredients)) {
        const n=menu.nutrients[key], p=products.get(key);
        assert(positive(g) && n && p && stores.has(p.store),'Trūksta ingrediento: '+key);
        assert(['kcal','protein','carbs','fat'].every(k=>Number.isFinite(n[k]) && n[k]>=0),'Blogas maistingumas: '+key);
        assert(positive(p.packGrams),'Bloga pakuotė: '+key);
        mealKcal+=g*n.kcal/100; mealCarbs+=g*n.carbs/100; protein+=g*n.protein/100;
        if(vegetables.includes(key)) veg+=g;
        if(verified) {
          assert(positive(p.priceEur) && p.verification?.url === p.url,'Nepatikrinta kaina: '+key);
          const age=Date.now()-Date.parse(p.verification.checkedAt);
          assert(age>=-60000 && age<=s.verifiedPriceMaxAgeHours*3600000,'Pasenusi kainos patikra: '+key);
        }
      }
      assert(mealKcal>=n.minKcalPerMeal,'Valgis per mažas: '+id); kcal+=mealKcal;
      carbsByMeal.push(mealCarbs);
    }
    assert(kcal<=n.maxKcalPerDay && protein>=n.minProteinGramsPerDay && veg>=n.minNonStarchyVegetableGramsPerDay,`Netinka ${day.date}: ${kcal} kcal, ${protein} g baltymų, ${veg} g daržovių`);
    if(n.preferMoreCarbsAtLunch) assert(carbsByMeal[0]>=carbsByMeal[1], 'Pietums numatyta per mažai angliavandenių: '+day.date);
  }
  assert(used.size>=m.minRecipes && used.size<=m.maxRecipes,'Neteisingas patiekalų skaičius');
  const allocated={};
  for(const s of menu.sessions) for(const [id,count] of Object.entries(s.servings||{})) {
    assert(Number.isInteger(count) && count>0,'Blogas porcijų skaičius'); allocated[id]=(allocated[id]||0)+count;
  }
  assert(JSON.stringify(Object.entries(counts).sort())===JSON.stringify(Object.entries(allocated).sort()),'Gaminimo porcijos nesutampa');
  return menu;
}

export async function get(url, type='text') {
  let error;
  for(let attempt=0;attempt<3;attempt++) {
    try { return await getOnce(url,type); }
    catch(e) { error=e; if(attempt<2) await new Promise(resolve=>setTimeout(resolve,2000)); }
  }
  throw Error(`${error.message}: ${url}`);
}
async function getOnce(url, type) {
  assert(url.startsWith('https://'),'Reikalinga HTTPS nuoroda');
  const r=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'MitybaPlanner/1.0 (+https://github.com/deivassx/Mityba)'}});
  assert(r.ok,`HTTP ${r.status}: ${url}`);
  assert(new URL(r.url).hostname === new URL(url).hostname,'Nuoroda nukreipta į kitą parduotuvę');
  if(type==='image') { assert(r.headers.get('content-type')?.startsWith('image/'),'Nuotrauka nepasiekiama: '+url); await r.body.cancel(); return; }
  return r.text();
}

export function extractOffer(html, url) {
  if(new URL(url).hostname==='barbora.lt') {
    const decode=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    const entries=[...html.matchAll(/data-b-for-cart='([^']+)'/g)].map(m=>JSON.parse(decode(m[1]))).filter(p=>p.list==='Prekės kortelė');
    assert(entries.length===1,'Nerasta vienintelė pagrindinė prekė: '+url);
    const p=entries[0];
    assert(p.status==='active' && positive(p.price) && positive(p.comparative_unit_price),`Prekė neprieinama / nėra kainos (${p.status}, ${p.price} EUR): ${url}`);
    assert(html.includes('data-cnstrc-product-detail') && html.includes('data-cnstrc-item-id="'+p.id+'"'),'Nesutampa prekės identifikatorius');
    return {price:p.price,name:p.title,packAmount:p.price/p.comparative_unit_price,unit:p.comparative_unit,method:'Barbora primary product cart data (EUR)'};
  }
  const found=[];
  function walk(x) {
    if(!x || typeof x!=='object') return;
    if([x['@type']].flat().includes('Product')) {
      for(const offer of [x.offers].flat().filter(Boolean)) {
        // Reject aggregate, member-only and out-of-stock offers. Never guess a price from arbitrary text.
        if(offer['@type']!=='Offer' || offer.priceCurrency!=='EUR') continue;
        if(!['https://schema.org/InStock','http://schema.org/InStock'].includes(offer.availability)) continue;
        if(offer.url && new URL(offer.url,url).pathname.replace(/\/$/,'')!==new URL(url).pathname.replace(/\/$/,'')) continue;
        const price=Number(offer.price);
        if(positive(price) && x.name) found.push({price,name:x.name,method:'schema.org/Product/Offer'});
      }
    }
    for(const v of Object.values(x)) if(typeof v==='object') Array.isArray(v)?v.forEach(walk):walk(v);
  }
  for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1])); } catch { /* Other scripts are not product evidence. */ }
  }
  assert(found.length>0 && new Set(found.map(x=>x.price)).size===1,'Nerasta vienareikšmė vieša EUR kaina ir prieinamumas: '+url);
  return found[0];
}

export async function generate(now=new Date()) {
  const menu=JSON.parse(await fs.readFile('data/catalog.json','utf8'));
  const date=new Date(now.toLocaleDateString('en-CA',{timeZone:'Europe/Vilnius'})+'T00:00:00Z');
  date.setUTCDate(date.getUTCDate()+((8-date.getUTCDay())%7 || 7));
  const week=date.toISOString().slice(0,10);
  const bank=JSON.parse(await fs.readFile('data/recipe-library.json','utf8'));
  const {recipes,pairs}=selectWeeklyRecipes(menu.recipes,bank,week);
  menu.recipes=recipes;
  // Tikrinamos tik šiai savaitei reikalingos prekės: nebūtinos prekės negali sustabdyti plano.
  const usedProducts=new Set(recipes.flatMap(r=>Object.keys(r.ingredients)));
  menu.products=menu.products.filter(p=>usedProducts.has(p.id));
  menu.days=Array.from({length:7},(_,i)=>({date:new Date(+date+i*86400000).toISOString().slice(0,10),lunch:pairs[i<3?0:1][0],dinner:pairs[i<3?0:1][1]}));
  menu.meta={...menu.meta,weekStart:week,generatedAt:now.toISOString(),status:'Automatiškai patikrinta savaitė',pricingNotice:'Prekių kainos patikrintos '+now.toISOString()+'. Galutinės kainos ir pristatymo sąlygos gali pasikeisti.'};
  menu.sessions=pairs.map((pair,i)=>({title:i?'Trečiadienis':'Sekmadienis',subtitle:i?'IV–VII dienoms':'I–III dienoms',summary:pair.map(id=>menu.recipes.find(r=>r.id===id).title).join(' + '),servings:Object.fromEntries(pair.map(id=>[id,i?4:3])),steps:['Kiekvieno recepto ingredientus padaugink iš nurodyto porcijų skaičiaus.','Gamink pagal žemiau pateiktas receptų instrukcijas, naudok atskiras skardas.','Per 2 val. atvėsink ir padėk į šaldytuvą. Ketvirtai ir vėlesnėms dienoms skirtas porcijas iškart užšaldyk; atitirpink šaldytuve.'],duration:'Apie 70–90 min.'}));
  validate(menu,false);
  // Tikrinti esamus ir kitų ūkių patvirtintus SKU, apskaičiuoti visas pakuotes ir
  // rinktis viso krepšelio kainą griežtai iš daugiausia DVIEJŲ atsiskaitymo vietų.
  const {compareFarmOffers,writeComparisonReport}=await import('./compare-farms.mjs');
  const {choice,report}=await compareFarmOffers(menu);
  await writeComparisonReport(report);
  if(!choice.ok) throw Error('Nėra patikrinto 1–2 parduotuvių krepšelio: '+choice.reason);
  menu.products=choice.chosen.map(({packs,lineEur,...product})=>product);
  menu.stores=choice.stores;
  menu.meta={...menu.meta,shoppingTotalEstimateEur:choice.totalEur,shoppingWithinTolerance:choice.withinTolerance,shoppingCheckedAt:report.generatedAt};
  const failures=[];
  await Promise.all(menu.recipes.map(async r => {try { await get(r.photo,'image'); } catch(e) { failures.push(e.message); }}));
  assert(!failures.length,failures.join('\n'));
  validate(menu);
  // Save the previous published week before replacing it, including the first migration.
  try { await archiveMenu(JSON.parse(await fs.readFile('data/menu.json','utf8'))); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  await archiveMenu(menu);
  await fs.writeFile('data/menu.json',JSON.stringify(menu,null,2)+'\n');
  return menu;
}

export async function verifyPublished(base, attempts=20) {
  const expected=await fs.readFile('data/menu.json','utf8');
  let error;
  for(let i=0;i<attempts;i++) {
    try {
      const root=base.replace(/\/$/,'')+'/';
      const actual=await get(root+'data/menu.json?revision='+Date.now());
      assert(JSON.stringify(JSON.parse(actual))===JSON.stringify(JSON.parse(expected)),'Publikuotas meniu nesutampa');
      const index=JSON.parse(await fs.readFile('data/history/index.json','utf8'));
      assert(JSON.stringify(JSON.parse(await get(root+'data/history/index.json?revision='+Date.now())))===JSON.stringify(index),'Publikuota istorija nesutampa');
      for(const entry of index) {
        const file='data/history/'+entry.weekStart+'.json';
        assert(JSON.stringify(JSON.parse(await get(root+file)))===JSON.stringify(JSON.parse(await fs.readFile(file,'utf8'))),'Archyvo meniu nesutampa: '+entry.weekStart);
      }
      const html=await get(root); assert(html.includes('id="days"') && html.includes('./js/app.js') && html.includes('id="history-list"'),'Svetainės HTML netinkamas');
      for(const file of ['js/app.js','css/style.css']) assert((await get(root+file)).length>0,'Tuščias failas');
      return;
    } catch(e) { error=e; if(i<attempts-1) await new Promise(r=>setTimeout(r,15000)); }
  }
  throw error;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv[2]==='generate') await generate();
    else if(process.argv[2]==='archive') {
      const menu=validate(JSON.parse(await fs.readFile('data/menu.json','utf8')),false);
      assert(menu.products.every(p=>positive(p.priceEur) && p.verification?.url===p.url),'Išsaugotame meniu nėra kainų patikros įrodymų');
      await archiveMenu(menu);
    }
    else if(process.argv[2]==='published') await verifyPublished(process.argv[3]);
    else validate(JSON.parse(await fs.readFile('data/menu.json','utf8')));
    console.log('Patikra sėkminga');
  } catch(e) { console.error(e.message); process.exitCode=1; }
}
