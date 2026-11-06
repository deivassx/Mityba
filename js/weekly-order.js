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

  function build(menu,sources={products:{}},rules={}){
    const needed=demand(menu);
    const policy=rules.shopping||{},bulk=policy.bulkPurchase||{},budget=policy.budget||{};
    if(bulk.planningHorizonDays!=null&&bulk.planningHorizonDays!==7)throw Error('Užsakymo taisyklės turi numatyti 7 dienas.');
    const start=menu.meta?.weekStart, startTime=Date.parse(start+'T00:00:00Z');
    if(!Number.isFinite(startTime)||menu.days[0]?.date!==start)throw Error('Neteisinga pirmoji savaitės diena.');
    for(let i=0;i<7;i++){
      const expected=new Date(startTime+i*86400000).toISOString().slice(0,10);
      if(menu.days[i].date!==expected)throw Error('Savaitės dienos turi eiti iš eilės.');
    }
    const maxStores=Math.min(policy.maxStoresPerWeek??2,bulk.maxDistinctCheckoutStoresAcrossHorizon??2);
    const budgetTargetEur=budget.targetWeeklyTotalEur??100;
    const budgetToleranceEur=budget.softLimitEur??110;
    const maxAge=(policy.verifiedPriceMaxAgeHours??24)*3600000;
    const groups=[
      {id:'baltymai',name:'Mėsa ir žuvis · 7 dienoms',description:'Kiekiai apskaičiuoti tik pasirinktai savaitei. Pirk pagal patvirtintus SKU ir pakuotes.',lines:[]},
      {id:'priedai',name:'Daržovės, pieno produktai ir priedai · 7 dienoms',description:'Švieži produktai perkami tik pasirinktai savaitei.',lines:[]}
    ];
    for(const id of Object.keys(needed).sort((a,b)=>a.localeCompare(b))){
      const product=menu.products.find(p=>p.id===id)||null;
      const grams=needed[id],packs=product?.packGrams>0?Math.ceil(grams/product.packGrams):null;
      const verified=product&&Number.isFinite(product.priceEur)&&product.priceEur>0
        &&product.available!==false&&product.verification?.url===product.url
        &&Number.isFinite(Date.parse(product.verification.checkedAt))
        &&Date.now()-Date.parse(product.verification.checkedAt)>=-60000
        &&Date.now()-Date.parse(product.verification.checkedAt)<=maxAge;
      const group=PROTEINS.has(id)?groups[0]:groups[1];
      group.lines.push({
        id,group:group.id,name:menu.ingredientLabels[id]||id,grams,
        productName:product?.name||null,store:product?.store||null,
        url:product?url(product.url):null,packGrams:product?.packGrams||null,packs,
        cost:verified&&packs?round(product.priceEur*packs):null,
        priceFresh:!!verified,unavailable:!product,needsReview:!verified,
        sourcing:PROTEINS.has(id)?(sources.products?.[id]||null):null
      });
    }
    const items=groups.flatMap(g=>g.lines);
    const suppliers=[...new Set(items.map(x=>x.store).filter(Boolean))];
    const missing=items.filter(x=>x.unavailable);
    const unknownPrice=items.filter(x=>x.cost===null);
    const partialGoodsEstimateEur=round(items.filter(x=>x.cost!==null).reduce((s,x)=>s+x.cost,0));
    const incomplete=unknownPrice.length>0||menu.meta.purchaseReady!==true;
    return {
      weekStart:start,lastDay:menu.days.at(-1).date,days:7,meals:14,
      groups,items,suppliers,missing,unknownPrice,partialGoodsEstimateEur,
      maxStores,tooManyStores:suppliers.length>maxStores,incomplete,
      budgetTargetEur,budgetToleranceEur,priceIncludesDelivery:false,
      orderReady:false // Pristatymas ir faktinis atsiskaitymas tikrinami pardavėjo krepšelyje.
    };
  }

  let active=null;
  const key=line=>'mityba-7dienu-'+active.weekStart+'-'+line.group+'-'+line.id;
  const checked=line=>{try{return localStorage.getItem(key(line))==='1';}catch{return false;}};
  function linksFor(line){
    const links=[];
    if(line.url)links.push('<a href="'+esc(line.url)+'" target="_blank" rel="noopener noreferrer">Katalogo prekė ↗</a>');
    const farm=farmerProductLinks(line.sourcing);
    for(const offer of farm){
      const href=url(offer.url);
      if(href===line.url)continue;
      const channel=offer.kind==='farmer_product'?'Ūkio prekė'
        :offer.kind==='farmer_product_candidate'?'Ūkio kandidatas (patikrinti mėsos dalį)'
        :offer.kind==='producer_product_reseller'?'Ūkio prekė per pardavėją':'Pardavėjo prekė';
      links.push('<span class="fortnight-farm-product"><a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'
        +esc(channel+': '+offer.name)+' ↗</a><small>Nuoroda negarantuoja kainos, likučio ar pristatymo.</small></span>');
    }
    if(line.group==='baltymai'&&line.sourcing&&!farm.some(p=>p.kind==='farmer_product'||p.kind==='producer_product_reseller')){
      links.push('<small class="fortnight-farm-missing">Tikslios ūkininko prekės atitiktis nepatvirtinta.</small>');
    }
    const farmlio=line.sourcing?.farmlio;
    if(farmlio?.url&&url(farmlio.url)&&farmlio.url!==line.url)
      links.push('<a href="'+esc(url(farmlio.url))+'" target="_blank" rel="noopener noreferrer">'
        +(farmlio.kind==='catalog_search'?'Farmlio katalogas ↗':'Farmlio prekė ↗')+'</a>');
    const barbora=line.needsReview&&line.sourcing?.barbora;
    if(barbora?.url&&url(barbora.url)&&barbora.url!==line.url){
      const label=barbora.kind==='exact_sku'?'Barbora – prekė ↗'
        :barbora.kind==='similar_sku'?'Barbora – panaši prekė ↗':'Barbora – paieška ↗';
      links.push('<span class="fortnight-fallback"><a href="'+esc(url(barbora.url))+'" target="_blank" rel="noopener noreferrer">'
        +label+'</a><small>Atsarginė nuoroda – neįtraukta į pirkinių kainą ar parduotuvių skaičių.</small></span>');
    }
    return links.length?'<div class="fortnight-links">'+links.join('')+'</div>':'Dar reikia rasti SKU';
  }
  function groupHtml(group){
    const rows=group.lines.map(line=>{
      const done=checked(line);
      const state=line.unavailable?'SKU ir pakuotė nepatvirtinti'
        :line.priceFresh?'Kaina patikrinta – pakartok prieš pirkdamas':'Kaina nepatvirtinta';
      const packs=line.packs==null?'Pakuotė nepatvirtinta':num(line.packs)+' × '+num(line.packGrams)+' g';
      return '<tr class="'+(done?'is-complete':'')+'"><td><input type="checkbox" class="fortnight-check" '
        +'data-group="'+esc(line.group)+'" data-id="'+esc(line.id)+'" aria-label="Įsigyta: '+esc(line.name)+'" '+(done?'checked':'')+'></td>'
        +'<td><div class="product-name">'+esc(line.name)+'</div><div class="product-sub">Reikia '+num(line.grams)+' g</div>'
        +'<span class="fortnight-pill">'+esc(state)+'</span></td>'
        +'<td>'+packs+'</td><td><strong>'+(line.cost==null?'—':eur(line.cost))+'</strong></td><td>'+linksFor(line)+'</td></tr>';
    }).join('');
    return '<article class="card fortnight-group"><h3>'+esc(group.name)+'</h3><p>'+esc(group.description)+'</p>'
      +'<div class="table-wrap"><table class="fortnight-table"><thead><tr><th>✓</th><th>Produktas ir poreikis</th><th>Pakuotės</th><th>Suma*</th><th>Nuorodos</th></tr></thead>'
      +'<tbody>'+rows+'</tbody></table></div></article>';
  }
  function copyText(plan){
    const lines=['PIRKINIŲ PLANAS 7 DIENOMS: '+plan.weekStart+' – '+plan.lastDay,
      'Visos prekės apskaičiuotos tik pasirinktai savaitei, 14 valgių.',
      'Ne daugiau kaip '+plan.maxStores+' faktinės atsiskaitymo vietos. Kainą ir pristatymą patikrinti.',''];
    for(const group of plan.groups){
      lines.push(group.name.toUpperCase());
      for(const p of group.lines){
        lines.push('☐ '+p.name+' – '+p.grams+' g'
          +(p.packs!==null?' · '+p.packs+' × '+p.packGrams+' g':' · pakuotė nepatvirtinta')
          +' · '+(p.cost===null?'KAINA NEPATVIRTINTA':eur(p.cost)+' (tikrinta neseniai)')
          +(p.url?' · katalogas: '+p.url:''));
        for(const f of farmerProductLinks(p.sourcing)){
          lines.push('    '+(f.kind==='farmer_product_candidate'?'Ūkio kandidatas, atitiktis nepatvirtinta':'Ūkininko SKU')
            +': '+f.name+' – '+f.url);
        }
        if(p.sourcing?.farmlio?.url)lines.push('    Farmlio: '+p.sourcing.farmlio.url+' (kaina / likutis nepatvirtinti)');
        if(p.needsReview&&p.sourcing?.barbora?.url)lines.push('    BARBORA ATSARGINIS VARIANTAS: '+p.sourcing.barbora.name+' – '+p.sourcing.barbora.url+' (nepasirinkta, kaina nepatvirtinta)');
      }
      lines.push('');
    }
    lines.push('Tik patikrintų kainų dalinė prekių suma, be pristatymo: '+(plan.unknownPrice.length===plan.items.length?'nėra':eur(plan.partialGoodsEstimateEur)));
    lines.push('Savaitės biudžetas: '+eur(plan.budgetTargetEur)+' (tolerancija iki '+eur(plan.budgetToleranceEur)+').');
    lines.push('Pilna kaina ir galutiniai 1–2 tiekėjai NEPATVIRTINTI. Tai nėra pateiktas užsakymas.');
    return lines.join('\n');
  }
  function render(plan){
    active=plan;
    const target=document.getElementById('weekly-output');
    if(!target)return;
    const message=plan.tooManyStores
      ?'Dėmesio: katalogo prekės dabar priklauso '+plan.suppliers.length+' parduotuvėms. Prieš perkant sumažink iki '+plan.maxStores+'.'
      :plan.incomplete?'Dar nepatvirtintos visų prekių kainos arba tiekimas. Nuorodos į ūkius ir Barbora nėra automatinis prekių pasirinkimas.'
      :'Patikrink galutinį atsiskaitymą, pristatymą ir pakuotes.';
    target.innerHTML='<div class="fortnight-overview">'
      +'<div class="fortnight-metric"><small>Pasirinkta savaitė</small><strong>'+esc(plan.weekStart)+' – '+esc(plan.lastDay)+'</strong><small>14 valgių · 7 dienos</small></div>'
      +'<div class="fortnight-metric"><small>Patikrintų prekių suma*</small><strong>'
      +(plan.items.every(x=>x.cost===null)?'—':eur(plan.partialGoodsEstimateEur))+'</strong><small>Be nepatvirtintų prekių ir pristatymo</small></div>'
      +'<div class="fortnight-metric"><small>Biudžetas savaitei</small><strong>'+eur(plan.budgetTargetEur)
      +' <small>(iki '+eur(plan.budgetToleranceEur)+')</small></strong><small>Galutinė suma nepatvirtinta</small></div>'
      +'</div><div class="fortnight-notice" role="status"><b>Užsakymas dar neparuoštas.</b> '+esc(message)+'</div>'
      +'<div class="fortnight-toolbar"><p id="weekly-count">Pažymėta: '+plan.items.filter(checked).length+'/'+plan.items.length+'</p>'
      +'<button type="button" id="weekly-copy" class="btn">⧉ Kopijuoti 7 dienų pirkinių sąrašą</button></div>'
      +plan.groups.map(groupHtml).join('')
      +'<div class="fortnight-summary"><b>Dar trūksta:</b> '+(plan.missing.length?esc(plan.missing.map(p=>p.name).join(', ')):'Ne visos kainos, likučiai ir pristatymas patvirtinti.')
      +'<br>Žinomos parduotuvės: '+esc(plan.suppliers.join(', ')||'nėra')+' (maks. '+plan.maxStores+' per savaitę).'
      +'<br>* Suma skaičiuojama iš patvirtintų prekių vienos savaitės pakuočių be pristatymo; ji nėra galutinė užsakymo suma.</div>';
    if(target.dataset.weeklyBound==='yes')return;
    target.addEventListener('change',event=>{
      if(!event.target.classList?.contains('fortnight-check')||!active)return;
      const line=active.items.find(x=>x.group===event.target.dataset.group&&x.id===event.target.dataset.id);
      if(!line)return;
      try{localStorage.setItem(key(line),event.target.checked?'1':'0');}catch{}
      event.target.closest('tr')?.classList.toggle('is-complete',event.target.checked);
      document.getElementById('weekly-count').textContent='Pažymėta: '+active.items.filter(checked).length+'/'+active.items.length;
    });
    target.addEventListener('click',event=>{
      if(event.target.id!=='weekly-copy'||!active)return;
      const output=copyText(active);
      if(navigator.clipboard&&location.protocol==='https:'){
        navigator.clipboard.writeText(output).then(()=>alert('7 dienų sąrašas nukopijuotas!')).catch(()=>prompt('Nukopijuok sąrašą:',output));
      } else prompt('Nukopijuok sąrašą:',output);
    });
    target.dataset.weeklyBound='yes';
  }
  root.WeeklyShop={build,render,copyText,demand,farmerProductLinks};
})(window);
