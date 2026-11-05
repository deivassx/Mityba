/* Sotus planas: kiekvienos savaitės turinys skaitomas iš data/menu.json.
   GitHub Pages atnaujina svetainę po commit į main. Nėra jokių mokamų API. */
const euro = n => n == null ? '—' : new Intl.NumberFormat('lt-LT', {style:'currency',currency:'EUR'}).format(n);
const num = n => new Intl.NumberFormat('lt-LT').format(n);
const safe = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => { try {const url = new URL(u, location.href); return ['https:','http:'].includes(url.protocol) ? url.href : '#';} catch {return '#';} };
const DAYS = ['Pirmadienis','Antradienis','Trečiadienis','Ketvirtadienis','Penktadienis','Šeštadienis','Sekmadienis'];
const round2 = x => Math.round((x + Number.EPSILON)*100)/100;
let state = null;

function makeData(input) {
  if (!input || !Array.isArray(input.days) || input.days.length !== 7) throw Error('Meniu faile privalo būti 7 dienos.');
  if(input.meta.status === 'Automatiškai patikrinta savaitė' && input.products.some(p => !(p.priceEur > 0) || p.verification?.url !== p.url)) throw Error('Trūksta kainos patikros duomenų.');
  const recipesById = Object.fromEntries(input.recipes.map(r => [r.id, r]));
  const productsById = Object.fromEntries(input.products.map(p => [p.id, p]));
  const macros = {};
  for (const r of input.recipes) {
    const values = {kcal:0, protein:0, carbs:0, fat:0};
    for (const [id,grams] of Object.entries(r.ingredients)) {
      const nutrition = input.nutrients[id];
      if (!nutrition) throw Error(`Trūksta produkto maistingumo: ${id}`);
      for (const key of Object.keys(values)) values[key] += grams / 100 * nutrition[key];
    }
    macros[r.id] = Object.fromEntries(Object.entries(values).map(([k,v])=>[k,Math.round(v)]));
  }
  const needed = {};
  const servingCount = {};
  const daily = input.days.map(d => {
    if(!recipesById[d.lunch] || !recipesById[d.dinner]) throw Error('Dienoje nurodytas neegzistuojantis receptas.');
    const sum={kcal:0,protein:0,carbs:0,fat:0};
    for (const id of [d.lunch,d.dinner]) {
      servingCount[id]=(servingCount[id]||0)+1;
      for (const [item,qty] of Object.entries(recipesById[id].ingredients)) needed[item]=(needed[item]||0)+qty;
      for (const key of Object.keys(sum)) sum[key]+=macros[id][key];
    }
    if(sum.kcal > 2100) throw Error('Viršyta 2100 kcal dienos riba.');
    return sum;
  });
  const items = input.products.filter(p => needed[p.id]).map(p => {
    if(!(p.packGrams>0)) throw Error('Trūksta produkto pakuotės dydžio: '+p.id);
    const packs=Math.ceil(needed[p.id] / p.packGrams);
    return {...p, need:needed[p.id], packs, cost:p.priceEur == null ? null:round2(p.priceEur * packs)};
  });
  const missingProducts = Object.keys(needed).filter(k => !productsById[k]);
  return {input, recipesById, macros, daily, items, servingCount, missingProducts};
}
function checkedKey(id) { return 'mityba-'+state.input.meta.weekStart+'-'+id; }
function isChecked(id) { try{return localStorage.getItem(checkedKey(id))==='1';}catch{return false;} }
function toggleItem(id, checked) {
  try{localStorage.setItem(checkedKey(id),checked?'1':'0');}catch{}
  document.getElementById('row-'+id)?.classList.toggle('checked',checked);
  updateCount();
}
function updateCount() {
  const el=document.getElementById('checkcount'); if(el)el.textContent = `Pažymėta: ${state.items.filter(i=>isChecked(i.id)).length}/${state.items.length}`;
}
function clearChecks() { for(const p of state.items)try{localStorage.removeItem(checkedKey(p.id));}catch{}; document.querySelectorAll('.shopping input').forEach(x=>x.checked=false); document.querySelectorAll('.shopping tr.checked').forEach(x=>x.classList.remove('checked')); updateCount(); }
function copyList() {
  const {input,items}=state;
  let lines=[`PIRKINIŲ SĄRAŠAS · ${input.meta.weekStart} (7 dienos)`];
  for(const st of input.stores){
    lines.push(`\n${st.name.toUpperCase()}`);
    for(const p of items.filter(x=>x.store===st.id)) lines.push(`${p.packs} × ${p.name} (reikia ${num(p.need)} g) — ${p.url||'nuorodos nėra'}`);
  }
  if(state.missingProducts.length)lines.push('\nBE PARDUOTUVĖS: '+state.missingProducts.join(', '));
  const out=lines.join('\n');
  if(navigator.clipboard && location.protocol==='https:') navigator.clipboard.writeText(out).then(()=>alert('Pirkinių sąrašas nukopijuotas!')).catch(()=>prompt('Nukopijuok sąrašą:',out));
  else prompt('Nukopijuok sąrašą:',out);
}
// Keletas mygtukų yra HTML onclick atributuose.
window.clearChecks=clearChecks;
window.copyList=copyList;
window.toggleItem=toggleItem;

