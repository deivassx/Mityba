import fs from 'node:fs/promises';
import {archiveMenu} from './history.mjs';
import {validate} from './planner.mjs';

const latest=JSON.parse(await fs.readFile('data/menu.json','utf8'));
const combinations=[
  [['kalakutiena','samas'],['vistiena','jautiena']],
  [['vistiena','samas'],['vistiena','samas']],
  [['kalakutiena','jautiena'],['kalakutiena','jautiena']],
  [['vistiena','jautiena'],['kalakutiena','samas']],
  [['kalakutiena','samas'],['kalakutiena','samas']],
  [['vistiena','jautiena'],['vistiena','jautiena']],
  [['kalakutiena','samas'],['vistiena','samas']],
  [['vistiena','samas'],['kalakutiena','jautiena']]
];
const scales=[1,0.95,1.03,0.98,1.04,0.96,1.02,0.94];
for(let i=0;i<8;i++) {
  const menu=structuredClone(latest), start=new Date(latest.meta.weekStart+'T00:00:00Z');
  start.setUTCDate(start.getUTCDate()-7*(i+1));
  const week=start.toISOString().slice(0,10), pairs=combinations[i];
  try {
    const existing=JSON.parse(await fs.readFile('data/history/'+week+'.json','utf8'));
    if(!existing.meta.isExample) throw Error('Negalima pakeisti tikro meniu pavyzdžiu: '+week);
  } catch(error) { if(error.code!=='ENOENT') throw error; }
  menu.meta={...menu.meta,weekStart:week,generatedAt:new Date().toISOString(),isExample:true,status:'Pavyzdinis praeities meniu',pricingNotice:'Pavyzdinis meniu, sukurtas retrospektyviai. Kainos paimtos iš '+latest.meta.generatedAt.slice(0,10)+' patikrinto plano; tai nėra šios praeities savaitės kainos.'};
  menu.days=Array.from({length:7},(_,day)=>({date:new Date(+start+day*86400000).toISOString().slice(0,10),lunch:pairs[day<3?0:1][0],dinner:pairs[day<3?0:1][1]}));
  const used=new Set(pairs.flat());
  menu.recipes=menu.recipes.filter(r=>used.has(r.id));
  for(const recipe of menu.recipes) {
    recipe.ingredients=Object.fromEntries(Object.entries(recipe.ingredients).map(([key,grams])=>[key,Math.round(grams*scales[i])]));
    recipe.slot=pairs.some(pair=>pair[0]===recipe.id)?'PIETŪS':'VAKARIENĖ';
  }
  const ingredients=new Set(menu.recipes.flatMap(r=>Object.keys(r.ingredients)));
  menu.products=menu.products.filter(p=>ingredients.has(p.id));
  menu.stores=menu.stores.filter(s=>menu.products.some(p=>p.store===s.id));
  menu.sessions=menu.sessions.map((session,index)=>({...session,summary:pairs[index].map(id=>menu.recipes.find(r=>r.id===id).title).join(' + '),servings:Object.fromEntries(pairs[index].map(id=>[id,index?4:3]))}));
  validate(menu,false);
  await archiveMenu(menu);
  console.log('Išsaugotas pavyzdys: '+week);
}
