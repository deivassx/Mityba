import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {get,extractOffer,readRules} from './planner.mjs';
import {optimizeBasket,neededIngredients} from './basket-optimizer.mjs';
const good=n=>Number.isFinite(n)&&n>0;
const normalize=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'');
const note=msg=>console.log('::warning::'+msg);
export async function compareFarmOffers(menu,{verify=true}={}) {
  const rules=readRules();
  const pool=JSON.parse(await fs.readFile(new URL('../data/offer-candidates.json',import.meta.url),'utf8'));
  const needed=neededIngredients(menu);
  const stores=[...menu.stores,...pool.stores.filter(s=>!menu.stores.some(m=>m.id===s.id))];
  const offers=[
    ...menu.products.filter(p=>needed[p.id]).map(p=>({...p,nutritionallyEquivalentReviewed:true,candidateOrigin:'catalog'})),
    ...pool.candidates.filter(p=>needed[p.id]).map(p=>({...p,candidateOrigin:'additional'}))
  ];
  const checks=await Promise.all(offers.map(async product=>{
    const p={...product};
    if(!good(p.packGrams)||!p.nutritionallyEquivalentReviewed||!p.url?.startsWith('https://'))return {offer:p,error:'Reikia peržiūrėti konkretų produkto URL, kiekį ir atitiktį receptui'};
    if(!verify){
      if(p.verification?.url===p.url&&good(p.priceEur))return {offer:p};
      return {offer:p,error:'Nepatikrinta šio vykdymo metu'};
    }
    try{
      const html=await get(p.url);
      const offer=extractOffer(html,p.url);
      if(offer.packAmount){
        const expected=p.packLitres||p.packGrams/1000;
        if(offer.unit!==(p.packLitres?'l':'kg')||Math.abs(offer.packAmount-expected)>=0.005)throw Error('Pakuotės kiekis neatitinka katalogo');
      } else if(normalize(offer.name)!==normalize(p.sourceName||p.name))throw Error('Prekės pavadinimas neatitinka patvirtintos pakuotės');
      p.name=offer.name;p.priceEur=offer.price;
      p.verification={url:p.url,checkedAt:new Date().toISOString(),method:offer.method,productName:offer.name};
      return {offer:p};
    }catch(e){return {offer:p,error:String(e.message||e)};}
  }));
  const passed=checks.filter(x=>!x.error).map(x=>x.offer);
  const choice=optimizeBasket(menu,rules,{stores,offers:passed});
  const report={
    generatedAt:new Date().toISOString(),
    weekStart:menu.meta.weekStart,
    checkoutLimit:2,
    budgetEur:rules.shopping.budget.targetWeeklyTotalEur,
    toleranceEur:rules.shopping.budget.softLimitEur,
    notes:'Tai krepšelio patikra pagal katalogo konkrečius SKU. Neapima automatinės visų ūkininkų internetinės paieškos. Pristatymo įverčiai negali atstoti galutinio atsiskaitymo; Farmlio pardavėjų min. užsakymus ir bendras datas reikia patikrinti.',
    chosen:choice.ok?{totalEur:choice.totalEur,goodsEur:choice.goodsEur,deliveryAndPackingEur:choice.deliveryAndPackingEur,withinTolerance:choice.withinTolerance,stores:choice.stores.map(x=>x.id),items:choice.chosen.map(o=>({id:o.id,store:o.store,url:o.url,priceEur:o.priceEur,packGrams:o.packGrams,packs:o.packs,lineEur:o.lineEur}))}:null,
    failure:choice.ok?null:choice.reason,
    compared:checks.map(({offer,error})=>({id:offer.id,store:offer.store,name:offer.name,url:offer.url,priceEur:error?null:offer.priceEur,euroPerKg:error?null:Math.round(100*offer.priceEur*1000/offer.packGrams)/100,verified:!error,reason:error||'Patikrinta, įtraukiama į optimizavimą'})),
    otherFarmCandidates:rules.shopping.supplierCandidates.filter(s=>s.name!=='Barbora').map(({name,url,status})=>({name,url,status}))
  };
  return {choice,report};
}
export async function writeComparisonReport(report){
  const dir=new URL('../data/offer-comparison-report.json',import.meta.url);
  await fs.writeFile(dir,JSON.stringify(report,null,2)+'\n');
  console.log('Palyginta '+report.compared.length+' pasiūlymų. ' +(report.chosen?'Geriausias leistinas krepšelis: '+report.chosen.totalEur+' EUR, '+report.chosen.stores.length+' parduotuvės.':'Nerastas taisykles atitinkantis krepšelis: '+report.failure));
  if(report.failure)note(report.failure);
  if(process.env.GITHUB_STEP_SUMMARY){
    const lines=['### Ūkininkų pasiūlymų palyginimas','',report.chosen?'**'+report.chosen.totalEur+' EUR**, parduotuvės: '+report.chosen.stores.join(', '):'⚠️ '+report.failure,'','*Tai konkrečių SKU palyginimas, ne automatinė interneto paieška.*','',''];
    for(const p of report.compared)lines.push('- '+p.id+' / '+p.store+': '+(p.verified?p.euroPerKg+' EUR/kg':'netinkama: '+p.reason));
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const menu=JSON.parse(await fs.readFile(new URL('../data/menu.json',import.meta.url),'utf8'));
    const {report}=await compareFarmOffers(menu);
    await writeComparisonReport(report);
  }catch(e){console.error(e.stack||e.message);process.exitCode=1;}
}
