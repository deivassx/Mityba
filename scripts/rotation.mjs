import {readFileSync} from 'node:fs';
// Baltymų prioritetai nustatomi iš TIKRŲ produktų URL, ne iš bendrų svetainių.
// Šios nuorodos pačios nepatvirtina kainos, likučių arba pristatymo.
const GROUPS={lunch:['kalakutiena','vistiena','eriena','kiauliena'],dinner:['samas','jautiena','lasisa','menke']};
const INGREDIENTS={kalakutiena:'turkey',vistiena:'chicken',eriena:'lamb',kiauliena:'pork_tenderloin',
  samas:'catfish',jautiena:'beef',lasisa:'salmon',menke:'cod'};
const VEG=new Set(['broccoli','carrot','beet','pepper','mushroom','tomato','onion','cabbage','sauerkraut']);
const assert=(c,m)=>{if(!c)throw Error(m)};
const isProductUrl=u=>typeof u==='string'&&/^https:\/\/[^/?#]+\/(produktas|product|preke)\/[^/?#]+\/?$/i.test(u);
export function sourceTier(group,sources){
  const entry=sources?.products?.[INGREDIENTS[group]]||{};
  const links=(entry.farmers||[]).filter(x=>isProductUrl(x.url)&&x.available!==false);
  if(links.some(x=>x.kind==='farmer_product'&&x.producer))return 4;
  if(links.some(x=>x.kind==='producer_product_reseller'&&x.producer))return 3;
  const f=entry.farmlio;
  if(f&&['existing_catalog_sku','exact_sku'].includes(f.kind)&&f.available!==false
     &&typeof f.url==='string'&&/^https:\/\/farmlio\.lt\/pardavejai\/[^/]+\/prekes\/[^/?#]+\/?$/.test(f.url))return 2;
  return 0;
}
function computeSchedule(groups,bank,bases,sources){
  const originals=new Map(bases.map(x=>[x.id,x]));
  const variants=group=>{
    const base=originals.get(group),extra=bank.variants?.[group];
    assert(base&&Array.isArray(extra)&&[3,7].includes(extra.length),'Trūksta grupės receptų: '+group);
    return [base,...extra];
  };
  const assign=names=>{
    const quota=Object.fromEntries(names.map(x=>[x,1]));
    let extras=16-names.length;
    while(extras-->0){
      const queue=names.filter(x=>quota[x]<variants(x).length).sort((a,b)=>
        sourceTier(b,sources)-sourceTier(a,sources)||
        quota[a]/variants(a).length-quota[b]/variants(b).length||a.localeCompare(b));
      assert(queue.length>0,'Per mažai skirtingų receptų');quota[queue[0]]++;
    }
    const used=Object.fromEntries(names.map(x=>[x,0]));
    const last=Object.fromEntries(names.map(x=>[x,-100]));
    const weeks=[];
    for(let week=0;week<8;week++){
      const left=8-week,mandatory=names.filter(x=>quota[x]-used[x]===left);
      assert(mandatory.length<=2,'Nepavyksta išdėstyti skirtingų baltymų grupių');
      const chosen=[...mandatory];
      while(chosen.length<2){
        const queue=names.filter(x=>!chosen.includes(x)&&quota[x]>used[x]).sort((a,b)=>
          (quota[b]-used[b])/left-(quota[a]-used[a])/left||
          (week-last[b])-(week-last[a])||sourceTier(b,sources)-sourceTier(a,sources)||a.localeCompare(b));
        assert(queue.length>0,'Nepavyksta parinkti grupių');chosen.push(queue[0]);
      }
      chosen.forEach(x=>{used[x]++;last[x]=week;});
      weeks.push(chosen);
    }
    for(const x of names)assert(used[x]===quota[x],'Nesutampa grupių kvotos: '+x);
    return {quota,weeks};
  };
  return {lunch:assign(groups.lunch),dinner:assign(groups.dinner),variants};
}
function nutrition(recipe,nutrients){
  let kcal=0,protein=0,carbs=0,vegetables=0;
  for(const [id,g] of Object.entries(recipe.ingredients)){
    const n=nutrients[id];assert(n&&Number.isFinite(n.kcal),'Trūksta maistingumo: '+id);
    kcal+=n.kcal*g/100;protein+=n.protein*g/100;carbs+=n.carbs*g/100;
    if(VEG.has(id))vegetables+=g;
  }
  return {kcal,protein,carbs,vegetables};
}
function matchesNutrition(a,b,nutrients){
  const x=nutrition(a,nutrients),y=nutrition(b,nutrients);
  return x.kcal>=600&&y.kcal>=600&&x.kcal+y.kcal<=2100&&
    x.protein+y.protein>=130&&x.vegetables+y.vegetables>=800&&x.carbs>=y.carbs;
}
export function selectWeeklyRecipes(bases,bank,weekStart,{sources,nutrients}={}){
  assert(/^\d{4}-\d{2}-\d{2}$/.test(weekStart),'Neteisinga savaitės data');
  const anchor=Date.parse('2026-11-09T00:00:00Z'),days=7*86400000;
  const n=(Date.parse(weekStart+'T00:00:00Z')-anchor)/days;
  assert(Number.isInteger(n),'Savaitė turi prasidėti pirmadienį');
  if(!sources)sources=JSON.parse(readFileSync(new URL('../data/sourcing-links.json',import.meta.url),'utf8'));
  if(!nutrients)nutrients=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8')).nutrients;
  const idx=((n%8)+8)%8,cycle=Math.floor(n/8),plan=computeSchedule(GROUPS,bank,bases,sources);
  const usedIds=new Set(),out=[];
  // Skirtingi ciklai išnaudoja naujus variantus, bet vieno 8 savaičių ciklo viduje niekas nesikartoja.
  const options=group=>{
    const all=plan.variants(group),quota=plan[GROUPS.lunch.includes(group)?'lunch':'dinner'].quota[group];
    const first=((cycle*quota)%all.length+all.length)%all.length;
    return [...all.slice(first),...all.slice(0,first)].filter(x=>!usedIds.has(x.id));
  };
  for(let week=0;week<=idx;week++){
    const [a,b]=plan.lunch.weeks[week],[c,d]=plan.dinner.weeks[week];
    let chosen=null;
    for(const ds of [[c,d],[d,c]]){
      const pairs=[];let penalty=0,ok=true;
      for(const [l,r] of [[a,ds[0]],[b,ds[1]]]){
        const x=options(l),y=options(r);
        let match=null;
        for(let i=0;i<x.length;i++)for(let j=0;j<y.length;j++)
          if(!match&&matchesNutrition(x[i],y[j],nutrients))match={l:x[i],r:y[j],penalty:i+j};
        if(!match){ok=false;break;}
        pairs.push(match);penalty+=match.penalty;
      }
      if(ok&&(!chosen||penalty<chosen.penalty))chosen={pairs,penalty};
    }
    assert(chosen,'Nepavyko sudaryti maistinių ribų atitinkančios savaitės: '+weekStart);
    const recipes=chosen.pairs.flatMap(p=>[p.l,p.r]);
    recipes.forEach(r=>{assert(!usedIds.has(r.id),'Pasikartojantis patiekalas: '+r.id);usedIds.add(r.id);});
    out.push({recipes,pairs:chosen.pairs.map(p=>[p.l.id,p.r.id]),groups:[a,b,c,d]});
  }
  const result=out[idx];
  const priorities=result.groups.map(g=>({group:g,ingredientId:INGREDIENTS[g],sourceTier:sourceTier(g,sources)}));
  return {...result,weekIndex:n,sourcingPriority:{priorities,
    withProductLinks:priorities.filter(p=>p.sourceTier>0).length,
    directFarmerCount:priorities.filter(p=>p.sourceTier===4).length,
    farmViaResellerCount:priorities.filter(p=>p.sourceTier===3).length,
    farmlioExactCount:priorities.filter(p=>p.sourceTier===2).length,
    disclaimer:'Prioritetas pagal konkrečių produktų nuorodas; kainos, likučiai ir pristatymas nepatvirtinti.'}};
}
