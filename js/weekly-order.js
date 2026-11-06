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


  // Šaltinių nuorodos informacinės, be rankinio tiekėjo pasirinkimo ir pirkimo patvirtinimo.
  function isRecent(checkedAt,maxAge){
    const timestamp=Date.parse(checkedAt);
    const age=Date.now()-timestamp;
    return Number.isFinite(timestamp)&&age>=-60000&&age<=maxAge;
  }
  const exactFarmlio=x=>['existing_catalog_sku','exact_sku'].includes(x?.kind)
    && /^https:\/\/farmlio\.lt\/pardavejai\/[^/]+\/prekes\/[^/?#]+\/?$/i.test(x?.url||'');
  function candidates(product,sourcing,stores,maxAge,targetWeekStart) {
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
      const promoExpired=!!farm.discountPriceValidUntil&&targetWeekStart>farm.discountPriceValidUntil;
      const observed=promoExpired&&Number.isFinite(farm.regularPriceObservedEurPerKg)
        ?farm.regularPriceObservedEurPerKg:farm.priceObservedEurPerKg;
      add({url:link,name:farm.name,store:hostname,storeName:farm.producer||hostname,
        packGrams: Number.isFinite(farm.packGrams)?farm.packGrams:null,
        priceEur:null,verified:false,kind:'farmer',
        historicalEurPerKg:Number.isFinite(observed)?observed:null,
        priceBasis:farm.soldByWeight===true?'variable_weight':'per_kg',
        promoExpired,observedOn:farm.priceSeenOn||null});
    }
    if(product?.url&&product?.store){
      const shop=stores.find(x=>x.id===product.store);
      const verified=Number.isFinite(product.priceEur)&&product.priceEur>0
        &&product.available!==false&&product.verification?.url===product.url
        &&isRecent(product.verification.checkedAt,maxAge);
      add({url:product.url,name:product.name||'Katalogo prekė',store:product.store,
        storeName:shop?.name||product.store,packGrams:product.packGrams||null,
        priceEur:verified?product.priceEur:null,verified:!!verified,kind:'catalog',
        historicalUnitPrice:!verified&&Number.isFinite(product.priceEur)?product.priceEur:null,
        observedOn:product.verification?.checkedAt||null});
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
        historicalEurPerKg:Number.isFinite(x.priceObservedEurPerKg)?x.priceObservedEurPerKg:null,
        observedOn:x.priceSeenOn||null});
    }
    return offers;
  }
  // Kaina yra informacinė: fiksuota pakuotė arba faktiniu svoriu parduodama prekė.
  function indicative(offer,grams){
    if(!offer)return null;
    if(offer.verified&&Number.isFinite(offer.priceEur)&&offer.priceEur>0&&offer.packGrams>0){
      return {amount:round(Math.ceil(grams/offer.packGrams)*offer.priceEur),
        unitPrice:offer.priceEur,unit:'pack',note:'Patikrinta konkretaus SKU pakuotės kaina',verified:true};
    }
    if(Number.isFinite(offer.historicalEurPerKg)&&offer.historicalEurPerKg>0){
      const gramsCharged=offer.priceBasis==='variable_weight'?grams
        :offer.packGrams>0?Math.ceil(grams/offer.packGrams)*offer.packGrams:grams;
      return {amount:round(gramsCharged/1000*offer.historicalEurPerKg),
        unitPrice:offer.historicalEurPerKg,unit:'kg',
        note:offer.promoExpired?'Įprasta kaina, matyta '+(offer.observedOn||'anksčiau')+'; akcija jau pasibaigusi':
          'Matyta '+(offer.observedOn||'anksčiau')+'; tik orientyras',
        verified:false};
    }
    if(Number.isFinite(offer.historicalUnitPrice)&&offer.historicalUnitPrice>0&&offer.packGrams>0){
      return {amount:round(Math.ceil(grams/offer.packGrams)*offer.historicalUnitPrice),
        unitPrice:offer.historicalUnitPrice,unit:'pack',
        note:'Ankstesnė katalogo kaina; patikrink prieš užsakymą',verified:false};
    }
    return null;
  }
  function evaluate(plan){
    for(const line of plan.items){
      const reference=line.choices.find(o=>o.kind==='farmer')
        ||line.choices.find(o=>o.kind==='catalog')
        ||line.choices.find(o=>o.kind==='farmlio')
        ||line.choices.find(o=>o.kind==='fallback')||null;
      line.reference=reference;
      line.selected=null;line.store=null;
      line.productName=reference?.name||null;
      line.url=reference?.url||null;
      line.packGrams=reference?.packGrams||null;
      line.packs=line.packGrams>0?Math.ceil(line.grams/line.packGrams):null;
      // Jei pagrindinio ūkininko kainos nėra, galima parodyti kito TIKSLAUS SKU
      // alternatyvos kainą, aiškiai atskiriant nuo pagrindinio produkto.
      line.priceOffer=line.choices.find(o=>o===reference&&indicative(o,line.grams))
        ||line.choices.find(o=>indicative(o,line.grams))||null;
      line.quote=indicative(line.priceOffer,line.grams);
      line.estimatedCost=line.quote?.amount??null;
      line.estimateFromAlternative=!!line.priceOffer&&line.priceOffer!==reference;
      line.cost=line.quote?.verified===true&&!line.estimateFromAlternative?line.quote.amount:null;
      line.priceFresh=line.quote?.verified===true;
      line.needsReview=line.cost===null;
    }
    plan.suppliers=[];plan.tooManyStores=false;
    plan.missing=plan.items.filter(p=>!p.reference);
    plan.unknownPrice=plan.items.filter(p=>p.quote===null);
    const estimates=plan.items.filter(p=>p.estimatedCost!==null);
    plan.estimatedGoodsEur=round(estimates.reduce((n,p)=>n+p.estimatedCost,0));
    plan.estimatedCount=estimates.length;
    const priced=plan.items.filter(p=>p.cost!==null);
    plan.partialGoodsEstimateEur=round(priced.reduce((n,p)=>n+p.cost,0));
    plan.pricedCount=priced.length;
    plan.linkedCount=plan.items.filter(p=>p.choices.length>0).length;
    plan.incomplete=true;plan.deliveryEstimateEur=null;plan.grandTotalEur=null;
    plan.priceIncludesDelivery=false;plan.orderReady=false;
    return plan;
  }
  function build(menu,sources={products:{}},rules={},catalog={}){
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
      const product=menu.products.find(p=>p.id===id)
        ||(catalog.products||[]).find(p=>p.id===id)||null;
      const sourcing=PROTEINS.has(id)?(sources.products?.[id]||null):null;
      const stores=[...(menu.stores||[]),...(catalog.stores||[]).filter(s=>!(menu.stores||[]).some(t=>t.id===s.id))];
      const choices=candidates(product,sourcing,stores,maxAge,start);
      const group=PROTEINS.has(id)?groups[0]:groups[1];
      group.lines.push({
        id,group:group.id,name:menu.ingredientLabels[id]||id,grams:needed[id],choices,
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
    if(line.cost!==null)return '<strong>'+eur(line.cost)+'</strong><small>Patikrinta šiam konkrečiam SKU</small>';
    const suggested=line.reference;
    const previous=suggested?.kind==='catalog'?suggested.historicalUnitPrice:null;
    if(Number.isFinite(previous)&&previous>0)
      return '<strong>—</strong><small>Istorinė: '+eur(previous)+'/pakuotę; neįskaičiuota.</small>';
    if(Number.isFinite(suggested?.historicalEurPerKg)&&suggested.historicalEurPerKg>0)
      return '<strong>—</strong><small>Anksčiau matyta: '+eur(suggested.historicalEurPerKg)+'/kg'
       +(suggested.observedOn?' ('+esc(suggested.observedOn)+')':'')+'. Neįskaičiuota.</small>';
    return '<strong>—</strong><small>Kaina nepatvirtinta</small>';
  }
  function groupHtml(group){
    const rows=group.lines.map(line=>{
      const done=checked(line),suggested=line.reference;
      const status=!suggested?'Nėra konkrečios prekės nuorodos'
        :line.packGrams==null?'Pakuotė / kaina nepatvirtinta'
        :line.priceFresh?'Kaina patikrinta':'Reikia patikrinti kainą';
      const packs=line.packs==null?'Pakuotė nepatvirtinta':num(line.packs)+' × '+num(line.packGrams)+' g';
      return '<tr class="'+(done?'is-complete':'')+'"><td><input type="checkbox" class="fortnight-check" '
        +'data-group="'+esc(line.group)+'" data-id="'+esc(line.id)+'" aria-label="Įsigyta: '+esc(line.name)+'" '+(done?'checked':'')+'></td>'
        +'<td><div class="product-name">'+esc(line.name)+'</div><div class="product-sub">Reikia '+num(line.grams)+' g</div>'
        +'<span class="fortnight-pill">'+esc(status)+'</span></td>'
        +'<td>'+linksFor(line)+'</td>'
        +'<td>'+packs+'</td><td class="weekly-cost">'+priceHtml(line)+'</td></tr>';
    }).join('');
    return '<article class="card fortnight-group"><h3>'+esc(group.name)+'</h3><p>'+esc(group.description)+'</p>'
      +'<div class="table-wrap"><table class="fortnight-table"><thead><tr><th>✓</th><th>Produktas / poreikis</th><th>Prekių nuorodos</th><th>Pakuotės</th><th>Kaina*</th></tr></thead><tbody>'+rows+'</tbody></table></div></article>';
  }
  function copyText(plan){
    const lines=['PIRKINIŲ PLANAS 7 DIENOMS: '+plan.weekStart+' – '+plan.lastDay,
      '14 valgių. Šaltinių nuorodos yra informacinės, daugiausia 2 atsiskaitymo parduotuvės visam krepšeliui.',
      'Prekių kainos, pristatymas ir pakuotės nepatvirtinti, kol nėra atnaujintos patikros.',''];
    for(const group of plan.groups){
      lines.push(group.name.toUpperCase());
      for(const line of group.lines){
        lines.push('☐ '+line.name+' – '+line.grams+' g'
          +(line.packs===null?' · PAKUOTĖ NEPATVIRTINTA':' · '+line.packs+' × '+line.packGrams+' g')
          +' · '+(line.cost===null?'KAINA NEPATVIRTINTA':eur(line.cost)+' (patikrinta)'));
        for(const offer of farmerProductLinks(line.sourcing))
          lines.push('    '+(offer.kind==='farmer_product_candidate'?'Ūkio kandidatas, atitiktis nepatvirtinta':'Ūkio produkto nuoroda')+': '+offer.url);
        for(const choice of line.choices){
          if(farmerProductLinks(line.sourcing).some(x=>x.url===choice.url))continue;
          lines.push('    '+choice.storeName+': '+choice.url+' (patikrink kainą ir likutį)');
        }
        const farmlio=line.sourcing?.farmlio;
        if(farmlio?.kind==='catalog_search'&&farmlio.url)
          lines.push('    Farmlio katalogas (ne konkretus SKU): '+farmlio.url);
        const bar=line.sourcing?.barbora;
        if(bar?.kind!=='exact_sku'&&bar?.url)
          lines.push('    BARBORA ATSARGINIS VARIANTAS (nepatvirtinta atitiktis): '+bar.name+' – '+bar.url);
      }
      lines.push('');
    }
    lines.push('Patikrintų prekių dalinė suma be pristatymo: '
      +(plan.pricedCount?eur(plan.partialGoodsEstimateEur):'nėra patikrintų kainų'));
    lines.push('Savaitės biudžetas '+eur(plan.budgetTargetEur)+'; tolerancija iki '+eur(plan.budgetToleranceEur)+'.');
    lines.push('Visa savaitės suma su pristatymu NEPATVIRTINTA. Tai nėra pateiktas užsakymas.');
    return lines.join('\n');
  }
  function render(plan){
    active=plan;
    const target=document.getElementById('weekly-output');
    if(!target)return;
    const notice=plan.missing.length?'Kai kuriems ingredientams dar nerasta tinkamo konkretaus SKU.'
      :plan.unknownPrice.length?'Trūksta atnaujintų kainų arba pakuočių duomenų. Ankstesnės kainos į sumą neįtrauktos.'
      :'Kainos yra iš patikrintų SKU, bet pristatymas, pakavimas ir visas galutinis krepšelis dar nepatvirtinti.';
    const partial=plan.pricedCount?eur(plan.partialGoodsEstimateEur):'—';
    target.innerHTML='<div class="fortnight-overview">'
      +'<div class="fortnight-metric"><small>Pasirinkta savaitė</small><strong>'+esc(plan.weekStart)+' – '+esc(plan.lastDay)+'</strong><small>14 valgių · 7 dienos</small></div>'
      +'<div class="fortnight-metric"><small>Prekių nuorodos</small><strong>'+num(plan.linkedCount)+' / '+num(plan.items.length)+'</strong>'
      +'<small>Patikrintos kainos: '+num(plan.pricedCount)+' / '+num(plan.items.length)+' produktų</small></div>'
      +'<div class="fortnight-metric"><small>Dalinė patikrintų prekių suma*</small><strong>'+partial+'</strong>'
      +'<small>Biudžetas '+eur(plan.budgetTargetEur)+' (iki '+eur(plan.budgetToleranceEur)+')</small></div></div>'
      +'<div class="fortnight-notice" role="status"><b>Užsakymas dar neparuoštas.</b> '+esc(notice)+'</div>'
      +'<div class="fortnight-toolbar"><p id="weekly-count">Pažymėta: '+plan.items.filter(checked).length+'/'+plan.items.length+'</p>'
      +'<div class="weekly-actions"><button type="button" id="weekly-copy" class="btn">⧉ Kopijuoti sąrašą</button>'
      +'<button type="button" id="weekly-clear" class="btn ghost">Atžymėti</button></div></div>'
      +plan.groups.map(groupHtml).join('')
      +'<div class="fortnight-summary"><b>Suvestinė:</b> Galutinė savaitės krepšelio suma su pristatymu nepatvirtinta.'
      +'<br>Prekių nuorodos rodomos pirmiausia iš ūkininkų, tada „Farmlio“ ir „Barbora“. Jos nėra pasirinktos atsiskaitymo parduotuvės.'
      +'<br>Galutinį krepšelį sudaryk ne daugiau kaip iš '+num(plan.maxStores)+' parduotuvių.'
      +'<br>* Senos ir nepatikrintos kainos neįskaičiuotos. Nuorodos nieko neužsako.</div>';
    if(target.dataset.weeklyBound==='yes')return;
    target.addEventListener('change',event=>{
      if(!active||!event.target.classList?.contains('fortnight-check'))return;
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
  root.WeeklyShop={build,render,copyText,demand,farmerProductLinks};
})(window);
