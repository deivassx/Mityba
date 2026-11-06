/* Vienos (7 dienų) savaitės užsakymo juodraštis, be automatinio pirkimo. */
(function(root){
  'use strict';
  const PROTEINS=new Set(['turkey','chicken','beef','beef_steak','beef_strips','beef_roast','catfish','lamb','salmon','cod','pork_tenderloin']);
  const num=n=>new Intl.NumberFormat('lt-LT').format(n);
  const eur=n=>new Intl.NumberFormat('lt-LT',{style:'currency',currency:'EUR'}).format(n);
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const url=x=>{try{const u=new URL(x);return u.protocol==='https:'?u.href:null;}catch{return null;}};
  const blocked=u=>{const host=new URL(u).hostname;return host==='pilnaspuodas.lt'||host.endsWith('.pilnaspuodas.lt');};
  const TYPES=new Set(['farmer_product','producer_product_reseller','retailer_product','farmer_product_candidate']);

  function farmerProductLinks(source){
    return (source?.farmers||[]).filter(x=>{
      const href=url(x.url);
      if(!href||blocked(href)||!x.name||!TYPES.has(x.kind))return false;
      const pathname=new URL(href).pathname;
      if(x.kind==='farmer_product_candidate'){
        // Tik aiškiai pažymėti kandidatai su konkrečiu prekės puslapiu; ne ūkių pradžios/kategorijų puslapiai.
        return !!x.producer && x.productMatchVerified===false
          && /^\/[a-z0-9-]{12,}\/?$/i.test(pathname)
          && !/kategor|parduotuv|prekes|produktai|shop/i.test(pathname);
      }
      return /^\/(produktas|product|preke)\/[^/?#]+\/?$/i.test(pathname);
    });
  }

  function demand(menu){
    if(!menu||menu.days?.length!==7)throw Error('Užsakymui reikia vienos pilnos 7 dienų savaitės.');
    const recipes=new Map(menu.recipes.map(r=>[r.id,r]));
    const quantities={};
    for(const day of menu.days){
      for(const recipeId of [day.lunch,day.dinner]){
        const r=recipes.get(recipeId);
        if(!r)throw Error('Nerastas receptas: '+recipeId);
        for(const [id,grams] of Object.entries(r.ingredients)){
          if(!Number.isFinite(grams)||grams<=0)throw Error('Neteisingas ingrediento kiekis: '+id);
          quantities[id]=(quantities[id]||0)+grams;
        }
      }
    }
    return quantities;
  }


  // Išsaugoma tik sąmoningai pasirinkta atsiskaitymo vieta, o ne katalogo numatytasis tiekėjas.
  const selectionStorageKey=(week,id)=>'mityba-7dienu-tiekejas-'+week+'-'+id;
  const savedSelection=(week,id)=>{try{return localStorage.getItem(selectionStorageKey(week,id))||'';}catch{return '';}};
  function isRecent(checkedAt,maxAge){
    const timestamp=Date.parse(checkedAt);
    const age=Date.now()-timestamp;
    return Number.isFinite(timestamp)&&age>=-60000&&age<=maxAge;
  }
  const exactFarmlio=x=>['existing_catalog_sku','exact_sku'].includes(x?.kind)
    && /^https:\/\/farmlio\.lt\/pardavejai\/[^/]+\/prekes\/[^/?#]+\/?$/i.test(x?.url||'');
  function candidates(product,sourcing,stores,maxAge) {
    const offers=[],seen=new Set();
    const add=(o)=>{
      const link=url(o.url);
      if(!link||blocked(link)||seen.has(link))return;
      seen.add(link);
      offers.push({...o,key:link,url:link});
    };
    // Oficialios tiksliai atitinkančios prekės pirmiau nei tarpininkai.
    for(const farm of farmerProductLinks(sourcing)){
      if(!['farmer_product','producer_product_reseller'].includes(farm.kind))continue;
      const link=url(farm.url),hostname=new URL(link).hostname;
      add({url:link,name:farm.name,store:hostname,storeName:farm.producer||hostname,
        packGrams: Number.isFinite(farm.packGrams)?farm.packGrams:null,
        priceEur:null,verified:false,kind:'farmer',historicalEurPerKg:farm.priceObservedEurPerKg||null,
        observedOn:farm.priceSeenOn||null});
    }
    if(product?.url&&product?.store){
      const shop=stores.find(x=>x.id===product.store);
      const verified=Number.isFinite(product.priceEur)&&product.priceEur>0
        &&product.available!==false&&product.verification?.url===product.url
        &&isRecent(product.verification.checkedAt,maxAge);
      add({url:product.url,name:product.name||'Katalogo prekė',store:product.store,
        storeName:shop?.name||product.store,packGrams:product.packGrams||null,
        priceEur:verified?product.priceEur:null,verified:!!verified,kind:'catalog',
        historicalUnitPrice:!verified&&Number.isFinite(product.priceEur)?product.priceEur:null});
    }
    if(exactFarmlio(sourcing?.farmlio)){
      const x=sourcing.farmlio;
      add({url:x.url,name:x.label||'Farmlio prekė',store:'farmlio',storeName:'Farmlio',
        packGrams:null,priceEur:null,verified:false,kind:'farmlio'});
    }
    // Tik tikslus SKU leidžiama pasirinkti. Panašūs produktai ir kategorijos – tik nuorodos.
    if(sourcing?.barbora?.kind==='exact_sku'){
      const x=sourcing.barbora;
      add({url:x.url,name:x.name,store:'barbora',storeName:'Barbora (atsarginis)',
        packGrams:x.packGrams||null,priceEur:null,verified:false,kind:'fallback',
        historicalEurPerKg:x.priceObservedEurPerKg||null,observedOn:x.priceSeenOn||null});
    }
    return offers;
  }
  function evaluate(plan){
    for(const line of plan.items){
      const choice=line.choices.find(o=>o.key===line.selectedKey)||null;
      line.selected=choice;
      line.store=choice?.store||null;
      line.productName=choice?.name||null;
      line.url=choice?.url||null;
      line.packGrams=choice?.packGrams||null;
      line.packs=line.packGrams>0?Math.ceil(line.grams/line.packGrams):null;
      line.cost=choice?.verified&&line.packs&&choice.priceEur>0?round(choice.priceEur*line.packs):null;
      line.priceFresh=!!choice?.verified;
      line.needsReview=line.cost===null;
    }
    plan.suppliers=[...new Set(plan.items.map(p=>p.store).filter(Boolean))];
    plan.tooManyStores=plan.suppliers.length>plan.maxStores;
    plan.missing=plan.items.filter(p=>!p.selected);
    plan.unknownPrice=plan.items.filter(p=>p.cost===null);
    const priced=plan.items.filter(p=>p.cost!==null);
    plan.partialGoodsEstimateEur=round(priced.reduce((v,p)=>v+p.cost,0));
    plan.pricedCount=priced.length;
    plan.incomplete=plan.missing.length>0||plan.unknownPrice.length>0;
    plan.deliveryEstimateEur=null;
    plan.grandTotalEur=null;
    plan.priceIncludesDelivery=false;
    // Senos katalogo pristatymo kainos nėra realaus atsiskaitymo patikrinimas.
    // Pilną sumą pateikiame tik patikrinę kiekvieną prekę ir visus tiekėjų mokesčius.
    if(!plan.incomplete&&!plan.tooManyStores&&plan.suppliers.length){
      let allFeesVerified=true,fees=0;
      for(const id of plan.suppliers){
        const store=plan.stores.find(s=>s.id===id);
        const sum=round(plan.items.filter(p=>p.store===id).reduce((n,p)=>n+p.cost,0));
        if(!store||store.feesVerified!==true||!isRecent(store.feesCheckedAt,plan.maxAge)
          ||!Number.isFinite(store.deliveryFeeEur)||!Number.isFinite(store.packingFeeEur)
          ||(store.minOrderEur!=null&&sum<store.minOrderEur)){allFeesVerified=false;break;}
        const delivery=store.freeDeliveryFromEur!=null&&sum>=store.freeDeliveryFromEur?0:store.deliveryFeeEur;
        let packing=store.packingFeeEur;
        if(store.packingTiers)for(const tier of store.packingTiers)if(sum>=tier.from)packing=tier.fee;
        const small=store.smallBasketFeeBelowEur!=null&&sum<store.smallBasketFeeBelowEur?store.smallBasketFeeEur||0:0;
        fees+=delivery+packing+small;
      }
      if(allFeesVerified){
        plan.deliveryEstimateEur=round(fees);
        plan.grandTotalEur=round(plan.partialGoodsEstimateEur+fees);
        plan.priceIncludesDelivery=true;
      }
    }
    // Rodymas nėra pirkimo atlikimas; svetainė niekada automatiškai neperka.
    plan.orderReady=false;
    return plan;
  }
  function choose(plan,id,key){
    const line=plan.items.find(x=>x.id===id);
    if(!line)return false;
    if(key!==''&&!line.choices.some(c=>c.key===key))return false;
    const previous=line.selectedKey;
    line.selectedKey=key;
    evaluate(plan);
    if(plan.tooManyStores){
      line.selectedKey=previous;
      evaluate(plan);
      return false;
    }
    try{
      if(key)localStorage.setItem(selectionStorageKey(plan.weekStart,id),key);
      else localStorage.removeItem(selectionStorageKey(plan.weekStart,id));
    }catch{}
    return true;
  }
  function build(menu,sources={products:{}},rules={}){
    const needed=demand(menu);
    const policy=rules.shopping||{},bulk=policy.bulkPurchase||{},budget=policy.budget||{};
    if(bulk.planningHorizonDays!=null&&bulk.planningHorizonDays!==7)throw Error('Užsakymo taisyklės turi numatyti 7 dienas.');
    const start=menu.meta?.weekStart,startTime=Date.parse(start+'T00:00:00Z');
    if(!Number.isFinite(startTime)||menu.days[0]?.date!==start)throw Error('Neteisinga pirmoji savaitės diena.');
    for(let i=0;i<7;i++){
      const expected=new Date(startTime+i*86400000).toISOString().slice(0,10);
      if(menu.days[i].date!==expected)throw Error('Savaitės dienos turi eiti iš eilės.');
    }
    const maxStores=Math.min(policy.maxStoresPerWeek??2,bulk.maxDistinctCheckoutStoresAcrossHorizon??2);
    const budgetTargetEur=budget.targetWeeklyTotalEur??100,budgetToleranceEur=budget.softLimitEur??110;
    const maxAge=(policy.verifiedPriceMaxAgeHours??24)*3600000;
    const groups=[
      {id:'baltymai',name:'Mėsa ir žuvis · 7 dienoms',description:'Ūkių SKU pirmiau. Jei kaina, pakuotė ar pristatymas nepatikrinti, pažymima aiškiai.',lines:[]},
      {id:'priedai',name:'Daržovės, pieno produktai ir priedai · 7 dienoms',description:'Vienos savaitės reikalingi kiekiai, be išankstinio priskyrimo parduotuvei.',lines:[]}
    ];
    for(const id of Object.keys(needed).sort((a,b)=>a.localeCompare(b))){
      const product=menu.products.find(p=>p.id===id)||null;
      const sourcing=PROTEINS.has(id)?(sources.products?.[id]||null):null;
      const choices=candidates(product,sourcing,menu.stores||[],maxAge);
      const previous=savedSelection(start,id);
      const selectedKey=choices.some(o=>o.key===previous)?previous
        :menu.meta?.purchaseReady===true&&choices.some(o=>o.kind==='catalog'&&o.verified)
          ?choices.find(o=>o.kind==='catalog'&&o.verified).key:'';
      const group=PROTEINS.has(id)?groups[0]:groups[1];
      group.lines.push({
        id,group:group.id,name:menu.ingredientLabels[id]||id,grams:needed[id],choices,selectedKey,
        sourcing,unavailable:!product,referenceProduct:product
      });
    }
    const items=groups.flatMap(g=>g.lines);
    const plan={
      weekStart:start,lastDay:menu.days.at(-1).date,days:7,meals:14,
      groups,items,maxStores,maxAge,stores:menu.stores||[],
      budgetTargetEur,budgetToleranceEur,purchaseReady:menu.meta.purchaseReady===true
    };
    return evaluate(plan);
  }

  let active=null;
  const key=line=>'mityba-7dienu-'+active.weekStart+'-'+line.group+'-'+line.id;
  const checked=line=>{try{return localStorage.getItem(key(line))==='1';}catch{return false;}};

  function linksFor(line){
    const result=[],seen=new Set();
    const linkItem=(href,label,hint='',css='')=>{
      const safe=url(href);
      if(!safe||blocked(safe)||seen.has(safe))return;
      seen.add(safe);
      result.push('<span class="'+css+'"><a href="'+esc(safe)+'" target="_blank" rel="noopener noreferrer">'
        +esc(label)+' ↗</a>'+(hint?'<small>'+esc(hint)+'</small>':'')+'</span>');
    };
    for(const offer of farmerProductLinks(line.sourcing)){
      const channel=offer.kind==='farmer_product'?'Ūkio prekė'
        :offer.kind==='farmer_product_candidate'?'Ūkininko kandidatas (filė atitiktį patikrinti)'
        :offer.kind==='producer_product_reseller'?'Ūkio prekė per tarpininką':'Pardavėjo prekė';
      linkItem(offer.url,channel+': '+offer.name,'Kaina, likutis ir pristatymas nepatvirtinti.','fortnight-farm-product');
    }
    for(const offer of line.choices){
      const label=offer.kind==='catalog'?'Katalogo SKU: '+offer.name
        :offer.kind==='farmer'?'Ūkio prekė: '+offer.name
        :offer.kind==='farmlio'?'Farmlio SKU: '+offer.name
        :'Barbora atsarginė prekė: '+offer.name;
      linkItem(offer.url,label,'Patikrink kainą ir prekės tinkamumą.');
    }
    const farmlio=line.sourcing?.farmlio;
    if(farmlio?.kind==='catalog_search'&&farmlio.url)
      linkItem(farmlio.url,'Farmlio katalogas','Tai nėra konkretus SKU.');
    const bar=line.sourcing?.barbora;
    if(bar?.url&&bar.kind!=='exact_sku'){
      const label=bar.kind==='similar_sku'?'Barbora – panaši prekė':'Barbora – paieška';
      linkItem(bar.url,label,'Nėra tikslus patvirtintas produkto SKU.','fortnight-fallback');
    }
    if(!result.length)result.push('<small>Nerasta tinkamos konkrečios prekės nuorodos.</small>');
    return '<div class="fortnight-links">'+result.join('')+'</div>';
  }

  function priceHtml(line){
    if(line.cost!==null)return '<strong>'+eur(line.cost)+'</strong><small>Patikrinta šiam SKU</small>';
    const chosen=line.selected;
    const old=chosen?.kind==='catalog'?chosen.historicalUnitPrice:null;
    if(Number.isFinite(old)&&old>0)
      return '<strong>—</strong><small>Istorinė kaina: '+eur(old)+'/pakuotę. Neįskaičiuota.</small>';
    if(Number.isFinite(chosen?.historicalEurPerKg)&&chosen.historicalEurPerKg>0)
      return '<strong>—</strong><small>Anksčiau matyta: '+eur(chosen.historicalEurPerKg)+'/kg'+(chosen.observedOn?' ('+esc(chosen.observedOn)+')':'')+'. Neįskaičiuota.</small>';
    return '<strong>—</strong><small>Kaina nepatvirtinta</small>';
  }
  function groupHtml(group){
    const rows=group.lines.map(line=>{
      const done=checked(line),selected=line.selected;
      const status=!selected?'Nepasirinktas tiekėjas'
        :line.packGrams==null?'Pakuotė ir kaina nepatvirtintos'
        :line.priceFresh?'Prekės kaina patikrinta':'Reikia atnaujinti kainą ir likutį';
      const packs=line.packs==null?'Pakuotė nepatvirtinta':num(line.packs)+' × '+num(line.packGrams)+' g';
      const options=line.choices.map(o=>'<option value="'+esc(o.key)+'"'+(o.key===line.selectedKey?' selected':'')+'>'
        +esc(o.storeName+' · '+o.name)+(o.kind==='farmer'?' (ūkininkas)':o.kind==='fallback'?' (atsarginis)':'')+'</option>').join('');
      return '<tr class="'+(done?'is-complete':'')+'"><td><input type="checkbox" class="fortnight-check" '
        +'data-group="'+esc(line.group)+'" data-id="'+esc(line.id)+'" aria-label="Įsigyta: '+esc(line.name)+'" '+(done?'checked':'')+'></td>'
        +'<td><div class="product-name">'+esc(line.name)+'</div><div class="product-sub">Reikia '+num(line.grams)+' g</div>'
        +'<span class="fortnight-pill">'+esc(status)+'</span></td>'
        +'<td><label class="source-label" for="source-'+esc(line.id)+'">Pasirink tiekėją</label>'
        +'<select class="weekly-source" id="source-'+esc(line.id)+'" data-id="'+esc(line.id)+'">'
        +'<option value="">— Nepasirinkta —</option>'+options+'</select>'
        +'<small class="source-note">Pasirinkimas nėra užsakymo patvirtinimas.</small>'+linksFor(line)+'</td>'
        +'<td>'+packs+'</td><td class="weekly-cost">'+priceHtml(line)+'</td></tr>';
    }).join('');
    return '<article class="card fortnight-group"><h3>'+esc(group.name)+'</h3><p>'+esc(group.description)+'</p>'
      +'<div class="table-wrap"><table class="fortnight-table"><thead><tr><th>✓</th><th>Produktas / poreikis</th><th>Tiekėjas ir nuorodos</th><th>Pakuotės</th><th>Kaina*</th></tr></thead><tbody>'+rows+'</tbody></table></div></article>';
  }
  function copyText(plan){
    const lines=['PIRKINIŲ PLANAS 7 DIENOMS: '+plan.weekStart+' – '+plan.lastDay,
      '14 valgių. Faktinė pasirinkta atsiskaitymo vieta: '+(plan.suppliers.join(', ')||'nėra')+'. Maks. '+plan.maxStores+'.',
      'Neįtraukti pasenusių kainų ir nepatvirtintų pristatymo mokesčių.',''];
    for(const group of plan.groups){
      lines.push(group.name.toUpperCase());
      for(const line of group.lines){
        lines.push('☐ '+line.name+' – '+line.grams+' g'
          +(line.packs==null?' · PAKUOTĖ NEPATVIRTINTA':' · '+line.packs+' × '+line.packGrams+' g')
          +' · '+(line.cost==null?'KAINA NEPATVIRTINTA':eur(line.cost)+' (patikrinta)')
          +' · '+(line.selected?'Pasirinkta: '+line.selected.storeName+' – '+line.selected.url:'TIEKĖJAS NEPASIRINKTAS'));
        for(const f of farmerProductLinks(line.sourcing)){
          if(f.url===line.selected?.url)continue;
          lines.push('    '+(f.kind==='farmer_product_candidate'?'Ūkio kandidatas, atitiktis nepatvirtinta':'Ūkininko prekė')+': '+f.url);
        }
        if(line.sourcing?.farmlio?.url&&line.sourcing.farmlio.url!==line.selected?.url)
          lines.push('    Farmlio: '+line.sourcing.farmlio.url+' (kaina / likutis nepatvirtinti)');
        if(line.sourcing?.barbora?.url&&line.sourcing.barbora.url!==line.selected?.url)
          lines.push('    BARBORA ATSARGINIS VARIANTAS: '+line.sourcing.barbora.name+' – '+line.sourcing.barbora.url+' (alternatyva, neįskaičiuota)');
      }
      lines.push('');
    }
    lines.push('Patikrintų pasirinktų prekių dalinė suma (be pristatymo): '
      +(plan.pricedCount?eur(plan.partialGoodsEstimateEur):'nėra patikrintų kainų'));
    lines.push('Savaitės biudžetas '+eur(plan.budgetTargetEur)+'; tolerancija iki '+eur(plan.budgetToleranceEur)+'.');
    if(plan.grandTotalEur!==null)
      lines.push('Patikrinta visų prekių ir pristatymo suma: '+eur(plan.grandTotalEur));
    else lines.push('Visa savaitės suma su pristatymu NEPATVIRTINTA.');
    lines.push('Tai nėra pateiktas užsakymas.');
    return lines.join('\n');
  }
  function render(plan){
    active=plan;
    const target=document.getElementById('weekly-output');
    if(!target)return;
    const notice=plan.tooManyStores?'Pasirinkta daugiau kaip '+plan.maxStores+' parduotuvės.'
      :plan.missing.length?'Parink tiekėją kiekvienai prekei. Atskiri alternatyvūs pasiūlymai savaime nėra pasirinkti.'
      :plan.unknownPrice.length?'Trūksta patvirtintų prekių kainų ar pakuočių. Istorinės kainos į sumą neįtrauktos.'
      :plan.grandTotalEur===null?'Trūksta patvirtintų pristatymo / pakavimo išlaidų ir minimalių užsakymų.':
       'Patikrink prekės prieinamumą ir atsiskaitymo informaciją tiesiogiai parduotuvėje.';
    const price=plan.grandTotalEur!==null?eur(plan.grandTotalEur)
      :plan.pricedCount?eur(plan.partialGoodsEstimateEur):'—';
    target.innerHTML='<div class="fortnight-overview">'
      +'<div class="fortnight-metric"><small>Pasirinkta savaitė</small><strong>'+esc(plan.weekStart)+' – '+esc(plan.lastDay)+'</strong><small>14 valgių · 7 dienos</small></div>'
      +'<div class="fortnight-metric"><small>Tiekėjų pasirinkimas</small><strong>'+num(plan.suppliers.length)+' / '+num(plan.maxStores)+'</strong>'
      +'<small>Patikrintos kainos: '+num(plan.pricedCount)+' / '+num(plan.items.length)+' produktų</small></div>'
      +'<div class="fortnight-metric"><small>'+(plan.grandTotalEur===null?'Dalinė patikrintų prekių suma*':'Patikrinta bendra suma*')+'</small>'
      +'<strong>'+price+'</strong><small>Biudžetas '+eur(plan.budgetTargetEur)+' (iki '+eur(plan.budgetToleranceEur)+')</small></div>'
      +'</div><div class="fortnight-notice" role="status" id="weekly-choice-warning">'
      +'<b>'+(plan.grandTotalEur===null?'Užsakymas dar neparuoštas.':'Krepšelis suskaičiuotas, bet neužsakytas.')+'</b> '+esc(notice)+'</div>'
      +'<div class="fortnight-toolbar"><p id="weekly-count">Pažymėta: '+plan.items.filter(checked).length+'/'+plan.items.length+'</p>'
      +'<div class="weekly-actions"><button type="button" id="weekly-copy" class="btn">⧉ Kopijuoti sąrašą</button>'
      +'<button type="button" id="weekly-clear" class="btn ghost">Atžymėti</button></div></div>'
      +plan.groups.map(groupHtml).join('')
      +'<div class="fortnight-summary"><b>Suvestinė:</b> '
      +(plan.grandTotalEur===null?'Galutinė savaitės krepšelio suma su pristatymu nepatvirtinta.':'Patikrinta bendra suma su pristatymu: '+eur(plan.grandTotalEur)+'.')
      +'<br>Pasirinktos parduotuvės: '+esc(plan.suppliers.join(', ')||'kol kas nėra')+' (maks. '+plan.maxStores+').'
      +'<br>* Neįskaičiuotos nepatvirtintos ir istorinės kainos. Nepatvirtintos prekės nėra laikomos nupirktomis. Kiekvieną nuorodą patikrink prieš pirkdamas.</div>';
    if(target.dataset.weeklyBound==='yes')return;
    target.addEventListener('change',event=>{
      if(!active)return;
      if(event.target.classList?.contains('weekly-source')){
        const id=event.target.dataset.id;
        if(!choose(active,id,event.target.value)){
          render(active);
          document.getElementById('weekly-choice-warning').textContent='Negalima pasirinkti trečios parduotuvės. Iš pradžių pakeisk kitų prekių tiekėjus (maks. 2 per savaitę).';
          return;
        }
        render(active);
        return;
      }
      if(!event.target.classList?.contains('fortnight-check'))return;
      const line=active.items.find(x=>x.group===event.target.dataset.group&&x.id===event.target.dataset.id);
      if(!line)return;
      try{localStorage.setItem(key(line),event.target.checked?'1':'0');}catch{}
      event.target.closest('tr')?.classList.toggle('is-complete',event.target.checked);
      document.getElementById('weekly-count').textContent='Pažymėta: '+active.items.filter(checked).length+'/'+active.items.length;
    });
    target.addEventListener('click',event=>{
      if(!active)return;
      if(event.target.id==='weekly-clear'){
        for(const line of active.items)try{localStorage.removeItem(key(line));}catch{}
        render(active);
        return;
      }
      if(event.target.id!=='weekly-copy')return;
      const output=copyText(active);
      if(navigator.clipboard&&location.protocol==='https:'){
        navigator.clipboard.writeText(output).then(()=>alert('7 dienų sąrašas nukopijuotas!'))
          .catch(()=>prompt('Nukopijuok sąrašą:',output));
      }else prompt('Nukopijuok sąrašą:',output);
    });
    target.dataset.weeklyBound='yes';
  }
  root.WeeklyShop={build,render,copyText,demand,farmerProductLinks,choose};
})(window);
