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
  const servingCount = {};
  const daily = input.days.map(d => {
    if(!recipesById[d.lunch] || !recipesById[d.dinner]) throw Error('Dienoje nurodytas neegzistuojantis receptas.');
    const sum={kcal:0,protein:0,carbs:0,fat:0};
    for (const id of [d.lunch,d.dinner]) {
      servingCount[id]=(servingCount[id]||0)+1;
      for (const key of Object.keys(sum)) sum[key]+=macros[id][key];
    }
    if(sum.kcal > 2100) throw Error('Viršyta 2100 kcal dienos riba.');
    return sum;
  });
  return {input, recipesById, macros, daily, servingCount};
}
function render() {
  const {input,recipesById,macros,daily,servingCount}=state;
  const rlist = input.recipes.filter(r=>servingCount[r.id]);
  const days = input.days;
  const lim=input.meta.kcalLimit||2100;
  const mean = field => Math.round(daily.reduce((x,d)=>x+d[field],0)/7);
  const stat = document.getElementById('stats');
  document.getElementById('plan-note').textContent = `7 dienos · 1 asmeniui · savaitė nuo ${input.meta.weekStart} · ${input.meta.status||'Savaitės planas'}${Date.now() > Date.parse(input.meta.weekStart)+7*86400000 ? ' · Planas pasenęs: laukiamas naujas patikrintas meniu' : ''}`;
  document.getElementById('recipe-pill').textContent = `Tik ${rlist.length} receptai`;
  document.getElementById('hero-chips').innerHTML = `<span class="chip"><b>≤ ${num(lim)} kcal</b> per dieną</span><span class="chip"><b>2</b> valgiai per dieną</span><span class="chip"><b>${input.sessions.length}</b> gaminimo sesijos</span><span class="chip"><b>${num(mean('protein'))} g</b> baltymų / d.</span><span class="chip"><b>iki 2</b> parduotuvių</span>`;
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
  document.getElementById('cook-sessions').innerHTML=input.sessions.map(session=>`<article class="card cook"><h3>${safe(session.title)} <span class="pillgreen">${safe(session.subtitle)}</span></h3><p>${safe(session.summary)}</p><ol class="timeline">${session.steps.map(step=>`<li>${safe(step)}</li>`).join('')}</ol><p>${safe(session.duration||'')}</p></article>`).join('');
  document.getElementById('logistics').innerHTML=[
    ['01','Patikrink ūkininko prekę','Pirmiausia konkrečiam receptui ieškok tinkamo ūkininko SKU. Jei kaina, dalis ar pakuotė nepatikrinta, produktas nėra patvirtintas pirkimui.'],
    ['02','Palygink visą krepšelį','Farmlio ir Barbora yra alternatyvos, ne iš anksto pasirinktos parduotuvės. Palygink pakuotes, minimalų užsakymą ir pristatymo kainą.'],
    ['03','Rinkis daugiausia du tiekėjus','Pirkinių sąraše pateiktos konkrečių prekių nuorodos be atskiro tiekėjo rinkiklio. Galutiniame užsakyme naudok daugiausia 2 parduotuves; krepšelio sumą tvirtink tik patikrinęs visus SKU ir pristatymą.']
  ].map(([n,title,description])=>'<div class="card logistic"><span class="num">'+n+'</span><h3>'+title+'</h3><p>'+description+'</p></div>').join('');
}
let latestMenu, historyEntries=[], selectionRequest=0;
const weekLabel = (start,end) => `${start} – ${end}`;
function preferredWeek() {
  const dateParts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Vilnius',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const parts=Object.fromEntries(dateParts.map(p=>[p.type,p.value]));
  const today=`${parts.year}-${parts.month}-${parts.day}`;
  const sorted=[...historyEntries].sort((a,b)=>a.weekStart.localeCompare(b.weekStart));
  return sorted.find(e=>e.weekStart<=today&&e.weekEnd>=today)?.weekStart
    || sorted.find(e=>e.weekStart>today)?.weekStart
    || sorted.at(-1)?.weekStart || latestMenu?.meta?.weekStart;
}
async function loadJson(path) {
  const response=await fetch(path,{cache:'no-store'});
  if(!response.ok) throw Error(`Nepavyko įkelti ${path} (${response.status}).`);
  return response.json();
}
function renderHistory() {
  const dateParts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Vilnius',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const parts=Object.fromEntries(dateParts.map(p=>[p.type,p.value]));
  const today=`${parts.year}-${parts.month}-${parts.day}`;
  const preferred=preferredWeek();
  document.getElementById('history-list').innerHTML=[...historyEntries]
    .sort((a,b)=>a.weekStart.localeCompare(b.weekStart)).map(entry=>{
      const current=entry.weekStart===state.input.meta.weekStart;
      const isCurrent=entry.weekStart<=today&&entry.weekEnd>=today;
      const label=entry.weekStart===preferred?'Artimiausias meniu':isCurrent?'Ši savaitė':entry.weekStart>today?'Būsima savaitė':'Praėjusi savaitė';
      const badge=entry.isPlanningSeries?'<span class="pillgreen">Tiekėjai tikrinami</span>':entry.isExample?'<span class="pillgreen">Pavyzdinis</span>':'';
      return `<a class="history-card" href="${entry.weekStart===preferred?'./':'?week='+encodeURIComponent(entry.weekStart)}" data-week="${safe(entry.weekStart)}"${current?' aria-current="page"':''}>${entry.photo?`<img src="${safe(safeUrl(entry.photo))}" alt="" loading="lazy" onerror="this.hidden=true">`:''}<div class="history-card-body"><span class="pillgreen">${safe(label)}</span>${badge}<strong>${safe(weekLabel(entry.weekStart,entry.weekEnd))}</strong><small>${safe(entry.recipes.length)} patiekalai · 7 dienos</small><small>${safe(entry.recipes.join(' · '))}</small></div></a>`;
    }).join('');
}
async function renderWeeklyShopping(menu,request) {
  const output=document.getElementById('weekly-output');
  if(!output || !window.WeeklyShop)return;
  output.setAttribute('aria-busy','true');
  output.innerHTML='<div class="card fortnight-loading">Skaičiuojamas pasirinktos savaitės užsakymas…</div>';
  try {
    const [sources,rules,catalog]=await Promise.all([
      loadJson('./data/sourcing-links.json').catch(()=>({products:{}})),
      loadJson('./config/planavimo-taisykles.json'),
      loadJson('./data/catalog.json').catch(()=>({products:[],stores:[]}))
    ]);
    if(request!==selectionRequest)return;
    const plan=window.WeeklyShop.build(menu,sources,rules,catalog);
    window.WeeklyShop.render(plan);
  }catch(error){
    if(request===selectionRequest)output.innerHTML='<div class="card fortnight-empty">Vienos savaitės pirkinių sąrašo nepavyko atidaryti: '+safe(error.message)+'.</div>';
  }finally {
    if(request===selectionRequest)output.setAttribute('aria-busy','false');
  }
}
async function selectWeek(week,updateUrl=true) {
  const request=++selectionRequest;
  const message=document.getElementById('history-message');
  message.textContent='';
  try {
    const selected=week||preferredWeek();
    const fromBase=selected===latestMenu.meta.weekStart;
    if(!fromBase&&!historyEntries.some(entry=>entry.weekStart===selected)) throw Error('Šios savaitės meniu istorijoje nėra.');
    message.textContent=fromBase?'':'Kraunamas pasirinktos savaitės meniu…';
    const menu=fromBase?latestMenu:await loadJson('./data/history/'+selected+'.json');
    if(request!==selectionRequest)return;
    state=makeData(menu);
    render();renderHistory();
    renderWeeklyShopping(menu,request);
    const preferred=selected===preferredWeek();
    document.getElementById('selected-week').innerHTML =
       `${preferred?'Artimiausia / einamoji savaitė':'Pasirinkta savaitė'} · ${safe(weekLabel(menu.meta.weekStart,menu.days.at(-1).date))}
       ${preferred?'':'<a href="./" data-latest>Grįžti į artimiausią savaitę →</a>'}
       <div class="sub">${menu.meta.isPlanningSeries?'Savaitės meniu juodraštis. Ūkininkų produktų kainos ir pilnas pirkinių krepšelis dar nepatvirtinti.':menu.meta.isExample?'Pavyzdinis meniu.':'Rodomi to meto kainų įverčiai; patikrink juos prieš pirkdamas.'}</div>`;
    message.textContent='';
    if(updateUrl) {
      const url=new URL(location.href);url.searchParams.delete('week');
      if(!preferred)url.searchParams.set('week',menu.meta.weekStart);
      url.hash='';window.history.pushState({},'',url);
    }
  } catch(error){if(request===selectionRequest)message.textContent=error.message+' Rodomas ankstesnis pasirinkimas.';}
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
