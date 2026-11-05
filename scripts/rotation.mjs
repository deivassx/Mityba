// Platesnis nemokamas 32 receptų ciklas (8 kiekvienai baltymų grupei).
const GROUPS = ["kalakutiena","vistiena","samas","jautiena"];
const ANCHOR=Date.parse('2026-11-09T00:00:00Z');
const WEEK=7*86400000;
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
export function selectWeeklyRecipes(baseRecipes,bank,weekStart){
  assert(/^\d{4}-\d{2}-\d{2}$/.test(weekStart),'Neteisinga savaitės data');
  const n=(Date.parse(weekStart+'T00:00:00Z')-ANCHOR)/WEEK;
  assert(Number.isInteger(n),'Savaitė turi prasidėti pirmadienį');
  const originals=new Map(baseRecipes.map(x=>[x.id,x]));
  const picked={};
  for(let i=0;i<GROUPS.length;i++){
    const g=GROUPS[i],variants=bank.variants?.[g],baseline=originals.get(g);
    assert(baseline&&Array.isArray(variants)&&variants.length===7,'Trūksta 8 receptų grupėje: '+g);
    const ix=((n+(i===0?0:Math.floor(n/8**i)))%8+8)%8;
    picked[g]=[baseline,...variants][ix];
  }
  const recipes=GROUPS.map(g=>picked[g]);
  assert(new Set(recipes.map(r=>r.id)).size===4,'Pasikartojantys receptų ID');
  const first=n%2===0?['kalakutiena','samas']:['vistiena','jautiena'];
  const second=n%2===0?['vistiena','jautiena']:['kalakutiena','samas'];
  return {recipes,pairs:[[picked[first[0]].id,picked[first[1]].id],[picked[second[0]].id,picked[second[1]].id]],weekIndex:n};
}
