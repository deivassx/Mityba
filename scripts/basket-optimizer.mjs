// Tikrų patikrintų prekių globalus palyginimas, perkant daugiausia iš dviejų atsiskaitymo vietų.
// NEIEŠKO nežinomų SKU internete: juos į duomenų katalogą prideda agentas, patikrinęs nuorodas.
const round = n => Math.round((n+Number.EPSILON)*100)/100;
const assert = (yes,msg) => { if(!yes) throw Error(msg); };

export function neededIngredients(menu) {
  const recipes=new Map(menu.recipes.map(x=>[x.id,x]));
  const needed={};
  for(const d of menu.days) for(const rid of [d.lunch,d.dinner]) {
    const recipe=recipes.get(rid);
    assert(recipe,'Trūksta recepto: '+rid);
    for(const [id,grams] of Object.entries(recipe.ingredients)) needed[id]=(needed[id]||0)+grams;
  }
  return needed;
}
export function deliveryCost(store,subtotal) {
  if(store.feesVerified===false || store.deliveryFeeEur===null || store.deliveryFeeEur===undefined) return null;
  if(!Number.isFinite(store.deliveryFeeEur) || store.deliveryFeeEur<0) return null;
  if(store.packingFeeEur===null) return null;
  const deliver=store.freeDeliveryFromEur!=null && subtotal>=store.freeDeliveryFromEur ? 0 : store.deliveryFeeEur;
  let packing=store.packingFeeEur||0;
  if(store.packingTiers) for(const tier of store.packingTiers) if(subtotal>=tier.from) packing=tier.fee;
  const small=store.smallBasketFeeBelowEur!=null && subtotal<store.smallBasketFeeBelowEur ? (store.smallBasketFeeEur||0) : 0;
  if(![deliver,packing,small].every(x=>Number.isFinite(x)&&x>=0))return null;
  return round(deliver+packing+small);
}
function allowedForBarbora(offer,rules,hasFarmerChicken) {
  if(offer.store!=='barbora')return true;
  const r=rules.shopping.barboraRestriction;
  if(!r?.enabled)return true;
  if(r.allowedVegetableIngredientIds.includes(offer.id)||r.allowedAddonIngredientIds.includes(offer.id))return true;
  return r.chickenIngredientIds.includes(offer.id) && !hasFarmerChicken;
}
function isFarmer(store) {return store && store.id!=='barbora';}
function viable(offer,stores,rules,now,hasFarmerChicken) {
  if(!offer || !offer.nutritionallyEquivalentReviewed)return false;
  if(!offer.url?.startsWith('https://')||!Number.isFinite(offer.packGrams)||offer.packGrams<=0)return false;
  if(!Number.isFinite(offer.priceEur)||offer.priceEur<=0 || offer.available===false)return false;
  const hostname=new URL(offer.url).hostname;
  if(!rules.shopping.allowedProductDomains.some(d=>hostname===d||hostname.endsWith('.'+d)))return false;
  const v=offer.verification;
  if(v?.url!==offer.url || !Number.isFinite(Date.parse(v.checkedAt)))return false;
  const age=now-Date.parse(v.checkedAt);
  if(age< -60000 || age>rules.shopping.verifiedPriceMaxAgeHours*3600000)return false;
  if(!stores.has(offer.store)||deliveryCost(stores.get(offer.store),0)===null)return false;
  return allowedForBarbora(offer,rules,hasFarmerChicken);
}
export function optimizeBasket(menu,rules,candidates,{now=new Date()}={}) {
  const needed=neededIngredients(menu), stores=new Map(candidates.stores.map(x=>[x.id,x]));
  const maxStores=Math.min(rules.shopping.maxStoresPerWeek,rules.shopping.comparison?.maxCheckoutStores??2,2);
  assert(maxStores>0,'Neleistinas parduotuvių skaičius');
  // Farmų vištienos pasiūlymas turi būti tikrai patikrintas, kitaip galimas Barbora atsarginis variantas.
  const farmerChicken=candidates.offers.some(o=>o.id==='chicken'&&isFarmer(stores.get(o.store))&&viable(o,stores,rules,+now,false));
  const byId=new Map();
  for(const o of candidates.offers){
    if(!needed[o.id] || !viable(o,stores,rules,+now,farmerChicken))continue;
    const arr=byId.get(o.id)||[];
    const count=Math.ceil(needed[o.id]/o.packGrams);
    arr.push({...o,packs:count,lineEur:round(count*o.priceEur)});
    byId.set(o.id,arr);
  }
  const ids=Object.keys(needed).sort((a,b)=>(byId.get(a)?.length||0)-(byId.get(b)?.length||0));
  const missing=ids.filter(id=>!byId.has(id));
  if(missing.length)return {ok:false,missing,chosen:[],stores:[],totalEur:null,reason:'Trūksta patikrintų taisykles atitinkančių pasiūlymų: '+missing.join(', ')};
  const suffix=Array(ids.length+1).fill(0);
  for(let i=ids.length-1;i>=0;i--)suffix[i]=suffix[i+1]+Math.min(...byId.get(ids[i]).map(o=>o.lineEur));
  let best=null;
  const picked=[],subtotals=new Map();
  const inspect=()=>{
    let fees=0,goods=0;const used=[];
    for(const [id,subtotal] of subtotals){
      if(subtotal<=0)continue;
      const s=stores.get(id);
      if(Number.isFinite(s.minOrderEur)&&subtotal<s.minOrderEur)return;
      const fee=deliveryCost(s,subtotal);
      if(fee===null)return;
      goods+=subtotal;fees+=fee;used.push(s);
    }
    const total=round(goods+fees);
    const key=picked.map(o=>o.store+':'+o.url).join('|');
    const farmCount=used.filter(isFarmer).length;
    if(!best||total<best.totalEur-0.0001||(Math.abs(total-best.totalEur)<0.0001 && (farmCount>best.farmCount||(farmCount===best.farmCount&&key<best.key)))) {
      best={ok:true,totalEur:total,goodsEur:round(goods),deliveryAndPackingEur:round(fees),farmCount,key,chosen:picked.map(o=>({...o})),stores:used.map(s=>({...s})),missing:[]};
    }
  };
  function walk(index,merchandise) {
    if(best && merchandise+suffix[index]>best.totalEur+0.0001)return;
    if(index===ids.length){inspect();return;}
    const options=byId.get(ids[index]).sort((a,b)=>a.lineEur-b.lineEur||a.store.localeCompare(b.store));
    for(const o of options) {
      const current=subtotals.get(o.store)||0;
      if(current===0 && subtotals.size>=maxStores)continue;
      subtotals.set(o.store,round(current+o.lineEur));
      picked.push(o);
      walk(index+1,merchandise+o.lineEur);
      picked.pop();
      if(current)subtotals.set(o.store,current);else subtotals.delete(o.store);
    }
  }
  walk(0,0);
  if(!best)return {ok:false,missing:[],chosen:[],stores:[],totalEur:null,reason:'Neįmanoma sukomplektuoti krepšelio iš 1–2 parduotuvių su žinomais pristatymo mokesčiais ir minimaliais užsakymais.'};
  const target=rules.shopping.budget.targetWeeklyTotalEur, limit=rules.shopping.budget.softLimitEur;
  return {...best,withinTarget:best.totalEur<=target,withinTolerance:best.totalEur<=limit,alternativeCount:candidates.offers.length};
}
