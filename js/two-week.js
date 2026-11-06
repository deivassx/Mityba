/* 14 dienų pirkinių planavimas: nepasirenkami nepatikrinti tiekėjai,
   neįdedama į išorinį krepšelį ir nėra mokamų API. */
(function(root) {
  'use strict';
  const PROTEINS = new Set(['turkey','chicken','beef','beef_steak','beef_strips','beef_roast','catfish','lamb','salmon','cod','pork_tenderloin']);
  const round = n => Math.round((n+Number.EPSILON)*100)/100;
  const num = n => new Intl.NumberFormat('lt-LT').format(n);
  const eur = n => new Intl.NumberFormat('lt-LT',{style:'currency',currency:'EUR'}).format(n);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function link(url) {
    try { const p=new URL(url);return p.protocol==='https:'?p.href:null; }
    catch{return null;}
  }
  // Ūkininko nuoroda turi vesti į konkretų SKU – jokių pradinių puslapių ar kategorijų.
  const FARM_PRODUCT_TYPES=new Set(['farmer_product','producer_product_reseller','retailer_product']);
  function farmerProductLinks(sourcing) {
    return (sourcing?.farmers||[]).filter(p=>{
      const href=link(p.url);
      if(!FARM_PRODUCT_TYPES.has(p.kind)||!href||!p.name)return false;
      return /^\/(produktas|product|preke)\/[^/?#]+\/?$/i.test(new URL(href).pathname);
    });
  }
  function demand(menu) {
    if(!menu || menu.days?.length!==7)throw Error('14 dienų užsakymui būtinos dvi pilnos 7 dienų savaitės.');
    const recipes=new Map(menu.recipes.map(r=>[r.id,r]));
    const needed={};
    for(const day of menu.days)for(const id of [day.lunch,day.dinner]){
      const recipe=recipes.get(id);
      if(!recipe)throw Error('Nėra recepto: '+id);
      for(const [ingredient,g] of Object.entries(recipe.ingredients)){
        if(!Number.isFinite(g)||g<=0)throw Error('Blogas kiekis: '+ingredient);
        needed[ingredient]=(needed[ingredient]||0)+g;
      }
    }
    return needed;
  }
  const productKey=p=>p && [p.store,p.url,p.packGrams].join('|');
  function build(first,second,sources={products:{}}) {
    const start=new Date(first?.meta?.weekStart+'T00:00:00Z').getTime();
    const next=new Date(second?.meta?.weekStart+'T00:00:00Z').getTime();
    if(!Number.isFinite(start)||!Number.isFinite(next)||next-start!==7*86400000)throw Error('Pasirinktos savaitės turi eiti iš eilės.');
    const menus=[first,second],needs=menus.map(demand);
    const labels={...first.ingredientLabels,...second.ingredientLabels};
    const groups=[
      {id:'baltymai',name:'Mėsa ir žuvis • vienas užsakymas 14 dienų',description:'Užsakyk iš patikrintų ūkių, iškart padalink į porcijas ir užšaldyk.',lines:[]},
      {id:'savaite-1',name:'Šviežios prekės • 1 savaitė',description:first.meta.weekStart+' – '+first.days.at(-1).date+' · geriau pirkti prieš gaminimą',lines:[]},
      {id:'savaite-2',name:'Šviežios prekės • 2 savaitė',description:second.meta.weekStart+' – '+second.days.at(-1).date+' · užsakyk atskirai, kad išliktų šviežios',lines:[]}
    ];
    function makeLine(id,quantities,group,weekRefs) {
      const grams=quantities.reduce((sum,g)=>sum+g,0);
      const offers=weekRefs.filter(i=>needs[i][id]>0).map(i=>menus[i].products.find(p=>p.id===id)).filter(Boolean);
      const missingOffer=weekRefs.some(i=>needs[i][id]>0&&!menus[i].products.some(p=>p.id===id));
      const conflicts=new Set(offers.map(productKey)).size>1;
      const product=!missingOffer&&!conflicts&&offers[0]?offers[0]:null;
      const packs=product?.packGrams>0?Math.ceil(grams/product.packGrams):null;
      const unitPrice=product?.priceEur;
      const catalogPrice=Number.isFinite(unitPrice)&&unitPrice>0;
      const checked=offers.every(p=>p.verification?.url===p.url && Number.isFinite(Date.parse(p.verification?.checkedAt)) && (Date.now()-Date.parse(p.verification.checkedAt))>=0 && Date.now()-Date.parse(p.verification.checkedAt)<=24*3600*1000);
      const priceFresh=!!(product&&catalogPrice&&checked);
      const cost=catalogPrice&&packs?round(unitPrice*packs):null;
      return {
        id,group,grams,weekQuantities:quantities, name:labels[id]||id,
        productName:product?.name||null,store:product?.store||null,
        url:product?link(product.url):null,packGrams:product?.packGrams||null,packs,
        cost,priceFresh,missingOffer,conflictingOffers:conflicts,
        unavailable:!product,needsReview:!product || !priceFresh,
        sourcing:PROTEINS.has(id)?(sources.products?.[id]||null):null
      };
    }
    const proteins=[...new Set(Object.keys(needs[0]).concat(Object.keys(needs[1])))]
      .filter(id=>PROTEINS.has(id)).sort((a,b)=>a.localeCompare(b));
    for(const id of proteins)groups[0].lines.push(makeLine(id,[needs[0][id]||0,needs[1][id]||0],groups[0].id,[0,1]));
    for(let i=0;i<2;i++)for(const id of Object.keys(needs[i]).filter(id=>!PROTEINS.has(id)).sort((a,b)=>a.localeCompare(b))){
      groups[i+1].lines.push(makeLine(id,[needs[i][id]],groups[i+1].id,[i]));
    }
    const items=groups.flatMap(g=>g.lines);
    const suppliers=[...new Set(items.map(x=>x.store).filter(Boolean))];
    const incomplete=items.some(x=>x.needsReview)||menus.some(m=>m.meta.purchaseReady!==true);
    const subtotal=round(items.filter(x=>x.cost!==null).reduce((sum,x)=>sum+x.cost,0));
    const missing=items.filter(x=>x.unavailable);
    const unknownPrice=items.filter(x=>x.cost===null);
    const maxStores=2;
    return {
      firstWeek:first.meta.weekStart,secondWeek:second.meta.weekStart,
      lastDay:second.days.at(-1).date,groups,items,suppliers,
      maxStores,tooManyStores:suppliers.length>maxStores,
      incomplete,missing,unknownPrice,partialGoodsEstimateEur:subtotal,
      budgetTargetEur:200,budgetToleranceEur:220,
      // Delivery for a combined meat order and two separate fresh orders is not known.
      priceIncludesDelivery:false,
      orderReady:!incomplete&&suppliers.length<=maxStores&&false
    };
  }
  let active=null;
  function checkedKey(line) { return 'mityba-14dienu-'+active.firstWeek+'-'+line.group+'-'+line.id; }
  function checked(line) {try{return localStorage.getItem(checkedKey(line))==='1';}catch{return false;}}
  function groupedHtml(g){
    const rows=g.lines.map(line=>{
      const done=checked(line);
      const itemId=escapeHtml(line.id),groupId=escapeHtml(line.group);
      const size=line.packs!==null
        ?num(line.packs)+' × '+num(line.packGrams)+' g'
        :'Pakuotė nežinoma';
      const description=(line.group==='baltymai'
        ?'I sav. '+num(line.weekQuantities[0])+' g · II sav. '+num(line.weekQuantities[1])+' g'
        :'Reikia '+num(line.grams)+' g');
      const status=line.unavailable
        ?'<span class="fortnight-pill">Kaina ir ūkio prekė nepatvirtinta</span>'
        :line.cost===null?'<span class="fortnight-pill">Kaina nežinoma</span>'
        :line.priceFresh?'<small>Patikrinta neseniai – pakartok prieš pirkdamas</small>'
        :'<span class="fortnight-pill">Sena katalogo kaina</span>';
      const product=escapeHtml(line.name);
      const price=line.cost===null?'—':eur(line.cost)+(line.priceFresh?'':'*');
      const links=[];
      if(line.url)links.push('<a href="'+escapeHtml(line.url)+'" target="_blank" rel="noopener noreferrer">Katalogo prekė ↗</a>');
      if(line.sourcing?.farmlio?.url && link(line.sourcing.farmlio.url) && line.sourcing.farmlio.url!==line.url){
        links.push('<a href="'+escapeHtml(link(line.sourcing.farmlio.url))+'" target="_blank" rel="noopener noreferrer">Farmlio ↗</a>');
      }
      const productLinks=farmerProductLinks(line.sourcing);
      for(const offer of productLinks) {
        const href=link(offer.url);
        if(href===line.url)continue;
        const channel=offer.kind==='farmer_product'?'Ūkio prekė'
          :offer.kind==='producer_product_reseller'?'Ūkio prekė per pardavėją'
          :'Pardavėjo prekė';
        links.push('<span class="fortnight-farm-product"><a href="'+escapeHtml(href)+'" target="_blank" rel="noopener noreferrer">'
          +escapeHtml(channel+': '+offer.name)+' ↗</a>'
          +'<small>Konkretaus produkto nuoroda. Kainą ir prieinamumą patikrink.</small></span>');
      }
      if(line.group==='baltymai' && line.sourcing && !productLinks.some(p=>p.kind!=='retailer_product')) {
        links.push('<small class="fortnight-farm-missing">Tiesioginės ūkininko prekės nuorodos nerasta.</small>');
      }
      // Barbora yra tik atsarginis kanalas: rodome nuorodą,
      // bet neatliekame jokio automatinio trečios parduotuvės pasirinkimo.
      const barbora=line.needsReview&&line.sourcing?.barbora;
      const barboraUrl=barbora&&link(barbora.url);
      if(barboraUrl&&barboraUrl!==line.url){
        const reference=barbora.kind==='exact_sku'?'Barbora – prekė ↗'
          :barbora.kind==='similar_sku'?'Barbora – panaši prekė ↗':'Barbora – ieškoti ↗';
        const hint=Number.isFinite(barbora.priceObservedEurPerKg)&&barbora.priceSeenOn
          ?'<small>Matyta '+escapeHtml(eur(barbora.priceObservedEurPerKg))+'/kg ('+escapeHtml(barbora.priceSeenOn)+'), kainą patikrink</small>'
          :'<small>Alternatyvi nuoroda, kaina nepatvirtinta</small>';
        links.push('<span class="fortnight-fallback"><a href="'+escapeHtml(barboraUrl)+'" target="_blank" rel="noopener noreferrer">'+reference+'</a>'+hint+'</span>');
      }
      const url=links.length?'<div class="fortnight-links">'+links.join('')+'</div>':'Reikia patvirtinti';
      return '<tr class="'+(done?'is-complete':'')+'"><td><input type="checkbox" class="fortnight-check" aria-label="Įsigyta: '+product+'" data-group="'+groupId+'" data-id="'+itemId+'" '+(done?'checked':'')+'></td>'
       +'<td><div class="product-name">'+product+'</div><div class="product-sub">'+description+'</div>'+status+'</td>'
       +'<td>'+size+'</td><td><strong>'+price+'</strong></td><td>'+url+'</td></tr>';
    }).join('');
    return '<article class="card fortnight-group"><h3>'+escapeHtml(g.name)+'</h3><p>'+escapeHtml(g.description)+'</p>'
     +'<div class="table-wrap"><table class="fortnight-table"><thead><tr><th>✓</th><th>Produktas ir kiekis</th><th>Pakuotės</th><th>Suma*</th><th>Pasiūlymas</th></tr></thead><tbody>'+rows+'</tbody></table></div></article>';
  }
  function copyText(plan) {
    const out=['PIRKINIŲ PLANAS 14 DIENŲ: '+plan.firstWeek+' – '+plan.lastDay,
      'Mėsa / žuvis perkama 2 savaitėms, šviežios prekės – kas savaitę.',
      'Daugiausia 2 parduotuvės visam 14 d. planui. Kainas ir pristatymą patikrinti.',
      ''];
    for(const group of plan.groups) {
      out.push(group.name.toUpperCase());
      for(const p of group.lines){
        const packs=p.packs!==null?' · '+p.packs+' × '+p.packGrams+' g':' · pakuotė ir tiekėjas nepatvirtinti';
        const amount=p.group==='baltymai'?' (I sav. '+p.weekQuantities[0]+' g, II sav. '+p.weekQuantities[1]+' g)':'';
        out.push('☐ '+p.name+' — '+p.grams+' g'+amount+packs+
          (p.url?' · katalogas: '+p.url:' · konkretaus SKU nėra')+
          (p.cost===null?' · KAINA NEŽINOMA':' · sena katalogo kaina ~'+eur(p.cost)));
        if(p.sourcing?.farmlio?.url)out.push('    Farmlio: '+p.sourcing.farmlio.url+' (kaina / likutis nepatvirtinti)');
        const farmProducts=farmerProductLinks(p.sourcing);
        for(const offer of farmProducts){
          const channel=offer.kind==='farmer_product'?'Ūkio prekė'
            :offer.kind==='producer_product_reseller'?'Ūkio prekė per pardavėją':'Pardavėjo prekė';
          out.push('    '+channel+': '+offer.name+' – '+offer.url+' (kaina ir likutis nepatvirtinti)');
        }
        if(p.group==='baltymai' && p.sourcing && !farmProducts.some(x=>x.kind!=='retailer_product'))
          out.push('    Tiesioginės ūkininko prekės nuorodos nerasta.');
        if(p.needsReview&&p.sourcing?.barbora?.url){
          const option=p.sourcing.barbora;
          out.push('    BARBORA ATSARGINIS VARIANTAS: '+option.name+' – '+option.url
            +' (dar neįtrauktas į krepšelį'+(Number.isFinite(option.priceObservedEurPerKg)
              ?', matyta '+eur(option.priceObservedEurPerKg)+'/kg '+(option.priceSeenOn||''):'; kaina nežinoma')+')');
        }
      }
      out.push('');
    }
    out.push('Dalinė senų katalogo kainų prekių suma (be pristatymo): '+eur(plan.partialGoodsEstimateEur));
    out.push('Pilnas biudžetas ir visų tiekėjų kombinacija NEPATVIRTINTI. Tikslas iki 200 €, tolerancija 220 €.');
    out.push('Tai nėra pateiktas užsakymas.');
    return out.join('\n');
  }
  function render(plan) {
    active=plan;
    const container=document.getElementById('fortnight-output');
    if(!container)return;
    const ready=plan.orderReady;
    const notice=plan.tooManyStores
      ?'DĖMESIO: jau žinomos prekės priklauso '+plan.suppliers.length+' parduotuvėms. Reikia sumažinti iki 2 prieš užsakant.'
      :plan.incomplete
       ?'Dar nėra patvirtintas visų prekių tiekimas ir kainos. Žinomų prekių parduotuvės: '+plan.suppliers.join(', ')+'. Pridėjus ūkininkų pasiūlymus bendras skaičius negali viršyti 2.'
       :'Patikrink pristatymo mokestį ir galutinę atsiskaitymo kainą prieš užsakant.';
    const checkedCount=plan.items.filter(checked).length;
    container.innerHTML=
      '<div class="fortnight-overview">'
      +'<div class="fortnight-metric"><small>Planuojamas laikotarpis</small><strong>'+escapeHtml(plan.firstWeek)+' – '+escapeHtml(plan.lastDay)+'</strong><small>28 valgiai · 14 dienų</small></div>'
      +'<div class="fortnight-metric"><small>Žinomų prekių suma*</small><strong>'+eur(plan.partialGoodsEstimateEur)+'</strong><small>Be nepatvirtintų prekių ir pristatymo</small></div>'
      +'<div class="fortnight-metric"><small>Biudžetas 14 dienų</small><strong>200 € <small>(iki 220 €)</small></strong><small>'+ (ready?'Patikrinta':'Galutinė kaina nepatvirtinta')+'</small></div>'
      +'</div><div class="fortnight-notice" role="status"><b>Užsakymas dar neparuoštas.</b> '+escapeHtml(notice)+'</div>'
      +'<div class="fortnight-toolbar"><p id="fortnight-count">Pažymėta: '+checkedCount+'/'+plan.items.length+'</p><button type="button" id="fortnight-copy" class="btn">⧉ Kopijuoti 14 dienų pirkinių sąrašą</button></div>'
      +plan.groups.map(groupedHtml).join('')
      +'<div class="fortnight-summary"><b>Ko dar reikia:</b> '+(plan.missing.length?escapeHtml(plan.missing.map(x=>x.name).join(', ')):'Tiekėjų SKU sąrašas užpildytas, dar patikrink kainas ir pristatymą.')
      +'<br>Žinomi tiekėjai: '+escapeHtml(plan.suppliers.join(', ')||'nėra')+' (maks. 2 per 14 dienų). Ūkių, Farmlio ir Barbora atsarginės nuorodos nėra papildomi pasirinkti tiekėjai.'
      +'<br>* Suma – tik orientacinis senų katalogo kainų įvertis; vienos mėsos/žuvies pakuotės apvalinamos dviem savaitėms, šviežių prekių – atskirai kiekvienai savaitei. Pristatymas neįskaičiuotas.</div>';
    if(container.dataset.fortnightBound!=='yes'){
      container.addEventListener('change',event=>{
        if(!event.target.classList?.contains('fortnight-check')||!active)return;
        const target=active.items.find(x=>x.group===event.target.dataset.group&&x.id===event.target.dataset.id);
        if(!target)return;
        try{localStorage.setItem(checkedKey(target),event.target.checked?'1':'0');}catch{}
        event.target.closest('tr')?.classList.toggle('is-complete',event.target.checked);
        document.getElementById('fortnight-count').textContent='Pažymėta: '+active.items.filter(checked).length+'/'+active.items.length;
      });
      container.addEventListener('click',event=>{
        if(event.target.id!=='fortnight-copy'||!active)return;
        const output=copyText(active);
        if(navigator.clipboard && location.protocol==='https:'){
          navigator.clipboard.writeText(output).then(()=>alert('14 dienų sąrašas nukopijuotas!')).catch(()=>prompt('Nukopijuok sąrašą:',output));
        }else prompt('Nukopijuok sąrašą:',output);
      });
      container.dataset.fortnightBound='yes';
    }
  }
  root.TwoWeekShop={build,render,copyText,demand,farmerProductLinks};
})(window);
