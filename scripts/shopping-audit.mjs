import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const round=n=>Math.round((n+Number.EPSILON)*100)/100;

export function auditShopping(menu,rules){
  const policy=rules.shopping, budget=policy.budget, restriction=policy.barboraRestriction;
  if(!budget||!restriction)throw Error('Trūksta pirkimo taisyklių');
  const grams={};
  const recipes=new Map(menu.recipes.map(r=>[r.id,r]));
  for(const day of menu.days){
    for(const id of [day.lunch,day.dinner]){
      const r=recipes.get(id);
      if(!r)throw Error('Nėra recepto '+id);
      for(const [ingredient,g] of Object.entries(r.ingredients))grams[ingredient]=(grams[ingredient]||0)+g;
    }
  }
  const storeMap=new Map(menu.stores.map(s=>[s.id,{...s,items:[],subtotal:0}]));
  const warnings=[], unknown=[];
  for(const p of menu.products){
    const need=grams[p.id]||0;
    if(need<=0)continue;
    const store=storeMap.get(p.store);
    if(!store)throw Error('Nežinomas tiekėjas: '+p.store);
    const count=Math.ceil(need/p.packGrams);
    if(!Number.isFinite(p.priceEur)||p.priceEur<=0){
      unknown.push(p.id);
    } else {
      const amount=round(count*p.priceEur);
      store.subtotal=round(store.subtotal+amount);
      store.items.push({id:p.id,count,needGrams:need,totalEur:amount,euroPerKg:round(p.priceEur*1000/p.packGrams)});
    }
    if(p.store==='barbora'){
      const isVegetable=restriction.allowedVegetableIngredientIds.includes(p.id);
      const isAddon=restriction.allowedAddonIngredientIds.includes(p.id);
      const isChicken=restriction.chickenIngredientIds.includes(p.id);
      if(!isVegetable&&!isAddon&&!isChicken)warnings.push('BARBORA_NETINKA: '+p.id+' – pagrindinė mėsa / žuvis turi būti ieškoma ūkiuose.');
      if(isChicken)warnings.push('BARBORA_VISTIENA: '+p.id+' – būtina įrodyti, kad tinkamo tiekimo iš ūkių nerasta.');
    }
  }
  let grand=0;
  const stores=[];
  for(const v of storeMap.values()){
    if(!v.items.length&&!menu.products.some(p=>p.store===v.id&&grams[p.id]>0))continue;
    const subtotal=v.subtotal;
    const delivery=Number.isFinite(v.freeDeliveryFromEur)&&subtotal>=v.freeDeliveryFromEur ? 0 : (v.deliveryFeeEur||0);
    const tiers=v.packingTiers||[];
    const tier=tiers.filter(t=>subtotal>=t.from).sort((a,b)=>b.from-a.from)[0];
    const packing=tier?.fee??v.packingFeeEur??0;
    const smallFee=v.smallBasketFeeBelowEur && subtotal<v.smallBasketFeeBelowEur ? (v.smallBasketFeeEur||0) : 0;
    const total=round(subtotal+delivery+packing+smallFee);
    stores.push({name:v.name||v.id,subtotalEur:subtotal,estimatedDeliveryEur:delivery,estimatedPackingEur:packing,smallBasketFeeEur:smallFee,totalEur:total,items:v.items});
    grand=round(grand+total);
  }
  if(unknown.length)warnings.push('NEPATIKRINTOS_KAINOS: '+unknown.join(', '));
  if(grand>budget.targetWeeklyTotalEur) warnings.push('BIUDZETAS: preliminarus krepšelis '+grand+' EUR viršija '+budget.targetWeeklyTotalEur+' EUR tikslą.');
  if(grand>budget.softLimitEur) warnings.push('VIRS_TOLERANCIJOS: viršija '+budget.softLimitEur+' EUR; ieškok pigesnių variantų ir nevadink biudžetą atitinkančiu.');
  return {targetEur:budget.targetWeeklyTotalEur,softLimitEur:budget.softLimitEur,estimatedTotalEur:grand,costsEstimated:true,stores,warnings};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const rules=JSON.parse(await fs.readFile(new URL('../config/planavimo-taisykles.json',import.meta.url),'utf8'));
  const menu=JSON.parse(await fs.readFile(new URL('../data/menu.json',import.meta.url),'utf8'));
  const a=auditShopping(menu,rules);
  console.log('Pirkinių krepšelis, orientacinės pristatymo sąlygos: '+a.estimatedTotalEur.toFixed(2)+' EUR (tikslas '+a.targetEur+' EUR; tolerancija '+a.softLimitEur+' EUR).');
  for(const m of a.warnings)console.log('::warning::'+m);
  if(process.env.GITHUB_STEP_SUMMARY){
    const lines=['### Pirkinių politikos patikra','','Preliminarus krepšelis: **'+a.estimatedTotalEur.toFixed(2)+' EUR** (tikslas '+a.targetEur+' EUR, tolerancija '+a.softLimitEur+' EUR).','Pristatymo ir pakavimo mokesčiai yra katalogo įverčiai, ne patikrinta atsiskaitymo suma.',''];
    for(const s of a.stores) lines.push('- '+s.name+': prekės '+s.subtotalEur.toFixed(2)+' EUR, kiti mokesčiai '+round(s.totalEur-s.subtotalEur).toFixed(2)+' EUR.');
    for(const m of a.warnings)lines.push('- ⚠️ '+m);
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
  }
}