function getShipping(store, merchandise) {
  const delivery = store.freeDeliveryFromEur!=null && merchandise >= store.freeDeliveryFromEur ? 0 : (store.deliveryFeeEur||0);
  let packing = store.packingFeeEur||0;
  if (store.packingTiers) for(const tier of store.packingTiers) if(merchandise>=tier.from)packing=tier.fee;
  const small = store.smallBasketFeeBelowEur!=null && merchandise<store.smallBasketFeeBelowEur ? (store.smallBasketFeeEur||0):0;
  return {delivery,packing,small};
}
function render() {
  const {input,recipesById,macros,daily,items,servingCount,missingProducts}=state;
  const rlist = input.recipes.filter(r=>servingCount[r.id]);
  const days = input.days;
  const lim=input.meta.kcalLimit||2100;
  const mean = field => Math.round(daily.reduce((x,d)=>x+d[field],0)/7);
  const stat = document.getElementById('stats');
  document.getElementById('plan-note').textContent = `7 dienos · 1 asmeniui · savaitė nuo ${input.meta.weekStart} · ${input.meta.status||'Savaitės planas'}${Date.now() > Date.parse(input.meta.weekStart)+7*86400000 ? ' · Planas pasenęs: laukiamas naujas patikrintas meniu' : ''}`;
  document.getElementById('recipe-pill').textContent = `Tik ${rlist.length} receptai`;
  document.getElementById('hero-chips').innerHTML = `<span class="chip"><b>≤ ${num(lim)} kcal</b> per dieną</span><span class="chip"><b>2</b> valgiai per dieną</span><span class="chip"><b>${input.sessions.length}</b> gaminimo sesijos</span><span class="chip"><b>${num(mean('protein'))} g</b> baltymų / d.</span><span class="chip"><b>${input.stores.length}</b> parduotuvės</span>`;
  const stats = [
    ['Vid. dienos energija',num(mean('kcal'))+' kcal','tikslas: iki '+num(lim)],
    ['Vid. dienos baltymai',num(mean('protein'))+' g','apytikslis kiekis'],
    ['Vid. angliavandeniai',num(mean('carbs'))+' g','daugiau – pietums'],
    ['Pagamintų porcijų',num(days.length*2),'7 pietūs + 7 vakarienės']
  ];
  stat.innerHTML=stats.map(x=>`<div class="stat"><div class="label">${safe(x[0])}</div><strong>${safe(x[1])}</strong><small>${safe(x[2])}</small></div>`).join('');
  const link=(r, icon)=>`<a class="meallink" href="#${safe(r.id)}"><span class="circle">${icon}</span><span><span class="name">${safe(r.title)}</span><small>${num(macros[r.id].kcal)} kcal · ${num(macros[r.id].protein)} g baltymų</small></span></a>`;
  document.getElementById('days').innerHTML=days.map((d,i)=>{
    const a=recipesById[d.lunch],b=recipesById[d.dinner],m=daily[i];
    return `<div class="dayline"><div class="dayhead"><strong>${DAYS[i]}</strong><small>${safe(d.date)}</small></div>${link(a,'☀️')}${link(b,'🌙')}<div class="macro"${m.kcal>lim?' style="color:#bc5854"':''}>${num(m.kcal)} kcal<small>${num(m.protein)} g baltymų · ${num(m.carbs)} g angl.${m.kcal>lim?' · VIRŠYTA RIBA':''}</small></div></div>`;
  }).join('');
  document.getElementById('recipes').innerHTML=rlist.map(r=>{
    const m=macros[r.id];
    return `<article class="card recipe" id="${safe(r.id)}"><div class="recipephoto"><img loading="lazy" src="${safe(safeUrl(r.photo))}" alt="Iliustracinė ${safe(r.title.toLowerCase())} nuotrauka" onerror="this.style.display='none'"><span class="photoBadge">${safe(r.slot)}</span></div><div class="recipebody"><h3 class="recipetitle">${safe(r.title)}</h3><p class="recipesub">${safe(r.subtitle)}</p><div class="badges"><span class="badge">${servingCount[r.id]} porcijos per savaitę</span><span class="badge">~${r.mins} min.</span><span class="badge alt">${safe(r.tag||'')}</span></div><div class="nutrition">${[['Kalorijos',m.kcal],['Baltymai',m.protein+' g'],['Angliav.',m.carbs+' g'],['Riebalai',m.fat+' g']].map(x=>`<div><b>${safe(x[1])}</b><small>${safe(x[0])}</small></div>`).join('')}</div><h4>Produktai vienai porcijai</h4><ul class="ingredients">${Object.entries(r.ingredients).map(([id,grams])=>`<li><span>${safe(input.ingredientLabels[id]||id)}</span><span>${num(grams)} g</span></li>`).join('')}</ul><h4>Kaip pagaminti</h4><ol class="steps">${r.steps.map(step=>`<li>${safe(step)}</li>`).join('')}</ol><div class="photo-credit">Patiekimo nuotrauka: <a href="${safe(safeUrl(r.image_link||r.photo))}" target="_blank" rel="noopener noreferrer">${safe(r.credit||'Iliustracinė nuotrauka')}</a>. Tai ne šio recepto iškepto maisto nuotrauka.</div></div></article>`;
  }).join('');
  const storeResults = [];
  document.getElementById('shops').innerHTML=input.stores.map(st=>{
    const these=items.filter(x=>x.store===st.id);
    const subtotal=round2(these.reduce((x,p)=>x+(p.cost||0),0));
    const missing=these.some(x=>x.cost==null);
    const shipping=getShipping(st,subtotal);
    storeResults.push({store:st, subtotal, missing, shipping});
    const rows=these.map(p=>{
      const checked=isChecked(p.id);
      return `<tr id="row-${safe(p.id)}" class="${checked?'checked':''}"><td><input type="checkbox" aria-label="Turiu: ${safe(p.name)}" ${checked?'checked':''} onchange="toggleItem('${safe(p.id)}', this.checked)"></td><td><div class="name">${safe(p.name)}</div><div class="need">Reikia ${num(p.need)} g · ${p.packs} × ${num(p.packGrams)} g pakuotė</div></td><td><b>${p.packs} vnt.</b></td><td>${p.cost===null?'<span title="Kaina nepatikrinta">?</span>':euro(p.cost)}</td><td>${p.url?`<a href="${safe(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer">Prekė ↗</a>`:'Nuorodos nėra'}</td></tr>`;
    }).join('');
    const extra=shipping.small?`<div class="line"><span>Mažo krepšelio mokestis</span><strong>${euro(shipping.small)}</strong></div>`:'';
    return `<div class="card shopcard"><div class="shophead"><div><h3>${safe(st.emoji||'🛒')} ${safe(st.name)}</h3><p>${safe(st.description||'')}</p></div><div class="subtotal">${euro(subtotal)}${missing?'+':''}<br><small style="font-weight:450;font-size:10px;color:#8b938b">prekės*</small></div></div><div class="table-wrap"><table class="shopping"><thead><tr><th style="width:20px"></th><th>Produktas / poreikis</th><th>Kiekis</th><th>Suma</th><th>Nuoroda</th></tr></thead><tbody>${rows}</tbody></table></div><div class="cost-bar"><div class="line"><span>Prekės (žinomos kainos)</span><strong>${euro(subtotal)}</strong></div><div class="line"><span>Pristatymas į namus*</span><strong>${euro(shipping.delivery)}</strong></div><div class="line"><span>Pakavimas*</span><strong>${euro(shipping.packing)}</strong></div>${extra}<div class="line total"><span>Tarpinė suma*</span><span>${euro(round2(subtotal+shipping.delivery+shipping.packing+shipping.small))}${missing?'+':''}</span></div></div></div>`;
  }).join('');
  const goods=round2(storeResults.reduce((s,t)=>s+t.subtotal,0));
  const fees=round2(storeResults.reduce((s,t)=>s+t.shipping.delivery+t.shipping.packing+t.shipping.small,0));
  const unknown=items.some(p=>p.cost==null) || missingProducts.length>0;
  document.getElementById('budget').innerHTML=`<div class="totalbox"><small>Perkamos prekės* </small><strong>${euro(goods)}${unknown?'+':''}</strong><p>Pakuočių kiekiai gali likti kitoms savaitėms.</p></div><div class="totalbox"><small>Pristatymas ir pakavimas*</small><strong>${euro(fees)}</strong><p>Jei tiekėjų prekės atkeliauja kartu.</p></div><div class="totalbox"><small>Viso (orientacinė suma)*</small><strong>${euro(round2(goods+fees))}${unknown?'+':''}</strong><p>${unknown?'Ne visų produktų kaina įtraukta.':'Pristatymo ir prekių kainas patikrink prieš pirkdamas.'}</p></div>`;
  if(missingProducts.length)document.getElementById('price-note').textContent=`${input.meta.pricingNotice||''} Trūksta prekių: ${missingProducts.join(', ')}.`;
  else document.getElementById('price-note').textContent=input.meta.pricingNotice||'Prieš užsakydamas patikrink kainas ir siuntimą.';
  document.getElementById('cook-sessions').innerHTML=input.sessions.map(session=>`<article class="card cook"><h3>${safe(session.title)} <span class="pillgreen">${safe(session.subtitle)}</span></h3><p>${safe(session.summary)}</p><ol class="timeline">${session.steps.map(step=>`<li>${safe(step)}</li>`).join('')}</ol><p>${safe(session.duration||'')}</p></article>`).join('');
  document.getElementById('logistics').innerHTML=input.stores.map((st,i)=>`<div class="card logistic"><span class="num">${String(i+1).padStart(2,'0')}</span><h3>${safe(st.name)}</h3><p>${safe(st.notes||'Pristatymo sąlygas patikrink parduotuvėje.')}</p></div>`).concat([`<div class="card logistic"><span class="num">${String(input.stores.length+1).padStart(2,'0')}</span><h3>Kada užsakinėti?</h3><p>Trečiadienio vakarą paruošk sąrašą, ketvirtadienį užsakyk. Patvirtink pristatymą iki gaminimo dienos.</p></div>`]).join('');
  let counter=document.getElementById('checkcount');
  if(!counter){counter=document.createElement('span');counter.id='checkcount';counter.className='checknote noprint';document.querySelector('#pirkiniai .controls').appendChild(counter);}
  updateCount();
}
let latestMenu, historyEntries=[], selectionRequest=0;
const weekLabel = (start,end) => `${start} – ${end}`;
async function loadJson(path) {
  const response=await fetch(path,{cache:'no-store'});
  if(!response.ok) throw Error(`Nepavyko įkelti ${path} (${response.status}).`);
  return response.json();
}
function renderHistory() {
  document.getElementById('history-list').innerHTML=historyEntries.map(entry=>{
    const latest=entry.weekStart===latestMenu.meta.weekStart;
    const current=entry.weekStart===state.input.meta.weekStart;
    return `<a class="history-card" href="${latest?'./':'?week='+encodeURIComponent(entry.weekStart)}" data-week="${safe(entry.weekStart)}"${current?' aria-current="page"':''}>${entry.photo?`<img src="${safe(safeUrl(entry.photo))}" alt="" loading="lazy" onerror="this.hidden=true">`:''}<div class="history-card-body">${latest?'<span class="pillgreen">Naujausias meniu</span>':''}<strong>${safe(weekLabel(entry.weekStart,entry.weekEnd))}</strong><small>${safe(entry.recipes.length)} patiekalai · 7 dienos</small><small>${safe(entry.recipes.join(' · '))}</small></div></a>`;
  }).join('');
}
async function selectWeek(week, updateUrl=true) {
  const request=++selectionRequest;
  const message=document.getElementById('history-message');
  message.textContent='';
  try {
    const latest=!week || week===latestMenu.meta.weekStart;
    if(!latest && !historyEntries.some(entry=>entry.weekStart===week)) throw Error('Šios savaitės meniu istorijoje nėra.');
    message.textContent=latest?'':'Kraunamas pasirinktos savaitės meniu…';
    const menu=latest ? latestMenu : await loadJson('./data/history/'+week+'.json');
    if(request!==selectionRequest) return;
    const next=makeData(menu);
    state=next; render(); renderHistory();
    document.getElementById('selected-week').innerHTML=latest
      ? `Naujausias meniu · ${safe(weekLabel(menu.meta.weekStart,menu.days.at(-1).date))}`
      : `Ankstesnės savaitės meniu · ${safe(weekLabel(menu.meta.weekStart,menu.days.at(-1).date))}<a href="./" data-latest>Grįžti į naujausią →</a><div class="sub">Rodomos to meto kainos ir produktai.</div>`;
    message.textContent='';
    if(updateUrl) {
      const url=new URL(location.href); url.searchParams.delete('week');
      if(!latest) url.searchParams.set('week',week);
      url.hash=''; window.history.pushState({},'',url);
    }
  } catch(error) { if(request===selectionRequest) message.textContent=error.message+' Rodomas ankstesnis pasirinkimas.'; }
}
document.getElementById('history-list').addEventListener('click',event=>{
  const card=event.target.closest('a[data-week]');
  if(!card || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button!==0) return;
  event.preventDefault(); selectWeek(card.dataset.week);
});
document.getElementById('selected-week').addEventListener('click',event=>{
  if(!event.target.closest('[data-latest]')) return;
  event.preventDefault(); selectWeek();
});
window.addEventListener('popstate',()=>selectWeek(new URL(location.href).searchParams.get('week'),false));
loadJson('./data/menu.json')
 .then(async data=>{
   latestMenu=data; state=makeData(data); render();
   try { historyEntries=await loadJson('./data/history/index.json'); }
   catch(error) { document.getElementById('history-message').textContent='Nepavyko įkelti meniu istorijos. Bandyk dar kartą vėliau.'; }
   if(!historyEntries.length) historyEntries=[{weekStart:data.meta.weekStart,weekEnd:data.days.at(-1).date,recipes:data.recipes.map(r=>r.title),photo:data.recipes[0]?.photo}];
   renderHistory(); await selectWeek(new URL(location.href).searchParams.get('week'),false);
 })
 .catch(error=>{
   const target=document.getElementById('days');
   if(target)target.innerHTML=`<div style="padding:24px"><strong>Nepavyko atidaryti meniu.</strong><p>${safe(error.message)}</p><p>Šią versiją atidaryk per GitHub Pages (arba vietinį HTTP serverį), ne tiesiogiai per <code>file://</code>.</p></div>`;
   console.error(error);
 });
